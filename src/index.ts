import 'dotenv/config';
import {
  validateAllConfigurations,
  validateRequiredEnvironmentVariables,
  getConfigurationSummary,
} from '@/config';
import { DatabaseFactory } from '@/database';
import { ObservabilityFactory } from '@/observability';
import { PlaywrightScraper } from '@/scraper';
import { CronManager, JobRunner } from '@/scheduler';
import { HealthChecker } from '@/health';
import { HealthEndpoint } from './health-endpoint';

class HospitalScraperApplication {
  private database?: ReturnType<typeof DatabaseFactory.createFromEnv>;
  private observabilityProvider?: ReturnType<typeof ObservabilityFactory.createFromEnv>;
  private scraper?: PlaywrightScraper;
  private cronManager?: CronManager;
  private jobRunner?: JobRunner;
  private healthChecker?: HealthChecker;
  private healthEndpoint?: HealthEndpoint;
  private configs?: ReturnType<typeof validateAllConfigurations>;

  private shutdownInProgress = false;
  private startTime = Date.now();

  // Getter to ensure observability provider is available after initialization
  private get obs(): ReturnType<typeof ObservabilityFactory.createFromEnv> {
    if (!this.observabilityProvider) {
      throw new Error('Observability provider not initialized');
    }
    return this.observabilityProvider;
  }

  async start(): Promise<void> {
    try {
      console.log('🏥 Starting Hospital Scraper Application...');

      // 1. Validate environment and configuration
      await this.validateEnvironment();

      // 2. Initialize database BEFORE observability to avoid instrumentation conflicts
      await this.initializeDatabaseEarly();

      // 3. Initialize observability after database
      await this.initializeObservability();

      // 4. Verify database connection with observability logging
      await this.initializeDatabase();

      // 5. Initialize scraper
      await this.initializeScraper();

      // 6. Initialize scheduler and job runner
      await this.initializeScheduler();

      // 7. Initialize health checker
      await this.initializeHealthChecker();

      // 8. Start health endpoint
      await this.startHealthEndpoint();

      // 9. Schedule jobs
      await this.scheduleJobs();

      // 10. Set up graceful shutdown
      this.setupGracefulShutdown();

      // Final startup confirmation
      this.obs.logger.logApplicationStart();
      this.obs.logger.info('Application started successfully', {
        configSummary: getConfigurationSummary(),
        startup_duration_ms: Date.now() - this.startTime,
      });

      // Record successful startup metric
      this.obs.metrics.recordHeartbeat({ phase: 'startup_complete' });
    } catch (error) {
      console.error('❌ Failed to start Hospital Scraper Application:', error);

      if (this.observabilityProvider) {
        this.observabilityProvider.recordError('application_startup_failed', error as Error, {
          startup_phase: 'initialization',
        });
      }

      process.exit(1);
    }
  }

  private async validateEnvironment(): Promise<void> {
    console.log('🔍 Validating environment...');

    validateRequiredEnvironmentVariables();
    this.configs = validateAllConfigurations();

    console.log('✅ Environment validation completed');
  }

  private async initializeObservability(): Promise<void> {
    console.log('📊 Initializing observability...');

    this.observabilityProvider = ObservabilityFactory.createFromEnv();
    await ObservabilityFactory.initializeProvider(this.observabilityProvider);

    console.log('✅ Observability initialized (Elastic provider)');

    // Emit a startup span and heartbeat metric to verify pipelines
    await this.observabilityProvider!.tracer.wrapAsync('startup_telemetry_check', async span => {
      span.setAttributes({
        'startup.phase': 'post_observability_init',
        'startup.timestamp': Date.now(),
      });

      this.observabilityProvider!.metrics.recordHeartbeat({ phase: 'post_init' });
      this.observabilityProvider!.logger.info(
        'Observability pipeline verified with startup heartbeat'
      );
    });
  }

  private async initializeDatabaseEarly(): Promise<void> {
    console.log('🔗 Initializing database (before observability)...');

    this.database = DatabaseFactory.createFromEnv();
    await this.database.connect();

    const health = await this.database.healthCheck();
    if (!health.connected) {
      throw new Error(`Database connection failed: ${health.lastError}`);
    }

    console.log('✅ Database initialized successfully:', {
      type: this.configs?.database?.type || 'elasticsearch',
      connected: health.connected,
      responseTime: health.responseTimeMs,
    });
  }

  private async initializeDatabase(): Promise<void> {
    // Database already initialized early, just log with observability
    if (!this.database) {
      return;
    }

    const health = await this.database.healthCheck();
    this.obs.logger.info('Database connection verified', {
      type: this.configs?.database.type,
      health: {
        connected: health.connected,
        responseTime: health.responseTimeMs,
        version: health.version,
      },
    });

    // Record database health metrics
    this.obs.recordHealthCheck('database', health.connected, health.responseTimeMs);
  }

