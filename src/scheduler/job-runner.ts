import { ObservabilityProvider } from '@/observability';
import { DatabaseClient } from '@/database';
import { PlaywrightScraper, ScrapingResult } from '@/scraper/playwright-scraper';

export interface JobRunnerConfig {
  scrapingInterval: number; // minutes
  timezone: string;
  maxConcurrentJobs: number;
  healthCheckInterval: number; // milliseconds
}

export interface JobExecutionResult {
  success: boolean;
  jobId: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  scrapingResult?: ScrapingResult | undefined;
  error?: string | undefined;
  recordsInserted: number;
}

export class JobRunner {
  private isRunning = false;
  private currentJobId: string | undefined;
  private executionHistory: JobExecutionResult[] = [];
  private readonly maxHistorySize = 100;

  constructor(
    private readonly config: JobRunnerConfig,
    private readonly database: DatabaseClient,
    private readonly scraper: PlaywrightScraper,
    private readonly observability: ObservabilityProvider
  ) {}

  async initialize(): Promise<void> {
    return this.observability.tracer.wrapAsync('job_runner_initialize', async span => {
      span.setAttributes({
        'job_runner.scraping_interval': this.config.scrapingInterval,
        'job_runner.timezone': this.config.timezone,
        'job_runner.max_concurrent_jobs': this.config.maxConcurrentJobs,
      });

      this.observability.logger.info('Initializing job runner', {
        scrapingInterval: this.config.scrapingInterval,
        timezone: this.config.timezone,
        maxConcurrentJobs: this.config.maxConcurrentJobs,
      });

      // Initialize scraper
      await this.scraper.initialize();

      // Verify database connection
      if (!this.database.isConnected()) {
        await this.database.connect();
      }

      // Skip health check to avoid OpenTelemetry trace header conflicts with Elasticsearch
      // The database connection is already verified during early initialization
      const dbHealth = { connected: this.database.isConnected(), responseTimeMs: 0 };

      this.observability.logger.info('Job runner initialized successfully', {
        databaseHealth: dbHealth,
      });
    });
  }

