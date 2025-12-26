import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { TenantContextManager } from '../services/TenantContextManager';
import Institution, { IInstitution } from '../models/Institution';
import User, { IUser } from '../models/User';
import Course from '../models/Course';

// Feature: multi-institution-support, Property 2: Data Isolation Enforcement
describe('Tenant Context Isolation Tests', () => {
  let mongoServer: MongoMemoryServer;
  let tenantManager: TenantContextManager;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
    tenantManager = TenantContextManager.getInstance();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clear all collections before each test
    await Institution.deleteMany({});
    await User.deleteMany({});
    await Course.deleteMany({});
  });

  // Hardcoded test data for deterministic testing
  const testInstitutions = [
    {
      name: 'Harvard_University_001',
      type: 'university',
      address: {
        street: '123 Main Street',
        city: 'Cambridge',
        state: 'Massachusetts',
        zipCode: '02138'
      },
      contactInfo: {
        email: 'contact@harvard.edu',
        phone: '617-555-0100'
      }
    },
    {
      name: 'MIT_Institute_002',
      type: 'university',
      address: {
        street: '77 Massachusetts Avenue',
        city: 'Cambridge',
        state: 'Massachusetts',
        zipCode: '02139'
      },
      contactInfo: {
        email: 'contact@mit.edu',
        phone: '617-555-0200'
      }
    },
    {
      name: 'Stanford_University_003',
      type: 'university',
      address: {
        street: '450 Serra Mall',
        city: 'Palo Alto',
        state: 'California',
        zipCode: '94305'
      },
      contactInfo: {
        email: 'contact@stanford.edu',
        phone: '650-555-0300'
      }
    }
  ];

  const testUsers = [
    {
      email: 'john.doe@example.com',
      password: 'SecurePass123!',
      firstName: 'John',
      lastName: 'Doe'
    },
    {
      email: 'jane.smith@example.com',
      password: 'SecurePass456!',
      firstName: 'Jane',
      lastName: 'Smith'
    },
    {
      email: 'bob.johnson@example.com',
      password: 'SecurePass789!',
      firstName: 'Bob',
      lastName: 'Johnson'
    }
  ];

  const testCourses = [
    {
      courseCode: 'CS101',
      courseName: 'Introduction to Computer Science',
      description: 'Fundamentals of computer science and programming',
      credits: 3,
      department: 'Computer Science',
      semester: 'Fall 2024',
      maxStudents: 100
    },
    {
      courseCode: 'MATH201',
      courseName: 'Calculus II',
      description: 'Advanced calculus topics including integration',
      credits: 4,
      department: 'Mathematics',
      semester: 'Fall 2024',
      maxStudents: 80
    },
    {
      courseCode: 'PHYS301',
      courseName: 'Classical Mechanics',
      description: 'Physics of motion and forces',
      credits: 4,
      department: 'Physics',
      semester: 'Fall 2024',
      maxStudents: 60
    }
  ];

  /**
   * Property 2: Data Isolation Enforcement
   * For any user accessing data within an institutional context, 
   * all returned data should belong only to that user's current institution
   * Validates: Requirements 4.3, 5.1, 7.1, 7.2
   */
  it('should enforce data isolation between institutions', async () => {
    // Create two institutions
    const institution1 = new Institution(testInstitutions[0]);
    const institution2 = new Institution(testInstitutions[1]);
    await institution1.save();
    await institution2.save();

    // Create a user with access to both institutions
    const user = new User({
      ...testUsers[0],
      institutions: [
        {
          institutionId: institution1._id,
          role: 'student',
          status: 'active',
          profileData: {},
          createdAt: new Date()
        },
        {
          institutionId: institution2._id,
          role: 'student', 
          status: 'active',
          profileData: {},
          createdAt: new Date()
        }
      ]
    });
    await user.save();

    // Create courses in each institution
    const course1 = new Course({
      ...testCourses[0],
      institutionId: institution1._id,
      instructor: user._id
    });
    const course2 = new Course({
      ...testCourses[1],
      institutionId: institution2._id,
      instructor: user._id
    });
    await course1.save();
    await course2.save();

    // Set context to institution1
    const context1 = await tenantManager.setInstitutionContext(
      institution1._id.toString(),
      user._id.toString()
    );

    // Query courses with institution1 context
    const coursesInInst1 = await Course.find({
      institutionId: context1.institutionId
    });

    // Verify data isolation: should only return courses from institution1
    expect(coursesInInst1).toHaveLength(1);
    expect(coursesInInst1[0]._id.toString()).toBe(course1._id.toString());
    expect(coursesInInst1[0].institutionId.toString()).toBe(institution1._id.toString());

    // Set context to institution2
    const context2 = await tenantManager.setInstitutionContext(
      institution2._id.toString(),
      user._id.toString()
    );

    // Query courses with institution2 context
    const coursesInInst2 = await Course.find({
      institutionId: context2.institutionId
    });

    // Verify data isolation: should only return courses from institution2
    expect(coursesInInst2).toHaveLength(1);
    expect(coursesInInst2[0]._id.toString()).toBe(course2._id.toString());
    expect(coursesInInst2[0].institutionId.toString()).toBe(institution2._id.toString());

    // Verify cross-institutional access prevention
    const crossAccessAttempt = await Course.find({
      _id: course1._id,
      institutionId: context2.institutionId
    });
    expect(crossAccessAttempt).toHaveLength(0);
  }, 15000);

  it('should validate user access to institutional resources', async () => {
    // Create two institutions
    const institution1 = new Institution(testInstitutions[0]);
    const institution2 = new Institution(testInstitutions[1]);
    await institution1.save();
    await institution2.save();

    // Create user with access only to institution1
    const user = new User({
      ...testUsers[1],
      institutions: [{
        institutionId: institution1._id,
        role: 'student',
        status: 'active',
        profileData: {},
        createdAt: new Date()
      }]
    });
    await user.save();

    // Create course in institution2 (user has no access)
    const course = new Course({
      ...testCourses[2],
      institutionId: institution2._id,
      instructor: user._id
    });
    await course.save();

    // Attempt to set context for institution2 (should fail)
    try {
      await tenantManager.setInstitutionContext(
        institution2._id.toString(),
        user._id.toString()
      );
      // Should not reach here
      expect(false).toBe(true);
    } catch (error) {
      expect((error as Error).message).toBe('User does not have access to this institution');
    }

    // Set valid context for institution1
    const context = await tenantManager.setInstitutionContext(
      institution1._id.toString(),
      user._id.toString()
    );

    // Validate access to course in institution2 should fail
    const hasAccess = await tenantManager.validateAccess(
      course._id.toString(),
      'course',
      context
    );
    expect(hasAccess).toBe(false);
  }, 15000);

  it('should maintain context isolation across concurrent users', async () => {
    // Create institutions
    const institution1 = new Institution(testInstitutions[0]);
    const institution2 = new Institution(testInstitutions[1]);
    await institution1.save();
    await institution2.save();

    // Create users with different institutional access
    const user1 = new User({
      ...testUsers[0],
      institutions: [{
        institutionId: institution1._id,
        role: 'student',
        status: 'active',
        profileData: {},
        createdAt: new Date()
      }]
    });

    const user2 = new User({
      ...testUsers[1],
      institutions: [{
        institutionId: institution2._id,
        role: 'student',
        status: 'active',
        profileData: {},
        createdAt: new Date()
      }]
    });

    await user1.save();
    await user2.save();

    // Set contexts for both users simultaneously
    const context1 = await tenantManager.setInstitutionContext(
      institution1._id.toString(),
      user1._id.toString()
    );

    const context2 = await tenantManager.setInstitutionContext(
      institution2._id.toString(),
      user2._id.toString()
    );

    // Verify contexts are isolated
    expect(context1.institutionId.toString()).toBe(institution1._id.toString());
    expect(context2.institutionId.toString()).toBe(institution2._id.toString());
    expect(context1.institutionId.toString()).not.toBe(context2.institutionId.toString());

    // Verify user-specific context retrieval
    const retrievedContext1 = tenantManager.getCurrentInstitution(
      user1._id.toString(),
      institution1._id.toString()
    );
    const retrievedContext2 = tenantManager.getCurrentInstitution(
      user2._id.toString(),
      institution2._id.toString()
    );

    expect(retrievedContext1?.institutionId.toString()).toBe(institution1._id.toString());
    expect(retrievedContext2?.institutionId.toString()).toBe(institution2._id.toString());
  }, 15000);
});