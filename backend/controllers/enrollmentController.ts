import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Enrollment, { IEnrollment } from '../models/Enrollment';
import Course, { ICourse } from '../models/Course';
import Student, { IStudent } from '../models/Student';
import { IUser } from '../models/User';
import { AuthenticatedRequest, TenantContext } from '../services/TenantContextManager';
import { AccessValidator } from '../services/AccessValidator';
import EnrollmentService from '../services/EnrollmentService';

interface EnrollRequest extends AuthenticatedRequest {
  body: {
    courseId: string;
    semester: string;
    academicYear: string;
  };
  tenantContext?: TenantContext;
  dbFilter?: { institutionId: mongoose.Types.ObjectId };
}

// Constants for retry logic
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 100;

/**
 * Helper function to delay execution for retry logic
 */
const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Helper function to check if error is a version conflict (optimistic locking failure)
 */
const isVersionConflict = (error: unknown): boolean => {
  if (error instanceof mongoose.Error.VersionError) {
    return true;
  }
  // Check for MongoDB write conflict error
  if (error && typeof error === 'object' && 'code' in error) {
    const mongoError = error as { code: number };
    return mongoError.code === 112; // WriteConflict error code
  }
  return false;
};

/**
 * Enroll a student in a course with capacity checking and concurrency control
 * Requirements: 2.1, 2.2, 2.3, 8.1, 8.5, 4.4, 9.4 (Cross-institutional enrollment prevention)
 * Uses optimistic locking with retry logic for concurrent enrollment attempts
 */
