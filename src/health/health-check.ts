import { ObservabilityProvider } from '@/observability';
import { DatabaseClient } from '@/database';
import { PlaywrightScraper } from '@/scraper';
import { JobRunner } from '@/scheduler';

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  uptime: number;
  version: string;
  components: {
    database: ComponentHealth;
    scraper: ComponentHealth;
    observability: ComponentHealth;
    jobRunner?: ComponentHealth;
  };
  metrics: {
    memoryUsage: NodeJS.MemoryUsage;
    cpuUsage: NodeJS.CpuUsage;
  };
}

export interface ComponentHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime: number;
  lastCheck: Date;
  error?: string | undefined;
  details?: Record<string, any> | undefined;
}

export class HealthChecker {
  private startTime = Date.now();

  constructor(
    private readonly database: DatabaseClient,
    private readonly scraper: PlaywrightScraper,
    private readonly observability: ObservabilityProvider,
    private readonly jobRunner?: JobRunner
  ) {}

  async performHealthCheck(): Promise<HealthCheckResult> {
    return this.observability.tracer.wrapAsync('health_check_full', async (span) => {
      const timestamp = new Date();
      const uptime = Date.now() - this.startTime;

      this.observability.logger.info('Performing full health check');

      // Check all components in parallel
      const [
        databaseHealth,
        scraperHealth,
        observabilityHealth,
        jobRunnerHealth,
      ] = await Promise.all([
        this.checkDatabase(),
        this.checkScraper(),
        this.checkObservability(),
        this.jobRunner ? this.checkJobRunner() : Promise.resolve(null),
      ]);

      // Gather system metrics
      const metrics = {
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
      };

      // Determine overall status
      const components = {
        database: databaseHealth,
        scraper: scraperHealth,
        observability: observabilityHealth,
        ...(jobRunnerHealth && { jobRunner: jobRunnerHealth }),
      };

      const overallStatus = this.determineOverallStatus(components);

      const result: HealthCheckResult = {
        status: overallStatus,
        timestamp,
        uptime,
        version: process.env['OTEL_SERVICE_VERSION'] || '1.0.0',
        components,
        metrics,
      };

      span.setAttributes({
        'health.overall_status': overallStatus,
        'health.uptime': uptime,
        'health.database_status': databaseHealth.status,
        'health.scraper_status': scraperHealth.status,
        'health.observability_status': observabilityHealth.status,
        'health.memory_used': metrics.memoryUsage.heapUsed,
        'health.memory_total': metrics.memoryUsage.heapTotal,
      });

      this.observability.logger.info('Health check completed', {
        status: overallStatus,
        uptime,
        components: Object.entries(components).map(([name, health]) => ({
          name,
          status: health.status,
          responseTime: health.responseTime,
        })),
        memoryUsage: `${Math.round(metrics.memoryUsage.heapUsed / 1024 / 1024)}MB`,
      });

      return result;
    });
  }

