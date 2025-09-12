import { HospitalMetric, TimeRange } from '@/models/hospital-metric';

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

export interface AggregationOptions {
  interval: '1h' | '6h' | '12h' | '1d' | '1w' | '1M';
  metric: 'avg' | 'min' | 'max' | 'sum' | 'count';
  field: keyof Pick<HospitalMetric, 'waitTimeMinutes' | 'totalPatients' | 'ambulancePatients' | 'emergencyCases'>;
}

export interface TimeAggregation {
  timestamp: Date;
  value: number;
  count: number;
  interval: string;
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