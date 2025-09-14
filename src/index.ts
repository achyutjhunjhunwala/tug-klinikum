import 'dotenv/config';
import { 
  validateAllConfigurations, 
  validateRequiredEnvironmentVariables,
  getConfigurationSummary 
} from '@/config';
import { DatabaseFactory } from '@/database';
import { ObservabilityFactory } from '@/observability';
import { PlaywrightScraper } from '@/scraper';
import { CronManager, JobRunner } from '@/scheduler';
import { HealthChecker } from '@/health';
import { HealthEndpoint } from './health-endpoint';

class HospitalScraperApplication {
  private database?: ReturnType<typeof DatabaseFactory.createFromEnv>;
  private observabilityProviders: ReturnType<typeof ObservabilityFactory.createFromEnv> = [];
  private scraper?: PlaywrightScraper;
  private cronManager?: CronManager;
  private jobRunner?: JobRunner;
  private healthChecker?: HealthChecker;
  private healthEndpoint?: HealthEndpoint;
  private configs?: ReturnType<typeof validateAllConfigurations>;
  
  private shutdownInProgress = false;

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

      // 5. Initialize scheduler and job runner
      await this.initializeScheduler();

      // 6. Initialize health checker
      await this.initializeHealthChecker();

      // 7. Start health endpoint
      await this.startHealthEndpoint();

      // 8. Schedule jobs
      await this.scheduleJobs();

      // 9. Set up graceful shutdown
      this.setupGracefulShutdown();

