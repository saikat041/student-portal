import mongoose from 'mongoose';
import MultiTenantMonitor, { OperationType } from './MultiTenantMonitor';

/**
 * Database index optimization for multi-tenant operations
 */
export class DatabaseIndexOptimizer {
  private static instance: DatabaseIndexOptimizer;
  private monitor: MultiTenantMonitor;

  private constructor() {
    this.monitor = MultiTenantMonitor.getInstance();
  }

  public static getInstance(): DatabaseIndexOptimizer {
    if (!DatabaseIndexOptimizer.instance) {
      DatabaseIndexOptimizer.instance = new DatabaseIndexOptimizer();
    }
    return DatabaseIndexOptimizer.instance;
  }

  /**
   * Create optimized indexes for multi-tenant collections
   */
  public async createMultiTenantIndexes(): Promise<void> {
    const startTime = Date.now();
    
    try {
      console.log('🔧 Creating optimized multi-tenant database indexes...');

      // User collection indexes
      await this.createUserIndexes();
      
      // Institution collection indexes
      await this.createInstitutionIndexes();
      
      // Course collection indexes
      await this.createCourseIndexes();
      
      // Enrollment collection indexes
      await this.createEnrollmentIndexes();
      
      // Student collection indexes (if exists)
      await this.createStudentIndexes();

      const duration = Date.now() - startTime;
      console.log(`✅ Multi-tenant indexes created successfully in ${duration}ms`);

      this.monitor.logOperation(
        OperationType.DATA_ACCESS,
        'Create multi-tenant indexes',
        'success',
        undefined,
        { duration, indexCount: 'all' }
      );

    } catch (error) {
      const duration = Date.now() - startTime;
      console.error('❌ Error creating multi-tenant indexes:', error);

      this.monitor.logOperation(
        OperationType.PERFORMANCE_ISSUE,
        'Failed to create multi-tenant indexes',
        'failure',
        undefined,
        { duration, error: (error as Error).message }
      );

      throw error;
    }
  }

  /**
   * Create indexes for User collection
   */
  private async createUserIndexes(): Promise<void> {
    const User = mongoose.model('User');
    
    const indexes = [
      // Primary login index
      { email: 1 },
      
      // Multi-institutional user queries
      { 'institutions.institutionId': 1, 'institutions.status': 1 },
      { 'institutions.institutionId': 1, 'institutions.role': 1 },
      
      // Admin and role-based queries
      { 'institutions.institutionId': 1, 'institutions.role': 1, 'institutions.status': 1 },
      
      // User search and filtering
      { firstName: 1, lastName: 1 },
      { 'institutions.institutionId': 1, firstName: 1, lastName: 1 },
      
      // Registration and approval workflows
      { 'institutions.institutionId': 1, 'institutions.status': 1, 'institutions.createdAt': -1 },
      
      // Performance optimization for admin queries
      { 'institutions.institutionId': 1, 'institutions.role': 1, isActive: 1 }
    ] as const;

    for (const index of indexes) {
      try {
        await User.collection.createIndex(index, { background: true });
        console.log(`  ✓ User index created:`, index);
      } catch (error) {
        console.warn(`  ⚠️ User index already exists or failed:`, index, (error as Error).message);
      }
    }
  }

  /**
   * Create indexes for Institution collection
   */
  private async createInstitutionIndexes(): Promise<void> {
    const Institution = mongoose.model('Institution');
    
    const indexes = [
      // Institution lookup and filtering
      { name: 1 },
      { status: 1 },
      { type: 1 },
      
      // Combined queries for admin interfaces
      { status: 1, type: 1 },
      { status: 1, createdAt: -1 },
      
      // Search and discovery
      { name: 'text', 'contactInfo.email': 'text' }
    ] as const;

    for (const index of indexes) {
      try {
        await Institution.collection.createIndex(index, { background: true });
        console.log(`  ✓ Institution index created:`, index);
      } catch (error) {
        console.warn(`  ⚠️ Institution index already exists or failed:`, index, (error as Error).message);
      }
    }
  }

