import {
  DatabaseClient,
  DatabaseConnectionConfig,
} from '@/database/interfaces/database-client.interface';
import { ElasticsearchClient } from '@/database/implementations/elasticsearch-client';

export class DatabaseFactory {
  static create(config: DatabaseConnectionConfig): DatabaseClient {
    if (config.type !== 'elasticsearch') {
      throw new Error('Only Elasticsearch is supported as database type');
    }
    return new ElasticsearchClient(config);
  }

  static createFromEnv(): DatabaseClient {
    const url = process.env['ELASTICSEARCH_CLOUD_URL'];
    const apiKey = process.env['ELASTICSEARCH_API_KEY'];
    
    if (!url || !apiKey) {
      throw new Error('ELASTICSEARCH_CLOUD_URL and ELASTICSEARCH_API_KEY are required');
    }

    return new ElasticsearchClient({
      type: 'elasticsearch',
      url,
      apiKey,
      indexName: process.env['ELASTICSEARCH_INDEX'] || 'hospital-metrics',
      ssl: process.env['ELASTICSEARCH_SSL'] !== 'false',
      timeout: parseInt(process.env['DB_TIMEOUT'] || '30000', 10),
      retries: parseInt(process.env['DB_RETRIES'] || '3', 10),
    });
  }

  static async testConnection(config: DatabaseConnectionConfig): Promise<boolean> {
    const client = DatabaseFactory.create(config);

    try {
      await client.connect();
      const health = await client.healthCheck();
      await client.disconnect();
      return health.connected;
    } catch {
      return false;
    }
  }

  static getSupportedTypes(): Array<'elasticsearch'> {
    return ['elasticsearch'];
  }
}
