import { ObservabilityProvider } from '@/observability';

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors: string[];
}

export interface RetryResult<T> {
  success: boolean;
  data?: T | undefined;
  error?: Error | undefined;
  attempts: number;
  totalTime: number;
}

export class RetryHandler {
  private readonly defaultConfig: RetryConfig = {
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    retryableErrors: [
      'TimeoutError',
      'NetworkError',
      'ConnectionError',
      'ECONNRESET',
      'ETIMEDOUT',
      'ENOTFOUND',
      'ECONNREFUSED',
    ],
  };

  constructor(
    private readonly observability: ObservabilityProvider,
    private readonly config: Partial<RetryConfig> = {}
  ) {}

  async execute<T>(
    operation: () => Promise<T>,
    operationName: string,
    customConfig?: Partial<RetryConfig>
  ): Promise<RetryResult<T>> {
    const finalConfig = { ...this.defaultConfig, ...this.config, ...customConfig };

    return this.observability.tracer.wrapRetryOperation(
      operationName,
      async () => {
        let lastError: Error | undefined;
        let attempt = 0;
        const operationStartTime = Date.now();

        // Production-focused logging - only log retry start for important operations
        if (process.env['NODE_ENV'] !== 'production' || operationName.includes('scraping')) {
          this.observability.logger.info('Starting retry operation', {
            operation: operationName,
            maxAttempts: finalConfig.maxAttempts,
            timeout_config: {
              base_delay_ms: finalConfig.baseDelayMs,
              max_delay_ms: finalConfig.maxDelayMs,
              backoff_multiplier: finalConfig.backoffMultiplier,
            },
          });
        }

        while (attempt < finalConfig.maxAttempts) {
          attempt++;

          try {
            // Use the enhanced tracer for retry operations
            const result = await this.observability.tracer.wrapRetryOperation(
              `${operationName}_attempt`,
              operation,
              attempt,
              finalConfig.maxAttempts
            );

            const totalTime = Date.now() - operationStartTime;

            // Log successful retry completion with business context
            this.observability.logger.info('Retry operation succeeded', {
              operation: operationName,
              attempts_used: attempt,
              total_time_ms: totalTime,
              success_on_attempt: attempt,
            });

            // Record retry success metrics
            this.observability.metrics.recordRecovery(operationName, totalTime);

            return {
              success: true,
              data: result,
              attempts: attempt,
              totalTime,
            };

          } catch (error) {
            lastError = error as Error;
            const isRetryable = this.shouldRetry(lastError, attempt, finalConfig);
            const isFinalAttempt = attempt >= finalConfig.maxAttempts;

            // Enhanced error categorization
            const errorCategory = this.categorizeError(lastError);

            // Log retry attempts with proper levels
            if (isFinalAttempt) {
              // Always log final failures
              this.observability.logger.logScrapingError(
                operationName,
                Date.now() - operationStartTime,
                lastError,
                attempt
              );
            } else if (isRetryable) {
              // Log retries as warnings
              this.observability.logger.logScrapingRetry(
                operationName,
                attempt,
                lastError.message
              );
            } else {
              // Log non-retryable errors immediately
              this.observability.logger.error('Non-retryable error encountered', lastError, {
                operation: operationName,
                attempt,
                error_category: errorCategory,
                retryable: false,
              });
            }

            // Record error metrics by category
            this.observability.metrics.recordError(errorCategory, lastError.name);

            if (!isRetryable || isFinalAttempt) {
              break;
            }

            // Calculate delay with exponential backoff
            const delay = this.calculateDelay(attempt, finalConfig);

            // Only log delay in development
            if (process.env['NODE_ENV'] !== 'production') {
              this.observability.logger.debug('Waiting before retry', {
                operation: operationName,
                attempt,
                delayMs: delay,
                next_attempt: attempt + 1,
              });
            }

            await this.sleep(delay);
          }
        }

        // All attempts failed - handle final failure
        const totalTime = Date.now() - operationStartTime;
        const errorCategory = this.categorizeError(lastError!);

        // Enhanced error recording with comprehensive context
        this.observability.recordError('retry_operation_exhausted', lastError!, {
          operation: operationName,
          attempts_exhausted: attempt,
          total_time_ms: totalTime,
          error_category: errorCategory,
          final_error_name: lastError?.name,
          retryable_errors: finalConfig.retryableErrors.join(','),
        });

        // Record failure metrics
        this.observability.metrics.recordError('retry_exhausted', lastError?.name || 'UnknownError');

        return {
          success: false,
          error: lastError,
          attempts: attempt,
          totalTime,
        };
      },
      0, // Not using the enhanced method's retry count here
      finalConfig.maxAttempts
    );
  }

