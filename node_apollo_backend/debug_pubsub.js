const pubsub = require('./src/graphql/pubsub');

console.log('Type of pubsub:', typeof pubsub);
console.log('Constructor:', pubsub.constructor.name);
console.log('Keys:', Object.keys(pubsub));
console.log('Prototype keys:', Object.getOwnPropertyNames(Object.getPrototypeOf(pubsub)));

if (pubsub.asyncIterator) {
    console.log('asyncIterator is present. Type:', typeof pubsub.asyncIterator);
} else {
    console.log('asyncIterator is MISSING');
}

try {
    const iter = pubsub.asyncIterator(['TEST']);
    console.log('Iterator created:', iter);
    console.log('Is AsyncIterable?', iter[Symbol.asyncIterator] ? 'Yes' : 'No');
} catch (e) {
    console.error('Error calling asyncIterator:', e);
}