export const enrollStudent = async (req: EnrollRequest, res: Response): Promise<void> => {
  const { courseId, semester, academicYear } = req.body;
  const userId = req.user._id;

  // Validate required fields
  if (!courseId || !semester || !academicYear) {
    res.status(400).json({ error: 'Course ID, semester, and academic year are required' });
    return;
  }

  // Validate institutional context is established (Requirements 4.4, 9.4)
  if (!req.tenantContext) {
    res.status(400).json({ 
      error: 'Institutional context required',
      message: 'Please select an institution to continue'
    });
    return;
  }

  const institutionId = req.tenantContext.institutionId;
  const accessValidator = AccessValidator.getInstance();

  let lastError: unknown = null;

  // Retry loop for handling concurrent enrollment attempts (Requirement 8.1)
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Find the student profile for this user within the current institution
      const student = await Student.findOne({ 
        user: userId,
        institutionId: institutionId // Ensure student belongs to current institution
      }).session(session);
      
      if (!student) {
        await session.abortTransaction();
        session.endSession();
        res.status(404).json({ error: 'Student profile not found in current institution' });
        return;
      }

      if (!student.isActive) {
        await session.abortTransaction();
        session.endSession();
        res.status(403).json({ error: 'Student account is not active' });
        return;
      }

      // Find the course with institutional validation (Requirements 4.4, 9.4)
      const course = await Course.findOne({
        _id: courseId,
        institutionId: institutionId // CRITICAL: Ensure course belongs to current institution
      }).session(session);
      
      if (!course) {
        await session.abortTransaction();
        session.endSession();
        
        // Log cross-institutional access attempt for security audit
        await accessValidator.logCrossInstitutionalAttempt(
          req.user,
          institutionId.toString(),
          'enrollment',
          'course',
          courseId,
          req,
          'Attempted to enroll in course from different institution'
        );
        
        res.status(404).json({ 
          error: 'Course not found',
          message: 'Course not available in your current institution'
        });
        return;
      }

      if (!course.isActive) {
        await session.abortTransaction();
        session.endSession();
        res.status(400).json({ error: 'Course is not active' });
        return;
      }

      // Validate cross-institutional access using AccessValidator
      const accessValidation = await accessValidator.validateCrossInstitutionalAccess(
        req.user,
        institutionId.toString(),
        'enroll',
        'course',
        courseId,
        req
      );

      if (!accessValidation.allowed) {
        await session.abortTransaction();
        session.endSession();
        res.status(403).json({ 
          error: 'Cross-institutional enrollment prevented',
          message: accessValidation.reason
        });
        return;
      }

      // Check if course is at capacity (Requirement 2.3)
      if (course.enrolledStudents.length >= course.maxStudents) {
        await session.abortTransaction();
        session.endSession();
        res.status(409).json({ error: 'Course is full. No available spots.' });
        return;
      }

      // Check for duplicate enrollment (Requirement 2.4)
      const existingEnrollment = await Enrollment.findOne({
        student: student._id,
        course: courseId,
        institutionId: institutionId, // Include institution in duplicate check
        semester,
        status: 'enrolled'
      }).session(session);

      if (existingEnrollment) {
        await session.abortTransaction();
        session.endSession();
        res.status(400).json({ error: 'Already enrolled in this course for this semester' });
        return;
      }

      // Check credit limit
      const currentCredits = student.totalCredits || 0;
      if (currentCredits + course.credits > student.maxCredits) {
        await session.abortTransaction();
        session.endSession();
        res.status(422).json({ 
          error: `Enrollment would exceed credit limit. Current: ${currentCredits}, Course: ${course.credits}, Max: ${student.maxCredits}` 
        });
        return;
      }

      // Create enrollment record with institutional context (Requirements 4.4, 9.4)
      const enrollment = new Enrollment({
        student: student._id,
        course: courseId,
        institutionId: institutionId, // CRITICAL: Set institutional context
        enrollmentDate: new Date(),
        status: 'enrolled',
        credits: course.credits,
        semester,
        academicYear,
        courseSnapshot: {
          code: course.courseCode,
          name: course.courseName,
          credits: course.credits,
          semester: course.semester
        }
      });

      await enrollment.save({ session });

      // Update course enrolled students (Requirement 2.2 - decrease available spots)
      // This will trigger optimistic locking check via __v field
      course.enrolledStudents.push(student._id);
      await course.save({ session });

      // Update student's enrolled courses and total credits
      student.enrolledCourses.push(course._id);
      student.totalCredits = currentCredits + course.credits;
      await student.save({ session });

      await session.commitTransaction();
      session.endSession();

      // Log successful enrollment for audit
      await accessValidator.logSuccessfulAccess(
        req.user,
        institutionId.toString(),
        'enroll',
        'course',
        courseId,
        req,
        `Successfully enrolled in course ${course.courseCode}`
      );

      // Populate enrollment for response
      await enrollment.populate('course', 'courseCode courseName credits instructor');
      await enrollment.populate('student', 'studentId');

      res.status(201).json({
        message: 'Successfully enrolled in course',
        enrollment
      });
      return;
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      lastError = error;

      // Check if this is a version conflict (concurrent modification)
      if (isVersionConflict(error)) {
        console.log(`Enrollment attempt ${attempt + 1} failed due to concurrent modification, retrying...`);
        if (attempt < MAX_RETRIES - 1) {
          // Exponential backoff with jitter
          const backoffDelay = RETRY_DELAY_MS * Math.pow(2, attempt) + Math.random() * 50;
          await delay(backoffDelay);
          continue;
        }
      }

      // Handle duplicate key error from unique index
      if ((error as any).code === 11000) {
        res.status(400).json({ error: 'Already enrolled in this course for this semester' });
        return;
      }

      // For non-retryable errors, break out of retry loop
      break;
    }
  }

  // If we've exhausted all retries or encountered a non-retryable error
  console.error('Error enrolling student:', lastError);
  
  if (isVersionConflict(lastError)) {
    res.status(409).json({ 
      error: 'Unable to complete enrollment due to high demand. Please try again.' 
    });
    return;
  }
  
  res.status(500).json({ error: 'Failed to enroll in course' });
};


/**
 * Drop a student from a course with spot restoration
 * Requirements: 4.1, 4.2, 8.1, 8.5, 4.4, 9.4 (Cross-institutional validation)
 * Uses optimistic locking with retry logic for concurrent drop attempts
 */
