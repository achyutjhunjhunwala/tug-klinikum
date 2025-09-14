import pino from 'pino';
import * as fs from 'fs';
import * as path from 'path';
import { ObservabilityLogger } from '@/observability/interfaces/observability-provider.interface';

export class PinoLogger implements ObservabilityLogger {
  private readonly logger: pino.Logger;
  private bindings: Record<string, any> = {};

  constructor(
    private readonly serviceName: string,
    private readonly serviceVersion: string,
    private readonly environment: string = 'development',
    logLevel: 'debug' | 'info' | 'warn' | 'error' = 'info'
  ) {
    // Ensure logs directory exists
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    // Create log file path
    const logFile = path.join(logsDir, `${serviceName}.log`);

    this.logger = pino({
      level: logLevel,
      base: {
        // Use ECS-compliant service field structure
        service: {
          name: serviceName,
          version: serviceVersion,
        },
        host: {
          name: require('os').hostname(),
        },
        process: {
          pid: process.pid,
        },
        // Use app_* prefix to avoid conflicts with ECS fields
        app_labels: {
          environment,
          application: serviceName,
        },
      },
      timestamp: () => `,"@timestamp":"${new Date().toISOString()}"`,
      messageKey: 'message', // Use 'message' instead of 'msg'
      formatters: {
        level: (label) => {
          return { 
            level: label,
            'log.level': label  // Add log.level for Elastic compatibility
          };
        },
      },
    }, pino.multistream([
      { stream: process.stdout }, // Console output
      { stream: pino.destination(logFile) } // File output for Filebeat
    ]));
  }

  debug(message: string, context?: Record<string, any>): void {
    this.logger.debug({ ...this.bindings, ...context }, message);
  }

  info(message: string, context?: Record<string, any>): void {
    this.logger.info({ ...this.bindings, ...context }, message);
  }

  warn(message: string, context?: Record<string, any>): void {
    this.logger.warn({ ...this.bindings, ...context }, message);
  }

  error(message: string, error?: Error, context?: Record<string, any>): void {
    if (error) {
      this.logger.error({ 
        ...this.bindings, 
        ...context,
        err: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        }
      }, message);
    } else {
      this.logger.error({ ...this.bindings, ...context }, message);
    }
  }

  // Utility methods for binding context
  withContext(context: Record<string, any>): PinoLogger {
    const newLogger = new PinoLogger(
      this.serviceName,
      this.serviceVersion,
      this.environment,
      this.logger.level as any
    );
    newLogger.bindings = { ...this.bindings, ...context };
    return newLogger;
  }

  // Utility methods for structured logging patterns
  logScrapingStart(url: string, correlationId: string): void {
    this.info('Starting scraping operation', {
      operation: 'scraping_start',
      target_url: url,
      correlationId,
    });
  }

  logScrapingSuccess(url: string, duration: number, recordCount: number): void {
    this.info('Scraping operation completed successfully', {
      operation: 'scraping_success',
      target_url: url,
      duration_ms: duration,
      records_found: recordCount,
    });
  }

  logScrapingError(url: string, duration: number, error: Error): void {
    this.error('Scraping operation failed', error, {
      operation: 'scraping_error',
      target_url: url,
      duration_ms: duration,
    });
  }

  logDatabaseOperation(operation: string, success: boolean, duration: number): void {
    const message = success ? 
      `Database operation completed: ${operation}` : 
      `Database operation failed: ${operation}`;

    const context = {
      operation_type: 'database_operation',
      db_operation: operation,
      success,
      duration_ms: duration,
    };

    if (success) {
      this.info(message, context);
    } else {
      this.warn(message, context);
    }
  }

  logApplicationStart(): void {
    this.info('Application starting', {
      operation: 'application_start',
      node_version: process.version,
      pid: process.pid,
    });
  }

  logApplicationShutdown(): void {
    this.info('Application shutting down', {
      operation: 'application_shutdown',
    });
  }

  logHealthCheck(component: string, healthy: boolean, responseTime: number): void {
    const message = `Health check ${healthy ? 'passed' : 'failed'} for ${component}`;
    const context = {
      operation: 'health_check',
      component,
      healthy,
      response_time_ms: responseTime,
    };

    if (healthy) {
      this.info(message, context);
    } else {
      this.warn(message, context);
    }
  }
}
