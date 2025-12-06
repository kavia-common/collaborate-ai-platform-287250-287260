const { makeExecutableSchema } = require('@graphql-tools/schema');
const { graphql, subscribe, parse } = require('graphql');
const typeDefs = require('./src/graphql/typeDefs');
const resolvers = require('./src/graphql/resolvers');
const pubsub = require('./src/graphql/pubsub'); // Get the actual pubsub instance

// --- Mocks ---
const User = require('./src/models/User');
const Chat = require('./src/models/Chat');
const ChatMember = require('./src/models/ChatMember');

// Helper to create a chainable mock object
const createChainableMock = (result) => {
    const chainable = {
        sort: () => chainable,
        skip: () => chainable,
        limit: () => chainable,
        populate: () => chainable,
        then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
        catch: (reject) => Promise.resolve(result).catch(reject)
    };
    return chainable;
};

// Mock implementations
User.findById = (id) => createChainableMock({ id, username: 'TestUser', email: 'test@example.com' });
User.find = (query) => createChainableMock([{ id: 'u1', username: 'User1' }, { id: 'u2', username: 'User2' }]);

ChatMember.find = (query) => {
    if (query.userId) return createChainableMock([{ chatId: 'c1', userId: 'u1' }]);
    if (query.chatId) return createChainableMock([
        { chatId: query.chatId, userId: 'u1', role: 'member' }, 
        { chatId: query.chatId, userId: 'u2', role: 'member' }
    ]);
    return createChainableMock([]);
};
ChatMember.findOne = () => createChainableMock({ chatId: 'c1', userId: 'u1' });

Chat.find = () => createChainableMock([
    { id: 'c1', _id: 'c1', name: 'General', type: 'GROUP', lastMessageAt: new Date(), companyId: 'comp1' }
]);
Chat.findById = (id) => createChainableMock({ id: id, _id: id, name: 'General', type: 'GROUP', companyId: 'comp1' });


async function runTest() {
  console.log('Building schema...');
  const schema = makeExecutableSchema({ typeDefs, resolvers });

  // 1. Test Query
  const query = `
    query {
      getChats {
        id
        name
        type
        updatedAt
        participants {
          id
          username
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

  console.log('Running test query...');
  const result = await graphql({
    schema,
    source: query,
    contextValue: context
  });

  if (result.errors) {
    console.error('❌ Query failed with errors:', JSON.stringify(result.errors, null, 2));
    process.exit(1);
  }

  console.log('✅ Query result:', JSON.stringify(result.data, null, 2));
  
  const chat = result.data.getChats[0];
  if (!chat.participants || chat.participants.length === 0) {
      console.error('❌ Participants field is missing or empty');
      process.exit(1);
  }
  console.log('✅ Participants field verified.');
  
  // 2. Test Subscription
  console.log('Testing Subscription...');
  
  const subQuery = `
    subscription {
      messageAddedToChat {
        id
        content
      }
    }
  `;
  
  // Create an iterator
  const iterator = await subscribe({
      schema,
      document: parse(subQuery),
      contextValue: context
  });

  if (iterator.errors) {
      console.error('❌ Subscription setup failed:', iterator.errors);
      process.exit(1);
  }
  
  // It should return an AsyncIterator
  if (!iterator[Symbol.asyncIterator]) {
      console.error('❌ Subscription did not return an async iterator');
      process.exit(1);
  }

  console.log('✅ Subscription iterator created successfully.');
  
  // Optional: Publish something and see if it triggers (requires more complex mocking/wiring)
  // For now, verifying no error on creation satisfies the "no asyncIterator errors" check 
  // for the setup phase.
  
  process.exit(0);
}

runTest().catch(err => {
  console.error(err);
  process.exit(1);
});
