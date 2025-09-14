import { resourceFromAttributes } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
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
      // Create OTEL resource using resourceFromAttributes
      const resource = resourceFromAttributes({
        [SemanticResourceAttributes.SERVICE_NAME]: this.config.serviceName,
        [SemanticResourceAttributes.SERVICE_VERSION]: this.config.serviceVersion,
        [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: this.config.environment,
      });

      // Configure exporters (to be implemented by concrete classes)
      const traceExporter = this.createTraceExporter();
      const metricExporter = this.createMetricExporter();

      // Create SDK (logs are handled by Pino → Filebeat)
      this.sdk = new NodeSDK({
        resource,
        traceExporter,
        metricReader: new PeriodicExportingMetricReader({
          exporter: metricExporter,
          exportIntervalMillis: this.config.metricInterval || 30000,
        }),
        instrumentations: [],
      });

      // Start SDK
      this.sdk.start();
      
      // Wait a moment for the SDK to fully initialize before marking as ready
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      this.initialized = true;

      this.logger.logApplicationStart();
      this.logger.info('Observability provider initialized', {
        provider: this.constructor.name,
        app_service: this.serviceName,
        app_version: this.version,
      });

      // Gracefully shut down the SDK on process exit
      const gracefulShutdown = (signal: string) => {
        this.logger.info(`Received ${signal}, shutting down observability...`);
        this.shutdown()
          .then(() => this.logger.info('Observability provider shut down successfully.'))
          .catch((error) => this.logger.error('Error during graceful shutdown.', error as Error))
          .finally(() => process.exit(0));
      };

      process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
      process.on('SIGINT', () => gracefulShutdown('SIGINT'));

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
  }

  getCorrelationId(): string | undefined {
    return this.currentCorrelationId;
  }

  recordHealthCheck(component: string, healthy: boolean, responseTime: number): void {
    this.logger.logHealthCheck(component, healthy, responseTime);
    
    if (component === 'database') {
      this.metrics.recordDatabaseHealth(healthy);
      this.metrics.dbResponseTime.record(responseTime / 1000, { 
        operation: 'health_check', 
        success: healthy.toString() 
      });
    }
  }

  recordError(operation: string, error: Error, context?: Record<string, any>): void {
    this.logger.error(`Operation failed: ${operation}`, error, context);
    
    // Record operation-specific metrics
    if (operation.includes('scraping')) {
      this.metrics.scrapingFailures.add(1, { 
        operation, 
        error_type: error.name,
        ...context 
      });
    } else if (operation.includes('database')) {
      this.metrics.recordsInsertErrors.add(1, { 
        operation, 
        error_type: error.name,
        ...context 
      });
    }
  }

  recordOperation(operation: string, duration: number, success: boolean): void {
    this.logger.info(`Operation ${success ? 'completed' : 'failed'}: ${operation}`, {
      operation,
      duration_ms: duration,
      success,
    });

    // Record operation-specific metrics
    if (operation.includes('scraping')) {
      if (success) {
        this.metrics.recordScrapingSuccess('default', duration / 1000);
      } else {
        this.metrics.recordScrapingFailure('default', duration / 1000, 'unknown');
      }
    } else if (operation.includes('database')) {
      this.metrics.recordDatabaseOperation(operation, success, duration / 1000);
    }
  }

  // Abstract methods to be implemented by concrete providers
  protected abstract createTraceExporter(): OTLPTraceExporter;
  protected abstract createMetricExporter(): OTLPMetricExporter;
}