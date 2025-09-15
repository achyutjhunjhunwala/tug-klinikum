import { CreateHospitalMetric } from '@/models/hospital-metric';
import { ObservabilityProvider } from '@/observability';
import { BrowserManager, BrowserConfig } from './browser-manager';
import { DataExtractor } from './data-extractor';
import { RetryHandler } from './retry-handler';

export interface ScrapingConfig {
  targetUrl: string;
  browser: BrowserConfig;
  maxRetries: number;
  pageTimeout: number;
  scraperId: string;
}

export interface ScrapingResult {
  success: boolean;
  data?: CreateHospitalMetric | undefined;
  error?: string | undefined;
  metrics: {
    totalTime: number;
    pageLoadTime: number;
    extractionTime: number;
    retries: number;
  };
  metadata: {
    url: string;
    timestamp: Date;
    scraperId: string;
    browserType: string;
    userAgent?: string | undefined;
  };
}

export class PlaywrightScraper {
  private browserManager: BrowserManager;
  private dataExtractor: DataExtractor;
  private retryHandler: RetryHandler;

  constructor(
    private readonly config: ScrapingConfig,
    private readonly observability: ObservabilityProvider
  ) {
    this.browserManager = new BrowserManager({
      config: config.browser,
      observability,
    });

    this.dataExtractor = new DataExtractor(observability);
    this.retryHandler = new RetryHandler(observability);
  }

  async initialize(): Promise<void> {
    return this.observability.tracer.wrapAsync('scraper_initialize', async span => {
      span.setAttributes({
        'scraper.id': this.config.scraperId,
        'scraper.target_url': this.config.targetUrl,
        'scraper.browser_type': this.config.browser.type,
      });

      this.observability.logger.info('Initializing Playwright scraper', {
        scraperId: this.config.scraperId,
        targetUrl: this.config.targetUrl,
        browserType: this.config.browser.type,
      });

      await this.browserManager.initialize();

      this.observability.logger.info('Playwright scraper initialized successfully');
    });
  }

