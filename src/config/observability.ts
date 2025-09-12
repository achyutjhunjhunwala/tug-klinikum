import { z } from 'zod';
import { ObservabilityConfig } from '@/observability';

const ObservabilityConfigSchema = z.object({
  serviceName: z.string().min(1),
  serviceVersion: z.string().min(1),
  environment: z.enum(['development', 'staging', 'production']),
  otelEndpoint: z.string().url(),
  otelHeaders: z.record(z.string()).optional(),
  elasticConfig: z.object({
    apmServerUrl: z.string().url(),
    apiKey: z.string().min(1),
  }).optional(),
  grafanaConfig: z.object({
    userId: z.string().min(1),
    apiKey: z.string().min(1),
    prometheusUrl: z.string().url(),
    lokiUrl: z.string().url(),
    tempoUrl: z.string().url(),
  }).optional(),
  traceSampling: z.number().min(0).max(1).default(1.0),
  metricInterval: z.number().int().min(1000).max(300000).default(30000),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type ObservabilityConfigType = z.infer<typeof ObservabilityConfigSchema>;

export function createObservabilityConfig(): ObservabilityConfig {
  const config: ObservabilityConfigType = ObservabilityConfigSchema.parse({
    serviceName: process.env['OTEL_SERVICE_NAME'] || 'hospital-scraper',
    serviceVersion: process.env['OTEL_SERVICE_VERSION'] || '1.0.0',
    environment: (process.env['NODE_ENV'] as 'development' | 'staging' | 'production') || 'development',
    otelEndpoint: process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] || 'http://localhost:4317',
    otelHeaders: process.env['OTEL_EXPORTER_OTLP_HEADERS'] ? 
      JSON.parse(process.env['OTEL_EXPORTER_OTLP_HEADERS']) : undefined,
    elasticConfig: process.env['ELASTICSEARCH_CLOUD_URL'] && process.env['ELASTICSEARCH_API_KEY'] ? {
      apmServerUrl: deriveApmServerUrl(process.env['ELASTICSEARCH_CLOUD_URL']),
      apiKey: process.env['ELASTICSEARCH_API_KEY'],
    } : undefined,
    grafanaConfig: process.env['GRAFANA_CLOUD_USER_ID'] && process.env['GRAFANA_CLOUD_API_KEY'] ? {
      userId: process.env['GRAFANA_CLOUD_USER_ID'],
      apiKey: process.env['GRAFANA_CLOUD_API_KEY'],
      prometheusUrl: process.env['GRAFANA_CLOUD_PROMETHEUS_URL']!,
      lokiUrl: process.env['GRAFANA_CLOUD_LOKI_URL']!,
      tempoUrl: process.env['GRAFANA_CLOUD_TEMPO_URL']!,
    } : undefined,
    traceSampling: parseFloat(process.env['OTEL_TRACE_SAMPLING'] || '1.0'),
    metricInterval: parseInt(process.env['OTEL_METRIC_INTERVAL'] || '30000', 10),
    logLevel: (process.env['LOG_LEVEL'] as 'debug' | 'info' | 'warn' | 'error') || 'info',
  });

  return config;
}

export function validateObservabilityConfig(config: ObservabilityConfig): void {
  try {
    ObservabilityConfigSchema.parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`);
      throw new Error(`Observability configuration validation failed: ${issues.join(', ')}`);
    }
    throw error;
  }
}

function deriveApmServerUrl(elasticsearchUrl: string): string {
  // Convert Elasticsearch URL to APM Server URL
  // Example: https://my-deployment.es.eu-west-1.gcp.cloud.es.io:9243
  // becomes: https://my-deployment.apm.eu-west-1.gcp.cloud.es.io:443
  return elasticsearchUrl
    .replace(':9243', ':443')
    .replace('.es.', '.apm.');
}

export function getObservabilityProviders(): Array<'elastic' | 'grafana'> {
  const providers = process.env['OBSERVABILITY_PROVIDERS'] || 'elastic,grafana';
  return providers
    .split(',')
    .map(p => p.trim() as 'elastic' | 'grafana')
    .filter(p => ['elastic', 'grafana'].includes(p));
}

export function isObservabilityEnabled(): boolean {
  return process.env['OBSERVABILITY_ENABLED'] !== 'false';
}

export function getDefaultObservabilityConfig(): ObservabilityConfig {
  return {
    serviceName: 'hospital-scraper',
    serviceVersion: '1.0.0',
    environment: 'development',
    otelEndpoint: 'http://localhost:4317',
    traceSampling: 1.0,
    metricInterval: 30000,
    logLevel: 'info',
  };
}