export const dropStudent = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { courseId } = req.params;
  const userId = req.user._id;

  // Validate institutional context is established (Requirements 4.4, 9.4)
  if (!req.tenantContext) {
    res.status(400).json({ 
      error: 'Institutional context required',
      message: 'Please select an institution to continue'
    });
    return;
  }

  const institutionId = req.tenantContext.institutionId;
  const accessValidator = AccessValidator.getInstance();

  let lastError: unknown = null;

  // Retry loop for handling concurrent drop attempts (Requirement 8.1)
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Find the student profile for this user within the current institution
      const student = await Student.findOne({ 
        user: userId,
        institutionId: institutionId // Ensure student belongs to current institution
      }).session(session);
      
      if (!student) {
        await session.abortTransaction();
        session.endSession();
        res.status(404).json({ error: 'Student profile not found in current institution' });
        return;
      }

      // Find the course with institutional validation (Requirements 4.4, 9.4)
      const course = await Course.findOne({
        _id: courseId,
        institutionId: institutionId // CRITICAL: Ensure course belongs to current institution
      }).session(session);
      
      if (!course) {
        await session.abortTransaction();
        session.endSession();
        
        // Log cross-institutional access attempt for security audit
        await accessValidator.logCrossInstitutionalAttempt(
          req.user,
          institutionId.toString(),
          'drop',
          'course',
          courseId,
          req,
          'Attempted to drop from course in different institution'
        );
        
        res.status(404).json({ 
          error: 'Course not found',
          message: 'Course not available in your current institution'
        });
        return;
      }

      // Find the enrollment with institutional validation
      const enrollment = await Enrollment.findOne({
        student: student._id,
        course: courseId,
        institutionId: institutionId, // CRITICAL: Ensure enrollment belongs to current institution
        status: 'enrolled'
      }).session(session);

      if (!enrollment) {
        await session.abortTransaction();
        session.endSession();
        res.status(404).json({ error: 'Enrollment not found in current institution' });
        return;
      }

      // Validate cross-institutional access using AccessValidator
      const accessValidation = await accessValidator.validateCrossInstitutionalAccess(
        req.user,
        institutionId.toString(),
        'drop',
        'course',
        courseId,
        req
      );

      if (!accessValidation.allowed) {
        await session.abortTransaction();
        session.endSession();
        res.status(403).json({ 
          error: 'Cross-institutional operation prevented',
          message: accessValidation.reason
        });
        return;
      }

      // Update enrollment status to dropped
      enrollment.status = 'dropped';
      await enrollment.save({ session });

      // Remove student from course enrolled students (Requirement 4.2 - increase available spots)
      // This will trigger optimistic locking check via __v field
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
      await accessValidator.logSuccessfulAccess(
        req.user,
        institutionId.toString(),
        'drop',
        'course',
        courseId,
        req,
        `Successfully dropped from course ${course.courseCode}`
      );

      res.json({
        message: 'Successfully dropped from course',
        enrollment
      });
      return;
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      lastError = error;

      // Check if this is a version conflict (concurrent modification)
      if (isVersionConflict(error)) {
        console.log(`Drop attempt ${attempt + 1} failed due to concurrent modification, retrying...`);
        if (attempt < MAX_RETRIES - 1) {
          // Exponential backoff with jitter
          const backoffDelay = RETRY_DELAY_MS * Math.pow(2, attempt) + Math.random() * 50;
          await delay(backoffDelay);
          continue;
        }
      }

      // For non-retryable errors, break out of retry loop
      break;
    }
  }

  // If we've exhausted all retries or encountered a non-retryable error
  console.error('Error dropping student:', lastError);
  
  if (isVersionConflict(lastError)) {
    res.status(409).json({ 
      error: 'Unable to complete drop operation due to high demand. Please try again.' 
    });
    return;
  }
  
  res.status(500).json({ error: 'Failed to drop from course' });
};


/**
 * Get all enrollments for a student (for dashboard)
 * Requirement: 5.1, 4.4, 9.4 (Institutional filtering)
 */
