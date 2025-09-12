import { 
  HospitalMetric, 
  CreateHospitalMetric, 
  HospitalMetricSummary, 
  HospitalMetricTrend,
  TimeRange 
} from '@/models/hospital-metric';
import { 
  QueryFilter, 
  AggregationOptions, 
  TimeAggregation, 
  DatabaseHealth,
  BulkInsertResult,
  QueryResult
} from './query-types';

export interface DatabaseClient {
  /**
   * Connection Management
   */
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  healthCheck(): Promise<DatabaseHealth>;

  /**
   * Basic CRUD Operations
   */
  insert(data: CreateHospitalMetric): Promise<string>;
  bulkInsert(data: CreateHospitalMetric[]): Promise<BulkInsertResult>;
  findById(id: string): Promise<HospitalMetric | null>;
  update(id: string, data: Partial<HospitalMetric>): Promise<boolean>;
  delete(id: string): Promise<boolean>;

  /**
   * Query Operations
   */
  query(filters: QueryFilter): Promise<QueryResult<HospitalMetric>>;
  count(filters?: QueryFilter): Promise<number>;
  getLatest(): Promise<HospitalMetric | null>;

  /**
   * Aggregation Operations
   */
  aggregateByTime(
    options: AggregationOptions,
    filters?: QueryFilter
  ): Promise<TimeAggregation[]>;
  
  getSummary(timeRange?: TimeRange): Promise<HospitalMetricSummary>;
  
  getTrends(
    interval: '1h' | '6h' | '12h' | '1d' | '1w',
    timeRange?: TimeRange
  ): Promise<HospitalMetricTrend[]>;

  /**
   * Maintenance Operations
   */
  createIndex(): Promise<void>;
  deleteIndex(): Promise<void>;
  reindex(): Promise<void>;
  cleanup(olderThan: Date): Promise<number>;

  /**
   * Backup & Migration
   */
  exportData(timeRange?: TimeRange): Promise<HospitalMetric[]>;
  importData(data: HospitalMetric[]): Promise<BulkInsertResult>;
}

export interface DatabaseConnectionConfig {
  type: 'elasticsearch' | 'postgresql';
  url: string;
  apiKey?: string | undefined;
  username?: string | undefined;
  password?: string | undefined;
  database?: string | undefined;
  ssl?: boolean | undefined;
  timeout?: number | undefined;
  retries?: number | undefined;
  indexName?: string | undefined;
  tableName?: string | undefined;
}