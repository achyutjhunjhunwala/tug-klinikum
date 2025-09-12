import { 
  HospitalMetric, 
  CreateHospitalMetric
} from '@/models/hospital-metric';
import { 
  QueryFilter, 
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

  /**
   * Query Operations
   */
  query(filters: QueryFilter): Promise<QueryResult<HospitalMetric>>;


  /**
   * Maintenance Operations
   */
  createIndex(): Promise<void>;
  cleanup(olderThan: Date): Promise<number>;

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