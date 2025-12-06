const { makeExecutableSchema } = require('@graphql-tools/schema');
const { graphql } = require('graphql');
const typeDefs = require('./src/graphql/typeDefs');
const resolvers = require('./src/graphql/resolvers');

// Mock Data
const mockUser = { id: 'u1', username: 'TestUser', companyId: 'comp1', role: 'member', email: 'test@example.com' };
const mockChat = { id: 'c1', _id: 'c1', name: 'General', type: 'GROUP', companyId: 'comp1' };
const mockMessage = { 
    _id: 'm1', id: 'm1', content: 'Test Content', 
    senderId: 'u1', companyId: 'comp1', chatId: 'c1', 
    createdAt: new Date(), updatedAt: new Date(),
    populate: function() { return Promise.resolve(this); } 
};

// Mock Models
const User = {
    findById: () => ({ ...mockUser }),
    find: () => ([mockUser])
};
const Chat = {
    findById: () => ({ ...mockChat }),
    findByIdAndUpdate: () => Promise.resolve({ ...mockChat })
};
const ChatMember = {
    find: () => ([{ userId: 'u1', chatId: 'c1' }, { userId: 'u2', chatId: 'c1' }]),
    findOne: () => ({ userId: 'u1', chatId: 'c1' })
};
const Message = {
    create: async (data) => {
        return { 
            ...mockMessage, 
            ...data, 
            _id: 'new_msg_' + Date.now(),
            populate: function() { return Promise.resolve(this); }
        };
    },
    find: () => ([])
};

// Inject Mocks
const Models = require('./src/models');
Models.User.findById = User.findById;
Models.User.find = User.find;
Models.Chat.findById = Chat.findById;
Models.Chat.findByIdAndUpdate = Chat.findByIdAndUpdate;
Models.ChatMember.find = ChatMember.find;
Models.ChatMember.findOne = ChatMember.findOne;
Models.Message.create = Message.create;
Models.Message.find = Message.find;

async function runTest() {
  console.log('Building schema...');
  const schema = makeExecutableSchema({ typeDefs, resolvers });
  
  const context = {
    user: mockUser
  };

  // 1. Test with Input Object (Legacy/Standard)
  console.log('Test 1: sendMessage with input object...');
  const queryInput = `
    mutation {
      sendMessage(input: { chatId: "c1", content: "Hello from Input" }) {
        id
        content
        chat {
            id
        }
      }
    }
  `;
  const resultInput = await graphql({ schema, source: queryInput, contextValue: context });
  if (resultInput.errors) {
      console.error('❌ sendMessage(input) failed:', resultInput.errors);
      process.exit(1);
  }
  if (resultInput.data.sendMessage.content !== 'Hello from Input') {
      console.error('❌ Content mismatch in input test');
      process.exit(1);
  }
  console.log('✅ sendMessage(input) passed.');

  // 2. Test with Flat Arguments (Frontend Compat)
  console.log('Test 2: sendMessage with flat arguments...');
  const queryFlat = `
    mutation {
      sendMessage(chatId: "c1", content: "Hello from Flat Args") {
        id
        content
        chat {
            id
        }
      }
    }
  `;
  const resultFlat = await graphql({ schema, source: queryFlat, contextValue: context });
  if (resultFlat.errors) {
      console.error('❌ sendMessage(flat) failed:', resultFlat.errors);
      process.exit(1);
  }
  if (resultFlat.data.sendMessage.content !== 'Hello from Flat Args') {
      console.error('❌ Content mismatch in flat args test');
      process.exit(1);
  }
  console.log('✅ sendMessage(flat) passed.');

  console.log('ALL COMPATIBILITY TESTS PASSED');
  process.exit(0);
}

runTest().catch(console.error);
