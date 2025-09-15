import { Counter, Histogram, Gauge, Span, SpanOptions } from '@opentelemetry/api';

export interface ObservabilityMetrics {
  // Business metrics
  readonly hospitalWaitTime: Gauge;
  readonly hospitalPatientCount: Gauge;
  readonly dataQualityScore: Gauge;
  readonly dataFreshnessMinutes: Gauge;

  // Scraper metrics
  readonly scrapingAttempts: Counter;
  readonly scrapingSuccess: Counter;
  readonly scrapingFailures: Counter;
  readonly scrapingDuration: Histogram;
  readonly scrapingRetryCount: Histogram;

  // Browser metrics
  readonly browserLaunchDuration: Histogram;
  readonly browserNavigationDuration: Histogram;
  readonly browserMemoryUsage: Gauge;
  readonly browserCrashes: Counter;

  // Database metrics
  readonly dbConnectionHealth: Gauge;
  readonly dbOperationDuration: Histogram;
  readonly dbOperationErrors: Counter;
  readonly recordsInserted: Counter;

  // Technical metrics
  readonly applicationUptime: Gauge;
  readonly memoryUsage: Gauge;
  readonly errorRate: Gauge;
  readonly heartbeat: Counter;

  // Error categorization
  readonly errorsByCategory: Counter;
  readonly recoveryTime: Histogram;

  // Business metric recording methods
  recordHospitalData(waitTime: number, patientCount: number, dataAge: number, qualityScore: number): void;

  // Scraping metric recording methods
  recordScrapingAttempt(source: string, attemptNumber?: number): void;
  recordScrapingSuccess(source: string, duration: number, retryCount: number): void;
  recordScrapingFailure(source: string, duration: number, errorType: string, retryCount: number): void;

  // Browser metric recording methods
  recordBrowserLaunch(duration: number, browserType: string): void;
  recordBrowserNavigation(duration: number, targetHost: string, success: boolean): void;
  recordBrowserCrash(reason: string): void;

  // Database metric recording methods
  recordDatabaseOperation(operation: string, success: boolean, duration: number): void;
  recordDatabaseHealth(healthy: boolean, responseTime?: number): void;

  // Error and recovery tracking
  recordError(category: string, errorType: string): void;
  recordRecovery(operation: string, recoveryDuration: number): void;

  // Connectivity verification
  recordHeartbeat(attributes?: Record<string, string>): void;
}

export interface ObservabilityLogger {
  debug(message: string, context?: Record<string, any>): void;
  info(message: string, context?: Record<string, any>): void;
  warn(message: string, context?: Record<string, any>): void;
  error(message: string, error?: Error, context?: Record<string, any>): void;
  
  // Application lifecycle logging
  logApplicationStart(): void;
  logApplicationShutdown(): void;
  
  // Scraping operations logging
  logScrapingStart(url: string, correlationId: string): void;
  logScrapingSuccess(url: string, duration: number, data: { waitTime?: number, patientCount?: number, retryCount?: number }): void;
  logScrapingError(url: string, duration: number, error: Error, retryCount?: number): void;
  logScrapingRetry(url: string, attempt: number, reason: string): void;
  
  // Database operations logging
  logDatabaseOperation(operation: string, success: boolean, duration: number, recordCount?: number): void;
  logDatabaseError(operation: string, error: Error, duration: number): void;
  
  // Health check logging
  logHealthCheck(component: string, healthy: boolean, responseTime: number): void;
  
  // Browser events logging
  logBrowserLaunch(browserType: string, duration: number): void;
  logBrowserCrash(reason: string, context?: Record<string, any>): void;
  logBrowserError(error: Error, context?: Record<string, any>): void;
  
  // Performance and data quality logging
  logPerformanceIssue(operation: string, duration: number, threshold: number): void;
  logDataQualityIssue(issue: string, data: Record<string, any>): void;
  
  // Utility methods
  withContext(context: Record<string, any>): ObservabilityLogger;
}

export interface ObservabilityTracer {
  startSpan(name: string, options?: SpanOptions): Span;
  startActiveSpan<F extends (span: Span) => ReturnType<F>>(
    name: string, 
    fn: F
  ): ReturnType<F>;
  startActiveSpan<F extends (span: Span) => ReturnType<F>>(
    name: string, 
    options: SpanOptions, 
    fn: F
  ): ReturnType<F>;
  
  // Exception and status handling
  recordException(span: Span, exception: Error, context?: Record<string, any>): void;
  setSpanStatus(span: Span, status: 'ok' | 'error', message?: string): void;
  
  // Operation wrappers
  wrapAsync<T>(name: string, operation: (span: Span) => Promise<T>, options?: SpanOptions): Promise<T>;
  wrapSync<T>(name: string, operation: (span: Span) => T, options?: SpanOptions): T;
  
  // Specialized span creation
  createScrapingSpan(operation: string, targetUrl: string, correlationId?: string): Span;
  createDatabaseSpan(operation: string, collection?: string): Span;
  createBrowserSpan(operation: string, browserType?: string): Span;
  createChildSpan(name: string, attributes?: Record<string, any>): Span;
  
  // Context enhancement
  addBusinessContext(span: Span, context: {
    waitTime?: number;
    patientCount?: number;
    dataQuality?: number;
    retryCount?: number;
  }): void;
  addPerformanceContext(span: Span, context: {
    memoryUsage?: number;
    cpuUsage?: number;
    networkLatency?: number;
  }): void;
  
  // Retry operations
  wrapRetryOperation<T>(
    operationName: string,
    operation: () => Promise<T>,
    retryCount: number,
    maxRetries: number
  ): Promise<T>;
}

export interface ObservabilityProvider {
  readonly serviceName: string;
  readonly version: string;
  readonly logger: ObservabilityLogger;
  readonly metrics: ObservabilityMetrics;
  readonly tracer: ObservabilityTracer;
  
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  isInitialized(): boolean;
  
  // Context correlation
  createCorrelationId(): string;
  setCorrelationId(correlationId: string): void;
  getCorrelationId(): string | undefined;
  
  // Health monitoring
  recordHealthCheck(component: string, healthy: boolean, responseTime: number, context?: Record<string, any>): void;
  recordError(operation: string, error: Error, context?: Record<string, any>): void;
  recordOperation(operation: string, duration: number, success: boolean): void;
}

export interface ObservabilityConfig {
  serviceName: string;
  serviceVersion: string;
  environment: 'development' | 'staging' | 'production';
  
  // OTEL configuration
  otelEndpoint: string;
  otelHeaders?: Record<string, string> | undefined;
  
  // Provider-specific config
  elasticConfig?: {
    apmServerUrl: string;
    apiKey: string;
  } | undefined;
  
  
  // Sampling and batching
  traceSampling?: number | undefined;
  metricInterval?: number | undefined;
  logLevel?: 'debug' | 'info' | 'warn' | 'error' | undefined;
}