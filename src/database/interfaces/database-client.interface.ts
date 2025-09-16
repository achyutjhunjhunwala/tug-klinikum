import { HospitalMetric, CreateHospitalMetric } from '@/models/hospital-metric';
import { QueryFilter, DatabaseHealth, BulkInsertResult, QueryResult } from './query-types';

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
  insert(data: Omit<CreateHospitalMetric, 'department'>): Promise<string>;
  bulkInsert(data: CreateHospitalMetric[]): Promise<BulkInsertResult>;

  /**
   * Query Operations
   */
  query(
    filters?: QueryFilter,
    limit?: number,
    offset?: number
  ): Promise<QueryResult<HospitalMetric>>;

  /**
   * Maintenance Operations
   */
  createIndex(indexName?: string): Promise<void>;
  cleanup(olderThan?: Date): Promise<void | number>;
  
  /**
   * Production Setup Operations
   */
  setupIndexTemplates(): Promise<void>;
  setupILMPolicies(): Promise<void>;
  ensureProductionInfrastructure(): Promise<void>;
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
