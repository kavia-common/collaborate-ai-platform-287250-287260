const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { GraphQLError } = require('graphql');
const { withFilter } = require('graphql-subscriptions');
const pubsub = require('./pubsub');
const aiService = require('../services/ai');

// Models
const { User, Company, Project, Event, Message } = require('../models');

// Constants
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

// Helper to check auth
const checkAuth = (context) => {
  if (!context.user) {
    throw new GraphQLError('User is not authenticated', {
      extensions: {
        code: 'UNAUTHENTICATED',
        http: { status: 401 },
      },
    });
  }
  return context.user;
};

// Field Resolvers Helpers
// Checks if the field is populated (is an object with an ID), otherwise fetches it.
const resolveReference = async (model, id, populatedObject) => {
    if (populatedObject && (populatedObject.id || populatedObject._id)) {
        return populatedObject;
    }
    if (!id) return null;
    return await model.findById(id);
};

const resolvers = {
  Date: {
    __parseValue(value) {
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        throw new GraphQLError('Invalid Date format');
      }
      return date;
    },
    __serialize(value) {
      return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
    },
    __parseLiteral(ast) {
      if (ast.kind === 'StringValue') {
        return new Date(ast.value);
      }
      return null;
    },
  },

  // Field Resolvers to handle unpopulated fields dynamically
  User: {
    company: async (parent) => resolveReference(Company, parent.companyId, parent.company)
  },
  Project: {
    owner: async (parent) => resolveReference(User, parent.ownerId, parent.owner),
    company: async (parent) => resolveReference(Company, parent.companyId, parent.company),
    members: async (parent) => {
        if (parent.members && parent.members.length > 0 && (parent.members[0].id || parent.members[0]._id)) {
            return parent.members;
        }
        if (!parent.members || parent.members.length === 0) return [];
        return await User.find({ _id: { $in: parent.members } });
    }
  },
  Event: {
    organizer: async (parent) => resolveReference(User, parent.organizerId, parent.organizer),
    project: async (parent) => resolveReference(Project, parent.projectId, parent.project),
    company: async (parent) => resolveReference(Company, parent.companyId, parent.company),
    attendees: async (parent) => {
        if (parent.attendees && parent.attendees.length > 0 && (parent.attendees[0].id || parent.attendees[0]._id)) {
            return parent.attendees;
        }
        if (!parent.attendees || parent.attendees.length === 0) return [];
        return await User.find({ _id: { $in: parent.attendees } });
    }
  },
  Message: {
    sender: async (parent) => resolveReference(User, parent.senderId, parent.sender),
    project: async (parent) => resolveReference(Project, parent.projectId, parent.project),
    event: async (parent) => resolveReference(Event, parent.eventId, parent.event),
    company: async (parent) => resolveReference(Company, parent.companyId, parent.company)
  },

  Query: {
    me: async (_, __, context) => {
      const user = checkAuth(context);
      return await User.findById(user.id);
    },
    getProjects: async (_, { status }, context) => {
      const user = checkAuth(context);
      const filter = { companyId: user.companyId };
      if (status) filter.status = status;
      // Using sort to show newest first
      return await Project.find(filter).sort({ createdAt: -1 });
    },
    getProject: async (_, { id }, context) => {
      const user = checkAuth(context);
      const project = await Project.findOne({ _id: id, companyId: user.companyId });
      if (!project) throw new GraphQLError('Project not found');
      return project;
    },
    getEvents: async (_, { projectId, startAfter, startBefore }, context) => {
      const user = checkAuth(context);
      const filter = { companyId: user.companyId };
      
      if (projectId) filter.projectId = projectId;
      if (startAfter || startBefore) {
        filter.startTime = {};
        if (startAfter) filter.startTime.$gte = new Date(startAfter);
        if (startBefore) filter.startTime.$lte = new Date(startBefore);
      }

      return await Event.find(filter).sort({ startTime: 1 });
    },
    getEvent: async (_, { id }, context) => {
      const user = checkAuth(context);
      const event = await Event.findOne({ _id: id, companyId: user.companyId });
      if (!event) throw new GraphQLError('Event not found');
      return event;
    },
    getMessages: async (_, { projectId, eventId, limit = 50, offset = 0 }, context) => {
      const user = checkAuth(context);
      const filter = { companyId: user.companyId };
      
      // If neither is provided, it fetches company-wide messages (could be restricted if needed)
      if (projectId) filter.projectId = projectId;
      if (eventId) filter.eventId = eventId;
      
      return await Message.find(filter)
        .sort({ createdAt: 1 }) 
        .skip(offset)
        .limit(limit);
    },
    getCompanyUsers: async (_, __, context) => {
      const user = checkAuth(context);
      return await User.find({ companyId: user.companyId });
    }
  },

  Mutation: {
    register: async (_, { input }) => {
      const { username, email, password, companyName } = input;

      const existingUser = await User.findOne({ email });
      if (existingUser) {
        throw new GraphQLError('User already exists with this email', {
            extensions: { code: 'BAD_USER_INPUT' }
        });
      }

      // Create Company
      const newCompany = await Company.create({
        name: companyName,
        settings: { theme: 'default' }
      });

      const hashedPassword = await bcrypt.hash(password, 10);

      // Create User
      const newUser = await User.create({
        username,
        email,
        password: hashedPassword,
        companyId: newCompany._id,
        role: 'admin'
      });

      const token = jwt.sign(
        { id: newUser._id, companyId: newUser.companyId, role: newUser.role, email: newUser.email },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      // Manually populate company for return
      newUser.company = newCompany;

      return {
        token,
        user: newUser
      };
    },

    login: async (_, { input }) => {
      const { email, password } = input;

      const user = await User.findOne({ email });
      if (!user) {
        throw new GraphQLError('Invalid credentials', {
            extensions: { code: 'UNAUTHENTICATED' }
        });
      }

      const match = await bcrypt.compare(password, user.password);
      if (!match) {
        throw new GraphQLError('Invalid credentials', {
            extensions: { code: 'UNAUTHENTICATED' }
        });
      }

      const token = jwt.sign(
        { id: user._id, companyId: user.companyId, role: user.role, email: user.email },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      return {
        token,
        user
      };
    },

    createProject: async (_, { input }, context) => {
      const user = checkAuth(context);
      const { title, description, status, startDate, endDate, memberIds } = input;

      const project = await Project.create({
        title,
        description,
        status: status || 'PLANNED',
        startDate,
        endDate,
        ownerId: user.id,
        companyId: user.companyId,
        members: memberIds || []
      });

      return project;
    },

    updateProject: async (_, { input }, context) => {
      const user = checkAuth(context);
      const { id, memberIds, ...fieldUpdates } = input;

      const project = await Project.findOne({ _id: id, companyId: user.companyId });
      if (!project) throw new GraphQLError('Project not found');

      if (Object.keys(fieldUpdates).length > 0) {
        Object.assign(project, fieldUpdates);
      }
      if (memberIds) {
        project.members = memberIds;
      }

      await project.save();
      return project;
    },

    deleteProject: async (_, { id }, context) => {
      const user = checkAuth(context);
      const result = await Project.deleteOne({ _id: id, companyId: user.companyId });
      return result.deletedCount > 0;
    },

    createEvent: async (_, { input }, context) => {
      const user = checkAuth(context);
      const { title, description, startTime, endTime, location, isVirtual, projectId, attendeeIds } = input;

      const event = await Event.create({
        title,
        description,
        startTime,
        endTime,
        location,
        isVirtual,
        organizerId: user.id,
        companyId: user.companyId,
        projectId,
        attendees: attendeeIds || []
      });

      const populatedEvent = await event.populate(['organizer', 'attendees', 'project', 'company']);
      
      pubsub.publish('EVENT_UPDATED', { eventUpdated: populatedEvent });

      return populatedEvent;
    },

    updateEvent: async (_, { input }, context) => {
      const user = checkAuth(context);
      const { id, attendeeIds, ...fieldUpdates } = input;

      const event = await Event.findOne({ _id: id, companyId: user.companyId });
      if (!event) throw new GraphQLError('Event not found');

      if (Object.keys(fieldUpdates).length > 0) {
        Object.assign(event, fieldUpdates);
      }
      if (attendeeIds) {
        event.attendees = attendeeIds;
      }

      await event.save();
      
      const populatedEvent = await event.populate(['organizer', 'attendees', 'project', 'company']);
      
      pubsub.publish('EVENT_UPDATED', { eventUpdated: populatedEvent });

      return populatedEvent;
    },

    deleteEvent: async (_, { id }, context) => {
      const user = checkAuth(context);
      const result = await Event.deleteOne({ _id: id, companyId: user.companyId });
      return result.deletedCount > 0;
    },

    sendMessage: async (_, { input }, context) => {
      const user = checkAuth(context);
      const { content, projectId, eventId } = input;

      if (!projectId && !eventId) {
        throw new GraphQLError('Message must be attached to a project or event');
      }

      const message = await Message.create({
        content,
        senderId: user.id,
        companyId: user.companyId,
        projectId,
        eventId,
        isAiGenerated: false
      });

      const populatedMessage = await message.populate(['sender', 'project', 'event', 'company']);

      pubsub.publish('MESSAGE_ADDED', { messageAdded: populatedMessage });

      return populatedMessage;
    },

    aiAssist: async (_, { input }, context) => {
      const user = checkAuth(context);
      const { prompt, contextId, contextType } = input;

      // Prepare context for the AI service
      const contextData = { type: contextType };

      // Verify ownership and existence of the context (Project or Event)
      if (contextId) {
        if (contextType === 'project') {
          const project = await Project.findOne({ _id: contextId, companyId: user.companyId });
          if (!project) {
             throw new GraphQLError('Project context not found or access denied', {
               extensions: { code: 'NOT_FOUND' }
             });
          }
          contextData.title = project.title;
          contextData.description = project.description;
        } else if (contextType === 'event') {
          const event = await Event.findOne({ _id: contextId, companyId: user.companyId });
          if (!event) {
             throw new GraphQLError('Event context not found or access denied', {
               extensions: { code: 'NOT_FOUND' }
             });
          }
          contextData.title = event.title;
          contextData.description = event.description;
        }
      }

      try {
        const response = await aiService.generateResponse(prompt, contextData);
        return response;
      } catch (error) {
        console.error('AI Service Error:', error);
        throw new GraphQLError('Failed to generate AI response', {
          extensions: { code: 'INTERNAL_SERVER_ERROR' }
        });
      }
    }
  },

  Subscription: {
    messageAdded: {
      subscribe: withFilter(
        () => pubsub.asyncIterator(['MESSAGE_ADDED']),
        (payload, variables, context) => {
          const { messageAdded } = payload;
          const user = context.user;

          // 1. Verify User matches Company
          if (!user || messageAdded.companyId.toString() !== user.companyId) {
            return false;
          }

          // 2. Filter by Project or Event if requested
          if (variables.projectId && messageAdded.projectId) {
            return messageAdded.projectId.toString() === variables.projectId;
          }
          if (variables.eventId && messageAdded.eventId) {
            return messageAdded.eventId.toString() === variables.eventId;
          }

          // If no specific filter requested, return true (firehose for company)
          if (!variables.projectId && !variables.eventId) {
            return true;
          }
          
          return false;
        }
      ),
    },
    eventUpdated: {
      subscribe: withFilter(
        () => pubsub.asyncIterator(['EVENT_UPDATED']),
        (payload, variables, context) => {
          const { eventUpdated } = payload;
          const user = context.user;

          // Verify User matches Company
          if (!user || eventUpdated.companyId.toString() !== user.companyId) {
            return false;
          }

          return true;
        }
      ),
    },
  },
};

module.exports = resolvers;
