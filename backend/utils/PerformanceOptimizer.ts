import mongoose from 'mongoose';
import { Request } from 'express';
import { AuthenticatedRequest } from '../services/TenantContextManager';
import MultiTenantMonitor, { OperationType } from './MultiTenantMonitor';

/**
 * Performance optimization utilities for multi-tenant operations
 */
export class PerformanceOptimizer {
  private static instance: PerformanceOptimizer;
  private monitor: MultiTenantMonitor;
  private queryCache: Map<string, { data: any; timestamp: number; ttl: number }> = new Map();
  private institutionCache: Map<string, { data: any; timestamp: number }> = new Map();

  // Performance thresholds (in milliseconds)
  private readonly QUERY_THRESHOLD = 1000;
  private readonly API_THRESHOLD = 2000;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly INSTITUTION_CACHE_TTL = 15 * 60 * 1000; // 15 minutes

  private constructor() {
    this.monitor = MultiTenantMonitor.getInstance();
  }

  public static getInstance(): PerformanceOptimizer {
    if (!PerformanceOptimizer.instance) {
      PerformanceOptimizer.instance = new PerformanceOptimizer();
    }
    return PerformanceOptimizer.instance;
  }

  /**
   * Optimize MongoDB queries with institutional filtering
   */
  public async optimizeQuery<T>(
    model: mongoose.Model<T>,
    filter: any,
    institutionId: string,
    options: {
      sort?: any;
      limit?: number;
      skip?: number;
      populate?: string | string[];
      select?: string;
      lean?: boolean;
    } = {}
  ): Promise<T[]> {
    const startTime = Date.now();
    const cacheKey = this.generateCacheKey(model.modelName, filter, institutionId, options);

    // Check cache first
    const cached = this.queryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.data;
    }