  private async initializeScraper(): Promise<void> {
    return this.obs.tracer.wrapAsync('initialize_scraper', async span => {
      this.obs.logger.info('Initializing scraper...');

      if (this.configs) {
        span.setAttributes({
          'scraper.target_url': this.configs.scraping.targetUrl,
          'scraper.browser_type': this.configs.scraping.browser.type,
        });

        this.scraper = new PlaywrightScraper(this.configs.scraping, this.obs);
      }

      if (this.scraper) {
        await this.scraper.initialize();
      }

      if (this.scraper) {
        // Verify scraper with health check
        const scraperHealthy = await this.scraper.healthCheck();
        if (!scraperHealthy) {
          const error = new Error('Scraper health check failed');
          this.obs.tracer.recordException(span, error);
          throw error;
        }

        // Record successful scraper health check
        this.obs.recordHealthCheck('scraper', scraperHealthy, 0);
      }

      if (this.configs) {
        this.obs.logger.info('Scraper initialized successfully', {
          targetUrl: this.configs.scraping.targetUrl,
          browserType: this.configs.scraping.browser.type,
        });
      }
    });
  }

  private async initializeScheduler(): Promise<void> {
    return this.obs.tracer.wrapAsync('initialize_scheduler', async span => {
      this.obs.logger.info('Initializing scheduler...');

      this.cronManager = new CronManager(this.obs);

      if (this.configs) {
        span.setAttributes({
          'scheduler.scraping_interval': this.configs.app.scrapingInterval,
          'scheduler.timezone': this.configs.app.timezone,
        });

        this.jobRunner = new JobRunner(
          {
            scrapingInterval: this.configs.app.scrapingInterval,
            timezone: this.configs.app.timezone,
            maxConcurrentJobs: 1,
            healthCheckInterval: this.configs.app.healthCheckInterval,
          },
          this.database!,
          this.scraper!,
          this.obs
        );
      }

      if (this.jobRunner) {
        await this.jobRunner.initialize();
      }

      this.obs.logger.info('Scheduler initialized successfully');
    });
  }

  private async initializeHealthChecker(): Promise<void> {
    this.obs.logger.info('Initializing health checker...');

    this.healthChecker = new HealthChecker(this.database!, this.scraper!, this.obs, this.jobRunner);

    // Perform initial health check
    const initialHealth = await this.healthChecker.performHealthCheck();

    if (initialHealth.status === 'unhealthy') {
      this.obs.logger.warn(
        'Initial health check reported unhealthy status, but continuing startup',
        {
          healthStatus: initialHealth,
        }
      );

      // Record unhealthy components
      Object.entries(initialHealth.components).forEach(([component, health]) => {
        if (health.status === 'unhealthy') {
          this.obs.recordHealthCheck(component, false, health.responseTime || 0);
        }
      });
    } else {
      // Record healthy components
      Object.entries(initialHealth.components).forEach(([component, health]) => {
        this.obs.recordHealthCheck(
          component,
          health.status === 'healthy',
          health.responseTime || 0
        );
      });
    }

    this.obs.logger.info('Health checker initialized successfully', {
      status: initialHealth.status,
      component_names: Object.keys(initialHealth.components),
    });
  }

  private async startHealthEndpoint(): Promise<void> {
    return this.obs.tracer.wrapAsync('start_health_endpoint', async span => {
      this.obs.logger.info('Starting health endpoint...');

      if (this.configs) {
        span.setAttributes({
          'health_endpoint.port': this.configs.app.port,
        });

        this.healthEndpoint = new HealthEndpoint(this.healthChecker!, this.configs.app.port);
      }

      if (this.healthEndpoint) {
        this.healthEndpoint.start();
      }

      if (this.configs) {
        this.obs.logger.info('Health endpoint started successfully', {
          port: this.configs.app.port,
          endpoints: ['/health', '/health/ready', '/health/live', '/health/simple'],
        });
      }
    });
  }

