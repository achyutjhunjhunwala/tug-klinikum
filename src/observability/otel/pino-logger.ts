import pino from 'pino';
import * as fs from 'fs';
import * as path from 'path';
// @ts-ignore: No types available for pino-roll
import { createWriteStream } from 'pino-roll';
import { ObservabilityLogger } from '@/observability/interfaces/observability-provider.interface';

export class PinoLogger implements ObservabilityLogger {
  private readonly logger: pino.Logger;
  private readonly isProduction: boolean;
  private bindings: Record<string, any> = {};

  constructor(
    private readonly serviceName: string,
    private readonly serviceVersion: string,
    private readonly environment: string = 'development',
    logLevel: 'debug' | 'info' | 'warn' | 'error' = 'info'
  ) {
    this.isProduction = environment === 'production';

    // Ensure logs directory exists
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    // Create rotating log file stream
    const logFile = path.join(logsDir, `${serviceName}.log`);
    const rotatingStream = createWriteStream({
      file: logFile,
      size: '100MB', // Rotate when file reaches 100MB
      frequency: 'daily', // Also rotate daily
      extension: '.%DATE%.log', // Add date to rotated files
      limit: {
        count: 5, // Keep max 5 files (5 days worth)
      },
    });

    this.logger = pino(
      {
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
        timestamp: () => `,\"@timestamp\":\"${new Date().toISOString()}\"`,
        messageKey: 'message', // Use 'message' instead of 'msg'
        formatters: {
          level: label => {
            return {
              level: label,
              'log.level': label, // Add log.level for Elastic compatibility
            };
          },
        },
      },
      pino.multistream([
        { stream: process.stdout }, // Console output
        { stream: rotatingStream }, // Rotating file output for Filebeat
      ])
    );
  }

  /**
   * DEBUG: Only for development - detailed operation steps
   * Use sparingly and never in production for performance
   */
  debug(message: string, context?: Record<string, any>): void {
    if (this.isProduction) return; // Skip debug logs in production
    this.logger.debug({ ...this.bindings, ...context }, message);
  }

  /**
   * INFO: Important business events and system state changes
   * Production: Only for significant events (startup, shutdown, successful operations)
   */
  info(message: string, context?: Record<string, any>): void {
    this.logger.info({ ...this.bindings, ...context }, message);
  }

  /**
   * WARN: Recoverable errors, performance degradation, retry attempts
   * Important for production alerting and monitoring
   */
  warn(message: string, context?: Record<string, any>): void {
    this.logger.warn({ ...this.bindings, ...context }, message);
  }

  /**
   * ERROR: All failures, exceptions, and critical issues
   * Always logged in production - critical for operations
   */
  error(message: string, error?: Error, context?: Record<string, any>): void {
    if (error) {
      this.logger.error(
        {
          ...this.bindings,
          ...context,
          err: {
            name: error.name,
            message: error.message,
            stack: error.stack,
          },
        },
        message
      );
    } else {
      this.logger.error({ ...this.bindings, ...context }, message);
    }
  }

  // === PRODUCTION-FOCUSED LOGGING METHODS ===

  /**
   * Log application lifecycle events - always important
   */
  logApplicationStart(): void {
    this.info('Application starting', {
      operation: 'application_start',
      node_version: process.version,
      pid: process.pid,
      environment: this.environment,
    });
  }

  logApplicationShutdown(): void {
    this.info('Application shutting down', {
      operation: 'application_shutdown',
      uptime_seconds: process.uptime(),
    });
  }

  /**
   * Log scraping operations - focused on business outcomes
   */
  logScrapingStart(url: string, correlationId: string): void {
    // Only log start in development for debugging
    if (!this.isProduction) {
      this.debug('Starting scraping operation', {
        operation: 'scraping_start',
        target_url: url,
        correlationId,
      });
    }
  }

  logScrapingSuccess(
    url: string,
    duration: number,
    data: { waitTime?: number; patientCount?: number; retryCount?: number }
  ): void {
    // Always log successful business operations
    this.info('Scraping completed successfully', {
      operation: 'scraping_success',
      target_url: url,
      duration_ms: duration,
      business_data: {
        wait_time: data.waitTime,
        patient_count: data.patientCount,
      },
      retry_count: data.retryCount || 0,
    });
  }

