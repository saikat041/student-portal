import express from 'express';
import { authenticate } from '../middleware/auth';
import { tenantContext } from '../middleware/tenantContext';
import {
  getPerformanceDashboard,
  getQueryAnalysis,
  getCacheMetrics,
  invalidateCache,
  warmUpCache,
  optimizeIndexes,
  getResourceUsage
} from '../controllers/performanceController';

const router = express.Router();

// Apply authentication and tenant context to all routes
router.use(authenticate);
router.use(tenantContext);

/**
 * Performance monitoring and optimization routes
 * All routes require institution_admin role
 */

// GET /api/performance/dashboard - Get comprehensive performance dashboard
router.get('/dashboard', getPerformanceDashboard);

// GET /api/performance/queries - Get detailed query performance analysis
router.get('/queries', getQueryAnalysis);

// GET /api/performance/cache - Get cache performance metrics
router.get('/cache', getCacheMetrics);

// POST /api/performance/cache/invalidate - Invalidate cache entries
router.post('/cache/invalidate', invalidateCache);

// POST /api/performance/cache/warmup - Warm up cache with common data
router.post('/cache/warmup', warmUpCache);

// POST /api/performance/indexes/optimize - Optimize database indexes
router.post('/indexes/optimize', optimizeIndexes);

// GET /api/performance/resources - Get system resource usage
router.get('/resources', getResourceUsage);

export default router;