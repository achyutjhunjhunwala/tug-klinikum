import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { BaseObservabilityProvider } from './base-observability';
import { ObservabilityConfig, ObservabilityLogger } from '@/observability/interfaces/observability-provider.interface';
import { PinoLogger } from '@/observability/otel/pino-logger';

export class ElasticObservabilityProvider extends BaseObservabilityProvider {
  constructor(config: ObservabilityConfig) {
    super(config);
    
    if (!config.elasticConfig) {
      throw new Error('Elastic configuration is required for ElasticObservabilityProvider');
    }
  }

  protected override createLogger(): ObservabilityLogger {
    // Use Pino for structured JSON logging (Filebeat will collect)
    return new PinoLogger(
      this.config.serviceName,
      this.config.serviceVersion,
      this.config.environment,
      this.config.logLevel
    );
  }

  protected override createTraceExporter(): OTLPTraceExporter {
    // Send to local OTEL collector
    return new OTLPTraceExporter({
      url: this.config.otelEndpoint,
      headers: this.config.otelHeaders || {},
    });
  }

  protected override createMetricExporter(): OTLPMetricExporter {
    // Send to local OTEL collector
    return new OTLPMetricExporter({
      url: this.config.otelEndpoint,
      headers: this.config.otelHeaders || {},
    });
  }



  override async initialize(): Promise<void> {
    await super.initialize();
    
    this.logger.info('Elastic observability provider initialized', {
      apmServer: this.config.elasticConfig!.apmServerUrl,
      app_service: this.serviceName,
    });
  }

  // Elastic-specific utility methods
  createElasticContext(): Record<string, any> {
    return {
      service: {
        name: this.serviceName,
        version: this.version,
        environment: this.config.environment,
      },
      labels: {
        deployment: this.config.environment,
        version: this.version,
      },
    };
  }

  recordElasticMetric(name: string, value: number, labels?: Record<string, string>): void {
    // This would integrate with Elastic's specific metric format
    this.logger.debug('Recording Elastic metric', {
      metric: name,
      value,
      labels,
      ...this.createElasticContext(),
    });
  }

  createElasticError(error: Error, context?: Record<string, any>): Record<string, any> {
    return {
      error: {
        id: this.createCorrelationId(),
        exception: {
          message: error.message,
          type: error.name,
          stacktrace: error.stack?.split('\n').map(line => ({ line: line.trim() })),
        },
        context: {
          ...this.createElasticContext(),
          ...context,
        },
      },
    };
  }
}