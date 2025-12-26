# Implementation Plan: Student Enrollment System

## Overview

This implementation plan builds the student enrollment system incrementally, starting with data models and backend APIs, then adding frontend components. Each task builds on previous work to ensure no orphaned code.

## Tasks

- [x] 1. Create Student model and migrate existing student data
  - [x] 1.1 Create proper Student model file in backend/models/Student.ts
    - Define IStudent interface extending Document
    - Include user reference, studentId, major, year, gpa, enrolledCourses, totalCredits, maxCredits, isActive fields
    - Add virtual for full name from linked User
    - _Requirements: 3.1, 3.2_
  - [x] 1.2 Update server.ts to remove inline Student schema and use new model
    - Import Student model from models/Student.ts
    - Remove duplicate schema definition
    - _Requirements: 8.2_

- [x] 2. Create Enrollment model and controller
  - [x] 2.1 Create Enrollment model in backend/models/Enrollment.ts
    - Define IEnrollment interface with student, course, enrollmentDate, status, grade, credits, semester, academicYear
    - Add compound unique index on student + course + semester to prevent duplicates
    - _Requirements: 2.4, 8.2_
  - [x] 2.2 Create EnrollmentController in backend/controllers/enrollmentController.ts
    - Implement enrollStudent with capacity checking and concurrency control
    - Implement dropStudent with spot restoration
    - Implement getStudentEnrollments for dashboard
    - Implement getCourseEnrollments for teacher view
    - _Requirements: 2.1, 2.2, 2.3, 4.1, 4.2, 5.1_
  - [x] 2.3 Write property test for enrollment capacity invariant
    - **Property 3: Enrollment capacity invariant**
    - **Validates: Requirements 2.2, 2.3, 4.2**

- [x] 3. Create enrollment routes and wire to server
  - [x] 3.1 Create enrollment routes in backend/routes/enrollments.ts
    - POST /api/enrollments for student enrollment
    - DELETE /api/enrollments/:courseId for dropping courses
    - GET /api/enrollments/my-courses for student's enrolled courses
    - GET /api/enrollments/course/:courseId for course roster (teacher/admin)
    - Apply authentication and role-based authorization
    - _Requirements: 2.1, 3.1, 4.1, 5.1_
  - [x] 3.2 Register enrollment routes in server.ts
    - Import and use enrollment routes
    - _Requirements: 2.1_

- [x] 4. Checkpoint - Backend enrollment API complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement admin enrollment management
  - [x] 5.1 Add admin override methods to EnrollmentController
    - Implement adminEnrollStudent that bypasses capacity limits
    - Implement adminRemoveStudent for forced unenrollment
    - Add audit logging for admin actions
    - _Requirements: 6.2, 6.3, 6.4_
  - [x] 5.2 Add admin routes to enrollment routes
    - POST /api/enrollments/admin/enroll for admin enrollment override
    - DELETE /api/enrollments/admin/:courseId/:studentId for admin removal
    - Restrict to admin role only
    - _Requirements: 6.1, 6.2, 6.3_
  - [x] 5.3 Write property test for admin override capabilities
    - **Property 8: Admin enrollment override capabilities**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4**

- [x] 6. Update frontend types for enrollment
  - [x] 6.1 Add Enrollment types to frontend/src/types/index.ts
    - Add Enrollment interface matching backend model
    - Add EnrollmentStatus type
    - Update Course interface to include enrollment statistics
    - _Requirements: 1.2, 3.2_

- [x] 7. Create StudentDashboard component
  - [x] 7.1 Create StudentDashboard component in frontend/src/components/StudentDashboard.tsx
    - Display enrolled courses with course details
    - Show total credit hours calculation
    - Add drop course functionality with confirmation
    - Show empty state message when no enrollments
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 4.1, 4.3_
  - [x] 7.2 Write property test for credit calculation accuracy
    - **Property 5: Student dashboard accuracy**
    - **Validates: Requirements 3.1, 3.2, 3.4**

- [x] 8. Create CourseCatalog component for students
  - [x] 8.1 Create CourseCatalog component in frontend/src/components/CourseCatalog.tsx
    - Display all active courses with enrollment info
    - Show available spots and full course indicators
    - Add enroll button for available courses
    - Implement filter by department, semester
    - Implement search by course code, name, description
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_
  - [x] 8.2 Write property test for course filtering accuracy
    - **Property 2: Course filtering and search accuracy**
    - **Validates: Requirements 1.4, 1.5**

- [x] 9. Checkpoint - Student enrollment UI complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Update Dashboard to include enrollment views
  - [x] 10.1 Update App.tsx Dashboard component
    - Add "My Courses" tab for students showing StudentDashboard
    - Add "Course Catalog" tab for students showing CourseCatalog
    - Keep existing tabs for admin/teacher roles
    - _Requirements: 3.1, 1.1_
  - [x] 10.2 Update CourseManagement to show enrollment roster for teachers
    - Add enrolled students list to course cards
    - Show enrollment count and available spots
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 11. Add enrollment statistics and indicators
  - [x] 11.1 Add availability indicators to course displays
    - Highlight courses with limited availability (< 5 spots)
    - Show "Course Full" badge when at capacity
    - Display enrollment progress bar
    - _Requirements: 7.1, 7.2_
  - [x] 11.2 Write property test for enrollment statistics accuracy
    - **Property 9: Enrollment statistics accuracy**
    - **Validates: Requirements 7.1, 7.2**

- [x] 12. Implement concurrency control for enrollments
  - [x] 12.1 Add optimistic locking to enrollment operations
    - Use MongoDB transactions for enrollment/drop operations
    - Implement retry logic for concurrent enrollment attempts
    - Add version field to Course model for optimistic locking
    - _Requirements: 8.1, 8.5_
  - [x] 12.2 Write property test for concurrent enrollment safety
    - **Property 10: Concurrent enrollment safety**
    - **Validates: Requirements 8.1**

- [x] 13. Final checkpoint - Complete enrollment system
  - Ensure all tests pass, ask the user if questions arise.
  - Verify all role-based access controls work correctly
  - Test enrollment and drop workflows end-to-end

## Notes

- All tasks including property tests are required for comprehensive validation
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- The implementation uses TypeScript throughout for type safety