import { Page } from 'playwright';
import { z } from 'zod';
import { CreateHospitalMetric } from '@/models/hospital-metric';
import { ObservabilityProvider } from '@/observability';

// Validation schema for scraped data
const ScrapedDataSchema = z.object({
  waitTimeMinutes: z.number().int().min(0).max(1440), // Max 24 hours
  totalPatients: z.number().int().min(0).optional(),
  ambulancePatients: z.number().int().min(0).optional(),
  emergencyCases: z.number().int().min(0).optional(),
  updateDelayMinutes: z.number().int().min(0).max(1440).optional(),
  lastUpdateText: z.string().optional(),
});

type ScrapedData = z.infer<typeof ScrapedDataSchema>;

export interface DataExtractionResult {
  success: boolean;
  data?: CreateHospitalMetric;
  error?: string;
  processingTimeMs: number;
  elementsFound: string[];
  rawData?: Record<string, any>;
}

export class DataExtractor {
  constructor(private readonly observability: ObservabilityProvider) {}

  async extractHospitalData(
    page: Page,
    sourceUrl: string,
    scraperId: string
  ): Promise<DataExtractionResult> {
    const startTime = Date.now();
    
    return this.observability.tracer.wrapAsync('data_extraction', async (span) => {
      span.setAttributes({
        'extraction.url': sourceUrl,
        'extraction.scraper_id': scraperId,
      });

      this.observability.logger.info('Starting data extraction', {
        url: sourceUrl,
        scraperId,
      });

      try {
        // Wait for page to be fully loaded
        await this.waitForPageReady(page);

        // Extract raw data from page
        const rawData = await this.scrapePageData(page);
        const elementsFound = Object.keys(rawData);

        this.observability.logger.debug('Raw data extracted', {
          elementsFound,
          rawDataKeys: Object.keys(rawData),
        });

        // Parse and validate the scraped data
        const parsedData = await this.parseScrapedData(rawData);
        
        // Validate the data
        const validatedData = ScrapedDataSchema.parse(parsedData);

        // Create the hospital metric
        const hospitalMetric: CreateHospitalMetric = {
          ...validatedData,
          scrapingSuccess: true,
          sourceUrl,
          metadata: {
            scraperId,
            version: '1.0.0',
            processingTimeMs: Date.now() - startTime,
            browserType: await page.evaluate(() => {
              const userAgent = navigator.userAgent;
              if (userAgent.includes('Chrome')) return 'chromium';
              if (userAgent.includes('Firefox')) return 'firefox';
              if (userAgent.includes('Safari')) return 'webkit';
              return 'chromium';
            }),
            userAgent: await page.evaluate(() => navigator.userAgent),
            screenResolution: await page.evaluate(() => `${screen.width}x${screen.height}`),
          },
        };

        const result: DataExtractionResult = {
          success: true,
          data: hospitalMetric,
          processingTimeMs: Date.now() - startTime,
          elementsFound,
          rawData,
        };

        span.setAttributes({
          'extraction.success': true,
          'extraction.wait_time': validatedData.waitTimeMinutes,
          'extraction.elements_found': elementsFound.length,
          'extraction.processing_time_ms': result.processingTimeMs,
        });

        this.observability.logger.info('Data extraction completed successfully', {
          waitTime: validatedData.waitTimeMinutes,
          totalPatients: validatedData.totalPatients,
          processingTime: result.processingTimeMs,
        });

        return result;

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown extraction error';
        
        const result: DataExtractionResult = {
          success: false,
          error: errorMessage,
          processingTimeMs: Date.now() - startTime,
          elementsFound: [],
        };

        span.setAttributes({
          'extraction.success': false,
          'extraction.error': errorMessage,
          'extraction.processing_time_ms': result.processingTimeMs,
        });

        this.observability.recordError('data_extraction_failed', error as Error, {
          url: sourceUrl,
          scraper_id: scraperId,
        });

        return result;
      }
    });
  }

  private async waitForPageReady(page: Page): Promise<void> {
    return this.observability.tracer.wrapAsync('wait_page_ready', async (span) => {
      // Wait for network to be idle
      await page.waitForLoadState('networkidle', { timeout: 30000 });
      
      // Wait for specific elements that indicate the page is ready
      const waitPromises = [
        // Wait for main content area
        page.waitForSelector('.content, .main, #main, .container', { timeout: 10000 }).catch(() => null),
        
        // Wait for any wait time displays
        page.waitForSelector('[class*="wait"], [class*="time"], [id*="wait"], [id*="time"]', { timeout: 5000 }).catch(() => null),
      ];

      await Promise.allSettled(waitPromises);

      // Additional wait for JavaScript to execute
      await page.waitForTimeout(2000);

      span.setAttributes({
        'page.ready': true,
        'page.url': page.url(),
      });
    });
  }

