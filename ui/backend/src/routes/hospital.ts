import { Router } from 'express';
import { HospitalController } from '../controllers/hospitalController';
import { validateMetricsQuery, handleValidationErrors } from '../middlewares/validation';

const router = Router();
const hospitalController = new HospitalController();

// Initialize the controller (this will be called from app.ts)
export const initializeHospitalController = async () => {
  await hospitalController.initialize();
  return hospitalController;
};

// Hospital metrics endpoint with validation
router.get(
  '/metrics',
  validateMetricsQuery,
  handleValidationErrors,
  hospitalController.getMetrics
);

// Health check endpoint
router.get('/health', hospitalController.getHealth);

export { router as hospitalRoutes, hospitalController };