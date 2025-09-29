import pino from 'pino';
import { randomUUID } from 'crypto';

export interface Logger {
  info(message: string, context?: object): void;
  warn(message: string, context?: object): void;
  error(message: string, context?: object): void;
  debug(message: string, context?: object): void;
}

export class PinoLogger implements Logger {
  private logger: pino.Logger;

  constructor() {
    const logLevel = process.env.LOG_LEVEL || 'info';

    this.logger = pino({
      level: logLevel,
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        level: (label) => ({ level: label }),
      },
      base: {
        service: 'tug-klinikum-api',
        version: '1.0.0',
        pid: process.pid,
      },
      ...(process.env.NODE_ENV === 'development' && {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        },
      }),
    });
  }

  info(message: string, context?: object): void {
    this.logger.info(context || {}, message);
  }

  warn(message: string, context?: object): void {
    this.logger.warn(context || {}, message);
  }

  error(message: string, context?: object): void {
    this.logger.error(context || {}, message);
  }

  debug(message: string, context?: object): void {
    this.logger.debug(context || {}, message);
  }

  // API-specific logging methods
  logApiRequest(method: string, path: string, statusCode: number, duration: number, context?: object): void {
    this.info('API request completed', {
      http: {
        method,
        path,
        status_code: statusCode,
        duration_ms: duration,
      },
      ...context,
    });
  }

  logRateLimit(ip: string, path: string, limit: number, remaining: number): void {
    this.warn('Rate limit warning', {
      client_ip: ip,
      path,
      rate_limit: {
        limit,
        remaining,
      },
    });
  }

  logRateLimitExceeded(ip: string, path: string, limit: number): void {
    this.warn('Rate limit exceeded', {
      client_ip: ip,
      path,
      rate_limit: {
        limit,
        exceeded: true,
      },
    });
  }

  logValidationError(path: string, errors: string[], context?: object): void {
    this.warn('Validation error', {
      path,
      validation_errors: errors,
      ...context,
    });
  }

  logDatabaseOperation(operation: string, duration: number, success: boolean, context?: object): void {
    this.info('Database operation', {
      database: {
        operation,
        duration_ms: duration,
        success,
      },
      ...context,
    });
  }
}

// Utility function to create correlation IDs
export function createCorrelationId(): string {
  return randomUUID();
}