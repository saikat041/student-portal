/**
 * Property-Based Tests for Enrollment Statistics Accuracy
 * Feature: student-enrollment
 * 
 * These tests validate the enrollment statistics accuracy using fast-check
 * for property-based testing. Tests focus on the pure logic for calculating
 * and displaying enrollment statistics.
 * 
 * **Property 9: Enrollment statistics accuracy**
 * **Validates: Requirements 7.1, 7.2**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// Types matching the data models
interface CourseState {
  _id: string;
  courseCode: string;
  courseName: string;
  maxStudents: number;
  enrolledStudents: string[];
}

interface EnrollmentStatistics {
  enrolledCount: number;
  maxCapacity: number;
  availableSpots: number;
  enrollmentPercentage: number;
  isFull: boolean;
  hasLimitedAvailability: boolean;
}

/**
 * Pure function to calculate enrollment statistics for a course
 * This mirrors the logic in the CourseCatalog and CourseManagement components
 * Requirements: 7.1
 */
function calculateEnrollmentStatistics(course: CourseState): EnrollmentStatistics {
  const enrolledCount = course.enrolledStudents.length;
  const availableSpots = Math.max(0, course.maxStudents - enrolledCount);
  const enrollmentPercentage = course.maxStudents > 0 
    ? (enrolledCount / course.maxStudents) * 100 
    : 0;
  const isFull = availableSpots === 0;
  const hasLimitedAvailability = availableSpots > 0 && availableSpots < 5;

  return {
    enrolledCount,
    maxCapacity: course.maxStudents,
    availableSpots,
    enrollmentPercentage,
    isFull,
    hasLimitedAvailability
  };
}

/**
 * Pure function to get availability indicator type
 * Requirements: 7.2
 */
function getAvailabilityIndicator(stats: EnrollmentStatistics): 'full' | 'limited' | 'available' {
  if (stats.isFull) return 'full';
  if (stats.hasLimitedAvailability) return 'limited';
  return 'available';
}

// Generators for property-based testing
const courseArb = fc.record({
  _id: fc.uuid(),
  courseCode: fc.stringMatching(/^[A-Z]{2,4}[0-9]{3}$/),
  courseName: fc.string({ minLength: 1, maxLength: 100 }),
  maxStudents: fc.integer({ min: 1, max: 100 }),
  enrolledStudents: fc.array(fc.uuid(), { minLength: 0, maxLength: 150 })
});

// Generator for course with specific enrollment ratio
const courseWithEnrollmentRatioArb = (minRatio: number, maxRatio: number) =>
  fc.integer({ min: 1, max: 100 }).chain(maxStudents => {
    const minEnrolled = Math.floor(maxStudents * minRatio);
    const maxEnrolled = Math.min(Math.ceil(maxStudents * maxRatio), maxStudents + 50);
    return fc.record({
      _id: fc.uuid(),
      courseCode: fc.stringMatching(/^[A-Z]{2,4}[0-9]{3}$/),
      courseName: fc.string({ minLength: 1, maxLength: 100 }),
      maxStudents: fc.constant(maxStudents),
      enrolledStudents: fc.array(fc.uuid(), { minLength: minEnrolled, maxLength: maxEnrolled })
    });
  });