  async scrape(): Promise<ScrapingResult> {
    const startTime = Date.now();
    const correlationId = this.observability.createCorrelationId();
    this.observability.setCorrelationId(correlationId);

    return this.observability.tracer.wrapAsync('scraper_scrape', async span => {
      // Set comprehensive span attributes
      span.setAttributes({
        'scraper.correlation_id': correlationId,
        'scraper.target_url': this.config.targetUrl,
        'scraper.id': this.config.scraperId,
        'scraper.start_time': startTime,
        'scraper.browser_type': this.config.browser.type,
      });

      // Log scraping start with production-focused logging
      this.observability.logger.logScrapingStart(this.config.targetUrl, correlationId);
      
      // Record scraping attempt with enhanced metrics
      this.observability.metrics.recordScrapingAttempt(this.config.targetUrl);

      try {
        // Execute scraping with retry logic in a child span
        const retryResult = await this.observability.tracer.wrapAsync('scraping_with_retry', async (retrySpan) => {
          retrySpan.setAttributes({
            'retry.operation': 'hospital_scraping',
            'retry.target': this.config.targetUrl,
          });
          
          return await this.retryHandler.executeNetworkOperation(
            () => this.performScraping(),
            'hospital_scraping'
          );
        });

        const totalTime = Date.now() - startTime;
        const retryCount = retryResult.attempts - 1;

        if (retryResult.success && retryResult.data) {
          // Extract business data for metrics
          const waitTime = retryResult.data.data?.waitTimeMinutes;
          const patientCount = retryResult.data.data?.totalPatients;
          const dataAge = retryResult.data.data?.updateDelayMinutes || 0;
          
          // Calculate data quality score (simple heuristic)
          const qualityData: { waitTimeMinutes?: number; totalPatients?: number; updateDelayMinutes?: number } = {};
          if (retryResult.data.data?.waitTimeMinutes !== undefined) {
            qualityData.waitTimeMinutes = retryResult.data.data.waitTimeMinutes;
          }
          if (retryResult.data.data?.totalPatients !== undefined) {
            qualityData.totalPatients = retryResult.data.data.totalPatients;
          }
          if (retryResult.data.data?.updateDelayMinutes !== undefined) {
            qualityData.updateDelayMinutes = retryResult.data.data.updateDelayMinutes;
          }
          const dataQuality = this.calculateDataQuality(qualityData);

          const result: ScrapingResult = {
            success: true,
            data: retryResult.data.data,
            metrics: {
              totalTime,
              pageLoadTime: retryResult.data.pageLoadTime,
              extractionTime: retryResult.data.extractionTime,
              retries: retryCount,
            },
            metadata: {
              url: this.config.targetUrl,
              timestamp: new Date(),
              scraperId: this.config.scraperId,
              browserType: this.config.browser.type,
              userAgent: retryResult.data.userAgent,
            },
          };

          // Set comprehensive span attributes with business context
          span.setAttributes({
            'scraper.success': true,
            'scraper.total_time_ms': totalTime,
            'scraper.retries': retryCount,
            'scraper.page_load_ms': retryResult.data.pageLoadTime,
            'scraper.extraction_ms': retryResult.data.extractionTime,
          });

          // Add business context to span
          const businessContext: { waitTime?: number; patientCount?: number; dataQuality?: number; retryCount?: number } = {
            dataQuality,
            retryCount,
          };
          if (waitTime !== undefined) businessContext.waitTime = waitTime;
          if (patientCount !== undefined) businessContext.patientCount = patientCount;
          this.observability.tracer.addBusinessContext(span, businessContext);

          // Use production-focused logging with business data
          const loggingData: { waitTime?: number; patientCount?: number; retryCount?: number } = { retryCount };
          if (waitTime !== undefined) loggingData.waitTime = waitTime;
          if (patientCount !== undefined) loggingData.patientCount = patientCount;
          this.observability.logger.logScrapingSuccess(
            this.config.targetUrl,
            totalTime,
            loggingData
          );

          // Record comprehensive business and technical metrics
          this.observability.metrics.recordScrapingSuccess(
            this.config.targetUrl, 
            totalTime / 1000, 
            retryCount
          );

          // Record business metrics if available
          if (waitTime !== undefined && patientCount !== undefined) {
            this.observability.metrics.recordHospitalData(
              waitTime,
              patientCount,
              dataAge,
              dataQuality
            );
          }

          // Record browser performance metrics
          this.observability.metrics.recordBrowserNavigation(
            retryResult.data.pageLoadTime / 1000,
            new URL(this.config.targetUrl).hostname,
            true
          );

          return result;
          
        } else {
          // Handle scraping failure
          const errorMessage = retryResult.error?.message || 'Unknown scraping error';
          const error = retryResult.error || new Error(errorMessage);
          
          const result: ScrapingResult = {
            success: false,
            error: errorMessage,
            metrics: {
              totalTime,
              pageLoadTime: 0,
              extractionTime: 0,
              retries: retryCount,
            },
            metadata: {
              url: this.config.targetUrl,
              timestamp: new Date(),
              scraperId: this.config.scraperId,
              browserType: this.config.browser.type,
            },
          };

          // Properly record exception in span
          this.observability.tracer.recordException(span, error, {
            'scraper.failure_type': 'retry_exhausted',
            'scraper.final_attempt': retryResult.attempts,
          });

          // Set span attributes for failure
          span.setAttributes({
            'scraper.success': false,
            'scraper.total_time_ms': totalTime,
            'scraper.retries': retryCount,
            'scraper.failure_reason': errorMessage,
          });

          // Use production-focused error logging
          this.observability.logger.logScrapingError(
            this.config.targetUrl,
            totalTime,
            error,
            retryCount
          );

          // Record failure metrics with error categorization
          this.observability.metrics.recordScrapingFailure(
            this.config.targetUrl,
            totalTime / 1000,
            error.name || 'UnknownError',
            retryCount
          );

          return result;
        }
        
      } catch (error) {
        const totalTime = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Unexpected scraping error';
        const scrapingError = error instanceof Error ? error : new Error(errorMessage);

        // Properly record exception in span with comprehensive context
        this.observability.tracer.recordException(span, scrapingError, {
          'scraper.failure_type': 'unexpected_error',
          'scraper.error_phase': 'outer_catch',
          'scraper.total_time_ms': totalTime,
        });

        const result: ScrapingResult = {
          success: false,
          error: errorMessage,
          metrics: {
            totalTime,
            pageLoadTime: 0,
            extractionTime: 0,
            retries: 0,
          },
          metadata: {
            url: this.config.targetUrl,
            timestamp: new Date(),
            scraperId: this.config.scraperId,
            browserType: this.config.browser.type,
          },
        };

        // Set span attributes for unexpected error
        span.setAttributes({
          'scraper.success': false,
          'scraper.total_time_ms': totalTime,
          'scraper.unexpected_error': true,
        });

        // Use enhanced error recording
        this.observability.recordError('scraping_unexpected_error', scrapingError, {
          url: this.config.targetUrl,
          scraper_id: this.config.scraperId,
          phase: 'unexpected_exception',
        });

        return result;
      }
    });
  }

