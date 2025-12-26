import { Request } from 'express';
import { AuthenticatedRequest } from '../services/TenantContextManager';
import MultiTenantMonitor, { OperationType } from './MultiTenantMonitor';

/**
 * Cache entry interface
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  institutionId: string;
  accessCount: number;
  lastAccessed: number;
}

/**
 * Cache statistics interface
 */
interface CacheStats {
  totalEntries: number;
  hitRate: number;
  missRate: number;
  averageAccessTime: number;
  memoryUsage: number;
  topKeys: Array<{ key: string; accessCount: number }>;
}

/**
 * Data type for TTL configuration
 */
type DataType = 'institution' | 'user_profile' | 'course_catalog' | 'enrollment_data' | 'settings' | 'branding' | 'statistics';

/**
 * Institutional cache manager for multi-tenant data caching
 */
export class InstitutionalCacheManager {
  private static instance: InstitutionalCacheManager;
  private cache: Map<string, CacheEntry<any>> = new Map();
  private monitor: MultiTenantMonitor;
  private stats = {
    hits: 0,
    misses: 0,
    totalAccessTime: 0,
    accessCount: 0
  };

  // Cache configuration
  private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_CACHE_SIZE = 10000;
  private readonly CLEANUP_INTERVAL = 60 * 1000; // 1 minute
  private cleanupTimer?: NodeJS.Timeout;

  // TTL configurations for different data types
  private readonly TTL_CONFIG: Record<string, number> = {
    institution: 15 * 60 * 1000,      // 15 minutes - rarely changes
    user_profile: 10 * 60 * 1000,    // 10 minutes - changes occasionally
    course_catalog: 5 * 60 * 1000,   // 5 minutes - changes regularly
    enrollment_data: 2 * 60 * 1000,  // 2 minutes - changes frequently
    settings: 30 * 60 * 1000,        // 30 minutes - rarely changes
    branding: 60 * 60 * 1000,        // 1 hour - very rarely changes
    statistics: 1 * 60 * 1000        // 1 minute - changes very frequently
  };

  private constructor() {
    this.monitor = MultiTenantMonitor.getInstance();
    this.startCleanupTimer();
  }

  public static getInstance(): InstitutionalCacheManager {
    if (!InstitutionalCacheManager.instance) {
      InstitutionalCacheManager.instance = new InstitutionalCacheManager();
    }
    return InstitutionalCacheManager.instance;
  }

  /**
   * Get data from cache or execute provider function
   */
  public async get<T>(
    key: string,
    institutionId: string,
    provider: () => Promise<T>,
    options: {
      ttl?: number;
      dataType?: DataType;
      skipCache?: boolean;
    } = {}
  ): Promise<T> {
    const startTime = Date.now();
    const cacheKey = this.generateKey(key, institutionId);

    // Skip cache if requested
    if (options.skipCache) {
      const data = await provider();
      const duration = Date.now() - startTime;
      this.updateStats(false, duration);
      return data;
    }

    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && this.isValid(cached)) {
      // Update access statistics
      cached.accessCount++;
      cached.lastAccessed = Date.now();
      
      const duration = Date.now() - startTime;
      this.updateStats(true, duration);
      
      this.monitor.logOperation(
        OperationType.DATA_ACCESS,
        `Cache hit: ${key}`,
        'success',
        undefined,
        { institutionId, duration, cached: true }
      );

      return cached.data;
    }

