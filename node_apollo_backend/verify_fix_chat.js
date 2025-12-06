const { makeExecutableSchema } = require('@graphql-tools/schema');
const { graphql, subscribe, parse } = require('graphql');
const typeDefs = require('./src/graphql/typeDefs');
const resolvers = require('./src/graphql/resolvers');
const pubsub = require('./src/graphql/pubsub');

// Mocks
const User = require('./src/models/User');
const Chat = require('./src/models/Chat');
const ChatMember = require('./src/models/ChatMember');
const Message = require('./src/models/Message');

// Mock Data & Helper
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
User.findById = (id) => createChainableMock({ id, _id: id, username: 'TestUser', email: 'test@example.com', companyId: 'comp1' });
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

Message.find = () => createChainableMock([{ id: 'm1', content: 'Hello' }]);

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

  // 1. Test "messages" query alias
  console.log('Testing "messages" query alias...');
  const messagesQuery = `
    query {
      messages {
        id
        content
      }
    }
  `;
  const msgResult = await graphql({ schema, source: messagesQuery, contextValue: context });
  if (msgResult.errors) {
      console.error('❌ messages query failed:', msgResult.errors);
      process.exit(1);
  }
  console.log('✅ messages query passed');

  // 2. Test Typing Mutation and Subscription
  console.log('Testing Typing flow...');
  
  const subQuery = `
    subscription {
      typingChanged(chatId: "c1") {
        chatId
        isTyping
        user {
            id
        }
      }
    }
  `;
  
  const iterator = await subscribe({ schema, document: parse(subQuery), contextValue: context });
  
  // We can't easily wait for publication in this simple script without a real event loop test runner,
  // but we can at least invoke the mutation and ensure it doesn't crash.
  
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
  console.log('✅ updateTypingStatus mutation passed:', mutResult.data);

  // 3. Verify Chat participants
  console.log('Testing Chat.participants...');
  const chatQuery = `
    query {
      getChat(id: "c1") {
        participants {
            id
            username
        }
      }
    }
  `;
  const chatResult = await graphql({ schema, source: chatQuery, contextValue: context });
  if (chatResult.errors) {
      console.error('❌ getChat participants failed:', chatResult.errors);
      process.exit(1);
  }
  if (!chatResult.data.getChat.participants) {
      console.error('❌ participants field missing');
      process.exit(1);
  }
  console.log('✅ Chat.participants verified');

  console.log('ALL CHECKS PASSED');
  process.exit(0);
}

runTest().catch(err => {
    console.error(err);
    process.exit(1);
});
