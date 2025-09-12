import { z } from 'zod';

export const HospitalMetricSchema = z.object({
  id: z.string().uuid(),
  timestamp: z.date(),
  waitTimeMinutes: z.number().int().min(0),
  totalPatients: z.number().int().min(0).optional(),
  ambulancePatients: z.number().int().min(0).optional(),
  emergencyCases: z.number().int().min(0).optional(),
  updateDelayMinutes: z.number().int().min(0).optional(),
  scrapingSuccess: z.boolean(),
  sourceUrl: z.string().url(),
  metadata: z.object({
    scraperId: z.string(),
    version: z.string(),
    processingTimeMs: z.number().int().min(0),
    browserType: z.enum(['chromium', 'firefox', 'webkit']).optional(),
    userAgent: z.string().optional(),
    screenResolution: z.string().optional(),
    errorMessage: z.string().optional(),
  }),
});

export type HospitalMetric = z.infer<typeof HospitalMetricSchema>;

export const CreateHospitalMetricSchema = HospitalMetricSchema.omit({ 
  id: true, 
  timestamp: true 
});

export type CreateHospitalMetric = z.infer<typeof CreateHospitalMetricSchema>;

export interface HospitalMetricSummary {
  totalRecords: number;
  avgWaitTime: number;
  minWaitTime: number;
  maxWaitTime: number;
  successRate: number;
  lastUpdated: Date;
}

export interface TimeRange {
  startTime: Date;
  endTime: Date;
}

export interface HospitalMetricTrend {
  period: string;
  avgWaitTime: number;
  patientCount: number;
  timestamp: Date;
}