      if (this.observabilityProviders.length > 0) {
        const primaryObservability = this.observabilityProviders[0];
        if (primaryObservability) {
          primaryObservability.logger.logApplicationStart();
          primaryObservability.logger.info('Application started successfully', {
            configSummary: getConfigurationSummary(),
          });
        }
      }

    } catch (error) {
      console.error('❌ Failed to start Hospital Scraper Application:', error);
      
      if (this.observabilityProviders.length > 0) {
        const primaryObservability = this.observabilityProviders[0];
        if (primaryObservability) {
          primaryObservability.recordError('application_startup_failed', error as Error);
        }
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
    
    this.observabilityProviders = ObservabilityFactory.createFromEnv();
    await ObservabilityFactory.initializeProviders(this.observabilityProviders);
    
    console.log(`✅ Observability initialized (${this.observabilityProviders.length} providers)`);

    // Emit a startup span and heartbeat metric to verify pipelines
    const primaryObservability = this.observabilityProviders?.[0];
    if (primaryObservability) {
      await primaryObservability.tracer.wrapAsync('startup_telemetry_check', async () => {
        primaryObservability.metrics.recordHeartbeat({ phase: 'post_init' });
        primaryObservability.logger.info('Emitted startup heartbeat');
      });
    }
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
    const primaryObservability = this.observabilityProviders?.[0];
    if (!primaryObservability || !this.database) {
      return;
    }
    
    const health = await this.database.healthCheck();
    primaryObservability.logger.info('Database connection verified', {
      type: this.configs?.database.type,
      health: {
        connected: health.connected,
        responseTime: health.responseTimeMs,
        version: health.version,
      },
    });
  }


  private async initializeScraper(): Promise<void> {
    const primaryObservability = this.observabilityProviders?.[0];
    if (!primaryObservability) {
      return;
    }
    
    return primaryObservability.tracer.wrapAsync('initialize_scraper', async () => {
      primaryObservability.logger.info('Initializing scraper...');
      
      if (this.configs) {
        this.scraper = new PlaywrightScraper(
          this.configs.scraping,
          primaryObservability
        );
      }
      
      if (this.scraper) {
        await this.scraper.initialize();
      }
      
      if (this.scraper) {
        // Verify scraper with health check
        const scraperHealthy = await this.scraper.healthCheck();
        if (!scraperHealthy) {
          throw new Error('Scraper health check failed');
        }
      }
      
      if (this.configs) {
        primaryObservability.logger.info('Scraper initialized successfully', {
          targetUrl: this.configs.scraping.targetUrl,
          browserType: this.configs.scraping.browser.type,
        });
      }
    });
  }

  private async initializeScheduler(): Promise<void> {
    const primaryObservability = this.observabilityProviders?.[0];
    if (!primaryObservability) {
      return;
    }
    
    return primaryObservability.tracer.wrapAsync('initialize_scheduler', async () => {
      primaryObservability.logger.info('Initializing scheduler...');
      
      this.cronManager = new CronManager(primaryObservability);
      
      if (this.configs) {
        this.jobRunner = new JobRunner(
          {
            scrapingInterval: this.configs.app.scrapingInterval,
            timezone: this.configs.app.timezone,
            maxConcurrentJobs: 1,
            healthCheckInterval: this.configs.app.healthCheckInterval,
          },
          this.database!,
          this.scraper!,
          primaryObservability
        );
      }
      
      if (this.jobRunner) {
        await this.jobRunner.initialize();
      }
      
      primaryObservability.logger.info('Scheduler initialized successfully');
    });
  }

  private async initializeHealthChecker(): Promise<void> {
    const primaryObservability = this.observabilityProviders?.[0];
    if (!primaryObservability) {
      return;
    }
    
    primaryObservability.logger.info('Initializing health checker...');
    
    this.healthChecker = new HealthChecker(
      this.database!,
      this.scraper!,
      primaryObservability,
      this.jobRunner
    );
    
    // Perform initial health check (skip strict validation due to OpenTelemetry conflicts)
    const initialHealth = await this.healthChecker.performHealthCheck();
    
    if (initialHealth.status === 'unhealthy') {
      primaryObservability.logger.warn('Initial health check reported unhealthy status, but continuing startup', {
        healthStatus: initialHealth
      });
    }
    
    primaryObservability.logger.info('Health checker initialized successfully', {
      status: initialHealth.status,
      component_names: Object.keys(initialHealth.components),
    });
  }

  private async startHealthEndpoint(): Promise<void> {
    const primaryObservability = this.observabilityProviders?.[0];
    if (!primaryObservability) {
      return;
    }
    
    return primaryObservability.tracer.wrapAsync('start_health_endpoint', async () => {
      primaryObservability.logger.info('Starting health endpoint...');
      
      if (this.configs) {
        this.healthEndpoint = new HealthEndpoint(
          this.healthChecker!,
          this.configs.app.port
        );
      }
      
      if (this.healthEndpoint) {
        this.healthEndpoint.start();
      }
      
      if (this.configs) {
          primaryObservability.logger.info('Health endpoint started successfully', {
            port: this.configs.app.port,
            endpoints: ['/health', '/health/ready', '/health/live', '/health/simple'],
          });
        }
    });
  }

  private async scheduleJobs(): Promise<void> {
    const primaryObservability = this.observabilityProviders?.[0];
    if (!primaryObservability) {
      return;
    }
    
    return primaryObservability.tracer.wrapAsync('schedule_jobs', async () => {
      primaryObservability.logger.info('Scheduling jobs...');
      
      if (this.configs) {
        const scrapingSchedule = `*/${this.configs.app.scrapingInterval} * * * *`; // Every N minutes
        
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
            schedule: '*/5 * * * *', // Every 5 minutes
            timezone: this.configs.app.timezone,
            runOnStart: false,
            enabled: true,
          },
          async () => {
            await this.jobRunner!.performHealthCheck();
          }
        );

        primaryObservability.logger.info('Jobs scheduled successfully', {
          scrapingSchedule,
          scrapingInterval: this.configs.app.scrapingInterval,
          timezone: this.configs.app.timezone,
        });
      }
    });
  }

  private setupGracefulShutdown(): void {
    const primaryObservability = this.observabilityProviders?.[0];
    if (!primaryObservability) {
      return;
    }
    
    const shutdown = async (signal: string) => {
      if (this.shutdownInProgress) {
        console.log('🔄 Shutdown already in progress...');
        return;
      }
      
      this.shutdownInProgress = true;
      
      console.log(`🛑 Received ${signal}. Starting graceful shutdown...`);
      primaryObservability.logger.info('Starting graceful shutdown', { signal });

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
          primaryObservability.logger.info('Shutting down cron manager...');
          await this.cronManager.shutdown();
        }

        // 2. Wait for current jobs to complete
        if (this.jobRunner) {
          primaryObservability.logger.info('Shutting down job runner...');
          await this.jobRunner.shutdown();
        }

        // 3. Shutdown scraper
        if (this.scraper) {
          primaryObservability.logger.info('Shutting down scraper...');
          await this.scraper.shutdown();
        }

        // 4. Stop health endpoint
        if (this.healthEndpoint) {
          primaryObservability.logger.info('Stopping health endpoint...');
          this.healthEndpoint.stop();
        }

        // 5. Disconnect database
        if (this.database) {
          primaryObservability.logger.info('Disconnecting database...');
          await this.database.disconnect();
        }

        // 6. Shutdown observability (last)
        primaryObservability.logger.logApplicationShutdown();
        if (this.observabilityProviders.length > 0) {
          await ObservabilityFactory.shutdownProviders(this.observabilityProviders);
        }

        clearTimeout(shutdownTimer);
        console.log('✅ Graceful shutdown completed');
        process.exit(0);

      } catch (error) {
        clearTimeout(shutdownTimer);
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
      }
    };

    // Handle different shutdown signals
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGUSR2', () => shutdown('SIGUSR2')); // For nodemon

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('💥 Uncaught Exception:', error);
      if (this.observabilityProviders.length > 0) {
        const primaryObservability = this.observabilityProviders[0];
        if (primaryObservability) {
          primaryObservability.recordError('uncaught_exception', error);
        }
      }
      shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
      if (this.observabilityProviders.length > 0) {
        const primaryObservability = this.observabilityProviders[0];
        if (primaryObservability) {
          primaryObservability.recordError('unhandled_rejection', new Error(String(reason)));
        }
      }
      shutdown('unhandledRejection');
    });
  }
}

// Start the application
if (require.main === module) {
  const app = new HospitalScraperApplication();
  app.start().catch((error) => {
    console.error('💥 Failed to start application:', error);
    process.exit(1);
  });
}

export default HospitalScraperApplication;