export const getStudentEnrollments = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user._id;

    // Validate institutional context is established (Requirements 4.4, 9.4)
    if (!req.tenantContext) {
      res.status(400).json({ 
        error: 'Institutional context required',
        message: 'Please select an institution to continue'
      });
      return;
    }

    const institutionId = req.tenantContext.institutionId;

    // Find the student profile for this user within the current institution
    const student = await Student.findOne({ 
      user: userId,
      institutionId: institutionId // CRITICAL: Filter by institution
    });
    
    if (!student) {
      res.status(404).json({ error: 'Student profile not found in current institution' });
      return;
    }

    // Get enrollments with institutional filtering (Requirements 4.4, 9.4)
    const enrollments = await Enrollment.find({
      student: student._id,
      institutionId: institutionId, // CRITICAL: Filter by institution
      status: 'enrolled'
    })
      .populate({
        path: 'course',
        select: 'courseCode courseName description credits department instructor semester maxStudents enrolledStudents',
        populate: {
          path: 'instructor',
          select: 'firstName lastName email'
        }
      })
      .sort({ enrollmentDate: -1 });

    // Calculate total credits
    const totalCredits = enrollments.reduce((sum, e) => sum + e.credits, 0);

    res.json({
      enrollments,
      totalCredits,
      maxCredits: student.maxCredits,
      institution: {
        id: institutionId,
        name: req.tenantContext.institution.name
      }
    });
  } catch (error) {
    console.error('Error fetching student enrollments:', error);
    res.status(500).json({ error: 'Failed to fetch enrollments' });
  }
};

/**
 * Get all enrollments for a course (for teacher view)
 * Requirement: 5.1, 4.4, 9.4 (Institutional filtering)
 */
export const getCourseEnrollments = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { courseId } = req.params;

    // Validate institutional context is established (Requirements 4.4, 9.4)
    if (!req.tenantContext) {
      res.status(400).json({ 
        error: 'Institutional context required',
        message: 'Please select an institution to continue'
      });
      return;
    }

    const institutionId = req.tenantContext.institutionId;

    // Find the course with institutional validation (Requirements 4.4, 9.4)
    const course = await Course.findOne({
      _id: courseId,
      institutionId: institutionId // CRITICAL: Ensure course belongs to current institution
    });
    
    if (!course) {
      res.status(404).json({ 
        error: 'Course not found',
        message: 'Course not available in your current institution'
      });
      return;
    }

    // For teachers, verify they own the course within the current institution
    if (req.user.role === 'teacher' && course.instructor.toString() !== req.user._id.toString()) {
      res.status(403).json({ error: 'You can only view enrollments for your own courses' });
      return;
    }

    // Get enrollments with institutional filtering (Requirements 4.4, 9.4)
    const enrollments = await Enrollment.find({
      course: courseId,
      institutionId: institutionId, // CRITICAL: Filter by institution
      status: 'enrolled'
    })
      .populate({
        path: 'student',
        select: 'studentId major year gpa user',
        populate: {
          path: 'user',
          select: 'firstName lastName email'
        }
      })
      .sort({ enrollmentDate: 1 });

    res.json({
      course: {
        _id: course._id,
        courseCode: course.courseCode,
        courseName: course.courseName,
        maxStudents: course.maxStudents,
        enrolledCount: course.enrolledStudents.length,
        availableSpots: course.maxStudents - course.enrolledStudents.length
      },
      enrollments,
      institution: {
        id: institutionId,
        name: req.tenantContext.institution.name
      }
    });
  } catch (error) {
    console.error('Error fetching course enrollments:', error);
    res.status(500).json({ error: 'Failed to fetch enrollments' });
  }
};

/**
 * Get enrollment history for a student with institutional filtering
 * Requirements: 5.2 - Enrollment history within institutional boundaries
 */