    try {
      // Add institutional filtering
      const optimizedFilter = {
        ...filter,
        institutionId: new mongoose.Types.ObjectId(institutionId)
      };

      // Build query with optimizations
      let query = model.find(optimizedFilter);

      // Apply options
      if (options.sort) query = query.sort(options.sort);
      if (options.limit) query = query.limit(options.limit);
      if (options.skip) query = query.skip(options.skip);
      if (options.populate) query = query.populate(options.populate);
      if (options.select) query = query.select(options.select);
      if (options.lean !== false) query = query.lean(); // Default to lean for performance

      // Execute query
      const result = await query.exec();
      const duration = Date.now() - startTime;

      // Cache the result
      this.queryCache.set(cacheKey, {
        data: result,
        timestamp: Date.now(),
        ttl: this.CACHE_TTL
      });

      // Monitor performance
      if (duration > this.QUERY_THRESHOLD) {
        this.monitor.logPerformanceIssue(
          `${model.modelName} query`,
          duration,
          this.QUERY_THRESHOLD,
          institutionId
        );
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`Query optimization error for ${model.modelName}:`, error);
      
      this.monitor.logOperation(
        OperationType.PERFORMANCE_ISSUE,
        `Failed ${model.modelName} query`,
        'failure',
        undefined,
        {
          model: model.modelName,
          filter: { ...filter, institutionId },
          duration,
          error: (error as Error).message
        }
      );

      throw error;
    }
  }

  /**
   * Optimize single document queries with caching
   */
  public async optimizeFindById<T>(
    model: mongoose.Model<T>,
    id: string,
    institutionId: string,
    options: {
      populate?: string | string[];
      select?: string;
      lean?: boolean;
    } = {}
  ): Promise<T | null> {
    const startTime = Date.now();
    const cacheKey = this.generateCacheKey(model.modelName, { _id: id }, institutionId, options);

    // Check cache first
    const cached = this.queryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.data;
    }

    try {
      // Build query with institutional filtering
      const filter = {
        _id: new mongoose.Types.ObjectId(id),
        institutionId: new mongoose.Types.ObjectId(institutionId)
      };

      let query = model.findOne(filter);

      // Apply options
      if (options.populate) query = query.populate(options.populate);
      if (options.select) query = query.select(options.select);
      if (options.lean !== false) query = query.lean();

      const result = await query.exec();
      const duration = Date.now() - startTime;

      // Cache the result
      this.queryCache.set(cacheKey, {
        data: result,
        timestamp: Date.now(),
        ttl: this.CACHE_TTL
      });

      // Monitor performance
      if (duration > this.QUERY_THRESHOLD) {
        this.monitor.logPerformanceIssue(
          `${model.modelName} findById`,
          duration,
          this.QUERY_THRESHOLD,
          institutionId
        );
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`FindById optimization error for ${model.modelName}:`, error);
      
      this.monitor.logOperation(
        OperationType.PERFORMANCE_ISSUE,
        `Failed ${model.modelName} findById`,
        'failure',
        undefined,
        {
          model: model.modelName,
          id,
          institutionId,
          duration,
          error: (error as Error).message
        }
      );

      throw error;
    }
  }

  /**
   * Cache institutional data with longer TTL
   */
  public async cacheInstitutionData<T>(
    key: string,
    institutionId: string,
    dataProvider: () => Promise<T>
  ): Promise<T> {
    const cacheKey = `${institutionId}:${key}`;
    const cached = this.institutionCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.INSTITUTION_CACHE_TTL) {
      return cached.data;
    }

    const startTime = Date.now();
    try {
      const data = await dataProvider();
      const duration = Date.now() - startTime;

      // Cache the data
      this.institutionCache.set(cacheKey, {
        data,
        timestamp: Date.now()
      });

      // Monitor performance
      if (duration > this.QUERY_THRESHOLD) {
        this.monitor.logPerformanceIssue(
          `Institution data: ${key}`,
          duration,
          this.QUERY_THRESHOLD,
          institutionId
        );
      }

      return data;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`Institution data caching error for ${key}:`, error);
      
      this.monitor.logOperation(
        OperationType.PERFORMANCE_ISSUE,
        `Failed institution data: ${key}`,
        'failure',
        undefined,
        {
          key,
          institutionId,
          duration,
          error: (error as Error).message
        }
      );

      throw error;
    }
  }

  /**
   * Invalidate cache for specific institution
   */
  public invalidateInstitutionCache(institutionId: string, key?: string): void {
    if (key) {
      const cacheKey = `${institutionId}:${key}`;
      this.institutionCache.delete(cacheKey);
    } else {
      // Invalidate all cache entries for the institution
      const keysToDelete = Array.from(this.institutionCache.keys())
        .filter(k => k.startsWith(`${institutionId}:`));
      
      keysToDelete.forEach(k => this.institutionCache.delete(k));
    }

    // Also clear related query cache entries
    const queryKeysToDelete = Array.from(this.queryCache.keys())
      .filter(k => k.includes(institutionId));
    
    queryKeysToDelete.forEach(k => this.queryCache.delete(k));
  }

  /**
   * Performance monitoring middleware
   */
  public performanceMiddleware = (operationType: OperationType, operationName: string) => {
    return (req: Request, res: any, next: any) => {
      const startTime = Date.now();
      const authReq = req as AuthenticatedRequest;
      const institutionId = authReq.tenantContext?.institutionId?.toString();

      // Override res.end to capture response time
      const originalEnd = res.end;
      res.end = (chunk?: any, encoding?: any) => {
        const duration = Date.now() - startTime;

        // Log performance metrics
        this.monitor.logOperation(
          operationType,
          operationName,
          res.statusCode >= 400 ? 'failure' : 'success',
          req,
          { duration, statusCode: res.statusCode }
        );

        // Check for performance issues
        if (duration > this.API_THRESHOLD) {
          this.monitor.logPerformanceIssue(
            `API: ${operationName}`,
            duration,
            this.API_THRESHOLD,
            institutionId
          );
        }

        // Call original end method
        originalEnd.call(res, chunk, encoding);
      };

      next();
    };
  };

  /**
   * Optimize aggregation queries with institutional filtering
   */
  public async optimizeAggregation<T>(
    model: mongoose.Model<T>,
    pipeline: any[],
    institutionId: string,
    cacheKey?: string
  ): Promise<any[]> {
    const startTime = Date.now();
    const fullCacheKey = cacheKey ? 
      this.generateCacheKey(model.modelName, { aggregation: cacheKey }, institutionId) :
      null;

    // Check cache if key provided
    if (fullCacheKey) {
      const cached = this.queryCache.get(fullCacheKey);
      if (cached && Date.now() - cached.timestamp < cached.ttl) {
        return cached.data;
      }
    }

    try {
      // Add institutional filtering as first stage
      const optimizedPipeline = [
        { $match: { institutionId: new mongoose.Types.ObjectId(institutionId) } },
        ...pipeline
      ];

      const result = await model.aggregate(optimizedPipeline).exec();
      const duration = Date.now() - startTime;

      // Cache the result if key provided
      if (fullCacheKey) {
        this.queryCache.set(fullCacheKey, {
          data: result,
          timestamp: Date.now(),
          ttl: this.CACHE_TTL
        });
      }

      // Monitor performance
      if (duration > this.QUERY_THRESHOLD) {
        this.monitor.logPerformanceIssue(
          `${model.modelName} aggregation`,
          duration,
          this.QUERY_THRESHOLD,
          institutionId
        );
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`Aggregation optimization error for ${model.modelName}:`, error);
      
      this.monitor.logOperation(
        OperationType.PERFORMANCE_ISSUE,
        `Failed ${model.modelName} aggregation`,
        'failure',
        undefined,
        {
          model: model.modelName,
          pipeline,
          duration,
          error: (error as Error).message
        }
      );

      throw error;
    }
  }

  /**
   * Get performance statistics for an institution
   */
  public getPerformanceStats(institutionId: string, hours: number = 24): {
    queryCount: number;
    averageQueryTime: number;
    slowQueries: number;
    cacheHitRate: number;
    cacheSize: number;
  } {
    const stats = this.monitor.getStatistics(institutionId, hours);
    const performanceEvents = stats.recentEvents.filter(event => 
      event.metadata?.duration !== undefined
    );

    const queryTimes = performanceEvents.map(event => event.metadata?.duration || 0);
    const slowQueries = queryTimes.filter(time => time > this.QUERY_THRESHOLD).length;
    const averageQueryTime = queryTimes.length > 0 ? 
      queryTimes.reduce((sum, time) => sum + time, 0) / queryTimes.length : 0;

    // Calculate cache hit rate (approximate)
    const totalCacheEntries = this.queryCache.size + this.institutionCache.size;
    const institutionCacheEntries = Array.from(this.institutionCache.keys())
      .filter(key => key.startsWith(`${institutionId}:`)).length;

    return {
      queryCount: performanceEvents.length,
      averageQueryTime: Math.round(averageQueryTime),
      slowQueries,
      cacheHitRate: totalCacheEntries > 0 ? 
        Math.round((institutionCacheEntries / totalCacheEntries) * 100) : 0,
      cacheSize: totalCacheEntries
    };
  }

  /**
   * Clean up expired cache entries
   */
  public cleanupCache(): void {
    const now = Date.now();

    // Clean query cache
    for (const [key, value] of this.queryCache.entries()) {
      if (now - value.timestamp > value.ttl) {
        this.queryCache.delete(key);
      }
    }

    // Clean institution cache
    for (const [key, value] of this.institutionCache.entries()) {
      if (now - value.timestamp > this.INSTITUTION_CACHE_TTL) {
        this.institutionCache.delete(key);
      }
    }
  }

  /**
   * Generate cache key for queries
   */
  private generateCacheKey(
    modelName: string,
    filter: any,
    institutionId: string,
    options: any = {}
  ): string {
    const filterStr = JSON.stringify(filter, Object.keys(filter).sort());
    const optionsStr = JSON.stringify(options, Object.keys(options).sort());
    return `${modelName}:${institutionId}:${Buffer.from(filterStr + optionsStr).toString('base64')}`;
  }

  /**
   * Clear all caches (for testing or maintenance)
   */
  public clearAllCaches(): void {
    this.queryCache.clear();
    this.institutionCache.clear();
  }

  /**
   * Get cache statistics
   */
  public getCacheStats(): {
    queryCache: { size: number; hitRate: number };
    institutionCache: { size: number; hitRate: number };
  } {
    return {
      queryCache: {
        size: this.queryCache.size,
        hitRate: 0 // Would need to track hits/misses for accurate rate
      },
      institutionCache: {
        size: this.institutionCache.size,
        hitRate: 0 // Would need to track hits/misses for accurate rate
      }
    };
  }
}

export default PerformanceOptimizer;