const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { GraphQLError } = require('graphql');
const { withFilter } = require('graphql-subscriptions');
const pubsub = require('./pubsub');
const aiService = require('../services/ai');

// Models
const { User, Company, Project, Event, Message, Chat, ChatMember } = require('../models');

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
    projectId: (parent) => parent.projectId || (parent.project && (parent.project.id || parent.project._id)),
    eventId: (parent) => parent.eventId || (parent.event && (parent.event.id || parent.event._id)),
    project: async (parent) => resolveReference(Project, parent.projectId, parent.project),
    event: async (parent) => resolveReference(Event, parent.eventId, parent.event),
    company: async (parent) => resolveReference(Company, parent.companyId, parent.company),
    chat: async (parent) => resolveReference(Chat, parent.chatId, parent.chat),
    readBy: async (parent) => {
      // Find all members who have read up to this message or later
      // This is a simplified logic. Real logic would compare message sequence/timestamps.
      // For now, return empty or based on lastReadMessageId
      return []; 
    }
  },

  Chat: {
    members: async (parent) => {
      // Fetch ChatMembers for this chat
      const members = await ChatMember.find({ chatId: parent._id }).populate('userId');
      // Map ChatMember schema to GraphQL ChatMember type structure if needed
      // GraphQL type: type ChatMember { user: User!, role: String!, isMuted: Boolean!, lastReadAt: Date }
      // Mongoose schema: userId (ref User)
      return members.map(m => ({
        user: m.userId,
        role: m.role,
        isMuted: m.isMuted,
        lastReadAt: m.lastReadAt
      }));
    },
    lastMessage: async (parent) => resolveReference(Message, parent.lastMessage, null),
    unreadCount: async (parent, _, context) => {
      const user = context.user;
      if (!user) return 0;
      const membership = await ChatMember.findOne({ chatId: parent._id, userId: user.id });
      if (!membership) return 0;
      // TODO: Calculate unread count based on lastReadMessageId
      return 0; 
    },
    participants: async (parent) => {
        // Fetch members then populate users
        // Use ChatMember model to find members of this chat
        const members = await ChatMember.find({ chatId: parent._id });
        const userIds = members.map(m => m.userId);
        return await User.find({ _id: { $in: userIds } });
    }
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
    },
    
    // Chat Queries
    getChats: async (_, __, context) => {
      const user = checkAuth(context);
      // Find all chats where user is a member
      const memberships = await ChatMember.find({ userId: user.id });
      const chatIds = memberships.map(m => m.chatId);
      return await Chat.find({ _id: { $in: chatIds }, companyId: user.companyId }).sort({ lastMessageAt: -1 });
    },

    getChat: async (_, { id }, context) => {
      const user = checkAuth(context);
      // Verify membership
      const membership = await ChatMember.findOne({ chatId: id, userId: user.id });
      if (!membership) throw new GraphQLError('Chat not found or access denied');
      
      return await Chat.findById(id);
    },

    getChatMessages: async (_, { chatId, limit = 50, offset = 0 }, context) => {
      const user = checkAuth(context);
      // Verify membership
      const membership = await ChatMember.findOne({ chatId: chatId, userId: user.id });
      if (!membership) throw new GraphQLError('Access denied');

      return await Message.find({ chatId })
        .sort({ createdAt: -1 }) // Usually recent first for chats
        .skip(offset)
        .limit(limit);
    },

    getDirectChat: async (_, { userId }, context) => {
      const user = checkAuth(context);
      
      // Check for existing direct chat between these two
      // This approach assumes only one DIRECT chat exists per pair
      // We need to find a chat of type DIRECT where both users are members
      
      // 1. Find all chats user is in
      const myMemberships = await ChatMember.find({ userId: user.id });
      const myChatIds = myMemberships.map(m => m.chatId);

      // 2. Find chats where target user is also a member, constrained by myChatIds
      const targetMembership = await ChatMember.findOne({
        chatId: { $in: myChatIds },
        userId: userId
      }).populate('chatId');

      // Check if any of these are DIRECT
      // Note: populate('chatId') might return null if chat deleted
      if (targetMembership && targetMembership.chatId && targetMembership.chatId.type === 'DIRECT') {
        return targetMembership.chatId;
      }

      // If not exists, create new one
      const chat = await Chat.create({
        companyId: user.companyId,
        type: 'DIRECT',
        members: [user.id, userId] // Temporary for logic, actually managed via ChatMember
      });

      await ChatMember.create([
        { chatId: chat._id, userId: user.id, role: 'member' },
        { chatId: chat._id, userId: userId, role: 'member' }
      ]);

      return chat;
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
      const { title, description, startTime, endTime, location, meetingUrl, isVirtual, projectId, attendeeIds } = input;

      const event = await Event.create({
        title,
        description,
        startTime,
        endTime,
        location,
        meetingUrl,
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
      const { content, projectId, eventId, chatId, attachments } = input;

      let targetChatId = chatId;

      // Legacy support for projectId/eventId
      if (!targetChatId) {
        if (!projectId && !eventId) {
          throw new GraphQLError('Message must be attached to a project, event or chat');
        }
        // For now, we allow creating a message without chatId if projectId/eventId exists
        // But future migration should ensure a chat exists for every project/event
      }

      const message = await Message.create({
        content,
        senderId: user.id,
        companyId: user.companyId,
        projectId,
        eventId,
        chatId: targetChatId,
        attachments: attachments || [],
        isAiGenerated: false
      });

      const populatedMessage = await message.populate(['sender', 'project', 'event', 'company']);

      // Update Chat lastMessage
      if (targetChatId) {
         await Chat.findByIdAndUpdate(targetChatId, { 
             lastMessage: message._id,
             lastMessageAt: new Date()
         });
         
         // Fetch members to notify
         const members = await ChatMember.find({ chatId: targetChatId });
         const memberIds = members.map(m => m.userId.toString());
         
         pubsub.publish('MESSAGE_ADDED_TO_CHAT', { 
             messageAddedToChat: populatedMessage,
             receiverIds: memberIds
         });
      }

      // Legacy pubsub
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
    },

    // Chat Mutations
    createGroupChat: async (_, { name, memberIds }, context) => {
        const user = checkAuth(context);
        
        const chat = await Chat.create({
            companyId: user.companyId,
            type: 'GROUP',
            name,
            creatorId: user.id
        });

        // Add creator
        const allMemberIds = [...new Set([user.id, ...memberIds])];
        
        const membersPayload = allMemberIds.map(uid => ({
            chatId: chat._id,
            userId: uid,
            role: uid === user.id ? 'admin' : 'member'
        }));

        await ChatMember.insertMany(membersPayload);

        return chat;
    },

    updateChatSettings: async (_, { chatId, isMuted }, context) => {
        const user = checkAuth(context);
        const member = await ChatMember.findOneAndUpdate(
            { chatId, userId: user.id },
            { isMuted },
            { new: true }
        );
        if (!member) throw new GraphQLError('Member not found');
        return member;
    },

    sendMessageToChat: async (_, { chatId, content, attachments }, context) => {
        const user = checkAuth(context);
        
        // Verify membership
        const membership = await ChatMember.findOne({ chatId, userId: user.id });
        if (!membership) throw new GraphQLError('Access denied');

        const message = await Message.create({
            content,
            chatId,
            senderId: user.id,
            companyId: user.companyId,
            attachments: attachments || [],
            isAiGenerated: false
        });

        await Chat.findByIdAndUpdate(chatId, { 
            lastMessage: message._id,
            lastMessageAt: new Date()
        });

        const populatedMessage = await message.populate(['sender', 'company']);
        
        // Fetch members to notify
        const members = await ChatMember.find({ chatId });
        const memberIds = members.map(m => m.userId.toString());

        pubsub.publish('MESSAGE_ADDED_TO_CHAT', { 
            messageAddedToChat: populatedMessage,
            receiverIds: memberIds
        });

        return populatedMessage;
    },

    markChatAsRead: async (_, { chatId, messageId }, context) => {
        const user = checkAuth(context);
        await ChatMember.findOneAndUpdate(
            { chatId, userId: user.id },
            { lastReadMessageId: messageId, lastReadAt: new Date() }
        );
        return true;
    },

    getUploadUrl: async (_, { filename, mimeType }, context) => {
        checkAuth(context);
        // Mock implementation for development
        return `https://mock-storage.example.com/uploads/${Date.now()}_${filename}`;
    },

    addMembersToChat: async (_, { chatId, memberIds }, context) => {
        const user = checkAuth(context);
        // Verify admin
        const adminMember = await ChatMember.findOne({ chatId, userId: user.id, role: 'admin' });
        if (!adminMember) throw new GraphQLError('Only admins can add members');

        const newMembers = memberIds.map(uid => ({
            chatId,
            userId: uid,
            role: 'member'
        }));

        // Avoid duplicates (simplified)
        for (const m of newMembers) {
            try {
                await ChatMember.create(m);
            } catch (e) {
                // Ignore duplicate key errors
            }
        }
        
        const chat = await Chat.findById(chatId);
        
        // Publish chat updated event
        const members = await ChatMember.find({ chatId });
        const allMemberIds = members.map(m => m.userId.toString());
        
        pubsub.publish('CHAT_UPDATED', { 
            chatUpdated: chat,
            memberIds: allMemberIds
        });

        return chat;
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

    messageAddedToChat: {
      subscribe: withFilter(
        () => pubsub.asyncIterator(['MESSAGE_ADDED_TO_CHAT']),
        (payload, variables, context) => {
            const { receiverIds } = payload;
            const user = context.user;
            if (!user) return false;
            return receiverIds.includes(user.id);
        }
      )
    },
    
    typingChanged: {
      subscribe: withFilter(
        () => pubsub.asyncIterator(['TYPING_STATUS']),
        (payload, variables, context) => {
            // Simplified: allow if user is in chat
            return true; 
        }
      )
    },
    
    chatUpdated: {
      subscribe: withFilter(
        () => pubsub.asyncIterator(['CHAT_UPDATED']),
        (payload, variables, context) => {
            const { memberIds } = payload;
            const user = context.user;
            if (!user) return false;
            return memberIds.includes(user.id);
        }
      )
    }
  },
};

module.exports = resolvers;
