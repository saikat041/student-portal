import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { courseService } from '../services/CourseService';
import Institution, { IInstitution } from '../models/Institution';
import User, { IUser } from '../models/User';
import Course, { ICourse } from '../models/Course';

describe('Course Catalog and Search Tests', () => {
  let mongoServer: MongoMemoryServer;
  let institution: IInstitution;
  let teacher: IUser;
  let courses: ICourse[];

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clear all collections
    await Institution.deleteMany({});
    await User.deleteMany({});
    await Course.deleteMany({});

    // Create test institution
    institution = new Institution({
      name: 'Test University',
      type: 'university',
      address: {
        street: '123 Test St',
        city: 'Test City',
        state: 'TS',
        zipCode: '12345'
      },
      contactInfo: {
        email: 'admin@test.edu',
        phone: '555-0001'
      },
      status: 'active'
    });
    await institution.save();

    // Create test teacher
    teacher = new User({
      email: 'teacher@test.edu',
      password: 'hashedpassword',
      firstName: 'John',
      lastName: 'Teacher',
      institutions: [{
        institutionId: institution._id,
        role: 'teacher',
        status: 'active',
        profileData: {},
        createdAt: new Date()
      }]
    });
    await teacher.save();

    // Create test courses
    const courseData = [
      {
        courseCode: 'CS101',
        courseName: 'Introduction to Computer Science',
        description: 'Basic computer science concepts and programming fundamentals',
        credits: 3,
        department: 'Computer Science',
        semester: 'Fall 2024',
        maxStudents: 30
      },
      {
        courseCode: 'CS201',
        courseName: 'Data Structures and Algorithms',
        description: 'Advanced data structures and algorithm design',
        credits: 4,
        department: 'Computer Science',
        semester: 'Spring 2024',
        maxStudents: 25
      },
      {
        courseCode: 'MATH101',
        courseName: 'Calculus I',
        description: 'Introduction to differential calculus',
        credits: 4,
        department: 'Mathematics',
        semester: 'Fall 2024',
        maxStudents: 40
      },
      {
        courseCode: 'MATH201',
        courseName: 'Calculus II',
        description: 'Integral calculus and series',
        credits: 4,
        department: 'Mathematics',
        semester: 'Spring 2024',
        maxStudents: 35
      },
      {
        courseCode: 'PHYS101',
        courseName: 'Physics I',
        description: 'Mechanics and thermodynamics',
        credits: 3,
        department: 'Physics',
        semester: 'Fall 2024',
        maxStudents: 30
      }
    ];

    courses = [];
    for (const data of courseData) {
      const course = await courseService.createCourse(
        { ...data, teacherId: teacher._id.toString() },
        institution._id.toString()
      );
      courses.push(course);
    }
  });

  describe('Course Catalog Functionality', () => {
    it('should return paginated course catalog with filters', async () => {
      const catalog = await courseService.getCourseCatalog(
        institution._id.toString(),
        { page: 1, limit: 3 }
      );

      expect(catalog.courses).toHaveLength(3);
      expect(catalog.pagination.totalCourses).toBe(5);
      expect(catalog.pagination.totalPages).toBe(2);
      expect(catalog.pagination.hasNext).toBe(true);
      expect(catalog.pagination.hasPrev).toBe(false);
      expect(catalog.filters.departments).toHaveLength(3);
      expect(catalog.filters.semesters).toHaveLength(2);
    });

    it('should filter courses by department', async () => {
      const catalog = await courseService.getCourseCatalog(
        institution._id.toString(),
        { department: 'Computer Science' }
      );

      expect(catalog.courses).toHaveLength(2);
      catalog.courses.forEach(course => {
        expect(course.department).toBe('Computer Science');
      });
    });

    it('should filter courses by semester', async () => {
      const catalog = await courseService.getCourseCatalog(
        institution._id.toString(),
        { semester: 'Fall 2024' }
      );

      expect(catalog.courses).toHaveLength(3);
      catalog.courses.forEach(course => {
        expect(course.semester).toBe('Fall 2024');
      });
    });

    it('should filter courses by credits', async () => {
      const catalog = await courseService.getCourseCatalog(
        institution._id.toString(),
        { credits: 4 }
      );

      expect(catalog.courses).toHaveLength(3);
      catalog.courses.forEach(course => {
        expect(course.credits).toBe(4);
      });
    });

    it('should handle pagination correctly', async () => {
      // First page
      const page1 = await courseService.getCourseCatalog(
        institution._id.toString(),
        { page: 1, limit: 2 }
      );

      expect(page1.courses).toHaveLength(2);
      expect(page1.pagination.currentPage).toBe(1);
      expect(page1.pagination.hasNext).toBe(true);
      expect(page1.pagination.hasPrev).toBe(false);

      // Second page
      const page2 = await courseService.getCourseCatalog(
        institution._id.toString(),
        { page: 2, limit: 2 }
      );

      expect(page2.courses).toHaveLength(2);
      expect(page2.pagination.currentPage).toBe(2);
      expect(page2.pagination.hasNext).toBe(true);
      expect(page2.pagination.hasPrev).toBe(true);

      // Third page
      const page3 = await courseService.getCourseCatalog(
        institution._id.toString(),
        { page: 3, limit: 2 }
      );

      expect(page3.courses).toHaveLength(1);
      expect(page3.pagination.currentPage).toBe(3);
      expect(page3.pagination.hasNext).toBe(false);
      expect(page3.pagination.hasPrev).toBe(true);
    });
  });

  describe('Advanced Search Functionality', () => {
    it('should search courses by text query', async () => {
      const results = await courseService.advancedSearchCourses(
        institution._id.toString(),
        { query: 'calculus' }
      );

      expect(results).toHaveLength(2);
      results.forEach(course => {
        expect(course.courseName.toLowerCase()).toContain('calculus');
      });
    });

    it('should search courses by course code', async () => {
      const results = await courseService.advancedSearchCourses(
        institution._id.toString(),
        { query: 'CS101' }
      );

      expect(results).toHaveLength(1);
      expect(results[0].courseCode).toBe('CS101');
    });

    it('should search courses by description', async () => {
      const results = await courseService.advancedSearchCourses(
        institution._id.toString(),
        { query: 'programming' }
      );

      expect(results).toHaveLength(1);
      expect(results[0].description.toLowerCase()).toContain('programming');
    });

    it('should combine text search with department filter', async () => {
      const results = await courseService.advancedSearchCourses(
        institution._id.toString(),
        { 
          query: 'data',
          department: 'Computer Science'
        }
      );

      expect(results).toHaveLength(1);
      expect(results[0].courseName).toContain('Data Structures');
      expect(results[0].department).toBe('Computer Science');
    });

    it('should filter by credit range', async () => {
      const results = await courseService.advancedSearchCourses(
        institution._id.toString(),
        { 
          minCredits: 3,
          maxCredits: 3
        }
      );

      expect(results).toHaveLength(2);
      results.forEach(course => {
        expect(course.credits).toBe(3);
      });
    });

    it('should filter by instructor', async () => {
      const results = await courseService.advancedSearchCourses(
        institution._id.toString(),
        { instructor: teacher._id.toString() }
      );

      expect(results).toHaveLength(5);
      results.forEach(course => {
        expect(course.instructor._id.toString()).toBe(teacher._id.toString());
      });
    });

    it('should return empty results for non-matching search', async () => {
      const results = await courseService.advancedSearchCourses(
        institution._id.toString(),
        { query: 'nonexistent' }
      );

      expect(results).toHaveLength(0);
    });
  });

  describe('Course Browsing by Category', () => {
    it('should get courses by department', async () => {
      const csCourses = await courseService.getCoursesByInstitution(
        institution._id.toString(),
        { department: 'Computer Science' }
      );

      expect(csCourses).toHaveLength(2);
      csCourses.forEach(course => {
        expect(course.department).toBe('Computer Science');
      });
    });

    it('should get courses by semester', async () => {
      const fallCourses = await courseService.getCoursesByInstitution(
        institution._id.toString(),
        { semester: 'Fall 2024' }
      );

      expect(fallCourses).toHaveLength(3);
      fallCourses.forEach(course => {
        expect(course.semester).toBe('Fall 2024');
      });
    });

    it('should get courses by credits', async () => {
      const fourCreditCourses = await courseService.getCoursesByInstitution(
        institution._id.toString(),
        { credits: 4 }
      );

      expect(fourCreditCourses).toHaveLength(3);
      fourCreditCourses.forEach(course => {
        expect(course.credits).toBe(4);
      });
    });

    it('should respect institutional isolation in browsing', async () => {
      // Create another institution
      const institution2 = new Institution({
        name: 'Another University',
        type: 'university',
        address: {
          street: '456 Test Ave',
          city: 'Test Town',
          state: 'TS',
          zipCode: '67890'
        },
        contactInfo: {
          email: 'admin@another.edu',
          phone: '555-0002'
        },
        status: 'active'
      });
      await institution2.save();

      // Try to get courses from institution2 (should be empty)
      const courses = await courseService.getCoursesByInstitution(
        institution2._id.toString()
      );

      expect(courses).toHaveLength(0);
    });
  });

  describe('Course Statistics and Filters', () => {
    it('should return correct course statistics', async () => {
      const stats = await courseService.getCourseStatistics(
        institution._id.toString()
      );

      expect(stats.totalCourses).toBe(5);
      expect(stats.activeCourses).toBe(5);
      expect(stats.inactiveCourses).toBe(0);
      expect(stats.coursesByDepartment).toHaveLength(3);
      expect(stats.coursesBySemester).toHaveLength(2);

      // Check department counts
      const csDept = stats.coursesByDepartment.find(d => d.department === 'Computer Science');
      const mathDept = stats.coursesByDepartment.find(d => d.department === 'Mathematics');
      const physicsDept = stats.coursesByDepartment.find(d => d.department === 'Physics');

      expect(csDept?.count).toBe(2);
      expect(mathDept?.count).toBe(2);
      expect(physicsDept?.count).toBe(1);
    });

    it('should provide filter options in catalog', async () => {
      const catalog = await courseService.getCourseCatalog(
        institution._id.toString()
      );

      expect(catalog.filters.departments).toHaveLength(3);
      expect(catalog.filters.semesters).toHaveLength(2);
      expect(catalog.filters.creditOptions).toEqual([3, 4]);
    });
  });
});