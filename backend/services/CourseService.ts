import mongoose from 'mongoose';
import Course, { ICourse } from '../models/Course';
import User, { IUser } from '../models/User';
import Institution, { IInstitution } from '../models/Institution';

export interface CourseData {
  courseCode: string;
  courseName: string;
  description: string;
  credits: number;
  department: string;
  semester: string;
  maxStudents?: number;
  teacherId?: string;
}

export interface CourseSearchOptions {
  department?: string;
  semester?: string;
  credits?: number;
  instructor?: string;
  isActive?: boolean;
  limit?: number;
  skip?: number;
}

export class CourseService {
  private static instance: CourseService;

  private constructor() {}

  public static getInstance(): CourseService {
    if (!CourseService.instance) {
      CourseService.instance = new CourseService();
    }
    return CourseService.instance;
  }

  /**
   * Create a new course within an institutional context
   */
  async createCourse(courseData: CourseData, institutionId: string): Promise<ICourse> {
    // Validate institution exists and is active
    const institution = await Institution.findById(institutionId);
    if (!institution) {
      throw new Error('Institution not found');
    }
    if (institution.status !== 'active') {
      throw new Error('Institution is not active');
    }

    // Validate required fields
    this.validateCourseData(courseData);

    // Check for course code uniqueness within institution
    const existingCourse = await Course.findOne({
      institutionId: new mongoose.Types.ObjectId(institutionId),
      courseCode: courseData.courseCode.toUpperCase()
    });

    if (existingCourse) {
      throw new Error('Course code already exists within this institution');
    }

    // If teacherId is provided, validate the teacher exists and belongs to the institution
    if (courseData.teacherId) {
      const teacher = await User.findById(courseData.teacherId);
      if (!teacher) {
        throw new Error('Teacher not found');
      }

      const teacherInstitution = teacher.institutions.find(
        inst => inst.institutionId.toString() === institutionId && 
                inst.status === 'active' &&
                (inst.role === 'teacher' || inst.role === 'institution_admin')
      );

      if (!teacherInstitution) {
        throw new Error('Teacher does not have access to this institution or is not authorized to teach');
      }
    }

    // Create course with institutional context
    const course = new Course({
      institutionId: new mongoose.Types.ObjectId(institutionId),
      courseCode: courseData.courseCode.toUpperCase(),
      courseName: courseData.courseName,
      description: courseData.description,
      credits: courseData.credits,
      department: courseData.department,
      instructor: courseData.teacherId ? new mongoose.Types.ObjectId(courseData.teacherId) : undefined,
      semester: courseData.semester,
      maxStudents: courseData.maxStudents || 30,
      enrolledStudents: [],
      isActive: true
    });

    await course.save();
    return course;
  }

  /**
   * Get courses by institution with optional filtering
   */
  async getCoursesByInstitution(
    institutionId: string, 
    options: CourseSearchOptions = {}
  ): Promise<ICourse[]> {
    const query: any = {
      institutionId: new mongoose.Types.ObjectId(institutionId)
    };

    // Apply filters
    if (options.department) {
      query.department = options.department;
    }
    if (options.semester) {
      query.semester = options.semester;
    }
    if (options.credits) {
      query.credits = options.credits;
    }
    if (options.instructor) {
      query.instructor = new mongoose.Types.ObjectId(options.instructor);
    }
    if (options.isActive !== undefined) {
      query.isActive = options.isActive;
    }

    let queryBuilder = Course.find(query)
      .populate('instructor', 'firstName lastName email')
      .sort({ courseCode: 1 });

    if (options.skip) {
      queryBuilder = queryBuilder.skip(options.skip);
    }
    if (options.limit) {
      queryBuilder = queryBuilder.limit(options.limit);
    }

    return queryBuilder.exec();
  }

