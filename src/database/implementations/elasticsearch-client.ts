import { Client } from '@elastic/elasticsearch';
import { v4 as uuidv4 } from 'uuid';
import { 
  DatabaseClient, 
  DatabaseConnectionConfig 
} from '@/database/interfaces/database-client.interface';
import {
  HospitalMetric,
  CreateHospitalMetric,
} from '@/models/hospital-metric';
import {
  QueryFilter,
  DatabaseHealth,
  BulkInsertResult,
  QueryResult,
} from '@/database/interfaces/query-types';

export class ElasticsearchClient implements DatabaseClient {
  private client: Client;
  private readonly indexName: string;
  private connected = false;

  constructor(config: DatabaseConnectionConfig) {
    this.indexName = config.indexName || 'hospital-metrics';
    
    this.client = new Client({
      node: config.url,
      auth: {
        apiKey: config.apiKey!
      }
    });
  }

  async connect(): Promise<void> {
    try {
      await this.client.ping();
      await this.ensureIndexExists();
      this.connected = true;
    } catch (error) {
      this.connected = false;
      throw new Error(`Failed to connect to Elasticsearch: ${error}`);
    }
  }

  async disconnect(): Promise<void> {
    await this.client.close();
    this.connected = false;
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

  async insert(data: CreateHospitalMetric): Promise<string> {
    const id = uuidv4();
    const doc: HospitalMetric = {
      ...data,
      id,
      timestamp: new Date(),
    };

    await this.client.index({
      index: this.indexName,
      id,
      body: doc,
      refresh: 'wait_for',
    });

    return id;
  }

  async bulkInsert(data: CreateHospitalMetric[]): Promise<BulkInsertResult> {
    const body = data.flatMap((item) => {
      const id = uuidv4();
      const doc: HospitalMetric = {
        ...item,
        id,
        timestamp: new Date(),
      };

      return [
        { index: { _index: this.indexName, _id: id } },
        doc,
      ];
    });

    const response = await this.client.bulk({
      body,
      refresh: 'wait_for',
    });

    const errors: Array<{ index: number; error: string }> = [];
    let successful = 0;

    response.items.forEach((item: any) => {
      if (item.index.error) {
        errors.push({ index: 0, error: item.index.error.reason });
      } else {
        successful++;
      }
    });

    return {
      successful,
      failed: errors.length,
      errors,
    };
  }




  async query(filters: QueryFilter): Promise<QueryResult<HospitalMetric>> {
    const query = this.buildQuery(filters);
    const response = await this.client.search({
      index: this.indexName,
      body: {
        query,
        sort: [{ [filters.sortBy || 'timestamp']: { order: filters.sortOrder || 'desc' } }],
        from: filters.offset || 0,
        size: filters.limit || 100,
      },
    });

    const data = response.hits.hits.map((hit: any) => hit._source as HospitalMetric);

    const total = typeof response.hits.total === 'number' ? response.hits.total : response.hits.total?.value || 0;

    return {
      data,
      total,
      took: response.took,
      hasMore: (filters.offset || 0) + data.length < total,
    };
  }






  async createIndex(): Promise<void> {
    await this.client.indices.create({
      index: this.indexName,
      body: {
        settings: {
          number_of_shards: 1,
          number_of_replicas: 0,
        },
        mappings: {
          properties: {
            id: { type: 'keyword' },
            timestamp: { type: 'date' },
            waitTimeMinutes: { type: 'integer' },
            totalPatients: { type: 'integer' },
            ambulancePatients: { type: 'integer' },
            emergencyCases: { type: 'integer' },
            updateDelayMinutes: { type: 'integer' },
            scrapingSuccess: { type: 'boolean' },
            sourceUrl: { type: 'keyword' },
            metadata: {
              properties: {
                scraperId: { type: 'keyword' },
                version: { type: 'keyword' },
                processingTimeMs: { type: 'integer' },
                browserType: { type: 'keyword' },
                userAgent: { type: 'text', index: false },
                screenResolution: { type: 'keyword' },
                errorMessage: { type: 'text' },
              },
            },
          },
        },
      },
    });
  }


  async cleanup(olderThan: Date): Promise<number> {
    const response = await this.client.deleteByQuery({
      index: this.indexName,
      body: {
        query: {
          range: {
            timestamp: {
              lt: olderThan.toISOString(),
            },
          },
        },
      },
      refresh: true,
    });

    return response.deleted || 0;
  }


  private async ensureIndexExists(): Promise<void> {
    const exists = await this.client.indices.exists({ index: this.indexName });
    if (!exists) {
      await this.createIndex();
    }
  }

  private buildQuery(filters: QueryFilter): any {
    const must: any[] = [];

    if (filters.timeRange) {
      must.push({
        range: {
          timestamp: {
            gte: filters.timeRange.startTime.toISOString(),
            lte: filters.timeRange.endTime.toISOString(),
          },
        },
      });
    }

    if (filters.scrapingSuccess !== undefined) {
      must.push({
        term: { scrapingSuccess: filters.scrapingSuccess },
      });
    }

    if (filters.minWaitTime !== undefined) {
      must.push({
        range: { waitTimeMinutes: { gte: filters.minWaitTime } },
      });
    }

    if (filters.maxWaitTime !== undefined) {
      must.push({
        range: { waitTimeMinutes: { lte: filters.maxWaitTime } },
      });
    }

    if (filters.sourceUrl) {
      must.push({
        term: { sourceUrl: filters.sourceUrl },
      });
    }

    return must.length > 0 ? { bool: { must } } : { match_all: {} };
  }
}