export const getEnrollmentHistory = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user._id.toString();
    const { status } = req.query;

    // Validate institutional context is established
    if (!req.tenantContext) {
      res.status(400).json({ 
        error: 'Institutional context required',
        message: 'Please select an institution to continue'
      });
      return;
    }

    const institutionId = req.tenantContext.institutionId.toString();
    const enrollmentService = EnrollmentService.getInstance();

    // Get enrollment history with institutional filtering
    const enrollments = await enrollmentService.getStudentEnrollments(
      userId,
      institutionId,
      status as any
    );

    res.json({
      enrollments,
      institution: {
        id: institutionId,
        name: req.tenantContext.institution.name
      }
    });
  } catch (error) {
    console.error('Error fetching enrollment history:', error);
    res.status(500).json({ error: 'Failed to fetch enrollment history' });
  }
};

/**
 * Get enrollment statistics for a student within institutional boundaries
 * Requirements: 5.2, 5.5 - Enrollment statistics and reporting
 */
export const getEnrollmentStatistics = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user._id.toString();

    // Validate institutional context is established
    if (!req.tenantContext) {
      res.status(400).json({ 
        error: 'Institutional context required',
        message: 'Please select an institution to continue'
      });
      return;
    }

    const institutionId = req.tenantContext.institutionId.toString();
    const enrollmentService = EnrollmentService.getInstance();

    // Get enrollment statistics with institutional filtering
    const statistics = await enrollmentService.getEnrollmentStatistics(userId, institutionId);

    res.json({
      statistics,
      institution: {
        id: institutionId,
        name: req.tenantContext.institution.name
      }
    });
  } catch (error) {
    console.error('Error fetching enrollment statistics:', error);
    res.status(500).json({ error: 'Failed to fetch enrollment statistics' });
  }
};

/**
 * Calculate GPA for a student within institutional boundaries
 * Requirements: 5.5 - GPA calculation within institutional boundaries
 */
export const calculateStudentGPA = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user._id.toString();

    // Validate institutional context is established
    if (!req.tenantContext) {
      res.status(400).json({ 
        error: 'Institutional context required',
        message: 'Please select an institution to continue'
      });
      return;
    }

    const institutionId = req.tenantContext.institutionId.toString();
    const enrollmentService = EnrollmentService.getInstance();

    // Calculate GPA with institutional filtering
    const gpa = await enrollmentService.calculateGPA(userId, institutionId);

    res.json({
      gpa,
      institution: {
        id: institutionId,
        name: req.tenantContext.institution.name
      }
    });
  } catch (error) {
    console.error('Error calculating GPA:', error);
    res.status(500).json({ error: 'Failed to calculate GPA' });
  }
};

/**
 * Log admin enrollment action for audit purposes
 * Requirement: 6.4
 */
const logAdminAction = (
  adminId: string,
  action: 'admin_enroll' | 'admin_remove',
  studentId: string,
  courseId: string,
  details: Record<string, unknown>
): void => {
  const logEntry = {
    timestamp: new Date().toISOString(),
    adminId,
    action,
    studentId,
    courseId,
    details
  };
  // Log to console for audit trail (in production, this would go to a dedicated audit log service)
  console.log('[ADMIN_AUDIT]', JSON.stringify(logEntry));
};

/**
 * Enroll a student in a course using EnrollmentService
 * Requirements: 2.1, 2.2, 2.3, 8.1, 8.5, 4.4, 9.4 (Cross-institutional enrollment prevention)
 */
