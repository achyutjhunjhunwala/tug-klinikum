// Simplified database types for the API server

export interface HospitalMetric {
  id: string;
  timestamp: Date;
  department: 'adult' | 'children';
  waitTimeMinutes: number;
  totalPatients?: number;
  ambulancePatients?: number;
  emergencyCases?: number;
  updateDelayMinutes?: number;
  scrapingSuccess: boolean;
  sourceUrl: string;
  metadata: {
    scraperId: string;
    version: string;
    processingTimeMs: number;
    browserType?: 'chromium' | 'firefox' | 'webkit';
    userAgent?: string;
    screenResolution?: string;
    viewportSize?: string;
    errorMessage?: string;
  };
}

export interface DatabaseHealth {
  connected: boolean;
  responseTimeMs: number;
  version?: string;
  lastError?: string;
  clusterHealth?: 'green' | 'yellow' | 'red';
  indexCount?: number;
  documentCount?: number;
}

export interface QueryFilter {
  department?: 'adult' | 'children';
  dateRange?: {
    from: Date;
    to: Date;
  };
  sortBy?: 'timestamp' | 'waitTimeMinutes';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface QueryResult<T> {
  data: T[];
  total: number;
  offset: number;
  limit: number;
}

export interface DatabaseClient {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  healthCheck(): Promise<DatabaseHealth>;
  query(filters?: QueryFilter): Promise<QueryResult<HospitalMetric>>;
}