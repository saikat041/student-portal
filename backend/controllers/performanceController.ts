import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../services/TenantContextManager';
import PerformanceOptimizer from '../utils/PerformanceOptimizer';
import DatabaseIndexOptimizer from '../utils/DatabaseIndexOptimizer';
import InstitutionalCacheManager from '../utils/InstitutionalCacheManager';
import MultiTenantMonitor from '../utils/MultiTenantMonitor';
import MultiTenantErrorHandler, { MultiTenantErrorType } from '../utils/MultiTenantErrorHandler';

const performanceOptimizer = PerformanceOptimizer.getInstance();
const indexOptimizer = DatabaseIndexOptimizer.getInstance();
const cacheManager = InstitutionalCacheManager.getInstance();
const monitor = MultiTenantMonitor.getInstance();
const errorHandler = MultiTenantErrorHandler.getInstance();

/**
 * Get comprehensive performance dashboard data
 * Requirements: Performance monitoring and optimization
 */
export const getPerformanceDashboard = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { hours = 24 } = req.query;
    
    if (!authReq.tenantContext || authReq.tenantContext.userInstitution.role !== 'institution_admin') {
      const error = errorHandler.handleInsufficientPrivileges(
        req,
        'institution_admin',
        'view performance dashboard'
      );
      res.status(error.statusCode).json(error.toJSON());
      return;
    }

    const institutionId = authReq.tenantContext.institutionId.toString();
    const hoursNum = Number(hours);

    // Gather performance data
    const [
      monitoringStats,
      performanceStats,
      cacheStats,
      cacheHealth,
      queryAnalysis
    ] = await Promise.all([
      monitor.getStatistics(institutionId, hoursNum),
      performanceOptimizer.getPerformanceStats(institutionId, hoursNum),
      cacheManager.getStats(institutionId),
      cacheManager.getHealth(),
      indexOptimizer.analyzeQueryPerformance(institutionId)
    ]);

    // Calculate performance metrics
    const performanceMetrics = {
      responseTime: {
        average: performanceStats.averageQueryTime,
        threshold: 2000,
        status: performanceStats.averageQueryTime < 1000 ? 'good' : 
                performanceStats.averageQueryTime < 2000 ? 'warning' : 'critical'
      },
      throughput: {
        requestsPerHour: Math.round(monitoringStats.totalEvents / hoursNum),
        successRate: monitoringStats.eventsByResult.success ? 
          Math.round((monitoringStats.eventsByResult.success / monitoringStats.totalEvents) * 100) : 0
      },
      errors: {
        total: monitoringStats.eventsByResult.failure || 0,
        rate: monitoringStats.totalEvents > 0 ? 
          Math.round(((monitoringStats.eventsByResult.failure || 0) / monitoringStats.totalEvents) * 100) : 0
      }
    };

    // System health assessment
    const healthScore = calculateHealthScore(performanceMetrics, cacheStats, queryAnalysis);
    
    res.json({
      institutionId,
      timeframe: `${hours} hours`,
      healthScore,
      performance: {
        metrics: performanceMetrics,
        queryStats: performanceStats,
        slowQueries: queryAnalysis.slowQueries.slice(0, 10)
      },
      cache: {
        stats: cacheStats,
        health: cacheHealth
      },
      monitoring: {
        totalEvents: monitoringStats.totalEvents,
        eventsByType: monitoringStats.eventsByType,
        eventsByResult: monitoringStats.eventsByResult,
        securityAlerts: monitoringStats.securityAlerts,
        performanceIssues: monitoringStats.performanceIssues
      },
      recommendations: [
        ...queryAnalysis.recommendations,
        ...cacheHealth.recommendations,
        ...generatePerformanceRecommendations(performanceMetrics, performanceStats)
      ],
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting performance dashboard:', error);
    res.status(500).json({
      error: 'Failed to retrieve performance dashboard',
      message: (error as Error).message
    });
  }
};

/**
 * Get detailed query performance analysis
 */
