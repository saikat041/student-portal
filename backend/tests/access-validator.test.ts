import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { AccessValidator } from '../services/AccessValidator';
import Institution from '../models/Institution';
import User from '../models/User';
import Course from '../models/Course';

describe('Access Validator Tests', () => {
  let mongoServer: MongoMemoryServer;
  let accessValidator: AccessValidator;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
    accessValidator = AccessValidator.getInstance();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clear all collections and audit logs before each test
    await Institution.deleteMany({});
    await User.deleteMany({});
    await Course.deleteMany({});
    accessValidator.clearAuditLogs();
  });

  describe('Cross-Institutional Access Validation', () => {
    it('should allow access when user belongs to institution', async () => {
      // Create institution
      const institution = new Institution({
        name: 'Test University',
        type: 'university',
        address: {
          street: '123 Test St',
          city: 'Test City',
          state: 'Test State',
          zipCode: '12345'
        },
        contactInfo: {
          email: 'test@university.edu',
          phone: '555-0123'
        }
      });
      await institution.save();

      // Create user with access to institution
      const user = new User({
        email: 'student@test.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'Student',
        institutions: [{
          institutionId: institution._id,
          role: 'student',
          status: 'active',
          profileData: {},
          createdAt: new Date()
        }]
      });
      await user.save();

      // Test cross-institutional access validation
      const result = await accessValidator.validateCrossInstitutionalAccess(
        user,
        institution._id.toString(),
        'access_context',
        'institution',
        institution._id.toString()
      );

      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
      expect(result.logData).toBeDefined();
      expect(result.logData?.hasAccess).toBe(true);
    });

    it('should deny access when user does not belong to institution', async () => {
      // Create two institutions
      const institution1 = new Institution({
        name: 'Test University 1',
        type: 'university',
        address: {
          street: '123 Test St',
          city: 'Test City',
          state: 'Test State',
          zipCode: '12345'
        },
        contactInfo: {
          email: 'test1@university.edu',
          phone: '555-0123'
        }
      });
      await institution1.save();

      const institution2 = new Institution({
        name: 'Test University 2',
        type: 'university',
        address: {
          street: '456 Test Ave',
          city: 'Test City',
          state: 'Test State',
          zipCode: '12346'
        },
        contactInfo: {
          email: 'test2@university.edu',
          phone: '555-0124'
        }
      });
      await institution2.save();

      // Create user with access only to institution1
      const user = new User({
        email: 'student@test.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'Student',
        institutions: [{
          institutionId: institution1._id,
          role: 'student',
          status: 'active',
          profileData: {},
          createdAt: new Date()
        }]
      });
      await user.save();

      // Test access to institution2 (should be denied)
      const result = await accessValidator.validateCrossInstitutionalAccess(
        user,
        institution2._id.toString(),
        'access_context',
        'institution',
        institution2._id.toString()
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('User does not have access to this institution');
      expect(result.logData).toBeDefined();
      expect(result.logData?.hasAccess).toBe(false);
    });

    it('should log all access attempts for audit trail', async () => {
      // Create institution
      const institution = new Institution({
        name: 'Test University',
        type: 'university',
        address: {
          street: '123 Test St',
          city: 'Test City',
          state: 'Test State',
          zipCode: '12345'
        },
        contactInfo: {
          email: 'test@university.edu',
          phone: '555-0123'
        }
      });
      await institution.save();

      // Create user
      const user = new User({
        email: 'student@test.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'Student',
        institutions: [{
          institutionId: institution._id,
          role: 'student',
          status: 'active',
          profileData: {},
          createdAt: new Date()
        }]
      });
      await user.save();

      // Perform access validation
      await accessValidator.validateCrossInstitutionalAccess(
        user,
        institution._id.toString(),
        'test_action',
        'test_resource',
        'test_resource_id'
      );

      // Check audit logs
      const auditLogs = accessValidator.getAuditLogs();
      expect(auditLogs).toHaveLength(1);
      
      const log = auditLogs[0];
      expect(log.userId).toBe(user._id.toString());
      expect(log.institutionId).toBe(institution._id.toString());
      expect(log.action).toBe('test_action');
      expect(log.resource).toBe('test_resource');
      expect(log.resourceId).toBe('test_resource_id');
      expect(log.allowed).toBe(true);
    });
  });

  describe('Resource Access Validation', () => {
    it('should validate course access within institutional context', async () => {
      // Create institution
      const institution = new Institution({
        name: 'Test University',
        type: 'university',
        address: {
          street: '123 Test St',
          city: 'Test City',
          state: 'Test State',
          zipCode: '12345'
        },
        contactInfo: {
          email: 'test@university.edu',
          phone: '555-0123'
        }
      });
      await institution.save();

      // Create user
      const user = new User({
        email: 'teacher@test.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'Teacher',
        institutions: [{
          institutionId: institution._id,
          role: 'teacher',
          status: 'active',
          profileData: {},
          createdAt: new Date()
        }]
      });
      await user.save();

      // Create course in the institution
      const course = new Course({
        institutionId: institution._id,
        courseCode: 'CS101',
        courseName: 'Introduction to Computer Science',
        description: 'Basic computer science concepts',
        credits: 3,
        department: 'Computer Science',
        instructor: user._id,
        semester: 'Fall 2024'
      });
      await course.save();

      // Create tenant context
      const context = {
        institutionId: institution._id,
        institution: institution,
        userInstitution: user.institutions[0]
      };

      // Test resource access validation
      const result = await accessValidator.validateResourceAccess(
        context,
        'course',
        course._id.toString(),
        'read'
      );

      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
      expect(result.logData).toBeDefined();
      expect(result.logData?.resourceData).toBeDefined();
    });

    it('should deny access to resources from different institutions', async () => {
      // Create two institutions
      const institution1 = new Institution({
        name: 'Test University 1',
        type: 'university',
        address: {
          street: '123 Test St',
          city: 'Test City',
          state: 'Test State',
          zipCode: '12345'
        },
        contactInfo: {
          email: 'test1@university.edu',
          phone: '555-0123'
        }
      });
      await institution1.save();

      const institution2 = new Institution({
        name: 'Test University 2',
        type: 'university',
        address: {
          street: '456 Test Ave',
          city: 'Test City',
          state: 'Test State',
          zipCode: '12346'
        },
        contactInfo: {
          email: 'test2@university.edu',
          phone: '555-0124'
        }
      });
      await institution2.save();

      // Create user in institution1
      const user = new User({
        email: 'teacher@test.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'Teacher',
        institutions: [{
          institutionId: institution1._id,
          role: 'teacher',
          status: 'active',
          profileData: {},
          createdAt: new Date()
        }]
      });
      await user.save();

      // Create course in institution2
      const course = new Course({
        institutionId: institution2._id,
        courseCode: 'CS101',
        courseName: 'Introduction to Computer Science',
        description: 'Basic computer science concepts',
        credits: 3,
        department: 'Computer Science',
        instructor: user._id,
        semester: 'Fall 2024'
      });
      await course.save();

      // Create tenant context for institution1
      const context = {
        institutionId: institution1._id,
        institution: institution1,
        userInstitution: user.institutions[0]
      };

      // Test access to course from institution2 (should be denied)
      const result = await accessValidator.validateResourceAccess(
        context,
        'course',
        course._id.toString(),
        'read'
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Course not found in current institution');
    });
  });

  describe('Security Audit Logging', () => {
    it('should provide audit summary for institutions', async () => {
      // Create institution
      const institution = new Institution({
        name: 'Test University',
        type: 'university',
        address: {
          street: '123 Test St',
          city: 'Test City',
          state: 'Test State',
          zipCode: '12345'
        },
        contactInfo: {
          email: 'test@university.edu',
          phone: '555-0123'
        }
      });
      await institution.save();

      // Create user
      const user = new User({
        email: 'student@test.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'Student',
        institutions: [{
          institutionId: institution._id,
          role: 'student',
          status: 'active',
          profileData: {},
          createdAt: new Date()
        }]
      });
      await user.save();

      // Generate some audit events
      await accessValidator.validateCrossInstitutionalAccess(
        user,
        institution._id.toString(),
        'login',
        'user',
        user._id.toString()
      );

      await accessValidator.validateCrossInstitutionalAccess(
        user,
        institution._id.toString(),
        'view_courses',
        'course'
      );

      // Get audit summary
      const summary = accessValidator.getAuditSummary(institution._id.toString(), 1);

      expect(summary.totalRequests).toBe(2);
      expect(summary.deniedRequests).toBe(0);
      expect(summary.uniqueUsers).toBe(1);
      expect(summary.topActions).toHaveLength(2);
      expect(summary.topResources).toHaveLength(2);
    });

    it('should track security alerts for denied access', async () => {
      // Create two institutions
      const institution1 = new Institution({
        name: 'Test University 1',
        type: 'university',
        address: {
          street: '123 Test St',
          city: 'Test City',
          state: 'Test State',
          zipCode: '12345'
        },
        contactInfo: {
          email: 'test1@university.edu',
          phone: '555-0123'
        }
      });
      await institution1.save();

      const institution2 = new Institution({
        name: 'Test University 2',
        type: 'university',
        address: {
          street: '456 Test Ave',
          city: 'Test City',
          state: 'Test State',
          zipCode: '12346'
        },
        contactInfo: {
          email: 'test2@university.edu',
          phone: '555-0124'
        }
      });
      await institution2.save();

      // Create user with access only to institution1
      const user = new User({
        email: 'student@test.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'Student',
        institutions: [{
          institutionId: institution1._id,
          role: 'student',
          status: 'active',
          profileData: {},
          createdAt: new Date()
        }]
      });
      await user.save();

      // Attempt unauthorized access to institution2
      await accessValidator.validateCrossInstitutionalAccess(
        user,
        institution2._id.toString(),
        'unauthorized_access',
        'institution',
        institution2._id.toString()
      );

      // Check security alerts
      const alerts = accessValidator.getSecurityAlerts();
      expect(alerts).toHaveLength(1);
      
      const alert = alerts[0];
      expect(alert.allowed).toBe(false);
      expect(alert.reason).toBe('User does not have access to this institution');
      expect(alert.institutionId).toBe(institution2._id.toString());
    });
  });
});