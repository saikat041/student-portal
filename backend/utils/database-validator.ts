import mongoose from 'mongoose';
import Institution from '../models/Institution';
import User from '../models/User';
import Course from '../models/Course';
import Enrollment from '../models/Enrollment';
import Student from '../models/Student';

/**
 * Database validation utility for multi-tenant infrastructure
 * Validates that all required indexes and constraints are properly set up
 */
export class DatabaseValidator {
  
  /**
   * Validates all multi-tenant database indexes and constraints
   */
  static async validateMultiTenantSetup(): Promise<ValidationResult> {
    const results: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      indexValidation: {},
      constraintValidation: {}
    };

    try {
      // Validate Institution collection
      await this.validateInstitutionIndexes(results);
      
      // Validate User collection with multi-institutional support
      await this.validateUserIndexes(results);
      
      // Validate Course collection with institutional isolation
      await this.validateCourseIndexes(results);
      
      // Validate Enrollment collection with triple validation
      await this.validateEnrollmentIndexes(results);
      
      // Validate Student collection with institutional context
      await this.validateStudentIndexes(results);
      
      // Validate data isolation constraints
      await this.validateDataIsolationConstraints(results);
      
    } catch (error) {
      results.isValid = false;
      results.errors.push(`Database validation failed: ${error}`);
    }

    return results;
  }

  private static async validateInstitutionIndexes(results: ValidationResult): Promise<void> {
    try {
      const indexes = await Institution.collection.getIndexes();
      const requiredIndexes = ['name_1', 'status_1', 'type_1'];
      
      results.indexValidation.Institution = {
        required: requiredIndexes,
        existing: Object.keys(indexes),
        missing: []
      };

      for (const requiredIndex of requiredIndexes) {
        if (!indexes[requiredIndex]) {
          results.indexValidation.Institution.missing.push(requiredIndex);
          results.warnings.push(`Missing Institution index: ${requiredIndex}`);
        }
      }
    } catch (error) {
      results.errors.push(`Institution index validation failed: ${error}`);
    }
  }

  private static async validateUserIndexes(results: ValidationResult): Promise<void> {
    try {
      const indexes = await User.collection.getIndexes();
      const requiredIndexes = [
        'email_1',
        'institutions.institutionId_1_institutions.role_1',
        'institutions.institutionId_1_institutions.status_1'
      ];
      
      results.indexValidation.User = {
        required: requiredIndexes,
        existing: Object.keys(indexes),
        missing: []
      };

      for (const requiredIndex of requiredIndexes) {
        if (!indexes[requiredIndex]) {
          results.indexValidation.User.missing.push(requiredIndex);
          results.warnings.push(`Missing User index: ${requiredIndex}`);
        }
      }
    } catch (error) {
      results.errors.push(`User index validation failed: ${error}`);
    }
  }

  private static async validateCourseIndexes(results: ValidationResult): Promise<void> {
    try {
      const indexes = await Course.collection.getIndexes();
      const requiredIndexes = [
        'institutionId_1_courseCode_1',
        'institutionId_1_status_1_createdAt_-1',
        'institutionId_1_instructor_1',
        'institutionId_1_department_1'
      ];
      
      results.indexValidation.Course = {
        required: requiredIndexes,
        existing: Object.keys(indexes),
        missing: []
      };

      for (const requiredIndex of requiredIndexes) {
        if (!indexes[requiredIndex]) {
          results.indexValidation.Course.missing.push(requiredIndex);
          results.warnings.push(`Missing Course index: ${requiredIndex}`);
        }
      }
    } catch (error) {
      results.errors.push(`Course index validation failed: ${error}`);
    }
  }

  private static async validateEnrollmentIndexes(results: ValidationResult): Promise<void> {
    try {
      const indexes = await Enrollment.collection.getIndexes();
      const requiredIndexes = [
        'student_1_course_1_semester_1',
        'institutionId_1_student_1_status_1',
        'institutionId_1_course_1',
        'institutionId_1_semester_1_academicYear_1'
      ];
      
      results.indexValidation.Enrollment = {
        required: requiredIndexes,
        existing: Object.keys(indexes),
        missing: []
      };

      for (const requiredIndex of requiredIndexes) {
        if (!indexes[requiredIndex]) {
          results.indexValidation.Enrollment.missing.push(requiredIndex);
          results.warnings.push(`Missing Enrollment index: ${requiredIndex}`);
        }
      }
    } catch (error) {
      results.errors.push(`Enrollment index validation failed: ${error}`);
    }
  }

  private static async validateStudentIndexes(results: ValidationResult): Promise<void> {
    try {
      const indexes = await Student.collection.getIndexes();
      const requiredIndexes = [
        'institutionId_1_studentId_1',
        'institutionId_1_user_1',
        'institutionId_1_isActive_1',
        'institutionId_1_major_1'
      ];
      
      results.indexValidation.Student = {
        required: requiredIndexes,
        existing: Object.keys(indexes),
        missing: []
      };

      for (const requiredIndex of requiredIndexes) {
        if (!indexes[requiredIndex]) {
          results.indexValidation.Student.missing.push(requiredIndex);
          results.warnings.push(`Missing Student index: ${requiredIndex}`);
        }
      }
    } catch (error) {
      results.errors.push(`Student index validation failed: ${error}`);
    }
  }

  private static async validateDataIsolationConstraints(results: ValidationResult): Promise<void> {
    try {
      // Validate that all tenant-aware collections have institutionId field
      const collections = [
        { name: 'Course', model: Course },
        { name: 'Enrollment', model: Enrollment },
        { name: 'Student', model: Student }
      ];

      results.constraintValidation = {};

      for (const collection of collections) {
        const schema = collection.model.schema;
        const hasInstitutionId = schema.paths.institutionId !== undefined;
        
        results.constraintValidation[collection.name] = {
          hasInstitutionId,
          isRequired: hasInstitutionId && schema.paths.institutionId.isRequired
        };

        if (!hasInstitutionId) {
          results.errors.push(`${collection.name} collection missing institutionId field for data isolation`);
          results.isValid = false;
        }
      }
    } catch (error) {
      results.errors.push(`Data isolation constraint validation failed: ${error}`);
    }
  }
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  indexValidation: Record<string, IndexValidation>;
  constraintValidation: Record<string, ConstraintValidation>;
}

interface IndexValidation {
  required: string[];
  existing: string[];
  missing: string[];
}

interface ConstraintValidation {
  hasInstitutionId: boolean;
  isRequired: boolean;
}