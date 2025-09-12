import 'dotenv/config';
import { z } from 'zod';
import { createDatabaseConfig } from './database';
import { createScrapingConfig } from './scraper';
import { createObservabilityConfig, getObservabilityProviders } from './observability';

// Re-export configuration functions
export { createDatabaseConfig } from './database';
export { createScrapingConfig } from './scraper';
export { createObservabilityConfig, getObservabilityProviders } from './observability';

// Application-wide configuration
const ApplicationConfigSchema = z.object({
  nodeEnv: z.enum(['development', 'staging', 'production']).default('development'),
  port: z.number().int().min(1000).max(65535).default(3000),
  scrapingInterval: z.number().int().min(1).max(1440).default(30), // minutes
  timezone: z.string().default('Europe/Berlin'),
  gracefulShutdownTimeout: z.number().int().min(5000).max(60000).default(30000),
  healthCheckInterval: z.number().int().min(10000).max(300000).default(60000),
});

export type ApplicationConfig = z.infer<typeof ApplicationConfigSchema>;

export function createApplicationConfig(): ApplicationConfig {
  const config: ApplicationConfig = ApplicationConfigSchema.parse({
    nodeEnv: (process.env['NODE_ENV'] as 'development' | 'staging' | 'production') || 'development',
    port: parseInt(process.env['PORT'] || '3000', 10),
    scrapingInterval: parseInt(process.env['SCRAPING_INTERVAL'] || '30', 10),
    timezone: process.env['TIMEZONE'] || 'Europe/Berlin',
    gracefulShutdownTimeout: parseInt(process.env['GRACEFUL_SHUTDOWN_TIMEOUT'] || '30000', 10),
    healthCheckInterval: parseInt(process.env['HEALTH_CHECK_INTERVAL'] || '60000', 10),
  });

  return config;
}

// Master configuration function that validates all configs
export function validateAllConfigurations(): {
  app: ApplicationConfig;
  database: ReturnType<typeof createDatabaseConfig>;
  scraping: ReturnType<typeof createScrapingConfig>;
  observability: ReturnType<typeof createObservabilityConfig>;
} {
  try {
    const app = createApplicationConfig();
    const database = createDatabaseConfig();
    const scraping = createScrapingConfig();
    const observability = createObservabilityConfig();

    // Cross-validation
    if (app.nodeEnv === 'production') {
      if (observability.logLevel === 'debug') {
        console.warn('Warning: Debug logging is enabled in production environment');
      }

      if (!observability.elasticConfig && !observability.grafanaConfig) {
        throw new Error('At least one observability provider must be configured in production');
      }
    }

    return { app, database, scraping, observability };
  } catch (error) {
    console.error('Configuration validation failed:', error);
    throw error;
  }
}

// Environment validation
export function validateRequiredEnvironmentVariables(): void {
  const required = ['DB_TYPE', 'OTEL_SERVICE_NAME'];

  const conditionalRequired = {
    ELASTICSEARCH_CLOUD_URL: () => process.env['DB_TYPE'] === 'elasticsearch',
    ELASTICSEARCH_API_KEY: () => process.env['DB_TYPE'] === 'elasticsearch',
    POSTGRESQL_URL: () => process.env['DB_TYPE'] === 'postgresql',
    GRAFANA_CLOUD_USER_ID: () => getObservabilityProviders().includes('grafana'),
    GRAFANA_CLOUD_API_KEY: () => getObservabilityProviders().includes('grafana'),
    GRAFANA_CLOUD_PROMETHEUS_URL: () => getObservabilityProviders().includes('grafana'),
    GRAFANA_CLOUD_LOKI_URL: () => getObservabilityProviders().includes('grafana'),
    GRAFANA_CLOUD_TEMPO_URL: () => getObservabilityProviders().includes('grafana'),
  };

  const missing: string[] = [];

  // Check required variables
  for (const varName of required) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }

  // Check conditional variables
  for (const [varName, condition] of Object.entries(conditionalRequired)) {
    if (condition() && !process.env[varName]) {
      missing.push(varName);
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

// Configuration summary for logging
export function getConfigurationSummary(): Record<string, any> {
  const configs = validateAllConfigurations();

  return {
    application: {
      environment: configs.app.nodeEnv,
      scrapingInterval: `${configs.app.scrapingInterval} minutes`,
      timezone: configs.app.timezone,
    },
    database: {
      type: configs.database.type,
      url: maskUrl(configs.database.url),
      indexName: configs.database.indexName,
      timeout: `${configs.database.timeout}ms`,
    },
    scraping: {
      targetUrl: configs.scraping.targetUrl,
      browserType: configs.scraping.browser.type,
      headless: configs.scraping.browser.headless,
      maxRetries: configs.scraping.maxRetries,
    },
    observability: {
      serviceName: configs.observability.serviceName,
      serviceVersion: configs.observability.serviceVersion,
      providers: getObservabilityProviders(),
      logLevel: configs.observability.logLevel,
      traceSampling: configs.observability.traceSampling,
    },
  };
}

function maskUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return `${urlObj.protocol}//${urlObj.hostname}:${urlObj.port}/*****`;
  } catch {
    return '*****';
  }
}
