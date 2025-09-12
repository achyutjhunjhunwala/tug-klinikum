import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { BaseObservabilityProvider } from './base-observability';
import { ObservabilityConfig } from '@/observability/interfaces/observability-provider.interface';

export class GrafanaObservabilityProvider extends BaseObservabilityProvider {
  constructor(config: ObservabilityConfig) {
    super(config);
    
    if (!config.grafanaConfig) {
      throw new Error('Grafana configuration is required for GrafanaObservabilityProvider');
    }
  }

  protected override createTraceExporter(): OTLPTraceExporter {
    const { grafanaConfig } = this.config;
    
    // Encode credentials for Basic Auth
    const auth = Buffer.from(`${grafanaConfig!.userId}:${grafanaConfig!.apiKey}`).toString('base64');
    
    return new OTLPTraceExporter({
      url: grafanaConfig!.tempoUrl,
      headers: {
        'Authorization': `Basic ${auth}`,
      },
    });
  }

  protected override createMetricExporter(): OTLPMetricExporter {
    const { grafanaConfig } = this.config;
    
    // Encode credentials for Basic Auth
    const auth = Buffer.from(`${grafanaConfig!.userId}:${grafanaConfig!.apiKey}`).toString('base64');
    
    return new OTLPMetricExporter({
      url: grafanaConfig!.prometheusUrl,
      headers: {
        'Authorization': `Basic ${auth}`,
      },
    });
  }

  override async initialize(): Promise<void> {
    await super.initialize();
    
    this.logger.info('Grafana Cloud observability provider initialized', {
      prometheusUrl: this.config.grafanaConfig!.prometheusUrl,
      lokiUrl: this.config.grafanaConfig!.lokiUrl,
      tempoUrl: this.config.grafanaConfig!.tempoUrl,
      service: this.serviceName,
    });
  }

  // Grafana-specific utility methods
  createGrafanaLabels(): Record<string, string> {
    return {
      service: this.serviceName,
      version: this.version,
      environment: this.config.environment,
      instance: `${this.serviceName}-${process.pid}`,
    };
  }

  async sendLogToLoki(level: string, message: string, labels?: Record<string, string>): Promise<void> {
    const { grafanaConfig } = this.config;
    
    const logEntry = {
      streams: [
        {
          stream: {
            ...this.createGrafanaLabels(),
            level,
            ...labels,
          },
          values: [
            [
              (Date.now() * 1000000).toString(), // Loki expects nanosecond timestamp
              message,
            ],
          ],
        },
      ],
    };

    try {
      const auth = Buffer.from(`${grafanaConfig!.userId}:${grafanaConfig!.apiKey}`).toString('base64');
      
      await fetch(grafanaConfig!.lokiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${auth}`,
        },
        body: JSON.stringify(logEntry),
      });
    } catch (error) {
      // Fallback to console logging if Loki push fails
      console.error('Failed to send log to Loki:', error);
      console.log(`[${level.toUpperCase()}] ${message}`);
    }
  }

  recordPrometheusMetric(
    name: string, 
    value: number, 
    type: 'counter' | 'gauge' | 'histogram' = 'gauge',
    labels?: Record<string, string>
  ): void {
    // This would integrate with Prometheus' specific metric format
    this.logger.debug('Recording Prometheus metric', {
      metric: name,
      value,
      type,
      labels: {
        ...this.createGrafanaLabels(),
        ...labels,
      },
    });
  }

  createGrafanaTrace(operationName: string, duration: number, tags?: Record<string, any>): Record<string, any> {
    return {
      traceID: this.createCorrelationId(),
      spanID: this.createCorrelationId(),
      operationName,
      startTime: Date.now() * 1000, // Microsecond timestamp
      duration: duration * 1000, // Duration in microseconds
      tags: {
        ...this.createGrafanaLabels(),
        ...tags,
      },
      process: {
        serviceName: this.serviceName,
        tags: this.createGrafanaLabels(),
      },
    };
  }
}