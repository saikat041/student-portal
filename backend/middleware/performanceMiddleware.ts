import { Request, Response, NextFunction } from 'express';
import PerformanceOptimizer from '../utils/PerformanceOptimizer';
import { OperationType } from '../utils/MultiTenantMonitor';

const performanceOptimizer = PerformanceOptimizer.getInstance();

/**
 * Performance monitoring middleware for different operation types
 */
export const performanceMiddleware = (operationType: OperationType, operationName: string) => {
  return performanceOptimizer.performanceMiddleware(operationType, operationName);
};

/**
 * Database query performance middleware
 */
export const queryPerformanceMiddleware = (operationName: string) => {
  return performanceMiddleware(OperationType.DATA_ACCESS, operationName);
};

/**
 * Authentication performance middleware
 */
export const authPerformanceMiddleware = (operationName: string) => {
  return performanceMiddleware(OperationType.AUTHENTICATION, operationName);
};

/**
 * User management performance middleware
 */
export const userManagementPerformanceMiddleware = (operationName: string) => {
  return performanceMiddleware(OperationType.USER_MANAGEMENT, operationName);
};

/**
 * Course management performance middleware
 */
export const courseManagementPerformanceMiddleware = (operationName: string) => {
  return performanceMiddleware(OperationType.COURSE_MANAGEMENT, operationName);
};

/**
 * Enrollment performance middleware
 */
export const enrollmentPerformanceMiddleware = (operationName: string) => {
  return performanceMiddleware(OperationType.ENROLLMENT, operationName);
};

/**
 * Administrative performance middleware
 */
export const adminPerformanceMiddleware = (operationName: string) => {
  return performanceMiddleware(OperationType.ADMINISTRATIVE, operationName);
};

/**
 * Cache performance middleware for frequently accessed endpoints
 */
export const cachePerformanceMiddleware = (keyGenerator: (req: Request) => string, options?: {
  ttl?: number;
  dataType?: 'institution' | 'user_profile' | 'course_catalog' | 'enrollment_data' | 'settings' | 'branding' | 'statistics';
  skipCache?: (req: Request) => boolean;
}) => {
  const InstitutionalCacheManager = require('../utils/InstitutionalCacheManager').default;
  const cacheManager = InstitutionalCacheManager.getInstance();
  
  return cacheManager.middleware(keyGenerator, options);
};

/**
 * Cleanup middleware to run cache cleanup periodically
 */
export const cleanupMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Run cleanup every 100 requests (approximate)
  if (Math.random() < 0.01) {
    performanceOptimizer.cleanupCache();
  }
  next();
};

export default {
  performanceMiddleware,
  queryPerformanceMiddleware,
  authPerformanceMiddleware,
  userManagementPerformanceMiddleware,
  courseManagementPerformanceMiddleware,
  enrollmentPerformanceMiddleware,
  adminPerformanceMiddleware,
  cachePerformanceMiddleware,
  cleanupMiddleware
};