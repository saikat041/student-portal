import express from 'express';
import {
  enrollStudent,
  dropStudent,
  getStudentEnrollments,
  getCourseEnrollments,
  adminEnrollStudent,
  adminRemoveStudent
} from '../controllers/enrollmentController';
import { authenticate, authorize } from '../middleware/auth';
import { 
  enrollmentPerformanceMiddleware,
  cachePerformanceMiddleware,
  cleanupMiddleware
} from '../middleware/performanceMiddleware';

const router = express.Router();

// Apply cleanup middleware
router.use(cleanupMiddleware);

/**
 * POST /api/enrollments
 * Enroll the authenticated student in a course
 * Requirements: 2.1
 */
router.post('/', 
  authenticate, 
  authorize('student'), 
  enrollmentPerformanceMiddleware('Enroll Student'),
  enrollStudent
);

/**
 * DELETE /api/enrollments/:courseId
 * Drop the authenticated student from a course
 * Requirements: 4.1
 */
router.delete('/:courseId', 
  authenticate, 
  authorize('student'), 
  enrollmentPerformanceMiddleware('Drop Student'),
  dropStudent
);

/**
 * GET /api/enrollments/my-courses
 * Get all enrolled courses for the authenticated student
 * Requirements: 3.1
 */
router.get('/my-courses', 
  authenticate, 
  authorize('student'), 
  cachePerformanceMiddleware(
    (req) => `student_enrollments_${(req as any).user._id}`,
    { dataType: 'enrollment_data', ttl: 2 * 60 * 1000 }
  ),
  enrollmentPerformanceMiddleware('Get Student Enrollments'),
  getStudentEnrollments
);

/**
 * GET /api/enrollments/course/:courseId
 * Get all enrolled students for a course (teacher/admin only)
 * Requirements: 5.1
 */
router.get('/course/:courseId', 
  authenticate, 
  authorize('teacher', 'admin'), 
  cachePerformanceMiddleware(
    (req) => `course_enrollments_${req.params.courseId}`,
    { dataType: 'enrollment_data', ttl: 2 * 60 * 1000 }
  ),
  enrollmentPerformanceMiddleware('Get Course Enrollments'),
  getCourseEnrollments
);

/**
 * POST /api/enrollments/admin/enroll
 * Admin enrollment override - bypasses capacity limits
 * Requirements: 6.1, 6.2
 */
router.post('/admin/enroll', 
  authenticate, 
  authorize('admin'), 
  enrollmentPerformanceMiddleware('Admin Enroll Student'),
  adminEnrollStudent
);

/**
 * DELETE /api/enrollments/admin/:courseId/:studentId
 * Admin forced removal of student from course
 * Requirements: 6.1, 6.3
 */
router.delete('/admin/:courseId/:studentId', 
  authenticate, 
  authorize('admin'), 
  enrollmentPerformanceMiddleware('Admin Remove Student'),
  adminRemoveStudent
);

export default router;
