import { Router } from 'express';
import { hospitalRoutes } from './hospital';

const router = Router();

// Mount hospital routes
router.use('/hospital', hospitalRoutes);

// Root API endpoint
router.get('/', (req, res) => {
  res.json({
    message: 'TUG-Klinikum Hospital API',
    version: '1.0.0',
    endpoints: [
      'GET /api/hospital/metrics?department={adult|children}&timeRange={6h|24h|7d|15d|1m|3m}',
      'GET /api/hospital/health'
    ],
    rateLimit: {
      window: '1 minute',
      maxRequests: 20
    }
  });
});

export { router as apiRoutes };