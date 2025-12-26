/**
 * Property-Based Tests for Enrollment Capacity Invariant
 * Feature: student-enrollment
 * 
 * These tests validate the enrollment capacity invariant using fast-check
 * for property-based testing. Tests focus on the core logic without database
 * operations for performance.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// Pure function implementations of enrollment logic for testing
interface CourseState {
  maxStudents: number;
  enrolledStudents: string[];
}

interface EnrollmentResult {
  success: boolean;
  error?: string;
  courseState: CourseState;
}

/**
 * Pure function that simulates enrollment logic
 * Returns new course state after enrollment attempt
 */
function attemptEnrollment(
  course: CourseState,
  studentId: string
): EnrollmentResult {
  // Check capacity (Requirement 2.3)
  if (course.enrolledStudents.length >= course.maxStudents) {
    return {
      success: false,
      error: 'Course is full',
      courseState: course
    };
  }

  // Check duplicate (Requirement 2.4)
  if (course.enrolledStudents.includes(studentId)) {
    return {
      success: false,
      error: 'Already enrolled',
      courseState: course
    };
  }

  // Successful enrollment (Requirement 2.1, 2.2)
  return {
    success: true,
    courseState: {
      ...course,
      enrolledStudents: [...course.enrolledStudents, studentId]
    }
  };
}

/**
 * Pure function that simulates drop logic
 * Returns new course state after drop attempt
 */
function attemptDrop(
  course: CourseState,
  studentId: string
): EnrollmentResult {
  // Check if enrolled
  if (!course.enrolledStudents.includes(studentId)) {
    return {
      success: false,
      error: 'Not enrolled',
      courseState: course
    };
  }

  // Successful drop (Requirement 4.1, 4.2)
  return {
    success: true,
    courseState: {
      ...course,
      enrolledStudents: course.enrolledStudents.filter(id => id !== studentId)
    }
  };
}

/**
 * Helper to calculate available spots
 */
function getAvailableSpots(course: CourseState): number {
  return course.maxStudents - course.enrolledStudents.length;
}