  logScrapingError(url: string, duration: number, error: Error, retryCount: number = 0): void {
    // Always log errors - critical for production monitoring
    this.error('Scraping operation failed', error, {
      operation: 'scraping_error',
      target_url: url,
      duration_ms: duration,
      retry_count: retryCount,
      error_category: this.categorizeError(error),
    });
  }

  logScrapingRetry(url: string, attempt: number, reason: string): void {
    // Log retries as warnings - important for monitoring reliability
    this.warn('Scraping operation retry', {
      operation: 'scraping_retry',
      target_url: url,
      attempt_number: attempt,
      retry_reason: reason,
    });
  }

  /**
   * Log database operations - focused on performance and reliability
   */
  logDatabaseOperation(
    operation: string,
    success: boolean,
    duration: number,
    recordCount?: number
  ): void {
    const context = {
      operation_type: 'database_operation',
      db_operation: operation,
      success,
      duration_ms: duration,
      record_count: recordCount,
    };

    if (success) {
      // Only log successful DB operations in development
      if (!this.isProduction) {
        this.debug(`Database operation completed: ${operation}`, context);
      }
    } else {
      // Always log database failures
      this.error(`Database operation failed: ${operation}`, undefined, context);
    }
  }

  logDatabaseError(operation: string, error: Error, duration: number): void {
    // Always log database errors - critical for production
    this.error('Database operation error', error, {
      operation_type: 'database_error',
      db_operation: operation,
      duration_ms: duration,
      error_category: this.categorizeError(error),
    });
  }

  /**
   * Log health checks - important for monitoring
   */
  logHealthCheck(component: string, healthy: boolean, responseTime: number): void {
    const context = {
      operation: 'health_check',
      component,
      healthy,
      response_time_ms: responseTime,
    };

    if (healthy) {
      // Only log successful health checks in development
      if (!this.isProduction) {
        this.debug(`Health check passed for ${component}`, context);
      }
    } else {
      // Always log health check failures
      this.error(`Health check failed for ${component}`, undefined, context);
    }
  }

  /**
   * Log browser events - focused on performance and crashes
   */
  logBrowserLaunch(browserType: string, duration: number): void {
    if (!this.isProduction) {
      this.debug('Browser launched', {
        operation: 'browser_launch',
        browser_type: browserType,
        duration_ms: duration,
      });
    }
  }

  logBrowserCrash(reason: string, context?: Record<string, any>): void {
    // Always log browser crashes - critical production issue
    this.error('Browser crashed', undefined, {
      operation: 'browser_crash',
      crash_reason: reason,
      ...context,
    });
  }

  logBrowserError(error: Error, context?: Record<string, any>): void {
    // Always log browser errors
    this.error('Browser error occurred', error, {
      operation: 'browser_error',
      error_category: this.categorizeError(error),
      ...context,
    });
  }

  /**
   * Log performance issues - important for production monitoring
   */
  logPerformanceIssue(operation: string, duration: number, threshold: number): void {
    this.warn('Performance threshold exceeded', {
      operation: 'performance_issue',
      affected_operation: operation,
      duration_ms: duration,
      threshold_ms: threshold,
      exceeded_by_ms: duration - threshold,
    });
  }

  /**
   * Log data quality issues - important for business monitoring
   */
  logDataQualityIssue(issue: string, data: Record<string, any>): void {
    this.warn('Data quality issue detected', {
      operation: 'data_quality_issue',
      issue_type: issue,
      affected_data: data,
    });
  }

  // === UTILITY METHODS ===

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

  /**
   * Categorize errors for better alerting and monitoring
   */
  private categorizeError(error: Error): string {
    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();

    // Network-related errors
    if (message.includes('timeout') || message.includes('network') || name.includes('timeout')) {
      return 'network';
    }

    // Browser-related errors
    if (message.includes('browser') || message.includes('page') || message.includes('playwright')) {
      return 'browser';
    }

    // Database-related errors
    if (
      message.includes('elasticsearch') ||
      message.includes('connection') ||
      name.includes('connection')
    ) {
      return 'database';
    }

    // Parsing/data errors
    if (message.includes('parse') || message.includes('validation') || message.includes('schema')) {
      return 'data_parsing';
    }

    // System errors
    if (message.includes('memory') || message.includes('cpu') || name.includes('system')) {
      return 'system';
    }

    return 'unknown';
  }
}
