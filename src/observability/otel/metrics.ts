import { metrics } from '@opentelemetry/api';
import type { Meter, Counter, Histogram, Gauge } from '@opentelemetry/api';
import { ObservabilityMetrics } from '@/observability/interfaces/observability-provider.interface';

export class OtelMetrics implements ObservabilityMetrics {
  private readonly meter: Meter;

  // === BUSINESS METRICS ===
  // Critical for understanding application health and data quality
  readonly hospitalWaitTime: Gauge;
  readonly hospitalPatientCount: Gauge;
  readonly dataQualityScore: Gauge;
  readonly dataFreshnessMinutes: Gauge;

  // === SCRAPING METRICS ===
  // Essential for production monitoring of scraping operations
  readonly scrapingAttempts: Counter;
  readonly scrapingSuccess: Counter;
  readonly scrapingFailures: Counter;
  readonly scrapingDuration: Histogram;
  readonly scrapingRetryCount: Histogram;

  // === BROWSER METRICS ===
  // Important for understanding browser performance and issues
  readonly browserLaunchDuration: Histogram;
  readonly browserNavigationDuration: Histogram;
  readonly browserMemoryUsage: Gauge;
  readonly browserCrashes: Counter;

  // === DATABASE METRICS ===
  // Critical for database performance monitoring
  readonly dbConnectionHealth: Gauge;
  readonly dbOperationDuration: Histogram;
  readonly dbOperationErrors: Counter;
  readonly recordsInserted: Counter;

  // === TECHNICAL METRICS ===
  // Essential for system health monitoring
  readonly applicationUptime: Gauge;
  readonly memoryUsage: Gauge;
  readonly errorRate: Gauge;
  readonly heartbeat: Counter;

  // === ERROR CATEGORIZATION ===
  // Important for understanding failure patterns
  readonly errorsByCategory: Counter;
  readonly recoveryTime: Histogram;

  constructor(serviceName: string) {
    this.meter = metrics.getMeter(serviceName);

    // === BUSINESS METRICS ===
    this.hospitalWaitTime = this.meter.createGauge('hospital_wait_time_minutes', {
      description: 'Current emergency room wait time in minutes',
    });

    this.hospitalPatientCount = this.meter.createGauge('hospital_patient_count', {
      description: 'Current number of patients in emergency room',
    });

    this.dataQualityScore = this.meter.createGauge('data_quality_score', {
      description: 'Data quality score from 0-1 based on completeness and accuracy',
    });

    this.dataFreshnessMinutes = this.meter.createGauge('data_freshness_minutes', {
      description: 'Age of the scraped data in minutes',
    });

    // === SCRAPING METRICS ===
    this.scrapingAttempts = this.meter.createCounter('scraping_attempts_total', {
      description: 'Total number of scraping attempts',
    });

    this.scrapingSuccess = this.meter.createCounter('scraping_success_total', {
      description: 'Total number of successful scraping operations',
    });

    this.scrapingFailures = this.meter.createCounter('scraping_failures_total', {
      description: 'Total number of failed scraping operations by error type',
    });

    this.scrapingDuration = this.meter.createHistogram('scraping_duration_seconds', {
      description: 'End-to-end scraping operation duration in seconds',
      advice: { explicitBucketBoundaries: [1, 5, 10, 30, 60, 120, 300] }, // Production-relevant boundaries
    });

    this.scrapingRetryCount = this.meter.createHistogram('scraping_retry_count', {
      description: 'Number of retries per scraping operation',
      advice: { explicitBucketBoundaries: [0, 1, 2, 3, 5] }, // Retry pattern analysis
    });

    // === BROWSER METRICS ===
    this.browserLaunchDuration = this.meter.createHistogram('browser_launch_duration_seconds', {
      description: 'Time to launch browser in seconds',
      advice: { explicitBucketBoundaries: [0.5, 1, 2, 5, 10] }, // Browser startup performance
    });

    this.browserNavigationDuration = this.meter.createHistogram(
      'browser_navigation_duration_seconds',
      {
        description: 'Time to navigate to target page in seconds',
        advice: { explicitBucketBoundaries: [1, 3, 5, 10, 20, 30] }, // Page load performance
      }
    );

    this.browserMemoryUsage = this.meter.createGauge('browser_memory_usage_bytes', {
      description: 'Browser memory usage in bytes',
    });

    this.browserCrashes = this.meter.createCounter('browser_crashes_total', {
      description: 'Total number of browser crashes by reason',
    });

    // === DATABASE METRICS ===
    this.dbConnectionHealth = this.meter.createGauge('db_connection_healthy', {
      description: 'Database connection health status (1=healthy, 0=unhealthy)',
    });

    this.dbOperationDuration = this.meter.createHistogram('db_operation_duration_seconds', {
      description: 'Database operation duration in seconds by operation type',
      advice: { explicitBucketBoundaries: [0.001, 0.01, 0.1, 0.5, 1, 2, 5] }, // Database performance
    });

    this.dbOperationErrors = this.meter.createCounter('db_operation_errors_total', {
      description: 'Total database operation errors by type',
    });

    this.recordsInserted = this.meter.createCounter('records_inserted_total', {
      description: 'Total number of records successfully inserted',
    });

    // === TECHNICAL METRICS ===
    this.applicationUptime = this.meter.createGauge('application_uptime_seconds', {
      description: 'Application uptime in seconds',
    });

    this.memoryUsage = this.meter.createGauge('memory_usage_bytes', {
      description: 'Application memory usage in bytes by type',
    });

    this.errorRate = this.meter.createGauge('error_rate_percent', {
      description: 'Current error rate percentage over last 5 minutes',
    });

    this.heartbeat = this.meter.createCounter('app_heartbeat_total', {
      description: 'Application heartbeat for monitoring pipeline connectivity',
    });

    // === ERROR CATEGORIZATION ===
    this.errorsByCategory = this.meter.createCounter('errors_by_category_total', {
      description: 'Total errors categorized by type for better alerting',
    });

    this.recoveryTime = this.meter.createHistogram('recovery_time_seconds', {
      description: 'Time to recover from failures in seconds',
      advice: { explicitBucketBoundaries: [1, 5, 10, 30, 60, 300, 600] }, // Recovery pattern analysis
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

      // Memory usage with detailed breakdown
      const memUsage = process.memoryUsage();
      this.memoryUsage.record(memUsage.heapUsed, { type: 'heap_used' });
      this.memoryUsage.record(memUsage.heapTotal, { type: 'heap_total' });
      this.memoryUsage.record(memUsage.rss, { type: 'rss' });
      this.memoryUsage.record(memUsage.external, { type: 'external' });

      // Emit heartbeat
      this.heartbeat.add(1, { source: 'system_metrics' });
    }, 30000);
  }

