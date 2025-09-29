import { Client } from '@elastic/elasticsearch';
import { DatabaseClient, DatabaseHealth, QueryFilter, QueryResult, HospitalMetric } from '../types/database';
import { PinoLogger } from '../observability/logger';

export class ElasticsearchClient implements DatabaseClient {
  private client: Client;
  private readonly indexName: string;
  private connected = false;
  private logger: PinoLogger;

  constructor() {
    this.logger = new PinoLogger();

    const url = process.env.ELASTICSEARCH_CLOUD_URL;
    const apiKey = process.env.ELASTICSEARCH_API_KEY;

    if (!url || !apiKey) {
      throw new Error('ELASTICSEARCH_CLOUD_URL and ELASTICSEARCH_API_KEY are required');
    }

    this.indexName = 'hospital-metrics';

    this.client = new Client({
      node: url,
      auth: {
        apiKey: apiKey,
      },
      requestTimeout: 30000,
      pingTimeout: 3000,
      maxRetries: 3,
      compression: true,
      sniffOnStart: false,
      sniffInterval: false,
      sniffOnConnectionFault: false,
    });
  }

  async connect(): Promise<void> {
    try {
      await this.client.ping();
      this.connected = true;
      this.logger.info('Connected to Elasticsearch successfully');
    } catch (error) {
      this.connected = false;
      this.logger.error('Failed to connect to Elasticsearch', { error: error instanceof Error ? error.message : error });
      throw new Error(`Failed to connect to Elasticsearch: ${error}`);
    }
  }

  async disconnect(): Promise<void> {
    await this.client.close();
    this.connected = false;
    this.logger.info('Disconnected from Elasticsearch');
  }

  isConnected(): boolean {
    return this.connected;
  }

  async healthCheck(): Promise<DatabaseHealth> {
    const startTime = Date.now();
    try {
      const health = await this.client.cluster.health();
      const stats = await this.client.indices.stats({ index: this.indexName });
      const responseTime = Date.now() - startTime;

      return {
        connected: true,
        responseTimeMs: responseTime,
        version: 'unknown',
        clusterHealth: health.status as 'green' | 'yellow' | 'red',
        indexCount: Object.keys(stats.indices || {}).length,
        documentCount: stats._all?.total?.docs?.count || 0,
      };
    } catch (error) {
      return {
        connected: false,
        responseTimeMs: Date.now() - startTime,
        lastError: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async query(filters?: QueryFilter): Promise<QueryResult<HospitalMetric>> {
    try {
      const query = this.buildQuery(filters);
      const response = await this.client.search({
        index: this.indexName,
        query,
        sort: [{ [filters?.sortBy || 'timestamp']: { order: filters?.sortOrder || 'desc' } }],
        from: filters?.offset || 0,
        size: filters?.limit || 100,
      });

      const data = response.hits.hits.map((hit: any) => {
        const source = hit._source;
        return {
          ...source,
          timestamp: new Date(source.timestamp)
        } as HospitalMetric;
      });

      return {
        data,
        total: typeof response.hits.total === 'number' ? response.hits.total : response.hits.total?.value || 0,
        offset: filters?.offset || 0,
        limit: filters?.limit || 100,
      };
    } catch (error) {
      console.error('Query failed:', error);
      throw new Error(`Query failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private buildQuery(filters?: QueryFilter): any {
    const mustClauses: any[] = [];

    // Department filter
    if (filters?.department) {
      mustClauses.push({
        term: { department: filters.department }
      });
    }

    // Date range filter
    if (filters?.dateRange) {
      mustClauses.push({
        range: {
          timestamp: {
            gte: filters.dateRange.from.toISOString(),
            lte: filters.dateRange.to.toISOString()
          }
        }
      });
    }

    // Only include successful scraping results
    mustClauses.push({
      term: { scrapingSuccess: true }
    });

    return mustClauses.length > 0 ? { bool: { must: mustClauses } } : { match_all: {} };
  }
}