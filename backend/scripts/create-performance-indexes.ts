import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../config/database';

/**
 * Comprehensive MongoDB indexing script for multi-tenant performance optimization
 * This script creates additional performance indexes beyond the basic ones defined in models
 */

async function createUserPerformanceIndexes() {
  console.log('Creating performance indexes for user queries...');
  
  const db = mongoose.connection.db;
  const usersCollection = db.collection('users');
  
  try {
    // Compound indexes for user-institution queries
    await usersCollection.createIndex(
      { 'institutions.institutionId': 1, 'institutions.role': 1, 'institutions.status': 1 },
      { 
        name: 'user_institution_role_status_idx',
        background: true 
      }
    );
    
    // Index for administrative workflows - finding all admins for an institution
    await usersCollection.createIndex(
      { 
        'institutions.institutionId': 1, 
        'institutions.role': 1, 
        'institutions.status': 1,
        'isActive': 1 
      },
      { 
        name: 'user_admin_workflow_idx',
        background: true,
        partialFilterExpression: { 
          'institutions.role': 'institution_admin',
          'institutions.status': 'active'
        }
      }
    );
    
    // Index for pending user approvals by institution
    await usersCollection.createIndex(
      { 
        'institutions.institutionId': 1, 
        'institutions.status': 1, 
        'institutions.createdAt': -1 
      },
      { 
        name: 'user_pending_approval_idx',
        background: true,
        partialFilterExpression: { 'institutions.status': 'pending' }
      }
    );
    
    // Index for user authentication and login tracking
    await usersCollection.createIndex(
      { 'email': 1, 'isActive': 1, 'lastLogin': -1 },
      { 
        name: 'user_auth_tracking_idx',
        background: true 
      }
    );
    
    // Index for password reset workflows
    await usersCollection.createIndex(
      { 'resetToken': 1, 'resetTokenExpiry': 1 },
      { 
        name: 'user_password_reset_idx',
        background: true,
        sparse: true // Only index documents that have these fields
      }
    );
    
    // Index for finding users by name within institution context
    await usersCollection.createIndex(
      { 
        'institutions.institutionId': 1,
        'firstName': 1, 
        'lastName': 1,
        'institutions.status': 1
      },
      { 
        name: 'user_name_search_idx',
        background: true 
      }
    );
    
    console.log('✓ User performance indexes created successfully');
    
  } catch (error) {
    console.error('Error creating user performance indexes:', error);
    throw error;
  }
}

async function createStudentPerformanceIndexes() {
  console.log('Creating performance indexes for student queries...');
  
  const db = mongoose.connection.db;
  const studentsCollection = db.collection('students');
  
  try {
    // Index for student academic performance queries
    await studentsCollection.createIndex(
      { 'institutionId': 1, 'gpa': -1, 'totalCredits': -1, 'isActive': 1 },
      { 
        name: 'student_academic_performance_idx',
        background: true 
      }
    );
    
    // Index for student enrollment capacity queries
    await studentsCollection.createIndex(
      { 'institutionId': 1, 'totalCredits': 1, 'maxCredits': 1, 'isActive': 1 },
      { 
        name: 'student_enrollment_capacity_idx',
        background: true 
      }
    );
    
    // Index for academic year and major reporting
    await studentsCollection.createIndex(
      { 'institutionId': 1, 'major': 1, 'year': 1, 'isActive': 1 },
      { 
        name: 'student_academic_reporting_idx',
        background: true 
      }
    );
    
    // Index for finding students by enrolled courses
    await studentsCollection.createIndex(
      { 'institutionId': 1, 'enrolledCourses': 1, 'isActive': 1 },
      { 
        name: 'student_course_enrollment_idx',
        background: true 
      }
    );
    
    console.log('✓ Student performance indexes created successfully');
    
  } catch (error) {
    console.error('Error creating student performance indexes:', error);
    throw error;
  }
}

async function createInstitutionPerformanceIndexes() {
  console.log('Creating performance indexes for institution queries...');
  
  const db = mongoose.connection.db;
  const institutionsCollection = db.collection('institutions');
  
  try {
    // Index for institution search and filtering
    await institutionsCollection.createIndex(
      { 'name': 'text', 'type': 1, 'status': 1 },
      { 
        name: 'institution_search_idx',
        background: true 
      }
    );
    
    // Index for institution administrative queries
    await institutionsCollection.createIndex(
      { 'status': 1, 'type': 1, 'createdAt': -1 },
      { 
        name: 'institution_admin_queries_idx',
        background: true 
      }
    );
    
    // Index for institution location-based queries
    await institutionsCollection.createIndex(
      { 'address.state': 1, 'address.city': 1, 'status': 1 },
      { 
        name: 'institution_location_idx',
        background: true 
      }
    );
    
    console.log('✓ Institution performance indexes created successfully');
    
  } catch (error) {
    console.error('Error creating institution performance indexes:', error);
    throw error;
  }
}

