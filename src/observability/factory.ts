import {
  ObservabilityProvider,
  ObservabilityConfig,
} from '@/observability/interfaces/observability-provider.interface';
import { ElasticObservabilityProvider } from '@/observability/implementations/elastic-observability';
import { GrafanaObservabilityProvider } from '@/observability/implementations/grafana-observability';

export type ObservabilityProviderType = 'elastic' | 'grafana' | 'dual';

export class ObservabilityFactory {
  static create(
    type: ObservabilityProviderType,
    config: ObservabilityConfig
  ): ObservabilityProvider | ObservabilityProvider[] {
    switch (type) {
      case 'elastic':
        return new ElasticObservabilityProvider(config);

      case 'grafana':
        return new GrafanaObservabilityProvider(config);

      case 'dual':
        return [new ElasticObservabilityProvider(config), new GrafanaObservabilityProvider(config)];

      default:
        throw new Error(`Unsupported observability provider type: ${type}`);
    }
  }

  static createFromEnv(): ObservabilityProvider[] {
    const config = ObservabilityFactory.createConfigFromEnv();
    const providerTypes = ObservabilityFactory.getProviderTypesFromEnv();

    const providers: ObservabilityProvider[] = [];

    for (const providerType of providerTypes) {
      if (providerType === 'dual') {
        const dualProviders = ObservabilityFactory.create(
          'dual',
          config
        ) as ObservabilityProvider[];
        providers.push(...dualProviders);
      } else {
        const provider = ObservabilityFactory.create(providerType, config) as ObservabilityProvider;
        providers.push(provider);
      }
    }

    return providers;
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
      logLevel: (process.env['LOG_LEVEL'] || 'info') as 'debug' | 'info' | 'warn' | 'error',
    };

    // Add Elastic config if available
    if (process.env['ELASTICSEARCH_CLOUD_URL'] && process.env['ELASTICSEARCH_API_KEY']) {
      config.elasticConfig = {
        apmServerUrl: process.env['ELASTICSEARCH_CLOUD_URL']
          .replace(':9243', ':443')
          .replace('es.', 'apm.'),
        apiKey: process.env['ELASTICSEARCH_API_KEY'],
      };
    }

    // Add Grafana config if available
    if (process.env['GRAFANA_CLOUD_USER_ID'] && process.env['GRAFANA_CLOUD_API_KEY']) {
      config.grafanaConfig = {
        userId: process.env['GRAFANA_CLOUD_USER_ID'],
        apiKey: process.env['GRAFANA_CLOUD_API_KEY'],
        prometheusUrl: process.env['GRAFANA_CLOUD_PROMETHEUS_URL']!,
        lokiUrl: process.env['GRAFANA_CLOUD_LOKI_URL']!,
        tempoUrl: process.env['GRAFANA_CLOUD_TEMPO_URL']!,
      };
    }

    return config;
  }

  private static getProviderTypesFromEnv(): ObservabilityProviderType[] {
    const providers = process.env['OBSERVABILITY_PROVIDERS'] || 'dual';
    return providers.split(',').map(p => p.trim() as ObservabilityProviderType);
  }

  static async initializeProviders(providers: ObservabilityProvider[]): Promise<void> {
    const initPromises = providers.map(provider => provider.initialize());
    await Promise.all(initPromises);
  }

  static async shutdownProviders(providers: ObservabilityProvider[]): Promise<void> {
    const shutdownPromises = providers.map(provider => provider.shutdown());
    await Promise.all(shutdownPromises);
  }

  static getSupportedTypes(): ObservabilityProviderType[] {
    return ['elastic', 'grafana', 'dual'];
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

    // Validate provider-specific configs
    if (config.elasticConfig) {
      if (!config.elasticConfig.apmServerUrl || !config.elasticConfig.apiKey) {
        throw new Error('Elastic APM server URL and API key are required');
      }
    }

    if (config.grafanaConfig) {
      const required = ['userId', 'apiKey', 'prometheusUrl', 'lokiUrl', 'tempoUrl'];
      for (const field of required) {
        if (!config.grafanaConfig[field as keyof typeof config.grafanaConfig]) {
          throw new Error(`Grafana ${field} is required`);
        }
      }
    }
  }
}
