const { PubSub } = require('graphql-subscriptions');
const { RedisPubSub } = require('graphql-redis-subscriptions');
const Redis = require('ioredis');
const { PubSubAsyncIterableIterator } = require('graphql-subscriptions/dist/pubsub-async-iterable-iterator');

let pubsub;

console.log('Initializing PubSub...');

const ensureAsyncIterator = (pubsubInstance) => {
    if (typeof pubsubInstance.asyncIterator === 'function') {
        console.log('✅ PubSub instance already has asyncIterator.');
        return;
    }

    console.warn('⚠️ pubsub.asyncIterator is missing. Polyfilling...');
    
    pubsubInstance.asyncIterator = (triggers) => {
        return new PubSubAsyncIterableIterator(pubsubInstance, triggers);
    };

    if (typeof pubsubInstance.asyncIterator === 'function') {
        console.log('✅ Polyfill successful: asyncIterator attached.');
    } else {
        console.error('❌ CRITICAL: Failed to polyfill asyncIterator.');
    }
};

if (process.env.REDIS_URL) {
  console.log('🚀 Using Redis PubSub');
  try {
    const options = {
      retryStrategy: times => Math.min(times * 50, 2000)
    };
    
    const publisher = new Redis(process.env.REDIS_URL, options);
    const subscriber = new Redis(process.env.REDIS_URL, options);

    pubsub = new RedisPubSub({
      publisher,
      subscriber
    });
    
    publisher.on('error', (err) => console.error('Redis Publisher Error:', err));
    subscriber.on('error', (err) => console.error('Redis Subscriber Error:', err));
    
    ensureAsyncIterator(pubsub);

  } catch (err) {
    console.error('Failed to initialize Redis PubSub, falling back to in-memory:', err);
    pubsub = new PubSub();
    ensureAsyncIterator(pubsub);
  }
} else {
  console.log('📦 Using In-Memory PubSub (Development Mode)');
  pubsub = new PubSub();
  ensureAsyncIterator(pubsub);
}

try {
    const iter = pubsub.asyncIterator(['STARTUP_CHECK']);
    if (iter && typeof iter.next === 'function') {
        console.log('✅ PubSub.asyncIterator passes basic functionality check.');
        console.log('✅ Subscription System: READY');
    } else {
        console.error('❌ PubSub.asyncIterator returned invalid iterator object.');
    }
} catch (e) {
    console.error('❌ PubSub.asyncIterator crashed during self-check:', e);
}

module.exports = pubsub;
