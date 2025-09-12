// Database interfaces
export type { DatabaseClient, DatabaseConnectionConfig } from './interfaces/database-client.interface';
export type { 
  QueryFilter, 
  AggregationOptions, 
  TimeAggregation, 
  DatabaseHealth,
  BulkInsertResult,
  QueryResult 
} from './interfaces/query-types';

// Database implementations
export { ElasticsearchClient } from './implementations/elasticsearch-client';
export { PostgreSQLClient } from './implementations/postgresql-client';

// Factory
export { DatabaseFactory } from './factory';

// Re-export models for convenience
export type { 
  HospitalMetric, 
  CreateHospitalMetric, 
  HospitalMetricSummary, 
  HospitalMetricTrend,
  TimeRange 
} from '@/models/hospital-metric';