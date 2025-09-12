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
    const startTime = Date.now();
    
    return this.observability.tracer.wrapAsync('retry_operation', async (span) => {
      span.setAttributes({
        'retry.operation': operationName,
        'retry.max_attempts': finalConfig.maxAttempts,
        'retry.base_delay_ms': finalConfig.baseDelayMs,
      });

      this.observability.logger.info('Starting retry operation', {
        operation: operationName,
        maxAttempts: finalConfig.maxAttempts,
        config: finalConfig,
      });

      let lastError: Error | undefined;
      let attempt = 0;

      while (attempt < finalConfig.maxAttempts) {
        attempt++;
        
        const attemptSpan = this.observability.tracer.startSpan(`${operationName}_attempt_${attempt}`);
        attemptSpan.setAttributes({
          'retry.attempt': attempt,
          'retry.max_attempts': finalConfig.maxAttempts,
        });

        try {
          this.observability.logger.debug('Executing attempt', {
            operation: operationName,
            attempt,
            maxAttempts: finalConfig.maxAttempts,
          });

          const result = await operation();

          attemptSpan.setStatus({ code: 1 }); // OK
          attemptSpan.end();

          const totalTime = Date.now() - startTime;

          span.setAttributes({
            'retry.success': true,
            'retry.attempts': attempt,
            'retry.total_time_ms': totalTime,
          });

          this.observability.logger.info('Retry operation succeeded', {
            operation: operationName,
            attempt,
            totalTime,
          });

          return {
            success: true,
            data: result,
            attempts: attempt,
            totalTime,
          };

        } catch (error) {
          lastError = error as Error;
          
          attemptSpan.recordException(lastError);
          attemptSpan.setStatus({ code: 2, message: lastError.message }); // ERROR
          attemptSpan.end();

          const shouldRetry = this.shouldRetry(lastError, attempt, finalConfig);

          this.observability.logger.warn('Attempt failed', {
            operation: operationName,
            attempt,
            error: lastError.message,
            errorName: lastError.name,
            shouldRetry,
          });

          if (!shouldRetry || attempt >= finalConfig.maxAttempts) {
            break;
          }

          // Calculate delay with exponential backoff
          const delay = this.calculateDelay(attempt, finalConfig);

          this.observability.logger.debug('Waiting before retry', {
            operation: operationName,
            attempt,
            delayMs: delay,
          });

          await this.sleep(delay);
        }
      }

      // All attempts failed
      const totalTime = Date.now() - startTime;

      span.setAttributes({
        'retry.success': false,
        'retry.attempts': attempt,
        'retry.total_time_ms': totalTime,
        'retry.final_error': lastError?.name || 'Unknown',
      });

      this.observability.recordError('retry_operation_failed', lastError!, {
        operation: operationName,
        attempts: attempt,
        totalTime,
      });

      return {
        success: false,
        error: lastError,
        attempts: attempt,
        totalTime,
      };
    });
  }

  private shouldRetry(error: Error, attempt: number, config: RetryConfig): boolean {
    // Don't retry if we've exceeded max attempts
    if (attempt >= config.maxAttempts) {
      return false;
    }

    // Check if error is retryable
    const isRetryableError = config.retryableErrors.some(retryableError => 
      error.name.includes(retryableError) || 
      error.message.includes(retryableError)
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