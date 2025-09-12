import {
  DatabaseClient,
  DatabaseConnectionConfig,
} from '@/database/interfaces/database-client.interface';
import { ElasticsearchClient } from '@/database/implementations/elasticsearch-client';
import { PostgreSQLClient } from '@/database/implementations/postgresql-client';

export class DatabaseFactory {
  static create(config: DatabaseConnectionConfig): DatabaseClient {
    switch (config.type) {
      case 'elasticsearch':
        return new ElasticsearchClient(config);
      case 'postgresql':
        return new PostgreSQLClient(config);
      default:
        throw new Error(`Unsupported database type: ${config.type}`);
    }
  }

  static createFromEnv(): DatabaseClient {
    const dbType = process.env['DB_TYPE'] as 'elasticsearch' | 'postgresql';

    if (!dbType) {
      throw new Error('DB_TYPE environment variable is required');
    }

    const baseConfig = {
      type: dbType,
      timeout: parseInt(process.env['DB_TIMEOUT'] || '30000', 10),
      retries: parseInt(process.env['DB_RETRIES'] || '3', 10),
    };

    switch (dbType) {
      case 'elasticsearch':
        return new ElasticsearchClient({
          ...baseConfig,
          type: 'elasticsearch',
          url: process.env['ELASTICSEARCH_CLOUD_URL']!,
          apiKey: process.env['ELASTICSEARCH_API_KEY'],
          indexName: process.env['ELASTICSEARCH_INDEX'] || 'hospital-metrics',
          ssl: process.env['ELASTICSEARCH_SSL'] !== 'false',
        });

      case 'postgresql':
        return new PostgreSQLClient({
          ...baseConfig,
          type: 'postgresql',
          url: process.env['POSTGRESQL_URL']!,
          username: process.env['POSTGRESQL_USERNAME'],
          password: process.env['POSTGRESQL_PASSWORD'],
          database: process.env['POSTGRESQL_DATABASE'] || 'hospital_metrics',
          tableName: process.env['POSTGRESQL_TABLE'] || 'hospital_metrics',
          ssl: process.env['POSTGRESQL_SSL'] !== 'false',
        });

      default:
        throw new Error(`Unsupported database type: ${dbType}`);
    }
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

  static getSupportedTypes(): Array<'elasticsearch' | 'postgresql'> {
    return ['elasticsearch', 'postgresql'];
  }
}
