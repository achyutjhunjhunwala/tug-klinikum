// Shared types for hospital metrics API
// NOTE: These are duplicated from ui/shared/types/hospital.ts to avoid cross-directory compilation issues
// Keep in sync manually when updating the contract

export type Department = 'adult' | 'children';
export type TimeRange = '6h' | '24h' | '7d' | '15d' | '1m' | '3m';

export interface CurrentHospitalMetrics {
  waitTimeMinutes: number;
  totalPatients?: number;
  ambulancePatients?: number;
  emergencyCases?: number;
  lastUpdated: string; // ISO timestamp
  updateDelayMinutes?: number;
}

export interface HistoricalDataPoint {
  timestamp: string; // ISO timestamp
  waitTimeMinutes: number;
  totalPatients?: number;
  ambulancePatients?: number;
  emergencyCases?: number;
}

export interface HospitalMetricsResponse {
  success: boolean;
  data: {
    current: CurrentHospitalMetrics;
    historical: HistoricalDataPoint[];
    metadata: {
      department: Department;
      timeRange: string;
      totalRecords: number;
      dataQuality: number; // 0-1 score
    };
  };
  error?: string;
}

export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  database: {
    connected: boolean;
    responseTime: number;
  };
  lastDataUpdate: string;
}

export interface ApiErrorResponse {
  error: string;
  message: string;
  timestamp: string;
  path: string;
  statusCode: number;
}

export interface RateLimitErrorResponse extends ApiErrorResponse {
  retryAfter: number;
  limit: number;
  remaining: number;
}

// Query parameters for the metrics endpoint
export interface MetricsQueryParams {
  department: Department;
  timeRange: TimeRange;
  from?: string; // ISO timestamp, overrides timeRange
  to?: string; // ISO timestamp, overrides timeRange
}