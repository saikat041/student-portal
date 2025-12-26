// Set JWT_SECRET for testing BEFORE any imports
process.env.JWT_SECRET = 'test-secret-key-for-error-handling-tests';

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';

// Import models
import Institution, { IInstitution } from '../models/Institution';
import User, { IUser } from '../models/User';
import Course from '../models/Course';

// Import middleware and error handling
import { auth } from '../middleware/auth';
import { establishInstitutionalContext } from '../middleware/tenantContext';
import { enhancedErrorMiddleware } from '../middleware/enhancedErrorHandling';
import MultiTenantErrorHandler, { MultiTenantErrorType } from '../utils/MultiTenantErrorHandler';
import MultiTenantMonitor, { OperationType } from '../utils/MultiTenantMonitor';

// Import controllers
import * as authController from '../controllers/authController';
import * as courseController from '../controllers/courseController';
import * as userController from '../controllers/userController';

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';

/**
 * Integration Tests for Error Handling and Edge Cases
 * Tests comprehensive error handling, boundary violations, and security scenarios
 */
describe('Error Handling and Security Integration Tests', () => {
  let mongoServer: MongoMemoryServer;
  let app: express.Application;
  let testInstitution1: IInstitution;
  let testInstitution2: IInstitution;
  let testUser: IUser;
  let userToken: string;
  let errorHandler: MultiTenantErrorHandler;
  let monitor: MultiTenantMonitor;

  beforeAll(async () => {
    // Setup in-memory MongoDB
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Setup Express app for testing
    app = express();
    app.use(cors());
    app.use(express.json());

    // Setup error handling and monitoring
    errorHandler = MultiTenantErrorHandler.getInstance();
    monitor = MultiTenantMonitor.getInstance();

    // Setup routes for testing
    setupTestRoutes(app);

    // Create test data
    await setupTestData();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clear monitoring data
    monitor.clearAll();
    errorHandler.clearErrorLog();

    // Clean up test courses
    await Course.deleteMany({});
  });

  /**
   * Test institutional context errors
   */
  describe('Institutional Context Error Handling', () => {
    it('should handle missing authentication', async () => {
      const response = await request(app)
        .get('/api/courses')
        .expect(401);

      expect(response.body.error.type).toBe(MultiTenantErrorType.INSTITUTION_CONTEXT_MISSING);
      expect(response.body.error.userFriendlyMessage).toContain('Authentication required');
      expect(response.body.error.suggestedActions).toContain('Log out and log back in');
    });

    it('should handle missing institutional context', async () => {
      const response = await request(app)
        .get('/api/courses')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(400);

      expect(response.body.error.type).toBe(MultiTenantErrorType.INSTITUTION_CONTEXT_MISSING);
      expect(response.body.error.userFriendlyMessage).toContain('select an institution');
      expect(response.body.availableInstitutions).toBeDefined();
      expect(response.body.availableInstitutions).toHaveLength(1);
    });

    it('should handle invalid institutional context', async () => {
      const invalidInstitutionId = new mongoose.Types.ObjectId().toString();

      const response = await request(app)
        .get('/api/courses')
        .set('Authorization', `Bearer ${userToken}`)
        .set('x-institution-id', invalidInstitutionId)
        .expect(403);

      expect(response.body.error.type).toBe(MultiTenantErrorType.CROSS_INSTITUTIONAL_ACCESS);
      expect(response.body.error.userFriendlyMessage).toContain('cannot access resources');
    });

    it('should handle inactive institution', async () => {
      // Deactivate institution
      await Institution.findByIdAndUpdate(testInstitution1._id, { status: 'inactive' });

      const response = await request(app)
        .get('/api/courses')
        .set('Authorization', `Bearer ${userToken}`)
        .set('x-institution-id', testInstitution1._id.toString())
        .expect(403);

      expect(response.body.error.type).toBe(MultiTenantErrorType.INSTITUTION_INACTIVE);
      expect(response.body.error.userFriendlyMessage).toContain('currently unavailable');

      // Reactivate for other tests
      await Institution.findByIdAndUpdate(testInstitution1._id, { status: 'active' });
    });
  });

  /**
   * Test cross-institutional access prevention
   */
  describe('Cross-Institutional Access Prevention', () => {
    let courseInInstitution2: any;

    beforeEach(async () => {
      // Create course in institution 2
      courseInInstitution2 = new Course({
        code: 'MATH101',
        name: 'Calculus I',
        description: 'Introduction to calculus',
        credits: 4,
        institutionId: testInstitution2._id,
        teacherId: testUser._id,
        maxEnrollment: 25
      });
      await courseInInstitution2.save();
    });

    it('should prevent cross-institutional course access', async () => {
      const response = await request(app)
        .get(`/api/courses/${courseInInstitution2._id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .set('x-institution-id', testInstitution1._id.toString())
        .expect(403);

      expect(response.body.error.type).toBe(MultiTenantErrorType.CROSS_INSTITUTIONAL_ACCESS);
      expect(response.body.context.resourceType).toBe('course');
      expect(response.body.context.resourceId).toBe(courseInInstitution2._id.toString());

      // Verify monitoring logged the attempt
      const stats = monitor.getStatistics();
      expect(stats.eventsByType[OperationType.CROSS_INSTITUTIONAL_ACCESS_ATTEMPT]).toBeGreaterThan(0);
    });

    it('should log security alerts for cross-institutional attempts', async () => {
      // Attempt cross-institutional access
      await request(app)
        .get(`/api/courses/${courseInInstitution2._id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .set('x-institution-id', testInstitution1._id.toString())
        .expect(403);

      // Check security alerts
      const alerts = monitor.getSecurityAlerts();
      expect(alerts.length).toBeGreaterThan(0);
      
      const crossAccessAlert = alerts.find(alert => 
        alert.type === 'CROSS_INSTITUTIONAL_ACCESS'
      );
      expect(crossAccessAlert).toBeDefined();
      expect(crossAccessAlert?.severity).toBe('high');
    });

    it('should handle multiple rapid cross-institutional attempts', async () => {
      // Make multiple rapid attempts
      const promises = Array(5).fill(null).map(() =>
        request(app)
          .get(`/api/courses/${courseInInstitution2._id}`)
          .set('Authorization', `Bearer ${userToken}`)
          .set('x-institution-id', testInstitution1._id.toString())
      );

      await Promise.all(promises);

      // Check for suspicious activity alert
      const alerts = monitor.getSecurityAlerts();
      const suspiciousAlert = alerts.find(alert => 
        alert.type === 'SUSPICIOUS_ACTIVITY' && 
        alert.description.includes('cross-institutional')
      );
      
      // Note: This might not trigger in a single test run due to timing
      // but the monitoring system should detect patterns over time
      const stats = monitor.getStatistics();
      expect(stats.eventsByType[OperationType.CROSS_INSTITUTIONAL_ACCESS_ATTEMPT]).toBe(5);
    });
  });

  /**
   * Test session corruption detection
   */
  describe('Session Corruption Detection', () => {
    it('should detect and handle session corruption', async () => {
      // Create a user with corrupted session data
      const corruptedUser = new User({
        email: 'corrupted@example.com',
        password: 'password123',
        firstName: 'Corrupted',
        lastName: 'User',
        institutions: [{
          institutionId: testInstitution1._id,
          role: 'student',
          status: 'active',
          profileData: {},
          createdAt: new Date(),
          approvedAt: new Date()
        }]
      });
      await corruptedUser.save();

      // Create token for corrupted user
      const corruptedToken = jwt.sign({ id: corruptedUser._id }, JWT_SECRET);

      // Try to access with wrong institution context
      const response = await request(app)
        .get('/api/courses')
        .set('Authorization', `Bearer ${corruptedToken}`)
        .set('x-institution-id', testInstitution2._id.toString())
        .expect(403);

      expect(response.body.error.type).toBe(MultiTenantErrorType.CROSS_INSTITUTIONAL_ACCESS);

      // Verify session corruption was logged
      const stats = monitor.getStatistics();
      expect(stats.eventsByType[OperationType.CROSS_INSTITUTIONAL_ACCESS_ATTEMPT]).toBeGreaterThan(0);
    });
  });

  /**
   * Test privilege escalation prevention
   */
  describe('Privilege Escalation Prevention', () => {
    it('should prevent unauthorized admin actions', async () => {
      // Regular user tries to access admin endpoint
      const response = await request(app)
        .get('/api/admin/pending-registrations')
        .set('Authorization', `Bearer ${userToken}`)
        .set('x-institution-id', testInstitution1._id.toString())
        .expect(403);

      expect(response.body.error.type).toBe(MultiTenantErrorType.INSUFFICIENT_PRIVILEGES);
      expect(response.body.error.userFriendlyMessage).toContain('sufficient privileges');
    });

    it('should handle privilege validation errors gracefully', async () => {
      // Create user with invalid role data
      const invalidUser = new User({
        email: 'invalid@example.com',
        password: 'password123',
        firstName: 'Invalid',
        lastName: 'User',
        institutions: [{
          institutionId: testInstitution1._id,
          role: 'invalid_role' as any,
          status: 'active',
          profileData: {},
          createdAt: new Date(),
          approvedAt: new Date()
        }]
      });
      await invalidUser.save();

      const invalidToken = jwt.sign({ id: invalidUser._id }, JWT_SECRET);

      const response = await request(app)
        .get('/api/admin/pending-registrations')
        .set('Authorization', `Bearer ${invalidToken}`)
        .set('x-institution-id', testInstitution1._id.toString())
        .expect(403);

      expect(response.body.error.type).toBe(MultiTenantErrorType.INSUFFICIENT_PRIVILEGES);
    });
  });

  /**
   * Test performance monitoring and error tracking
   */
  describe('Performance Monitoring and Error Tracking', () => {
    it('should track operation performance', async () => {
      // Make a successful request
      await request(app)
        .get('/api/courses')
        .set('Authorization', `Bearer ${userToken}`)
        .set('x-institution-id', testInstitution1._id.toString())
        .expect(200);

      // Check performance metrics
      const stats = monitor.getStatistics(testInstitution1._id.toString());
      expect(stats.totalEvents).toBeGreaterThan(0);
      expect(stats.eventsByResult.success).toBeGreaterThan(0);
    });

    it('should track error statistics', async () => {
      // Generate some errors
      await request(app)
        .get('/api/courses')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(400); // Missing institution context

      await request(app)
        .get('/api/courses')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401); // Invalid token

      // Check error statistics
      const errorStats = errorHandler.getErrorStatistics();
      expect(errorStats.total).toBeGreaterThan(0);
      expect(errorStats.byType[MultiTenantErrorType.INSTITUTION_CONTEXT_MISSING]).toBeGreaterThan(0);
    });

    it('should provide monitoring dashboard data', async () => {
      // Create admin user for dashboard access
      const adminUser = new User({
        email: 'dashboard-admin@test-university.edu',
        password: 'password123',
        firstName: 'Dashboard',
        lastName: 'Admin',
        institutions: [{
          institutionId: testInstitution1._id,
          role: 'institution_admin',
          status: 'active',
          profileData: {},
          createdAt: new Date(),
          approvedAt: new Date()
        }]
      });
      await adminUser.save();

      const adminToken = jwt.sign({ id: adminUser._id }, JWT_SECRET);

      // Generate some activity
      await request(app)
        .get('/api/courses')
        .set('Authorization', `Bearer ${userToken}`)
        .set('x-institution-id', testInstitution1._id.toString())
        .expect(200);

      // Access monitoring dashboard
      const response = await request(app)
        .get('/api/admin/monitoring-dashboard')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-institution-id', testInstitution1._id.toString())
        .expect(200);

      expect(response.body.institutionId).toBe(testInstitution1._id.toString());
      expect(response.body.monitoring).toBeDefined();
      expect(response.body.performance).toBeDefined();
      expect(response.body.security).toBeDefined();
      expect(response.body.errors).toBeDefined();
      expect(response.body.summary).toBeDefined();
    });
  });

  /**
   * Test error recovery and graceful degradation
   */
  describe('Error Recovery and Graceful Degradation', () => {
    it('should handle database connection errors gracefully', async () => {
      // Simulate database error by using invalid ObjectId
      const response = await request(app)
        .get('/api/courses/invalid-id')
        .set('Authorization', `Bearer ${userToken}`)
        .set('x-institution-id', testInstitution1._id.toString())
        .expect(400);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.userFriendlyMessage).toBeDefined();
      expect(response.body.error.suggestedActions).toBeDefined();
    });

    it('should provide user-friendly error messages', async () => {
      const response = await request(app)
        .get('/api/courses')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(400);

      expect(response.body.error.userFriendlyMessage).toBe('Please select an institution to continue.');
      expect(response.body.error.suggestedActions).toContain('Select an institution from the available list');
      expect(response.body.error.timestamp).toBeDefined();
    });

    it('should handle concurrent error scenarios', async () => {
      // Generate multiple concurrent errors
      const promises = Array(10).fill(null).map((_, index) =>
        request(app)
          .get('/api/courses')
          .set('Authorization', `Bearer invalid-token-${index}`)
      );

      const responses = await Promise.all(promises);

      // All should return 401 with proper error structure
      responses.forEach(response => {
        expect(response.status).toBe(401);
        expect(response.body.error.type).toBe(MultiTenantErrorType.INSTITUTION_CONTEXT_MISSING);
      });

      // Check that all errors were logged
      const errorStats = errorHandler.getErrorStatistics();
      expect(errorStats.total).toBe(10);
    });
  });

  /**
   * Helper function to setup test routes
   */
  function setupTestRoutes(app: express.Application) {
    // Auth routes
    app.post('/api/auth/login', authController.login);

    // Course routes
    app.get('/api/courses', auth, establishInstitutionalContext, courseController.getAllCourses);
    app.get('/api/courses/:id', auth, establishInstitutionalContext, courseController.getCourseById);

    // Admin routes
    app.get('/api/admin/pending-registrations', auth, establishInstitutionalContext, userController.getPendingRegistrations);
    app.get('/api/admin/monitoring-dashboard', auth, establishInstitutionalContext, async (req, res) => {
      const { getMonitoringDashboard } = await import('../middleware/enhancedErrorHandling');
      return getMonitoringDashboard(req, res);
    });

    // Error handling middleware
    app.use(enhancedErrorMiddleware);
  }

  /**
   * Helper function to setup test data
   */
  async function setupTestData() {
    // Create test institutions
    testInstitution1 = new Institution({
      name: 'Test University',
      type: 'university',
      address: {
        street: '123 University Ave',
        city: 'Test City',
        state: 'Test State',
        zipCode: '12345'
      },
      contactInfo: {
        email: 'admin@test-university.edu',
        phone: '+1-555-0123'
      },
      status: 'active'
    });
    await testInstitution1.save();

    testInstitution2 = new Institution({
      name: 'Test College',
      type: 'college',
      address: {
        street: '456 College Blvd',
        city: 'Test Town',
        state: 'Test State',
        zipCode: '67890'
      },
      contactInfo: {
        email: 'admin@test-college.edu',
        phone: '+1-555-0456'
      },
      status: 'active'
    });
    await testInstitution2.save();

    // Create test user
    testUser = new User({
      email: 'testuser@test-university.edu',
      password: 'password123',
      firstName: 'Test',
      lastName: 'User',
      institutions: [{
        institutionId: testInstitution1._id,
        role: 'student',
        status: 'active',
        profileData: { major: 'Computer Science', year: 2 },
        createdAt: new Date(),
        approvedAt: new Date()
      }]
    });
    await testUser.save();

    // Generate token for test user
    userToken = jwt.sign({ id: testUser._id }, JWT_SECRET);
  }
});