  async executeScrapingJob(): Promise<JobExecutionResult> {
    const jobId = this.observability.createCorrelationId();
    const startTime = new Date();

    this.currentJobId = jobId;
    this.isRunning = true;

    return this.observability.tracer.wrapAsync('job_execution', async span => {
      span.setAttributes({
        'job.id': jobId,
        'job.type': 'scraping',
        'job.start_time': startTime.toISOString(),
      });

      this.observability.logger.info('Starting scraping job execution', {
        jobId,
        startTime,
      });

      let result: JobExecutionResult | undefined;

      try {
        // Define both URLs to scrape
        const urls = [
          {
            url: process.env['ADULT_TARGET_URL'] || 'https://www.vivantes.de/klinikum-im-friedrichshain/rettungsstelle',
            department: 'adult'
          },
          {
            url: process.env['CHILDREN_TARGET_URL'] || 'https://www.vivantes.de/klinikum-im-friedrichshain/kinder-jugendmedizin/kinderrettungsstelle',
            department: 'children'
          }
        ];

        let recordsInserted = 0;

        // Scrape each URL sequentially
        for (const { url, department } of urls) {
          this.observability.logger.info('Starting scraping for department', {
            jobId,
            department,
            url,
          });


          // Update the target URL internally
          (this.scraper as any).config.targetUrl = url;

          // Execute scraping
          const scrapingResult = await this.scraper.scrape();

          if (scrapingResult.success && scrapingResult.data) {
            // Add department info to the data
            scrapingResult.data.department = department as 'adult' | 'children';
            scrapingResult.data.sourceUrl = url;

            // Insert data into database
            try {
              const documentId = await this.database.insert(scrapingResult.data);
              recordsInserted++;

              this.observability.logger.info('Data inserted successfully', {
                jobId,
                department,
                documentId,
                waitTime: scrapingResult.data.waitTimeMinutes,
              });

              this.observability.metrics.recordsInserted.add(1, {
                job_id: jobId,
                source: 'vivantes',
                department,
              });
            } catch (dbError) {
              this.observability.recordError('database_insert_failed', dbError as Error, {
                job_id: jobId,
                scraping_success: true,
                department,
              });

              // Don't fail the entire job if scraping succeeded but DB insert failed
              this.observability.logger.warn('Database insert failed but scraping succeeded', {
                jobId,
                department,
                error: (dbError as Error).message,
              });
            }
          } else {
            this.observability.logger.warn('Scraping failed for department', {
              jobId,
              department,
              error: scrapingResult.error,
            });
          }
        }

        const endTime = new Date();
        const duration = endTime.getTime() - startTime.getTime();

        result = {
          success: recordsInserted > 0,
          jobId,
          startTime,
          endTime,
          duration,
          scrapingResult: recordsInserted > 0 ? {
            success: true,
            metrics: { totalTime: duration, pageLoadTime: 0, extractionTime: 0, retries: 0 },
            metadata: { url: urls.map(u => u.url).join(', '), timestamp: endTime, scraperId: `hospital-scraper-multi-${process.pid}`, browserType: 'chromium' },
          } : {
            success: false,
            error: 'No data could be scraped from any department',
            metrics: { totalTime: duration, pageLoadTime: 0, extractionTime: 0, retries: 0 },
            metadata: { url: urls.map(u => u.url).join(', '), timestamp: endTime, scraperId: `hospital-scraper-multi-${process.pid}`, browserType: 'chromium' },
          },
          recordsInserted,
          error: recordsInserted === 0 ? 'No data could be scraped from any department' : undefined,
        };

        span.setAttributes({
          'job.success': result.success,
          'job.duration_ms': duration,
          'job.records_inserted': recordsInserted,
          'job.departments_scraped': urls.length,
        });

        if (result.success) {
          this.observability.logger.info('Job execution completed successfully', {
            jobId,
            duration,
            recordsInserted,
            departmentsScraped: urls.length,
          });
        } else {
          this.observability.logger.error('Job execution failed', new Error(result.error!), {
            jobId,
            duration,
          });
        }
      } catch (error) {
        const endTime = new Date();
        const duration = endTime.getTime() - startTime.getTime();
        const errorMessage = error instanceof Error ? error.message : 'Unknown job error';

        result = {
          success: false,
          jobId,
          startTime,
          endTime,
          duration,
          recordsInserted: 0,
          error: errorMessage,
        };

        span.setAttributes({
          'job.success': false,
          'job.error': errorMessage,
          'job.duration_ms': duration,
        });

        this.observability.recordError('job_execution_failed', error as Error, {
          job_id: jobId,
        });
      } finally {
        this.isRunning = false;
        this.currentJobId = undefined;
        if (result) {
          this.addToExecutionHistory(result);
        }
      }

      return result || {
        success: false,
        jobId,
        startTime,
        endTime: new Date(),
        duration: 0,
        recordsInserted: 0,
        error: 'Unknown error occurred',
      };
    });
  }

  async performHealthCheck(): Promise<boolean> {
    return this.observability.tracer.wrapAsync('job_runner_health_check', async span => {
      const healthResults: Record<string, boolean> = {};

      try {
        // Check database health
        const dbHealth = await this.database.healthCheck();
        healthResults['database'] = dbHealth.connected;

        this.observability.recordHealthCheck(
          'database',
          dbHealth.connected,
          dbHealth.responseTimeMs
        );

        // Check scraper health
        const scraperHealthy = await this.scraper.healthCheck();
        healthResults['scraper'] = scraperHealthy;

        this.observability.recordHealthCheck('scraper', scraperHealthy, 0);

        const overallHealthy = Object.values(healthResults).every(healthy => healthy);

        span.setAttributes({
          'health_check.overall': overallHealthy,
          'health_check.database': healthResults['database'],
          'health_check.scraper': healthResults['scraper'],
        });

        this.observability.logger.info('Health check completed', {
          overall: overallHealthy,
          component_status: healthResults,
        });

        return overallHealthy;
      } catch (error) {
        span.setAttributes({
          'health_check.overall': false,
          'health_check.error': error instanceof Error ? error.message : 'Unknown',
        });

        this.observability.recordError('health_check_failed', error as Error);
        return false;
      }
    });
  }

