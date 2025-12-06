const typeDefs = `#graphql
  scalar Date

  type Company {
    id: ID!
    name: String!
    domain: String
    createdAt: Date
    updatedAt: Date
  }

  type User {
    id: ID!
    username: String!
    email: String!
    role: String!
    avatarUrl: String
    company: Company!
    createdAt: Date
    updatedAt: Date
  }

  type Project {
    id: ID!
    title: String!
    description: String
    status: String!
    startDate: Date
    endDate: Date
    owner: User!
    members: [User!]
    company: Company!
    createdAt: Date
    updatedAt: Date
  }

  type Event {
    id: ID!
    title: String!
    description: String
    startTime: Date!
    endTime: Date!
    location: String
    meetingUrl: String
    isVirtual: Boolean
    organizer: User!
    project: Project
    attendees: [User!]
    company: Company!
    createdAt: Date
    updatedAt: Date
  }

  enum ChatType {
    DIRECT
    GROUP
    PROJECT
    EVENT
  }

  type Attachment {
    url: String!
    filename: String!
    mimeType: String!
    size: Int!
  }

  type ChatMember {
    user: User!
    role: String!
    isMuted: Boolean!
    lastReadAt: Date
  }

  type Chat {
    id: ID!
    type: ChatType!
    name: String
    members: [ChatMember!]!
    participants: [User!] # Added for frontend consistency
    lastMessage: Message
    unreadCount: Int
    createdAt: Date!
    updatedAt: Date!
  }

  type TypingIndicator {
    chatId: ID!
    user: User!
    isTyping: Boolean!
  }

  type Message {
    id: ID!
    content: String
    sender: User!
    chat: Chat
    attachments: [Attachment!]
    readBy: [User!]
    project: Project
    projectId: ID
    event: Event
    eventId: ID
    isAiGenerated: Boolean
    company: Company!
    createdAt: Date
    updatedAt: Date
  }

  type AuthPayload {
    token: String!
    user: User!
  }

  input RegisterInput {
    username: String!
    email: String!
    password: String!
    companyName: String!
  }

  input LoginInput {
    email: String!
    password: String!
  }

  input CreateProjectInput {
    title: String!
    description: String
    status: String
    startDate: Date
    endDate: Date
    memberIds: [ID!]
  }

  input UpdateProjectInput {
    id: ID!
    title: String
    description: String
    status: String
    startDate: Date
    endDate: Date
    memberIds: [ID!]
  }

  input CreateEventInput {
    title: String!
    description: String
    startTime: Date!
    endTime: Date!
    location: String
    meetingUrl: String
    isVirtual: Boolean
    projectId: ID
    attendeeIds: [ID!]
  }

  input UpdateEventInput {
    id: ID!
    title: String
    description: String
    startTime: Date
    endTime: Date
    location: String
    meetingUrl: String
    isVirtual: Boolean
    projectId: ID
    attendeeIds: [ID!]
  }

  input AttachmentInput {
    url: String!
    filename: String!
    mimeType: String!
    size: Int!
  }

  input SendMessageInput {
    chatId: ID
    content: String
    attachments: [AttachmentInput]
    projectId: ID
    eventId: ID
  }

  type AIResponse {
    content: String!
    suggestedActions: [String]
  }

  input AiAssistInput {
    prompt: String!
    contextId: ID
    contextType: String # 'project' or 'event'
  }

  type Query {
    me: User
    
    # Project Queries
    getProjects(status: String): [Project!]!
    getProject(id: ID!): Project

    # Event Queries
    getEvents(projectId: ID, startAfter: Date, startBefore: Date): [Event!]!
    getEvent(id: ID!): Event

    # Message Queries
    getMessages(projectId: ID, eventId: ID, limit: Int, offset: Int): [Message!]!
    # Alias for getMessages for compatibility
    messages(projectId: ID, eventId: ID, limit: Int, offset: Int): [Message!]!
    
    # Chat Queries
    getChats: [Chat!]!
    getChat(id: ID!): Chat
    getChatMessages(chatId: ID!, limit: Int, offset: Int): [Message!]!
    getDirectChat(userId: ID!): Chat!

    # Company Users (Admin/Manager utility)
    getCompanyUsers: [User!]!
  }

  type Mutation {
    # Auth
    register(input: RegisterInput!): AuthPayload!
    login(input: LoginInput!): AuthPayload!

    # Projects
    createProject(input: CreateProjectInput!): Project!
    updateProject(input: UpdateProjectInput!): Project!
    deleteProject(id: ID!): Boolean!

    # Events
    createEvent(input: CreateEventInput!): Event!
    updateEvent(input: UpdateEventInput!): Event!
    deleteEvent(id: ID!): Boolean!

    # Messages
    sendMessage(input: SendMessageInput!): Message!
    
    # Chats
    createGroupChat(name: String!, memberIds: [ID!]!): Chat!
    updateChatSettings(chatId: ID!, isMuted: Boolean!): ChatMember!
    sendMessageToChat(chatId: ID!, content: String, attachments: [AttachmentInput]): Message!
    markChatAsRead(chatId: ID!, messageId: ID!): Boolean!
    getUploadUrl(filename: String!, mimeType: String!): String!
    addMembersToChat(chatId: ID!, memberIds: [ID!]!): Chat!
    updateTypingStatus(chatId: ID!, isTyping: Boolean!): Boolean

    # AI
    aiAssist(input: AiAssistInput!): AIResponse!
  }

  type Subscription {
    messageAdded(projectId: ID, eventId: ID): Message!
    eventUpdated: Event!
    
    # Chat Subscriptions
    messageAddedToChat: Message!
    typingChanged(chatId: ID!): TypingIndicator!
    chatUpdated: Chat!
  }
`;

module.exports = typeDefs;
