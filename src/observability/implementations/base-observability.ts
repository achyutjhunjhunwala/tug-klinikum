import { resourceFromAttributes } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { TraceIdRatioBasedSampler, AlwaysOnSampler } from '@opentelemetry/sdk-trace-node';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import type { Sampler } from '@opentelemetry/sdk-trace-node';
import { v4 as uuidv4 } from 'uuid';

import {
  ObservabilityProvider,
  ObservabilityConfig,
  ObservabilityLogger,
  ObservabilityMetrics,
  ObservabilityTracer,
} from '@/observability/interfaces/observability-provider.interface';
import { OtelMetrics } from '@/observability/otel/metrics';
import { OtelTracer } from '@/observability/otel/tracer';

export abstract class BaseObservabilityProvider implements ObservabilityProvider {
  protected sdk?: NodeSDK;
  protected initialized = false;
  protected currentCorrelationId?: string;

  readonly serviceName: string;
  readonly version: string;
  readonly logger: ObservabilityLogger;
  readonly metrics: ObservabilityMetrics;
  readonly tracer: ObservabilityTracer;

  constructor(protected readonly config: ObservabilityConfig) {
    this.serviceName = config.serviceName;
    this.version = config.serviceVersion;
    this.logger = this.createLogger();
    this.metrics = new OtelMetrics(config.serviceName);
    this.tracer = new OtelTracer(config.serviceName);
  }

