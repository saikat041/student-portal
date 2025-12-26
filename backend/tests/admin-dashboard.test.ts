import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { connectTestDatabase, disconnectTestDatabase, clearTestDatabase } from '../config/test-database';
import User, { IUser, IUserInstitution } from '../models/User';
import Institution, { IInstitution } from '../models/Institution';
import Course, { ICourse } from '../models/Course';
import Enrollment, { IEnrollment } from '../models/Enrollment';
import {
  getDashboardOverview,
  getUserManagementData,
  getPendingRegistrationsManagement,
  getInstitutionalReports,
  bulkApproveRegistrations,
  bulkRejectRegistrations
} from '../controllers/adminDashboardController';

/**
 * Unit Tests for Admin Dashboard Functionality
 * Requirements: 15.2, 17.4
 * 
 * Tests admin-only access to management features and institutional data isolation in admin views
 */

// Mock request and response objects
const createMockRequest = (params: any = {}, query: any = {}, body: any = {}, tenantContext: any = null) => ({
  params,
  query,
  body,
  tenantContext
});

const createMockResponse = () => {
  const res: any = {
    statusCode: undefined,
    data: undefined
  };
  
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  
  res.json = (data: any) => {
    res.data = data;
    // If statusCode wasn't set, assume it's 200 for successful json responses
    if (res.statusCode === undefined) {
      res.statusCode = 200;
    }
    return res;
  };
  
  return res;
};