  /**
   * Search courses within an institution
   */
  async searchCourses(query: string, institutionId: string): Promise<ICourse[]> {
    const searchRegex = new RegExp(query, 'i');
    
    return Course.find({
      institutionId: new mongoose.Types.ObjectId(institutionId),
      isActive: true,
      $or: [
        { courseCode: searchRegex },
        { courseName: searchRegex },
        { description: searchRegex },
        { department: searchRegex }
      ]
    })
    .populate('instructor', 'firstName lastName email')
    .sort({ courseCode: 1 })
    .limit(50); // Limit search results
  }

  /**
   * Get course by ID with institutional validation
   */
  async getCourseById(courseId: string, institutionId: string): Promise<ICourse | null> {
    if (!mongoose.Types.ObjectId.isValid(courseId)) {
      throw new Error('Invalid course ID format');
    }

    return Course.findOne({
      _id: courseId,
      institutionId: new mongoose.Types.ObjectId(institutionId)
    }).populate('instructor', 'firstName lastName email');
  }

  /**
   * Update course within institutional context
   */
  async updateCourse(
    courseId: string, 
    institutionId: string, 
    updateData: Partial<CourseData>
  ): Promise<ICourse> {
    const course = await Course.findOne({
      _id: courseId,
      institutionId: new mongoose.Types.ObjectId(institutionId)
    });

    if (!course) {
      throw new Error('Course not found within this institution');
    }

    // If updating course code, check for uniqueness within institution
    if (updateData.courseCode && updateData.courseCode !== course.courseCode) {
      const existingCourse = await Course.findOne({
        institutionId: new mongoose.Types.ObjectId(institutionId),
        courseCode: updateData.courseCode.toUpperCase(),
        _id: { $ne: courseId }
      });

      if (existingCourse) {
        throw new Error('Course code already exists within this institution');
      }
    }

    // If updating teacher, validate they belong to the institution
    if (updateData.teacherId) {
      const teacher = await User.findById(updateData.teacherId);
      if (!teacher) {
        throw new Error('Teacher not found');
      }

      const teacherInstitution = teacher.institutions.find(
        inst => inst.institutionId.toString() === institutionId && 
                inst.status === 'active' &&
                (inst.role === 'teacher' || inst.role === 'institution_admin')
      );

      if (!teacherInstitution) {
        throw new Error('Teacher does not have access to this institution or is not authorized to teach');
      }
    }

    // Apply updates
    Object.keys(updateData).forEach(key => {
      if (key === 'courseCode' && updateData.courseCode) {
        course.courseCode = updateData.courseCode.toUpperCase();
      } else if (key === 'teacherId' && updateData.teacherId) {
        course.instructor = new mongoose.Types.ObjectId(updateData.teacherId);
      } else if (updateData[key as keyof CourseData] !== undefined) {
        (course as any)[key] = updateData[key as keyof CourseData];
      }
    });

    await course.save();
    return course.populate('instructor', 'firstName lastName email');
  }

  /**
   * Assign teacher to course within institutional context
   */
  async assignTeacher(
    courseId: string, 
    teacherId: string, 
    institutionId: string
  ): Promise<ICourse> {
    const course = await Course.findOne({
      _id: courseId,
      institutionId: new mongoose.Types.ObjectId(institutionId)
    });

    if (!course) {
      throw new Error('Course not found within this institution');
    }

    // Validate teacher exists and belongs to institution
    const teacher = await User.findById(teacherId);
    if (!teacher) {
      throw new Error('Teacher not found');
    }

    const teacherInstitution = teacher.institutions.find(
      inst => inst.institutionId.toString() === institutionId && 
              inst.status === 'active' &&
              (inst.role === 'teacher' || inst.role === 'institution_admin')
    );

    if (!teacherInstitution) {
      throw new Error('Teacher does not have access to this institution or is not authorized to teach');
    }

    course.instructor = new mongoose.Types.ObjectId(teacherId);
    await course.save();

    return course.populate('instructor', 'firstName lastName email');
  }

