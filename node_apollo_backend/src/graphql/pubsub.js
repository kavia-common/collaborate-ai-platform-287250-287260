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

module.exports = pubsub;
