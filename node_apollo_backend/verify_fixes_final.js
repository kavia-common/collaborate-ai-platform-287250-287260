const { makeExecutableSchema } = require('@graphql-tools/schema');
const { graphql, subscribe, parse } = require('graphql');
const typeDefs = require('./src/graphql/typeDefs');
const resolvers = require('./src/graphql/resolvers');
const pubsub = require('./src/graphql/pubsub');

// --- Mocks ---
const User = require('./src/models/User');
const Chat = require('./src/models/Chat');
const ChatMember = require('./src/models/ChatMember');
const Message = require('./src/models/Message');

// Helper for mocks
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

// Mock Implementations
User.findById = (id) => createChainableMock({ id, _id: id, username: 'TestUser', companyId: 'comp1', role: 'member', email: 'test@test.com' });
User.find = () => createChainableMock([]);
Message.find = () => createChainableMock([]); // Return empty array for messages query test
ChatMember.find = () => createChainableMock([]);
ChatMember.findOne = () => createChainableMock({ chatId: 'c1', userId: 'u1' });
Chat.findById = () => createChainableMock({ id: 'c1', _id: 'c1', type: 'GROUP', companyId: 'comp1' });

async function runTest() {
  console.log('Building schema...');
  const schema = makeExecutableSchema({ typeDefs, resolvers });

  const context = {
    user: {
      id: 'u1',
      companyId: 'comp1',
      role: 'member',
      email: 'test@test.com'
    }
  };

  // 1. Test "messages" query (should return array, not null)
  console.log('Testing "messages" query...');
  const query = `
    query {
      messages {
        id
        content
      }
    }
  `;
  const result = await graphql({ schema, source: query, contextValue: context });
  
  if (result.errors) {
    console.error('❌ messages query failed:', result.errors);
    process.exit(1);
  }
  
  if (!Array.isArray(result.data.messages)) {
      console.error('❌ messages query returned non-array:', result.data.messages);
      process.exit(1);
  }
  console.log('✅ messages query returned array.');

  // 2. Test pubsub.asyncIterator
  console.log('Testing pubsub.asyncIterator...');
  if (typeof pubsub.asyncIterator !== 'function') {
      console.error('❌ pubsub.asyncIterator is not a function!');
      process.exit(1);
  }
  console.log('✅ pubsub.asyncIterator is a function.');

  // 3. Test updateTypingStatus mutation
  console.log('Testing updateTypingStatus...');
  const mutation = `
    mutation {
        updateTypingStatus(chatId: "c1", isTyping: true)
    }
  `;
  const mutResult = await graphql({ schema, source: mutation, contextValue: context });
  if (mutResult.errors) {
      console.error('❌ updateTypingStatus failed:', mutResult.errors);
      process.exit(1);
  }
  console.log('✅ updateTypingStatus passed.');

  // 4. Test typingChanged subscription
  console.log('Testing typingChanged subscription...');
  const subQuery = `
    subscription {
        typingChanged(chatId: "c1") {
            chatId
            isTyping
        }
    }
  `;
  const iterator = await subscribe({ schema, document: parse(subQuery), contextValue: context });
  if (iterator.errors) {
      console.error('❌ subscription failed:', iterator.errors);
      process.exit(1);
  }
  if (!iterator[Symbol.asyncIterator]) {
       console.error('❌ subscription did not return iterator');
       process.exit(1);
  }
  console.log('✅ typingChanged subscription iterator created.');

  console.log('ALL CHECKS PASSED');
  process.exit(0);
}

runTest().catch(err => {
  console.error(err);
  process.exit(1);
});
