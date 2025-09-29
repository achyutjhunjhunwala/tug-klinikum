import { Request, Response, NextFunction } from 'express';
import { ApiErrorResponse } from '../types/hospital';
import { PinoLogger } from '../observability';

// Global error handler middleware
export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const logger = new PinoLogger();
  logger.error('API Error', {
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
    userAgent: req.get('User-Agent')
  });

  // Default error response
  let statusCode = 500;
  let message = 'Internal server error';

  // Handle specific error types
  if (error.name === 'ValidationError') {
    statusCode = 400;
    message = error.message || 'Validation failed';
  } else if (error.name === 'UnauthorizedError') {
    statusCode = 401;
    message = 'Unauthorized';
  } else if (error.name === 'ForbiddenError') {
    statusCode = 403;
    message = 'Forbidden';
  } else if (error.name === 'NotFoundError') {
    statusCode = 404;
    message = 'Resource not found';
  } else if (error.message.includes('CORS')) {
    statusCode = 403;
    message = 'CORS policy violation';
  }

  const errorResponse: ApiErrorResponse = {
    error: error.name || 'ServerError',
    message,
    timestamp: new Date().toISOString(),
    path: req.path,
    statusCode
  };

  // Don't expose internal error details in production
  if (process.env.NODE_ENV === 'production' && statusCode === 500) {
    errorResponse.message = 'Internal server error';
  }

  res.status(statusCode).json(errorResponse);
};

// 404 handler for unmatched routes
export const notFoundHandler = (req: Request, res: Response) => {
  const errorResponse: ApiErrorResponse = {
    error: 'NotFound',
    message: `Route ${req.method} ${req.path} not found`,
    timestamp: new Date().toISOString(),
    path: req.path,
    statusCode: 404
  };

  res.status(404).json(errorResponse);
};