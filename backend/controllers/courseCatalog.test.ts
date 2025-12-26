/**
 * Property-Based Tests for Course Filtering and Search Accuracy
 * Feature: student-enrollment
 * 
 * These tests validate the course filtering and search accuracy using fast-check
 * for property-based testing. Tests focus on the pure filtering logic.
 * 
 * **Property 2: Course filtering and search accuracy**
 * **Validates: Requirements 1.4, 1.5**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// Types matching the frontend types
interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'teacher' | 'student';
}

interface Student {
  _id: string;
  name: string;
  email: string;
  studentId: string;
  course: string;
  year: number;
}

interface CourseWithInstructor {
  _id: string;
  courseCode: string;
  courseName: string;
  description: string;
  credits: number;
  department: string;
  instructor: User;
  semester: string;
  maxStudents: number;
  enrolledStudents: Student[];
  isActive: boolean;
  enrolledCount: number;
  availableSpots: number;
  createdAt: Date;
  updatedAt: Date;
}

interface CourseFilters {
  department: string;
  semester: string;
  searchQuery: string;
}

/**
 * Pure function that filters courses based on department, semester, and search query
 * This mirrors the logic in the CourseCatalog component
 * Requirements: 1.4, 1.5
 */
function filterCourses(
  courses: CourseWithInstructor[],
  filters: CourseFilters
): CourseWithInstructor[] {
  return courses.filter(course => {
    // Filter by department (Requirement 1.4)
    if (filters.department && course.department !== filters.department) {
      return false;
    }

    // Filter by semester (Requirement 1.4)
    if (filters.semester && course.semester !== filters.semester) {
      return false;
    }

    // Search by course code, name, or description (Requirement 1.5)
    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      const matchesCode = course.courseCode.toLowerCase().includes(query);
      const matchesName = course.courseName.toLowerCase().includes(query);
      const matchesDescription = course.description.toLowerCase().includes(query);
      
      if (!matchesCode && !matchesName && !matchesDescription) {
        return false;
      }
    }

    return true;
  });
}

// Generators for property-based testing
const userArb = fc.record({
  id: fc.uuid(),
  email: fc.emailAddress(),
  firstName: fc.string({ minLength: 1, maxLength: 50 }),
  lastName: fc.string({ minLength: 1, maxLength: 50 }),
  role: fc.constant('teacher' as const)
});

const departmentArb = fc.constantFrom(
  'Computer Science',
  'Mathematics',
  'Physics',
  'Chemistry',
  'Biology',
  'Engineering',
  'Business',
  'Arts'
);

const semesterArb = fc.constantFrom(
  'Fall 2024',
  'Spring 2025',
  'Summer 2025',
  'Fall 2025'
);

const courseCodeArb = fc.stringMatching(/^[A-Z]{2,4}[0-9]{3}$/);

const courseArb: fc.Arbitrary<CourseWithInstructor> = fc.record({
  _id: fc.uuid(),
  courseCode: courseCodeArb,
  courseName: fc.string({ minLength: 1, maxLength: 100 }),
  description: fc.string({ minLength: 0, maxLength: 500 }),
  credits: fc.integer({ min: 1, max: 6 }),
  department: departmentArb,
  instructor: userArb,
  semester: semesterArb,
  maxStudents: fc.integer({ min: 10, max: 100 }),
  enrolledStudents: fc.constant([] as Student[]),
  isActive: fc.constant(true),
  enrolledCount: fc.integer({ min: 0, max: 50 }),
  availableSpots: fc.integer({ min: 0, max: 50 }),
  createdAt: fc.date(),
  updatedAt: fc.date()
});