  async shutdown(): Promise<void> {
    return this.observability.tracer.wrapAsync('job_runner_shutdown', async span => {
      this.observability.logger.info('Shutting down job runner', {
        isRunning: this.isRunning,
        currentJobId: this.currentJobId,
      });

      // Wait for current job to complete (with timeout)
      if (this.isRunning && this.currentJobId) {
        this.observability.logger.info('Waiting for current job to complete', {
          jobId: this.currentJobId,
        });

        const timeout = 60000; // 60 seconds
        const startWait = Date.now();

        while (this.isRunning && Date.now() - startWait < timeout) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        if (this.isRunning) {
          this.observability.logger.warn('Job did not complete within timeout, forcing shutdown', {
            jobId: this.currentJobId,
            timeout,
          });
        }
      }

      // Shutdown components
      await this.scraper.shutdown();

      if (this.database.isConnected()) {
        await this.database.disconnect();
      }

      span.setAttributes({
        'job_runner.shutdown': true,
        'job_runner.execution_history_size': this.executionHistory.length,
      });

      this.observability.logger.info('Job runner shutdown completed', {
        executionHistorySize: this.executionHistory.length,
      });
    });
  }

  // Status and monitoring methods
  getCurrentStatus(): {
    isRunning: boolean;
    currentJobId?: string;
    lastExecution?: JobExecutionResult;
    totalExecutions: number;
    successRate: number;
  } {
    const totalExecutions = this.executionHistory.length;
    const successfulExecutions = this.executionHistory.filter(exec => exec.success).length;
    const successRate = totalExecutions > 0 ? successfulExecutions / totalExecutions : 0;

    const status: {
      isRunning: boolean;
      currentJobId?: string;
      lastExecution?: JobExecutionResult;
      totalExecutions: number;
      successRate: number;
    } = {
      isRunning: this.isRunning,
      totalExecutions,
      successRate,
    };

    if (this.currentJobId !== undefined) {
      status.currentJobId = this.currentJobId;
    }

    if (this.executionHistory.length > 0) {
      const lastExecution = this.executionHistory[this.executionHistory.length - 1];
      if (lastExecution) {
        status.lastExecution = lastExecution;
      }
    }

    return status;
  }

  getExecutionHistory(limit?: number): JobExecutionResult[] {
    const history = [...this.executionHistory].reverse(); // Most recent first
    return limit ? history.slice(0, limit) : history;
  }

  getExecutionStats(): {
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    successRate: number;
    averageDuration: number;
    totalRecordsInserted: number;
  } {
    const totalExecutions = this.executionHistory.length;
    const successfulExecutions = this.executionHistory.filter(exec => exec.success).length;
    const failedExecutions = totalExecutions - successfulExecutions;
    const successRate = totalExecutions > 0 ? successfulExecutions / totalExecutions : 0;

    const totalDuration = this.executionHistory.reduce((sum, exec) => sum + exec.duration, 0);
    const averageDuration = totalExecutions > 0 ? totalDuration / totalExecutions : 0;

    const totalRecordsInserted = this.executionHistory.reduce(
      (sum, exec) => sum + exec.recordsInserted,
      0
    );

    return {
      totalExecutions,
      successfulExecutions,
      failedExecutions,
      successRate,
      averageDuration,
      totalRecordsInserted,
    };
  }

  private addToExecutionHistory(result: JobExecutionResult): void {
    this.executionHistory.push(result);

    // Keep history size manageable
    if (this.executionHistory.length > this.maxHistorySize) {
      this.executionHistory = this.executionHistory.slice(-this.maxHistorySize);
    }
  }

  // Utility methods
  isJobRunning(): boolean {
    return this.isRunning;
  }

  getCurrentJobId(): string | undefined {
    return this.currentJobId;
  }

  canExecuteJob(): boolean {
    return !this.isRunning && this.config.maxConcurrentJobs > 0;
  }
}
