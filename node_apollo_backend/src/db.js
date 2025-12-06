const mongoose = require('mongoose');

/**
 * Connects to MongoDB using the URI from environment variables.
 * Implements retry logic with backoff.
 */
const connectDB = async () => {
  const dbURI = process.env.MONGODB_URI;

  if (!dbURI) {
    console.error('Error: MONGODB_URI not found in environment variables.');
    // Throwing here to prevent server startup if configuration is missing
    throw new Error('MONGODB_URI is not defined');
  }

  const connect = async () => {
    try {
      // Mongoose 8+ defaults to new URL parser and unified topology
      await mongoose.connect(dbURI);
      console.log('MongoDB connected successfully');
    } catch (err) {
      console.error('MongoDB connection failed:', err.message);
      console.log('Retrying in 5 seconds...');
      await new Promise((resolve) => setTimeout(resolve, 5000));
      return connect();
    }
  };

  await connect();
};

/**
 * Gracefully closes the MongoDB connection.
 * @param {string} signal - The signal that triggered the shutdown (e.g., SIGINT, SIGTERM).
 */
const gracefulShutdown = async (signal) => {
  try {
    await mongoose.disconnect();
    console.log(`MongoDB connection closed due to ${signal}`);
    process.exit(0);
  } catch (err) {
    console.error('Error during MongoDB disconnection', err);
    process.exit(1);
  }
};

// Listen for system signals to ensure clean shutdown
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

module.exports = connectDB;
