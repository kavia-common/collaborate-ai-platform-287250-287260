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

const PORT = process.env.PORT || 3001;

async function startServer() {
  // Create HTTP server from Express app
  const httpServer = createServer(app);

  // minimal schema and resolvers
  const typeDefs = `#graphql
    type Query {
      hello: String
      health: String
    }
    type Subscription {
      serverStatus: String
    }
  `;

  const resolvers = {
    Query: {
      hello: () => 'Hello from Apollo Server',
      health: () => 'OK',
    },
    Subscription: {
      serverStatus: {
        subscribe: async function* () {
          yield { serverStatus: 'Connected' };
        },
      },
    },
  };

  const schema = makeExecutableSchema({ typeDefs, resolvers });

  // Set up WebSocket Server
  const wsServer = new WebSocketServer({
    server: httpServer,
    path: '/graphql',
  });

  const serverCleanup = useServer({ schema }, wsServer);

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
    cors(), // Allow CORS for GraphQL endpoint
    expressMiddleware(server, {
      // Context placeholder for authentication
      context: async ({ req }) => {
        // Placeholder: Retrieve token from headers and verify
        const token = req.headers.authorization || '';
        return { token };
      },
    })
  );

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