  /**
   * Get courses taught by a specific teacher within an institution
   */
  async getCoursesByTeacher(teacherId: string, institutionId: string): Promise<ICourse[]> {
    return Course.find({
      instructor: new mongoose.Types.ObjectId(teacherId),
      institutionId: new mongoose.Types.ObjectId(institutionId),
      isActive: true
    })
    .populate('instructor', 'firstName lastName email')
    .sort({ courseCode: 1 });
  }

  /**
   * Deactivate course (soft delete)
   */
  async deactivateCourse(courseId: string, institutionId: string): Promise<ICourse> {
    const course = await Course.findOne({
      _id: courseId,
      institutionId: new mongoose.Types.ObjectId(institutionId)
    });

    if (!course) {
      throw new Error('Course not found within this institution');
    }

    course.isActive = false;
    await course.save();

    return course;
  }

  /**
   * Reactivate course
   */
  async reactivateCourse(courseId: string, institutionId: string): Promise<ICourse> {
    const course = await Course.findOne({
      _id: courseId,
      institutionId: new mongoose.Types.ObjectId(institutionId)
    });

    if (!course) {
      throw new Error('Course not found within this institution');
    }

    course.isActive = true;
    await course.save();

    return course;
  }

  /**
   * Get course statistics for an institution
   */
  async getCourseStatistics(institutionId: string): Promise<{
    totalCourses: number;
    activeCourses: number;
    inactiveCourses: number;
    coursesByDepartment: Array<{ department: string; count: number }>;
    coursesBySemester: Array<{ semester: string; count: number }>;
    averageEnrollment: number;
  }> {
    const institutionObjectId = new mongoose.Types.ObjectId(institutionId);

    const [
      totalCourses,
      activeCourses,
      inactiveCourses,
      departmentStats,
      semesterStats,
      enrollmentStats
    ] = await Promise.all([
      Course.countDocuments({ institutionId: institutionObjectId }),
      Course.countDocuments({ institutionId: institutionObjectId, isActive: true }),
      Course.countDocuments({ institutionId: institutionObjectId, isActive: false }),
      Course.aggregate([
        { $match: { institutionId: institutionObjectId, isActive: true } },
        { $group: { _id: '$department', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      Course.aggregate([
        { $match: { institutionId: institutionObjectId, isActive: true } },
        { $group: { _id: '$semester', count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]),
      Course.aggregate([
        { $match: { institutionId: institutionObjectId } },
        { $group: { _id: null, avgEnrollment: { $avg: { $size: '$enrolledStudents' } } } }
      ])
    ]);

    return {
      totalCourses,
      activeCourses,
      inactiveCourses,
      coursesByDepartment: departmentStats.map((stat: any) => ({
        department: stat._id,
        count: stat.count
      })),
      coursesBySemester: semesterStats.map((stat: any) => ({
        semester: stat._id,
        count: stat.count
      })),
      averageEnrollment: enrollmentStats[0]?.avgEnrollment || 0
    };
  }

  /**
   * Advanced search courses with multiple criteria
   */
  async advancedSearchCourses(
    institutionId: string,
    searchCriteria: {
      query?: string;
      department?: string;
      semester?: string;
      credits?: number;
      instructor?: string;
      minCredits?: number;
      maxCredits?: number;
      hasAvailableSpots?: boolean;
    }
  ): Promise<ICourse[]> {
    const institutionObjectId = new mongoose.Types.ObjectId(institutionId);
    const searchQuery: any = {
      institutionId: institutionObjectId,
      isActive: true
    };

    // Text search across multiple fields
    if (searchCriteria.query) {
      const searchRegex = new RegExp(searchCriteria.query, 'i');
      searchQuery.$or = [
        { courseCode: searchRegex },
        { courseName: searchRegex },
        { description: searchRegex },
        { department: searchRegex }
      ];
    }

    // Specific field filters
    if (searchCriteria.department) {
      searchQuery.department = searchCriteria.department;
    }
    if (searchCriteria.semester) {
      searchQuery.semester = searchCriteria.semester;
    }
    if (searchCriteria.credits) {
      searchQuery.credits = searchCriteria.credits;
    }
    if (searchCriteria.instructor) {
      searchQuery.instructor = new mongoose.Types.ObjectId(searchCriteria.instructor);
    }

    // Credit range filters
    if (searchCriteria.minCredits || searchCriteria.maxCredits) {
      searchQuery.credits = {};
      if (searchCriteria.minCredits) {
        searchQuery.credits.$gte = searchCriteria.minCredits;
      }
      if (searchCriteria.maxCredits) {
        searchQuery.credits.$lte = searchCriteria.maxCredits;
      }
    }

    // Available spots filter
    if (searchCriteria.hasAvailableSpots) {
      searchQuery.$expr = {
        $lt: [{ $size: '$enrolledStudents' }, '$maxStudents']
      };
    }

    return Course.find(searchQuery)
      .populate('instructor', 'firstName lastName email')
      .sort({ department: 1, courseCode: 1 })
      .limit(100);
  }

  /**
   * Get course catalog with enhanced filtering and pagination
   */
  async getCourseCatalog(
    institutionId: string,
    options: {
      department?: string;
      semester?: string;
      credits?: number;
      search?: string;
      sortBy?: 'code' | 'name' | 'department' | 'credits';
      sortOrder?: 'asc' | 'desc';
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{
    courses: ICourse[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalCourses: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
    filters: {
      departments: Array<{ department: string; count: number }>;
      semesters: Array<{ semester: string; count: number }>;
      creditOptions: number[];
    };
  }> {
    const page = options.page || 1;
    const limit = options.limit || 20;
    const skip = (page - 1) * limit;

    // Build search criteria
    const searchCriteria: any = {
      department: options.department,
      semester: options.semester,
      credits: options.credits,
      query: options.search
    };

    // Get courses with advanced search
    const courses = await this.advancedSearchCourses(institutionId, searchCriteria);

    // Apply pagination
    const paginatedCourses = courses.slice(skip, skip + limit);

    // Get filter options
    const statistics = await this.getCourseStatistics(institutionId);
    const creditOptions = await Course.distinct('credits', {
      institutionId: new mongoose.Types.ObjectId(institutionId),
      isActive: true
    });

    return {
      courses: paginatedCourses,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(courses.length / limit),
        totalCourses: courses.length,
        hasNext: page * limit < courses.length,
        hasPrev: page > 1
      },
      filters: {
        departments: statistics.coursesByDepartment,
        semesters: statistics.coursesBySemester,
        creditOptions: creditOptions.sort((a, b) => a - b)
      }
    };
  }

  /**
   * Validate course data
   */
  private validateCourseData(courseData: CourseData): void {
    if (!courseData.courseCode || courseData.courseCode.trim().length === 0) {
      throw new Error('Course code is required');
    }

    if (!courseData.courseName || courseData.courseName.trim().length === 0) {
      throw new Error('Course name is required');
    }

    if (!courseData.description || courseData.description.trim().length === 0) {
      throw new Error('Course description is required');
    }

    if (!courseData.credits || courseData.credits < 1 || courseData.credits > 6) {
      throw new Error('Credits must be between 1 and 6');
    }

    if (!courseData.department || courseData.department.trim().length === 0) {
      throw new Error('Department is required');
    }

    if (!courseData.semester || courseData.semester.trim().length === 0) {
      throw new Error('Semester is required');
    }

    if (courseData.maxStudents && (courseData.maxStudents < 1 || courseData.maxStudents > 500)) {
      throw new Error('Maximum students must be between 1 and 500');
    }
  }
}

// Export both the class and a default instance
export const courseService = CourseService.getInstance();
export default courseService;