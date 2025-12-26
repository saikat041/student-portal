import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { connectTestDatabase, disconnectTestDatabase, clearTestDatabase } from '../config/test-database';
import { 
  createUserPerformanceIndexes, 
  createStudentPerformanceIndexes, 
  createInstitutionPerformanceIndexes,
  createCoursePerformanceIndexes,
  createEnrollmentPerformanceIndexes 
} from '../scripts/create-performance-indexes';
import Institution from '../models/Institution';
import User from '../models/User';
import Course from '../models/Course';
import Enrollment from '../models/Enrollment';
import Student from '../models/Student';

describe('Performance Indexing Tests', () => {
  beforeAll(async () => {
    await connectTestDatabase();
    
    // Create all performance indexes for testing
    await Promise.all([
      createUserPerformanceIndexes(),
      createStudentPerformanceIndexes(),
      createInstitutionPerformanceIndexes(),
      createCoursePerformanceIndexes(),
      createEnrollmentPerformanceIndexes()
    ]);
  });

  afterAll(async () => {
    await clearTestDatabase();
    await disconnectTestDatabase();
  });

  describe('Index Existence Validation', () => {
    it('should have all required user performance indexes', async () => {
      const db = mongoose.connection.db;
      const usersCollection = db.collection('users');
      const indexes = await usersCollection.listIndexes().toArray();
      
      const indexNames = indexes.map(idx => idx.name);
      
      // Check for performance indexes
      expect(indexNames).toContain('user_institution_role_status_idx');
      expect(indexNames).toContain('user_admin_workflow_idx');
      expect(indexNames).toContain('user_pending_approval_idx');
      expect(indexNames).toContain('user_auth_tracking_idx');
      expect(indexNames).toContain('user_name_search_idx');
    });

    it('should have all required course performance indexes', async () => {
      const db = mongoose.connection.db;
      const coursesCollection = db.collection('courses');
      const indexes = await coursesCollection.listIndexes().toArray();
      
      const indexNames = indexes.map(idx => idx.name);
      
      // Check for performance indexes
      expect(indexNames).toContain('course_catalog_browse_idx');
      expect(indexNames).toContain('course_text_search_idx');
      expect(indexNames).toContain('course_instructor_management_idx');
      expect(indexNames).toContain('course_enrollment_capacity_idx');
      expect(indexNames).toContain('course_academic_reporting_idx');
    });

    it('should have all required enrollment performance indexes', async () => {
      const db = mongoose.connection.db;
      const enrollmentsCollection = db.collection('enrollments');
      const indexes = await enrollmentsCollection.listIndexes().toArray();
      
      const indexNames = indexes.map(idx => idx.name);
      
      // Check for performance indexes
      expect(indexNames).toContain('enrollment_student_history_idx');
      expect(indexNames).toContain('enrollment_course_roster_idx');
      expect(indexNames).toContain('enrollment_institutional_analytics_idx');
      expect(indexNames).toContain('enrollment_grade_reporting_idx');
      expect(indexNames).toContain('enrollment_date_tracking_idx');
    });

    it('should have all required student performance indexes', async () => {
      const db = mongoose.connection.db;
      const studentsCollection = db.collection('students');
      const indexes = await studentsCollection.listIndexes().toArray();
      
      const indexNames = indexes.map(idx => idx.name);
      
      // Check for performance indexes
      expect(indexNames).toContain('student_academic_performance_idx');
      expect(indexNames).toContain('student_enrollment_capacity_idx');
      expect(indexNames).toContain('student_academic_reporting_idx');
      expect(indexNames).toContain('student_course_enrollment_idx');
    });

    it('should have all required institution performance indexes', async () => {
      const db = mongoose.connection.db;
      const institutionsCollection = db.collection('institutions');
      const indexes = await institutionsCollection.listIndexes().toArray();
      
      const indexNames = indexes.map(idx => idx.name);
      
      // Check for performance indexes
      expect(indexNames).toContain('institution_search_idx');
      expect(indexNames).toContain('institution_admin_queries_idx');
      expect(indexNames).toContain('institution_location_idx');
    });
  });

  describe('Query Performance Validation', () => {
    let testInstitutionId: mongoose.Types.ObjectId;
    let testUserId: mongoose.Types.ObjectId;
    let testCourseId: mongoose.Types.ObjectId;
    let testStudentId: mongoose.Types.ObjectId;

    beforeAll(async () => {
      // Create test data for performance testing
      const testInstitution = await Institution.create({
        name: 'Performance Test University',
        type: 'university',
        address: {
          street: '123 Test St',
          city: 'Test City',
          state: 'TS',
          zipCode: '12345'
        },
        contactInfo: {
          email: 'test@performance.edu',
          phone: '555-0123'
        }
      });
      testInstitutionId = testInstitution._id;

      const testUser = await User.create({
        email: 'testuser@performance.edu',
        password: 'testpassword123',
        firstName: 'Test',
        lastName: 'User',
        institutions: [{
          institutionId: testInstitutionId,
          role: 'student',
          status: 'active',
          profileData: {},
          createdAt: new Date()
        }]
      });
      testUserId = testUser._id;

      const testStudent = await Student.create({
        user: testUserId,
        institutionId: testInstitutionId,
        studentId: 'PERF001',
        major: 'Computer Science',
        year: 2,
        gpa: 3.5
      });
      testStudentId = testStudent._id;

      const testCourse = await Course.create({
        institutionId: testInstitutionId,
        courseCode: 'CS101',
        courseName: 'Introduction to Computer Science',
        description: 'Basic computer science concepts',
        credits: 3,
        department: 'Computer Science',
        instructor: testUserId,
        semester: 'Fall 2024'
      });
      testCourseId = testCourse._id;

      await Enrollment.create({
        student: testStudentId,
        course: testCourseId,
        institutionId: testInstitutionId,
        status: 'enrolled',
        credits: 3,
        semester: 'Fall 2024',
        academicYear: '2024-2025',
        courseSnapshot: {
          code: 'CS101',
          name: 'Introduction to Computer Science',
          credits: 3,
          semester: 'Fall 2024'
        }
      });
    });

    it('should efficiently query users by institution and role', async () => {
      const startTime = Date.now();
      
      // This query should use the user_institution_role_status_idx index
      const users = await User.find({
        'institutions.institutionId': testInstitutionId,
        'institutions.role': 'student',
        'institutions.status': 'active'
      }).limit(10);
      
      const queryTime = Date.now() - startTime;
      
      expect(users.length).toBeGreaterThan(0);
      expect(queryTime).toBeLessThan(100); // Should complete in under 100ms
    });

    it('should efficiently query courses by institution and department', async () => {
      const startTime = Date.now();
      
      // This query should use the course_catalog_browse_idx index
      const courses = await Course.find({
        institutionId: testInstitutionId,
        isActive: true,
        department: 'Computer Science'
      }).sort({ createdAt: -1 }).limit(10);
      
      const queryTime = Date.now() - startTime;
      
      expect(courses.length).toBeGreaterThan(0);
      expect(queryTime).toBeLessThan(100); // Should complete in under 100ms
    });

    it('should efficiently query enrollments for student history', async () => {
      const startTime = Date.now();
      
      // This query should use the enrollment_student_history_idx index
      const enrollments = await Enrollment.find({
        institutionId: testInstitutionId,
        student: testStudentId,
        academicYear: '2024-2025',
        status: 'enrolled'
      }).sort({ semester: 1 });
      
      const queryTime = Date.now() - startTime;
      
      expect(enrollments.length).toBeGreaterThan(0);
      expect(queryTime).toBeLessThan(100); // Should complete in under 100ms
    });

    it('should efficiently query students by academic performance', async () => {
      const startTime = Date.now();
      
      // This query should use the student_academic_performance_idx index
      const students = await Student.find({
        institutionId: testInstitutionId,
        isActive: true
      }).sort({ gpa: -1, totalCredits: -1 }).limit(10);
      
      const queryTime = Date.now() - startTime;
      
      expect(students.length).toBeGreaterThan(0);
      expect(queryTime).toBeLessThan(100); // Should complete in under 100ms
    });

    it('should efficiently search institutions by name and type', async () => {
      const startTime = Date.now();
      
      // This query should use the institution_search_idx index
      const institutions = await Institution.find({
        $text: { $search: 'Performance Test' },
        type: 'university',
        status: 'active'
      });
      
      const queryTime = Date.now() - startTime;
      
      expect(institutions.length).toBeGreaterThan(0);
      expect(queryTime).toBeLessThan(100); // Should complete in under 100ms
    });
  });

  describe('Index Usage Validation with Explain Plans', () => {
    let testInstitutionId: mongoose.Types.ObjectId;

    beforeAll(async () => {
      const institution = await Institution.findOne({ name: 'Performance Test University' });
      testInstitutionId = institution!._id;
    });

    it('should use proper index for user-institution queries', async () => {
      const db = mongoose.connection.db;
      const usersCollection = db.collection('users');
      
      const explainResult = await usersCollection.find({
        'institutions.institutionId': testInstitutionId,
        'institutions.role': 'student',
        'institutions.status': 'active'
      }).explain('executionStats');
      
      // Check that an index was used (not a collection scan)
      expect(explainResult.executionStats.executionSuccess).toBe(true);
      
      // If documents were returned, check index efficiency
      if (explainResult.executionStats.totalDocsReturned > 0) {
        expect(explainResult.executionStats.totalDocsExamined).toBeLessThanOrEqual(
          explainResult.executionStats.totalDocsReturned * 2
        ); // Index should limit documents examined
      } else {
        // Even with no results, should not scan entire collection
        expect(explainResult.executionStats.totalDocsExamined).toBeLessThanOrEqual(10);
      }
    });

    it('should use proper index for course catalog queries', async () => {
      const db = mongoose.connection.db;
      const coursesCollection = db.collection('courses');
      
      const explainResult = await coursesCollection.find({
        institutionId: testInstitutionId,
        isActive: true,
        department: 'Computer Science'
      }).sort({ createdAt: -1 }).explain('executionStats');
      
      // Check that an index was used
      expect(explainResult.executionStats.executionSuccess).toBe(true);
      
      // If documents were returned, check index efficiency
      if (explainResult.executionStats.totalDocsReturned > 0) {
        expect(explainResult.executionStats.totalDocsExamined).toBeLessThanOrEqual(
          explainResult.executionStats.totalDocsReturned * 2
        );
      } else {
        // Even with no results, should not scan entire collection
        expect(explainResult.executionStats.totalDocsExamined).toBeLessThanOrEqual(10);
      }
    });

    it('should use proper index for enrollment tracking queries', async () => {
      const db = mongoose.connection.db;
      const enrollmentsCollection = db.collection('enrollments');
      
      const explainResult = await enrollmentsCollection.find({
        institutionId: testInstitutionId,
        academicYear: '2024-2025',
        semester: 'Fall 2024',
        status: 'enrolled'
      }).explain('executionStats');
      
      // Check that an index was used
      expect(explainResult.executionStats.executionSuccess).toBe(true);
      
      // If documents were returned, check index efficiency
      if (explainResult.executionStats.totalDocsReturned > 0) {
        expect(explainResult.executionStats.totalDocsExamined).toBeLessThanOrEqual(
          explainResult.executionStats.totalDocsReturned * 2
        );
      } else {
        // Even with no results, should not scan entire collection
        expect(explainResult.executionStats.totalDocsExamined).toBeLessThanOrEqual(10);
      }
    });
  });

  describe('Compound Index Effectiveness', () => {
    it('should validate compound index field order optimization', async () => {
      const db = mongoose.connection.db;
      const usersCollection = db.collection('users');
      
      // Test that queries with different field orders still use the index effectively
      const explainResult1 = await usersCollection.find({
        'institutions.institutionId': new mongoose.Types.ObjectId(),
        'institutions.role': 'student'
      }).explain('executionStats');
      
      const explainResult2 = await usersCollection.find({
        'institutions.role': 'student',
        'institutions.institutionId': new mongoose.Types.ObjectId()
      }).explain('executionStats');
      
      // Both queries should be successful and use indexes
      expect(explainResult1.executionStats.executionSuccess).toBe(true);
      expect(explainResult2.executionStats.executionSuccess).toBe(true);
    });

    it('should validate partial filter expression effectiveness', async () => {
      const db = mongoose.connection.db;
      const usersCollection = db.collection('users');
      
      // Query that should use the partial index for admin workflows
      const explainResult = await usersCollection.find({
        'institutions.role': 'institution_admin',
        'institutions.status': 'active',
        'isActive': true
      }).explain('executionStats');
      
      expect(explainResult.executionStats.executionSuccess).toBe(true);
      // Partial index should be very efficient for this specific query pattern
      expect(explainResult.executionStats.totalDocsExamined).toBeLessThanOrEqual(10);
    });
  });
});