    // Cache miss - fetch data
    try {
      const data = await provider();
      const duration = Date.now() - startTime;
      
      // Determine TTL
      const ttl = options.ttl || 
                  (options.dataType && typeof options.dataType === 'string' && this.TTL_CONFIG[options.dataType]) || 
                  this.DEFAULT_TTL;

      // Store in cache
      this.set(key, data, institutionId, ttl);
      
      this.updateStats(false, duration);
      
      this.monitor.logOperation(
        OperationType.DATA_ACCESS,
        `Cache miss: ${key}`,
        'success',
        undefined,
        { institutionId, duration, cached: false }
      );

      return data;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.updateStats(false, duration);
      
      this.monitor.logOperation(
        OperationType.DATA_ACCESS,
        `Cache error: ${key}`,
        'failure',
        undefined,
        { institutionId, duration, error: (error as Error).message }
      );

      throw error;
    }
  }

  /**
   * Set data in cache
   */
  public set<T>(
    key: string,
    data: T,
    institutionId: string,
    ttl: number = this.DEFAULT_TTL
  ): void {
    const cacheKey = this.generateKey(key, institutionId);
    
    // Check cache size and cleanup if necessary
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      this.evictLeastRecentlyUsed();
    }

    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl,
      institutionId,
      accessCount: 0,
      lastAccessed: Date.now()
    };

    this.cache.set(cacheKey, entry);
  }

  /**
   * Invalidate cache entries for specific institution
   */
  public invalidate(institutionId: string, keyPattern?: string): number {
    let invalidatedCount = 0;
    const keysToDelete: string[] = [];

    for (const [cacheKey, entry] of this.cache.entries()) {
      if (entry.institutionId === institutionId) {
        if (!keyPattern || cacheKey.includes(keyPattern)) {
          keysToDelete.push(cacheKey);
          invalidatedCount++;
        }
      }
    }

    keysToDelete.forEach(key => this.cache.delete(key));

    this.monitor.logOperation(
      OperationType.DATA_ACCESS,
      'Cache invalidation',
      'success',
      undefined,
      { institutionId, keyPattern, invalidatedCount }
    );

    return invalidatedCount;
  }

  /**
   * Invalidate specific cache key
   */
  public invalidateKey(key: string, institutionId: string): boolean {
    const cacheKey = this.generateKey(key, institutionId);
    const deleted = this.cache.delete(cacheKey);

    if (deleted) {
      this.monitor.logOperation(
        OperationType.DATA_ACCESS,
        'Cache key invalidation',
        'success',
        undefined,
        { institutionId, key }
      );
    }

    return deleted;
  }

  /**
   * Cache middleware for Express routes
   */
  public middleware(
    keyGenerator: (req: Request) => string,
    options: {
      ttl?: number;
      dataType?: DataType;
      skipCache?: (req: Request) => boolean;
    } = {}
  ) {
    return async (req: Request, res: any, next: any) => {
      const authReq = req as AuthenticatedRequest;
      const institutionId = authReq.tenantContext?.institutionId?.toString();

      if (!institutionId) {
        return next();
      }

      // Check if we should skip cache
      if (options.skipCache && options.skipCache(req)) {
        return next();
      }

      const key = keyGenerator(req);
      const cacheKey = this.generateKey(key, institutionId);
      const cached = this.cache.get(cacheKey);

      if (cached && this.isValid(cached)) {
        // Cache hit - return cached data
        cached.accessCount++;
        cached.lastAccessed = Date.now();
        
        this.updateStats(true, 0);
        
        res.json(cached.data);
        return;
      }

      // Cache miss - continue to route handler
      // Store original res.json to intercept response
      const originalJson = res.json;
      res.json = (data: any) => {
        // Cache the response data
        const ttl = options.ttl || 
                    (options.dataType && typeof options.dataType === 'string' && this.TTL_CONFIG[options.dataType]) || 
                    this.DEFAULT_TTL;
        
        this.set(key, data, institutionId, ttl);
        this.updateStats(false, 0);
        
        // Call original json method
        return originalJson.call(res, data);
      };

      next();
    };
  }

  /**
   * Warm up cache with frequently accessed data
   */
  public async warmUp(
    institutionId: string,
    dataProviders: Array<{
      key: string;
      provider: () => Promise<any>;
      dataType?: DataType;
    }>
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      const promises = dataProviders.map(async ({ key, provider, dataType }) => {
        try {
          const data = await provider();
          const ttl = (dataType && typeof dataType === 'string' && this.TTL_CONFIG[dataType]) || this.DEFAULT_TTL;
          this.set(key, data, institutionId, ttl);
          return { key, success: true };
        } catch (error) {
          console.error(`Cache warm-up failed for ${key}:`, error);
          return { key, success: false, error: (error as Error).message };
        }
      });

      const results = await Promise.all(promises);
      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      
      const duration = Date.now() - startTime;
      
      this.monitor.logOperation(
        OperationType.DATA_ACCESS,
        'Cache warm-up',
        failed === 0 ? 'success' : 'warning',
        undefined,
        { institutionId, successful, failed, duration }
      );

      console.log(`Cache warm-up completed for ${institutionId}: ${successful} successful, ${failed} failed`);
    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.monitor.logOperation(
        OperationType.PERFORMANCE_ISSUE,
        'Cache warm-up failed',
        'failure',
        undefined,
        { institutionId, duration, error: (error as Error).message }
      );

      throw error;
    }
  }

  /**
   * Get cache statistics
   */
  public getStats(institutionId?: string): CacheStats {
    let entries = Array.from(this.cache.entries());
    
    if (institutionId) {
      entries = entries.filter(([_, entry]) => entry.institutionId === institutionId);
    }

    const totalEntries = entries.length;
    const hitRate = this.stats.accessCount > 0 ? 
      (this.stats.hits / this.stats.accessCount) * 100 : 0;
    const missRate = 100 - hitRate;
    const averageAccessTime = this.stats.accessCount > 0 ? 
      this.stats.totalAccessTime / this.stats.accessCount : 0;

    // Calculate memory usage (approximate)
    const memoryUsage = entries.reduce((total, [key, entry]) => {
      return total + key.length + JSON.stringify(entry.data).length;
    }, 0);

    // Get top accessed keys
    const topKeys = entries
      .map(([key, entry]) => ({ key, accessCount: entry.accessCount }))
      .sort((a, b) => b.accessCount - a.accessCount)
      .slice(0, 10);

    return {
      totalEntries,
      hitRate: Math.round(hitRate * 100) / 100,
      missRate: Math.round(missRate * 100) / 100,
      averageAccessTime: Math.round(averageAccessTime * 100) / 100,
      memoryUsage,
      topKeys
    };
  }

  /**
   * Clear all cache entries
   */
  public clear(institutionId?: string): number {
    if (!institutionId) {
      const count = this.cache.size;
      this.cache.clear();
      this.resetStats();
      return count;
    }

    return this.invalidate(institutionId);
  }

  /**
   * Get cache health information
   */
  public getHealth(): {
    status: 'healthy' | 'warning' | 'critical';
    issues: string[];
    recommendations: string[];
  } {
    const stats = this.getStats();
    const issues: string[] = [];
    const recommendations: string[] = [];
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';

    // Check hit rate
    if (stats.hitRate < 50) {
      issues.push(`Low cache hit rate: ${stats.hitRate}%`);
      recommendations.push('Consider increasing TTL values or implementing cache warm-up');
      status = 'warning';
    }

    // Check memory usage
    if (stats.memoryUsage > 100 * 1024 * 1024) { // 100MB
      issues.push(`High memory usage: ${Math.round(stats.memoryUsage / 1024 / 1024)}MB`);
      recommendations.push('Consider reducing cache size or implementing more aggressive eviction');
      status = 'warning';
    }

    // Check cache size
    if (stats.totalEntries > this.MAX_CACHE_SIZE * 0.9) {
      issues.push(`Cache near capacity: ${stats.totalEntries}/${this.MAX_CACHE_SIZE}`);
      recommendations.push('Consider increasing max cache size or reducing TTL values');
      if (status === 'healthy') status = 'warning';
    }

    // Check average access time
    if (stats.averageAccessTime > 100) {
      issues.push(`Slow cache access time: ${stats.averageAccessTime}ms`);
      recommendations.push('Consider optimizing cache key generation or data serialization');
      status = 'critical';
    }

    return { status, issues, recommendations };
  }

  /**
   * Private helper methods
   */
  private generateKey(key: string, institutionId: string): string {
    return `${institutionId}:${key}`;
  }

  private isValid(entry: CacheEntry<any>): boolean {
    return Date.now() - entry.timestamp < entry.ttl;
  }

  private updateStats(hit: boolean, duration: number): void {
    if (hit) {
      this.stats.hits++;
    } else {
      this.stats.misses++;
    }
    this.stats.accessCount++;
    this.stats.totalAccessTime += duration;
  }

  private resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      totalAccessTime: 0,
      accessCount: 0
    };
  }

  private evictLeastRecentlyUsed(): void {
    let oldestKey = '';
    let oldestTime = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.CLEANUP_INTERVAL);
  }

  private cleanup(): void {
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (!this.isValid(entry)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.cache.delete(key));

    if (keysToDelete.length > 0) {
      console.log(`Cache cleanup: removed ${keysToDelete.length} expired entries`);
    }
  }

  /**
   * Shutdown cache manager
   */
  public shutdown(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.cache.clear();
    this.resetStats();
  }
}

export default InstitutionalCacheManager;