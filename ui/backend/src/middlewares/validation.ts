import { Request, Response, NextFunction } from 'express';
import { query, validationResult } from 'express-validator';
import { ApiErrorResponse } from '../types/hospital';
import { PinoLogger } from '../observability';

// Validation rules for hospital metrics endpoint
export const validateMetricsQuery = [
  query('department')
    .isIn(['adult', 'children'])
    .withMessage('Department must be either "adult" or "children"'),

  query('timeRange')
    .isIn(['6h', '24h', '7d', '15d', '1m', '3m'])
    .withMessage('Time range must be one of: 6h, 24h, 7d, 15d, 1m, 3m'),

  query('from')
    .optional()
    .isISO8601()
    .withMessage('From date must be a valid ISO 8601 timestamp'),

  query('to')
    .optional()
    .isISO8601()
    .withMessage('To date must be a valid ISO 8601 timestamp'),

  // Custom validation: if 'from' is provided, 'to' must also be provided
  query('to').custom((value, { req }) => {
    if (req.query?.from && !value) {
      throw new Error('To date is required when from date is provided');
    }
    if (!req.query?.from && value) {
      throw new Error('From date is required when to date is provided');
    }
    return true;
  }),

  // Custom validation: ensure 'from' is before 'to'
  query('from').custom((value, { req }) => {
    if (value && req.query?.to) {
      const fromDate = new Date(value);
      const toDate = new Date(req.query.to as string);

      if (fromDate >= toDate) {
        throw new Error('From date must be before to date');
      }

      // Ensure the time range is not more than 3 months
      const diffMs = toDate.getTime() - fromDate.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);

      if (diffDays > 90) {
        throw new Error('Time range cannot exceed 90 days');
      }
    }
    return true;
  })
];

// Middleware to handle validation errors
export const handleValidationErrors = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const logger = new PinoLogger();
    const errorMessages = errors.array().map(error => error.msg);

    logger.logValidationError(req.path, errorMessages, {
      query: req.query,
      method: req.method
    });

    const errorResponse: ApiErrorResponse = {
      error: 'ValidationError',
      message: errorMessages.join(', '),
      timestamp: new Date().toISOString(),
      path: req.path,
      statusCode: 400
    };

    return res.status(400).json(errorResponse);
  }

  next();
};