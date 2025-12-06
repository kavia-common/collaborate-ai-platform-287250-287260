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
    isVirtual: Boolean
    organizer: User!
    project: Project
    attendees: [User!]
    company: Company!
    createdAt: Date
    updatedAt: Date
  }

  type Message {
    id: ID!
    content: String!
    sender: User!
    project: Project
    event: Event
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
    isVirtual: Boolean
    projectId: ID
    attendeeIds: [ID!]
  }

  input SendMessageInput {
    content: String!
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

    # AI
    aiAssist(input: AiAssistInput!): AIResponse!
  }

  type Subscription {
    messageAdded(projectId: ID, eventId: ID): Message!
    eventUpdated: Event!
  }
`;

module.exports = typeDefs;
