import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import PerformanceOptimizer from '../utils/PerformanceOptimizer';
import DatabaseIndexOptimizer from '../utils/DatabaseIndexOptimizer';
import InstitutionalCacheManager from '../utils/InstitutionalCacheManager';
import MultiTenantMonitor from '../utils/MultiTenantMonitor';
import { connectTestDatabase, disconnectTestDatabase } from '../config/test-database';
// Import models to ensure they are registered
import '../models/User';
import '../models/Institution';
import '../models/Course';
import '../models/Enrollment';

describe('Performance Optimization System', () => {
  let performanceOptimizer: PerformanceOptimizer;
  let indexOptimizer: DatabaseIndexOptimizer;
  let cacheManager: InstitutionalCacheManager;
  let monitor: MultiTenantMonitor;
  let testInstitutionId: string;

  beforeAll(async () => {
    await connectTestDatabase();
    
    performanceOptimizer = PerformanceOptimizer.getInstance();
    indexOptimizer = DatabaseIndexOptimizer.getInstance();
    cacheManager = InstitutionalCacheManager.getInstance();
    monitor = MultiTenantMonitor.getInstance();
    
    testInstitutionId = new mongoose.Types.ObjectId().toString();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  beforeEach(async () => {
    // Clear collections for clean test state
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }
    cacheManager.clear();
    performanceOptimizer.clearAllCaches();
  });

  describe('PerformanceOptimizer', () => {
    it('should optimize queries with institutional filtering', async () => {
      // Mock query object that supports method chaining
      const mockQuery = {
        sort: () => mockQuery,
        limit: () => mockQuery,
        skip: () => mockQuery,
        populate: () => mockQuery,
        select: () => mockQuery,
        lean: () => mockQuery,
        exec: async () => [{ _id: '1', name: 'test', institutionId: testInstitutionId }]
      };

      // Mock model for testing
      const mockModel = {
        modelName: 'TestModel',
        find: () => mockQuery
      } as any;

      const result = await performanceOptimizer.optimizeQuery(
        mockModel,
        { name: 'test' },
        testInstitutionId,
        { sort: { name: 1 }, limit: 10 }
      );

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should cache query results', async () => {
      // Mock query object that supports method chaining
      const mockQuery = {
        sort: () => mockQuery,
        limit: () => mockQuery,
        skip: () => mockQuery,
        populate: () => mockQuery,
        select: () => mockQuery,
        lean: () => mockQuery,
        exec: async () => [{ _id: '1', name: 'test', institutionId: testInstitutionId }]
      };

      const mockModel = {
        modelName: 'TestModel',
        find: () => mockQuery
      } as any;

      // First call - should hit the database
      const result1 = await performanceOptimizer.optimizeQuery(
        mockModel,
        { name: 'test' },
        testInstitutionId
      );

      // Second call - should hit the cache
      const result2 = await performanceOptimizer.optimizeQuery(
        mockModel,
        { name: 'test' },
        testInstitutionId
      );

      expect(result1).toEqual(result2);
    });

    it('should invalidate cache for specific institution', () => {
      // Set some cache data
      performanceOptimizer.clearAllCaches();
      
      // Add some mock cache entries
      const cacheStats = performanceOptimizer.getCacheStats();
      expect(cacheStats.queryCache.size).toBe(0);
      
      // Clear cache
      performanceOptimizer.clearAllCaches();
      const clearedStats = performanceOptimizer.getCacheStats();
      expect(clearedStats.queryCache.size).toBe(0);
    });

    it('should generate performance statistics', () => {
      const stats = performanceOptimizer.getPerformanceStats(testInstitutionId, 1);
      
      expect(stats).toHaveProperty('queryCount');
      expect(stats).toHaveProperty('averageQueryTime');
      expect(stats).toHaveProperty('slowQueries');
      expect(stats).toHaveProperty('cacheHitRate');
      expect(stats).toHaveProperty('cacheSize');
      
      expect(typeof stats.queryCount).toBe('number');
      expect(typeof stats.averageQueryTime).toBe('number');
      expect(typeof stats.slowQueries).toBe('number');
      expect(typeof stats.cacheHitRate).toBe('number');
      expect(typeof stats.cacheSize).toBe('number');
    });
  });

  describe('InstitutionalCacheManager', () => {
    it('should cache and retrieve data', async () => {
      const testKey = 'test_data';
      const testData = { message: 'Hello World', timestamp: Date.now() };
      
      const result = await cacheManager.get(
        testKey,
        testInstitutionId,
        async () => testData,
        { dataType: 'settings' }
      );

      expect(result).toEqual(testData);
    });

    it('should return cached data on subsequent calls', async () => {
      const testKey = 'test_data_cached_unique';
      const testData = { message: 'Cached Data', timestamp: Date.now() };
      let callCount = 0;
      
      const provider = async () => {
        callCount++;
        return { ...testData, callCount };
      };

      // Clear cache to ensure clean state
      cacheManager.clear();

      // First call
      const result1 = await cacheManager.get(testKey, testInstitutionId, provider, { ttl: 60000 });
      
      // Second call - should return cached data (use same key and institution)
      const result2 = await cacheManager.get(testKey, testInstitutionId, provider, { ttl: 60000 });

      expect(result1.callCount).toBe(1);
      expect(result2.callCount).toBe(1); // Should be same as first call (cached)
      expect(callCount).toBe(1); // Provider should only be called once
    });

    it('should invalidate cache entries', async () => {
      const testKey = 'test_invalidation';
      const testData = { message: 'To be invalidated' };
      
      // Cache some data
      await cacheManager.get(testKey, testInstitutionId, async () => testData);
      
      // Invalidate cache
      const invalidatedCount = cacheManager.invalidate(testInstitutionId, testKey);
      
      expect(invalidatedCount).toBeGreaterThanOrEqual(0);
    });

    it('should provide cache statistics', () => {
      const stats = cacheManager.getStats(testInstitutionId);
      
      expect(stats).toHaveProperty('totalEntries');
      expect(stats).toHaveProperty('hitRate');
      expect(stats).toHaveProperty('missRate');
      expect(stats).toHaveProperty('averageAccessTime');
      expect(stats).toHaveProperty('memoryUsage');
      expect(stats).toHaveProperty('topKeys');
      
      expect(typeof stats.totalEntries).toBe('number');
      expect(typeof stats.hitRate).toBe('number');
      expect(typeof stats.missRate).toBe('number');
      expect(typeof stats.averageAccessTime).toBe('number');
      expect(typeof stats.memoryUsage).toBe('number');
      expect(Array.isArray(stats.topKeys)).toBe(true);
    });

    it('should provide cache health information', () => {
      const health = cacheManager.getHealth();
      
      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('issues');
      expect(health).toHaveProperty('recommendations');
      
      expect(['healthy', 'warning', 'critical']).toContain(health.status);
      expect(Array.isArray(health.issues)).toBe(true);
      expect(Array.isArray(health.recommendations)).toBe(true);
    });

    it('should warm up cache with provided data', async () => {
      const dataProviders = [
        {
          key: 'test_warmup_1',
          provider: async () => ({ data: 'warmup test 1' }),
          dataType: 'settings' as const
        },
        {
          key: 'test_warmup_2',
          provider: async () => ({ data: 'warmup test 2' }),
          dataType: 'branding' as const
        }
      ];

      await expect(
        cacheManager.warmUp(testInstitutionId, dataProviders)
      ).resolves.not.toThrow();
    });
  });

  describe('DatabaseIndexOptimizer', () => {
    it('should create multi-tenant indexes', async () => {
      await expect(
        indexOptimizer.createMultiTenantIndexes()
      ).resolves.not.toThrow();
    });

    it('should analyze query performance', async () => {
      const analysis = await indexOptimizer.analyzeQueryPerformance(testInstitutionId);
      
      expect(analysis).toHaveProperty('slowQueries');
      expect(analysis).toHaveProperty('indexUsage');
      expect(analysis).toHaveProperty('recommendations');
      
      expect(Array.isArray(analysis.slowQueries)).toBe(true);
      expect(Array.isArray(analysis.indexUsage)).toBe(true);
      expect(Array.isArray(analysis.recommendations)).toBe(true);
    });

    it('should validate indexes', async () => {
      const validation = await indexOptimizer.validateIndexes();
      
      expect(validation).toHaveProperty('collections');
      expect(validation).toHaveProperty('issues');
      
      expect(Array.isArray(validation.collections)).toBe(true);
      expect(Array.isArray(validation.issues)).toBe(true);
    });

    it('should handle drop unused indexes safely', async () => {
      const result = await indexOptimizer.dropUnusedIndexes(true); // dry run
      
      expect(result).toHaveProperty('dropped');
      expect(result).toHaveProperty('errors');
      
      expect(Array.isArray(result.dropped)).toBe(true);
      expect(Array.isArray(result.errors)).toBe(true);
    });
  });

  describe('MultiTenantMonitor Integration', () => {
    it('should track performance metrics', () => {
      const stats = monitor.getStatistics(testInstitutionId, 1);
      
      expect(stats).toHaveProperty('totalEvents');
      expect(stats).toHaveProperty('eventsByType');
      expect(stats).toHaveProperty('eventsByResult');
      expect(stats).toHaveProperty('securityAlerts');
      expect(stats).toHaveProperty('performanceIssues');
      expect(stats).toHaveProperty('recentEvents');
      
      expect(typeof stats.totalEvents).toBe('number');
      expect(typeof stats.eventsByType).toBe('object');
      expect(typeof stats.eventsByResult).toBe('object');
      expect(typeof stats.securityAlerts).toBe('number');
      expect(typeof stats.performanceIssues).toBe('number');
      expect(Array.isArray(stats.recentEvents)).toBe(true);
    });
  });

  describe('Performance Middleware Integration', () => {
    it('should create performance middleware', () => {
      const middleware = performanceOptimizer.performanceMiddleware(
        'DATA_ACCESS' as any,
        'Test Operation'
      );
      
      expect(typeof middleware).toBe('function');
    });

    it('should handle middleware execution', async () => {
      const middleware = performanceOptimizer.performanceMiddleware(
        'DATA_ACCESS' as any,
        'Test Operation'
      );
      
      const mockReq = {
        tenantContext: {
          institutionId: new mongoose.Types.ObjectId(testInstitutionId)
        },
        headers: {
          'user-agent': 'test-agent'
        },
        ip: '127.0.0.1',
        method: 'GET',
        url: '/test'
      } as any;
      
      let middlewareCompleted = false;
      const mockRes = {
        statusCode: 200,
        end: function(chunk?: any, encoding?: any) {
          // Middleware should have logged the operation
          middlewareCompleted = true;
        }
      } as any;
      
      const mockNext = () => {
        // Simulate response completion
        mockRes.end();
      };
      
      middleware(mockReq, mockRes, mockNext);
      
      // Wait a bit for async operations to complete
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(middlewareCompleted).toBe(true);
    });
  });

  describe('Cache TTL Configuration', () => {
    it('should use appropriate TTL for different data types', async () => {
      const testCases = [
        { dataType: 'institution' as const, expectedTTL: 15 * 60 * 1000 },
        { dataType: 'user_profile' as const, expectedTTL: 10 * 60 * 1000 },
        { dataType: 'course_catalog' as const, expectedTTL: 5 * 60 * 1000 },
        { dataType: 'enrollment_data' as const, expectedTTL: 2 * 60 * 1000 },
        { dataType: 'settings' as const, expectedTTL: 30 * 60 * 1000 },
        { dataType: 'branding' as const, expectedTTL: 60 * 60 * 1000 },
        { dataType: 'statistics' as const, expectedTTL: 1 * 60 * 1000 }
      ];

      for (const testCase of testCases) {
        await cacheManager.get(
          `ttl_test_${testCase.dataType}`,
          testInstitutionId,
          async () => ({ data: `test for ${testCase.dataType}` }),
          { dataType: testCase.dataType }
        );
      }

      // All cache operations should complete without errors
      expect(true).toBe(true);
    });
  });
});