  // === BUSINESS METRIC RECORDING ===
  recordHospitalData(
    waitTime: number,
    patientCount: number,
    dataAge: number,
    qualityScore: number,
    labels?: { department?: 'adult' | 'children'; [key: string]: any }
  ): void {
    const baseLabels = labels || {};
    const department = baseLabels.department || 'unknown';

    // Enhanced labels with department awareness
    const metricLabels = {
      ...baseLabels,
      department,
    };

    this.hospitalWaitTime.record(waitTime, metricLabels);
    this.hospitalPatientCount.record(patientCount, metricLabels);
    this.dataFreshnessMinutes.record(dataAge, metricLabels);
    this.dataQualityScore.record(qualityScore, metricLabels);
  }

  // === SCRAPING METRIC RECORDING ===
  recordScrapingAttempt(source: string, attemptNumber: number = 1): void {
    this.scrapingAttempts.add(1, {
      source,
      attempt_type: attemptNumber === 1 ? 'initial' : 'retry',
    });
  }

  recordScrapingSuccess(source: string, duration: number, retryCount: number): void {
    this.scrapingSuccess.add(1, { source });
    this.scrapingDuration.record(duration, { source, status: 'success' });
    this.scrapingRetryCount.record(retryCount, { source, outcome: 'success' });
  }

  recordScrapingFailure(
    source: string,
    duration: number,
    errorType: string,
    retryCount: number
  ): void {
    this.scrapingFailures.add(1, { source, error_type: errorType });
    this.scrapingDuration.record(duration, { source, status: 'failure' });
    this.scrapingRetryCount.record(retryCount, { source, outcome: 'failure' });
    this.errorsByCategory.add(1, { category: 'scraping', error_type: errorType });
  }

  // === BROWSER METRIC RECORDING ===
  recordBrowserLaunch(duration: number, browserType: string): void {
    this.browserLaunchDuration.record(duration, { browser_type: browserType });
  }

  recordBrowserNavigation(duration: number, targetHost: string, success: boolean): void {
    this.browserNavigationDuration.record(duration, {
      target_host: targetHost,
      success: success.toString(),
    });
  }

  recordBrowserCrash(reason: string): void {
    this.browserCrashes.add(1, { crash_reason: reason });
    this.errorsByCategory.add(1, { category: 'browser', error_type: reason });
  }

  // === DATABASE METRIC RECORDING ===
  recordDatabaseOperation(
    operation: string,
    success: boolean,
    duration: number,
    labels?: Record<string, any>
  ): void {
    const baseLabels = labels || {};
    const metricLabels = {
      operation,
      success: success.toString(),
      ...baseLabels,
    };

    if (success) {
      this.recordsInserted.add(1, metricLabels);
    } else {
      this.dbOperationErrors.add(1, { ...metricLabels, error_type: 'operation_failed' });
      this.errorsByCategory.add(1, { category: 'database', error_type: 'operation_failed' });
    }

    // Record duration
    this.dbOperationDuration.record(duration, metricLabels);
  }

  recordJobExecution(jobType: string, duration: number, success: boolean): void {
    const labels = {
      job_type: jobType,
      success: success.toString(),
    };

    if (success) {
      this.scrapingSuccess.add(1, labels);
    } else {
      this.scrapingFailures.add(1, { ...labels, error_type: 'job_execution_failed' });
    }

    this.scrapingDuration.record(duration, labels);
  }

  recordDatabaseHealth(healthy: boolean, responseTime?: number): void {
    this.dbConnectionHealth.record(healthy ? 1 : 0);
    if (responseTime !== undefined) {
      this.dbOperationDuration.record(responseTime, {
        operation: 'health_check',
        success: healthy.toString(),
      });
    }
  }

  // === ERROR AND RECOVERY TRACKING ===
  recordError(category: string, errorType: string): void {
    this.errorsByCategory.add(1, { category, error_type: errorType });
  }

  recordRecovery(operation: string, recoveryDuration: number): void {
    this.recoveryTime.record(recoveryDuration, { operation });
  }

  // === CONNECTIVITY VERIFICATION ===

  recordHeartbeat(attributes?: Record<string, string>): void {
    this.heartbeat.add(1, { source: 'manual', ...attributes });
  }
}
