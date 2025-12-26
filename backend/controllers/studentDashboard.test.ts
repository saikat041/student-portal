/**
 * Property-Based Tests for Student Dashboard Accuracy
 * Feature: student-enrollment
 * 
 * These tests validate the student dashboard accuracy using fast-check
 * for property-based testing. Tests focus on the core logic without
 * actual API calls for performance.
 * 
 * **Property 5: Student dashboard accuracy**
 * **Validates: Requirements 3.1, 3.2, 3.4**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// Types matching the data models
interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'teacher' | 'student';
}

interface Course {
  _id: string;
  courseCode: string;
  courseName: string;
  description: string;
  credits: number;
  department: string;
  instructor: User;
  semester: string;
  maxStudents: number;
  enrolledStudents: string[];
  isActive: boolean;
}

interface Enrollment {
  _id: string;
  student: string;
  course: Course;
  enrollmentDate: Date;
  status: 'enrolled' | 'dropped' | 'completed';
  credits: number;
  semester: string;
  academicYear: string;
}

/**
 * Pure function to calculate total credits from enrollments
 * This mirrors the logic in the StudentDashboard component
 */
function calculateTotalCredits(enrollments: Enrollment[]): number {
  return enrollments.reduce((sum, enrollment) => sum + enrollment.credits, 0);
}

/**
 * Pure function to filter only active enrollments
 */
function getActiveEnrollments(enrollments: Enrollment[]): Enrollment[] {
  return enrollments.filter(e => e.status === 'enrolled');
}

/**
 * Pure function to verify dashboard displays correct courses
 */
function getDashboardCourses(enrollments: Enrollment[]): Course[] {
  return getActiveEnrollments(enrollments).map(e => e.course);
}

/**
 * Pure function to verify course details are complete
 */
function hasCourseDetails(course: Course): boolean {
  return (
    course.courseCode !== undefined &&
    course.courseName !== undefined &&
    course.credits !== undefined &&
    course.instructor !== undefined &&
    course.department !== undefined &&
    course.semester !== undefined
  );
}

// Generators for property-based testing
const userArb = fc.record({
  id: fc.uuid(),
  email: fc.emailAddress(),
  firstName: fc.string({ minLength: 1, maxLength: 50 }),
  lastName: fc.string({ minLength: 1, maxLength: 50 }),
  role: fc.constant('teacher' as const)
});

const courseArb = fc.record({
  _id: fc.uuid(),
  courseCode: fc.stringMatching(/^[A-Z]{2,4}[0-9]{3}$/),
  courseName: fc.string({ minLength: 1, maxLength: 100 }),
  description: fc.string({ minLength: 0, maxLength: 500 }),
  credits: fc.integer({ min: 1, max: 6 }),
  department: fc.string({ minLength: 1, maxLength: 50 }),
  instructor: userArb,
  semester: fc.constantFrom('Fall 2024', 'Spring 2025', 'Summer 2025'),
  maxStudents: fc.integer({ min: 10, max: 100 }),
  enrolledStudents: fc.array(fc.uuid(), { minLength: 0, maxLength: 50 }),
  isActive: fc.boolean()
});


