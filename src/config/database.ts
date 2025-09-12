import { z } from 'zod';
import { DatabaseConnectionConfig } from '@/database';

const DatabaseConfigSchema = z.object({
  type: z.enum(['elasticsearch', 'postgresql']),
  url: z.string().url(),
  apiKey: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  database: z.string().optional(),
  indexName: z.string().optional(),
  tableName: z.string().optional(),
  ssl: z.boolean().default(true),
  timeout: z.number().int().min(1000).max(300000).default(30000),
  retries: z.number().int().min(0).max(10).default(3),
});

export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;

export function createDatabaseConfig(): DatabaseConnectionConfig {
  const config: DatabaseConfig = DatabaseConfigSchema.parse({
    type: process.env['DB_TYPE'] || 'elasticsearch',
    url: process.env['DB_TYPE'] === 'elasticsearch' 
      ? process.env['ELASTICSEARCH_CLOUD_URL']
      : process.env['POSTGRESQL_URL'],
    apiKey: process.env['ELASTICSEARCH_API_KEY'],
    username: process.env['POSTGRESQL_USERNAME'],
    password: process.env['POSTGRESQL_PASSWORD'],
    database: process.env['POSTGRESQL_DATABASE'] || 'hospital_metrics',
    indexName: process.env['ELASTICSEARCH_INDEX'] || 'hospital-metrics',
    tableName: process.env['POSTGRESQL_TABLE'] || 'hospital_metrics',
    ssl: process.env['DB_SSL'] !== 'false',
    timeout: parseInt(process.env['DB_TIMEOUT'] || '30000', 10),
    retries: parseInt(process.env['DB_RETRIES'] || '3', 10),
  });

  // Validate required fields based on database type
  if (config.type === 'elasticsearch') {
    if (!config.url) {
      throw new Error('ELASTICSEARCH_CLOUD_URL is required for Elasticsearch database');
    }
    if (!config.apiKey) {
      throw new Error('ELASTICSEARCH_API_KEY is required for Elasticsearch database');
    }
  } else if (config.type === 'postgresql') {
    if (!config.url) {
      throw new Error('POSTGRESQL_URL is required for PostgreSQL database');
    }
  }

  return config;
}

export function validateDatabaseConfig(config: DatabaseConnectionConfig): void {
  try {
    DatabaseConfigSchema.parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`);
      throw new Error(`Database configuration validation failed: ${issues.join(', ')}`);
    }
    throw error;
  }
}