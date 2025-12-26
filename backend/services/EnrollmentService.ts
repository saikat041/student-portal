import mongoose from 'mongoose';
import Enrollment, { IEnrollment, EnrollmentStatus } from '../models/Enrollment';
import Course, { ICourse } from '../models/Course';
import Student, { IStudent } from '../models/Student';
import User, { IUser } from '../models/User';
import { AccessValidator } from './AccessValidator';
import { TenantContextManager } from './TenantContextManager';

export interface EnrollmentData {
  studentId: string;
  courseId: string;
  semester: string;
  academicYear: string;
}

export interface EnrollmentValidationResult {
  valid: boolean;
  reason?: string;
  student?: IStudent;
  course?: ICourse;
}

export interface EnrollmentStatistics {
  totalEnrollments: number;
  activeEnrollments: number;
  completedEnrollments: number;
  droppedEnrollments: number;
  totalCredits: number;
  gpa?: number;
}

/**
 * EnrollmentService - Manages student enrollments with institutional validation
 * Implements triple validation: student, course, and enrollment must all belong to same institution
 * Requirements: 4.4, 9.4, 5.2, 5.5
 */
export class EnrollmentService {
  private static instance: EnrollmentService;
  private accessValidator: AccessValidator;
  private tenantManager: TenantContextManager;

  private constructor() {
    this.accessValidator = AccessValidator.getInstance();
    this.tenantManager = TenantContextManager.getInstance();
  }

  public static getInstance(): EnrollmentService {
    if (!EnrollmentService.instance) {
      EnrollmentService.instance = new EnrollmentService();
    }
    return EnrollmentService.instance;
  }

  /**
   * Validate enrollment eligibility with institutional boundary checks
   * Requirements: 4.4, 9.4 - Cross-institutional enrollment prevention
   */
  public async validateEnrollmentEligibility(
    userId: string,
    courseId: string,
    institutionId: string,
    semester: string
  ): Promise<EnrollmentValidationResult> {
    try {
      // Find student profile within the current institution
      const student = await Student.findOne({
        user: userId,
        institutionId: new mongoose.Types.ObjectId(institutionId)
      });

      if (!student) {
        return {
          valid: false,
          reason: 'Student profile not found in current institution'
        };
      }

      if (!student.isActive) {
        return {
          valid: false,
          reason: 'Student account is not active'
        };
      }

      // Find course within the current institution (CRITICAL: institutional filtering)
      const course = await Course.findOne({
        _id: courseId,
        institutionId: new mongoose.Types.ObjectId(institutionId)
      });

      if (!course) {
        return {
          valid: false,
          reason: 'Course not found in current institution'
        };
      }

      if (!course.isActive) {
        return {
          valid: false,
          reason: 'Course is not active'
        };
      }

      // Check for existing enrollment in same semester
      const existingEnrollment = await Enrollment.findOne({
        student: student._id,
        course: courseId,
        institutionId: new mongoose.Types.ObjectId(institutionId),
        semester,
        status: 'enrolled'
      });

      if (existingEnrollment) {
        return {
          valid: false,
          reason: 'Already enrolled in this course for this semester'
        };
      }

      // Check course capacity
      if (course.enrolledStudents.length >= course.maxStudents) {
        return {
          valid: false,
          reason: 'Course is at maximum capacity'
        };
      }

      // Check credit limit
      const currentCredits = student.totalCredits || 0;
      if (currentCredits + course.credits > student.maxCredits) {
        return {
          valid: false,
          reason: `Enrollment would exceed credit limit. Current: ${currentCredits}, Course: ${course.credits}, Max: ${student.maxCredits}`
        };
      }

      return {
        valid: true,
        student,
        course
      };
    } catch (error) {
      console.error('Error validating enrollment eligibility:', error);
      return {
        valid: false,
        reason: 'Failed to validate enrollment eligibility'
      };
    }
  }

