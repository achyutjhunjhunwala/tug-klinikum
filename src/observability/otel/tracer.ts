import { trace, SpanStatusCode, SpanKind } from '@opentelemetry/api';
import type { Tracer, Span, SpanOptions } from '@opentelemetry/api';
import { ObservabilityTracer } from '@/observability/interfaces/observability-provider.interface';

export class OtelTracer implements ObservabilityTracer {
  private readonly tracer: Tracer;

  constructor(serviceName: string) {
    this.tracer = trace.getTracer(serviceName);
  }

  startSpan(name: string, options?: SpanOptions): Span {
    return this.tracer.startSpan(name, {
      kind: SpanKind.INTERNAL,
      ...options,
    });
  }

  startActiveSpan<F extends (span: Span) => ReturnType<F>>(
    name: string,
    fnOrOptions?: F | SpanOptions,
    maybeFn?: F
  ): ReturnType<F> {
    if (typeof fnOrOptions === 'function') {
      return this.tracer.startActiveSpan(name, fnOrOptions);
    }

    const options = fnOrOptions || {};
    const fn = maybeFn!;

    return this.tracer.startActiveSpan(
      name,
      {
        kind: SpanKind.INTERNAL,
        ...options,
      },
      fn
    );
  }

  /**
   * Professional exception recording with comprehensive error context
   */
  recordException(span: Span, exception: Error, context?: Record<string, any>): void {
    // Record the exception using OTEL's built-in method
    span.recordException(exception);

    // Add comprehensive error attributes
    span.setAttributes({
      'error.type': exception.name,
      'error.message': exception.message,
      'error.stack': exception.stack || 'no stack trace',
      'error.timestamp': Date.now(),
      ...context,
    });

    // Set span status to error
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: exception.message,
    });
  }

  /**
   * Set span status with proper error codes
   */
  setSpanStatus(span: Span, status: 'ok' | 'error', message?: string): void {
    const spanStatus = status === 'ok' ? SpanStatusCode.OK : SpanStatusCode.ERROR;
    if (message !== undefined) {
      span.setStatus({ code: spanStatus, message });
    } else {
      span.setStatus({ code: spanStatus });
    }
  }

  /**
   * Enhanced async operation wrapper with comprehensive error handling
   */
  async wrapAsync<T>(
    name: string,
    operation: (span: Span) => Promise<T>,
    options?: SpanOptions
  ): Promise<T> {
    const enhancedOptions = {
      ...options,
      attributes: {
        ...options?.attributes,
        'transaction.type': this.getTransactionType(name),
      },
    };

    return this.startActiveSpan(name, enhancedOptions, async span => {
      const startTime = Date.now();

      try {
        // Add standard span attributes
        span.setAttributes({
          'operation.name': name,
          'operation.start_time': startTime,
          'transaction.type': this.getTransactionType(name),
        });

        const result = await operation(span);

        // Record success metrics
        const duration = Date.now() - startTime;
        span.setAttributes({
          'operation.duration_ms': duration,
          'operation.success': true,
        });

        this.setSpanStatus(span, 'ok');
        return result;
      } catch (error) {
        const duration = Date.now() - startTime;

        // Record failure metrics
        span.setAttributes({
          'operation.duration_ms': duration,
          'operation.success': false,
        });

        // Professional exception recording
        this.recordException(span, error as Error, {
          'operation.phase': 'execution',
          'operation.retry_able': this.isRetryableError(error as Error),
        });

        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Enhanced sync operation wrapper with comprehensive error handling
   */
  wrapSync<T>(name: string, operation: (span: Span) => T, options?: SpanOptions): T {
    const enhancedOptions = {
      ...options,
      attributes: {
        ...options?.attributes,
        'transaction.type': this.getTransactionType(name),
      },
    };

    return this.startActiveSpan(name, enhancedOptions, span => {
      const startTime = Date.now();

      try {
        // Add standard span attributes
        span.setAttributes({
          'operation.name': name,
          'operation.start_time': startTime,
          'transaction.type': this.getTransactionType(name),
        });

        const result = operation(span);

        // Record success metrics
        const duration = Date.now() - startTime;
        span.setAttributes({
          'operation.duration_ms': duration,
          'operation.success': true,
        });

        this.setSpanStatus(span, 'ok');
        return result;
      } catch (error) {
        const duration = Date.now() - startTime;

        // Record failure metrics
        span.setAttributes({
          'operation.duration_ms': duration,
          'operation.success': false,
        });

        // Professional exception recording
        this.recordException(span, error as Error, {
          'operation.phase': 'execution',
          'operation.retry_able': this.isRetryableError(error as Error),
        });

        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Create a span for scraping operations with business context
   */
  createScrapingSpan(operation: string, targetUrl: string, correlationId?: string): Span {
    const span = this.startSpan(`scraping_${operation}`, {
      kind: SpanKind.CLIENT,
      attributes: {
        'http.url': targetUrl,
        'scraping.operation': operation,
        'scraping.target.domain': new URL(targetUrl).hostname,
        'correlation.id': correlationId || 'unknown',
        'scraping.start_time': Date.now(),
      },
    });

    return span;
  }

  /**
   * Create a span for database operations
   */
  createDatabaseSpan(operation: string, collection?: string): Span {
    const spanName = `db_${operation}`;
    const span = this.startSpan(spanName, {
      kind: SpanKind.CLIENT,
      attributes: {
        'db.system': 'elasticsearch',
        'db.operation': operation,
        'db.collection.name': collection || 'unknown',
        'db.start_time': Date.now(),
        'transaction.type': this.getTransactionType(spanName),
      },
    });

    return span;
  }

  /**
   * Create a span for browser operations
   */
  createBrowserSpan(operation: string, browserType: string = 'chromium'): Span {
    const spanName = `browser_${operation}`;
    const span = this.startSpan(spanName, {
      kind: SpanKind.INTERNAL,
      attributes: {
        'browser.type': browserType,
        'browser.operation': operation,
        'browser.start_time': Date.now(),
        'transaction.type': this.getTransactionType(spanName),
      },
    });

    return span;
  }

  /**
   * Add business context to an existing span
   */
  addBusinessContext(
    span: Span,
    context: {
      waitTime?: number;
      patientCount?: number;
      dataQuality?: number;
      retryCount?: number;
    }
  ): void {
    const attributes: Record<string, any> = {};

    if (context.waitTime !== undefined) {
      attributes['business.wait_time_minutes'] = context.waitTime;
    }
    if (context.patientCount !== undefined) {
      attributes['business.patient_count'] = context.patientCount;
    }
    if (context.dataQuality !== undefined) {
      attributes['business.data_quality_score'] = context.dataQuality;
    }
    if (context.retryCount !== undefined) {
      attributes['operation.retry_count'] = context.retryCount;
    }

    span.setAttributes(attributes);
  }

  /**
   * Add performance context to span
   */
  addPerformanceContext(
    span: Span,
    context: {
      memoryUsage?: number;
      cpuUsage?: number;
      networkLatency?: number;
    }
  ): void {
    const attributes: Record<string, any> = {};

    if (context.memoryUsage !== undefined) {
      attributes['performance.memory_usage_bytes'] = context.memoryUsage;
    }
    if (context.cpuUsage !== undefined) {
      attributes['performance.cpu_usage_percent'] = context.cpuUsage;
    }
    if (context.networkLatency !== undefined) {
      attributes['performance.network_latency_ms'] = context.networkLatency;
    }

    span.setAttributes(attributes);
  }

  /**
   * Create a child span within an active span context
   */
  createChildSpan(name: string, attributes?: Record<string, any>): Span {
    const span = this.startSpan(name, {
      attributes: {
        'span.type': 'child',
        'transaction.type': this.getTransactionType(name),
        ...attributes,
      },
    });

    return span;
  }

  /**
   * Wrap retry operations with proper tracing
   */
  async wrapRetryOperation<T>(
    operationName: string,
    operation: () => Promise<T>,
    retryCount: number,
    maxRetries: number
  ): Promise<T> {
    return this.wrapAsync(`retry_${operationName}`, async span => {
      span.setAttributes({
        'retry.attempt': retryCount,
        'retry.max_attempts': maxRetries,
        'retry.is_final_attempt': retryCount >= maxRetries,
      });

      try {
        const result = await operation();
        span.setAttributes({
          'retry.successful': true,
          'retry.attempts_used': retryCount,
        });
        return result;
      } catch (error) {
        span.setAttributes({
          'retry.successful': false,
          'retry.will_retry': retryCount < maxRetries,
        });

        this.recordException(span, error as Error, {
          'retry.attempt': retryCount,
          'retry.max_attempts': maxRetries,
        });

        throw error;
      }
    });
  }

  /**
   * Helper to determine if an error is retryable (for better tracing context)
   */
  private isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();

    // Network timeouts are retryable
    if (message.includes('timeout') || name.includes('timeout')) return true;

    // Network errors are retryable
    if (message.includes('network') || message.includes('enotfound')) return true;

    // Browser crashes are retryable
    if (message.includes('browser') && message.includes('crash')) return true;

    // Database connection errors are retryable
    if (message.includes('connection') && message.includes('refused')) return true;

    // Parse errors are usually not retryable
    if (message.includes('parse') || message.includes('validation')) return false;

    // Authentication errors are not retryable
    if (message.includes('auth') || message.includes('unauthorized')) return false;

    // Default to not retryable for safety
    return false;
  }

  /**
   * Determine transaction type based on operation name for APM categorization
   */
  private getTransactionType(operationName: string): string {
    const operation = operationName.toLowerCase();

    // Application lifecycle operations
    if (
      operation.includes('initialize') ||
      operation.includes('startup') ||
      operation.includes('shutdown')
    ) {
      return 'app-lifecycle';
    }

    // Scraping operations
    if (
      operation.includes('scrap') ||
      operation.includes('extract') ||
      operation.includes('browser') ||
      operation.includes('page')
    ) {
      return 'scraping';
    }

    // Database operations
    if (
      operation.includes('database') ||
      operation.includes('elastic') ||
      operation.includes('insert') ||
      operation.includes('query') ||
      operation.includes('db_')
    ) {
      return 'database';
    }

    // Health check operations
    if (operation.includes('health')) {
      return 'health-check';
    }

    // Scheduling and job operations
    if (operation.includes('schedule') || operation.includes('job') || operation.includes('cron')) {
      return 'scheduling';
    }

    // Retry operations
    if (operation.includes('retry')) {
      return 'retry';
    }

    // Network/HTTP operations
    if (
      operation.includes('http') ||
      operation.includes('request') ||
      operation.includes('fetch')
    ) {
      return 'http';
    }

    // Background tasks
    if (operation.includes('background') || operation.includes('task')) {
      return 'background';
    }

    // Default to custom for application-specific operations
    return 'custom';
  }
}