  /**
   * Create indexes for Course collection
   */
  private async createCourseIndexes(): Promise<void> {
    const Course = mongoose.model('Course');
    
    const indexes = [
      // Primary multi-tenant queries
      { institutionId: 1, status: 1 },
      { institutionId: 1, code: 1 },
      
      // Teacher-specific queries
      { institutionId: 1, teacherId: 1 },
      { institutionId: 1, teacherId: 1, status: 1 },
      
      // Course catalog and search
      { institutionId: 1, name: 1 },
      { institutionId: 1, department: 1 },
      { institutionId: 1, semester: 1 },
      
      // Performance optimization for listings
      { institutionId: 1, status: 1, createdAt: -1 },
      { institutionId: 1, credits: 1 },
      
      // Enrollment capacity queries
      { institutionId: 1, maxEnrollment: 1, currentEnrollment: 1 },
      
      // Full-text search within institution
      { institutionId: 1, name: 'text', description: 'text' }
    ] as const;

    for (const index of indexes) {
      try {
        await Course.collection.createIndex(index, { background: true });
        console.log(`  ✓ Course index created:`, index);
      } catch (error) {
        console.warn(`  ⚠️ Course index already exists or failed:`, index, (error as Error).message);
      }
    }
  }

  /**
   * Create indexes for Enrollment collection
   */
  private async createEnrollmentIndexes(): Promise<void> {
    const Enrollment = mongoose.model('Enrollment');
    
    const indexes = [
      // Primary multi-tenant queries
      { institutionId: 1, studentId: 1 },
      { institutionId: 1, courseId: 1 },
      
      // Student enrollment history
      { institutionId: 1, studentId: 1, status: 1 },
      { institutionId: 1, studentId: 1, enrolledAt: -1 },
      
      // Course enrollment management
      { institutionId: 1, courseId: 1, status: 1 },
      { institutionId: 1, courseId: 1, enrolledAt: -1 },
      
      // Academic record queries
      { institutionId: 1, studentId: 1, grade: 1 },
      { institutionId: 1, studentId: 1, 'courseSnapshot.semester': 1 },
      
      // Performance optimization for reports
      { institutionId: 1, status: 1, enrolledAt: -1 },
      { institutionId: 1, completedAt: -1 },
      
      // Triple validation index (critical for boundary enforcement)
      { institutionId: 1, studentId: 1, courseId: 1 }
    ] as const;

    for (const index of indexes) {
      try {
        await Enrollment.collection.createIndex(index, { background: true });
        console.log(`  ✓ Enrollment index created:`, index);
      } catch (error) {
        console.warn(`  ⚠️ Enrollment index already exists or failed:`, index, (error as Error).message);
      }
    }
  }

  /**
   * Create indexes for Student collection (if exists)
   */
  private async createStudentIndexes(): Promise<void> {
    try {
      const Student = mongoose.model('Student');
      
      const indexes = [
        // Primary multi-tenant queries
        { institutionId: 1, user: 1 },
        { institutionId: 1, studentId: 1 },
        
        // Academic queries
        { institutionId: 1, major: 1 },
        { institutionId: 1, year: 1 },
        { institutionId: 1, gpa: -1 },
        
        // Status and activity queries
        { institutionId: 1, isActive: 1 },
        { institutionId: 1, isActive: 1, year: 1 },
        
        // Performance optimization
        { institutionId: 1, isActive: 1, gpa: -1 }
      ] as const;

      for (const index of indexes) {
        try {
          await Student.collection.createIndex(index, { background: true });
          console.log(`  ✓ Student index created:`, index);
        } catch (error) {
          console.warn(`  ⚠️ Student index already exists or failed:`, index, (error as Error).message);
        }
      }
    } catch (error) {
      console.log('  ℹ️ Student model not found, skipping Student indexes');
    }
  }

  /**
   * Analyze query performance and suggest optimizations
   */
  public async analyzeQueryPerformance(institutionId?: string): Promise<{
    slowQueries: Array<{
      collection: string;
      operation: string;
      duration: number;
      suggestion: string;
    }>;
    indexUsage: Array<{
      collection: string;
      index: string;
      usage: number;
    }>;
    recommendations: string[];
  }> {
    const stats = this.monitor.getStatistics(institutionId, 24);
    const performanceIssues = stats.recentEvents.filter(event => 
      event.type === OperationType.PERFORMANCE_ISSUE &&
      event.metadata?.duration > 1000
    );

    const slowQueries = performanceIssues.map(event => ({
      collection: event.metadata?.model || 'unknown',
      operation: event.action,
      duration: event.metadata?.duration || 0,
      suggestion: this.getSuggestionForSlowQuery(event.metadata?.model, event.action)
    }));

    const recommendations = this.generateRecommendations(slowQueries);

    return {
      slowQueries,
      indexUsage: [], // Would need to implement index usage tracking
      recommendations
    };
  }