  private async checkDatabase(): Promise<ComponentHealth> {
    const startTime = Date.now();

    try {
      const health = await this.database.healthCheck();
      const responseTime = Date.now() - startTime;

      return {
        status: health.connected ? 'healthy' : 'unhealthy',
        responseTime,
        lastCheck: new Date(),
        error: health.lastError,
        details: {
          connected: health.connected,
          version: health.version,
          clusterHealth: health.clusterHealth,
          documentCount: health.documentCount,
        },
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;

      return {
        status: 'unhealthy',
        responseTime,
        lastCheck: new Date(),
        error: error instanceof Error ? error.message : 'Database check failed',
      };
    }
  }

  private async checkScraper(): Promise<ComponentHealth> {
    const startTime = Date.now();

    try {
      const isHealthy = await this.scraper.healthCheck();
      const responseTime = Date.now() - startTime;

      return {
        status: isHealthy ? 'healthy' : 'unhealthy',
        responseTime,
        lastCheck: new Date(),
        details: {
          initialized: isHealthy,
          config: this.scraper.getConfig(),
        },
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;

      return {
        status: 'unhealthy',
        responseTime,
        lastCheck: new Date(),
        error: error instanceof Error ? error.message : 'Scraper check failed',
      };
    }
  }

  private async checkObservability(): Promise<ComponentHealth> {
    const startTime = Date.now();

    try {
      const isInitialized = this.observability.isInitialized();
      const responseTime = Date.now() - startTime;

      return {
        status: isInitialized ? 'healthy' : 'degraded',
        responseTime,
        lastCheck: new Date(),
        details: {
          initialized: isInitialized,
          serviceName: this.observability.serviceName,
          version: this.observability.version,
        },
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;

      return {
        status: 'unhealthy',
        responseTime,
        lastCheck: new Date(),
        error: error instanceof Error ? error.message : 'Observability check failed',
      };
    }
  }

  private async checkJobRunner(): Promise<ComponentHealth> {
    if (!this.jobRunner) {
      return {
        status: 'healthy',
        responseTime: 0,
        lastCheck: new Date(),
        details: { enabled: false },
      };
    }

    const startTime = Date.now();

    try {
      const status = this.jobRunner.getCurrentStatus();
      const stats = this.jobRunner.getExecutionStats();
      const responseTime = Date.now() - startTime;

      // Determine health based on recent execution success rate
      let healthStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      
      if (stats.totalExecutions > 0) {
        if (stats.successRate < 0.5) {
          healthStatus = 'unhealthy';
        } else if (stats.successRate < 0.8) {
          healthStatus = 'degraded';
        }
      }

      return {
        status: healthStatus,
        responseTime,
        lastCheck: new Date(),
        details: {
          isRunning: status.isRunning,
          currentJobId: status.currentJobId,
          totalExecutions: stats.totalExecutions,
          successRate: stats.successRate,
          averageDuration: stats.averageDuration,
        },
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;

      return {
        status: 'unhealthy',
        responseTime,
        lastCheck: new Date(),
        error: error instanceof Error ? error.message : 'Job runner check failed',
      };
    }
  }

  private determineOverallStatus(
    components: Record<string, ComponentHealth>
  ): 'healthy' | 'degraded' | 'unhealthy' {
    const statuses = Object.values(components).map(component => component.status);

    // If any component is unhealthy, overall is unhealthy
    if (statuses.some(status => status === 'unhealthy')) {
      return 'unhealthy';
    }

    // If any component is degraded, overall is degraded
    if (statuses.some(status => status === 'degraded')) {
      return 'degraded';
    }

    // All components are healthy
    return 'healthy';
  }

  // Utility methods
  getUptime(): number {
    return Date.now() - this.startTime;
  }

  async checkReadiness(): Promise<boolean> {
    // Readiness check - can the service handle requests?
    try {
      const [dbConnected, scraperHealthy, observabilityReady] = await Promise.all([
        this.database.healthCheck().then(h => h.connected),
        this.scraper.healthCheck(),
        Promise.resolve(this.observability.isInitialized()),
      ]);

      return dbConnected && scraperHealthy && observabilityReady;

    } catch (error) {
      this.observability.recordError('readiness_check_failed', error as Error);
      return false;
    }
  }

  async checkLiveness(): Promise<boolean> {
    // Liveness check - is the service alive?
    try {
      // Simple check that the process is responsive
      const memUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();
      
      // Basic sanity checks
      return memUsage.heapUsed > 0 && cpuUsage.user >= 0;

    } catch (error) {
      this.observability.recordError('liveness_check_failed', error as Error);
      return false;
    }
  }

  // Create a simplified health status for quick checks
  async getSimpleHealth(): Promise<{
    status: 'ok' | 'error';
    message: string;
  }> {
    try {
      const result = await this.performHealthCheck();
      
      if (result.status === 'healthy') {
        return { status: 'ok', message: 'All systems operational' };
      } else {
        const unhealthyComponents = Object.entries(result.components)
          .filter(([, health]) => health.status !== 'healthy')
          .map(([name]) => name);
        
        return {
          status: 'error',
          message: `Issues detected in: ${unhealthyComponents.join(', ')}`,
        };
      }

    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Health check failed',
      };
    }
  }
}