  protected abstract createLogger(): ObservabilityLogger;

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Create OTEL resource with comprehensive attributes
      const resource = resourceFromAttributes({
        [SemanticResourceAttributes.SERVICE_NAME]: this.config.serviceName,
        [SemanticResourceAttributes.SERVICE_VERSION]: this.config.serviceVersion,
        [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: this.config.environment,
        [SemanticResourceAttributes.SERVICE_INSTANCE_ID]: this.createInstanceId(),
        // Additional custom attributes for better service identification
        'service.type': 'web-scraper',
        'service.component': 'hospital-data-collector',
        'deployment.platform': 'docker',
      });

      // Configure exporters
      const traceExporter = this.createTraceExporter();
      const metricExporter = this.createMetricExporter();

      // Create comprehensive SDK with auto-instrumentation
      this.sdk = new NodeSDK({
        resource,
        traceExporter,
        metricReader: new PeriodicExportingMetricReader({
          exporter: metricExporter,
          exportIntervalMillis: this.config.metricInterval || 30000,
        }),
        // Professional-level auto-instrumentation
        instrumentations: [
          getNodeAutoInstrumentations({
            // HTTP instrumentation for external requests
            '@opentelemetry/instrumentation-http': {
              enabled: true,
            },
            // DNS instrumentation for network diagnostics
            '@opentelemetry/instrumentation-dns': {
              enabled: true,
            },
            // Net instrumentation for socket-level monitoring
            '@opentelemetry/instrumentation-net': {
              enabled: true,
            },
            // FS instrumentation for file operations (only in non-production)
            '@opentelemetry/instrumentation-fs': {
              enabled: this.config.environment !== 'production',
            },
            // Console instrumentation is noisy, disable for production - but configuration property doesn't exist anymore in newer versions
            // '@opentelemetry/instrumentation-console': { enabled: false },
          }),
        ],
        // Enhanced trace configuration
        spanProcessor: new BatchSpanProcessor(traceExporter, {
          maxQueueSize: 2048,
          maxExportBatchSize: 512,
          exportTimeoutMillis: 30000,
          scheduledDelayMillis: 5000,
        }),
        // Sampling configuration for production efficiency
        sampler: this.createSampler(),
      });

      // Start SDK
      this.sdk.start();
      
      // Wait for initialization
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      this.initialized = true;

      // Log startup with comprehensive context
      this.logger.logApplicationStart();
      this.logger.info('Observability provider initialized', {
        provider: this.constructor.name,
        app_service: this.serviceName,
        app_version: this.version,
        environment: this.config.environment,
        trace_sampling: this.config.traceSampling,
        metric_interval: this.config.metricInterval,
        instrumentations_enabled: this.getEnabledInstrumentations(),
      });

      // Emit heartbeat to verify pipeline
      this.metrics.recordHeartbeat({ phase: 'initialization_complete' });

      // Set up graceful shutdown handlers
      this.setupGracefulShutdown();

    } catch (error) {
      this.logger.error('Failed to initialize observability provider', error as Error);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    if (!this.initialized || !this.sdk) {
      return;
    }

    try {
      this.logger.logApplicationShutdown();
      
      // Allow final traces/metrics to be exported
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      await this.sdk.shutdown();
      this.initialized = false;
      
    } catch (error) {
      this.logger.error('Error during observability shutdown', error as Error);
      throw error;
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  createCorrelationId(): string {
    return uuidv4();
  }

  setCorrelationId(correlationId: string): void {
    this.currentCorrelationId = correlationId;
    // Set in active span context if available
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      activeSpan.setAttributes({
        'correlation.id': correlationId,
      });
    }
  }

  getCorrelationId(): string | undefined {
    return this.currentCorrelationId;
  }

  // === ENHANCED OBSERVABILITY METHODS ===

  /**
   * Record health check with comprehensive context
   */
  recordHealthCheck(component: string, healthy: boolean, responseTime: number, context?: Record<string, any>): void {
    this.logger.logHealthCheck(component, healthy, responseTime);
    
    // Record component-specific metrics
    switch (component) {
      case 'database':
        this.metrics.recordDatabaseHealth(healthy, responseTime / 1000);
        break;
      case 'browser':
        if (!healthy) {
          this.metrics.recordError('health_check', 'browser_unhealthy');
        }
        break;
      case 'scraper':
        if (!healthy) {
          this.metrics.recordError('health_check', 'scraper_unhealthy');
        }
        break;
    }

    // Create trace for health check failures
    if (!healthy) {
      this.tracer.wrapSync(`health_check_failed_${component}`, (span) => {
        span.setAttributes({
          'health.component': component,
          'health.status': 'unhealthy',
          'health.response_time_ms': responseTime,
          ...context,
        });
        span.setStatus({ code: SpanStatusCode.ERROR, message: `${component} health check failed` });
      });
    }
  }

  /**
   * Record error with enhanced categorization and tracing
   */
  recordError(operation: string, error: Error, context?: Record<string, any>): void {
    const errorCategory = this.categorizeError(error);
    
    this.logger.error(`Operation failed: ${operation}`, error, context);
    this.metrics.recordError(errorCategory, error.name);

    // Create error trace with comprehensive context
    this.tracer.wrapSync(`error_${operation}`, (span) => {
      span.recordException(error);
      span.setAttributes({
        'error.operation': operation,
        'error.category': errorCategory,
        'error.name': error.name,
        'error.message': error.message,
        'correlation.id': this.currentCorrelationId || 'unknown',
        ...context,
      });
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    });
  }

  /**
   * Record successful operation with metrics and optional tracing
   */
  recordOperation(operation: string, duration: number, success: boolean, context?: Record<string, any>): void {
    const category = this.categorizeOperation(operation);
    
    this.logger.info(`Operation ${success ? 'completed' : 'failed'}: ${operation}`, {
      operation,
      category,
      duration_ms: duration,
      success,
      ...context,
    });

    // Record category-specific metrics
    switch (category) {
      case 'scraping':
        if (success) {
          this.metrics.recordScrapingSuccess('default', duration / 1000, context?.['retryCount'] || 0);
        } else {
          this.metrics.recordScrapingFailure('default', duration / 1000, 'operation_failed', context?.['retryCount'] || 0);
        }
        break;
      case 'database':
        this.metrics.recordDatabaseOperation(operation, success, duration / 1000);
        break;
      case 'browser':
        if (operation.includes('launch')) {
          this.metrics.recordBrowserLaunch(duration / 1000, context?.['browserType'] || 'chromium');
        } else if (operation.includes('navigation')) {
          this.metrics.recordBrowserNavigation(duration / 1000, context?.['targetHost'] || 'unknown', success);
        }
        break;
    }
  }

  /**
   * Record performance issue when operations exceed thresholds
   */
  recordPerformanceIssue(operation: string, duration: number, threshold: number, context?: Record<string, any>): void {
    this.logger.logPerformanceIssue(operation, duration, threshold);
    
    this.tracer.wrapSync(`performance_issue_${operation}`, (span) => {
      span.setAttributes({
        'performance.operation': operation,
        'performance.duration_ms': duration,
        'performance.threshold_ms': threshold,
        'performance.exceeded_by_ms': duration - threshold,
        ...context,
      });
      span.setStatus({ code: SpanStatusCode.ERROR, message: 'Performance threshold exceeded' });
    });
  }

  // === HELPER METHODS ===

  private createInstanceId(): string {
    return `${require('os').hostname()}-${process.pid}`;
  }

  private createSampler(): Sampler {
    if (this.config.environment === 'production') {
      // Use probability-based sampling in production
      return new TraceIdRatioBasedSampler(this.config.traceSampling || 0.1);
    } else {
      // Sample all traces in development/staging
      return new AlwaysOnSampler();
    }
  }

  private getEnabledInstrumentations(): string[] {
    return [
      'http',
      'dns', 
      'net',
      ...(this.config.environment !== 'production' ? ['fs'] : [])
    ];
  }

  private categorizeError(error: Error): string {
    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();

    if (message.includes('timeout') || name.includes('timeout')) return 'timeout';
    if (message.includes('network') || message.includes('fetch')) return 'network';
    if (message.includes('browser') || message.includes('playwright')) return 'browser';
    if (message.includes('elasticsearch') || message.includes('database')) return 'database';
    if (message.includes('parse') || message.includes('validation')) return 'data_parsing';
    if (message.includes('memory') || message.includes('cpu')) return 'system';
    
    return 'unknown';
  }

  private categorizeOperation(operation: string): string {
    const op = operation.toLowerCase();
    
    if (op.includes('scrap') || op.includes('extract')) return 'scraping';
    if (op.includes('database') || op.includes('elastic') || op.includes('insert')) return 'database';
    if (op.includes('browser') || op.includes('page') || op.includes('navigate')) return 'browser';
    if (op.includes('health')) return 'health_check';
    
    return 'system';
  }

  private setupGracefulShutdown(): void {
    const gracefulShutdown = (signal: string) => {
      this.logger.info(`Received ${signal}, shutting down observability...`);
      this.shutdown()
        .then(() => this.logger.info('Observability provider shut down successfully.'))
        .catch((error) => this.logger.error('Error during graceful shutdown.', error as Error));
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  }

  // Abstract methods to be implemented by concrete providers
  protected abstract createTraceExporter(): OTLPTraceExporter;
  protected abstract createMetricExporter(): OTLPMetricExporter;
}