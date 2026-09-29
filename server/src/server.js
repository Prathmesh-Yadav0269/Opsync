import http from 'http';
import app from './app.js';
import { connectDB } from './config/db.js';
import { env } from './config/env.js';
import { initSocketServer } from './sockets/index.js';

const startServer = async () => {
  // Connect to database before accepting incoming connections
  await connectDB();

  // Create shared HTTP server for Express and Socket.IO
  const httpServer = http.createServer(app);

  // Initialize Socket.IO on the shared HTTP server
  initSocketServer(httpServer);

  httpServer.listen(env.PORT, () => {
    console.log(
      `[SERVER] OPSYNC backend running on port ${env.PORT} in ${env.NODE_ENV} mode with Socket.IO enabled`
    );
  });

  const shutdown = (signal) => {
    console.log(`\n[SERVER] ${signal} received. Closing HTTP server gracefully...`);
    httpServer.close(() => {
      console.log('[SERVER] HTTP server closed. Exiting process.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (err) => {
    console.error(`[UNHANDLED REJECTION] ${err.name}: ${err.message}`);
    httpServer.close(() => process.exit(1));
  });

  process.on('uncaughtException', (err) => {
    console.error(`[UNCAUGHT EXCEPTION] ${err.name}: ${err.message}`);
    process.exit(1);
  });
};

startServer();
