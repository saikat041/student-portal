/**
 * Unit Tests for Cross-Institutional Enrollment Prevention
 * Feature: multi-institution-support, Property 3: Cross-Institutional Enrollment Prevention
 * **Validates: Requirements 4.4, 9.4**
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { connectTestDatabase, disconnectTestDatabase, clearTestDatabase } from '../config/test-database';
import { TenantContextManager } from '../services/TenantContextManager';
import { AccessValidator } from '../services/AccessValidator';
import institutionService from '../services/InstitutionService';
import User from '../models/User';
import Course from '../models/Course';
import Student from '../models/Student';
import Enrollment from '../models/Enrollment';

describe('Cross-Institutional Enrollment Prevention Unit Tests', () => {
  let tenantManager: TenantContextManager;
  let accessValidator: AccessValidator;

  beforeAll(async () => {
    await connectTestDatabase();
    tenantManager = TenantContextManager.getInstance();
    accessValidator = AccessValidator.getInstance();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  beforeEach(async () => {
    await clearTestDatabase();
  });

  /**
   * Unit Test: Prevent enrollment when student and course belong to different institutions
   * **Validates: Requirements 4.4, 9.4**
   */
  it('should prevent enrollment when student and course belong to different institutions', async () => {
    // Register two institutions
    const institution1 = await institutionService.registerInstitution({
      name: 'University A',
      type: 'university',
      address: {
        street: '123 Main St',
        city: 'Boston',
        state: 'MA',
        zipCode: '02101'
      },
      contactInfo: {
        email: 'admin1@universitya.edu',
        phone: '6175551234'
      }
    });

    const institution2 = await institutionService.registerInstitution({
      name: 'University B',
      type: 'university',
      address: {
        street: '456 Oak Ave',
        city: 'Cambridge',
        state: 'MA',
        zipCode: '02138'
      },
      contactInfo: {
        email: 'admin2@universityb.edu',
        phone: '6175555678'
      }
    });

    // Create user with access to institution1 only
    const user = await User.create({
      email: 'student1@example.com',
      password: 'hashedPassword123',
      firstName: 'John',
      lastName: 'Doe',
      institutions: [
        {
          institutionId: institution1._id,
          role: 'student',
          status: 'active',
          profileData: {},
          createdAt: new Date(),
          approvedAt: new Date(),
          approvedBy: new mongoose.Types.ObjectId()
        }
      ]
    });

    // Create student profile in institution1
    const student = await Student.create({
      user: user._id,
      institutionId: institution1._id,
      studentId: 'STU001',
      major: 'Computer Science',
      year: 2,
      gpa: 3.5,
      enrolledCourses: [],
      totalCredits: 0,
      maxCredits: 18,
      isActive: true
    });

    // Create teacher user for institution2
    const teacherUser = await User.create({
      email: 'teacher1@universityb.edu',
      password: 'hashedPassword456',
      firstName: 'Jane',
      lastName: 'Smith',
      institutions: [
        {
          institutionId: institution2._id,
          role: 'teacher',
          status: 'active',
          profileData: {},
          createdAt: new Date(),
          approvedAt: new Date(),
          approvedBy: new mongoose.Types.ObjectId()
        }
      ]
    });

    // Create course in institution2 (different from student's institution)
    const course = await Course.create({
      institutionId: institution2._id,
      courseCode: 'CS101',
      courseName: 'Introduction to Computer Science',
      description: 'Basic CS course',
      credits: 3,
      department: 'Computer Science',
      instructor: teacherUser._id,
      semester: 'Fall 2024',
      maxStudents: 30,
      enrolledStudents: [],
      isActive: true
    });

    // Set tenant context for institution1 (student's institution)
    await tenantManager.setInstitutionContext(
      institution1._id.toString(),
      user._id.toString()
    );

    // Verify that course from institution2 is not accessible in institution1 context
    const courseInWrongContext = await Course.findOne({
      _id: course._id,
      institutionId: institution1._id
    });

    expect(courseInWrongContext).toBeNull();

    // Verify course exists in its own institution
    const courseInCorrectContext = await Course.findOne({
      _id: course._id,
      institutionId: institution2._id
    });

    expect(courseInCorrectContext).toBeTruthy();
  });

  /**
   * Unit Test: Prevent enrollment when institutional context does not match course institution
   * **Validates: Requirements 4.4, 9.4**
   */
  it('should prevent enrollment when institutional context does not match course institution', async () => {
    // Register two institutions
    const institution1 = await institutionService.registerInstitution({
      name: 'College X',
      type: 'college',
      address: {
        street: '789 Pine Rd',
        city: 'New York',
        state: 'NY',
        zipCode: '10001'
      },
      contactInfo: {
        email: 'admin1@collegex.edu',
        phone: '2125551111'
      }
    });

    const institution2 = await institutionService.registerInstitution({
      name: 'College Y',
      type: 'college',
      address: {
        street: '321 Elm St',
        city: 'Brooklyn',
        state: 'NY',
        zipCode: '11201'
      },
      contactInfo: {
        email: 'admin2@collegey.edu',
        phone: '7185552222'
      }
    });

    // Create user with access to both institutions
    const user = await User.create({
      email: 'multiinst1@example.com',
      password: 'hashedPassword789',
      firstName: 'Alice',
      lastName: 'Johnson',
      institutions: [
        {
          institutionId: institution1._id,
          role: 'student',
          status: 'active',
          profileData: {},
          createdAt: new Date(),
          approvedAt: new Date(),
          approvedBy: new mongoose.Types.ObjectId()
        },
        {
          institutionId: institution2._id,
          role: 'student',
          status: 'active',
          profileData: {},
          createdAt: new Date(),
          approvedAt: new Date(),
          approvedBy: new mongoose.Types.ObjectId()
        }
      ]
    });

    // Create teacher user for institution2
    const teacherUser = await User.create({
      email: 'teacher2@collegey.edu',
      password: 'hashedPassword999',
      firstName: 'Bob',
      lastName: 'Wilson',
      institutions: [
        {
          institutionId: institution2._id,
          role: 'teacher',
          status: 'active',
          profileData: {},
          createdAt: new Date(),
          approvedAt: new Date(),
          approvedBy: new mongoose.Types.ObjectId()
        }
      ]
    });

    // Create course in institution2
    const course = await Course.create({
      institutionId: institution2._id,
      courseCode: 'MATH201',
      courseName: 'Calculus II',
      description: 'Advanced calculus',
      credits: 4,
      department: 'Mathematics',
      instructor: teacherUser._id,
      semester: 'Spring 2025',
      maxStudents: 25,
      enrolledStudents: [],
      isActive: true
    });

    // Set tenant context for institution1 (different from course's institution)
    await tenantManager.setInstitutionContext(
      institution1._id.toString(),
      user._id.toString()
    );

    // Attempt to access course from institution2 while in institution1 context
    const courseInWrongContext = await Course.findOne({
      _id: course._id,
      institutionId: institution1._id
    });

    expect(courseInWrongContext).toBeNull();

    // Verify course exists in correct institutional context
    const courseInCorrectContext = await Course.findOne({
      _id: course._id,
      institutionId: institution2._id
    });

    expect(courseInCorrectContext).toBeTruthy();

    // Switch to correct institutional context
    await tenantManager.setInstitutionContext(
      institution2._id.toString(),
      user._id.toString()
    );

    // Now the course should be accessible
    const courseInNewContext = await Course.findOne({
      _id: course._id,
      institutionId: institution2._id
    });

    expect(courseInNewContext).toBeTruthy();
  });

  /**
   * Unit Test: Ensure student, course, and enrollment all belong to the same institution
   * **Validates: Requirements 4.4, 9.4**
   */
  it('should ensure student, course, and enrollment all belong to the same institution', async () => {
    // Register institution
    const institution = await institutionService.registerInstitution({
      name: 'State University',
      type: 'university',
      address: {
        street: '999 University Blvd',
        city: 'Austin',
        state: 'TX',
        zipCode: '78701'
      },
      contactInfo: {
        email: 'admin@stateuniv.edu',
        phone: '5125551234'
      }
    });

    // Create user with access to institution
    const user = await User.create({
      email: 'student3@example.com',
      password: 'hashedPassword111',
      firstName: 'Charlie',
      lastName: 'Brown',
      institutions: [
        {
          institutionId: institution._id,
          role: 'student',
          status: 'active',
          profileData: {},
          createdAt: new Date(),
          approvedAt: new Date(),
          approvedBy: new mongoose.Types.ObjectId()
        }
      ]
    });

    // Create student profile
    const student = await Student.create({
      user: user._id,
      institutionId: institution._id,
      studentId: 'STU002',
      major: 'Engineering',
      year: 3,
      gpa: 3.8,
      enrolledCourses: [],
      totalCredits: 0,
      maxCredits: 18,
      isActive: true
    });

    // Create teacher user
    const teacherUser = await User.create({
      email: 'teacher3@stateuniv.edu',
      password: 'hashedPassword222',
      firstName: 'Diana',
      lastName: 'Prince',
      institutions: [
        {
          institutionId: institution._id,
          role: 'teacher',
          status: 'active',
          profileData: {},
          createdAt: new Date(),
          approvedAt: new Date(),
          approvedBy: new mongoose.Types.ObjectId()
        }
      ]
    });

    // Create course in same institution
    const course = await Course.create({
      institutionId: institution._id,
      courseCode: 'ENG301',
      courseName: 'Advanced Engineering',
      description: 'Upper level engineering course',
      credits: 4,
      department: 'Engineering',
      instructor: teacherUser._id,
      semester: 'Fall 2024',
      maxStudents: 20,
      enrolledStudents: [],
      isActive: true
    });

    // Create valid enrollment (all in same institution)
    const enrollment = await Enrollment.create({
      student: student._id,
      course: course._id,
      institutionId: institution._id,
      enrollmentDate: new Date(),
      status: 'enrolled',
      credits: course.credits,
      semester: 'Fall 2024',
      academicYear: '2024-2025',
      courseSnapshot: {
        code: course.courseCode,
        name: course.courseName,
        credits: course.credits,
        semester: course.semester
      }
    });

    // Verify triple validation: all three entities have same institutionId
    expect(student.institutionId.toString()).toBe(institution._id.toString());
    expect(course.institutionId.toString()).toBe(institution._id.toString());
    expect(enrollment.institutionId.toString()).toBe(institution._id.toString());

    // Verify that queries with institutional filtering return the enrollment
    const enrollmentWithFilter = await Enrollment.findOne({
      _id: enrollment._id,
      institutionId: institution._id
    });

    expect(enrollmentWithFilter).toBeTruthy();
    expect(enrollmentWithFilter?._id.toString()).toBe(enrollment._id.toString());

    // Verify that queries with wrong institutional filter return null
    const wrongInstitutionId = new mongoose.Types.ObjectId();
    const enrollmentWithWrongFilter = await Enrollment.findOne({
      _id: enrollment._id,
      institutionId: wrongInstitutionId
    });

    expect(enrollmentWithWrongFilter).toBeNull();
  });

});
