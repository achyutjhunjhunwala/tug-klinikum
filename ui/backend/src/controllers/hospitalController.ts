import { Request, Response, NextFunction } from 'express';
import { HospitalService } from '../services/hospitalService';
import { Department, TimeRange } from '../types/hospital';
import { PinoLogger } from '../observability/logger';

export class HospitalController {
  private hospitalService: HospitalService;
  private logger: PinoLogger;

  constructor() {
    this.hospitalService = new HospitalService();
    this.logger = new PinoLogger();
  }

  async initialize(): Promise<void> {
    await this.hospitalService.initialize();
  }

  async shutdown(): Promise<void> {
    await this.hospitalService.shutdown();
  }

  // GET /api/hospital/metrics
  getMetrics = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const department = req.query.department as Department;
      const timeRange = req.query.timeRange as TimeRange;
      const from = req.query.from as string | undefined;
      const to = req.query.to as string | undefined;

      this.logger.info('Fetching hospital metrics', { department, timeRange, from, to });

      const result = await this.hospitalService.getHospitalMetrics(
        department,
        timeRange,
        from,
        to
      );

      res.json(result);
    } catch (error) {
      this.logger.error('Error fetching hospital metrics', { error: error instanceof Error ? error.message : error });
      next(error);
    }
  };

  // GET /api/hospital/health
  getHealth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const healthStatus = await this.hospitalService.getHealthStatus();
      res.json(healthStatus);
    } catch (error) {
      this.logger.error('Error fetching health status', { error: error instanceof Error ? error.message : error });
      next(error);
    }
  };
}