import helmet from 'helmet';
import { Request, Response, NextFunction } from 'express';

// Security headers configuration
export const securityMiddleware = helmet({
  // Content Security Policy
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },

  // HTTP Strict Transport Security
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  },

  // Disable X-Powered-By header
  hidePoweredBy: true,

  // X-Frame-Options
  frameguard: { action: 'deny' },

  // X-Content-Type-Options
  noSniff: true,

  // Referrer Policy
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
});

// Request timeout middleware
export const timeoutMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const timeout = parseInt(process.env.API_TIMEOUT_MS || '30000');

  req.setTimeout(timeout, () => {
    if (!res.headersSent) {
      res.status(408).json({
        error: 'Request timeout',
        message: 'Request took too long to process',
        timestamp: new Date().toISOString(),
        path: req.path,
        statusCode: 408
      });
    }
  });

  next();
};

// Request size limiting middleware
export const requestSizeMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const maxSize = process.env.MAX_REQUEST_SIZE || '1mb';

  // This is handled by express.json() limit option, but we can add additional validation here
  next();
};