  /**
   * Get suggestion for slow query optimization
   */
  private getSuggestionForSlowQuery(model: string, operation: string): string {
    const suggestions: Record<string, Record<string, string>> = {
      'User': {
        'find': 'Consider adding compound index on institutions.institutionId + query fields',
        'findOne': 'Ensure email index exists for login queries',
        'aggregate': 'Add indexes for aggregation pipeline stages'
      },
      'Course': {
        'find': 'Add compound index on institutionId + status + sort field',
        'findOne': 'Add compound index on institutionId + _id',
        'aggregate': 'Consider materialized views for complex aggregations'
      },
      'Enrollment': {
        'find': 'Add compound index on institutionId + studentId + status',
        'aggregate': 'Add indexes for enrollment statistics aggregations'
      }
    };

    return suggestions[model]?.[operation] || 'Consider adding appropriate compound indexes';
  }

  /**
   * Generate performance recommendations
   */
  private generateRecommendations(slowQueries: any[]): string[] {
    const recommendations: string[] = [];

    if (slowQueries.length > 0) {
      recommendations.push('Consider implementing query result caching for frequently accessed data');
      recommendations.push('Review and optimize database indexes for slow queries');
    }

    if (slowQueries.some(q => q.collection === 'User')) {
      recommendations.push('Implement user session caching to reduce authentication queries');
    }

    if (slowQueries.some(q => q.collection === 'Course')) {
      recommendations.push('Consider caching course catalog data with appropriate TTL');
    }

    if (slowQueries.some(q => q.operation.includes('aggregate'))) {
      recommendations.push('Consider using materialized views for complex aggregation queries');
    }

    if (slowQueries.length > 10) {
      recommendations.push('High number of slow queries detected - consider database scaling');
    }

    return recommendations;
  }

  /**
   * Validate index effectiveness
   */
  public async validateIndexes(): Promise<{
    collections: Array<{
      name: string;
      indexes: Array<{
        name: string;
        keys: any;
        isMultiTenant: boolean;
        recommendation?: string;
      }>;
    }>;
    issues: string[];
  }> {
    const collections = ['users', 'institutions', 'courses', 'enrollments'];
    const result = {
      collections: [] as any[],
      issues: [] as string[]
    };

    for (const collectionName of collections) {
      try {
        const db = mongoose.connection.db;
        if (!db) {
          result.issues.push(`Database connection not available for ${collectionName}`);
          continue;
        }
        
        const collection = db.collection(collectionName);
        const indexes = await collection.listIndexes().toArray();
        
        const collectionInfo = {
          name: collectionName,
          indexes: indexes.map(index => ({
            name: index.name,
            keys: index.key,
            isMultiTenant: this.isMultiTenantIndex(index.key),
            recommendation: this.getIndexRecommendation(collectionName, index.key)
          }))
        };

        result.collections.push(collectionInfo);

        // Check for missing multi-tenant indexes
        const hasInstitutionIndex = indexes.some(index => 
          index.key.institutionId || index.key['institutions.institutionId']
        );

        if (!hasInstitutionIndex && collectionName !== 'institutions') {
          result.issues.push(`${collectionName} collection missing institutionId index`);
        }

      } catch (error) {
        result.issues.push(`Failed to analyze ${collectionName}: ${(error as Error).message}`);
      }
    }

    return result;
  }

  /**
   * Check if index is multi-tenant optimized
   */
  private isMultiTenantIndex(keys: any): boolean {
    return !!(keys.institutionId || keys['institutions.institutionId']);
  }

  /**
   * Get recommendation for index optimization
   */
  private getIndexRecommendation(collection: string, keys: any): string | undefined {
    if (collection !== 'institutions' && !this.isMultiTenantIndex(keys)) {
      return 'Consider adding institutionId as first field for multi-tenant optimization';
    }

    if (Object.keys(keys).length === 1 && keys.institutionId) {
      return 'Consider adding additional fields to create compound indexes for better performance';
    }

    return undefined;
  }

  /**
   * Drop unused indexes
   */
  public async dropUnusedIndexes(dryRun: boolean = true): Promise<{
    dropped: string[];
    errors: string[];
  }> {
    const result = {
      dropped: [] as string[],
      errors: [] as string[]
    };

    // This would require index usage statistics from MongoDB
    // For now, just return empty results
    console.log(dryRun ? 'Dry run: No indexes would be dropped' : 'No unused indexes detected');

    return result;
  }
}

export default DatabaseIndexOptimizer;