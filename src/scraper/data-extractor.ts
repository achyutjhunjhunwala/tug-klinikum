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
  rawData?: Record<string, unknown>;
}

export class DataExtractor {
  constructor(private readonly observability: ObservabilityProvider) {}

  async extractHospitalData(
    page: Page,
    sourceUrl: string,
    scraperId: string
  ): Promise<DataExtractionResult> {
    const startTime = Date.now();

    return this.observability.tracer.wrapAsync('data_extraction', async span => {
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
    return this.observability.tracer.wrapAsync('wait_page_ready', async span => {
      // Wait for network to be idle
      await page.waitForLoadState('networkidle', { timeout: 30000 });

      // Wait for specific elements that indicate the page is ready
      const waitPromises = [
        // Wait for main content area
        page
          .waitForSelector('.content, .main, #main, .container', { timeout: 10000 })
          .catch(() => null),

        // Wait for any wait time displays
        page
          .waitForSelector('[class*="wait"], [class*="time"], [id*="wait"], [id*="time"]', {
            timeout: 5000,
          })
          .catch(() => null),
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

  private async scrapePageData(page: Page): Promise<Record<string, unknown>> {
    return this.observability.tracer.wrapAsync('scrape_page_data', async span => {
      const data: Record<string, unknown> = {};

      // Extract wait time information - Updated for Vivantes website structure
      const waitTimeSelectors = [
        '.wazimo__waittime',
        '.wazimo__waittime .fact',
        '.wazimo--box.wazimo__waittime',
        '[class*="wazimo"] .fact',
        '.wartezeitAnzeige',
        '.wartezeit',
        '.wait-time',
        'span:has-text("min")',
        'div:has-text("Wartezeit")',
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
        } catch {
          // Continue with next selector
        }
      }

      // Extract patient count information - Updated for Vivantes website structure
      const patientSelectors = [
        '.wazimo__waiting',
        '.wazimo__waiting .fact',
        '.wazimo__ambulance', 
        '.wazimo__ambulance .fact',
        '.wazimo__emergencies',         // NEW: Emergency cases selector (plural!)
        '.wazimo__emergencies .fact',   // NEW: Emergency cases fact
        '.wazimo--box .fact',
        '[class*="patient"]',
        '[class*="anzahl"]',
        '[class*="notfall"]',           // NEW: Emergency cases
        '[class*="emergency"]',         // NEW: Emergency cases
        'span:has-text("Patient")',
        'span:has-text("Notfall")',     // NEW: Emergency cases
        'span:has-text("Lebensbedrohlich")', // NEW: Life-threatening emergencies
        'div:has-text("Patienten")',
        'div:has-text("Notfälle")',     // NEW: Emergency cases
        'div:has-text("Lebensbedrohliche")', // NEW: Life-threatening emergencies
      ];

      for (const selector of patientSelectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            const text = await element.textContent();
            if (text) {
              data[`patients_${selector}`] = text.trim();
              this.observability.logger.debug('Patient data found', {
                selector,
                text: text.trim(),
              });
            }
          }
        } catch {
          // Continue with next selector
        }
      }

      // Extract update time information - Updated for Vivantes website structure
      const updateSelectors = [
        '.wazimo__age',
        '.wazimo__age b',
        '[class*="age"]',
        '[class*="update"]',
        '[class*="aktuell"]',
        '.last-updated',
        '.timestamp',
        'span:has-text("aktualisiert")',
        'span:has-text("zuletzt")',
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
        } catch {
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
        'scrape.selectors_tried':
          waitTimeSelectors.length + patientSelectors.length + updateSelectors.length,
        'scrape.data_points_found': Object.keys(data).length,
      });

      return data;
    });
  }

  private async parseScrapedData(rawData: Record<string, unknown>): Promise<ScrapedData> {
    return this.observability.tracer.wrapAsync('parse_scraped_data', async span => {
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

      this.observability.logger.info('Data parsing completed', {
        waitTime: result.waitTimeMinutes,
        totalPatients: result.totalPatients,
        ambulancePatients: result.ambulancePatients,
        emergencyCases: result.emergencyCases,
        updateDelay: result.updateDelayMinutes,
        rawDataKeys: Object.keys(rawData),
      });

      return result as ScrapedData;
    });
  }

  private extractWaitTime(data: Record<string, unknown>): number | null {
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

            // Sanity check: wait times should be reasonable (0-480 minutes = 8 hours)
            if (minutes >= 0 && minutes <= 480) {
              this.observability.logger.info('Wait time extracted', {
                source: key,
                value,
                extractedMinutes: minutes,
              });

              return minutes;
            } else {
              this.observability.logger.warn('Rejected unreasonable wait time', {
                source: key,
                value,
                extractedMinutes: minutes,
              });
            }
          }
        }
      }
    }

    return null;
  }

  private extractPatientCount(
    data: Record<string, unknown>,
    type: 'total' | 'ambulance' | 'emergency'
  ): number | undefined {
    // Priority-based extraction - check most specific selectors first
    const selectorPriority = {
      total: [
        'patients_.wazimo__waiting',           // Highest priority: specific selector
        'patients_.wazimo__waiting .fact',
        'patients_.wazimo--box .fact',
      ],
      ambulance: [
        'patients_.wazimo__ambulance',         // Highest priority: specific selector  
        'patients_.wazimo__ambulance .fact',
        'patients_.wazimo--box .fact',
      ],
      emergency: [
        'patients_.wazimo__emergencies',       // Highest priority: specific selector (plural!)
        'patients_.wazimo__emergencies .fact',
        'patients_[class*="notfall"]',         // Emergency-related selectors
        'patients_span:has-text("Lebensbedrohlich")',
        'patients_div:has-text("Lebensbedrohliche")',
      ],
    };

    const keywords = {
      total: ['behandlung', 'warten', 'patient*innen sind'],
      ambulance: ['rettungswagen', 'kamen mit dem', 'ambulance'],
      emergency: ['lebensbedrohlich', 'notfall', 'notfälle', 'emergency', 'dringend'],
    };

    const prioritySelectors = selectorPriority[type];
    const searchKeywords = keywords[type];

    // First, try priority selectors (most specific)
    for (const prioritySelector of prioritySelectors) {
      if (data[prioritySelector]) {
        const value = data[prioritySelector];
        if (typeof value === 'string') {
          const match = value.match(/(\d+)/);
          if (match && match[1]) {
            const count = parseInt(match[1], 10);
            
            // Sanity check: patient counts should be reasonable (0-200)
            if (count >= 0 && count <= 200) {
              this.observability.logger.info('Patient count extracted (priority)', {
                type,
                selector: prioritySelector,
                value,
                extractedCount: count,
              });
              return count;
            }
          }
        }
      }
    }

    // Fallback: search through all data with keyword matching
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string') {
        const lowerValue = value.toLowerCase();
        const lowerKey = key.toLowerCase();

        const isRelevant = searchKeywords.some(
          keyword => lowerValue.includes(keyword) || lowerKey.includes(keyword)
        );

        if (isRelevant) {
          const match = value.match(/(\d+)/);
          if (match && match[1]) {
            const count = parseInt(match[1], 10);
            
            // Sanity check: reject unreasonable numbers
            if (count >= 0 && count <= 200) {
              this.observability.logger.info('Patient count extracted (fallback)', {
                type,
                source: key,
                value,
                extractedCount: count,
              });
              return count;
            } else {
              this.observability.logger.warn('Rejected unreasonable patient count', {
                type,
                source: key,
                value,
                extractedCount: count,
              });
            }
          }
        }
      }
    }

    return undefined;
  }

  /**
   * Extracts the data freshness indicator from hospital website
   * 
   * This method parses German text patterns to determine how long ago
   * the hospital last updated their emergency room status.
   * 
   * @param data Raw scraped data from the website
   * @returns Number of minutes since hospital's last data update, or undefined if not found
   * 
   * @example
   * // German text: "zuletzt aktualisiert vor 14 min"
   * // Returns: 14
   * 
   * // German text: "vor 5 min"  
   * // Returns: 5
   * 
   * // English fallback: "updated 20 min ago"
   * // Returns: 20
   */
  private extractUpdateDelay(data: Record<string, unknown>): number | undefined {
    // Regex patterns for extracting update delay in multiple languages
    const patterns = [
      /vor\s*(\d+)\s*min/i,                           // "vor 14 min"
      /zuletzt\s*aktualisiert\s*vor\s*(\d+)\s*min/i, // "zuletzt aktualisiert vor 14 min" (primary)
      /(\d+)\s*min.*ago/i,                            // "14 min ago" (English fallback)
      /updated\s*(\d+)\s*min/i                        // "updated 14 min" (English fallback)
    ];

    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string') {
        for (const pattern of patterns) {
          const match = value.match(pattern);
          if (match && match[1]) {
            const delay = parseInt(match[1], 10);

            this.observability.logger.debug('Hospital data freshness extracted', {
              source: key,
              originalText: value,
              extractedDelayMinutes: delay,
              patternUsed: pattern.source,
              dataFreshness: delay <= 5 ? 'very fresh' : delay <= 15 ? 'fresh' : delay <= 30 ? 'moderate' : 'stale'
            });

            return delay;
          }
        }
      }
    }

    return undefined;
  }
}
