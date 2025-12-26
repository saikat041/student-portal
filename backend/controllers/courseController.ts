import { Request, Response } from 'express';
import Course, { ICourse } from '../models/Course';
import User, { IUser } from '../models/User';
import { courseService, CourseData, CourseSearchOptions } from '../services/CourseService';
import { AuthenticatedRequest } from '../services/TenantContextManager';

interface CreateCourseRequest extends AuthenticatedRequest {
  body: CourseData;
}

export const getAllCourses = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.tenantContext) {
      res.status(400).json({ error: 'Institution context required' });
      return;
    }

    const options: CourseSearchOptions = {
      department: req.query.department as string,
      semester: req.query.semester as string,
      credits: req.query.credits ? parseInt(req.query.credits as string) : undefined,
      instructor: req.query.instructor as string,
      isActive: req.query.isActive !== undefined ? req.query.isActive === 'true' : true,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      skip: req.query.skip ? parseInt(req.query.skip as string) : undefined
    };

    const courses = await courseService.getCoursesByInstitution(
      req.tenantContext.institutionId.toString(),
      options
    );
    
    res.json(courses);
  } catch (error) {
    console.error('Error fetching courses:', error);
    res.status(500).json({ error: 'Failed to fetch courses' });
  }
};

export const getCourseById = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.tenantContext) {
      res.status(400).json({ error: 'Institution context required' });
      return;
    }

    const course = await courseService.getCourseById(
      req.params.id,
      req.tenantContext.institutionId.toString()
    );
    
    if (!course) {
      res.status(404).json({ error: 'Course not found' });
      return;
    }
    
    res.json(course);
  } catch (error) {
    console.error('Error fetching course:', error);
    res.status(500).json({ error: 'Failed to fetch course' });
  }
};

export const createCourse = async (req: CreateCourseRequest, res: Response): Promise<void> => {
  try {
    if (!req.tenantContext) {
      res.status(400).json({ error: 'Institution context required' });
      return;
    }

    // Check user permissions within institutional context
    const userInstitution = req.tenantContext.userInstitution;
    if (!['teacher', 'institution_admin'].includes(userInstitution.role)) {
      res.status(403).json({ error: 'Insufficient permissions to create courses' });
      return;
    }

    // For teachers, set them as instructor. For admins, require instructor field or use provided one
    let courseData = { ...req.body };
    if (userInstitution.role === 'teacher') {
      courseData.teacherId = req.user._id.toString();
    } else if (userInstitution.role === 'institution_admin') {
      if (!courseData.teacherId) {
        res.status(400).json({ error: 'Instructor must be specified' });
        return;
      }
    }

    const course = await courseService.createCourse(
      courseData,
      req.tenantContext.institutionId.toString()
    );
    
    res.status(201).json(course);
  } catch (error) {
    console.error('Error creating course:', error);
    if ((error as Error).message.includes('already exists') || 
        (error as Error).message.includes('not found') ||
        (error as Error).message.includes('required')) {
      res.status(400).json({ error: (error as Error).message });
    } else {
      res.status(500).json({ error: 'Failed to create course' });
    }
  }
};

export const updateCourse = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.tenantContext) {
      res.status(400).json({ error: 'Institution context required' });
      return;
    }

    // Get the course first to check permissions
    const course = await courseService.getCourseById(
      req.params.id,
      req.tenantContext.institutionId.toString()
    );
    
    if (!course) {
      res.status(404).json({ error: 'Course not found' });
      return;
    }

    const userInstitution = req.tenantContext.userInstitution;
    
    // Teachers can only update their own courses, admins can update any course
    if (userInstitution.role === 'teacher' && 
        course.instructor._id.toString() !== req.user._id.toString()) {
      res.status(403).json({ error: 'You can only update your own courses' });
      return;
    }

    if (!['teacher', 'institution_admin'].includes(userInstitution.role)) {
      res.status(403).json({ error: 'Insufficient permissions to update courses' });
      return;
    }

    const updatedCourse = await courseService.updateCourse(
      req.params.id,
      req.tenantContext.institutionId.toString(),
      req.body
    );

    res.json(updatedCourse);
  } catch (error) {
    console.error('Error updating course:', error);
    if ((error as Error).message.includes('not found') ||
        (error as Error).message.includes('already exists')) {
      res.status(400).json({ error: (error as Error).message });
    } else {
      res.status(500).json({ error: 'Failed to update course' });
    }
  }
};

export const deleteCourse = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.tenantContext) {
      res.status(400).json({ error: 'Institution context required' });
      return;
    }

    const course = await courseService.getCourseById(
      req.params.id,
      req.tenantContext.institutionId.toString()
    );
    
    if (!course) {
      res.status(404).json({ error: 'Course not found' });
      return;
    }

    const userInstitution = req.tenantContext.userInstitution;
    
    // Only institution admins can delete courses
    if (userInstitution.role !== 'institution_admin') {
      res.status(403).json({ error: 'Only institution administrators can delete courses' });
      return;
    }

    // Check if course has enrolled students
    if (course.enrolledStudents.length > 0) {
      res.status(400).json({ error: 'Cannot delete course with enrolled students. Deactivate instead.' });
      return;
    }

    // Soft delete by deactivating
    await courseService.deactivateCourse(
      req.params.id,
      req.tenantContext.institutionId.toString()
    );
    
    res.json({ message: 'Course deactivated successfully' });
  } catch (error) {
    console.error('Error deleting course:', error);
    res.status(500).json({ error: 'Failed to delete course' });
  }
};

