import {
  ObservabilityConfig,
} from '@/observability/interfaces/observability-provider.interface';
import { ElasticObservabilityProvider } from '@/observability/implementations/elastic-observability';

export class ObservabilityFactory {
  /**
   * Creates a single observability provider for Elastic
   * Simplified from the previous multi-provider approach
   */
  static create(config: ObservabilityConfig): ElasticObservabilityProvider {
    return new ElasticObservabilityProvider(config);
  }

  static createFromEnv(): ElasticObservabilityProvider {
    const config = ObservabilityFactory.createConfigFromEnv();
    ObservabilityFactory.validateConfig(config);
    return ObservabilityFactory.create(config);
  }

  static createConfigFromEnv(): ObservabilityConfig {
    const serviceName = process.env['OTEL_SERVICE_NAME'] || 'hospital-scraper';
    const serviceVersion = process.env['OTEL_SERVICE_VERSION'] || '1.0.0';
    const environment = (process.env['NODE_ENV'] || 'development') as
      | 'development'
      | 'staging'
      | 'production';

    const config: ObservabilityConfig = {
      serviceName,
      serviceVersion,
      environment,
      otelEndpoint: process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] || 'http://localhost:4317',
      otelHeaders: process.env['OTEL_EXPORTER_OTLP_HEADERS']
        ? JSON.parse(process.env['OTEL_EXPORTER_OTLP_HEADERS'])
        : undefined,
      traceSampling: parseFloat(process.env['OTEL_TRACE_SAMPLING'] || '1.0'),
      metricInterval: parseInt(process.env['OTEL_METRIC_INTERVAL'] || '30000', 10),
      logLevel: ObservabilityFactory.determineLogLevel(environment),
    };

    // Add Elastic config if available
    if (process.env['ELASTICSEARCH_CLOUD_URL'] && process.env['ELASTICSEARCH_API_KEY']) {
      config.elasticConfig = {
        apmServerUrl: process.env['ELASTICSEARCH_APM_URL'] || 
          process.env['ELASTICSEARCH_CLOUD_URL']
            .replace(':9243', ':443')
            .replace('es.', 'apm.'),
        apiKey: process.env['ELASTICSEARCH_API_KEY'],
      };
    }

    return config;
  }

  /**
   * Determines appropriate log level based on environment
   * Production: Only errors and important business events
   * Development: More verbose for debugging
   */
  private static determineLogLevel(environment: string): 'debug' | 'info' | 'warn' | 'error' {
    const envLogLevel = process.env['LOG_LEVEL'] as 'debug' | 'info' | 'warn' | 'error';
    
    if (envLogLevel) {
      return envLogLevel;
    }

    // Environment-based defaults
    switch (environment) {
      case 'production':
        return 'warn'; // Only warnings and errors in production
      case 'staging':
        return 'info'; // Business events in staging
      case 'development':
      default:
        return 'debug'; // Verbose logging in development
    }
  }

  static async initializeProvider(provider: ElasticObservabilityProvider): Promise<void> {
    await provider.initialize();
  }

  static async shutdownProvider(provider: ElasticObservabilityProvider): Promise<void> {
    await provider.shutdown();
  }

  static validateConfig(config: ObservabilityConfig): void {
    if (!config.serviceName) {
      throw new Error('Service name is required');
    }

    if (!config.serviceVersion) {
      throw new Error('Service version is required');
    }

    if (!config.otelEndpoint) {
      throw new Error('OTEL endpoint is required');
    }

    if (config.elasticConfig) {
      if (!config.elasticConfig.apmServerUrl || !config.elasticConfig.apiKey) {
        throw new Error('Elastic APM server URL and API key are required');
      }
    }

    if (config.traceSampling !== undefined && (config.traceSampling < 0 || config.traceSampling > 1)) {
      throw new Error('Trace sampling must be between 0 and 1');
    }
  }
}
