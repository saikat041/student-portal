import express from 'express';
import {
  getAllCourses,
  getCourseById,
  createCourse,
  updateCourse,
  deleteCourse,
  getMyCourses,
  searchCourses,
  getCourseStatistics,
  getCourseCatalog,
  getCoursesByDepartment,
  getCoursesBySemester,
  getAvailableDepartments,
  getAvailableSemesters
} from '../controllers/courseController';
import { authenticate, authorize } from '../middleware/auth';
import { tenantContextManager } from '../services/TenantContextManager';
import { 
  courseManagementPerformanceMiddleware,
  cachePerformanceMiddleware,
  cleanupMiddleware
} from '../middleware/performanceMiddleware';

const router = express.Router();

// Apply tenant context middleware to all routes
router.use(authenticate);
router.use(tenantContextManager.establishContext());
router.use(cleanupMiddleware);

// Course catalog and browsing routes (public within institution) - with caching
router.get('/catalog', 
  cachePerformanceMiddleware(
    (req) => `course_catalog_${req.query.department || 'all'}_${req.query.semester || 'all'}`,
    { dataType: 'course_catalog', ttl: 5 * 60 * 1000 }
  ),
  courseManagementPerformanceMiddleware('Get Course Catalog'),
  getCourseCatalog
);

router.get('/departments', 
  cachePerformanceMiddleware(
    () => 'available_departments',
    { dataType: 'course_catalog', ttl: 15 * 60 * 1000 }
  ),
  courseManagementPerformanceMiddleware('Get Available Departments'),
  getAvailableDepartments
);

router.get('/semesters', 
  cachePerformanceMiddleware(
    () => 'available_semesters',
    { dataType: 'course_catalog', ttl: 15 * 60 * 1000 }
  ),
  courseManagementPerformanceMiddleware('Get Available Semesters'),
  getAvailableSemesters
);

router.get('/department/:department', 
  cachePerformanceMiddleware(
    (req) => `courses_by_department_${req.params.department}`,
    { dataType: 'course_catalog', ttl: 5 * 60 * 1000 }
  ),
  courseManagementPerformanceMiddleware('Get Courses by Department'),
  getCoursesByDepartment
);
router.get('/semester/:semester', 
  cachePerformanceMiddleware(
    (req) => `courses_by_semester_${req.params.semester}`,
    { dataType: 'course_catalog', ttl: 5 * 60 * 1000 }
  ),
  courseManagementPerformanceMiddleware('Get Courses by Semester'),
  getCoursesBySemester
);

router.get('/search', 
  courseManagementPerformanceMiddleware('Search Courses'),
  searchCourses
);

// General course routes
router.get('/', 
  courseManagementPerformanceMiddleware('Get All Courses'),
  getAllCourses
);

router.get('/statistics', 
  cachePerformanceMiddleware(
    () => 'course_statistics',
    { dataType: 'statistics', ttl: 2 * 60 * 1000 }
  ),
  courseManagementPerformanceMiddleware('Get Course Statistics'),
  getCourseStatistics
);

router.get('/my-courses', 
  courseManagementPerformanceMiddleware('Get My Courses'),
  getMyCourses
);

router.get('/:id', 
  cachePerformanceMiddleware(
    (req) => `course_${req.params.id}`,
    { dataType: 'course_catalog', ttl: 5 * 60 * 1000 }
  ),
  courseManagementPerformanceMiddleware('Get Course by ID'),
  getCourseById
);

// Protected routes (permissions checked within controllers based on institutional context)
router.post('/', 
  courseManagementPerformanceMiddleware('Create Course'),
  createCourse
);

router.put('/:id', 
  courseManagementPerformanceMiddleware('Update Course'),
  updateCourse
);

router.delete('/:id', 
  courseManagementPerformanceMiddleware('Delete Course'),
  deleteCourse
);

export default router;