export const enrollStudentWithService = async (req: EnrollRequest, res: Response): Promise<void> => {
  const { courseId, semester, academicYear } = req.body;
  const user = req.user;

  // Validate required fields
  if (!courseId || !semester || !academicYear) {
    res.status(400).json({ error: 'Course ID, semester, and academic year are required' });
    return;
  }

  // Validate institutional context is established (Requirements 4.4, 9.4)
  if (!req.tenantContext) {
    res.status(400).json({ 
      error: 'Institutional context required',
      message: 'Please select an institution to continue'
    });
    return;
  }

  const institutionId = req.tenantContext.institutionId.toString();
  const enrollmentService = EnrollmentService.getInstance();

  try {
    const result = await enrollmentService.createEnrollment(
      user,
      { studentId: user._id.toString(), courseId, semester, academicYear },
      institutionId,
      req
    );

    if (result.success) {
      // Populate enrollment for response
      await result.enrollment!.populate('course', 'courseCode courseName credits instructor');
      await result.enrollment!.populate('student', 'studentId');

      res.status(201).json({
        message: 'Successfully enrolled in course',
        enrollment: result.enrollment
      });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error('Error enrolling student:', error);
    res.status(500).json({ error: 'Failed to enroll in course' });
  }
};

interface AdminEnrollRequest extends AuthenticatedRequest {
  body: {
    studentId: string;
    courseId: string;
    semester: string;
    academicYear: string;
  };
}

/**
 * Admin enrollment that bypasses capacity limits
 * Requirements: 6.2, 6.4, 8.1, 8.5
 * Uses optimistic locking with retry logic for concurrent enrollment attempts
 */
export const adminEnrollStudent = async (req: AdminEnrollRequest, res: Response): Promise<void> => {
  const { studentId, courseId, semester, academicYear } = req.body;
  const adminId = req.user._id.toString();

  // Validate required fields
  if (!studentId || !courseId || !semester || !academicYear) {
    res.status(400).json({ error: 'Student ID, Course ID, semester, and academic year are required' });
    return;
  }

  let lastError: unknown = null;

  // Retry loop for handling concurrent enrollment attempts (Requirement 8.1)
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Find the student by studentId field
      const student = await Student.findOne({ studentId }).session(session);
      if (!student) {
        await session.abortTransaction();
        session.endSession();
        res.status(404).json({ error: 'Student not found' });
        return;
      }

      if (!student.isActive) {
        await session.abortTransaction();
        session.endSession();
        res.status(403).json({ error: 'Student account is not active' });
        return;
      }

      // Find the course
      const course = await Course.findById(courseId).session(session);
      if (!course) {
        await session.abortTransaction();
        session.endSession();
        res.status(404).json({ error: 'Course not found' });
        return;
      }

      if (!course.isActive) {
        await session.abortTransaction();
        session.endSession();
        res.status(400).json({ error: 'Course is not active' });
        return;
      }

      // Check for duplicate enrollment (still prevent duplicates even for admin)
      const existingEnrollment = await Enrollment.findOne({
        student: student._id,
        course: courseId,
        semester,
        status: 'enrolled'
      }).session(session);

      if (existingEnrollment) {
        await session.abortTransaction();
        session.endSession();
        res.status(400).json({ error: 'Student is already enrolled in this course for this semester' });
        return;
      }

      // Admin bypasses capacity check (Requirement 6.2)
      const wasOverCapacity = course.enrolledStudents.length >= course.maxStudents;

      // Create enrollment record
      const enrollment = new Enrollment({
        student: student._id,
        course: courseId,
        enrollmentDate: new Date(),
        status: 'enrolled',
        credits: course.credits,
        semester,
        academicYear
      });

      await enrollment.save({ session });

      // Update course enrolled students
      // This will trigger optimistic locking check via __v field
      course.enrolledStudents.push(student._id);
      await course.save({ session });

      // Update student's enrolled courses and total credits
      student.enrolledCourses.push(course._id);
      student.totalCredits = (student.totalCredits || 0) + course.credits;
      await student.save({ session });

      await session.commitTransaction();
      session.endSession();

      // Log admin action for audit (Requirement 6.4)
      logAdminAction(adminId, 'admin_enroll', studentId, courseId, {
        semester,
        academicYear,
        wasOverCapacity,
        newEnrolledCount: course.enrolledStudents.length,
        maxStudents: course.maxStudents
      });

      // Populate enrollment for response
      await enrollment.populate('course', 'courseCode courseName credits instructor');
      await enrollment.populate('student', 'studentId');

      res.status(201).json({
        message: 'Admin successfully enrolled student in course',
        enrollment,
        adminOverride: wasOverCapacity
      });
      return;
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      lastError = error;

      // Check if this is a version conflict (concurrent modification)
      if (isVersionConflict(error)) {
        console.log(`Admin enrollment attempt ${attempt + 1} failed due to concurrent modification, retrying...`);
        if (attempt < MAX_RETRIES - 1) {
          // Exponential backoff with jitter
          const backoffDelay = RETRY_DELAY_MS * Math.pow(2, attempt) + Math.random() * 50;
          await delay(backoffDelay);
          continue;
        }
      }

      // Handle duplicate key error from unique index
      if ((error as any).code === 11000) {
        res.status(400).json({ error: 'Student is already enrolled in this course for this semester' });
        return;
      }

      // For non-retryable errors, break out of retry loop
      break;
    }
  }

  // If we've exhausted all retries or encountered a non-retryable error
  console.error('Error in admin enrollment:', lastError);
  
  if (isVersionConflict(lastError)) {
    res.status(409).json({ 
      error: 'Unable to complete enrollment due to high demand. Please try again.' 
    });
    return;
  }
  
  res.status(500).json({ error: 'Failed to enroll student' });
};

