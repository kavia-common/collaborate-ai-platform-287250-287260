const { makeExecutableSchema } = require('@graphql-tools/schema');
const { graphql, subscribe, parse } = require('graphql');
const typeDefs = require('./src/graphql/typeDefs');
const resolvers = require('./src/graphql/resolvers');
const pubsub = require('./src/graphql/pubsub');

// --- Mock Setup ---
const mocks = {
    User: {
        findById: (id) => Promise.resolve({ id, _id: id, companyId: 'comp1', username: 'Tester', role: 'admin' }),
        find: () => Promise.resolve([{ id: 'u1' }])
    },
    Company: {
        findById: (id) => Promise.resolve({ id, _id: id, name: 'Test Corp' })
    },
    Project: {
        findOne: () => Promise.resolve({ id: 'p1', _id: 'p1', title: 'Test Project', companyId: 'comp1' }),
        findById: (id) => Promise.resolve({ id, _id: id, title: 'Test Project', companyId: 'comp1' })
    },
    Event: {
        findOne: () => Promise.resolve({ id: 'e1', _id: 'e1', title: 'Test Event', companyId: 'comp1' }),
        findById: (id) => Promise.resolve({ id, _id: id, title: 'Test Event', companyId: 'comp1' })
    },
    Chat: {
        findOne: ({ contextId }) => Promise.resolve(null), // Simulate no existing chat to trigger creation
        create: (data) => Promise.resolve({ ...data, id: 'newChat1', _id: 'newChat1' }),
        findByIdAndUpdate: () => Promise.resolve({}),
        findById: (id) => Promise.resolve({ id, _id: id, type: 'GROUP' })
    },
    ChatMember: {
        find: () => Promise.resolve([{ userId: 'u1' }]),
        findOne: () => Promise.resolve({ userId: 'u1', chatId: 'c1' }),
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
                // Strict check for forbidden populate
                if (Array.isArray(paths) && paths.includes('company')) {
                     throw new Error('StrictPopulateError: Cannot populate path "company"');
                }
                return Promise.resolve(this);
            }
        }),
        find: () => {
            const chain = {
                sort: () => chain,
                skip: () => chain,
                limit: () => Promise.resolve([]) // Return empty array for messages query
            };
            return chain;
        }
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
    console.log('Building schema...');
    const schema = makeExecutableSchema({ typeDefs, resolvers });
    const context = { user: { id: 'u1', companyId: 'comp1', role: 'admin', email: 'test@test.com' } };

    // 1. Verify myCompany Query
    console.log('\n--- 1. Verify myCompany Query ---');
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


    // 2. Verify messages query returns []
    console.log('\n--- 2. Verify messages query returns [] ---');
    const messagesQuery = `
        query {
            messages(projectId: "p1") {
                id
                content
            }
        }
    `;
    const msgsRes = await graphql({ schema, source: messagesQuery, contextValue: context });
    if (msgsRes.errors) {
        console.error('❌ messages query failed:', msgsRes.errors);
        process.exit(1);
    }
    if (!Array.isArray(msgsRes.data.messages) || msgsRes.data.messages.length !== 0) {
        console.error('❌ messages query did not return empty array:', msgsRes.data.messages);
        process.exit(1);
    }
    console.log('✅ messages query returns [].');


    // 3. Verify sendMessage (Legacy/No ChatId) & Populate Check
    console.log('\n--- 3. Verify sendMessage (Legacy) & Populate Check ---');
    // We send a message with projectId but NO chatId. 
    // It should trigger finding/creating a chat.
    // The mock Message.create ensures no 'company' populate is called.
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
    
    // Spy on Chat.create
    let chatCreated = false;
    const originalCreate = Models.Chat.create;
    Models.Chat.create = (data) => {
        chatCreated = true;
        return originalCreate(data);
    };

    try {
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
        console.log('✅ sendMessage passed populate check (no StrictPopulateError).');
    } catch (e) {
        console.error('❌ sendMessage threw exception:', e);
        process.exit(1);
    }


    // 4. Verify messageAdded Subscription
    console.log('\n--- 4. Verify messageAdded Subscription ---');
    
    // Ensure asyncIterator is working
    if (typeof pubsub.asyncIterator !== 'function') {
        console.error('❌ pubsub.asyncIterator is missing!');
        process.exit(1);
    }

    const subQuery = `
        subscription {
            messageAdded {
                id
                content
            }
        }
    `;
    
    try {
        const iterator = await subscribe({
            schema,
            document: parse(subQuery),
            contextValue: context
        });

        if (iterator.errors) {
            console.error('❌ Subscription setup failed:', iterator.errors);
            process.exit(1);
        }
        
        if (!iterator[Symbol.asyncIterator]) {
            console.error('❌ Subscription did not return an async iterator');
            process.exit(1);
        }
        console.log('✅ messageAdded subscription iterator created successfully.');

    } catch (e) {
        console.error('❌ Subscription setup threw exception:', e);
        process.exit(1);
    }

    console.log('\nSUCCESS: All end-to-end checks passed.');
    process.exit(0);
}

runTests().catch(e => {
    console.error(e);
    process.exit(1);
});
