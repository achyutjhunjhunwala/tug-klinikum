import * as cron from 'node-cron';
import { ObservabilityProvider } from '@/observability';

export interface CronJobConfig {
  name: string;
  schedule: string;
  timezone?: string;
  runOnStart?: boolean;
  enabled?: boolean;
}

export interface CronJobStatus {
  name: string;
  schedule: string;
  isRunning: boolean;
  lastRun?: Date;
  nextRun?: Date;
  runCount: number;
  errorCount: number;
  lastError?: string;
}

export type CronJobHandler = () => Promise<void>;

interface ManagedCronJob {
  config: CronJobConfig;
  handler: CronJobHandler;
  task: cron.ScheduledTask;
  status: CronJobStatus;
}

export class CronManager {
  private jobs = new Map<string, ManagedCronJob>();

  constructor(private readonly observability: ObservabilityProvider) {}

  scheduleJob(config: CronJobConfig, handler: CronJobHandler): void {
    return this.observability.tracer.wrapSync('cron_schedule_job', span => {
      span.setAttributes({
        'cron.job_name': config.name,
        'cron.schedule': config.schedule,
        'cron.timezone': config.timezone || 'UTC',
      });

      // Validate cron expression
      if (!cron.validate(config.schedule)) {
        throw new Error(`Invalid cron expression: ${config.schedule}`);
      }

      // Remove existing job if it exists
      if (this.jobs.has(config.name)) {
        this.removeJob(config.name);
      }

      const status: CronJobStatus = {
        name: config.name,
        schedule: config.schedule,
        isRunning: false,
        runCount: 0,
        errorCount: 0,
      };

      // Create wrapped handler with observability
      const wrappedHandler = this.createWrappedHandler(config.name, handler, status);

      // Schedule the task
      const scheduleOptions: any = {
        scheduled: config.enabled !== false,
      };
      if (config.timezone) {
        scheduleOptions.timezone = config.timezone;
      }

      const task = cron.schedule(config.schedule, wrappedHandler, scheduleOptions);

      const managedJob: ManagedCronJob = {
        config,
        handler,
        task,
        status,
      };

      this.jobs.set(config.name, managedJob);

      this.observability.logger.info('Cron job scheduled', {
        name: config.name,
        schedule: config.schedule,
        timezone: config.timezone,
        runOnStart: config.runOnStart,
      });

      // Run immediately if configured
      if (config.runOnStart && config.enabled !== false) {
        this.runJobImmediately(config.name);
      }
    });
  }

  private createWrappedHandler(
    jobName: string,
    handler: CronJobHandler,
    status: CronJobStatus
  ): () => Promise<void> {
    return async () => {
      const correlationId = this.observability.createCorrelationId();
      this.observability.setCorrelationId(correlationId);

      return this.observability.tracer.wrapAsync('cron_job_execution', async span => {
        span.setAttributes({
          'cron.job_name': jobName,
          'cron.correlation_id': correlationId,
          'cron.run_count': status.runCount + 1,
        });

        status.isRunning = true;
        status.lastRun = new Date();

        this.observability.logger.info('Cron job starting', {
          job: jobName,
          correlationId,
          runCount: status.runCount + 1,
        });

        const startTime = Date.now();

        try {
          await handler();

          status.runCount++;
          const duration = Date.now() - startTime;

          span.setAttributes({
            'cron.success': true,
            'cron.duration_ms': duration,
          });

          this.observability.logger.info('Cron job completed successfully', {
            job: jobName,
            correlationId,
            duration,
            runCount: status.runCount,
          });

          this.observability.recordOperation(`cron_job_${jobName}`, duration, true);
        } catch (error) {
          status.errorCount++;
          status.lastError = error instanceof Error ? error.message : 'Unknown error';
          const duration = Date.now() - startTime;

          span.setAttributes({
            'cron.success': false,
            'cron.error': status.lastError,
            'cron.duration_ms': duration,
          });

          this.observability.recordError(`cron_job_${jobName}`, error as Error, {
            job_name: jobName,
            correlation_id: correlationId,
            run_count: status.runCount,
          });

          this.observability.recordOperation(`cron_job_${jobName}`, duration, false);
        } finally {
          status.isRunning = false;
          this.updateNextRunTime(status);
        }
      });
    };
  }