export const getMyCourses = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.tenantContext) {
      res.status(400).json({ error: 'Institution context required' });
      return;
    }

    const userInstitution = req.tenantContext.userInstitution;
    if (userInstitution.role !== 'teacher') {
      res.status(403).json({ error: 'Only teachers can access this endpoint' });
      return;
    }

    const courses = await courseService.getCoursesByTeacher(
      req.user._id.toString(),
      req.tenantContext.institutionId.toString()
    );
    
    res.json(courses);
  } catch (error) {
    console.error('Error fetching my courses:', error);
    res.status(500).json({ error: 'Failed to fetch courses' });
  }
};

export const searchCourses = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.tenantContext) {
      res.status(400).json({ error: 'Institution context required' });
      return;
    }

    const query = req.query.q as string;
    if (!query || query.trim().length === 0) {
      res.status(400).json({ error: 'Search query is required' });
      return;
    }

    // Use advanced search for more comprehensive results
    const searchCriteria = {
      query,
      department: req.query.department as string,
      semester: req.query.semester as string,
      credits: req.query.credits ? parseInt(req.query.credits as string) : undefined,
      minCredits: req.query.minCredits ? parseInt(req.query.minCredits as string) : undefined,
      maxCredits: req.query.maxCredits ? parseInt(req.query.maxCredits as string) : undefined,
      hasAvailableSpots: req.query.hasAvailableSpots === 'true'
    };

    const courses = await courseService.advancedSearchCourses(
      req.tenantContext.institutionId.toString(),
      searchCriteria
    );
    
    res.json({
      courses,
      total: courses.length,
      searchCriteria: {
        query,
        appliedFilters: Object.keys(searchCriteria).filter(key => 
          searchCriteria[key as keyof typeof searchCriteria] !== undefined
        )
      }
    });
  } catch (error) {
    console.error('Error searching courses:', error);
    res.status(500).json({ error: 'Failed to search courses' });
  }
};

export const getCourseStatistics = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.tenantContext) {
      res.status(400).json({ error: 'Institution context required' });
      return;
    }

    const userInstitution = req.tenantContext.userInstitution;
    if (userInstitution.role !== 'institution_admin') {
      res.status(403).json({ error: 'Only institution administrators can access course statistics' });
      return;
    }

    const statistics = await courseService.getCourseStatistics(
      req.tenantContext.institutionId.toString()
    );
    
    res.json(statistics);
  } catch (error) {
    console.error('Error fetching course statistics:', error);
    res.status(500).json({ error: 'Failed to fetch course statistics' });
  }
};

export const getCourseCatalog = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.tenantContext) {
      res.status(400).json({ error: 'Institution context required' });
      return;
    }

    const options = {
      department: req.query.department as string,
      semester: req.query.semester as string,
      credits: req.query.credits ? parseInt(req.query.credits as string) : undefined,
      search: req.query.search as string,
      sortBy: req.query.sortBy as 'code' | 'name' | 'department' | 'credits',
      sortOrder: req.query.sortOrder as 'asc' | 'desc',
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 20
    };

    const catalog = await courseService.getCourseCatalog(
      req.tenantContext.institutionId.toString(),
      options
    );

    res.json(catalog);
  } catch (error) {
    console.error('Error fetching course catalog:', error);
    res.status(500).json({ error: 'Failed to fetch course catalog' });
  }
};

export const getCoursesByDepartment = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.tenantContext) {
      res.status(400).json({ error: 'Institution context required' });
      return;
    }

    const department = req.params.department;
    if (!department) {
      res.status(400).json({ error: 'Department parameter is required' });
      return;
    }

    const options: CourseSearchOptions = {
      department,
      isActive: true,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      skip: req.query.skip ? parseInt(req.query.skip as string) : undefined
    };

    const courses = await courseService.getCoursesByInstitution(
      req.tenantContext.institutionId.toString(),
      options
    );
    
    res.json(courses);
  } catch (error) {
    console.error('Error fetching courses by department:', error);
    res.status(500).json({ error: 'Failed to fetch courses by department' });
  }
};

export const getCoursesBySemester = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.tenantContext) {
      res.status(400).json({ error: 'Institution context required' });
      return;
    }

    const semester = req.params.semester;
    if (!semester) {
      res.status(400).json({ error: 'Semester parameter is required' });
      return;
    }

    const options: CourseSearchOptions = {
      semester,
      isActive: true,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      skip: req.query.skip ? parseInt(req.query.skip as string) : undefined
    };

    const courses = await courseService.getCoursesByInstitution(
      req.tenantContext.institutionId.toString(),
      options
    );
    
    res.json(courses);
  } catch (error) {
    console.error('Error fetching courses by semester:', error);
    res.status(500).json({ error: 'Failed to fetch courses by semester' });
  }
};

export const getAvailableDepartments = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.tenantContext) {
      res.status(400).json({ error: 'Institution context required' });
      return;
    }

    const statistics = await courseService.getCourseStatistics(
      req.tenantContext.institutionId.toString()
    );
    
    res.json(statistics.coursesByDepartment);
  } catch (error) {
    console.error('Error fetching available departments:', error);
    res.status(500).json({ error: 'Failed to fetch available departments' });
  }
};

export const getAvailableSemesters = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.tenantContext) {
      res.status(400).json({ error: 'Institution context required' });
      return;
    }

    const statistics = await courseService.getCourseStatistics(
      req.tenantContext.institutionId.toString()
    );
    
    res.json(statistics.coursesBySemester);
  } catch (error) {
    console.error('Error fetching available semesters:', error);
    res.status(500).json({ error: 'Failed to fetch available semesters' });
  }
};