async function createCoursePerformanceIndexes() {
  console.log('Creating performance indexes for course queries...');
  
  const db = mongoose.connection.db;
  const coursesCollection = db.collection('courses');
  
  try {
    // Index for course catalog browsing and search
    await coursesCollection.createIndex(
      { 'institutionId': 1, 'isActive': 1, 'department': 1, 'createdAt': -1 },
      { 
        name: 'course_catalog_browse_idx',
        background: true 
      }
    );
    
    // Index for course search by name and code
    await coursesCollection.createIndex(
      { 
        'institutionId': 1, 
        'courseName': 'text', 
        'courseCode': 'text',
        'description': 'text',
        'isActive': 1 
      },
      { 
        name: 'course_text_search_idx',
        background: true,
        weights: {
          'courseCode': 10,
          'courseName': 5,
          'description': 1
        }
      }
    );
    
    // Index for instructor course management
    await coursesCollection.createIndex(
      { 'institutionId': 1, 'instructor': 1, 'semester': 1, 'isActive': 1 },
      { 
        name: 'course_instructor_management_idx',
        background: true 
      }
    );
    
    // Index for enrollment capacity tracking
    await coursesCollection.createIndex(
      { 
        'institutionId': 1, 
        'maxStudents': 1, 
        'enrolledStudents': 1, 
        'isActive': 1 
      },
      { 
        name: 'course_enrollment_capacity_idx',
        background: true 
      }
    );
    
    // Index for academic reporting by department and semester
    await coursesCollection.createIndex(
      { 
        'institutionId': 1, 
        'department': 1, 
        'semester': 1, 
        'credits': 1,
        'isActive': 1 
      },
      { 
        name: 'course_academic_reporting_idx',
        background: true 
      }
    );
    
    // Index for course prerequisites and scheduling
    await coursesCollection.createIndex(
      { 'institutionId': 1, 'semester': 1, 'department': 1, 'courseCode': 1 },
      { 
        name: 'course_scheduling_idx',
        background: true 
      }
    );
    
    console.log('✓ Course performance indexes created successfully');
    
  } catch (error) {
    console.error('Error creating course performance indexes:', error);
    throw error;
  }
}

async function createEnrollmentPerformanceIndexes() {
  console.log('Creating performance indexes for enrollment queries...');
  
  const db = mongoose.connection.db;
  const enrollmentsCollection = db.collection('enrollments');
  
  try {
    // Index for student enrollment history and transcript generation
    await enrollmentsCollection.createIndex(
      { 
        'institutionId': 1, 
        'student': 1, 
        'academicYear': 1, 
        'semester': 1,
        'status': 1 
      },
      { 
        name: 'enrollment_student_history_idx',
        background: true 
      }
    );
    
    // Index for course enrollment tracking and roster management
    await enrollmentsCollection.createIndex(
      { 
        'institutionId': 1, 
        'course': 1, 
        'semester': 1, 
        'status': 1,
        'enrollmentDate': -1 
      },
      { 
        name: 'enrollment_course_roster_idx',
        background: true 
      }
    );
    
    // Index for institutional analytics and reporting
    await enrollmentsCollection.createIndex(
      { 
        'institutionId': 1, 
        'academicYear': 1, 
        'semester': 1, 
        'status': 1,
        'credits': 1 
      },
      { 
        name: 'enrollment_institutional_analytics_idx',
        background: true 
      }
    );
    
    // Index for grade reporting and GPA calculations
    await enrollmentsCollection.createIndex(
      { 
        'institutionId': 1, 
        'student': 1, 
        'status': 1, 
        'grade': 1,
        'credits': 1 
      },
      { 
        name: 'enrollment_grade_reporting_idx',
        background: true,
        partialFilterExpression: { 'status': 'completed' }
      }
    );
    
    // Index for enrollment date-based queries and deadlines
    await enrollmentsCollection.createIndex(
      { 
        'institutionId': 1, 
        'enrollmentDate': -1, 
        'semester': 1, 
        'status': 1 
      },
      { 
        name: 'enrollment_date_tracking_idx',
        background: true 
      }
    );
    
    // Index for course completion tracking
    await enrollmentsCollection.createIndex(
      { 
        'institutionId': 1, 
        'course': 1, 
        'status': 1, 
        'updatedAt': -1 
      },
      { 
        name: 'enrollment_completion_tracking_idx',
        background: true 
      }
    );
    
    // Index for academic performance analytics
    await enrollmentsCollection.createIndex(
      { 
        'institutionId': 1, 
        'academicYear': 1, 
        'grade': 1, 
        'credits': 1,
        'status': 1 
      },
      { 
        name: 'enrollment_performance_analytics_idx',
        background: true,
        partialFilterExpression: { 'status': 'completed' }
      }
    );
    
    console.log('✓ Enrollment performance indexes created successfully');
    
  } catch (error) {
    console.error('Error creating enrollment performance indexes:', error);
    throw error;
  }
}

async function main() {
  try {
    console.log('Starting comprehensive MongoDB indexing for multi-tenant performance...');
    
    await connectDatabase();
    
    // Create performance indexes for user-related queries
    await createUserPerformanceIndexes();
    await createStudentPerformanceIndexes();
    await createInstitutionPerformanceIndexes();
    
    // Create performance indexes for course and enrollment queries
    await createCoursePerformanceIndexes();
    await createEnrollmentPerformanceIndexes();
    
    console.log('\n🎉 All performance indexes created successfully!');
    console.log('Database is fully optimized for multi-tenant operations.');
    
  } catch (error) {
    console.error('Failed to create performance indexes:', error);
    process.exit(1);
  } finally {
    await disconnectDatabase();
  }
}

// Run the script if called directly
if (require.main === module) {
  main();
}

export { 
  createUserPerformanceIndexes, 
  createStudentPerformanceIndexes, 
  createInstitutionPerformanceIndexes,
  createCoursePerformanceIndexes,
  createEnrollmentPerformanceIndexes 
};