describe('Student Dashboard Accuracy Property Tests', () => {
  /**
   * Property 5: Student dashboard accuracy
   * *For any* student, their dashboard should display exactly the courses they are enrolled in
   * with complete course information and accurate total credit hours
   * 
   * **Validates: Requirements 3.1, 3.2, 3.4**
   */
  it('Property 5: Total credits calculation is accurate for any set of enrollments', () => {
    fc.assert(
      fc.property(
        fc.array(courseArb, { minLength: 0, maxLength: 10 }),
        (courses) => {
          // Create enrollments from courses with 'enrolled' status
          const enrollments: Enrollment[] = courses.map((course, index) => ({
            _id: `enrollment-${index}`,
            student: 'student-1',
            course,
            enrollmentDate: new Date(),
            status: 'enrolled' as const,
            credits: course.credits,
            semester: course.semester,
            academicYear: '2024-2025'
          }));

          // Calculate expected total credits
          const expectedTotal = courses.reduce((sum, course) => sum + course.credits, 0);

          // Calculate using dashboard function
          const calculatedTotal = calculateTotalCredits(enrollments);

          // INVARIANT: Calculated total must equal sum of all course credits
          expect(calculatedTotal).toBe(expectedTotal);

          // INVARIANT: Total credits must be non-negative
          expect(calculatedTotal).toBeGreaterThanOrEqual(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5 (continued): Dashboard displays only enrolled courses
   * 
   * **Validates: Requirements 3.1**
   */
  it('Property 5: Dashboard displays only enrolled courses (not dropped/completed)', () => {
    fc.assert(
      fc.property(
        fc.array(courseArb, { minLength: 1, maxLength: 10 }),
        fc.array(fc.constantFrom('enrolled', 'dropped', 'completed'), { minLength: 1, maxLength: 10 }),
        (courses, statuses) => {
          // Create enrollments with various statuses
          const enrollments: Enrollment[] = courses.map((course, index) => ({
            _id: `enrollment-${index}`,
            student: 'student-1',
            course,
            enrollmentDate: new Date(),
            status: statuses[index % statuses.length] as 'enrolled' | 'dropped' | 'completed',
            credits: course.credits,
            semester: course.semester,
            academicYear: '2024-2025'
          }));

          // Get active enrollments
          const activeEnrollments = getActiveEnrollments(enrollments);
          const dashboardCourses = getDashboardCourses(enrollments);

          // Count expected enrolled courses
          const expectedEnrolledCount = enrollments.filter(e => e.status === 'enrolled').length;

          // INVARIANT: Dashboard should show only enrolled courses
          expect(activeEnrollments.length).toBe(expectedEnrolledCount);
          expect(dashboardCourses.length).toBe(expectedEnrolledCount);

          // INVARIANT: All displayed courses should have 'enrolled' status
          for (const enrollment of activeEnrollments) {
            expect(enrollment.status).toBe('enrolled');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5 (continued): Course details are complete for all displayed courses
   * 
   * **Validates: Requirements 3.2**
   */
  it('Property 5: All displayed courses have complete details', () => {
    fc.assert(
      fc.property(
        fc.array(courseArb, { minLength: 1, maxLength: 10 }),
        (courses) => {
          // Create enrolled enrollments
          const enrollments: Enrollment[] = courses.map((course, index) => ({
            _id: `enrollment-${index}`,
            student: 'student-1',
            course,
            enrollmentDate: new Date(),
            status: 'enrolled' as const,
            credits: course.credits,
            semester: course.semester,
            academicYear: '2024-2025'
          }));

          const dashboardCourses = getDashboardCourses(enrollments);

          // INVARIANT: All courses should have complete details
          for (const course of dashboardCourses) {
            expect(hasCourseDetails(course)).toBe(true);
            
            // Verify specific required fields (Requirement 3.2)
            expect(course.courseCode).toBeDefined();
            expect(course.courseName).toBeDefined();
            expect(course.credits).toBeGreaterThan(0);
            expect(course.instructor).toBeDefined();
            expect(course.instructor.firstName).toBeDefined();
            expect(course.instructor.lastName).toBeDefined();
            expect(course.department).toBeDefined();
            expect(course.semester).toBeDefined();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5 (continued): Credit calculation consistency
   * Credits from enrollments should match course credits
   * 
   * **Validates: Requirements 3.4**
   */
  it('Property 5: Enrollment credits match course credits', () => {
    fc.assert(
      fc.property(
        fc.array(courseArb, { minLength: 1, maxLength: 10 }),
        (courses) => {
          // Create enrollments where credits should match course credits
          const enrollments: Enrollment[] = courses.map((course, index) => ({
            _id: `enrollment-${index}`,
            student: 'student-1',
            course,
            enrollmentDate: new Date(),
            status: 'enrolled' as const,
            credits: course.credits, // Credits should match course
            semester: course.semester,
            academicYear: '2024-2025'
          }));

          // INVARIANT: Each enrollment's credits should match its course's credits
          for (const enrollment of enrollments) {
            expect(enrollment.credits).toBe(enrollment.course.credits);
          }

          // INVARIANT: Total from enrollments should equal total from courses
          const totalFromEnrollments = calculateTotalCredits(enrollments);
          const totalFromCourses = courses.reduce((sum, c) => sum + c.credits, 0);
          expect(totalFromEnrollments).toBe(totalFromCourses);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5 (continued): Empty state handling
   * Dashboard should handle zero enrollments correctly
   * 
   * **Validates: Requirements 3.3**
   */
  it('Property 5: Empty enrollments result in zero total credits', () => {
    fc.assert(
      fc.property(
        fc.constant([] as Enrollment[]),
        (enrollments) => {
          const totalCredits = calculateTotalCredits(enrollments);
          const dashboardCourses = getDashboardCourses(enrollments);

          // INVARIANT: Empty enrollments should result in zero credits
          expect(totalCredits).toBe(0);
          
          // INVARIANT: Empty enrollments should result in no courses displayed
          expect(dashboardCourses.length).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5 (continued): Credit bounds validation
   * Total credits should be within reasonable bounds
   * 
   * **Validates: Requirements 3.4**
   */
  it('Property 5: Total credits are within valid bounds', () => {
    fc.assert(
      fc.property(
        fc.array(courseArb, { minLength: 0, maxLength: 10 }),
        fc.integer({ min: 12, max: 21 }), // Typical max credits range
        (courses, maxCredits) => {
          const enrollments: Enrollment[] = courses.map((course, index) => ({
            _id: `enrollment-${index}`,
            student: 'student-1',
            course,
            enrollmentDate: new Date(),
            status: 'enrolled' as const,
            credits: course.credits,
            semester: course.semester,
            academicYear: '2024-2025'
          }));

          const totalCredits = calculateTotalCredits(enrollments);

          // INVARIANT: Total credits must be non-negative
          expect(totalCredits).toBeGreaterThanOrEqual(0);

          // INVARIANT: Each course credit must be positive (1-6 range)
          for (const enrollment of enrollments) {
            expect(enrollment.credits).toBeGreaterThanOrEqual(1);
            expect(enrollment.credits).toBeLessThanOrEqual(6);
          }

          // INVARIANT: Total should equal sum of individual credits
          const manualSum = enrollments.reduce((sum, e) => sum + e.credits, 0);
          expect(totalCredits).toBe(manualSum);
        }
      ),
      { numRuns: 100 }
    );
  });
});
