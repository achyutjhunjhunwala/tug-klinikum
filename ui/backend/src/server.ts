import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from root level .env file
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// Initialize telemetry early
import { initializeTelemetry, shutdownTelemetry } from './observability';
initializeTelemetry();

import App from './app';
import { PinoLogger } from './observability';

const PORT = process.env.PORT || 4000;

let app: App;
const logger = new PinoLogger();

async function startServer() {
  try {
    logger.info('Starting TUG-Klinikum API Server...', { port: PORT });

    app = new App();
    await app.initialize();

    const server = app.express.listen(PORT, () => {
      logger.info('API Server started successfully', {
        port: PORT,
        endpoints: {
          health: `http://localhost:${PORT}/health`,
          api: `http://localhost:${PORT}/api`,
        },
        security: {
          rateLimit: '20 requests/minute per IP',
        },
      });
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info('Starting graceful shutdown', { signal });

      server.close(async () => {
        logger.info('HTTP server closed');

        if (app) {
          await app.shutdown();
        }

        // Shutdown telemetry
        await shutdownTelemetry();

        logger.info('Graceful shutdown completed');
        process.exit(0);
      });

      // Force shutdown after 10 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection', { reason: String(reason), promise });
      process.exit(1);
    });

  } catch (error) {
    logger.error('Failed to start server', {
      error: error instanceof Error ? error.message : String(error)
    });
    process.exit(1);
  }
}

// Start the server
startServer();