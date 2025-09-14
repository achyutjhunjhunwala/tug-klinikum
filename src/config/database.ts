import { z } from 'zod';
import { DatabaseConnectionConfig } from '@/database';

const DatabaseConfigSchema = z.object({
  type: z.literal('elasticsearch'),
  url: z.string().url(),
  apiKey: z.string(),
  indexName: z.string().optional(),
  ssl: z.boolean().default(true),
  timeout: z.number().int().min(1000).max(300000).default(30000),
  retries: z.number().int().min(0).max(10).default(3),
});

export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;

export function createDatabaseConfig(): DatabaseConnectionConfig {
  const url = process.env['ELASTICSEARCH_CLOUD_URL'];
  const apiKey = process.env['ELASTICSEARCH_API_KEY'];

  if (!url) {
    throw new Error('ELASTICSEARCH_CLOUD_URL is required');
  }
  if (!apiKey) {
    throw new Error('ELASTICSEARCH_API_KEY is required');
  }

  const config: DatabaseConfig = DatabaseConfigSchema.parse({
    type: 'elasticsearch',
    url,
    apiKey,
    indexName: process.env['ELASTICSEARCH_INDEX'] || 'hospital-metrics',
    ssl: process.env['ELASTICSEARCH_SSL'] !== 'false',
    timeout: parseInt(process.env['DB_TIMEOUT'] || '30000', 10),
    retries: parseInt(process.env['DB_RETRIES'] || '3', 10),
  });

  return config;
}
