import { ObservabilityLogger } from '@/observability/interfaces/observability-provider.interface';

interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  service: string;
  correlationId?: string | undefined;
  context?: Record<string, any> | undefined;
  error?: {
    name: string;
    message: string;
    stack?: string;
  } | undefined;
}

export class OtelLogger implements ObservabilityLogger {
  private bindings: Record<string, any> = {};

  constructor(
    private readonly serviceName: string,
    private readonly logLevel: 'debug' | 'info' | 'warn' | 'error' = 'info'
  ) {}

  debug(message: string, context?: Record<string, any>): void {
    if (this.shouldLog('debug')) {
      this.writeLog('debug', message, context);
    }
  }

  info(message: string, context?: Record<string, any>): void {
    if (this.shouldLog('info')) {
      this.writeLog('info', message, context);
    }
  }

  warn(message: string, context?: Record<string, any>): void {
    if (this.shouldLog('warn')) {
      this.writeLog('warn', message, context);
    }
  }

  error(message: string, error?: Error, context?: Record<string, any>): void {
    if (this.shouldLog('error')) {
      const errorContext = error ? {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
      } : {};
      
      this.writeLog('error', message, { ...context, ...errorContext });
    }
  }


  private shouldLog(level: 'debug' | 'info' | 'warn' | 'error'): boolean {
    const levels = ['debug', 'info', 'warn', 'error'];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex >= currentLevelIndex;
  }

  private writeLog(
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    context?: Record<string, any>
  ): void {
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: this.serviceName,
      correlationId: this.getCorrelationIdFromContext(),
      context: { ...this.bindings, ...context },
    };

    // Extract error information if present
    if (context?.['error']) {
      logEntry.error = context['error'];
      delete logEntry.context!['error'];
    }

    // Format for structured logging (JSON)
    const logLine = JSON.stringify(logEntry);

    // Output to appropriate stream
    if (level === 'error') {
      console.error(logLine);
    } else if (level === 'warn') {
      console.warn(logLine);
    } else {
      console.log(logLine);
    }
  }

  private getCorrelationIdFromContext(): string | undefined {
    // In a real implementation, this would extract correlation ID from OpenTelemetry context
    // For now, we'll check if it's in our bindings
    return this.bindings['correlationId'] as string | undefined;
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
      this.error(message, undefined, context);
    }
  }

  logHealthCheck(component: string, healthy: boolean, responseTime: number): void {
    const level = healthy ? 'info' : 'warn';
    const message = `Health check ${healthy ? 'passed' : 'failed'} for ${component}`;

    this[level](message, {
      operation: 'health_check',
      component,
      healthy,
      response_time_ms: responseTime,
    });
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
      uptime_seconds: process.uptime(),
    });
  }
}