  private async scrapePageData(page: Page): Promise<Record<string, any>> {
    return this.observability.tracer.wrapAsync('scrape_page_data', async (span) => {
      const data: Record<string, any> = {};

      // Extract wait time information
      const waitTimeSelectors = [
        '[class*="wait"][class*="time"]',
        '[id*="wait"][id*="time"]',
        '.wartezeitAnzeige',
        '.wartezeit',
        '.wait-time',
        '.emergency-wait',
        'span:has-text("min")',
        'div:has-text("Wartezeit")',
        'div:has-text("min")',
      ];

      for (const selector of waitTimeSelectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            const text = await element.textContent();
            if (text) {
              data[`waitTime_${selector}`] = text.trim();
            }
          }
        } catch (error) {
          // Continue with next selector
        }
      }

      // Extract patient count information
      const patientSelectors = [
        '[class*="patient"]',
        '[class*="anzahl"]',
        '[id*="patient"]',
        '.patient-count',
        '.emergency-count',
        'span:has-text("Patient")',
        'div:has-text("Patienten")',
      ];

      for (const selector of patientSelectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            const text = await element.textContent();
            if (text) {
              data[`patients_${selector}`] = text.trim();
            }
          }
        } catch (error) {
          // Continue with next selector
        }
      }

      // Extract update time information
      const updateSelectors = [
        '[class*="update"]',
        '[class*="aktuell"]',
        '[id*="update"]',
        '.last-updated',
        '.timestamp',
        'span:has-text("aktualisiert")',
        'div:has-text("vor")',
        'time',
      ];

      for (const selector of updateSelectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            const text = await element.textContent();
            if (text) {
              data[`update_${selector}`] = text.trim();
            }
          }
        } catch (error) {
          // Continue with next selector
        }
      }

      // Get full page text as fallback
      const bodyText = await page.textContent('body');
      if (bodyText) {
        data['fullPageText'] = bodyText;
      }

      // Get page title
      data['pageTitle'] = await page.title();

      span.setAttributes({
        'scrape.selectors_tried': waitTimeSelectors.length + patientSelectors.length + updateSelectors.length,
        'scrape.data_points_found': Object.keys(data).length,
      });

      return data;
    });
  }

  private async parseScrapedData(rawData: Record<string, any>): Promise<ScrapedData> {
    return this.observability.tracer.wrapAsync('parse_scraped_data', async (span) => {
      const result: Partial<ScrapedData> = {};

      // Parse wait time from various data points
      const waitTime = this.extractWaitTime(rawData);
      if (waitTime !== null) {
        result.waitTimeMinutes = waitTime;
      } else {
        throw new Error('Could not extract wait time from page');
      }

      // Parse patient counts
      result.totalPatients = this.extractPatientCount(rawData, 'total');
      result.ambulancePatients = this.extractPatientCount(rawData, 'ambulance');
      result.emergencyCases = this.extractPatientCount(rawData, 'emergency');

      // Parse update delay
      result.updateDelayMinutes = this.extractUpdateDelay(rawData);

      span.setAttributes({
        'parse.wait_time': result.waitTimeMinutes || 0,
        'parse.total_patients': result.totalPatients || 0,
        'parse.has_update_delay': !!result.updateDelayMinutes,
      });

      this.observability.logger.debug('Data parsing completed', {
        waitTime: result.waitTimeMinutes,
        totalPatients: result.totalPatients,
        updateDelay: result.updateDelayMinutes,
      });

      return result as ScrapedData;
    });
  }

  private extractWaitTime(data: Record<string, any>): number | null {
    // Look for wait time in various formats
    const patterns = [
      /(\d+)\s*min/i,
      /(\d+)\s*minute/i,
      /wartezeit[:\s]*(\d+)/i,
      /wait[:\s]*(\d+)/i,
      /(\d+)\s*std/i, // hours
    ];

    // Search through all data values
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string') {
        for (const pattern of patterns) {
          const match = value.match(pattern);
          if (match && match[1]) {
            let minutes = parseInt(match[1], 10);
            
            // Convert hours to minutes if needed
            if (value.toLowerCase().includes('std') || value.toLowerCase().includes('hour')) {
              minutes *= 60;
            }
            
            this.observability.logger.debug('Wait time extracted', {
              source: key,
              value,
              extractedMinutes: minutes,
            });
            
            return minutes;
          }
        }
      }
    }

    return null;
  }

  private extractPatientCount(data: Record<string, any>, type: 'total' | 'ambulance' | 'emergency'): number | undefined {
    const keywords = {
      total: ['patient', 'gesamt', 'total', 'anzahl'],
      ambulance: ['rettung', 'ambulance', 'krankenwagen', 'rtw'],
      emergency: ['notfall', 'emergency', 'dringend', 'urgent'],
    };

    const searchKeywords = keywords[type];

    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string') {
        const lowerValue = value.toLowerCase();
        const lowerKey = key.toLowerCase();
        
        // Check if this data point is relevant for this type
        const isRelevant = searchKeywords.some(keyword => 
          lowerValue.includes(keyword) || lowerKey.includes(keyword)
        );

        if (isRelevant) {
          const match = value.match(/(\d+)/);
          if (match && match[1]) {
            const count = parseInt(match[1], 10);
            
            this.observability.logger.debug('Patient count extracted', {
              type,
              source: key,
              value,
              extractedCount: count,
            });
            
            return count;
          }
        }
      }
    }

    return undefined;
  }

  private extractUpdateDelay(data: Record<string, any>): number | undefined {
    // Look for "vor X min" or similar patterns
    const patterns = [
      /vor\s*(\d+)\s*min/i,
      /(\d+)\s*min.*ago/i,
      /updated\s*(\d+)\s*min/i,
    ];

    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string') {
        for (const pattern of patterns) {
          const match = value.match(pattern);
          if (match && match[1]) {
            const delay = parseInt(match[1], 10);
            
            this.observability.logger.debug('Update delay extracted', {
              source: key,
              value,
              extractedDelay: delay,
            });
            
            return delay;
          }
        }
      }
    }

    return undefined;
  }

}