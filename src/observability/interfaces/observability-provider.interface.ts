import { Counter, Histogram, Gauge, Span, SpanOptions } from '@opentelemetry/api';

export interface ObservabilityMetrics {
  // Scraper metrics
  scrapingAttempts: Counter;
  scrapingSuccess: Counter;
  scrapingFailures: Counter;
  scrapingDuration: Histogram;
  
  // Data metrics  
  recordsInserted: Counter;
  recordsInsertErrors: Counter;
  dbConnectionHealth: Gauge;
  dbResponseTime: Histogram;
  
  // Application metrics
  applicationUptime: Gauge;
  memoryUsage: Gauge;
  cpuUsage: Gauge;
  heartbeat: Counter;

  recordDatabaseHealth(healthy: boolean): void;
  recordScrapingSuccess(scraperId: string, duration: number): void;
  recordScrapingFailure(scraperId: string, duration: number, reason: string): void;
  recordDatabaseOperation(operation: string, success: boolean, duration: number): void;
  recordHeartbeat(attributes?: Record<string, string>): void;
}

export interface ObservabilityLogger {
  debug(message: string, context?: Record<string, any>): void;
  info(message: string, context?: Record<string, any>): void;
  warn(message: string, context?: Record<string, any>): void;
  error(message: string, error?: Error, context?: Record<string, any>): void;
  logApplicationStart(): void;
  logApplicationShutdown(): void;
  logHealthCheck(component: string, healthy: boolean, responseTime: number): void;
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
  recordException(span: Span, exception: Error): void;
  setSpanStatus(span: Span, status: 'ok' | 'error', message?: string): void;
  wrapAsync<T>(name: string, fn: (span: Span) => Promise<T>, options?: SpanOptions): Promise<T>;
  wrapSync<T>(name: string, fn: (span: Span) => T, options?: SpanOptions): T;
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
  recordHealthCheck(component: string, healthy: boolean, responseTime: number): void;
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