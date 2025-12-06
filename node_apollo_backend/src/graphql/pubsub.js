const { PubSub } = require('graphql-subscriptions');
const { RedisPubSub } = require('graphql-redis-subscriptions');
const Redis = require('ioredis');

// PUBLIC_INTERFACE
let pubsub;

if (process.env.REDIS_URL) {
  console.log('🚀 Using Redis PubSub');
  try {
    const options = {
        // Parse URL if provided, otherwise rely on defaults/env vars handled by ioredis
        // ioredis constructor handles redis:// URLs automatically
    };
    
    // Create publisher and subscriber clients
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

// Ensure asyncIterator exists (Polyfill for environment issues)
if (typeof pubsub.asyncIterator !== 'function') {
    console.warn('⚠️ Polyfilling pubsub.asyncIterator');
    try {
        // Attempt to load the iterator class from the package
        // This path is common for graphql-subscriptions
        const { PubSubAsyncIterator } = require('graphql-subscriptions/dist/pubsub-async-iterator');
        pubsub.asyncIterator = function(triggers) {
            return new PubSubAsyncIterator(this, triggers);
        };
    } catch (e) {
        console.error('❌ Failed to load PubSubAsyncIterator for polyfill:', e.message);
        // Fallback: attempt to use the main package if it exports it (some versions do)
        const pkg = require('graphql-subscriptions');
        if (pkg.PubSubAsyncIterator) {
             pubsub.asyncIterator = function(triggers) {
                return new pkg.PubSubAsyncIterator(this, triggers);
            };
        }
    }
}

module.exports = pubsub;
