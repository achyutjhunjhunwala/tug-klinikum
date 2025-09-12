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
    return this.observability.tracer.wrapAsync('scraper_initialize', async (span) => {
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

    return this.observability.tracer.wrapAsync('scraper_scrape', async (span) => {
      span.setAttributes({
        'scraper.correlation_id': correlationId,
        'scraper.target_url': this.config.targetUrl,
        'scraper.id': this.config.scraperId,
      });

      this.observability.logger.info('Starting scraping operation', {
        operation: 'scraping_start',
        target_url: this.config.targetUrl,
        correlationId,
      });
      this.observability.metrics.scrapingAttempts.add(1, { source: this.config.targetUrl });

      try {
        // Execute scraping with retry logic
        const retryResult = await this.retryHandler.executeNetworkOperation(
          () => this.performScraping(),
          'hospital_scraping'
        );

        const totalTime = Date.now() - startTime;

        if (retryResult.success && retryResult.data) {
          const result: ScrapingResult = {
            success: true,
            data: retryResult.data.data,
            metrics: {
              totalTime,
              pageLoadTime: retryResult.data.pageLoadTime,
              extractionTime: retryResult.data.extractionTime,
              retries: retryResult.attempts - 1,
            },
            metadata: {
              url: this.config.targetUrl,
              timestamp: new Date(),
              scraperId: this.config.scraperId,
              browserType: this.config.browser.type,
              userAgent: retryResult.data.userAgent,
            },
          };

          span.setAttributes({
            'scraper.success': true,
            'scraper.wait_time': retryResult.data.data?.waitTimeMinutes || 0,
            'scraper.total_time_ms': totalTime,
            'scraper.retries': retryResult.attempts - 1,
          });

          this.observability.logger.info('Scraping operation finished successfully', {
            operation: 'scraping_success',
            target_url: this.config.targetUrl,
            duration: totalTime,
            records_found: 1,
          });

          this.observability.metrics.scrapingSuccess.add(1, { source: this.config.targetUrl });
          this.observability.metrics.scrapingDuration.record(totalTime / 1000, {
            source: this.config.targetUrl,
            status: 'success',
          });

          return result;

        } else {
          const errorMessage = retryResult.error?.message || 'Unknown scraping error';
          const result: ScrapingResult = {
            success: false,
            error: errorMessage,
            metrics: {
              totalTime,
              pageLoadTime: 0,
              extractionTime: 0,
              retries: retryResult.attempts - 1,
            },
            metadata: {
              url: this.config.targetUrl,
              timestamp: new Date(),
              scraperId: this.config.scraperId,
              browserType: this.config.browser.type,
            },
          };

          span.setAttributes({
            'scraper.success': false,
            'scraper.error': errorMessage,
            'scraper.total_time_ms': totalTime,
            'scraper.retries': retryResult.attempts - 1,
          });

          this.observability.logger.error('Scraping operation failed', retryResult.error || new Error(errorMessage), {
            operation: 'scraping_error',
            target_url: this.config.targetUrl,
            duration: totalTime,
          });

          this.observability.metrics.scrapingFailures.add(1, {
            source: this.config.targetUrl,
            error_type: retryResult.error?.name || 'Unknown',
          });
          this.observability.metrics.scrapingDuration.record(totalTime / 1000, {
            source: this.config.targetUrl,
            status: 'failure',
          });

          return result;
        }

      } catch (error) {
        const totalTime = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Unexpected error';

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

        span.setAttributes({
          'scraper.success': false,
          'scraper.error': errorMessage,
          'scraper.total_time_ms': totalTime,
        });

        this.observability.recordError('scraping_unexpected_error', error as Error, {
          url: this.config.targetUrl,
          scraper_id: this.config.scraperId,
        });

        return result;
      }
    });
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
    return this.observability.tracer.wrapAsync('scraper_shutdown', async (span) => {
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
    return this.observability.tracer.wrapAsync('scraper_health_check', async (span) => {
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