  /**
   * Enhanced error categorization for better monitoring
   */
  private categorizeError(error: Error): string {
    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();

    // Network-related errors
    if (message.includes('timeout') || name.includes('timeout')) return 'timeout';
    if (message.includes('network') || message.includes('net::err')) return 'network';
    if (message.includes('connection') || message.includes('refused')) return 'connection';
    if (message.includes('dns') || message.includes('name_not_resolved')) return 'dns';

    // Browser-related errors
    if (message.includes('browser') || message.includes('chrome')) return 'browser';
    if (message.includes('page') || message.includes('navigation')) return 'page_navigation';
    if (message.includes('protocol') || message.includes('session')) return 'browser_protocol';

    // Application-specific errors
    if (message.includes('element') || message.includes('selector')) return 'element_not_found';
    if (message.includes('parse') || message.includes('validation')) return 'data_parsing';

    // System errors
    if (message.includes('memory') || message.includes('resource')) return 'system_resource';

    return 'unknown';
  }

  private shouldRetry(error: Error, attempt: number, config: RetryConfig): boolean {
    // Don't retry if we've exceeded max attempts
    if (attempt >= config.maxAttempts) {
      return false;
    }

    // Check if error is retryable
    const isRetryableError = config.retryableErrors.some(
      retryableError =>
        error.name.includes(retryableError) || error.message.includes(retryableError)
    );

    if (!isRetryableError) {
      this.observability.logger.debug('Error not retryable', {
        errorName: error.name,
        errorMessage: error.message,
        retryableErrors: config.retryableErrors,
      });
      return false;
    }

    return true;
  }

  private calculateDelay(attempt: number, config: RetryConfig): number {
    // Exponential backoff with jitter
    const baseDelay = config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt - 1);

    // Add jitter (±25% of base delay)
    const jitter = baseDelay * 0.25 * (Math.random() * 2 - 1);
    const delayWithJitter = baseDelay + jitter;

    // Cap at max delay
    const finalDelay = Math.min(delayWithJitter, config.maxDelayMs);

    return Math.max(finalDelay, config.baseDelayMs);
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Utility method for common retry patterns
  async executeWithLinearBackoff<T>(
    operation: () => Promise<T>,
    operationName: string,
    attempts: number = 3,
    delayMs: number = 1000
  ): Promise<RetryResult<T>> {
    return this.execute(operation, operationName, {
      maxAttempts: attempts,
      baseDelayMs: delayMs,
      backoffMultiplier: 1, // Linear backoff
      maxDelayMs: delayMs * attempts,
    });
  }

  async executeWithQuickRetry<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<RetryResult<T>> {
    return this.execute(operation, operationName, {
      maxAttempts: 2,
      baseDelayMs: 500,
      backoffMultiplier: 1.5,
      maxDelayMs: 2000,
    });
  }

  // Method to handle network-specific retries
  async executeNetworkOperation<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<RetryResult<T>> {
    return this.execute(operation, operationName, {
      maxAttempts: 5,
      baseDelayMs: 2000,
      backoffMultiplier: 2,
      maxDelayMs: 30000,
      retryableErrors: [
        ...this.defaultConfig.retryableErrors,
        'net::ERR_NETWORK_CHANGED',
        'net::ERR_CONNECTION_TIMED_OUT',
        'net::ERR_NAME_NOT_RESOLVED',
        'Protocol error',
        'Session closed',
      ],
    });
  }
}
