const pubsub = require('./src/graphql/pubsub');

console.log('--- PubSub Hardening Verification ---');

// 1. Check Type
console.log('1. PubSub Instance Exists:', !!pubsub);

// 2. Check asyncIterator function presence
const hasAsyncIterator = typeof pubsub.asyncIterator === 'function';
console.log('2. asyncIterator is function:', hasAsyncIterator);

if (!hasAsyncIterator) {
    console.error('❌ FAILURE: asyncIterator is missing!');
    process.exit(1);
}

// 3. Check Iterator Functionality
try {
    const iterator = pubsub.asyncIterator(['TEST_TOPIC']);
    console.log('3. asyncIterator returned:', iterator ? iterator.constructor.name : 'null');
    
    const isAsyncIterable = iterator && typeof iterator.next === 'function'; 
    
    // Check for Symbol.asyncIterator
    let isSymbolAsyncIterator = false;
    if (iterator && Symbol.asyncIterator) {
        isSymbolAsyncIterator = typeof iterator[Symbol.asyncIterator] === 'function';
    }
    
    console.log('   - Has .next():', isAsyncIterable);
    console.log('   - Has [Symbol.asyncIterator]:', isSymbolAsyncIterator);

    if (isAsyncIterable) {
        console.log('✅ SUCCESS: asyncIterator returns a valid iterator.');
    } else {
        console.error('❌ FAILURE: asyncIterator returned invalid object.');
        process.exit(1);
    }
} catch (e) {
    console.error('❌ FAILURE: asyncIterator threw error:', e);
    process.exit(1);
}

process.exit(0);
