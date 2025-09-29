import { DatabaseClient, HospitalMetric } from '../types/database';
import { ElasticsearchClient } from './elasticsearchClient';
import {
  Department,
  TimeRange,
  CurrentHospitalMetrics,
  HistoricalDataPoint,
  HospitalMetricsResponse
} from '../types/hospital';
import { PinoLogger } from '../observability';

export class HospitalService {
  private dbClient?: DatabaseClient;
  private logger: PinoLogger;

  constructor() {
    this.logger = new PinoLogger();
    // Database client will be initialized later
  }

  async initialize(): Promise<void> {
    // Create the client only when we initialize
    this.dbClient = new ElasticsearchClient();
    await this.dbClient.connect();
  }

  private getDbClient(): DatabaseClient {
    if (!this.dbClient) {
      throw new Error('HospitalService not initialized. Call initialize() first.');
    }
    return this.dbClient;
  }

  async shutdown(): Promise<void> {
    if (this.dbClient) {
      await this.dbClient.disconnect();
    }
  }

  async getHospitalMetrics(
    department: Department,
    timeRange: TimeRange,
    customFrom?: string,
    customTo?: string
  ): Promise<HospitalMetricsResponse> {
    try {
      // Calculate time range boundaries
      const { from, to } = this.calculateTimeRange(timeRange, customFrom, customTo);

      // Build query filters
      const filters = {
        department,
        dateRange: { from, to },
        sortBy: 'timestamp' as const,
        sortOrder: 'desc' as const,
        limit: 1000 // Reasonable limit for historical data
      };

      // Query the database
      const queryResult = await this.getDbClient().query(filters);
      const records = queryResult.data;

      if (records.length === 0) {
        throw new Error(`No data found for ${department} department in the specified time range`);
      }

      // Get the most recent record for current metrics
      const mostRecent = records[0];

      // Prepare current metrics
      const current: CurrentHospitalMetrics = {
        waitTimeMinutes: mostRecent.waitTimeMinutes,
        totalPatients: mostRecent.totalPatients,
        ambulancePatients: mostRecent.ambulancePatients,
        emergencyCases: mostRecent.emergencyCases,
        lastUpdated: mostRecent.timestamp.toISOString(),
        updateDelayMinutes: mostRecent.updateDelayMinutes
      };

      // Prepare historical data (sample data points for better performance)
      const historical = this.sampleHistoricalData(records, timeRange);

      // Calculate data quality score
      const dataQuality = this.calculateDataQuality(records);

      return {
        success: true,
        data: {
          current,
          historical,
          metadata: {
            department,
            timeRange: customFrom && customTo ? 'custom' : timeRange,
            totalRecords: records.length,
            dataQuality
          }
        }
      };

    } catch (error) {
      this.logger.error('Error fetching hospital metrics', {
        error: error instanceof Error ? error.message : String(error),
        department,
        timeRange,
        from: customFrom,
        to: customTo
      });

      return {
        success: false,
        data: {
          current: {
            waitTimeMinutes: 0,
            lastUpdated: new Date().toISOString()
          },
          historical: [],
          metadata: {
            department,
            timeRange: customFrom && customTo ? 'custom' : timeRange,
            totalRecords: 0,
            dataQuality: 0
          }
        },
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  async getHealthStatus() {
    try {
      const dbHealth = await this.getDbClient().healthCheck();

      // Get the timestamp of the most recent data
      const recentDataQuery = await this.getDbClient().query({
        sortBy: 'timestamp' as const,
        sortOrder: 'desc' as const,
        limit: 1
      });

      const lastDataUpdate = recentDataQuery.data.length > 0
        ? recentDataQuery.data[0].timestamp.toISOString()
        : new Date(0).toISOString();

      return {
        status: dbHealth.connected ? 'healthy' as const : 'unhealthy' as const,
        uptime: process.uptime(),
        database: {
          connected: dbHealth.connected,
          responseTime: dbHealth.responseTimeMs || 0
        },
        lastDataUpdate
      };
    } catch (error) {
      this.logger.error('Health check failed', {
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        status: 'unhealthy' as const,
        uptime: process.uptime(),
        database: {
          connected: false,
          responseTime: 0
        },
        lastDataUpdate: new Date(0).toISOString()
      };
    }
  }

  private calculateTimeRange(
    timeRange: TimeRange,
    customFrom?: string,
    customTo?: string
  ): { from: Date; to: Date } {
    if (customFrom && customTo) {
      return {
        from: new Date(customFrom),
        to: new Date(customTo)
      };
    }

    const now = new Date();
    const to = now;
    let from: Date;

    switch (timeRange) {
      case '6h':
        from = new Date(now.getTime() - 6 * 60 * 60 * 1000);
        break;
      case '24h':
        from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '15d':
        from = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
        break;
      case '1m':
        from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '3m':
        from = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        throw new Error(`Invalid time range: ${timeRange}`);
    }

    return { from, to };
  }

  private sampleHistoricalData(
    records: HospitalMetric[],
    timeRange: TimeRange
  ): HistoricalDataPoint[] {
    // Determine sampling strategy based on time range and record count
    let sampleSize: number;

    if (timeRange === '6h' || timeRange === '24h') {
      sampleSize = Math.min(records.length, 50); // Every ~7-30 minutes
    } else if (timeRange === '7d') {
      sampleSize = Math.min(records.length, 100); // Every ~1-2 hours
    } else {
      sampleSize = Math.min(records.length, 200); // Every few hours
    }

    // Sample evenly across the time range
    const step = Math.max(1, Math.floor(records.length / sampleSize));
    const sampledRecords = records.filter((_, index) => index % step === 0);

    return sampledRecords.map(record => ({
      timestamp: record.timestamp.toISOString(),
      waitTimeMinutes: record.waitTimeMinutes,
      totalPatients: record.totalPatients,
      ambulancePatients: record.ambulancePatients,
      emergencyCases: record.emergencyCases
    }));
  }

  private calculateDataQuality(records: HospitalMetric[]): number {
    if (records.length === 0) return 0;

    let qualityScore = 0;
    let factors = 0;

    // Check data completeness
    const completeRecords = records.filter(record =>
      record.waitTimeMinutes !== undefined &&
      record.totalPatients !== undefined &&
      record.scrapingSuccess === true
    );

    if (completeRecords.length > 0) {
      qualityScore += (completeRecords.length / records.length) * 0.4; // 40% weight
      factors++;
    }

    // Check data freshness (most recent record should be within last hour)
    const mostRecent = records[0];
    const age = Date.now() - mostRecent.timestamp.getTime();
    const ageHours = age / (1000 * 60 * 60);

    if (ageHours < 1) {
      qualityScore += 0.3; // 30% weight for fresh data
    } else if (ageHours < 6) {
      qualityScore += 0.15; // 15% weight for somewhat fresh data
    }
    factors++;

    // Check data reasonableness
    const reasonableRecords = records.filter(record =>
      record.waitTimeMinutes >= 0 && record.waitTimeMinutes <= 600 && // 0-10 hours is reasonable
      (record.totalPatients === undefined || (record.totalPatients >= 0 && record.totalPatients <= 200))
    );

    if (reasonableRecords.length > 0) {
      qualityScore += (reasonableRecords.length / records.length) * 0.3; // 30% weight
      factors++;
    }

    return factors > 0 ? Math.min(1, qualityScore) : 0;
  }
}