/**
 * Unit Tests for Enrollment Management Features
 * Requirements: 5.2, 5.5 - Enrollment history, statistics, and GPA calculation within institutional boundaries
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { connectTestDatabase, disconnectTestDatabase, clearTestDatabase } from '../config/test-database';
import { EnrollmentService } from '../services/EnrollmentService';
import User from '../models/User';
import Institution from '../models/Institution';
import Student from '../models/Student';
import Course from '../models/Course';
import Enrollment from '../models/Enrollment';

describe('Enrollment Management Features', () => {
  let enrollmentService: EnrollmentService;
  let institution: any;
  let user: any;
  let student: any;
  let course1: any;
  let course2: any;

  beforeAll(async () => {
    await connectTestDatabase();
    enrollmentService = EnrollmentService.getInstance();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  beforeEach(async () => {
    await clearTestDatabase();

    // Create test institution
    institution = await Institution.create({
      name: 'Test University',
      type: 'university',
      address: {
        street: '123 Test St',
        city: 'Test City',
        state: 'TS',
        zipCode: '12345'
      },
      contactInfo: {
        email: 'admin@test.edu',
        phone: '555-0123'
      },
      status: 'active'
    });

    // Create test user
    user = await User.create({
      email: 'student@test.edu',
      password: 'hashedpassword',
      firstName: 'Test',
      lastName: 'Student',
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

    // Create test student profile
    student = await Student.create({
      user: user._id,
      institutionId: institution._id,
      studentId: 'STU001',
      major: 'Computer Science',
      year: 2,
      gpa: 0,
      enrolledCourses: [],
      totalCredits: 0,
      maxCredits: 18,
      isActive: true
    });

    // Create test teacher user
    const teacherUser = await User.create({
      email: 'teacher@test.edu',
      password: 'hashedpassword',
      firstName: 'Test',
      lastName: 'Teacher',
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

    // Create test courses
    course1 = await Course.create({
      institutionId: institution._id,
      courseCode: 'CS101',
      courseName: 'Introduction to Computer Science',
      description: 'Basic computer science concepts',
      credits: 3,
      department: 'Computer Science',
      instructor: teacherUser._id,
      semester: 'Fall 2024',
      maxStudents: 30,
      enrolledStudents: [],
      isActive: true
    });

    course2 = await Course.create({
      institutionId: institution._id,
      courseCode: 'CS102',
      courseName: 'Data Structures',
      description: 'Introduction to data structures',
      credits: 4,
      department: 'Computer Science',
      instructor: teacherUser._id,
      semester: 'Fall 2024',
      maxStudents: 25,
      enrolledStudents: [],
      isActive: true
    });
  });

  describe('Student Enrollment History', () => {
    it('should return empty history for student with no enrollments', async () => {
      const enrollments = await enrollmentService.getStudentEnrollments(
        user._id.toString(),
        institution._id.toString()
      );

      expect(enrollments).toHaveLength(0);
    });

    it('should return enrollment history with institutional filtering', async () => {
      // Create enrollments
      const enrollment1 = await Enrollment.create({
        student: student._id,
        course: course1._id,
        institutionId: institution._id,
        enrollmentDate: new Date(),
        status: 'enrolled',
        credits: course1.credits,
        semester: 'Fall 2024',
        academicYear: '2024-2025',
        courseSnapshot: {
          code: course1.courseCode,
          name: course1.courseName,
          credits: course1.credits,
          semester: course1.semester
        }
      });

      const enrollment2 = await Enrollment.create({
        student: student._id,
        course: course2._id,
        institutionId: institution._id,
        enrollmentDate: new Date(),
        status: 'completed',
        credits: course2.credits,
        semester: 'Spring 2024',
        academicYear: '2023-2024',
        grade: 'A',
        courseSnapshot: {
          code: course2.courseCode,
          name: course2.courseName,
          credits: course2.credits,
          semester: course2.semester
        }
      });

      const enrollments = await enrollmentService.getStudentEnrollments(
        user._id.toString(),
        institution._id.toString()
      );

      expect(enrollments).toHaveLength(2);
      expect(enrollments.some(e => e._id.toString() === enrollment1._id.toString())).toBe(true);
      expect(enrollments.some(e => e._id.toString() === enrollment2._id.toString())).toBe(true);
    });

    it('should filter enrollment history by status', async () => {
      // Create enrollments with different statuses
      await Enrollment.create({
        student: student._id,
        course: course1._id,
        institutionId: institution._id,
        enrollmentDate: new Date(),
        status: 'enrolled',
        credits: course1.credits,
        semester: 'Fall 2024',
        academicYear: '2024-2025',
        courseSnapshot: {
          code: course1.courseCode,
          name: course1.courseName,
          credits: course1.credits,
          semester: course1.semester
        }
      });

      await Enrollment.create({
        student: student._id,
        course: course2._id,
        institutionId: institution._id,
        enrollmentDate: new Date(),
        status: 'completed',
        credits: course2.credits,
        semester: 'Spring 2024',
        academicYear: '2023-2024',
        grade: 'A',
        courseSnapshot: {
          code: course2.courseCode,
          name: course2.courseName,
          credits: course2.credits,
          semester: course2.semester
        }
      });

      // Get only enrolled courses
      const enrolledCourses = await enrollmentService.getStudentEnrollments(
        user._id.toString(),
        institution._id.toString(),
        'enrolled'
      );

      expect(enrolledCourses).toHaveLength(1);
      expect(enrolledCourses[0].status).toBe('enrolled');

      // Get only completed courses
      const completedCourses = await enrollmentService.getStudentEnrollments(
        user._id.toString(),
        institution._id.toString(),
        'completed'
      );

      expect(completedCourses).toHaveLength(1);
      expect(completedCourses[0].status).toBe('completed');
    });
  });

  describe('Enrollment Statistics', () => {
    it('should return zero statistics for student with no enrollments', async () => {
      const statistics = await enrollmentService.getEnrollmentStatistics(
        user._id.toString(),
        institution._id.toString()
      );

      expect(statistics.totalEnrollments).toBe(0);
      expect(statistics.activeEnrollments).toBe(0);
      expect(statistics.completedEnrollments).toBe(0);
      expect(statistics.droppedEnrollments).toBe(0);
      expect(statistics.totalCredits).toBe(0);
      expect(statistics.gpa).toBeUndefined();
    });

    it('should calculate correct enrollment statistics', async () => {
      // Create various enrollments
      await Enrollment.create({
        student: student._id,
        course: course1._id,
        institutionId: institution._id,
        enrollmentDate: new Date(),
        status: 'enrolled',
        credits: 3,
        semester: 'Fall 2024',
        academicYear: '2024-2025',
        courseSnapshot: {
          code: course1.courseCode,
          name: course1.courseName,
          credits: course1.credits,
          semester: course1.semester
        }
      });

      await Enrollment.create({
        student: student._id,
        course: course2._id,
        institutionId: institution._id,
        enrollmentDate: new Date(),
        status: 'completed',
        credits: 4,
        semester: 'Spring 2024',
        academicYear: '2023-2024',
        grade: 'A',
        courseSnapshot: {
          code: course2.courseCode,
          name: course2.courseName,
          credits: course2.credits,
          semester: course2.semester
        }
      });

      // Create a dropped enrollment
      const course3 = await Course.create({
        institutionId: institution._id,
        courseCode: 'CS103',
        courseName: 'Algorithms',
        description: 'Algorithm design and analysis',
        credits: 3,
        department: 'Computer Science',
        instructor: user._id, // Using existing user as instructor for simplicity
        semester: 'Fall 2024',
        maxStudents: 20,
        enrolledStudents: [],
        isActive: true
      });

      await Enrollment.create({
        student: student._id,
        course: course3._id,
        institutionId: institution._id,
        enrollmentDate: new Date(),
        status: 'dropped',
        credits: 3,
        semester: 'Fall 2024',
        academicYear: '2024-2025',
        courseSnapshot: {
          code: course3.courseCode,
          name: course3.courseName,
          credits: course3.credits,
          semester: course3.semester
        }
      });

      const statistics = await enrollmentService.getEnrollmentStatistics(
        user._id.toString(),
        institution._id.toString()
      );

      expect(statistics.totalEnrollments).toBe(3);
      expect(statistics.activeEnrollments).toBe(1);
      expect(statistics.completedEnrollments).toBe(1);
      expect(statistics.droppedEnrollments).toBe(1);
      expect(statistics.totalCredits).toBe(7); // 3 (enrolled) + 4 (completed)
      expect(statistics.gpa).toBe(4.0); // Only completed course with grade A
    });
  });

  describe('GPA Calculation', () => {
    it('should return 0 GPA for student with no completed courses', async () => {
      const gpa = await enrollmentService.calculateGPA(
        user._id.toString(),
        institution._id.toString()
      );

      expect(gpa).toBe(0);
    });

    it('should calculate correct GPA from completed courses', async () => {
      // Create completed enrollments with grades
      await Enrollment.create({
        student: student._id,
        course: course1._id,
        institutionId: institution._id,
        enrollmentDate: new Date(),
        status: 'completed',
        credits: 3,
        semester: 'Fall 2023',
        academicYear: '2023-2024',
        grade: 'A', // 4.0 * 3 credits = 12 grade points
        courseSnapshot: {
          code: course1.courseCode,
          name: course1.courseName,
          credits: course1.credits,
          semester: course1.semester
        }
      });

      await Enrollment.create({
        student: student._id,
        course: course2._id,
        institutionId: institution._id,
        enrollmentDate: new Date(),
        status: 'completed',
        credits: 4,
        semester: 'Spring 2024',
        academicYear: '2023-2024',
        grade: 'B', // 3.0 * 4 credits = 12 grade points
        courseSnapshot: {
          code: course2.courseCode,
          name: course2.courseName,
          credits: course2.credits,
          semester: course2.semester
        }
      });

      const gpa = await enrollmentService.calculateGPA(
        user._id.toString(),
        institution._id.toString()
      );

      // Total grade points: 12 + 12 = 24
      // Total credits: 3 + 4 = 7
      // GPA: 24 / 7 = 3.428...
      expect(gpa).toBeCloseTo(3.43, 2);
    });

    it('should ignore enrolled courses when calculating GPA', async () => {
      // Create completed course with grade
      await Enrollment.create({
        student: student._id,
        course: course1._id,
        institutionId: institution._id,
        enrollmentDate: new Date(),
        status: 'completed',
        credits: 3,
        semester: 'Fall 2023',
        academicYear: '2023-2024',
        grade: 'A',
        courseSnapshot: {
          code: course1.courseCode,
          name: course1.courseName,
          credits: course1.credits,
          semester: course1.semester
        }
      });

      // Create enrolled course (should be ignored)
      await Enrollment.create({
        student: student._id,
        course: course2._id,
        institutionId: institution._id,
        enrollmentDate: new Date(),
        status: 'enrolled',
        credits: 4,
        semester: 'Spring 2024',
        academicYear: '2023-2024',
        courseSnapshot: {
          code: course2.courseCode,
          name: course2.courseName,
          credits: course2.credits,
          semester: course2.semester
        }
      });

      const gpa = await enrollmentService.calculateGPA(
        user._id.toString(),
        institution._id.toString()
      );

      // Should only consider the completed course
      expect(gpa).toBe(4.0);
    });
  });

  describe('Institutional Filtering', () => {
    it('should only return data from the specified institution', async () => {
      // Create another institution
      const otherInstitution = await Institution.create({
        name: 'Other University',
        type: 'university',
        address: {
          street: '456 Other St',
          city: 'Other City',
          state: 'OS',
          zipCode: '67890'
        },
        contactInfo: {
          email: 'admin@other.edu',
          phone: '555-0456'
        },
        status: 'active'
      });

      // Create enrollment in other institution
      const otherStudent = await Student.create({
        user: user._id,
        institutionId: otherInstitution._id,
        studentId: 'STU002',
        major: 'Mathematics',
        year: 1,
        gpa: 0,
        enrolledCourses: [],
        totalCredits: 0,
        maxCredits: 18,
        isActive: true
      });

      const otherCourse = await Course.create({
        institutionId: otherInstitution._id,
        courseCode: 'MATH101',
        courseName: 'Calculus I',
        description: 'Introduction to calculus',
        credits: 4,
        department: 'Mathematics',
        instructor: user._id,
        semester: 'Fall 2024',
        maxStudents: 40,
        enrolledStudents: [],
        isActive: true
      });

      await Enrollment.create({
        student: otherStudent._id,
        course: otherCourse._id,
        institutionId: otherInstitution._id,
        enrollmentDate: new Date(),
        status: 'enrolled',
        credits: 4,
        semester: 'Fall 2024',
        academicYear: '2024-2025',
        courseSnapshot: {
          code: otherCourse.courseCode,
          name: otherCourse.courseName,
          credits: otherCourse.credits,
          semester: otherCourse.semester
        }
      });

      // Create enrollment in original institution
      await Enrollment.create({
        student: student._id,
        course: course1._id,
        institutionId: institution._id,
        enrollmentDate: new Date(),
        status: 'enrolled',
        credits: 3,
        semester: 'Fall 2024',
        academicYear: '2024-2025',
        courseSnapshot: {
          code: course1.courseCode,
          name: course1.courseName,
          credits: course1.credits,
          semester: course1.semester
        }
      });

      // Get enrollments for original institution - should only return 1
      const originalInstitutionEnrollments = await enrollmentService.getStudentEnrollments(
        user._id.toString(),
        institution._id.toString()
      );

      expect(originalInstitutionEnrollments).toHaveLength(1);
      expect(originalInstitutionEnrollments[0].institutionId.toString()).toBe(institution._id.toString());

      // Get enrollments for other institution - should only return 1
      const otherInstitutionEnrollments = await enrollmentService.getStudentEnrollments(
        user._id.toString(),
        otherInstitution._id.toString()
      );

      expect(otherInstitutionEnrollments).toHaveLength(1);
      expect(otherInstitutionEnrollments[0].institutionId.toString()).toBe(otherInstitution._id.toString());
    });
  });
});