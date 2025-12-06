const { PubSub } = require('graphql-subscriptions');
const { RedisPubSub } = require('graphql-redis-subscriptions');
const Redis = require('ioredis');

let pubsub;

console.log('Initializing PubSub...');

if (process.env.REDIS_URL) {
  console.log('🚀 Using Redis PubSub');
  try {
    const publisher = new Redis(process.env.REDIS_URL);
    const subscriber = new Redis(process.env.REDIS_URL);

    pubsub = new RedisPubSub({
      publisher,
      subscriber
    });
    
    publisher.on('error', (err) => console.error('Redis Publisher Error:', err));
    subscriber.on('error', (err) => console.error('Redis Subscriber Error:', err));

  } catch (err) {
    console.error('Failed to initialize Redis PubSub, falling back to in-memory:', err);
    pubsub = new PubSub();
  }
} else {
  console.log('📦 Using In-Memory PubSub (Development Mode)');
  pubsub = new PubSub();
}

// Verification and Safe Polyfill for asyncIterator
if (typeof pubsub.asyncIterator !== 'function') {
    console.warn('⚠️ pubsub.asyncIterator is missing. Attempting polyfill...');
    
    // 1. Try to bind from prototype if available but lost on instance
    if (pubsub.constructor && pubsub.constructor.prototype && typeof pubsub.constructor.prototype.asyncIterator === 'function') {
         pubsub.asyncIterator = pubsub.constructor.prototype.asyncIterator.bind(pubsub);
         console.log('✅ Polyfilled using prototype binding.');
    } else {
        // 2. Try to load generic AsyncIterator from graphql-subscriptions
        try {
            // Try standard import path
            const { PubSubAsyncIterator } = require('graphql-subscriptions/dist/pubsub-async-iterator');
            if (PubSubAsyncIterator) {
                pubsub.asyncIterator = function(triggers) {
                    return new PubSubAsyncIterator(this, triggers);
                };
                console.log('✅ Polyfilled using graphql-subscriptions/dist/pubsub-async-iterator');
            } else {
                throw new Error('PubSubAsyncIterator not found in dist');
            }
        } catch (e) {
            console.warn('⚠️ Failed to load specific polyfill:', e.message);
            // 3. Fallback: define a basic asyncIterator wrapper if all else fails
            // This assumes the implementation has a subscribe method at minimum
            pubsub.asyncIterator = (triggers) => {
                console.warn('⚠️ Using minimal fallback asyncIterator');
                const { PubSubAsyncIterator } = require('graphql-subscriptions');
                return new PubSubAsyncIterator(pubsub, triggers);
            };
        }
    }
}

// Final check
if (typeof pubsub.asyncIterator === 'function') {
    console.log('✅ PubSub initialized with asyncIterator support.');
} else {
    console.error('❌ CRITICAL: Failed to ensure asyncIterator on PubSub instance.');
}

module.exports = pubsub;
