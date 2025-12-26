import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { courseService } from '../services/CourseService';
import Institution, { IInstitution } from '../models/Institution';
import User, { IUser } from '../models/User';
import Course, { ICourse } from '../models/Course';

describe('Course Institutional Association Unit Tests', () => {
  let mongoServer: MongoMemoryServer;
  let institution1: IInstitution;
  let institution2: IInstitution;
  let teacher1: IUser;
  let teacher2: IUser;
  let admin1: IUser;

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

    // Create test institutions
    institution1 = new Institution({
      name: 'University of Test 1',
      type: 'university',
      address: {
        street: '123 Test St',
        city: 'Test City',
        state: 'TS',
        zipCode: '12345'
      },
      contactInfo: {
        email: 'admin@test1.edu',
        phone: '555-0001'
      },
      status: 'active'
    });

    institution2 = new Institution({
      name: 'University of Test 2',
      type: 'university',
      address: {
        street: '456 Test Ave',
        city: 'Test Town',
        state: 'TS',
        zipCode: '67890'
      },
      contactInfo: {
        email: 'admin@test2.edu',
        phone: '555-0002'
      },
      status: 'active'
    });

    await institution1.save();
    await institution2.save();

    // Create test users
    teacher1 = new User({
      email: 'teacher1@test.edu',
      password: 'hashedpassword',
      firstName: 'John',
      lastName: 'Teacher',
      institutions: [{
        institutionId: institution1._id,
        role: 'teacher',
        status: 'active',
        profileData: {},
        createdAt: new Date()
      }]
    });

    teacher2 = new User({
      email: 'teacher2@test.edu',
      password: 'hashedpassword',
      firstName: 'Jane',
      lastName: 'Teacher',
      institutions: [{
        institutionId: institution2._id,
        role: 'teacher',
        status: 'active',
        profileData: {},
        createdAt: new Date()
      }]
    });

    admin1 = new User({
      email: 'admin1@test.edu',
      password: 'hashedpassword',
      firstName: 'Admin',
      lastName: 'User',
      institutions: [{
        institutionId: institution1._id,
        role: 'institution_admin',
        status: 'active',
        profileData: {},
        createdAt: new Date()
      }]
    });

    await teacher1.save();
    await teacher2.save();
    await admin1.save();
  });

  describe('Course Creation with Institutional Linking', () => {
    it('should create course with proper institutional association', async () => {
      const courseData = {
        courseCode: 'CS101',
        courseName: 'Introduction to Computer Science',
        description: 'Basic computer science concepts',
        credits: 3,
        department: 'Computer Science',
        semester: 'Fall 2024',
        maxStudents: 30,
        teacherId: teacher1._id.toString()
      };

      const course = await courseService.createCourse(courseData, institution1._id.toString());

      expect(course).toBeDefined();
      expect(course.institutionId.toString()).toBe(institution1._id.toString());
      expect(course.courseCode).toBe('CS101');
      expect(course.courseName).toBe('Introduction to Computer Science');
      expect(course.instructor.toString()).toBe(teacher1._id.toString());
    });

    it('should prevent course creation with invalid institution', async () => {
      const courseData = {
        courseCode: 'CS102',
        courseName: 'Advanced Computer Science',
        description: 'Advanced computer science concepts',
        credits: 3,
        department: 'Computer Science',
        semester: 'Fall 2024',
        teacherId: teacher1._id.toString()
      };

      const invalidInstitutionId = new mongoose.Types.ObjectId().toString();

      await expect(
        courseService.createCourse(courseData, invalidInstitutionId)
      ).rejects.toThrow('Institution not found');
    });

    it('should prevent course creation with teacher from different institution', async () => {
      const courseData = {
        courseCode: 'CS103',
        courseName: 'Data Structures',
        description: 'Data structures and algorithms',
        credits: 4,
        department: 'Computer Science',
        semester: 'Fall 2024',
        teacherId: teacher2._id.toString() // Teacher from institution2
      };

      await expect(
        courseService.createCourse(courseData, institution1._id.toString())
      ).rejects.toThrow('Teacher does not have access to this institution or is not authorized to teach');
    });

    it('should enforce course code uniqueness within institution', async () => {
      const courseData1 = {
        courseCode: 'CS104',
        courseName: 'Programming Fundamentals',
        description: 'Basic programming concepts',
        credits: 3,
        department: 'Computer Science',
        semester: 'Fall 2024',
        teacherId: teacher1._id.toString()
      };

      const courseData2 = {
        courseCode: 'CS104', // Same course code
        courseName: 'Different Course',
        description: 'Different description',
        credits: 3,
        department: 'Computer Science',
        semester: 'Fall 2024',
        teacherId: teacher1._id.toString()
      };

      // First course should succeed
      await courseService.createCourse(courseData1, institution1._id.toString());

      // Second course with same code should fail
      await expect(
        courseService.createCourse(courseData2, institution1._id.toString())
      ).rejects.toThrow('Course code already exists within this institution');
    });

    it('should allow same course code in different institutions', async () => {
      const courseData = {
        courseCode: 'CS105',
        courseName: 'Software Engineering',
        description: 'Software development principles',
        credits: 3,
        department: 'Computer Science',
        semester: 'Fall 2024'
      };

      // Create course in institution1
      const course1 = await courseService.createCourse(
        { ...courseData, teacherId: teacher1._id.toString() },
        institution1._id.toString()
      );

      // Create course with same code in institution2
      const course2 = await courseService.createCourse(
        { ...courseData, teacherId: teacher2._id.toString() },
        institution2._id.toString()
      );

      expect(course1.courseCode).toBe('CS105');
      expect(course2.courseCode).toBe('CS105');
      expect(course1.institutionId.toString()).toBe(institution1._id.toString());
      expect(course2.institutionId.toString()).toBe(institution2._id.toString());
    });
  });

  describe('Course Access Restrictions by Institution', () => {
    let course1: ICourse;
    let course2: ICourse;

    beforeEach(async () => {
      // Create courses in different institutions
      course1 = await courseService.createCourse({
        courseCode: 'MATH101',
        courseName: 'Calculus I',
        description: 'Introduction to calculus',
        credits: 4,
        department: 'Mathematics',
        semester: 'Fall 2024',
        teacherId: teacher1._id.toString()
      }, institution1._id.toString());

      course2 = await courseService.createCourse({
        courseCode: 'MATH101',
        courseName: 'Calculus I',
        description: 'Introduction to calculus',
        credits: 4,
        department: 'Mathematics',
        semester: 'Fall 2024',
        teacherId: teacher2._id.toString()
      }, institution2._id.toString());
    });

    it('should only return courses from specified institution', async () => {
      const coursesInst1 = await courseService.getCoursesByInstitution(institution1._id.toString());
      const coursesInst2 = await courseService.getCoursesByInstitution(institution2._id.toString());

      expect(coursesInst1).toHaveLength(1);
      expect(coursesInst2).toHaveLength(1);
      expect(coursesInst1[0]._id.toString()).toBe(course1._id.toString());
      expect(coursesInst2[0]._id.toString()).toBe(course2._id.toString());
    });

    it('should prevent access to courses from different institution', async () => {
      // Try to get course1 using institution2 context
      const course = await courseService.getCourseById(
        course1._id.toString(),
        institution2._id.toString()
      );

      expect(course).toBeNull();
    });

    it('should allow access to courses within same institution', async () => {
      const course = await courseService.getCourseById(
        course1._id.toString(),
        institution1._id.toString()
      );

      expect(course).toBeDefined();
      expect(course!._id.toString()).toBe(course1._id.toString());
      expect(course!.institutionId.toString()).toBe(institution1._id.toString());
    });

    it('should filter search results by institution', async () => {
      const searchResults1 = await courseService.searchCourses('Calculus', institution1._id.toString());
      const searchResults2 = await courseService.searchCourses('Calculus', institution2._id.toString());

      expect(searchResults1).toHaveLength(1);
      expect(searchResults2).toHaveLength(1);
      expect(searchResults1[0]._id.toString()).toBe(course1._id.toString());
      expect(searchResults2[0]._id.toString()).toBe(course2._id.toString());
    });

    it('should filter teacher courses by institution', async () => {
      const teacher1Courses = await courseService.getCoursesByTeacher(
        teacher1._id.toString(),
        institution1._id.toString()
      );

      const teacher2Courses = await courseService.getCoursesByTeacher(
        teacher2._id.toString(),
        institution2._id.toString()
      );

      expect(teacher1Courses).toHaveLength(1);
      expect(teacher2Courses).toHaveLength(1);
      expect(teacher1Courses[0]._id.toString()).toBe(course1._id.toString());
      expect(teacher2Courses[0]._id.toString()).toBe(course2._id.toString());
    });

    it('should not return teacher courses from different institution', async () => {
      // Try to get teacher1's courses using institution2 context
      const courses = await courseService.getCoursesByTeacher(
        teacher1._id.toString(),
        institution2._id.toString()
      );

      expect(courses).toHaveLength(0);
    });
  });

  describe('Course Updates with Institutional Validation', () => {
    let course: ICourse;

    beforeEach(async () => {
      course = await courseService.createCourse({
        courseCode: 'PHYS101',
        courseName: 'Physics I',
        description: 'Introduction to physics',
        credits: 4,
        department: 'Physics',
        semester: 'Fall 2024',
        teacherId: teacher1._id.toString()
      }, institution1._id.toString());
    });

    it('should update course within same institution', async () => {
      const updatedCourse = await courseService.updateCourse(
        course._id.toString(),
        institution1._id.toString(),
        { courseName: 'Advanced Physics I' }
      );

      expect(updatedCourse.courseName).toBe('Advanced Physics I');
      expect(updatedCourse.institutionId.toString()).toBe(institution1._id.toString());
    });

    it('should prevent course update from different institution', async () => {
      await expect(
        courseService.updateCourse(
          course._id.toString(),
          institution2._id.toString(),
          { courseName: 'Hacked Course' }
        )
      ).rejects.toThrow('Course not found within this institution');
    });

    it('should validate teacher assignment within institution', async () => {
      // Should succeed with teacher from same institution
      const updatedCourse = await courseService.assignTeacher(
        course._id.toString(),
        teacher1._id.toString(),
        institution1._id.toString()
      );

      expect(updatedCourse.instructor._id.toString()).toBe(teacher1._id.toString());

      // Should fail with teacher from different institution
      await expect(
        courseService.assignTeacher(
          course._id.toString(),
          teacher2._id.toString(),
          institution1._id.toString()
        )
      ).rejects.toThrow('Teacher does not have access to this institution or is not authorized to teach');
    });
  });

  describe('Course Statistics by Institution', () => {
    beforeEach(async () => {
      // Create multiple courses in institution1
      await courseService.createCourse({
        courseCode: 'CS201',
        courseName: 'Data Structures',
        description: 'Advanced data structures',
        credits: 3,
        department: 'Computer Science',
        semester: 'Fall 2024',
        teacherId: teacher1._id.toString()
      }, institution1._id.toString());

      await courseService.createCourse({
        courseCode: 'MATH201',
        courseName: 'Calculus II',
        description: 'Advanced calculus',
        credits: 4,
        department: 'Mathematics',
        semester: 'Fall 2024',
        teacherId: teacher1._id.toString()
      }, institution1._id.toString());

      // Create one course in institution2
      await courseService.createCourse({
        courseCode: 'CS301',
        courseName: 'Algorithms',
        description: 'Algorithm design and analysis',
        credits: 3,
        department: 'Computer Science',
        semester: 'Fall 2024',
        teacherId: teacher2._id.toString()
      }, institution2._id.toString());
    });

    it('should return correct statistics for each institution', async () => {
      const stats1 = await courseService.getCourseStatistics(institution1._id.toString());
      const stats2 = await courseService.getCourseStatistics(institution2._id.toString());

      expect(stats1.totalCourses).toBe(2);
      expect(stats1.activeCourses).toBe(2);
      expect(stats1.inactiveCourses).toBe(0);
      expect(stats1.coursesByDepartment).toHaveLength(2);

      expect(stats2.totalCourses).toBe(1);
      expect(stats2.activeCourses).toBe(1);
      expect(stats2.inactiveCourses).toBe(0);
      expect(stats2.coursesByDepartment).toHaveLength(1);
    });

    it('should group courses by department within institution', async () => {
      const stats = await courseService.getCourseStatistics(institution1._id.toString());
      
      const csDepartment = stats.coursesByDepartment.find(d => d.department === 'Computer Science');
      const mathDepartment = stats.coursesByDepartment.find(d => d.department === 'Mathematics');

      expect(csDepartment?.count).toBe(1);
      expect(mathDepartment?.count).toBe(1);
    });
  });
});