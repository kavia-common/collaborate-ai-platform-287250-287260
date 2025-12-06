const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { GraphQLError } = require('graphql');
const { withFilter } = require('graphql-subscriptions');
const pubsub = require('./pubsub');

// Models
const { User, Company, Project, Event, Message } = require('../models');

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

const resolvers = {
  Date: {
    // Basic scalar implementation for Date if not using a library like graphql-scalars
    // For simplicity here assuming input is ISO string or timestamp, output is ISO string
    __parseValue(value) {
      return new Date(value); // value from the client
    },
    __serialize(value) {
      return value.toISOString(); // value sent to the client
    },
    __parseLiteral(ast) {
      if (ast.kind === 'StringValue') {
        return new Date(ast.value); // ast value is always in string format
      }
      return null;
    },
  },

  Query: {
    me: async (_, __, context) => {
      const user = checkAuth(context);
      return await User.findById(user.id).populate('company');
    },
    getProjects: async (_, { status }, context) => {
      const user = checkAuth(context);
      const filter = { companyId: user.companyId };
      if (status) filter.status = status;
      return await Project.findById(filter).populate('owner').populate('members').populate('company');
      // Note: The first argument to find should be the filter object directly
      // Correction: Project.find(filter) not findById(filter)
      return await Project.find(filter).populate('owner').populate('members').populate('company').sort({ createdAt: -1 });
    },
    getProject: async (_, { id }, context) => {
      const user = checkAuth(context);
      const project = await Project.findOne({ _id: id, companyId: user.companyId })
        .populate('owner')
        .populate('members')
        .populate('company');
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

      return await Event.find(filter)
        .populate('organizer')
        .populate('attendees')
        .populate('project')
        .populate('company')
        .sort({ startTime: 1 });
    },
    getEvent: async (_, { id }, context) => {
      const user = checkAuth(context);
      const event = await Event.findOne({ _id: id, companyId: user.companyId })
        .populate('organizer')
        .populate('attendees')
        .populate('project')
        .populate('company');
      if (!event) throw new GraphQLError('Event not found');
      return event;
    },
    getMessages: async (_, { projectId, eventId, limit = 50, offset = 0 }, context) => {
      const user = checkAuth(context);
      const filter = { companyId: user.companyId };
      
      // Must specify context for messages usually, or get all for company (dangerous for large datasets)
      // For now allow filtering by either
      if (projectId) filter.projectId = projectId;
      if (eventId) filter.eventId = eventId;
      
      if (!projectId && !eventId) {
          // Optional: restrict if neither is provided
      }

      return await Message.find(filter)
        .populate('sender')
        .populate('project')
        .populate('event')
        .populate('company')
        .sort({ createdAt: 1 }) // Chronological for chat
        .skip(offset)
        .limit(limit);
    },
    getCompanyUsers: async (_, __, context) => {
      const user = checkAuth(context);
      return await User.find({ companyId: user.companyId }).populate('company');
    }
  },

  Mutation: {
    register: async (_, { input }) => {
      const { username, email, password, companyName } = input;

      // Check existing user
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

      // Hash Password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create User (Admin)
      const newUser = await User.create({
        username,
        email,
        password: hashedPassword,
        companyId: newCompany._id,
        role: 'admin'
      });

      // Generate Token
      const token = jwt.sign(
        { id: newUser._id, companyId: newUser.companyId, role: newUser.role, email: newUser.email },
        process.env.JWT_SECRET || 'fallback_secret', // Should use env var
        { expiresIn: '7d' }
      );

      // Populate company for return
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
        process.env.JWT_SECRET || 'fallback_secret',
        { expiresIn: '7d' }
      );

      // Populate company manually or fetch
      await user.populate('company');

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

      return await project.populate(['owner', 'members', 'company']);
    },

    updateProject: async (_, { input }, context) => {
      const user = checkAuth(context);
      const { id, ...updates } = input;

      const project = await Project.findOne({ _id: id, companyId: user.companyId });
      if (!project) throw new GraphQLError('Project not found');

      Object.assign(project, updates);
      // Handle members update specifically if needed (replace or add), simplistic here:
      if (updates.memberIds) project.members = updates.memberIds;

      await project.save();
      return await project.populate(['owner', 'members', 'company']);
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
      
      // Notify subscribers
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
      
      // Notify subscribers
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

      // Publish to subscriptions
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
          const user = context.user; // Context user from onConnect/connectionParams

          // 1. Security: User must belong to the same company
          if (!user || messageAdded.companyId.toString() !== user.companyId) {
            return false;
          }

          // 2. Context filtering: Project or Event
          if (variables.projectId && messageAdded.projectId) {
            return messageAdded.projectId.toString() === variables.projectId;
          }
          if (variables.eventId && messageAdded.eventId) {
            return messageAdded.eventId.toString() === variables.eventId;
          }

          // If no filter variables provided, maybe stream all company messages? 
          // Or enforce filtering. Let's enforce strictly what matches.
          // If client sends NO variables, they get everything for their company (chatty but simple)
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

          // Security: Same company
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
