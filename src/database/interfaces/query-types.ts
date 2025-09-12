import { TimeRange } from '@/models/hospital-metric';

export interface QueryFilter {
  timeRange?: TimeRange;
  scrapingSuccess?: boolean;
  minWaitTime?: number;
  maxWaitTime?: number;
  sourceUrl?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'timestamp' | 'waitTimeMinutes' | 'totalPatients';
  sortOrder?: 'asc' | 'desc';
}


export interface DatabaseHealth {
  connected: boolean;
  responseTimeMs: number;
  version?: string;
  clusterHealth?: 'green' | 'yellow' | 'red';
  indexCount?: number;
  documentCount?: number;
  lastError?: string;
}

export interface BulkInsertResult {
  successful: number;
  failed: number;
  errors: Array<{
    index: number;
    error: string;
  }>;
}

export interface QueryResult<T> {
  data: T[];
  total: number;
  took: number;
  hasMore: boolean;
}