describe('Admin Dashboard Controller Tests', () => {
  let testInstitution: IInstitution;
  let testAdminUser: IUser;
  let testStudentUser: IUser;
  let testTeacherUser: IUser;
  let testCourse: ICourse;

  beforeEach(async () => {
    // Only connect if not already connected
    if (mongoose.connection.readyState === 0) {
      await connectTestDatabase();
    }
    
    // Clear test data
    await clearTestDatabase();

    // Create test institution
    testInstitution = new Institution({
      name: 'Test University',
      type: 'university',
      address: {
        street: '123 Test St',
        city: 'Test City',
        state: 'TS',
        zipCode: '12345'
      },
      contactInfo: {
        email: 'admin@testuniversity.edu',
        phone: '555-0123'
      },
      settings: {
        academicYear: '2024-2025',
        semesterSystem: 'semester',
        enrollmentPolicies: {
          registrationTimeoutDays: 7,
          reminderDays: 2
        }
      },
      branding: {
        primaryColor: '#000080',
        logo: '',
        theme: 'default'
      },
      status: 'active'
    });
    await testInstitution.save();

    // Create test admin user
    const adminProfile: IUserInstitution = {
      institutionId: testInstitution._id as mongoose.Types.ObjectId,
      role: 'institution_admin',
      status: 'active',
      profileData: {
        adminLevel: 'institution',
        permissions: ['user_management', 'registration_approval', 'settings_management']
      },
      createdAt: new Date(),
      approvedAt: new Date()
    };

    testAdminUser = new User({
      email: 'admin@testuniversity.edu',
      password: 'password123',
      firstName: 'Admin',
      lastName: 'User',
      institutions: [adminProfile]
    });
    await testAdminUser.save();

    // Create test student user
    const studentProfile: IUserInstitution = {
      institutionId: testInstitution._id as mongoose.Types.ObjectId,
      role: 'student',
      status: 'active',
      profileData: {
        major: 'Computer Science',
        year: 'junior'
      },
      createdAt: new Date(),
      approvedAt: new Date()
    };

    testStudentUser = new User({
      email: 'student@testuniversity.edu',
      password: 'password123',
      firstName: 'Student',
      lastName: 'User',
      institutions: [studentProfile]
    });
    await testStudentUser.save();

    // Create test teacher user
    const teacherProfile: IUserInstitution = {
      institutionId: testInstitution._id as mongoose.Types.ObjectId,
      role: 'teacher',
      status: 'active',
      profileData: {
        department: 'Computer Science',
        title: 'Professor'
      },
      createdAt: new Date(),
      approvedAt: new Date()
    };

    testTeacherUser = new User({
      email: 'teacher@testuniversity.edu',
      password: 'password123',
      firstName: 'Teacher',
      lastName: 'User',
      institutions: [teacherProfile]
    });
    await testTeacherUser.save();

    // Create test course
    testCourse = new Course({
      institutionId: testInstitution._id,
      courseCode: 'CS101',
      courseName: 'Introduction to Computer Science',
      description: 'Basic computer science concepts',
      credits: 3,
      department: 'Computer Science',
      instructor: testTeacherUser._id,
      semester: 'Fall 2024',
      maxStudents: 30,
      enrolledStudents: [testStudentUser._id],
      isActive: true
    });
    await testCourse.save();
  });

  afterEach(async () => {
    // Clean up test data
    await clearTestDatabase();
  });

  describe('getDashboardOverview', () => {
    it('should return 400 when institution ID is missing', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      await getDashboardOverview(req as any, res as any);

      expect(res.statusCode).toBe(400);
      expect(res.data.error).toContain('Institution ID is required');
    });

    it('should return 400 for invalid institution ID', async () => {
      const req = createMockRequest({ institutionId: 'invalid-id' });
      const res = createMockResponse();

      await getDashboardOverview(req as any, res as any);

      expect(res.statusCode).toBe(400);
      expect(res.data.error).toContain('Invalid institution ID');
    });

    it('should return 404 for non-existent institution', async () => {
      const nonExistentId = new mongoose.Types.ObjectId().toString();
      const req = createMockRequest({ institutionId: nonExistentId });
      const res = createMockResponse();

      await getDashboardOverview(req as any, res as any);

      expect(res.statusCode).toBe(404);
      expect(res.data.error).toContain('Institution not found');
    });

    it('should return comprehensive dashboard data for valid institution', async () => {
      const req = createMockRequest(
        { institutionId: testInstitution._id.toString() },
        {},
        {},
        {
          institutionId: testInstitution._id.toString(),
          institution: testInstitution,
          userInstitution: testAdminUser.institutions[0]
        }
      );
      const res = createMockResponse();

      await getDashboardOverview(req as any, res as any);

      expect(res.statusCode).toBe(200);
      expect(res.data).toHaveProperty('institution');
      expect(res.data).toHaveProperty('statistics');
      expect(res.data).toHaveProperty('pendingRegistrations');
      expect(res.data).toHaveProperty('recentActivity');
      expect(res.data).toHaveProperty('administrators');
      expect(res.data).toHaveProperty('alerts');

      // Verify institution data
      expect(res.data.institution.id.toString()).toBe(testInstitution._id.toString());
      expect(res.data.institution.name).toBe('Test University');

      // Verify statistics structure
      expect(res.data.statistics).toHaveProperty('users');
      expect(res.data.statistics).toHaveProperty('courses');
      expect(res.data.statistics).toHaveProperty('enrollments');
      expect(res.data.statistics).toHaveProperty('roleDistribution');
    });
  });

  describe('getUserManagementData', () => {
    it('should return 400 for invalid institution ID', async () => {
      const req = createMockRequest({ institutionId: 'invalid-id' });
      const res = createMockResponse();

      await getUserManagementData(req as any, res as any);

      expect(res.statusCode).toBe(400);
      expect(res.data.error).toContain('Invalid institution ID');
    });

    it('should return paginated user data with default parameters', async () => {
      const req = createMockRequest(
        { institutionId: testInstitution._id.toString() },
        { page: 1, limit: 20 }
      );
      const res = createMockResponse();

      await getUserManagementData(req as any, res as any);

      expect(res.statusCode).toBe(200);
      expect(res.data).toHaveProperty('users');
      expect(res.data).toHaveProperty('pagination');
      expect(res.data).toHaveProperty('filters');
      expect(res.data).toHaveProperty('statistics');
      expect(res.data).toHaveProperty('availableFilters');

      // Verify pagination structure
      expect(res.data.pagination).toHaveProperty('currentPage');
      expect(res.data.pagination).toHaveProperty('totalPages');
      expect(res.data.pagination).toHaveProperty('totalUsers');
      expect(res.data.pagination).toHaveProperty('limit');

      // Verify user data structure
      expect(Array.isArray(res.data.users)).toBe(true);
    });
  });

  describe('getPendingRegistrationsManagement', () => {
    it('should return 400 for invalid institution ID', async () => {
      const req = createMockRequest({ institutionId: 'invalid-id' });
      const res = createMockResponse();

      await getPendingRegistrationsManagement(req as any, res as any);

      expect(res.statusCode).toBe(400);
      expect(res.data.error).toContain('Invalid institution ID');
    });

    it('should return pending registrations with urgency analysis', async () => {
      const req = createMockRequest(
        { institutionId: testInstitution._id.toString() }
      );
      const res = createMockResponse();

      await getPendingRegistrationsManagement(req as any, res as any);

      expect(res.statusCode).toBe(200);
      expect(res.data).toHaveProperty('pendingRegistrations');
      expect(res.data).toHaveProperty('pagination');
      expect(res.data).toHaveProperty('summary');
      expect(res.data).toHaveProperty('settings');

      // Verify summary structure
      expect(res.data.summary).toHaveProperty('total');
      expect(res.data.summary).toHaveProperty('overdue');
      expect(res.data.summary).toHaveProperty('urgent');
      expect(res.data.summary).toHaveProperty('normal');
      expect(res.data.summary).toHaveProperty('byRole');

      // Verify pending registration data structure
      expect(Array.isArray(res.data.pendingRegistrations)).toBe(true);
    });
  });

  describe('getInstitutionalReports', () => {
    it('should return 400 for invalid institution ID', async () => {
      const req = createMockRequest({ institutionId: 'invalid-id' });
      const res = createMockResponse();

      await getInstitutionalReports(req as any, res as any);

      expect(res.statusCode).toBe(400);
      expect(res.data.error).toContain('Invalid institution ID');
    });

    it('should return overview report by default', async () => {
      const req = createMockRequest(
        { institutionId: testInstitution._id.toString() }
      );
      const res = createMockResponse();

      await getInstitutionalReports(req as any, res as any);

      expect(res.statusCode).toBe(200);
      expect(res.data).toHaveProperty('institution');
      expect(res.data).toHaveProperty('reportMetadata');
      expect(res.data).toHaveProperty('summary');
      expect(res.data).toHaveProperty('analytics');

      // Verify report metadata
      expect(res.data.reportMetadata.type).toBe('overview');
      expect(res.data.reportMetadata.dateRange).toBe('30d');
      expect(res.data.reportMetadata).toHaveProperty('startDate');
      expect(res.data.reportMetadata).toHaveProperty('endDate');
      expect(res.data.reportMetadata).toHaveProperty('generatedAt');
    });
  });

  describe('Bulk Operations', () => {
    it('should return 400 for invalid institution ID in bulk approve', async () => {
      const req = createMockRequest(
        { institutionId: 'invalid-id' },
        {},
        { userIds: ['test'], approvedBy: 'test' }
      );
      const res = createMockResponse();

      await bulkApproveRegistrations(req as any, res as any);

      expect(res.statusCode).toBe(400);
      expect(res.data.error).toContain('Invalid institution ID');
    });

    it('should return 400 for invalid institution ID in bulk reject', async () => {
      const req = createMockRequest(
        { institutionId: 'invalid-id' },
        {},
        { userIds: ['test'], reason: 'test', rejectedBy: 'test' }
      );
      const res = createMockResponse();

      await bulkRejectRegistrations(req as any, res as any);

      expect(res.statusCode).toBe(400);
      expect(res.data.error).toContain('Invalid institution ID');
    });

    it('should return 400 when user IDs array is missing', async () => {
      const req = createMockRequest(
        { institutionId: testInstitution._id.toString() },
        {},
        { approvedBy: testAdminUser._id.toString() }
      );
      const res = createMockResponse();

      await bulkApproveRegistrations(req as any, res as any);

      expect(res.statusCode).toBe(400);
      expect(res.data.error).toContain('User IDs array is required');
    });

    it('should limit bulk operations to 50 users', async () => {
      const tooManyUserIds = Array(51).fill(0).map(() => new mongoose.Types.ObjectId().toString());
      
      const req = createMockRequest(
        { institutionId: testInstitution._id.toString() },
        {},
        {
          userIds: tooManyUserIds,
          approvedBy: testAdminUser._id.toString()
        }
      );
      const res = createMockResponse();

      await bulkApproveRegistrations(req as any, res as any);

      expect(res.statusCode).toBe(400);
      expect(res.data.error).toContain('Cannot approve more than 50 registrations at once');
    });
  });

  describe('Data Isolation Tests', () => {
    let otherInstitution: IInstitution;
    let otherInstitutionUser: IUser;

    beforeEach(async () => {
      // Create another institution
      otherInstitution = new Institution({
        name: 'Other University',
        type: 'university',
        address: {
          street: '456 Other St',
          city: 'Other City',
          state: 'OS',
          zipCode: '54321'
        },
        contactInfo: {
          email: 'admin@otheruniversity.edu',
          phone: '555-0456'
        },
        settings: {
          academicYear: '2024-2025',
          semesterSystem: 'semester',
          enrollmentPolicies: {}
        },
        branding: {
          primaryColor: '#800000',
          logo: '',
          theme: 'default'
        },
        status: 'active'
      });
      await otherInstitution.save();

      // Create user in other institution
      const otherProfile: IUserInstitution = {
        institutionId: otherInstitution._id as mongoose.Types.ObjectId,
        role: 'student',
        status: 'active',
        profileData: {},
        createdAt: new Date(),
        approvedAt: new Date()
      };

      otherInstitutionUser = new User({
        email: 'student@otheruniversity.edu',
        password: 'password123',
        firstName: 'Other',
        lastName: 'Student',
        institutions: [otherProfile]
      });
      await otherInstitutionUser.save();
    });

    it('should only show users from current institution in user management', async () => {
      const req = createMockRequest(
        { institutionId: testInstitution._id.toString() }
      );
      const res = createMockResponse();

      await getUserManagementData(req as any, res as any);

      expect(res.statusCode).toBe(200);
      
      // Verify no users from other institutions are returned
      res.data.users.forEach((user: any) => {
        expect(user.email).not.toBe('student@otheruniversity.edu');
      });
      
      // Verify the pagination total reflects only current institution users
      const expectedTotal = await User.countDocuments({
        'institutions.institutionId': testInstitution._id
      });
      expect(res.data.pagination.totalUsers).toBe(expectedTotal);
    });

    it('should only show users from the current institution in dashboard', async () => {
      const req = createMockRequest(
        { institutionId: testInstitution._id.toString() }
      );
      const res = createMockResponse();

      await getDashboardOverview(req as any, res as any);

      expect(res.statusCode).toBe(200);
      
      // The user count should not include users from other institutions
      const totalUsersInTestInstitution = await User.countDocuments({
        'institutions.institutionId': testInstitution._id
      });
      
      expect(res.data.statistics.users.totalUsers).toBe(totalUsersInTestInstitution);
      expect(res.data.statistics.users.totalUsers).not.toBe(
        await User.countDocuments({}) // Total users across all institutions
      );
    });
  });

});