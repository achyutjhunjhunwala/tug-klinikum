import { metrics } from '@opentelemetry/api';
import type { Meter, Counter, Histogram, Gauge } from '@opentelemetry/api';import { ObservabilityMetrics } from '@/observability/interfaces/observability-provider.interface';

export class OtelMetrics implements ObservabilityMetrics {
  private readonly meter: Meter;

  // Scraper metrics
  readonly scrapingAttempts: Counter;
  readonly scrapingSuccess: Counter;
  readonly scrapingFailures: Counter;
  readonly scrapingDuration: Histogram;

  // Data metrics
  readonly recordsInserted: Counter;
  readonly recordsInsertErrors: Counter;
  readonly dbConnectionHealth: Gauge;
  readonly dbResponseTime: Histogram;

  // Application metrics
  readonly applicationUptime: Gauge;
  readonly memoryUsage: Gauge;
  readonly cpuUsage: Gauge;

  constructor(serviceName: string) {
    this.meter = metrics.getMeter(serviceName);

    // Initialize scraper metrics
    this.scrapingAttempts = this.meter.createCounter('scraping_attempts_total', {
      description: 'Total number of scraping attempts',
    });

    this.scrapingSuccess = this.meter.createCounter('scraping_success_total', {
      description: 'Total number of successful scraping operations',
    });

    this.scrapingFailures = this.meter.createCounter('scraping_failures_total', {
      description: 'Total number of failed scraping operations',
    });

    this.scrapingDuration = this.meter.createHistogram('scraping_duration_seconds', {
      description: 'Duration of scraping operations in seconds',
    });

    // Initialize data metrics
    this.recordsInserted = this.meter.createCounter('records_inserted_total', {
      description: 'Total number of records inserted into database',
    });

    this.recordsInsertErrors = this.meter.createCounter('records_insert_errors_total', {
      description: 'Total number of database insert errors',
    });

    this.dbConnectionHealth = this.meter.createGauge('db_connection_healthy', {
      description: 'Database connection health status (1=healthy, 0=unhealthy)',
    });

    this.dbResponseTime = this.meter.createHistogram('db_response_time_seconds', {
      description: 'Database response time in seconds',
    });

    // Initialize application metrics
    this.applicationUptime = this.meter.createGauge('application_uptime_seconds', {
      description: 'Application uptime in seconds',
    });

    this.memoryUsage = this.meter.createGauge('memory_usage_bytes', {
      description: 'Memory usage in bytes',
    });

    this.cpuUsage = this.meter.createGauge('cpu_usage_percent', {
      description: 'CPU usage percentage',
    });

    this.startSystemMetricsCollection();
  }

  private startSystemMetricsCollection(): void {
    const startTime = Date.now();

    // Collect system metrics every 30 seconds
    setInterval(() => {
      // Application uptime
      const uptimeSeconds = (Date.now() - startTime) / 1000;
      this.applicationUptime.record(uptimeSeconds);

      // Memory usage
      const memUsage = process.memoryUsage();
      this.memoryUsage.record(memUsage.heapUsed, {
        type: 'heap_used',
      });
      this.memoryUsage.record(memUsage.heapTotal, {
        type: 'heap_total',
      });
      this.memoryUsage.record(memUsage.rss, {
        type: 'rss',
      });

      // CPU usage (simplified)
      const cpuUsage = process.cpuUsage();
      const totalCpuTime = (cpuUsage.user + cpuUsage.system) / 1000000; // Convert to seconds
      this.cpuUsage.record(totalCpuTime);
    }, 30000);
  }

  // Utility methods for common metric patterns
  recordScrapingAttempt(source: string): void {
    this.scrapingAttempts.add(1, { source });
  }

  recordScrapingSuccess(scraperId: string, duration: number): void {
    this.scrapingSuccess.add(1, { scraperId });
    this.scrapingDuration.record(duration, { scraperId, status: 'success' });
  }

  recordScrapingFailure(scraperId: string, duration: number, reason: string): void {
    this.scrapingFailures.add(1, { scraperId, error_type: reason });
    this.scrapingDuration.record(duration, { scraperId, status: 'failure' });
  }

  recordDatabaseOperation(operation: string, success: boolean, duration: number): void {
    if (success) {
      this.recordsInserted.add(1, { operation });
    } else {
      this.recordsInsertErrors.add(1, { operation });
    }
    this.dbResponseTime.record(duration, { operation, success: success.toString() });
  }

  recordDatabaseHealth(healthy: boolean): void {
    this.dbConnectionHealth.record(healthy ? 1 : 0);
  }
}