import axios from 'axios';
import type { AxiosInstance, AxiosResponse } from 'axios';
import type { HospitalMetricsResponse, HealthCheckResponse, Department, TimeRange, RateLimitErrorResponse } from '@shared/types/hospital';

class HospitalApiService {
  private client: AxiosInstance;
  private baseURL: string;

  constructor() {
    // Use relative URL in production (served from same origin)
    // Use localhost in development (separate dev servers)
    this.baseURL = import.meta.env.VITE_API_URL || '/api';

    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        console.log(`🚀 API Request: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        console.error('❌ API Request Error:', error);
        return Promise.reject(error);
      }
    );

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response: AxiosResponse) => {
        console.log(`✅ API Response: ${response.status} ${response.config.url}`);
        return response;
      },
      (error) => {
        console.error('❌ API Response Error:', error.response?.status, error.response?.data);

        // Transform axios error to our RateLimitErrorResponse type
        if (error.response?.data) {
          const apiError: RateLimitErrorResponse = {
            error: error.response.data.error || 'Request failed',
            message: error.response.data.message || error.message,
            timestamp: error.response.data.timestamp || new Date().toISOString(),
            statusCode: error.response.status,
            path: error.response.data.path,
            retryAfter: error.response.data.retryAfter || 60,
            limit: error.response.data.limit || 20,
            remaining: error.response.data.remaining || 0,
          };
          return Promise.reject(apiError);
        }

        return Promise.reject(error);
      }
    );
  }

  /**
   * Get hospital metrics for a specific department and time range
   */
  async getHospitalMetrics(
    department: Department,
    timeRange: TimeRange,
    customDateRange?: { from: string; to: string }
  ): Promise<HospitalMetricsResponse> {
    const params: Record<string, string> = {
      department,
      timeRange,
    };

    if (customDateRange) {
      params.from = customDateRange.from;
      params.to = customDateRange.to;
    }

    const response = await this.client.get<HospitalMetricsResponse>('/hospital/metrics', {
      params,
    });

    return response.data;
  }

  /**
   * Get API health status
   */
  async getHealth(): Promise<HealthCheckResponse> {
    const response = await this.client.get<HealthCheckResponse>('/health');
    return response.data;
  }

  /**
   * Get backend health status (uses same origin as API)
   */
  async getBackendHealth(): Promise<HealthCheckResponse> {
    // Use relative URL to work with any domain
    const response = await axios.get<HealthCheckResponse>('/health', {
      timeout: 5000,
    });
    return response.data;
  }

  /**
   * Test API connectivity
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.getBackendHealth();
      return true;
    } catch (error) {
      console.error('API connection test failed:', error);
      return false;
    }
  }

  /**
   * Get base URL for debugging
   */
  getBaseURL(): string {
    return this.baseURL;
  }
}

// Create singleton instance
export const hospitalApi = new HospitalApiService();

// Export class for testing
export { HospitalApiService };