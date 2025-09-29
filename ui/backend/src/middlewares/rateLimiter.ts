import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { RateLimitErrorResponse } from '../types/hospital';
import { PinoLogger } from '../observability';

// Rate limiter configuration
const createRateLimiter = () => {
  const logger = new PinoLogger();
  const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'); // 1 minute
  const maxRequests = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '20'); // 20 requests

  return rateLimit({
    windowMs,
    max: maxRequests,

    // Use standardHeaders to include rate limit info in response headers
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers

    // Custom key generator - can be enhanced for user-based limiting
    keyGenerator: (req: Request) => {
      // For now, use IP address. Can be enhanced to use user ID if authentication is added
      return req.ip || req.connection.remoteAddress || 'unknown';
    },

    // Skip rate limiting for health checks
    skip: (req: Request) => {
      return req.path === '/health' || req.path === '/api/health';
    },

    // Custom message when rate limit is exceeded
    message: {
      error: 'Rate limit exceeded',
      message: 'Too many requests from this IP, please try again later',
      retryAfter: Math.ceil(windowMs / 1000), // Convert to seconds
      limit: maxRequests
    },

    // Custom handler for when limit is exceeded
    handler: (req: Request, res: Response) => {
      const clientIp = req.ip || req.connection.remoteAddress || 'unknown';

      logger.logRateLimitExceeded(clientIp, req.path, maxRequests);

      const response: RateLimitErrorResponse = {
        error: 'Rate limit exceeded',
        message: 'Too many requests from this IP, please try again later',
        timestamp: new Date().toISOString(),
        path: req.path,
        statusCode: 429,
        retryAfter: Math.ceil(windowMs / 1000),
        limit: maxRequests,
        remaining: 0
      };

      res.status(429).json(response);
    },

    // When to reset the rate limit window
    skipSuccessfulRequests: process.env.RATE_LIMIT_SKIP_SUCCESSFUL === 'true',
    skipFailedRequests: false, // Count failed requests towards the limit
  });
};

export const rateLimiter = createRateLimiter();

// Export for testing
export { createRateLimiter };