/**
 * Admin forced unenrollment of a student from a course
 * Requirements: 6.3, 6.4, 8.1, 8.5
 * Uses optimistic locking with retry logic for concurrent removal attempts
 */
export const adminRemoveStudent = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { courseId, studentId } = req.params;
  const adminId = req.user._id.toString();

  // Validate required fields
  if (!courseId || !studentId) {
    res.status(400).json({ error: 'Course ID and Student ID are required' });
    return;
  }

  let lastError: unknown = null;

  // Retry loop for handling concurrent removal attempts (Requirement 8.1)
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Find the student by studentId field
      const student = await Student.findOne({ studentId }).session(session);
      if (!student) {
        await session.abortTransaction();
        session.endSession();
        res.status(404).json({ error: 'Student not found' });
        return;
      }

      // Find the course
      const course = await Course.findById(courseId).session(session);
      if (!course) {
        await session.abortTransaction();
        session.endSession();
        res.status(404).json({ error: 'Course not found' });
        return;
      }

      // Find the enrollment
      const enrollment = await Enrollment.findOne({
        student: student._id,
        course: courseId,
        status: 'enrolled'
      }).session(session);

      if (!enrollment) {
        await session.abortTransaction();
        session.endSession();
        res.status(404).json({ error: 'Enrollment not found' });
        return;
      }

      // Update enrollment status to dropped
      enrollment.status = 'dropped';
      await enrollment.save({ session });

      // Remove student from course enrolled students
      // This will trigger optimistic locking check via __v field
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

      // Log admin action for audit (Requirement 6.4)
      logAdminAction(adminId, 'admin_remove', studentId, courseId, {
        semester: enrollment.semester,
        academicYear: enrollment.academicYear,
        creditsRemoved: enrollment.credits,
        newEnrolledCount: course.enrolledStudents.length
      });

      res.json({
        message: 'Admin successfully removed student from course',
        enrollment
      });
      return;
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      lastError = error;

      // Check if this is a version conflict (concurrent modification)
      if (isVersionConflict(error)) {
        console.log(`Admin removal attempt ${attempt + 1} failed due to concurrent modification, retrying...`);
        if (attempt < MAX_RETRIES - 1) {
          // Exponential backoff with jitter
          const backoffDelay = RETRY_DELAY_MS * Math.pow(2, attempt) + Math.random() * 50;
          await delay(backoffDelay);
          continue;
        }
      }

      // For non-retryable errors, break out of retry loop
      break;
    }
  }

  // If we've exhausted all retries or encountered a non-retryable error
  console.error('Error in admin removal:', lastError);
  
  if (isVersionConflict(lastError)) {
    res.status(409).json({ 
      error: 'Unable to complete removal due to high demand. Please try again.' 
    });
    return;
  }
  
  res.status(500).json({ error: 'Failed to remove student from course' });
};
