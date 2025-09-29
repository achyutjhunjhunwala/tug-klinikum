import helmet from 'helmet';
import { Request, Response, NextFunction } from 'express';

// Determine if we're in production with HTTPS
const useHttps = process.env.USE_HTTPS === 'true';

// Security headers configuration
export const securityMiddleware = helmet({
  // Content Security Policy
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // Required for inline styles
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "data:"], // Allow data: URIs for fonts
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: useHttps ? [] : null, // Only upgrade if using HTTPS
    },
  },

  // HTTP Strict Transport Security - only enable with HTTPS
  hsts: useHttps ? {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  } : false,

  // Disable X-Powered-By header (hides Express)
  hidePoweredBy: true,

  // X-Frame-Options - prevent clickjacking
  frameguard: { action: 'deny' },

  // X-Content-Type-Options - prevent MIME sniffing
  noSniff: true,

  // X-Download-Options - prevent opening in IE
  ieNoOpen: true,

  // X-DNS-Prefetch-Control
  dnsPrefetchControl: { allow: false },

  // Referrer Policy
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  
  // Cross-origin policies - conditional based on HTTPS
  crossOriginOpenerPolicy: useHttps ? { policy: 'same-origin' } : false,
  crossOriginResourcePolicy: useHttps ? { policy: 'same-origin' } : false,
  crossOriginEmbedderPolicy: false, // Keep disabled as it's very strict
  originAgentCluster: false, // Disabled for compatibility
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

// Log security configuration on startup
console.log('🔒 Security Configuration:', {
  nodeEnv: process.env.NODE_ENV,
  useHttps: useHttps,
  hsts: useHttps ? 'enabled' : 'disabled',
  crossOriginPolicies: useHttps ? 'strict' : 'relaxed',
  csp: 'enabled',
  message: useHttps 
    ? '✅ Production-grade security headers enabled' 
    : '⚠️  HTTP mode - some security features disabled for compatibility'
});