describe('Enrollment Statistics Accuracy Property Tests', () => {
  /**
   * Property 9: Enrollment statistics accuracy
   * *For any* course, the displayed enrollment numbers, capacity information,
   * and availability indicators should accurately reflect the current enrollment state
   * 
   * **Validates: Requirements 7.1, 7.2**
   */
  it('Property 9: Enrollment count and available spots are mathematically consistent', () => {
    fc.assert(
      fc.property(
        courseArb,
        (course) => {
          const stats = calculateEnrollmentStatistics(course);

          // INVARIANT: enrolledCount + availableSpots = maxCapacity (when not over-enrolled)
          if (course.enrolledStudents.length <= course.maxStudents) {
            expect(stats.enrolledCount + stats.availableSpots).toBe(stats.maxCapacity);
          }

          // INVARIANT: enrolledCount must equal actual enrolled students count
          expect(stats.enrolledCount).toBe(course.enrolledStudents.length);

          // INVARIANT: maxCapacity must equal course maxStudents
          expect(stats.maxCapacity).toBe(course.maxStudents);

          // INVARIANT: availableSpots must be non-negative
          expect(stats.availableSpots).toBeGreaterThanOrEqual(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 9 (continued): Enrollment percentage is accurate
   * 
   * **Validates: Requirements 7.1**
   */
  it('Property 9: Enrollment percentage accurately reflects enrollment ratio', () => {
    fc.assert(
      fc.property(
        courseArb,
        (course) => {
          const stats = calculateEnrollmentStatistics(course);

          // Calculate expected percentage
          const expectedPercentage = course.maxStudents > 0
            ? (course.enrolledStudents.length / course.maxStudents) * 100
            : 0;

          // INVARIANT: Enrollment percentage must match calculated value
          expect(stats.enrollmentPercentage).toBeCloseTo(expectedPercentage, 5);

          // INVARIANT: Percentage must be non-negative
          expect(stats.enrollmentPercentage).toBeGreaterThanOrEqual(0);

          // INVARIANT: For courses at or under capacity, percentage should be <= 100
          if (course.enrolledStudents.length <= course.maxStudents) {
            expect(stats.enrollmentPercentage).toBeLessThanOrEqual(100);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 9 (continued): Full course indicator is accurate
   * 
   * **Validates: Requirements 7.1**
   */
  it('Property 9: Course full indicator is accurate when at capacity', () => {
    fc.assert(
      fc.property(
        courseArb,
        (course) => {
          const stats = calculateEnrollmentStatistics(course);

          // INVARIANT: isFull should be true if and only if availableSpots is 0
          expect(stats.isFull).toBe(stats.availableSpots === 0);

          // INVARIANT: isFull should be true when enrolled >= maxStudents
          const shouldBeFull = course.enrolledStudents.length >= course.maxStudents;
          expect(stats.isFull).toBe(shouldBeFull);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 9 (continued): Limited availability indicator is accurate
   * 
   * **Validates: Requirements 7.2**
   */
  it('Property 9: Limited availability indicator shows when < 5 spots remain', () => {
    fc.assert(
      fc.property(
        courseArb,
        (course) => {
          const stats = calculateEnrollmentStatistics(course);

          // INVARIANT: hasLimitedAvailability should be true when 0 < availableSpots < 5
          const expectedLimited = stats.availableSpots > 0 && stats.availableSpots < 5;
          expect(stats.hasLimitedAvailability).toBe(expectedLimited);

          // INVARIANT: Cannot be both full and limited availability
          if (stats.isFull) {
            expect(stats.hasLimitedAvailability).toBe(false);
          }

          // INVARIANT: If limited, must have between 1 and 4 spots
          if (stats.hasLimitedAvailability) {
            expect(stats.availableSpots).toBeGreaterThanOrEqual(1);
            expect(stats.availableSpots).toBeLessThanOrEqual(4);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 9 (continued): Availability indicator categories are mutually exclusive
   * 
   * **Validates: Requirements 7.1, 7.2**
   */
  it('Property 9: Availability indicators are mutually exclusive and exhaustive', () => {
    fc.assert(
      fc.property(
        courseArb,
        (course) => {
          const stats = calculateEnrollmentStatistics(course);
          const indicator = getAvailabilityIndicator(stats);

          // INVARIANT: Indicator must be one of the three valid values
          expect(['full', 'limited', 'available']).toContain(indicator);

          // INVARIANT: Indicator must match the statistics
          if (indicator === 'full') {
            expect(stats.isFull).toBe(true);
            expect(stats.hasLimitedAvailability).toBe(false);
            expect(stats.availableSpots).toBe(0);
          } else if (indicator === 'limited') {
            expect(stats.isFull).toBe(false);
            expect(stats.hasLimitedAvailability).toBe(true);
            expect(stats.availableSpots).toBeGreaterThanOrEqual(1);
            expect(stats.availableSpots).toBeLessThanOrEqual(4);
          } else {
            expect(stats.isFull).toBe(false);
            expect(stats.hasLimitedAvailability).toBe(false);
            expect(stats.availableSpots).toBeGreaterThanOrEqual(5);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 9 (continued): Statistics are consistent after enrollment changes
   * 
   * **Validates: Requirements 7.1**
   */
  it('Property 9: Statistics update correctly when enrollment changes', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 50 }),
        fc.array(fc.uuid(), { minLength: 0, maxLength: 60 }),
        fc.uuid(),
        (maxStudents, initialStudents, newStudent) => {
          // Initial course state
          const course: CourseState = {
            _id: 'test-course',
            courseCode: 'CS101',
            courseName: 'Test Course',
            maxStudents,
            enrolledStudents: initialStudents.slice(0, maxStudents - 1) // Leave room for one more
          };

          const statsBefore = calculateEnrollmentStatistics(course);

          // Add a new student (if not already enrolled)
          if (!course.enrolledStudents.includes(newStudent)) {
            const updatedCourse: CourseState = {
              ...course,
              enrolledStudents: [...course.enrolledStudents, newStudent]
            };

            const statsAfter = calculateEnrollmentStatistics(updatedCourse);

            // INVARIANT: Enrolled count should increase by 1
            expect(statsAfter.enrolledCount).toBe(statsBefore.enrolledCount + 1);

            // INVARIANT: Available spots should decrease by 1 (if was > 0)
            if (statsBefore.availableSpots > 0) {
              expect(statsAfter.availableSpots).toBe(statsBefore.availableSpots - 1);
            }

            // INVARIANT: Percentage should increase
            expect(statsAfter.enrollmentPercentage).toBeGreaterThan(statsBefore.enrollmentPercentage);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 9 (continued): Statistics are consistent after drop
   * 
   * **Validates: Requirements 7.1**
   */
  it('Property 9: Statistics update correctly when student drops', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 50 }),
        fc.array(fc.uuid(), { minLength: 1, maxLength: 50 }),
        (maxStudents, students) => {
          const uniqueStudents = [...new Set(students)];
          if (uniqueStudents.length === 0) return;

          // Initial course state with some enrolled students
          const course: CourseState = {
            _id: 'test-course',
            courseCode: 'CS101',
            courseName: 'Test Course',
            maxStudents,
            enrolledStudents: uniqueStudents.slice(0, Math.min(uniqueStudents.length, maxStudents))
          };

          const statsBefore = calculateEnrollmentStatistics(course);

          // Drop a student
          const studentToDrop = course.enrolledStudents[0];
          const updatedCourse: CourseState = {
            ...course,
            enrolledStudents: course.enrolledStudents.filter(s => s !== studentToDrop)
          };

          const statsAfter = calculateEnrollmentStatistics(updatedCourse);

          // INVARIANT: Enrolled count should decrease by 1
          expect(statsAfter.enrolledCount).toBe(statsBefore.enrolledCount - 1);

          // INVARIANT: Available spots should increase by 1
          expect(statsAfter.availableSpots).toBe(statsBefore.availableSpots + 1);

          // INVARIANT: Percentage should decrease
          expect(statsAfter.enrollmentPercentage).toBeLessThan(statsBefore.enrollmentPercentage);

          // INVARIANT: If was full, should no longer be full
          if (statsBefore.isFull) {
            expect(statsAfter.isFull).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 9 (continued): Edge case - empty course
   * 
   * **Validates: Requirements 7.1**
   */
  it('Property 9: Empty course shows correct statistics', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        (maxStudents) => {
          const course: CourseState = {
            _id: 'test-course',
            courseCode: 'CS101',
            courseName: 'Test Course',
            maxStudents,
            enrolledStudents: []
          };

          const stats = calculateEnrollmentStatistics(course);

          // INVARIANT: Empty course should have 0 enrolled
          expect(stats.enrolledCount).toBe(0);

          // INVARIANT: All spots should be available
          expect(stats.availableSpots).toBe(maxStudents);

          // INVARIANT: Percentage should be 0
          expect(stats.enrollmentPercentage).toBe(0);

          // INVARIANT: Should not be full
          expect(stats.isFull).toBe(false);

          // INVARIANT: Should not have limited availability (unless maxStudents < 5)
          if (maxStudents >= 5) {
            expect(stats.hasLimitedAvailability).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 9 (continued): Edge case - course at exact capacity
   * 
   * **Validates: Requirements 7.1**
   */
  it('Property 9: Course at exact capacity shows full indicator', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        (maxStudents) => {
          // Create course at exact capacity
          const enrolledStudents = Array.from({ length: maxStudents }, (_, i) => `student-${i}`);
          
          const course: CourseState = {
            _id: 'test-course',
            courseCode: 'CS101',
            courseName: 'Test Course',
            maxStudents,
            enrolledStudents
          };

          const stats = calculateEnrollmentStatistics(course);

          // INVARIANT: Should be full
          expect(stats.isFull).toBe(true);

          // INVARIANT: No available spots
          expect(stats.availableSpots).toBe(0);

          // INVARIANT: 100% enrollment
          expect(stats.enrollmentPercentage).toBe(100);

          // INVARIANT: Not limited availability (it's full)
          expect(stats.hasLimitedAvailability).toBe(false);

          // INVARIANT: Indicator should be 'full'
          expect(getAvailabilityIndicator(stats)).toBe('full');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 9 (continued): Limited availability boundary test
   * 
   * **Validates: Requirements 7.2**
   */
  it('Property 9: Limited availability boundary at exactly 4 and 5 spots', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 10, max: 50 }),
        fc.constantFrom(4, 5),
        (maxStudents, spotsRemaining) => {
          // Create course with specific spots remaining
          const enrolledCount = maxStudents - spotsRemaining;
          const enrolledStudents = Array.from({ length: enrolledCount }, (_, i) => `student-${i}`);
          
          const course: CourseState = {
            _id: 'test-course',
            courseCode: 'CS101',
            courseName: 'Test Course',
            maxStudents,
            enrolledStudents
          };

          const stats = calculateEnrollmentStatistics(course);

          // INVARIANT: 4 spots = limited, 5 spots = not limited
          if (spotsRemaining === 4) {
            expect(stats.hasLimitedAvailability).toBe(true);
            expect(getAvailabilityIndicator(stats)).toBe('limited');
          } else {
            expect(stats.hasLimitedAvailability).toBe(false);
            expect(getAvailabilityIndicator(stats)).toBe('available');
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
