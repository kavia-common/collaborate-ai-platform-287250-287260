require('dotenv').config();
const { createServer } = require('http');
const { WebSocketServer } = require('ws');
const { useServer } = require('graphql-ws/lib/use/ws');
const { ApolloServer } = require('@apollo/server');
const { expressMiddleware } = require('@apollo/server/express4');
const { ApolloServerPluginDrainHttpServer } = require('@apollo/server/plugin/drainHttpServer');
const { makeExecutableSchema } = require('@graphql-tools/schema');
const cors = require('cors');
const app = require('./app');
const connectDB = require('./db');
const { auth } = require('./middleware');
const typeDefs = require('./graphql/typeDefs');
const resolvers = require('./graphql/resolvers');

const PORT = process.env.PORT || 3001;

/**
 * Shared context function to extract auth token and user
 * @param {Object} params - context params
 * @param {Object} [params.req] - HTTP request
 * @param {Object} [params.connectionParams] - WebSocket connection params
 * @returns {Object} context object with user and token
 */
const getContext = async ({ req, connectionParams }) => {
  let token = '';
  if (req) {
    // HTTP
    token = req.headers.authorization || '';
  } else if (connectionParams) {
    // WebSocket
    token = connectionParams.authorization || connectionParams.authToken || '';
  }

  const user = auth.getUserFromToken(token);
  return { user, token };
};

// PUBLIC_INTERFACE
async function startServer() {
  console.log('Starting server...');
  if (process.env.MONGODB_URI) {
    console.log('MONGODB_URI is set, attempting connection...');
  } else {
    console.warn('MONGODB_URI is NOT set. Database features will fail.');
  }

  // Create HTTP server from Express app
  const httpServer = createServer(app);

  // Initialize DB connection in background (non-blocking)
  connectDB().catch(error => {
    console.error('Failed to initialize database connection:', error);
    // process.exit(1); // Do not exit, keep server running for health checks
  });

  const schema = makeExecutableSchema({ typeDefs, resolvers });

  // Set up WebSocket Server
  const wsServer = new WebSocketServer({
    server: httpServer,
    path: '/graphql',
  });

  const serverCleanup = useServer(
    { 
      schema,
      context: async (ctx) => {
        return getContext({ connectionParams: ctx.connectionParams });
      }
    }, 
    wsServer
  );

  // Initialize Apollo Server
  const server = new ApolloServer({
    schema,
    plugins: [
      // Proper shutdown for the HTTP server
      ApolloServerPluginDrainHttpServer({ httpServer }),
      // Proper shutdown for the WebSocket server
      {
        async serverWillStart() {
          return {
            async drainServer() {
              await serverCleanup.dispose();
            },
          };
        },
      },
    ],
  });

  await server.start();

  // Apply middleware
  app.use(
    '/graphql',
    // cors() is already applied globally in app.js with correct config
    expressMiddleware(server, {
      context: async ({ req }) => getContext({ req }),
    })
  );

  // 404 catch-all
  app.use((req, res) => {
    console.log(`404 Not Found: ${req.method} ${req.originalUrl}`);
    res.status(404).json({ status: 'error', message: 'Route not found', path: req.originalUrl });
  });

  // Re-attach error handling middleware at the end
  app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
      status: 'error',
      message: 'Internal Server Error',
    });
  });

  // Start listening
  httpServer.listen(PORT, () => {
    console.log(`🚀 Server ready at http://localhost:${PORT}/graphql`);
    console.log(`🚀 Subscriptions ready at ws://localhost:${PORT}/graphql`);
    console.log(`Health check at http://localhost:${PORT}/`);
  });
}

startServer();
