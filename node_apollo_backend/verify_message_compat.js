const { makeExecutableSchema } = require('@graphql-tools/schema');
const { graphql } = require('graphql');
const typeDefs = require('./src/graphql/typeDefs');
const resolvers = require('./src/graphql/resolvers');

// Mock Models
const User = {
    findById: () => ({ id: 'u1', username: 'TestUser' })
};
const Project = {
    findById: (id) => ({ id: id, title: 'Test Project' })
};
const Event = {
    findById: (id) => ({ id: id, title: 'Test Event' })
};
const Company = {
    findById: () => ({ id: 'comp1', name: 'Test Company' })
};
const Message = {
    find: () => ({
        sort: () => ({
            skip: () => ({
                limit: () => Promise.resolve([
                    { 
                        id: 'm1', 
                        content: 'Test Message', 
                        projectId: 'p1', 
                        eventId: 'e1',
                        senderId: 'u1',
                        companyId: 'comp1'
                    }
                ])
            })
        })
    })
};

// Inject mocks into resolvers context or rewire module if needed. 
// Since resolvers require models, and we can't easily mock require without proxyquire/jest,
// we will monkey-patch the models for this script run.
const Models = require('./src/models');
Models.User.findById = User.findById;
Models.Project.findById = Project.findById;
Models.Event.findById = Event.findById;
Models.Company.findById = Company.findById;
Models.Message.find = Message.find;

// We need to mock ChatMember for checkAuth or bypass it. 
// The 'getMessages' resolver calls checkAuth which checks context.user.
// It doesn't query ChatMember for getMessages, only for getChatMessages.

async function runTest() {
  console.log('Building schema...');
  const schema = makeExecutableSchema({ typeDefs, resolvers });

  const query = `
    query {
      getMessages(projectId: "p1") {
        id
        content
        projectId
        eventId
        project {
          id
        }
        event {
          id
        }
      }
    }
  `;

  const context = {
    user: {
      id: 'u1',
      companyId: 'comp1',
      role: 'member',
      email: 'test@test.com'
    }
  };

  console.log('Running query...');
  const result = await graphql({
    schema,
    source: query,
    contextValue: context
  });

  if (result.errors) {
    console.error('❌ Query failed:', result.errors);
    process.exit(1);
  }

  const messages = result.data.getMessages;
  if (messages.length === 0) {
    console.error('❌ No messages returned');
    process.exit(1);
  }

  const msg = messages[0];
  console.log('Message result:', msg);

  if (msg.projectId !== 'p1') {
      console.error('❌ projectId mismatch');
      process.exit(1);
  }
  if (msg.eventId !== 'e1') {
      console.error('❌ eventId mismatch');
      process.exit(1);
  }
  if (msg.project.id !== 'p1') {
      console.error('❌ project.id mismatch');
      process.exit(1);
  }
  if (msg.event.id !== 'e1') {
      console.error('❌ event.id mismatch');
      process.exit(1);
  }

  console.log('✅ Verification successful: projectId and eventId resolvable.');
}

runTest().catch(console.error);
