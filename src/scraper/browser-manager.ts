import { Browser, BrowserContext, Page, chromium, firefox, webkit } from 'playwright';
import { ObservabilityProvider } from '@/observability';

export type BrowserType = 'chromium' | 'firefox' | 'webkit';

export interface BrowserConfig {
  type: BrowserType;
  headless: boolean;
  timeout: number;
  userAgent?: string | undefined;
  viewport?: {
    width: number;
    height: number;
  } | undefined;
  proxy?: {
    server: string;
    username?: string | undefined;
    password?: string | undefined;
  } | undefined;
}

export interface BrowserManagerOptions {
  config: BrowserConfig;
  observability: ObservabilityProvider;
}

export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  constructor(private readonly options: BrowserManagerOptions) {}

  async initialize(): Promise<void> {
    const { config, observability } = this.options;
    
    return observability.tracer.wrapAsync('browser_initialize', async (span) => {
      span.setAttributes({
        'browser.type': config.type,
        'browser.headless': config.headless,
        'browser.timeout': config.timeout,
      });

      observability.logger.info('Initializing browser', {
        type: config.type,
        headless: config.headless,
      });

      try {
        // Launch browser
        this.browser = await this.launchBrowser(config);
        
        // Create context with configuration
        this.context = await this.browser.newContext({
          userAgent: config.userAgent || this.getDefaultUserAgent(),
          viewport: config.viewport || { width: 1920, height: 1080 },
          ignoreHTTPSErrors: true,
          javaScriptEnabled: true,
        });

        // Set default timeouts
        this.context.setDefaultTimeout(config.timeout);
        this.context.setDefaultNavigationTimeout(config.timeout);

        observability.logger.info('Browser initialized successfully', {
          type: config.type,
          contextId: this.context.toString(),
        });

      } catch (error) {
        observability.recordError('browser_initialization', error as Error, {
          browser_type: config.type,
        });
        throw error;
      }
    });
  }

  async createPage(): Promise<Page> {
    const { observability } = this.options;
    
    return observability.tracer.wrapAsync('browser_create_page', async (span) => {
      if (!this.context) {
        throw new Error('Browser context not initialized. Call initialize() first.');
      }

      const page = await this.context.newPage();
      
      // Set up page event listeners for debugging
      page.on('console', msg => {
        observability.logger.debug('Browser console', {
          type: msg.type(),
          text: msg.text(),
        });
      });

      page.on('pageerror', error => {
        observability.logger.warn('Page error occurred', {
          error: error.message,
        });
      });

      page.on('response', response => {
        if (response.status() >= 400) {
          observability.logger.warn('HTTP error response', {
            url: response.url(),
            status: response.status(),
            statusText: response.statusText(),
          });
        }
      });

      span.setAttributes({
        'page.url': page.url(),
        'page.created': true,
      });

      observability.logger.debug('New page created', {
        url: page.url(),
      });

      return page;
    });
  }

  async closePage(page: Page): Promise<void> {
    const { observability } = this.options;
    
    return observability.tracer.wrapAsync('browser_close_page', async (span) => {
      await page.close();
      
      span.setAttributes({
        'page.closed': true,
      });

      observability.logger.debug('Page closed');
    });
  }

  async shutdown(): Promise<void> {
    const { observability } = this.options;
    
    return observability.tracer.wrapAsync('browser_shutdown', async (span) => {
      observability.logger.info('Shutting down browser');

      try {
        if (this.context) {
          await this.context.close();
          this.context = null;
        }

        if (this.browser) {
          await this.browser.close();
          this.browser = null;
        }

        span.setAttributes({
          'browser.shutdown': true,
        });

        observability.logger.info('Browser shutdown completed');

      } catch (error) {
        observability.recordError('browser_shutdown', error as Error);
        throw error;
      }
    });
  }

  isInitialized(): boolean {
    return this.browser !== null && this.context !== null;
  }

  private async launchBrowser(config: BrowserConfig): Promise<Browser> {
    const launchOptions: any = {
      headless: config.headless,
      timeout: config.timeout,
    };
    
    if (config.proxy) {
      launchOptions.proxy = config.proxy;
    }

    switch (config.type) {
      case 'chromium':
        return chromium.launch({
          ...launchOptions,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
          ],
        });

      case 'firefox':
        return firefox.launch(launchOptions);

      case 'webkit':
        return webkit.launch(launchOptions);

      default:
        throw new Error(`Unsupported browser type: ${config.type}`);
    }
  }

  private getDefaultUserAgent(): string {
    const userAgents = {
      chromium: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      firefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0',
      webkit: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
    };

    return userAgents[this.options.config.type];
  }

  // Utility methods for common browser operations
  async waitForNetworkIdle(page: Page, timeout = 30000): Promise<void> {
    const { observability } = this.options;
    
    return observability.tracer.wrapAsync('browser_wait_network_idle', async (span) => {
      await page.waitForLoadState('networkidle', { timeout });
      
      span.setAttributes({
        'network.idle': true,
        'timeout': timeout,
      });
    });
  }

  async takeScreenshot(page: Page, path?: string): Promise<Buffer> {
    const { observability } = this.options;
    
    return observability.tracer.wrapAsync('browser_screenshot', async (span) => {
      const screenshotOptions: any = {
        fullPage: true,
        type: 'png',
      };
      
      if (path) {
        screenshotOptions.path = path;
      }
      
      const screenshot = await page.screenshot(screenshotOptions);

      span.setAttributes({
        'screenshot.taken': true,
        'screenshot.path': path || 'buffer',
        'screenshot.size': screenshot.length,
      });

      observability.logger.debug('Screenshot captured', {
        path: path || 'buffer',
        size: screenshot.length,
      });

      return screenshot;
    });
  }

  async setUserAgent(userAgent: string): Promise<void> {
    if (!this.context) {
      throw new Error('Browser context not initialized');
    }

    await this.context.setExtraHTTPHeaders({
      'User-Agent': userAgent,
    });

    this.options.observability.logger.debug('User agent updated', {
      userAgent,
    });
  }
}