  /**
   * Calculate data quality score based on completeness and reasonableness
   */
  private calculateDataQuality(data: { waitTimeMinutes?: number; totalPatients?: number; updateDelayMinutes?: number } | undefined): number {
    if (!data) return 0;
    
    let score = 0;
    let factors = 0;
    
    // Wait time reasonableness (0-300 minutes is reasonable)
    if (data.waitTimeMinutes !== undefined) {
      factors++;
      if (data.waitTimeMinutes >= 0 && data.waitTimeMinutes <= 300) {
        score += 0.4; // 40% weight for reasonable wait time
      }
    }
    
    // Patient count reasonableness (0-100 is reasonable for ER)
    const patientCount = data.totalPatients;
    if (patientCount !== undefined) {
      factors++;
      if (patientCount >= 0 && patientCount <= 100) {
        score += 0.3; // 30% weight for reasonable patient count
      }
    }
    
    // Data freshness (< 60 minutes is good)
    if (data.updateDelayMinutes !== undefined) {
      factors++;
      if (data.updateDelayMinutes < 60) {
        score += 0.3; // 30% weight for fresh data
      }
    }
    
    return factors > 0 ? score : 0;
  }

  private async performScraping(): Promise<{
    data?: CreateHospitalMetric;
    pageLoadTime: number;
    extractionTime: number;
    userAgent?: string;
  }> {
    const page = await this.browserManager.createPage();

    try {
      // Navigate to target URL
      const pageLoadStart = Date.now();

      await page.goto(this.config.targetUrl, {
        waitUntil: 'networkidle',
        timeout: this.config.pageTimeout,
      });

      const pageLoadTime = Date.now() - pageLoadStart;
      const userAgent = await page.evaluate(() => navigator.userAgent);

      this.observability.logger.debug('Page loaded successfully', {
        url: this.config.targetUrl,
        loadTime: pageLoadTime,
        userAgent,
      });

      // Wait for page to be fully ready
      await this.browserManager.waitForNetworkIdle(page);

      // Extract data
      const extractionStart = Date.now();
      const extractionResult = await this.dataExtractor.extractHospitalData(
        page,
        this.config.targetUrl,
        this.config.scraperId
      );
      const extractionTime = Date.now() - extractionStart;

      if (!extractionResult.success) {
        throw new Error(extractionResult.error || 'Data extraction failed');
      }

      return {
        data: extractionResult.data!,
        pageLoadTime,
        extractionTime,
        userAgent,
      };
    } finally {
      await this.browserManager.closePage(page);
    }
  }

  async shutdown(): Promise<void> {
    return this.observability.tracer.wrapAsync('scraper_shutdown', async span => {
      this.observability.logger.info('Shutting down Playwright scraper', {
        scraperId: this.config.scraperId,
      });

      await this.browserManager.shutdown();

      span.setAttributes({
        'scraper.shutdown': true,
      });

      this.observability.logger.info('Playwright scraper shutdown completed');
    });
  }

  // Utility methods
  async takeScreenshot(filename?: string): Promise<Buffer | null> {
    if (!this.browserManager.isInitialized()) {
      return null;
    }

    try {
      const page = await this.browserManager.createPage();
      await page.goto(this.config.targetUrl);

      const screenshot = await this.browserManager.takeScreenshot(page, filename);

      await this.browserManager.closePage(page);

      return screenshot;
    } catch (error) {
      this.observability.recordError('screenshot_failed', error as Error);
      return null;
    }
  }

  async healthCheck(): Promise<boolean> {
    return this.observability.tracer.wrapAsync('scraper_health_check', async span => {
      try {
        if (!this.browserManager.isInitialized()) {
          await this.browserManager.initialize();
        }

        const page = await this.browserManager.createPage();
        await page.goto('about:blank');
        await this.browserManager.closePage(page);

        span.setAttributes({
          'health_check.success': true,
        });

        return true;
      } catch (error) {
        span.setAttributes({
          'health_check.success': false,
          'health_check.error': error instanceof Error ? error.message : 'Unknown',
        });

        this.observability.recordError('scraper_health_check_failed', error as Error);
        return false;
      }
    });
  }

  // Configuration methods
  updateConfig(updates: Partial<ScrapingConfig>): void {
    Object.assign(this.config, updates);

    this.observability.logger.info('Scraper configuration updated', {
      updates,
      newConfig: this.config,
    });
  }

  getConfig(): ScrapingConfig {
    return { ...this.config };
  }
}
