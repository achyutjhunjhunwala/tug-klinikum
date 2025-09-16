// Database interfaces
export type {
  DatabaseClient,
  DatabaseConnectionConfig,
} from './interfaces/database-client.interface';
export type {
  QueryFilter,
  DatabaseHealth,
  BulkInsertResult,
  QueryResult,
} from './interfaces/query-types';

// Database implementations
export { ElasticsearchClient } from './implementations/elasticsearch-client';

// Templates and policies
export * from './elasticsearch-templates';

// Factory
export { DatabaseFactory } from './factory';

// Re-export models for convenience
export type { HospitalMetric, CreateHospitalMetric, TimeRange } from '@/models/hospital-metric';