describe('Course Filtering and Search Accuracy Property Tests', () => {
  /**
   * Property 2: Course filtering and search accuracy
   * *For any* filter criteria or search term, the course catalog should return
   * only courses that match the specified criteria in the appropriate fields
   * 
   * **Validates: Requirements 1.4, 1.5**
   */
  it('Property 2: Department filter returns only courses from that department', () => {
    fc.assert(
      fc.property(
        fc.array(courseArb, { minLength: 1, maxLength: 20 }),
        departmentArb,
        (courses, targetDepartment) => {
          const filters: CourseFilters = {
            department: targetDepartment,
            semester: '',
            searchQuery: ''
          };

          const filteredCourses = filterCourses(courses, filters);

          // INVARIANT: All filtered courses must be from the target department
          for (const course of filteredCourses) {
            expect(course.department).toBe(targetDepartment);
          }

          // INVARIANT: All courses from target department should be included
          const expectedCourses = courses.filter(c => c.department === targetDepartment);
          expect(filteredCourses.length).toBe(expectedCourses.length);

          // INVARIANT: Filtered count should be <= total count
          expect(filteredCourses.length).toBeLessThanOrEqual(courses.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2 (continued): Semester filter returns only courses from that semester
   * 
   * **Validates: Requirements 1.4**
   */
  it('Property 2: Semester filter returns only courses from that semester', () => {
    fc.assert(
      fc.property(
        fc.array(courseArb, { minLength: 1, maxLength: 20 }),
        semesterArb,
        (courses, targetSemester) => {
          const filters: CourseFilters = {
            department: '',
            semester: targetSemester,
            searchQuery: ''
          };

          const filteredCourses = filterCourses(courses, filters);

          // INVARIANT: All filtered courses must be from the target semester
          for (const course of filteredCourses) {
            expect(course.semester).toBe(targetSemester);
          }

          // INVARIANT: All courses from target semester should be included
          const expectedCourses = courses.filter(c => c.semester === targetSemester);
          expect(filteredCourses.length).toBe(expectedCourses.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2 (continued): Combined department and semester filter
   * 
   * **Validates: Requirements 1.4**
   */
  it('Property 2: Combined department and semester filter works correctly', () => {
    fc.assert(
      fc.property(
        fc.array(courseArb, { minLength: 1, maxLength: 20 }),
        departmentArb,
        semesterArb,
        (courses, targetDepartment, targetSemester) => {
          const filters: CourseFilters = {
            department: targetDepartment,
            semester: targetSemester,
            searchQuery: ''
          };

          const filteredCourses = filterCourses(courses, filters);

          // INVARIANT: All filtered courses must match both department AND semester
          for (const course of filteredCourses) {
            expect(course.department).toBe(targetDepartment);
            expect(course.semester).toBe(targetSemester);
          }

          // INVARIANT: Result should be intersection of both filters
          const expectedCourses = courses.filter(
            c => c.department === targetDepartment && c.semester === targetSemester
          );
          expect(filteredCourses.length).toBe(expectedCourses.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2 (continued): Search by course code
   * 
   * **Validates: Requirements 1.5**
   */
  it('Property 2: Search query matches course code (case-insensitive)', () => {
    fc.assert(
      fc.property(
        fc.array(courseArb, { minLength: 1, maxLength: 20 }),
        (courses) => {
          // Pick a course code from the generated courses to search for
          if (courses.length === 0) return;
          
          const targetCourse = courses[0];
          const searchQuery = targetCourse.courseCode.substring(0, 3); // Search partial code

          const filters: CourseFilters = {
            department: '',
            semester: '',
            searchQuery: searchQuery.toLowerCase() // Test case-insensitivity
          };

          const filteredCourses = filterCourses(courses, filters);

          // INVARIANT: All filtered courses must contain the search query in code, name, or description
          for (const course of filteredCourses) {
            const matchesCode = course.courseCode.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesName = course.courseName.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesDescription = course.description.toLowerCase().includes(searchQuery.toLowerCase());
            
            expect(matchesCode || matchesName || matchesDescription).toBe(true);
          }

          // INVARIANT: The target course should be in results (since we searched for its code)
          const targetInResults = filteredCourses.some(c => c._id === targetCourse._id);
          expect(targetInResults).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2 (continued): Search by course name
   * 
   * **Validates: Requirements 1.5**
   */
  it('Property 2: Search query matches course name (case-insensitive)', () => {
    fc.assert(
      fc.property(
        fc.array(courseArb, { minLength: 1, maxLength: 20 }),
        (courses) => {
          if (courses.length === 0) return;
          
          // Find a course with a non-empty name
          const targetCourse = courses.find(c => c.courseName.length >= 3);
          if (!targetCourse) return;

          const searchQuery = targetCourse.courseName.substring(0, 3);

          const filters: CourseFilters = {
            department: '',
            semester: '',
            searchQuery: searchQuery.toUpperCase() // Test case-insensitivity
          };

          const filteredCourses = filterCourses(courses, filters);

          // INVARIANT: All filtered courses must contain the search query
          for (const course of filteredCourses) {
            const matchesCode = course.courseCode.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesName = course.courseName.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesDescription = course.description.toLowerCase().includes(searchQuery.toLowerCase());
            
            expect(matchesCode || matchesName || matchesDescription).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2 (continued): Search by description
   * 
   * **Validates: Requirements 1.5**
   */
  it('Property 2: Search query matches course description (case-insensitive)', () => {
    fc.assert(
      fc.property(
        fc.array(courseArb, { minLength: 1, maxLength: 20 }),
        (courses) => {
          if (courses.length === 0) return;
          
          // Find a course with a non-empty description
          const targetCourse = courses.find(c => c.description.length >= 3);
          if (!targetCourse) return;

          const searchQuery = targetCourse.description.substring(0, 3);

          const filters: CourseFilters = {
            department: '',
            semester: '',
            searchQuery
          };

          const filteredCourses = filterCourses(courses, filters);

          // INVARIANT: All filtered courses must contain the search query
          for (const course of filteredCourses) {
            const matchesCode = course.courseCode.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesName = course.courseName.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesDescription = course.description.toLowerCase().includes(searchQuery.toLowerCase());
            
            expect(matchesCode || matchesName || matchesDescription).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2 (continued): Empty filters return all courses
   * 
   * **Validates: Requirements 1.4, 1.5**
   */
  it('Property 2: Empty filters return all courses', () => {
    fc.assert(
      fc.property(
        fc.array(courseArb, { minLength: 0, maxLength: 20 }),
        (courses) => {
          const filters: CourseFilters = {
            department: '',
            semester: '',
            searchQuery: ''
          };

          const filteredCourses = filterCourses(courses, filters);

          // INVARIANT: Empty filters should return all courses
          expect(filteredCourses.length).toBe(courses.length);

          // INVARIANT: All original courses should be present
          for (const course of courses) {
            const found = filteredCourses.some(c => c._id === course._id);
            expect(found).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2 (continued): Combined filter and search
   * 
   * **Validates: Requirements 1.4, 1.5**
   */
  it('Property 2: Combined department filter and search query work together', () => {
    fc.assert(
      fc.property(
        fc.array(courseArb, { minLength: 1, maxLength: 20 }),
        departmentArb,
        fc.string({ minLength: 1, maxLength: 5 }),
        (courses, targetDepartment, searchQuery) => {
          const filters: CourseFilters = {
            department: targetDepartment,
            semester: '',
            searchQuery
          };

          const filteredCourses = filterCourses(courses, filters);

          // INVARIANT: All filtered courses must match department AND search query
          for (const course of filteredCourses) {
            // Must match department
            expect(course.department).toBe(targetDepartment);

            // Must match search query in at least one field
            const query = searchQuery.toLowerCase();
            const matchesCode = course.courseCode.toLowerCase().includes(query);
            const matchesName = course.courseName.toLowerCase().includes(query);
            const matchesDescription = course.description.toLowerCase().includes(query);
            
            expect(matchesCode || matchesName || matchesDescription).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2 (continued): Filter is idempotent
   * Applying the same filter twice should give the same result
   * 
   * **Validates: Requirements 1.4, 1.5**
   */
  it('Property 2: Filtering is idempotent', () => {
    fc.assert(
      fc.property(
        fc.array(courseArb, { minLength: 0, maxLength: 20 }),
        departmentArb,
        semesterArb,
        fc.string({ minLength: 0, maxLength: 10 }),
        (courses, department, semester, searchQuery) => {
          const filters: CourseFilters = {
            department,
            semester,
            searchQuery
          };

          const firstFilter = filterCourses(courses, filters);
          const secondFilter = filterCourses(firstFilter, filters);

          // INVARIANT: Applying filter twice should give same result
          expect(secondFilter.length).toBe(firstFilter.length);
          
          for (let i = 0; i < firstFilter.length; i++) {
            expect(secondFilter[i]._id).toBe(firstFilter[i]._id);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2 (continued): Non-matching search returns empty or subset
   * 
   * **Validates: Requirements 1.5**
   */
  it('Property 2: Non-matching search query returns empty result', () => {
    fc.assert(
      fc.property(
        fc.array(courseArb, { minLength: 0, maxLength: 20 }),
        (courses) => {
          // Use a search query that won't match any generated course
          const impossibleQuery = 'ZZZZZZZZZZZZZZZZZZZ999999999';

          const filters: CourseFilters = {
            department: '',
            semester: '',
            searchQuery: impossibleQuery
          };

          const filteredCourses = filterCourses(courses, filters);

          // INVARIANT: Impossible query should return no results
          expect(filteredCourses.length).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});
