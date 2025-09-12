import { Client } from '@elastic/elasticsearch';
import { v4 as uuidv4 } from 'uuid';
import { 
  DatabaseClient, 
  DatabaseConnectionConfig 
} from '@/database/interfaces/database-client.interface';
import {
  HospitalMetric,
  CreateHospitalMetric,
  HospitalMetricSummary,
  HospitalMetricTrend,
  TimeRange,
} from '@/models/hospital-metric';
import {
  QueryFilter,
  AggregationOptions,
  TimeAggregation,
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
        apiKey: config.apiKey
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

  async findById(id: string): Promise<HospitalMetric | null> {
    try {
      const response = await this.client.get({
        index: this.indexName,
        id,
      });

      return response._source as HospitalMetric;
    } catch (error: any) {
      if (error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  async update(id: string, data: Partial<HospitalMetric>): Promise<boolean> {
    try {
      await this.client.update({
        index: this.indexName,
        id,
        body: { doc: data },
        refresh: 'wait_for',
      });
      return true;
    } catch (error: any) {
      if (error.statusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      await this.client.delete({
        index: this.indexName,
        id,
        refresh: 'wait_for',
      });
      return true;
    } catch (error: any) {
      if (error.statusCode === 404) {
        return false;
      }
      throw error;
    }
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

  async count(filters?: QueryFilter): Promise<number> {
    const query = filters ? this.buildQuery(filters) : { match_all: {} };
    const response = await this.client.count({
      index: this.indexName,
      body: { query },
    });

    return response.count;
  }

  async getLatest(): Promise<HospitalMetric | null> {
    const result = await this.query({
      sortBy: 'timestamp',
      sortOrder: 'desc',
      limit: 1,
    });

    return result.data[0] || null;
  }

  async aggregateByTime(
    options: AggregationOptions,
    filters?: QueryFilter
  ): Promise<TimeAggregation[]> {
    const query = filters ? this.buildQuery(filters) : { match_all: {} };
    
    const response = await this.client.search({
      index: this.indexName,
      body: {
        query,
        size: 0,
        aggs: {
          time_buckets: {
            date_histogram: {
              field: 'timestamp',
              fixed_interval: options.interval,
              min_doc_count: 1,
            },
            aggs: {
              metric_value: {
                [options.metric]: {
                  field: options.field,
                },
              },
            },
          },
        },
      },
    });

    const aggregations = response.aggregations as any;
    if (!aggregations?.time_buckets) {
      return [];
    }
    return aggregations.time_buckets.buckets.map((bucket: any) => ({
      timestamp: new Date(bucket.key_as_string),
      value: bucket.metric_value.value || 0,
      count: bucket.doc_count,
      interval: options.interval,
    }));
  }

  async getSummary(timeRange?: TimeRange): Promise<HospitalMetricSummary> {
    const filters: QueryFilter = timeRange ? { timeRange } : {};
    const query = this.buildQuery(filters);

    const response = await this.client.search({
      index: this.indexName,
      body: {
        query,
        size: 0,
        aggs: {
          avg_wait_time: { avg: { field: 'waitTimeMinutes' } },
          min_wait_time: { min: { field: 'waitTimeMinutes' } },
          max_wait_time: { max: { field: 'waitTimeMinutes' } },
          success_count: { 
            filter: { term: { scrapingSuccess: true } } 
          },
          total_count: { value_count: { field: 'id' } },
          latest_timestamp: { max: { field: 'timestamp' } },
        },
      },
    });

    const aggs = response.aggregations as any;
    if (!aggs) {
      throw new Error('Aggregations not found in Elasticsearch response');
    }
    const totalCount = aggs.total_count.value;

    return {
      totalRecords: totalCount,
      avgWaitTime: Math.round(aggs.avg_wait_time.value || 0),
      minWaitTime: Math.round(aggs.min_wait_time.value || 0),
      maxWaitTime: Math.round(aggs.max_wait_time.value || 0),
      successRate: totalCount > 0 ? aggs.success_count.doc_count / totalCount : 0,
      lastUpdated: new Date(aggs.latest_timestamp.value_as_string),
    };
  }

  async getTrends(
    interval: '1h' | '6h' | '12h' | '1d' | '1w',
    timeRange?: TimeRange
  ): Promise<HospitalMetricTrend[]> {
    const aggregations = await this.aggregateByTime(
      { interval, metric: 'avg', field: 'waitTimeMinutes' },
      timeRange ? { timeRange } : undefined
    );

    return aggregations.map(agg => ({
      period: interval,
      avgWaitTime: Math.round(agg.value),
      patientCount: agg.count,
      timestamp: agg.timestamp,
    }));
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

  async deleteIndex(): Promise<void> {
    await this.client.indices.delete({ index: this.indexName });
  }

  async reindex(): Promise<void> {
    const tempIndex = `${this.indexName}-temp`;
    
    await this.client.reindex({
      body: {
        source: { index: this.indexName },
        dest: { index: tempIndex },
      },
      wait_for_completion: true,
    });

    await this.deleteIndex();
    await this.client.indices.clone({
      index: tempIndex,
      target: this.indexName,
    });
    
    await this.client.indices.delete({ index: tempIndex });
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

  async exportData(timeRange?: TimeRange): Promise<HospitalMetric[]> {
    const filters = timeRange ? { timeRange } : {};
    const result = await this.query({ ...filters, limit: 10000 });
    return result.data;
  }

  async importData(data: HospitalMetric[]): Promise<BulkInsertResult> {
    return this.bulkInsert(data);
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