import express from 'express';
import morgan from 'morgan';
import path from 'path';

// Import middlewares
import { corsMiddleware } from './middlewares/cors';
import { rateLimiter } from './middlewares/rateLimiter';
import { securityMiddleware, timeoutMiddleware } from './middlewares/security';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';

// Import routes
import { apiRoutes } from './routes';
import { initializeHospitalController } from './routes/hospital';

// Import observability
import { PinoLogger } from './observability';

class App {
  public express: express.Application;
  private hospitalController: any;
  private logger: PinoLogger;

  constructor() {
    this.express = express();
    this.logger = new PinoLogger();
    this.setupMiddlewares();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddlewares(): void {
    // Security middleware (should be first)
    this.express.use(securityMiddleware);

    // Request timeout
    this.express.use(timeoutMiddleware);

    // CORS
    this.express.use(corsMiddleware);

    // Rate limiting (after CORS to ensure preflight requests work)
    this.express.use(rateLimiter);

    // Body parsing
    const maxSize = process.env.MAX_REQUEST_SIZE || '1mb';
    this.express.use(express.json({ limit: maxSize }));
    this.express.use(express.urlencoded({ extended: true, limit: maxSize }));

    // Logging
    const logFormat = process.env.NODE_ENV === 'production' ? 'combined' : 'dev';
    this.express.use(morgan(logFormat));

    // Trust proxy (for rate limiting with correct IP addresses)
    this.express.set('trust proxy', 1);
  }

  private setupRoutes(): void {
    // Health check endpoint (before rate limiting)
    this.express.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        memory: process.memoryUsage(),
        pid: process.pid
      });
    });

    // API routes
    this.express.use('/api', apiRoutes);

    // Serve static frontend files in production
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction) {
      const frontendPath = path.join(__dirname, '../../frontend/dist');
      this.logger.info(`Serving frontend from: ${frontendPath}`);

      // Serve static files
      this.express.use(express.static(frontendPath));

      // Handle SPA routing - send all non-API requests to index.html
      this.express.get('*', (req, res, next) => {
        // Skip if it's an API route
        if (req.path.startsWith('/api') || req.path.startsWith('/health')) {
          return next();
        }
        res.sendFile(path.join(frontendPath, 'index.html'));
      });
    } else {
      // Development mode - just show API info at root
      this.express.get('/', (req, res) => {
        res.json({
          message: 'TUG-Klinikum Hospital API Server',
          status: 'running',
          version: '1.0.0',
          mode: 'development',
          docs: '/api',
          note: 'Frontend served separately on port 3001 in development'
        });
      });
    }
  }

  private setupErrorHandling(): void {
    // 404 handler for unmatched routes
    this.express.use(notFoundHandler);

    // Global error handler (must be last)
    this.express.use(errorHandler);
  }

  public async initialize(): Promise<void> {
    try {
      // Initialize hospital controller and database connection
      this.hospitalController = await initializeHospitalController();
      this.logger.info('Hospital controller initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize hospital controller', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  public async shutdown(): Promise<void> {
    try {
      if (this.hospitalController) {
        await this.hospitalController.shutdown();
        this.logger.info('Hospital controller shut down gracefully');
      }
    } catch (error) {
      this.logger.error('Error during shutdown', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

export default App;