  async runJobImmediately(jobName: string): Promise<void> {
    return this.observability.tracer.wrapAsync('cron_run_immediate', async span => {
      const job = this.jobs.get(jobName);
      if (!job) {
        throw new Error(`Job not found: ${jobName}`);
      }

      span.setAttributes({
        'cron.job_name': jobName,
        'cron.immediate': true,
      });

      if (job.status.isRunning) {
        this.observability.logger.warn('Job is already running, skipping immediate execution', {
          job: jobName,
        });
        return;
      }

      this.observability.logger.info('Running job immediately', {
        job: jobName,
      });

      const wrappedHandler = this.createWrappedHandler(jobName, job.handler, job.status);

      await wrappedHandler();
    });
  }

  startJob(jobName: string): void {
    const job = this.jobs.get(jobName);
    if (!job) {
      throw new Error(`Job not found: ${jobName}`);
    }

    job.task.start();
    this.updateNextRunTime(job.status);

    this.observability.logger.info('Cron job started', {
      job: jobName,
      schedule: job.config.schedule,
    });
  }

  stopJob(jobName: string): void {
    const job = this.jobs.get(jobName);
    if (!job) {
      throw new Error(`Job not found: ${jobName}`);
    }

    job.task.stop();

    this.observability.logger.info('Cron job stopped', {
      job: jobName,
    });
  }

  removeJob(jobName: string): void {
    const job = this.jobs.get(jobName);
    if (!job) {
      return;
    }

    job.task.stop();
    this.jobs.delete(jobName);

    this.observability.logger.info('Cron job removed', {
      job: jobName,
    });
  }

  getJobStatus(jobName: string): CronJobStatus | null {
    const job = this.jobs.get(jobName);
    return job ? { ...job.status } : null;
  }

  getAllJobStatuses(): CronJobStatus[] {
    return Array.from(this.jobs.values()).map(job => ({ ...job.status }));
  }

  getRunningJobs(): string[] {
    return Array.from(this.jobs.entries())
      .filter(([, job]) => job.status.isRunning)
      .map(([name]) => name);
  }

  async shutdown(): Promise<void> {
    return this.observability.tracer.wrapAsync('cron_shutdown', async span => {
      this.observability.logger.info('Shutting down cron manager', {
        jobCount: this.jobs.size,
        runningJobs: this.getRunningJobs(),
      });

      const shutdownPromises: Promise<void>[] = [];

      // Stop all jobs
      for (const [jobName, job] of this.jobs.entries()) {
        if (job.status.isRunning) {
          this.observability.logger.info('Waiting for running job to complete', {
            job: jobName,
          });

          // Wait for running job to complete (with timeout)
          const timeout = new Promise<void>(resolve => {
            setTimeout(() => {
              this.observability.logger.warn('Job shutdown timeout, forcing stop', {
                job: jobName,
              });
              resolve();
            }, 30000); // 30 second timeout
          });

          const waitForCompletion = new Promise<void>(resolve => {
            const checkInterval = setInterval(() => {
              if (!job.status.isRunning) {
                clearInterval(checkInterval);
                resolve();
              }
            }, 100);
          });

          shutdownPromises.push(Promise.race([waitForCompletion, timeout]));
        }

        job.task.stop();
      }

      await Promise.all(shutdownPromises);

      this.jobs.clear();

      span.setAttributes({
        'cron.shutdown': true,
        'cron.jobs_shutdown': this.jobs.size,
      });

      this.observability.logger.info('Cron manager shutdown completed');
    });
  }

  private updateNextRunTime(status: CronJobStatus): void {
    try {
      // This is a simplified next run calculation
      // In practice, you might want to use a more sophisticated cron parser
      status.nextRun = new Date(Date.now() + 60000); // Approximate next run in 1 minute
    } catch (error) {
      this.observability.logger.warn('Failed to calculate next run time', {
        job: status.name,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Utility methods
  isJobRunning(jobName: string): boolean {
    const job = this.jobs.get(jobName);
    return job ? job.status.isRunning : false;
  }

  getJobCount(): number {
    return this.jobs.size;
  }

  hasJob(jobName: string): boolean {
    return this.jobs.has(jobName);
  }
}