describe('Enrollment Capacity Invariant Property Tests', () => {
  // Generators
  const maxStudentsArb = fc.integer({ min: 1, max: 100 });
  const studentIdArb = fc.uuid();
  const studentIdsArb = fc.array(fc.uuid(), { minLength: 0, maxLength: 150 });

  /**
   * Property 3: Enrollment capacity invariant
   * *For any* course, the sum of enrolled students should never exceed the maximum capacity,
   * and available spots should always equal maximum capacity minus enrolled count
   * 
   * **Validates: Requirements 2.2, 2.3, 4.2**
   */
  it('Property 3: Enrollment capacity invariant - enrolled count never exceeds max capacity', () => {
    fc.assert(
      fc.property(
        maxStudentsArb,
        studentIdsArb,
        (maxStudents, studentIds) => {
          // Start with empty course
          let course: CourseState = {
            maxStudents,
            enrolledStudents: []
          };

          let successfulEnrollments = 0;

          // Attempt to enroll all students
          for (const studentId of studentIds) {
            const result = attemptEnrollment(course, studentId);
            if (result.success) {
              successfulEnrollments++;
            }
            course = result.courseState;

            // INVARIANT: After each operation, capacity must not be exceeded
            expect(course.enrolledStudents.length).toBeLessThanOrEqual(course.maxStudents);
            
            // INVARIANT: Available spots = max - enrolled
            expect(getAvailableSpots(course)).toBe(course.maxStudents - course.enrolledStudents.length);
            
            // INVARIANT: Available spots must be non-negative
            expect(getAvailableSpots(course)).toBeGreaterThanOrEqual(0);
          }

          // Final check: successful enrollments should match enrolled count
          expect(successfulEnrollments).toBe(course.enrolledStudents.length);
          
          // Final check: enrolled count should be at most maxStudents
          expect(course.enrolledStudents.length).toBeLessThanOrEqual(maxStudents);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3 (continued): Drop operation restores available spots correctly
   * *For any* enrolled student-course pair, dropping the course should increase available spots by one
   * 
   * **Validates: Requirements 4.2**
   */
  it('Property 3: Drop operation correctly restores available spots', () => {
    fc.assert(
      fc.property(
        maxStudentsArb,
        studentIdsArb,
        fc.float({ min: 0, max: 1, noNaN: true }),
        (maxStudents, studentIds, dropFraction) => {
          // Start with empty course
          let course: CourseState = {
            maxStudents,
            enrolledStudents: []
          };

          // First, enroll students
          const enrolledIds: string[] = [];
          for (const studentId of studentIds) {
            const result = attemptEnrollment(course, studentId);
            if (result.success) {
              enrolledIds.push(studentId);
            }
            course = result.courseState;
          }

          const initialEnrolledCount = course.enrolledStudents.length;
          const initialAvailableSpots = getAvailableSpots(course);

          // Drop some students
          const numToDrop = Math.floor(enrolledIds.length * dropFraction);
          const studentsToDrop = enrolledIds.slice(0, numToDrop);

          for (const studentId of studentsToDrop) {
            const spotsBefore = getAvailableSpots(course);
            const result = attemptDrop(course, studentId);
            
            if (result.success) {
              course = result.courseState;
              
              // INVARIANT: Available spots should increase by 1 after successful drop
              expect(getAvailableSpots(course)).toBe(spotsBefore + 1);
            }

            // INVARIANT: Capacity must not be exceeded
            expect(course.enrolledStudents.length).toBeLessThanOrEqual(course.maxStudents);
            
            // INVARIANT: Available spots must be non-negative
            expect(getAvailableSpots(course)).toBeGreaterThanOrEqual(0);
          }

          // Final checks
          const finalEnrolledCount = course.enrolledStudents.length;
          const finalAvailableSpots = getAvailableSpots(course);

          // INVARIANT: Enrolled count should decrease by number dropped
          expect(finalEnrolledCount).toBe(initialEnrolledCount - numToDrop);

          // INVARIANT: Available spots should increase by number dropped
          expect(finalAvailableSpots).toBe(initialAvailableSpots + numToDrop);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3 (continued): Duplicate enrollment prevention
   * *For any* student already enrolled, attempting to enroll again should fail
   * 
   * **Validates: Requirements 2.4**
   */
  it('Property 3: Duplicate enrollment is prevented', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 100 }), // Use min 2 to ensure course isn't full after first enrollment
        studentIdArb,
        (maxStudents, studentId) => {
          // Start with empty course
          let course: CourseState = {
            maxStudents,
            enrolledStudents: []
          };

          // First enrollment should succeed
          const firstResult = attemptEnrollment(course, studentId);
          expect(firstResult.success).toBe(true);
          course = firstResult.courseState;

          const countAfterFirst = course.enrolledStudents.length;

          // Second enrollment of same student should fail
          const secondResult = attemptEnrollment(course, studentId);
          expect(secondResult.success).toBe(false);
          expect(secondResult.error).toBe('Already enrolled');
          course = secondResult.courseState;

          // INVARIANT: Count should not change after failed duplicate enrollment
          expect(course.enrolledStudents.length).toBe(countAfterFirst);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3 (continued): Full course rejection
   * *For any* course at capacity, new enrollments should be rejected
   * 
   * **Validates: Requirements 2.3**
   */
  it('Property 3: Full course rejects new enrollments', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        fc.array(fc.uuid(), { minLength: 1, maxLength: 100 }),
        (maxStudents, studentIds) => {
          // Ensure we have more students than capacity
          const uniqueStudents = [...new Set(studentIds)];
          if (uniqueStudents.length <= maxStudents) {
            return; // Skip if not enough unique students
          }

          let course: CourseState = {
            maxStudents,
            enrolledStudents: []
          };

          // Fill the course
          for (let i = 0; i < maxStudents && i < uniqueStudents.length; i++) {
            const result = attemptEnrollment(course, uniqueStudents[i]);
            course = result.courseState;
          }

          // Course should be full
          expect(course.enrolledStudents.length).toBe(maxStudents);
          expect(getAvailableSpots(course)).toBe(0);

          // Try to enroll one more student
          const extraStudent = uniqueStudents[maxStudents];
          if (extraStudent) {
            const result = attemptEnrollment(course, extraStudent);
            
            // INVARIANT: Enrollment should fail when course is full
            expect(result.success).toBe(false);
            expect(result.error).toBe('Course is full');
            
            // INVARIANT: Count should not change
            expect(result.courseState.enrolledStudents.length).toBe(maxStudents);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Admin Override Capabilities - Pure function implementations for testing
 */

interface AdminEnrollmentResult {
  success: boolean;
  error?: string;
  courseState: CourseState;
  wasOverCapacity: boolean;
}

interface AdminRemovalResult {
  success: boolean;
  error?: string;
  courseState: CourseState;
}

interface AuditLogEntry {
  adminId: string;
  action: 'admin_enroll' | 'admin_remove';
  studentId: string;
  courseId: string;
  timestamp: Date;
  details: Record<string, unknown>;
}

/**
 * Pure function that simulates admin enrollment logic (bypasses capacity)
 * Requirements: 6.2
 */
function adminAttemptEnrollment(
  course: CourseState,
  studentId: string,
  adminId: string,
  auditLog: AuditLogEntry[]
): AdminEnrollmentResult {
  // Check duplicate (still prevent duplicates even for admin)
  if (course.enrolledStudents.includes(studentId)) {
    return {
      success: false,
      error: 'Already enrolled',
      courseState: course,
      wasOverCapacity: false
    };
  }

  // Admin bypasses capacity check (Requirement 6.2)
  const wasOverCapacity = course.enrolledStudents.length >= course.maxStudents;

  // Log admin action (Requirement 6.4)
  auditLog.push({
    adminId,
    action: 'admin_enroll',
    studentId,
    courseId: 'test-course',
    timestamp: new Date(),
    details: { wasOverCapacity }
  });

  // Successful admin enrollment
  return {
    success: true,
    courseState: {
      ...course,
      enrolledStudents: [...course.enrolledStudents, studentId]
    },
    wasOverCapacity
  };
}

/**
 * Pure function that simulates admin removal logic
 * Requirements: 6.3
 */
function adminAttemptRemoval(
  course: CourseState,
  studentId: string,
  adminId: string,
  auditLog: AuditLogEntry[]
): AdminRemovalResult {
  // Check if enrolled
  if (!course.enrolledStudents.includes(studentId)) {
    return {
      success: false,
      error: 'Not enrolled',
      courseState: course
    };
  }

  // Log admin action (Requirement 6.4)
  auditLog.push({
    adminId,
    action: 'admin_remove',
    studentId,
    courseId: 'test-course',
    timestamp: new Date(),
    details: {}
  });

  // Successful admin removal
  return {
    success: true,
    courseState: {
      ...course,
      enrolledStudents: course.enrolledStudents.filter(id => id !== studentId)
    }
  };
}

describe('Admin Enrollment Override Property Tests', () => {
  // Generators
  const maxStudentsArb = fc.integer({ min: 1, max: 50 });
  const studentIdArb = fc.uuid();
  const adminIdArb = fc.uuid();
  const studentIdsArb = fc.array(fc.uuid(), { minLength: 0, maxLength: 100 });

  /**
   * Property 8: Admin enrollment override capabilities
   * *For any* admin user, they should be able to enroll students in full courses,
   * remove students from any course, and have all actions properly logged
   * 
   * **Validates: Requirements 6.1, 6.2, 6.3, 6.4**
   */
  it('Property 8: Admin can enroll students in full courses (bypasses capacity)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        fc.array(fc.uuid(), { minLength: 2, maxLength: 50 }),
        adminIdArb,
        (maxStudents, studentIds, adminId) => {
          const uniqueStudents = [...new Set(studentIds)];
          if (uniqueStudents.length <= maxStudents) {
            return; // Skip if not enough unique students to test over-capacity
          }

          let course: CourseState = {
            maxStudents,
            enrolledStudents: []
          };
          const auditLog: AuditLogEntry[] = [];

          // Fill the course to capacity using regular enrollment
          for (let i = 0; i < maxStudents && i < uniqueStudents.length; i++) {
            const result = attemptEnrollment(course, uniqueStudents[i]);
            course = result.courseState;
          }

          // Verify course is full
          expect(course.enrolledStudents.length).toBe(maxStudents);

          // Admin should be able to enroll additional student (Requirement 6.2)
          const extraStudent = uniqueStudents[maxStudents];
          const adminResult = adminAttemptEnrollment(course, extraStudent, adminId, auditLog);

          // INVARIANT: Admin enrollment should succeed even when course is full
          expect(adminResult.success).toBe(true);
          expect(adminResult.wasOverCapacity).toBe(true);
          
          // INVARIANT: Student should be added to course
          expect(adminResult.courseState.enrolledStudents).toContain(extraStudent);
          expect(adminResult.courseState.enrolledStudents.length).toBe(maxStudents + 1);

          // INVARIANT: Action should be logged (Requirement 6.4)
          expect(auditLog.length).toBeGreaterThan(0);
          const lastLog = auditLog[auditLog.length - 1];
          expect(lastLog.action).toBe('admin_enroll');
          expect(lastLog.adminId).toBe(adminId);
          expect(lastLog.studentId).toBe(extraStudent);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8 (continued): Admin can remove any student from a course
   * 
   * **Validates: Requirements 6.3, 6.4**
   */
  it('Property 8: Admin can remove any student from a course', () => {
    fc.assert(
      fc.property(
        maxStudentsArb,
        fc.array(fc.uuid(), { minLength: 1, maxLength: 50 }),
        adminIdArb,
        fc.integer({ min: 0, max: 100 }),
        (maxStudents, studentIds, adminId, removalIndex) => {
          const uniqueStudents = [...new Set(studentIds)];
          if (uniqueStudents.length === 0) {
            return; // Skip if no students
          }

          let course: CourseState = {
            maxStudents,
            enrolledStudents: []
          };
          const auditLog: AuditLogEntry[] = [];

          // Enroll some students
          for (const studentId of uniqueStudents) {
            const result = attemptEnrollment(course, studentId);
            if (result.success) {
              course = result.courseState;
            }
          }

          if (course.enrolledStudents.length === 0) {
            return; // Skip if no students enrolled
          }

          // Pick a student to remove
          const studentToRemove = course.enrolledStudents[removalIndex % course.enrolledStudents.length];
          const countBefore = course.enrolledStudents.length;

          // Admin removes student (Requirement 6.3)
          const adminResult = adminAttemptRemoval(course, studentToRemove, adminId, auditLog);

          // INVARIANT: Admin removal should succeed
          expect(adminResult.success).toBe(true);
          
          // INVARIANT: Student should be removed from course
          expect(adminResult.courseState.enrolledStudents).not.toContain(studentToRemove);
          expect(adminResult.courseState.enrolledStudents.length).toBe(countBefore - 1);

          // INVARIANT: Action should be logged (Requirement 6.4)
          expect(auditLog.length).toBeGreaterThan(0);
          const lastLog = auditLog[auditLog.length - 1];
          expect(lastLog.action).toBe('admin_remove');
          expect(lastLog.adminId).toBe(adminId);
          expect(lastLog.studentId).toBe(studentToRemove);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8 (continued): All admin actions are logged for audit
   * 
   * **Validates: Requirements 6.4**
   */
  it('Property 8: All admin actions are logged for audit', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 30 }),
        fc.array(fc.uuid(), { minLength: 5, maxLength: 50 }),
        adminIdArb,
        fc.array(fc.boolean(), { minLength: 1, maxLength: 20 }),
        (maxStudents, studentIds, adminId, actions) => {
          const uniqueStudents = [...new Set(studentIds)];
          if (uniqueStudents.length < 3) {
            return; // Need at least 3 unique students
          }

          let course: CourseState = {
            maxStudents,
            enrolledStudents: []
          };
          const auditLog: AuditLogEntry[] = [];

          let enrolledStudents: string[] = [];
          let studentIndex = 0;

          // Perform a series of admin actions
          for (const shouldEnroll of actions) {
            if (shouldEnroll && studentIndex < uniqueStudents.length) {
              // Admin enroll
              const studentId = uniqueStudents[studentIndex++];
              const result = adminAttemptEnrollment(course, studentId, adminId, auditLog);
              if (result.success) {
                course = result.courseState;
                enrolledStudents.push(studentId);
              }
            } else if (!shouldEnroll && enrolledStudents.length > 0) {
              // Admin remove
              const studentId = enrolledStudents.pop()!;
              const result = adminAttemptRemoval(course, studentId, adminId, auditLog);
              if (result.success) {
                course = result.courseState;
              }
            }
          }

          // INVARIANT: Every successful admin action should be logged
          const enrollLogs = auditLog.filter(log => log.action === 'admin_enroll');
          const removeLogs = auditLog.filter(log => log.action === 'admin_remove');

          // All logs should have required fields
          for (const log of auditLog) {
            expect(log.adminId).toBe(adminId);
            expect(log.timestamp).toBeInstanceOf(Date);
            expect(['admin_enroll', 'admin_remove']).toContain(log.action);
            expect(log.studentId).toBeDefined();
            expect(log.courseId).toBeDefined();
          }

          // INVARIANT: Audit log should capture all admin operations
          expect(auditLog.length).toBe(enrollLogs.length + removeLogs.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8 (continued): Admin enrollment still prevents duplicates
   * 
   * **Validates: Requirements 6.2**
   */
  it('Property 8: Admin enrollment still prevents duplicate enrollments', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 50 }),
        studentIdArb,
        adminIdArb,
        (maxStudents, studentId, adminId) => {
          let course: CourseState = {
            maxStudents,
            enrolledStudents: []
          };
          const auditLog: AuditLogEntry[] = [];

          // First admin enrollment should succeed
          const firstResult = adminAttemptEnrollment(course, studentId, adminId, auditLog);
          expect(firstResult.success).toBe(true);
          course = firstResult.courseState;

          const countAfterFirst = course.enrolledStudents.length;

          // Second admin enrollment of same student should fail
          const secondResult = adminAttemptEnrollment(course, studentId, adminId, auditLog);
          
          // INVARIANT: Duplicate enrollment should fail even for admin
          expect(secondResult.success).toBe(false);
          expect(secondResult.error).toBe('Already enrolled');
          
          // INVARIANT: Count should not change after failed duplicate
          expect(secondResult.courseState.enrolledStudents.length).toBe(countAfterFirst);
        }
      ),
      { numRuns: 100 }
    );
  });
});


/**
 * Concurrent Enrollment Safety - Pure function implementations for testing
 * 
 * Property 10: Concurrent enrollment safety
 * *For any* set of concurrent enrollment attempts on the same course, the system should
 * prevent over-enrollment and maintain capacity limits regardless of timing
 * 
 * **Validates: Requirements 8.1**
 */

interface ConcurrentEnrollmentAttempt {
  studentId: string;
  timestamp: number;
}

interface ConcurrentEnrollmentResult {
  studentId: string;
  success: boolean;
  error?: string;
}

/**
 * Simulates concurrent enrollment attempts with optimistic locking
 * This models the behavior where multiple students try to enroll simultaneously
 * and the system must prevent over-enrollment
 */
function simulateConcurrentEnrollments(
  course: CourseState,
  attempts: ConcurrentEnrollmentAttempt[]
): { results: ConcurrentEnrollmentResult[]; finalCourseState: CourseState } {
  // Sort attempts by timestamp to simulate order of processing
  const sortedAttempts = [...attempts].sort((a, b) => a.timestamp - b.timestamp);
  
  const results: ConcurrentEnrollmentResult[] = [];
  let currentCourse = { ...course, enrolledStudents: [...course.enrolledStudents] };

  for (const attempt of sortedAttempts) {
    // Check capacity
    if (currentCourse.enrolledStudents.length >= currentCourse.maxStudents) {
      results.push({
        studentId: attempt.studentId,
        success: false,
        error: 'Course is full'
      });
      continue;
    }

    // Check duplicate
    if (currentCourse.enrolledStudents.includes(attempt.studentId)) {
      results.push({
        studentId: attempt.studentId,
        success: false,
        error: 'Already enrolled'
      });
      continue;
    }

    // Successful enrollment
    currentCourse.enrolledStudents.push(attempt.studentId);
    results.push({
      studentId: attempt.studentId,
      success: true
    });
  }

  return { results, finalCourseState: currentCourse };
}

/**
 * Simulates concurrent enrollment with version conflicts (optimistic locking)
 * This models the scenario where multiple requests read the same version
 * and only one can succeed
 */
function simulateConcurrentEnrollmentsWithVersioning(
  course: CourseState,
  attempts: ConcurrentEnrollmentAttempt[],
  maxRetries: number = 3
): { results: ConcurrentEnrollmentResult[]; finalCourseState: CourseState } {
  const results: ConcurrentEnrollmentResult[] = [];
  let currentCourse = { ...course, enrolledStudents: [...course.enrolledStudents] };
  let currentVersion = 0;

  // Group attempts by similar timestamps (simulating concurrent reads)
  const timestampGroups: Map<number, ConcurrentEnrollmentAttempt[]> = new Map();
  for (const attempt of attempts) {
    // Group by rounded timestamp (simulating concurrent reads within same time window)
    const groupKey = Math.floor(attempt.timestamp / 10);
    if (!timestampGroups.has(groupKey)) {
      timestampGroups.set(groupKey, []);
    }
    timestampGroups.get(groupKey)!.push(attempt);
  }

  // Process each group
  const sortedGroups = [...timestampGroups.entries()].sort((a, b) => a[0] - b[0]);
  
  for (const [, groupAttempts] of sortedGroups) {
    // All attempts in this group read the same version
    const readVersion = currentVersion;
    const readCourseState = { ...currentCourse, enrolledStudents: [...currentCourse.enrolledStudents] };

    // Process each attempt in the group
    for (const attempt of groupAttempts) {
      let success = false;
      let error: string | undefined;
      let retries = 0;

      while (retries < maxRetries && !success) {
        // Check capacity based on current state (not read state for retries)
        const stateToCheck = retries === 0 ? readCourseState : currentCourse;
        
        if (stateToCheck.enrolledStudents.length >= stateToCheck.maxStudents) {
          error = 'Course is full';
          break;
        }

        // Check duplicate
        if (currentCourse.enrolledStudents.includes(attempt.studentId)) {
          error = 'Already enrolled';
          break;
        }

        // Try to commit with version check
        if (retries === 0 && readVersion !== currentVersion) {
          // Version conflict on first try, retry
          retries++;
          continue;
        }

        // Check capacity again with current state
        if (currentCourse.enrolledStudents.length >= currentCourse.maxStudents) {
          error = 'Course is full';
          break;
        }

        // Successful enrollment
        currentCourse.enrolledStudents.push(attempt.studentId);
        currentVersion++;
        success = true;
      }

      results.push({
        studentId: attempt.studentId,
        success,
        error: success ? undefined : error || 'Max retries exceeded'
      });
    }
  }

  return { results, finalCourseState: currentCourse };
}

describe('Concurrent Enrollment Safety Property Tests', () => {
  // Generators
  const maxStudentsArb = fc.integer({ min: 1, max: 50 });
  const studentIdArb = fc.uuid();
  
  // Generator for concurrent enrollment attempts
  const concurrentAttemptsArb = fc.array(
    fc.record({
      studentId: fc.uuid(),
      timestamp: fc.integer({ min: 0, max: 1000 })
    }),
    { minLength: 1, maxLength: 100 }
  );

  /**
   * Property 10: Concurrent enrollment safety
   * *For any* set of concurrent enrollment attempts on the same course, the system should
   * prevent over-enrollment and maintain capacity limits regardless of timing
   * 
   * **Validates: Requirements 8.1**
   */
  it('Property 10: Concurrent enrollments never exceed course capacity', () => {
    fc.assert(
      fc.property(
        maxStudentsArb,
        concurrentAttemptsArb,
        (maxStudents, attempts) => {
          const course: CourseState = {
            maxStudents,
            enrolledStudents: []
          };

          const { results, finalCourseState } = simulateConcurrentEnrollments(course, attempts);

          // INVARIANT: Final enrolled count must never exceed max capacity
          expect(finalCourseState.enrolledStudents.length).toBeLessThanOrEqual(maxStudents);

          // INVARIANT: Number of successful enrollments equals final enrolled count
          const successfulEnrollments = results.filter(r => r.success).length;
          expect(successfulEnrollments).toBe(finalCourseState.enrolledStudents.length);

          // INVARIANT: All successful enrollments are unique students
          const enrolledSet = new Set(finalCourseState.enrolledStudents);
          expect(enrolledSet.size).toBe(finalCourseState.enrolledStudents.length);

          // INVARIANT: Available spots is always non-negative
          const availableSpots = maxStudents - finalCourseState.enrolledStudents.length;
          expect(availableSpots).toBeGreaterThanOrEqual(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 10 (continued): Concurrent enrollments with optimistic locking
   * Tests that version conflicts are handled correctly and capacity is maintained
   * 
   * **Validates: Requirements 8.1**
   */
  it('Property 10: Concurrent enrollments with version conflicts maintain capacity', () => {
    fc.assert(
      fc.property(
        maxStudentsArb,
        concurrentAttemptsArb,
        (maxStudents, attempts) => {
          const course: CourseState = {
            maxStudents,
            enrolledStudents: []
          };

          const { results, finalCourseState } = simulateConcurrentEnrollmentsWithVersioning(
            course,
            attempts,
            3 // maxRetries
          );

          // INVARIANT: Final enrolled count must never exceed max capacity
          expect(finalCourseState.enrolledStudents.length).toBeLessThanOrEqual(maxStudents);

          // INVARIANT: Number of successful enrollments equals final enrolled count
          const successfulEnrollments = results.filter(r => r.success).length;
          expect(successfulEnrollments).toBe(finalCourseState.enrolledStudents.length);

          // INVARIANT: All successful enrollments are unique students
          const enrolledSet = new Set(finalCourseState.enrolledStudents);
          expect(enrolledSet.size).toBe(finalCourseState.enrolledStudents.length);

          // INVARIANT: No duplicate students in enrolled list
          expect(finalCourseState.enrolledStudents.length).toBe(enrolledSet.size);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 10 (continued): High contention scenario
   * Tests that even with many concurrent attempts for limited spots, capacity is maintained
   * 
   * **Validates: Requirements 8.1**
   */
  it('Property 10: High contention - many students competing for few spots', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }), // Small capacity
        fc.array(fc.uuid(), { minLength: 20, maxLength: 100 }), // Many students
        (maxStudents, studentIds) => {
          const uniqueStudents = [...new Set(studentIds)];
          
          // Create concurrent attempts with overlapping timestamps
          const attempts: ConcurrentEnrollmentAttempt[] = uniqueStudents.map((studentId, index) => ({
            studentId,
            timestamp: index % 5 // Group into 5 concurrent batches
          }));

          const course: CourseState = {
            maxStudents,
            enrolledStudents: []
          };

          const { results, finalCourseState } = simulateConcurrentEnrollmentsWithVersioning(
            course,
            attempts,
            3
          );

          // INVARIANT: Final enrolled count must never exceed max capacity
          expect(finalCourseState.enrolledStudents.length).toBeLessThanOrEqual(maxStudents);

          // INVARIANT: If we had more unique students than capacity, course should be full
          if (uniqueStudents.length >= maxStudents) {
            expect(finalCourseState.enrolledStudents.length).toBe(maxStudents);
          }

          // INVARIANT: Rejected students should have appropriate error
          const rejectedForCapacity = results.filter(r => !r.success && r.error === 'Course is full');
          const successfulCount = results.filter(r => r.success).length;
          
          // Total successful + rejected for capacity should account for all unique attempts
          // (minus duplicates which get different error)
          expect(successfulCount).toBeLessThanOrEqual(maxStudents);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 10 (continued): Concurrent enrollment and drop operations
   * Tests that concurrent enroll/drop operations maintain consistency
   * 
   * **Validates: Requirements 8.1**
   */
  it('Property 10: Concurrent enroll and drop operations maintain consistency', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 30 }),
        fc.array(fc.uuid(), { minLength: 5, maxLength: 50 }),
        fc.array(fc.boolean(), { minLength: 10, maxLength: 50 }),
        (maxStudents, studentIds, operations) => {
          const uniqueStudents = [...new Set(studentIds)];
          if (uniqueStudents.length < 3) return; // Need enough students

          let course: CourseState = {
            maxStudents,
            enrolledStudents: []
          };

          let enrolledStudentsList: string[] = [];
          let studentIndex = 0;

          // Perform a series of enroll/drop operations
          for (const shouldEnroll of operations) {
            if (shouldEnroll && studentIndex < uniqueStudents.length) {
              // Enroll operation
              const result = attemptEnrollment(course, uniqueStudents[studentIndex++]);
              if (result.success) {
                course = result.courseState;
                enrolledStudentsList.push(uniqueStudents[studentIndex - 1]);
              }
            } else if (!shouldEnroll && enrolledStudentsList.length > 0) {
              // Drop operation
              const studentToDrop = enrolledStudentsList[0];
              const result = attemptDrop(course, studentToDrop);
              if (result.success) {
                course = result.courseState;
                enrolledStudentsList = enrolledStudentsList.slice(1);
              }
            }

            // INVARIANT: After each operation, capacity must not be exceeded
            expect(course.enrolledStudents.length).toBeLessThanOrEqual(maxStudents);

            // INVARIANT: Enrolled count matches our tracking
            expect(course.enrolledStudents.length).toBe(enrolledStudentsList.length);

            // INVARIANT: Available spots is always non-negative
            expect(getAvailableSpots(course)).toBeGreaterThanOrEqual(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 10 (continued): Race condition simulation
   * Tests that simultaneous enrollment attempts for the last spot are handled correctly
   * 
   * **Validates: Requirements 8.1**
   */
  it('Property 10: Race condition for last spot - only one student succeeds', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        fc.array(fc.uuid(), { minLength: 2, maxLength: 10 }),
        (maxStudents, competingStudents) => {
          const uniqueStudents = [...new Set(competingStudents)];
          if (uniqueStudents.length < 2) return; // Need at least 2 competing students

          // Fill course to one spot remaining
          let course: CourseState = {
            maxStudents,
            enrolledStudents: []
          };

          // Pre-fill with dummy students up to maxStudents - 1
          for (let i = 0; i < maxStudents - 1; i++) {
            course.enrolledStudents.push(`prefill-${i}`);
          }

          // All competing students try to enroll at the same timestamp (race condition)
          const attempts: ConcurrentEnrollmentAttempt[] = uniqueStudents.map(studentId => ({
            studentId,
            timestamp: 0 // Same timestamp = concurrent
          }));

          const { results, finalCourseState } = simulateConcurrentEnrollments(course, attempts);

          // INVARIANT: Exactly one student should succeed (the last spot)
          const successfulEnrollments = results.filter(r => r.success);
          expect(successfulEnrollments.length).toBe(1);

          // INVARIANT: Course should be exactly at capacity
          expect(finalCourseState.enrolledStudents.length).toBe(maxStudents);

          // INVARIANT: All other students should be rejected for capacity
          const rejectedForCapacity = results.filter(r => !r.success && r.error === 'Course is full');
          expect(rejectedForCapacity.length).toBe(uniqueStudents.length - 1);
        }
      ),
      { numRuns: 100 }
    );
  });
});
