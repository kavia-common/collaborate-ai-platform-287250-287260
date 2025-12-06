const { makeExecutableSchema } = require('@graphql-tools/schema');
const { graphql } = require('graphql');
const typeDefs = require('./src/graphql/typeDefs');
const resolvers = require('./src/graphql/resolvers');
const pubsub = require('./src/graphql/pubsub');

// --- 1. PubSub Verification ---
console.log('--- Step 1.2: PubSub Verification ---');
if (!pubsub) {
    console.error('❌ PubSub is undefined');
    process.exit(1);
}
if (typeof pubsub.asyncIterator !== 'function') {
    console.error('❌ pubsub.asyncIterator is missing or not a function');
    process.exit(1);
}
console.log('✅ PubSub exports a singleton with asyncIterator.');


// --- Mocking ---
// We need to mock models to test resolvers logic without DB
const mocks = {
    User: {
        findById: (id) => Promise.resolve({ id, _id: id, companyId: 'comp1', username: 'Tester' }),
        find: () => Promise.resolve([{ id: 'u1' }])
    },
    Company: {
        findById: (id) => Promise.resolve({ id, _id: id, name: 'Test Corp' })
    },
    Project: {
        findOne: () => Promise.resolve({ id: 'p1', _id: 'p1', title: 'Test Project', companyId: 'comp1' })
    },
    Event: {
        findOne: () => Promise.resolve({ id: 'e1', _id: 'e1', title: 'Test Event', companyId: 'comp1' })
    },
    Chat: {
        findOne: ({ contextId }) => Promise.resolve(null), // Simulate no existing chat
        create: (data) => Promise.resolve({ ...data, id: 'newChat1', _id: 'newChat1' }),
        findByIdAndUpdate: () => Promise.resolve({}),
        findById: (id) => Promise.resolve({ id, _id: id, type: 'GROUP' })
    },
    ChatMember: {
        find: () => Promise.resolve([{ userId: 'u1' }]),
        findOne: () => Promise.resolve({ userId: 'u1', chatId: 'c1' }), // valid membership
        insertMany: () => Promise.resolve([]),
        create: () => Promise.resolve({}),
        findOneAndUpdate: () => Promise.resolve({})
    },
    Message: {
        create: (data) => Promise.resolve({ 
            ...data, 
            id: 'msg1', 
            _id: 'msg1', 
            populate: function(paths) {
                if (Array.isArray(paths) && paths.includes('company')) {
                     throw new Error('StrictPopulateError: Cannot populate path "company"');
                }
                return Promise.resolve(this);
            }
        })
    }
};

// Monkey-patch require to intercept models
const Models = require('./src/models');
Object.assign(Models.User, mocks.User);
Object.assign(Models.Company, mocks.Company);
Object.assign(Models.Project, mocks.Project);
Object.assign(Models.Event, mocks.Event);
Object.assign(Models.Chat, mocks.Chat);
Object.assign(Models.ChatMember, mocks.ChatMember);
Object.assign(Models.Message, mocks.Message);


async function runTests() {
    const schema = makeExecutableSchema({ typeDefs, resolvers });
    const context = { user: { id: 'u1', companyId: 'comp1', role: 'admin' } };

    // --- 2. Query.myCompany Verification ---
    console.log('\n--- Step 1.1: myCompany Verification ---');
    const companyQuery = `
        query {
            myCompany {
                id
                name
            }
        }
    `;
    const companyRes = await graphql({ schema, source: companyQuery, contextValue: context });
    if (companyRes.errors) {
        console.error('❌ myCompany query failed:', companyRes.errors);
        process.exit(1);
    }
    if (companyRes.data.myCompany.name !== 'Test Corp') {
        console.error('❌ myCompany returned wrong name:', companyRes.data.myCompany.name);
        process.exit(1);
    }
    console.log('✅ myCompany query works.');

    // --- 3. sendMessage Verification (Auto-create Chat) ---
    console.log('\n--- Step 1.3: sendMessage (Auto-Chat) Verification ---');
    // We send a message with projectId but NO chatId. 
    // It should trigger finding/creating a chat.
    const sendMsgQuery = `
        mutation {
            sendMessage(projectId: "p1", content: "Hello Project") {
                id
                content
                chat {
                    id
                }
            }
        }
    `;
    
    // We need to spy on Chat.create to be sure it was called
    let chatCreated = false;
    const originalCreate = Models.Chat.create;
    Models.Chat.create = (data) => {
        chatCreated = true;
        if (data.type !== 'PROJECT') console.error('❌ Created chat type is not PROJECT');
        if (data.contextId !== 'p1') console.error('❌ Created chat contextId is not p1');
        return originalCreate(data);
    };

    const msgRes = await graphql({ schema, source: sendMsgQuery, contextValue: context });
    if (msgRes.errors) {
        console.error('❌ sendMessage failed:', msgRes.errors);
        process.exit(1);
    }
    
    if (!chatCreated) {
         console.error('❌ Chat was NOT created for the project context.');
         process.exit(1);
    }
    console.log('✅ sendMessage correctly created a Chat for the project.');

    // --- 4. sendMessageToChat Verification (Populate Fix) ---
    console.log('\n--- Step 1.3: sendMessageToChat (Populate Fix) Verification ---');
    const sendChatMsgQuery = `
        mutation {
            sendMessageToChat(chatId: "c1", content: "Hello Chat") {
                id
                content
            }
        }
    `;
    
    try {
        const chatMsgRes = await graphql({ schema, source: sendChatMsgQuery, contextValue: context });
        if (chatMsgRes.errors) {
            console.error('❌ sendMessageToChat failed:', chatMsgRes.errors);
            process.exit(1);
        }
        console.log('✅ sendMessageToChat passed (no StrictPopulateError).');
    } catch (e) {
        console.error('❌ sendMessageToChat threw exception:', e);
        process.exit(1);
    }

    console.log('\nALL CHECKS PASSED');
    process.exit(0);
}

runTests().catch(e => {
    console.error(e);
    process.exit(1);
});
