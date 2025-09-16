import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { BaseObservabilityProvider } from './base-observability';
import {
  ObservabilityConfig,
  ObservabilityLogger,
} from '@/observability/interfaces/observability-provider.interface';
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
      service: this.serviceName,
      environment: this.config.environment,
    });
  }
}