  /**
   * Create enrollment with triple validation and institutional boundary checks
   * Requirements: 4.4, 9.4 - Cross-institutional enrollment prevention
   */
  public async createEnrollment(
    user: IUser,
    enrollmentData: EnrollmentData,
    institutionId: string,
    request?: any
  ): Promise<{ success: boolean; enrollment?: IEnrollment; error?: string }> {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Validate cross-institutional access
      const accessValidation = await this.accessValidator.validateCrossInstitutionalAccess(
        user,
        institutionId,
        'enroll',
        'course',
        enrollmentData.courseId,
        request
      );

      if (!accessValidation.allowed) {
        await session.abortTransaction();
        session.endSession();
        return {
          success: false,
          error: `Cross-institutional enrollment prevented: ${accessValidation.reason}`
        };
      }

      // Validate enrollment eligibility
      const validation = await this.validateEnrollmentEligibility(
        user._id.toString(),
        enrollmentData.courseId,
        institutionId,
        enrollmentData.semester
      );

      if (!validation.valid) {
        await session.abortTransaction();
        session.endSession();
        return {
          success: false,
          error: validation.reason
        };
      }

      const { student, course } = validation;
      if (!student || !course) {
        await session.abortTransaction();
        session.endSession();
        return {
          success: false,
          error: 'Student or course validation failed'
        };
      }

      // Create enrollment with institutional context (CRITICAL: triple validation)
      const enrollment = new Enrollment({
        student: student._id,
        course: course._id,
        institutionId: new mongoose.Types.ObjectId(institutionId), // CRITICAL: Set institutional context
        enrollmentDate: new Date(),
        status: 'enrolled' as EnrollmentStatus,
        credits: course.credits,
        semester: enrollmentData.semester,
        academicYear: enrollmentData.academicYear,
        courseSnapshot: {
          code: course.courseCode,
          name: course.courseName,
          credits: course.credits,
          semester: course.semester
        }
      });

      await enrollment.save({ session });

      // Update course enrolled students
      course.enrolledStudents.push(student._id);
      await course.save({ session });

      // Update student's enrolled courses and total credits
      student.enrolledCourses.push(course._id);
      student.totalCredits = (student.totalCredits || 0) + course.credits;
      await student.save({ session });

      await session.commitTransaction();
      session.endSession();

      // Log successful enrollment for audit
      await this.accessValidator.logSuccessfulAccess(
        user,
        institutionId,
        'enroll',
        'course',
        enrollmentData.courseId,
        request,
        `Successfully enrolled in course ${course.courseCode}`
      );

      return {
        success: true,
        enrollment
      };
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      console.error('Error creating enrollment:', error);
      return {
        success: false,
        error: 'Failed to create enrollment'
      };
    }
  }

  /**
   * Drop student from course with institutional validation
   * Requirements: 4.4, 9.4 - Cross-institutional validation
   */
  public async dropEnrollment(
    user: IUser,
    courseId: string,
    institutionId: string,
    request?: any
  ): Promise<{ success: boolean; enrollment?: IEnrollment; error?: string }> {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Validate cross-institutional access
      const accessValidation = await this.accessValidator.validateCrossInstitutionalAccess(
        user,
        institutionId,
        'drop',
        'course',
        courseId,
        request
      );

      if (!accessValidation.allowed) {
        await session.abortTransaction();
        session.endSession();
        return {
          success: false,
          error: `Cross-institutional operation prevented: ${accessValidation.reason}`
        };
      }

      // Find student profile within the current institution
      const student = await Student.findOne({
        user: user._id,
        institutionId: new mongoose.Types.ObjectId(institutionId)
      }).session(session);

      if (!student) {
        await session.abortTransaction();
        session.endSession();
        return {
          success: false,
          error: 'Student profile not found in current institution'
        };
      }

      // Find course within the current institution
      const course = await Course.findOne({
        _id: courseId,
        institutionId: new mongoose.Types.ObjectId(institutionId)
      }).session(session);

      if (!course) {
        await session.abortTransaction();
        session.endSession();
        return {
          success: false,
          error: 'Course not found in current institution'
        };
      }

      // Find enrollment with institutional validation
      const enrollment = await Enrollment.findOne({
        student: student._id,
        course: courseId,
        institutionId: new mongoose.Types.ObjectId(institutionId), // CRITICAL: institutional filtering
        status: 'enrolled'
      }).session(session);

      if (!enrollment) {
        await session.abortTransaction();
        session.endSession();
        return {
          success: false,
          error: 'Enrollment not found in current institution'
        };
      }

      // Update enrollment status to dropped
      enrollment.status = 'dropped';
      await enrollment.save({ session });

      // Remove student from course enrolled students
      course.enrolledStudents = course.enrolledStudents.filter(
        (id) => id.toString() !== student._id.toString()
      );
      await course.save({ session });

      // Update student's enrolled courses and total credits
      student.enrolledCourses = student.enrolledCourses.filter(
        (id) => id.toString() !== courseId
      );
      student.totalCredits = Math.max(0, (student.totalCredits || 0) - enrollment.credits);
      await student.save({ session });

      await session.commitTransaction();
      session.endSession();

      // Log successful drop for audit
      await this.accessValidator.logSuccessfulAccess(
        user,
        institutionId,
        'drop',
        'course',
        courseId,
        request,
        `Successfully dropped from course ${course.courseCode}`
      );

      return {
        success: true,
        enrollment
      };
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      console.error('Error dropping enrollment:', error);
      return {
        success: false,
        error: 'Failed to drop enrollment'
      };
    }
  }

  /**
   * Get student enrollments with institutional filtering
   * Requirements: 5.2 - Enrollment history within institutional boundaries
   */
  public async getStudentEnrollments(
    userId: string,
    institutionId: string,
    status?: EnrollmentStatus
  ): Promise<IEnrollment[]> {
    try {
      // Find student profile within the current institution
      const student = await Student.findOne({
        user: userId,
        institutionId: new mongoose.Types.ObjectId(institutionId)
      });

      if (!student) {
        return [];
      }

      // Build query with institutional filtering
      const query: any = {
        student: student._id,
        institutionId: new mongoose.Types.ObjectId(institutionId) // CRITICAL: institutional filtering
      };

      if (status) {
        query.status = status;
      }

      const enrollments = await Enrollment.find(query)
        .populate({
          path: 'course',
          select: 'courseCode courseName description credits department instructor semester maxStudents',
          populate: {
            path: 'instructor',
            select: 'firstName lastName email'
          }
        })
        .sort({ enrollmentDate: -1 });

      return enrollments;
    } catch (error) {
      console.error('Error fetching student enrollments:', error);
      return [];
    }
  }

  /**
   * Get course enrollments with institutional filtering
   * Requirements: 5.2 - Course enrollment data within institutional boundaries
   */
  public async getCourseEnrollments(
    courseId: string,
    institutionId: string,
    status?: EnrollmentStatus
  ): Promise<IEnrollment[]> {
    try {
      // Verify course exists in current institution
      const course = await Course.findOne({
        _id: courseId,
        institutionId: new mongoose.Types.ObjectId(institutionId)
      });

      if (!course) {
        return [];
      }

      // Build query with institutional filtering
      const query: any = {
        course: courseId,
        institutionId: new mongoose.Types.ObjectId(institutionId) // CRITICAL: institutional filtering
      };

      if (status) {
        query.status = status;
      }

      const enrollments = await Enrollment.find(query)
        .populate({
          path: 'student',
          select: 'studentId major year gpa user',
          populate: {
            path: 'user',
            select: 'firstName lastName email'
          }
        })
        .sort({ enrollmentDate: 1 });

      return enrollments;
    } catch (error) {
      console.error('Error fetching course enrollments:', error);
      return [];
    }
  }

  /**
   * Calculate GPA within institutional boundaries
   * Requirements: 5.5 - GPA calculation within institutional boundaries
   */
  public async calculateGPA(userId: string, institutionId: string): Promise<number> {
    try {
      // Find student profile within the current institution
      const student = await Student.findOne({
        user: userId,
        institutionId: new mongoose.Types.ObjectId(institutionId)
      });

      if (!student) {
        return 0;
      }

      // Get completed enrollments with grades within current institution
      const completedEnrollments = await Enrollment.find({
        student: student._id,
        institutionId: new mongoose.Types.ObjectId(institutionId), // CRITICAL: institutional filtering
        status: 'completed',
        grade: { $exists: true, $ne: null }
      });

      if (completedEnrollments.length === 0) {
        return 0;
      }

      // Calculate weighted GPA
      let totalGradePoints = 0;
      let totalCredits = 0;

      for (const enrollment of completedEnrollments) {
        const gradePoint = this.convertGradeToPoints(enrollment.grade!);
        if (gradePoint >= 0) {
          totalGradePoints += gradePoint * enrollment.credits;
          totalCredits += enrollment.credits;
        }
      }

      return totalCredits > 0 ? totalGradePoints / totalCredits : 0;
    } catch (error) {
      console.error('Error calculating GPA:', error);
      return 0;
    }
  }

  /**
   * Get enrollment statistics for a student within institutional boundaries
   * Requirements: 5.2, 5.5 - Enrollment statistics and reporting
   */
  public async getEnrollmentStatistics(
    userId: string,
    institutionId: string
  ): Promise<EnrollmentStatistics> {
    try {
      // Find student profile within the current institution
      const student = await Student.findOne({
        user: userId,
        institutionId: new mongoose.Types.ObjectId(institutionId)
      });

      if (!student) {
        return {
          totalEnrollments: 0,
          activeEnrollments: 0,
          completedEnrollments: 0,
          droppedEnrollments: 0,
          totalCredits: 0
        };
      }

      // Get all enrollments within current institution
      const enrollments = await Enrollment.find({
        student: student._id,
        institutionId: new mongoose.Types.ObjectId(institutionId) // CRITICAL: institutional filtering
      });

      const statistics: EnrollmentStatistics = {
        totalEnrollments: enrollments.length,
        activeEnrollments: enrollments.filter(e => e.status === 'enrolled').length,
        completedEnrollments: enrollments.filter(e => e.status === 'completed').length,
        droppedEnrollments: enrollments.filter(e => e.status === 'dropped').length,
        totalCredits: enrollments
          .filter(e => e.status === 'enrolled' || e.status === 'completed')
          .reduce((sum, e) => sum + e.credits, 0)
      };

      // Calculate GPA if there are completed courses
      if (statistics.completedEnrollments > 0) {
        statistics.gpa = await this.calculateGPA(userId, institutionId);
      }

      return statistics;
    } catch (error) {
      console.error('Error getting enrollment statistics:', error);
      return {
        totalEnrollments: 0,
        activeEnrollments: 0,
        completedEnrollments: 0,
        droppedEnrollments: 0,
        totalCredits: 0
      };
    }
  }

  /**
   * Convert letter grade to grade points
   * Private helper method for GPA calculation
   */
  private convertGradeToPoints(grade: string): number {
    const gradeMap: { [key: string]: number } = {
      'A+': 4.0, 'A': 4.0, 'A-': 3.7,
      'B+': 3.3, 'B': 3.0, 'B-': 2.7,
      'C+': 2.3, 'C': 2.0, 'C-': 1.7,
      'D+': 1.3, 'D': 1.0, 'D-': 0.7,
      'F': 0.0
    };

    return gradeMap[grade.toUpperCase()] ?? -1; // Return -1 for invalid grades
  }

  /**
   * Validate that student, course, and enrollment all belong to same institution
   * Requirements: 4.4, 9.4 - Triple validation for cross-institutional prevention
   */
  public async validateTripleInstitutionalConsistency(
    studentId: string,
    courseId: string,
    institutionId: string
  ): Promise<{ valid: boolean; reason?: string }> {
    try {
      // Validate student belongs to institution
      const student = await Student.findOne({
        _id: studentId,
        institutionId: new mongoose.Types.ObjectId(institutionId)
      });

      if (!student) {
        return {
          valid: false,
          reason: 'Student does not belong to the specified institution'
        };
      }

      // Validate course belongs to institution
      const course = await Course.findOne({
        _id: courseId,
        institutionId: new mongoose.Types.ObjectId(institutionId)
      });

      if (!course) {
        return {
          valid: false,
          reason: 'Course does not belong to the specified institution'
        };
      }

      return { valid: true };
    } catch (error) {
      console.error('Error validating triple institutional consistency:', error);
      return {
        valid: false,
        reason: 'Failed to validate institutional consistency'
      };
    }
  }
}

export default EnrollmentService.getInstance();