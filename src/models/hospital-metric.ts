import { z } from 'zod';

/**
 * Hospital Metric Schema - Represents real-time emergency room data
 *
 * This schema defines the structure for hospital emergency room metrics
 * scraped from the Vivantes Friedrichshain hospital website.
 */
export const HospitalMetricSchema = z.object({
  /** Unique identifier for this metric record */
  id: z.string().uuid(),

  /** Timestamp when this data was collected by our scraper */
  timestamp: z.date(),

  /** Department type - Adult or Children emergency room */
  department: z.enum(['adult', 'children']),

  /** Current wait time in minutes for emergency room treatment */
  waitTimeMinutes: z.number().int().min(0),

  /** Total number of patients currently in treatment or waiting */
  totalPatients: z.number().int().min(0).optional(),

  /** Number of patients who arrived by ambulance */
  ambulancePatients: z.number().int().min(0).optional(),

  /** Number of life-threatening emergency cases currently being handled */
  emergencyCases: z.number().int().min(0).optional(),

  /**
   * Data freshness indicator - How many minutes ago the hospital last updated their data
   *
   * This field represents the time delay between when the hospital last updated
   * their emergency room status and when we scraped it. It's extracted from text
   * like "zuletzt aktualisiert vor 14 min" (last updated 14 minutes ago).
   *
   * - Lower values indicate fresher data
   * - Higher values suggest the hospital data might be stale
   * - Useful for data quality assessment and alerting
   * - Range: 0-1440 minutes (0-24 hours)
   *
   * @example
   * // If hospital shows "zuletzt aktualisiert vor 14 min"
   * updateDelayMinutes: 14
   *
   * // If hospital shows "zuletzt aktualisiert vor 2 min"
   * updateDelayMinutes: 2
   */
  updateDelayMinutes: z.number().int().min(0).optional(),

  /** Whether the scraping operation was successful */
  scrapingSuccess: z.boolean(),

  /** Source URL from which this data was scraped */
  sourceUrl: z.string().url(),
  metadata: z.object({
    scraperId: z.string(),
    version: z.string(),
    processingTimeMs: z.number().int().min(0),
    browserType: z.enum(['chromium', 'firefox', 'webkit']).optional(),
    userAgent: z.string().optional(),
    screenResolution: z.string().optional(),
    viewportSize: z.string().optional(),
    errorMessage: z.string().optional(),
  }),
});

export type HospitalMetric = z.infer<typeof HospitalMetricSchema>;

export const CreateHospitalMetricSchema = HospitalMetricSchema.omit({
  id: true,
  timestamp: true,
});

export type CreateHospitalMetric = z.infer<typeof CreateHospitalMetricSchema>;

export interface TimeRange {
  startTime: Date;
  endTime: Date;
}

