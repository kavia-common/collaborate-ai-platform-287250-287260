const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { GraphQLError } = require('graphql');
const { withFilter } = require('graphql-subscriptions');
const pubsub = require('./pubsub');

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
      return new Date(value);
    },
    __serialize(value) {
      return value.toISOString();
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

      const newCompany = await Company.create({
        name: companyName,
        settings: { theme: 'default' }
      });

      const hashedPassword = await bcrypt.hash(password, 10);

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
        status: status || 'planning',
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
      const { id, ...updates } = input;

      const project = await Project.findOne({ _id: id, companyId: user.companyId });
      if (!project) throw new GraphQLError('Project not found');

      Object.assign(project, updates);
      if (updates.memberIds) project.members = updates.memberIds;

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

      // Need to populate for subscription payload to be useful
      const populatedEvent = await event.populate(['organizer', 'attendees', 'project', 'company']);
      
      pubsub.publish('EVENT_UPDATED', { eventUpdated: populatedEvent });

      return populatedEvent;
    },

    updateEvent: async (_, { input }, context) => {
      const user = checkAuth(context);
      const { id, ...updates } = input;

      const event = await Event.findOne({ _id: id, companyId: user.companyId });
      if (!event) throw new GraphQLError('Event not found');

      Object.assign(event, updates);
      if (updates.attendeeIds) event.attendees = updates.attendeeIds;

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
    }
  },

  Subscription: {
    messageAdded: {
      subscribe: withFilter(
        () => pubsub.asyncIterator(['MESSAGE_ADDED']),
        (payload, variables, context) => {
          const { messageAdded } = payload;
          const user = context.user;

          if (!user || messageAdded.companyId.toString() !== user.companyId) {
            return false;
          }

          if (variables.projectId && messageAdded.projectId) {
            return messageAdded.projectId.toString() === variables.projectId;
          }
          if (variables.eventId && messageAdded.eventId) {
            return messageAdded.eventId.toString() === variables.eventId;
          }

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
