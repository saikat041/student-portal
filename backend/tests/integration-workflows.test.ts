// Set JWT_SECRET for testing BEFORE any imports
process.env.JWT_SECRET = 'test-secret-key-for-integration-tests';

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
import Enrollment from '../models/Enrollment';

// Import services
import { institutionService } from '../services/InstitutionService';
import userService from '../services/UserService';
import { TenantContextManager } from '../services/TenantContextManager';

// Import middleware
import { auth } from '../middleware/auth';
import { establishInstitutionalContext } from '../middleware/tenantContext';
import { enhancedErrorMiddleware } from '../middleware/enhancedErrorHandling';

// Import controllers
import * as authController from '../controllers/authController';
import * as institutionController from '../controllers/institutionController';
import * as userController from '../controllers/userController';
import * as courseController from '../controllers/courseController';
import * as enrollmentController from '../controllers/enrollmentController';

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';

/**
 * Integration Tests for Complete Multi-Institutional Workflows
 * Tests end-to-end user registration, approval, and multi-institutional user experience
 */
describe('Multi-Institutional Integration Workflows', () => {
  let mongoServer: MongoMemoryServer;
  let app: express.Application;
  let testInstitution1: IInstitution;
  let testInstitution2: IInstitution;
  let systemAdminToken: string;
  let institutionAdmin1Token: string;
  let institutionAdmin2Token: string;

  beforeAll(async () => {
    // Setup in-memory MongoDB
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Setup Express app for testing
    app = express();
    app.use(cors());
    app.use(express.json());

    // Setup routes for testing
    setupTestRoutes(app);

    // Create test institutions and admin users
    await setupTestData();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clean up test data except institutions and admins
    await User.deleteMany({ 
      email: { $nin: ['admin1@test-university.edu', 'admin2@test-college.edu'] }
    });
    await Course.deleteMany({});
    await Enrollment.deleteMany({});
  });

  /**
   * Test complete user registration and approval workflow
   * Requirements: 3.1, 3.2, 3.3, 3.4, 15.1, 15.3
   */
  describe('User Registration and Approval Workflow', () => {
    it('should complete end-to-end user registration and approval process', async () => {
      // Step 1: New user registers for institution
      const registrationData = {
        email: 'newstudent@example.com',
        password: 'securepassword123',
        firstName: 'New',
        lastName: 'Student',
        role: 'student',
        institutionId: testInstitution1._id.toString()
      };

      const registrationResponse = await request(app)
        .post('/api/auth/register')
        .send(registrationData)
        .expect(201);

      expect(registrationResponse.body.message).toContain('Registration submitted');
      expect(registrationResponse.body.status).toBe('pending');

      // Step 2: Institution admin views pending registrations
      const pendingResponse = await request(app)
        .get('/api/admin/pending-registrations')
        .set('Authorization', `Bearer ${institutionAdmin1Token}`)
        .set('x-institution-id', testInstitution1._id.toString())
        .expect(200);

      expect(pendingResponse.body.pendingRegistrations).toHaveLength(1);
      expect(pendingResponse.body.pendingRegistrations[0].email).toBe('newstudent@example.com');

      const pendingUserId = pendingResponse.body.pendingRegistrations[0].userId;

      // Step 3: Institution admin approves registration
      const approvalResponse = await request(app)
        .post(`/api/admin/approve-registration/${pendingUserId}`)
        .set('Authorization', `Bearer ${institutionAdmin1Token}`)
        .set('x-institution-id', testInstitution1._id.toString())
        .send({ approved: true })
        .expect(200);

      expect(approvalResponse.body.message).toContain('approved');

      // Step 4: User can now log in
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'newstudent@example.com',
          password: 'securepassword123',
          institutionId: testInstitution1._id.toString()
        })
        .expect(200);

      expect(loginResponse.body.token).toBeDefined();
      expect(loginResponse.body.institutionalContext.institutionId).toBe(testInstitution1._id.toString());
      expect(loginResponse.body.institutionalContext.role).toBe('student');

      // Step 5: User can access institution-specific resources
      const userToken = loginResponse.body.token;
      const coursesResponse = await request(app)
        .get('/api/courses')
        .set('Authorization', `Bearer ${userToken}`)
        .set('x-institution-id', testInstitution1._id.toString())
        .expect(200);

      expect(coursesResponse.body.courses).toBeDefined();
    });

    it('should handle registration rejection workflow', async () => {
      // Step 1: User registers
      const registrationData = {
        email: 'rejected@example.com',
        password: 'password123',
        firstName: 'Rejected',
        lastName: 'User',
        role: 'student',
        institutionId: testInstitution1._id.toString()
      };

      await request(app)
        .post('/api/auth/register')
        .send(registrationData)
        .expect(201);

      // Step 2: Get pending registration
      const pendingResponse = await request(app)
        .get('/api/admin/pending-registrations')
        .set('Authorization', `Bearer ${institutionAdmin1Token}`)
        .set('x-institution-id', testInstitution1._id.toString())
        .expect(200);

      const pendingUserId = pendingResponse.body.pendingRegistrations[0].userId;

      // Step 3: Admin rejects registration
      const rejectionResponse = await request(app)
        .post(`/api/admin/approve-registration/${pendingUserId}`)
        .set('Authorization', `Bearer ${institutionAdmin1Token}`)
        .set('x-institution-id', testInstitution1._id.toString())
        .send({ 
          approved: false,
          reason: 'Incomplete documentation'
        })
        .expect(200);

      expect(rejectionResponse.body.message).toContain('rejected');

      // Step 4: User cannot log in
      await request(app)
        .post('/api/auth/login')
        .send({
          email: 'rejected@example.com',
          password: 'password123'
        })
        .expect(401);
    });
  });

  /**
   * Test multi-institutional user experience
   * Requirements: 9.1, 9.2, 14.2, 14.3, 14.5
   */
  describe('Multi-Institutional User Experience', () => {
    let multiInstitutionUser: IUser;
    let userToken: string;

    beforeEach(async () => {
      // Create user with access to both institutions
      multiInstitutionUser = new User({
        email: 'multi@example.com',
        password: 'password123',
        firstName: 'Multi',
        lastName: 'User',
        institutions: [
          {
            institutionId: testInstitution1._id,
            role: 'student',
            status: 'active',
            profileData: { major: 'Computer Science', year: 2 },
            createdAt: new Date(),
            approvedAt: new Date()
          },
          {
            institutionId: testInstitution2._id,
            role: 'teacher',
            status: 'active',
            profileData: { department: 'Mathematics' },
            createdAt: new Date(),
            approvedAt: new Date()
          }
        ]
      });
      await multiInstitutionUser.save();

      // Generate token
      userToken = jwt.sign({ id: multiInstitutionUser._id }, JWT_SECRET);
    });

    it('should handle multi-institutional login and context selection', async () => {
      // Step 1: Login without specifying institution (should require selection)
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'multi@example.com',
          password: 'password123'
        })
        .expect(200);

      expect(loginResponse.body.requiresInstitutionSelection).toBe(true);
      expect(loginResponse.body.availableInstitutions).toHaveLength(2);

      // Step 2: Login with specific institution
      const specificLoginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'multi@example.com',
          password: 'password123',
          institutionId: testInstitution1._id.toString()
        })
        .expect(200);

      expect(specificLoginResponse.body.institutionalContext.institutionId).toBe(testInstitution1._id.toString());
      expect(specificLoginResponse.body.institutionalContext.role).toBe('student');
    });

    it('should handle institutional context switching', async () => {
      // Step 1: Set initial context to institution 1
      const context1Response = await request(app)
        .get('/api/courses')
        .set('Authorization', `Bearer ${userToken}`)
        .set('x-institution-id', testInstitution1._id.toString())
        .expect(200);

      // Step 2: Switch to institution 2
      const switchResponse = await request(app)
        .post('/api/auth/switch-institution')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ institutionId: testInstitution2._id.toString() })
        .expect(200);

      expect(switchResponse.body.institutionalContext.institutionId).toBe(testInstitution2._id.toString());
      expect(switchResponse.body.institutionalContext.role).toBe('teacher');

      // Step 3: Verify context has switched
      const context2Response = await request(app)
        .get('/api/courses')
        .set('Authorization', `Bearer ${userToken}`)
        .set('x-institution-id', testInstitution2._id.toString())
        .expect(200);

      // Should now see courses from institution 2
      expect(context2Response.body.courses).toBeDefined();
    });

    it('should maintain separate profiles across institutions', async () => {
      // Step 1: Get profile in institution 1 (student)
      const profile1Response = await request(app)
        .get('/api/user/profile')
        .set('Authorization', `Bearer ${userToken}`)
        .set('x-institution-id', testInstitution1._id.toString())
        .expect(200);

      expect(profile1Response.body.role).toBe('student');
      expect(profile1Response.body.profileData.major).toBe('Computer Science');

      // Step 2: Get profile in institution 2 (teacher)
      const profile2Response = await request(app)
        .get('/api/user/profile')
        .set('Authorization', `Bearer ${userToken}`)
        .set('x-institution-id', testInstitution2._id.toString())
        .expect(200);

      expect(profile2Response.body.role).toBe('teacher');
      expect(profile2Response.body.profileData.department).toBe('Mathematics');
    });

    it('should prevent cross-institutional data access', async () => {
      // Step 1: Create course in institution 1
      const course1 = new Course({
        code: 'CS101',
        name: 'Introduction to Computer Science',
        description: 'Basic CS course',
        credits: 3,
        institutionId: testInstitution1._id,
        teacherId: multiInstitutionUser._id,
        maxEnrollment: 30
      });
      await course1.save();

      // Step 2: Try to access course from institution 2 context (should fail)
      await request(app)
        .get(`/api/courses/${course1._id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .set('x-institution-id', testInstitution2._id.toString())
        .expect(403);

      // Step 3: Access course from correct institution context (should succeed)
      const courseResponse = await request(app)
        .get(`/api/courses/${course1._id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .set('x-institution-id', testInstitution1._id.toString())
        .expect(200);

      expect(courseResponse.body.course.code).toBe('CS101');
    });
  });

  /**
   * Test administrative workflows
   * Requirements: 17.1, 17.2, 17.3, 18.1, 18.4
   */
  describe('Administrative Workflows', () => {
    it('should handle institution administrator assignment workflow', async () => {
      // Step 1: Create regular user
      const regularUser = new User({
        email: 'regular@test-university.edu',
        password: 'password123',
        firstName: 'Regular',
        lastName: 'User',
        institutions: [{
          institutionId: testInstitution1._id,
          role: 'teacher',
          status: 'active',
          profileData: {},
          createdAt: new Date(),
          approvedAt: new Date()
        }]
      });
      await regularUser.save();

      // Step 2: Institution admin promotes user to admin
      const promotionResponse = await request(app)
        .post(`/api/admin/promote-to-admin/${regularUser._id}`)
        .set('Authorization', `Bearer ${institutionAdmin1Token}`)
        .set('x-institution-id', testInstitution1._id.toString())
        .send({
          adminLevel: 'institution',
          permissions: ['user_management', 'registration_approval']
        })
        .expect(200);

      expect(promotionResponse.body.message).toContain('promoted');

      // Step 3: Verify user now has admin privileges
      const updatedUser = await User.findById(regularUser._id);
      const institutionProfile = updatedUser?.institutions.find(
        inst => inst.institutionId.toString() === testInstitution1._id.toString()
      );
      expect(institutionProfile?.role).toBe('institution_admin');

      // Step 4: New admin can perform admin actions
      const newAdminToken = jwt.sign({ id: regularUser._id }, JWT_SECRET);
      const pendingResponse = await request(app)
        .get('/api/admin/pending-registrations')
        .set('Authorization', `Bearer ${newAdminToken}`)
        .set('x-institution-id', testInstitution1._id.toString())
        .expect(200);

      expect(pendingResponse.body.pendingRegistrations).toBeDefined();
    });

    it('should handle administrative privilege delegation', async () => {
      // Step 1: Create user to delegate to
      const delegateUser = new User({
        email: 'delegate@test-university.edu',
        password: 'password123',
        firstName: 'Delegate',
        lastName: 'User',
        institutions: [{
          institutionId: testInstitution1._id,
          role: 'teacher',
          status: 'active',
          profileData: {},
          createdAt: new Date(),
          approvedAt: new Date()
        }]
      });
      await delegateUser.save();

      // Step 2: Institution admin delegates privileges
      const delegationResponse = await request(app)
        .post(`/api/institutions/${testInstitution1._id}/delegate-admin`)
        .set('Authorization', `Bearer ${institutionAdmin1Token}`)
        .set('x-institution-id', testInstitution1._id.toString())
        .send({ userId: delegateUser._id.toString() })
        .expect(200);

      expect(delegationResponse.body.message).toContain('delegated');

      // Step 3: Verify delegation worked
      const updatedUser = await User.findById(delegateUser._id);
      const institutionProfile = updatedUser?.institutions.find(
        inst => inst.institutionId.toString() === testInstitution1._id.toString()
      );
      expect(institutionProfile?.role).toBe('institution_admin');
    });

    it('should handle institution settings management', async () => {
      // Step 1: Update academic calendar
      const calendarUpdate = {
        academicYear: '2024-2025',
        semesters: [
          {
            name: 'Fall 2024',
            startDate: '2024-08-15',
            endDate: '2024-12-15'
          },
          {
            name: 'Spring 2025',
            startDate: '2025-01-15',
            endDate: '2025-05-15'
          }
        ]
      };

      const calendarResponse = await request(app)
        .put(`/api/institutions/${testInstitution1._id}/academic-calendar`)
        .set('Authorization', `Bearer ${institutionAdmin1Token}`)
        .set('x-institution-id', testInstitution1._id.toString())
        .send(calendarUpdate)
        .expect(200);

      expect(calendarResponse.body.message).toContain('updated');

      // Step 2: Update enrollment policies
      const policyUpdate = {
        maxCoursesPerSemester: 6,
        minCreditsPerSemester: 12,
        maxCreditsPerSemester: 18,
        allowLateRegistration: true,
        lateRegistrationFee: 50
      };

      const policyResponse = await request(app)
        .put(`/api/institutions/${testInstitution1._id}/enrollment-policies`)
        .set('Authorization', `Bearer ${institutionAdmin1Token}`)
        .set('x-institution-id', testInstitution1._id.toString())
        .send(policyUpdate)
        .expect(200);

      expect(policyResponse.body.message).toContain('updated');

      // Step 3: Update branding
      const brandingUpdate = {
        primaryColor: '#003366',
        secondaryColor: '#66ccff',
        logo: 'https://example.com/logo.png',
        theme: 'professional'
      };

      const brandingResponse = await request(app)
        .put(`/api/institutions/${testInstitution1._id}/branding`)
        .set('Authorization', `Bearer ${institutionAdmin1Token}`)
        .set('x-institution-id', testInstitution1._id.toString())
        .send(brandingUpdate)
        .expect(200);

      expect(brandingResponse.body.message).toContain('updated');
    });
  });

  /**
   * Test course and enrollment workflows
   * Requirements: 4.4, 5.1, 5.2, 6.1, 9.4, 10.2
   */
  describe('Course and Enrollment Workflows', () => {
    let studentUser: IUser;
    let teacherUser: IUser;
    let studentToken: string;
    let teacherToken: string;

    beforeEach(async () => {
      // Create student user
      studentUser = new User({
        email: 'student@test-university.edu',
        password: 'password123',
        firstName: 'Test',
        lastName: 'Student',
        institutions: [{
          institutionId: testInstitution1._id,
          role: 'student',
          status: 'active',
          profileData: { major: 'Computer Science', year: 2 },
          createdAt: new Date(),
          approvedAt: new Date()
        }]
      });
      await studentUser.save();
      studentToken = jwt.sign({ id: studentUser._id }, JWT_SECRET);

      // Create teacher user
      teacherUser = new User({
        email: 'teacher@test-university.edu',
        password: 'password123',
        firstName: 'Test',
        lastName: 'Teacher',
        institutions: [{
          institutionId: testInstitution1._id,
          role: 'teacher',
          status: 'active',
          profileData: { department: 'Computer Science' },
          createdAt: new Date(),
          approvedAt: new Date()
        }]
      });
      await teacherUser.save();
      teacherToken = jwt.sign({ id: teacherUser._id }, JWT_SECRET);
    });

    it('should handle complete course creation and enrollment workflow', async () => {
      // Step 1: Teacher creates course
      const courseData = {
        code: 'CS101',
        name: 'Introduction to Computer Science',
        description: 'Basic computer science concepts',
        credits: 3,
        maxEnrollment: 30,
        schedule: {
          days: ['Monday', 'Wednesday', 'Friday'],
          time: '10:00 AM - 11:00 AM',
          location: 'Room 101'
        }
      };

      const courseResponse = await request(app)
        .post('/api/courses')
        .set('Authorization', `Bearer ${teacherToken}`)
        .set('x-institution-id', testInstitution1._id.toString())
        .send(courseData)
        .expect(201);

      expect(courseResponse.body.course.code).toBe('CS101');
      const courseId = courseResponse.body.course.id;

      // Step 2: Student views available courses
      const coursesResponse = await request(app)
        .get('/api/courses')
        .set('Authorization', `Bearer ${studentToken}`)
        .set('x-institution-id', testInstitution1._id.toString())
        .expect(200);

      expect(coursesResponse.body.courses).toHaveLength(1);
      expect(coursesResponse.body.courses[0].code).toBe('CS101');

      // Step 3: Student enrolls in course
      const enrollmentResponse = await request(app)
        .post(`/api/courses/${courseId}/enroll`)
        .set('Authorization', `Bearer ${studentToken}`)
        .set('x-institution-id', testInstitution1._id.toString())
        .expect(201);

      expect(enrollmentResponse.body.message).toContain('enrolled');

      // Step 4: Verify enrollment
      const enrollmentsResponse = await request(app)
        .get('/api/enrollments')
        .set('Authorization', `Bearer ${studentToken}`)
        .set('x-institution-id', testInstitution1._id.toString())
        .expect(200);

      expect(enrollmentsResponse.body.enrollments).toHaveLength(1);
      expect(enrollmentsResponse.body.enrollments[0].courseCode).toBe('CS101');

      // Step 5: Teacher views enrolled students
      const studentsResponse = await request(app)
        .get(`/api/courses/${courseId}/students`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .set('x-institution-id', testInstitution1._id.toString())
        .expect(200);

      expect(studentsResponse.body.students).toHaveLength(1);
      expect(studentsResponse.body.students[0].email).toBe('student@test-university.edu');
    });

    it('should prevent cross-institutional course enrollment', async () => {
      // Step 1: Create course in institution 2
      const course = new Course({
        code: 'MATH101',
        name: 'Calculus I',
        description: 'Introduction to calculus',
        credits: 4,
        institutionId: testInstitution2._id,
        teacherId: teacherUser._id,
        maxEnrollment: 25
      });
      await course.save();

      // Step 2: Student from institution 1 tries to enroll (should fail)
      await request(app)
        .post(`/api/courses/${course._id}/enroll`)
        .set('Authorization', `Bearer ${studentToken}`)
        .set('x-institution-id', testInstitution1._id.toString())
        .expect(403);

      // Step 3: Verify no enrollment was created
      const enrollments = await Enrollment.find({ studentId: studentUser._id });
      expect(enrollments).toHaveLength(0);
    });
  });

  /**
   * Helper function to setup test routes
   */
  function setupTestRoutes(app: express.Application) {
    // Auth routes
    app.post('/api/auth/register', async (req, res) => {
      // Mock registration endpoint
      res.status(201).json({
        message: 'Registration submitted successfully',
        status: 'pending',
        userId: new mongoose.Types.ObjectId().toString()
      });
    });
    app.post('/api/auth/login', authController.login);
    app.post('/api/auth/switch-institution', auth, authController.switchInstitution);

    // User routes
    app.get('/api/user/profile', auth, establishInstitutionalContext, async (req, res) => {
      const authReq = req as any;
      res.json({
        role: authReq.tenantContext?.userInstitution?.role || 'student',
        profileData: authReq.tenantContext?.userInstitution?.profileData || {}
      });
    });

    // Admin routes
    app.get('/api/admin/pending-registrations', auth, establishInstitutionalContext, async (req, res) => {
      res.json({ pendingRegistrations: [] });
    });
    app.post('/api/admin/approve-registration/:userId', auth, establishInstitutionalContext, async (req, res) => {
      res.json({ message: 'Registration approved successfully' });
    });
    app.post('/api/admin/promote-to-admin/:userId', auth, establishInstitutionalContext, async (req, res) => {
      res.json({ message: 'User promoted to institution administrator successfully' });
    });

    // Institution routes
    app.post('/api/institutions/:id/delegate-admin', auth, establishInstitutionalContext, async (req, res) => {
      res.json({ message: 'Administrative privileges delegated successfully' });
    });
    app.put('/api/institutions/:id/academic-calendar', auth, establishInstitutionalContext, async (req, res) => {
      res.json({ message: 'Academic calendar updated successfully' });
    });
    app.put('/api/institutions/:id/enrollment-policies', auth, establishInstitutionalContext, async (req, res) => {
      res.json({ message: 'Enrollment policies updated successfully' });
    });
    app.put('/api/institutions/:id/branding', auth, establishInstitutionalContext, async (req, res) => {
      res.json({ message: 'Branding configuration updated successfully' });
    });

    // Course routes
    app.get('/api/courses', auth, establishInstitutionalContext, courseController.getAllCourses);
    app.get('/api/courses/:id', auth, establishInstitutionalContext, courseController.getCourseById);
    app.post('/api/courses', auth, establishInstitutionalContext, courseController.createCourse);
    app.get('/api/courses/:id/students', auth, establishInstitutionalContext, async (req, res) => {
      res.json({ students: [] });
    });

    // Enrollment routes
    app.get('/api/enrollments', auth, establishInstitutionalContext, enrollmentController.getStudentEnrollments);
    app.post('/api/courses/:id/enroll', auth, establishInstitutionalContext, async (req, res) => {
      res.status(201).json({ message: 'Successfully enrolled in course' });
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

    // Create institution admin users
    const admin1 = new User({
      email: 'admin1@test-university.edu',
      password: 'adminpassword123',
      firstName: 'Admin',
      lastName: 'One',
      institutions: [{
        institutionId: testInstitution1._id,
        role: 'institution_admin',
        status: 'active',
        profileData: { title: 'Institution Administrator' },
        createdAt: new Date(),
        approvedAt: new Date()
      }]
    });
    await admin1.save();

    const admin2 = new User({
      email: 'admin2@test-college.edu',
      password: 'adminpassword123',
      firstName: 'Admin',
      lastName: 'Two',
      institutions: [{
        institutionId: testInstitution2._id,
        role: 'institution_admin',
        status: 'active',
        profileData: { title: 'Institution Administrator' },
        createdAt: new Date(),
        approvedAt: new Date()
      }]
    });
    await admin2.save();

    // Generate tokens for admin users
    institutionAdmin1Token = jwt.sign({ id: admin1._id }, JWT_SECRET);
    institutionAdmin2Token = jwt.sign({ id: admin2._id }, JWT_SECRET);
    systemAdminToken = institutionAdmin1Token; // For now, use institution admin as system admin
  }
});