  private async scheduleJobs(): Promise<void> {
    return this.obs.tracer.wrapAsync('schedule_jobs', async span => {
      this.obs.logger.info('Scheduling jobs...');

      if (this.configs) {
        const scrapingSchedule = `*/${this.configs.app.scrapingInterval} * * * *`; // Every N minutes
        const healthCheckSchedule = '*/5 * * * *'; // Every 5 minutes

        span.setAttributes({
          'jobs.scraping_schedule': scrapingSchedule,
          'jobs.health_check_schedule': healthCheckSchedule,
          'jobs.timezone': this.configs.app.timezone,
        });

        this.cronManager!.scheduleJob(
          {
            name: 'hospital_scraping',
            schedule: scrapingSchedule,
            timezone: this.configs.app.timezone,
            runOnStart: true,
            enabled: true,
          },
          async () => {
            await this.jobRunner!.executeScrapingJob();
          }
        );

        // Schedule health check job
        this.cronManager!.scheduleJob(
          {
            name: 'health_check',
            schedule: healthCheckSchedule,
            timezone: this.configs.app.timezone,
            runOnStart: false,
            enabled: true,
          },
          async () => {
            await this.jobRunner!.performHealthCheck();
          }
        );

        this.obs.logger.info('Jobs scheduled successfully', {
          scrapingSchedule,
          healthCheckSchedule,
          scrapingInterval: this.configs.app.scrapingInterval,
          timezone: this.configs.app.timezone,
        });
      }
    });
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      if (this.shutdownInProgress) {
        console.log('🔄 Shutdown already in progress...');
        return;
      }

      this.shutdownInProgress = true;

      console.log(`🛑 Received ${signal}. Starting graceful shutdown...`);

      // Start graceful shutdown tracing if observability is available
      const shutdownOperation = async () => {
        if (this.observabilityProvider) {
          this.observabilityProvider.logger.info('Starting graceful shutdown', { signal });
        }

        let shutdownTimer: NodeJS.Timeout | undefined;
        if (this.configs) {
          const shutdownTimeout = this.configs.app.gracefulShutdownTimeout;
          shutdownTimer = setTimeout(() => {
            console.log('⚠️ Shutdown timeout reached, forcing exit...');
            process.exit(1);
          }, shutdownTimeout);
        }

        try {
          // 1. Stop accepting new jobs
          if (this.cronManager) {
            if (this.observabilityProvider) {
              this.observabilityProvider.logger.info('Shutting down cron manager...');
            }
            await this.cronManager.shutdown();
          }

          // 2. Wait for current jobs to complete
          if (this.jobRunner) {
            if (this.observabilityProvider) {
              this.observabilityProvider.logger.info('Shutting down job runner...');
            }
            await this.jobRunner.shutdown();
          }

          // 3. Shutdown scraper
          if (this.scraper) {
            if (this.observabilityProvider) {
              this.observabilityProvider.logger.info('Shutting down scraper...');
            }
            await this.scraper.shutdown();
          }

          // 4. Stop health endpoint
          if (this.healthEndpoint) {
            if (this.observabilityProvider) {
              this.observabilityProvider.logger.info('Stopping health endpoint...');
            }
            this.healthEndpoint.stop();
          }

          // 5. Disconnect database
          if (this.database) {
            if (this.observabilityProvider) {
              this.observabilityProvider.logger.info('Disconnecting database...');
            }
            await this.database.disconnect();
          }

          // 6. Record shutdown metrics and shutdown observability (last)
          if (this.observabilityProvider) {
            this.observabilityProvider.logger.logApplicationShutdown();
            await ObservabilityFactory.shutdownProvider(this.observabilityProvider);
          }

          clearTimeout(shutdownTimer);
          console.log('✅ Graceful shutdown completed');
          process.exit(0);
        } catch (error) {
          if (this.observabilityProvider) {
            this.observabilityProvider.recordError('shutdown_error', error as Error, {
              'shutdown.phase': 'error_during_shutdown',
              'shutdown.signal': signal,
            });
          }

          clearTimeout(shutdownTimer);
          console.error('❌ Error during shutdown:', error);
          process.exit(1);
        }
      };

      if (this.observabilityProvider) {
        await this.observabilityProvider.tracer.wrapAsync('graceful_shutdown', async span => {
          span.setAttributes({
            'shutdown.signal': signal,
            'shutdown.start_time': Date.now(),
          });

          try {
            await shutdownOperation();
            span.setAttributes({
              'shutdown.success': true,
            });
          } catch (error) {
            span.setAttributes({
              'shutdown.success': false,
            });
            this.observabilityProvider!.tracer.recordException(span, error as Error);
            throw error;
          }
        });
      } else {
        await shutdownOperation();
      }
    };

    // Handle different shutdown signals
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGUSR2', () => shutdown('SIGUSR2')); // For nodemon

    // Handle uncaught exceptions
    process.on('uncaughtException', error => {
      console.error('💥 Uncaught Exception:', error);
      if (this.observabilityProvider) {
        this.observabilityProvider.recordError('uncaught_exception', error, {
          error_source: 'process_uncaught_exception',
        });
      }
      shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
      if (this.observabilityProvider) {
        this.observabilityProvider.recordError('unhandled_rejection', new Error(String(reason)), {
          error_source: 'process_unhandled_rejection',
        });
      }
      shutdown('unhandledRejection');
    });
  }
}

// Start the application
if (require.main === module) {
  const app = new HospitalScraperApplication();
  app.start().catch(error => {
    console.error('💥 Failed to start application:', error);
    process.exit(1);
  });
}

export default HospitalScraperApplication;