export const getQueryAnalysis = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    
    if (!authReq.tenantContext || authReq.tenantContext.userInstitution.role !== 'institution_admin') {
      const error = errorHandler.handleInsufficientPrivileges(
        req,
        'institution_admin',
        'view query analysis'
      );
      res.status(error.statusCode).json(error.toJSON());
      return;
    }

    const institutionId = authReq.tenantContext.institutionId.toString();
    const analysis = await indexOptimizer.analyzeQueryPerformance(institutionId);
    
    res.json({
      institutionId,
      analysis,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting query analysis:', error);
    res.status(500).json({
      error: 'Failed to retrieve query analysis',
      message: (error as Error).message
    });
  }
};

/**
 * Get cache performance metrics
 */
export const getCacheMetrics = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    
    if (!authReq.tenantContext || authReq.tenantContext.userInstitution.role !== 'institution_admin') {
      const error = errorHandler.handleInsufficientPrivileges(
        req,
        'institution_admin',
        'view cache metrics'
      );
      res.status(error.statusCode).json(error.toJSON());
      return;
    }

    const institutionId = authReq.tenantContext.institutionId.toString();
    const stats = cacheManager.getStats(institutionId);
    const health = cacheManager.getHealth();
    
    res.json({
      institutionId,
      cache: {
        stats,
        health
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting cache metrics:', error);
    res.status(500).json({
      error: 'Failed to retrieve cache metrics',
      message: (error as Error).message
    });
  }
};

/**
 * Invalidate cache for institution
 */
export const invalidateCache = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { keyPattern } = req.body;
    
    if (!authReq.tenantContext || authReq.tenantContext.userInstitution.role !== 'institution_admin') {
      const error = errorHandler.handleInsufficientPrivileges(
        req,
        'institution_admin',
        'invalidate cache'
      );
      res.status(error.statusCode).json(error.toJSON());
      return;
    }

    const institutionId = authReq.tenantContext.institutionId.toString();
    const invalidatedCount = cacheManager.invalidate(institutionId, keyPattern);
    
    monitor.logOperation(
      'DATA_ACCESS' as any,
      'Cache invalidation',
      'success',
      req,
      { institutionId, keyPattern, invalidatedCount }
    );

    res.json({
      message: 'Cache invalidated successfully',
      institutionId,
      keyPattern,
      invalidatedCount,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error invalidating cache:', error);
    res.status(500).json({
      error: 'Failed to invalidate cache',
      message: (error as Error).message
    });
  }
};

/**
 * Warm up cache for institution
 */
export const warmUpCache = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    
    if (!authReq.tenantContext || authReq.tenantContext.userInstitution.role !== 'institution_admin') {
      const error = errorHandler.handleInsufficientPrivileges(
        req,
        'institution_admin',
        'warm up cache'
      );
      res.status(error.statusCode).json(error.toJSON());
      return;
    }

    const institutionId = authReq.tenantContext.institutionId.toString();
    
    // Define common data to warm up
    const dataProviders = [
      {
        key: 'institution_settings',
        provider: async () => {
          // Mock implementation - would fetch actual institution settings
          return { academicYear: '2024-2025', semesterSystem: 'semester' };
        },
        dataType: 'settings' as const
      },
      {
        key: 'institution_branding',
        provider: async () => {
          // Mock implementation - would fetch actual branding
          return { primaryColor: '#003366', logo: '/logo.png' };
        },
        dataType: 'branding' as const
      },
      {
        key: 'active_courses_count',
        provider: async () => {
          // Mock implementation - would fetch actual course count
          return { count: 150 };
        },
        dataType: 'statistics' as const
      }
    ];

    await cacheManager.warmUp(institutionId, dataProviders);
    
    res.json({
      message: 'Cache warm-up completed successfully',
      institutionId,
      warmedKeys: dataProviders.map(p => p.key),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error warming up cache:', error);
    res.status(500).json({
      error: 'Failed to warm up cache',
      message: (error as Error).message
    });
  }
};

/**
 * Optimize database indexes
 */
export const optimizeIndexes = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    
    if (!authReq.tenantContext || authReq.tenantContext.userInstitution.role !== 'institution_admin') {
      const error = errorHandler.handleInsufficientPrivileges(
        req,
        'institution_admin',
        'optimize database indexes'
      );
      res.status(error.statusCode).json(error.toJSON());
      return;
    }

    // This is a potentially expensive operation, so we'll run it in the background
    const institutionId = authReq.tenantContext.institutionId.toString();
    
    // Start index optimization (this would typically be queued)
    indexOptimizer.createMultiTenantIndexes()
      .then(() => {
        monitor.logOperation(
          'DATA_ACCESS' as any,
          'Index optimization completed',
          'success',
          req,
          { institutionId }
        );
      })
      .catch((error) => {
        monitor.logOperation(
          'PERFORMANCE_ISSUE' as any,
          'Index optimization failed',
          'failure',
          req,
          { institutionId, error: error.message }
        );
      });

    res.json({
      message: 'Index optimization started',
      institutionId,
      status: 'in_progress',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error starting index optimization:', error);
    res.status(500).json({
      error: 'Failed to start index optimization',
      message: (error as Error).message
    });
  }
};

/**
 * Get system resource usage
 */
export const getResourceUsage = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    
    if (!authReq.tenantContext || authReq.tenantContext.userInstitution.role !== 'institution_admin') {
      const error = errorHandler.handleInsufficientPrivileges(
        req,
        'institution_admin',
        'view resource usage'
      );
      res.status(error.statusCode).json(error.toJSON());
      return;
    }

    const institutionId = authReq.tenantContext.institutionId.toString();
    
    // Get memory usage
    const memoryUsage = process.memoryUsage();
    const cacheStats = cacheManager.getStats(institutionId);
    
    res.json({
      institutionId,
      memory: {
        rss: Math.round(memoryUsage.rss / 1024 / 1024), // MB
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
        external: Math.round(memoryUsage.external / 1024 / 1024) // MB
      },
      cache: {
        memoryUsage: Math.round(cacheStats.memoryUsage / 1024 / 1024), // MB
        entries: cacheStats.totalEntries
      },
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting resource usage:', error);
    res.status(500).json({
      error: 'Failed to retrieve resource usage',
      message: (error as Error).message
    });
  }
};

/**
 * Helper function to calculate overall health score
 */
function calculateHealthScore(
  performanceMetrics: any,
  cacheStats: any,
  queryAnalysis: any
): {
  score: number;
  status: 'excellent' | 'good' | 'fair' | 'poor';
  factors: Array<{ name: string; score: number; weight: number }>;
} {
  const factors = [
    {
      name: 'Response Time',
      score: performanceMetrics.responseTime.status === 'good' ? 100 : 
             performanceMetrics.responseTime.status === 'warning' ? 70 : 30,
      weight: 0.3
    },
    {
      name: 'Success Rate',
      score: performanceMetrics.throughput.successRate,
      weight: 0.25
    },
    {
      name: 'Cache Hit Rate',
      score: cacheStats.hitRate,
      weight: 0.2
    },
    {
      name: 'Error Rate',
      score: Math.max(0, 100 - performanceMetrics.errors.rate * 2),
      weight: 0.15
    },
    {
      name: 'Query Performance',
      score: Math.max(0, 100 - queryAnalysis.slowQueries.length * 10),
      weight: 0.1
    }
  ];

  const weightedScore = factors.reduce((total, factor) => {
    return total + (factor.score * factor.weight);
  }, 0);

  const score = Math.round(weightedScore);
  let status: 'excellent' | 'good' | 'fair' | 'poor';

  if (score >= 90) status = 'excellent';
  else if (score >= 75) status = 'good';
  else if (score >= 60) status = 'fair';
  else status = 'poor';

  return { score, status, factors };
}

/**
 * Generate performance recommendations
 */
function generatePerformanceRecommendations(
  performanceMetrics: any,
  performanceStats: any
): string[] {
  const recommendations: string[] = [];

  if (performanceMetrics.responseTime.average > 2000) {
    recommendations.push('Consider implementing response caching for frequently accessed endpoints');
  }

  if (performanceMetrics.errors.rate > 5) {
    recommendations.push('High error rate detected - review error logs and implement better error handling');
  }

  if (performanceStats.slowQueries > 10) {
    recommendations.push('Multiple slow queries detected - consider database query optimization');
  }

  if (performanceMetrics.throughput.requestsPerHour > 1000) {
    recommendations.push('High traffic detected - consider implementing rate limiting and load balancing');
  }

  return recommendations;
}