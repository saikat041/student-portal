import dotenv from 'dotenv';
dotenv.config();

import { connectDatabase, ensureIndexes, disconnectDatabase } from '../config/database';
import Institution from '../models/Institution';
import User from '../models/User';

/**
 * Database initialization script for multi-tenant infrastructure
 * This script sets up the database with proper indexes and initial data
 */
async function initializeDatabase() {
  try {
    console.log('🚀 Starting multi-tenant database initialization...');
    
    // Connect to MongoDB Atlas
    await connectDatabase();
    
    // Ensure all indexes are created
    console.log('📊 Creating database indexes...');
    await ensureIndexes();
    
    // Create system administrator if it doesn't exist
    await createSystemAdmin();
    
    // Create sample institution for testing (optional)
    if (process.env.NODE_ENV === 'development') {
      await createSampleInstitution();
    }
    
    console.log('✅ Multi-tenant database initialization completed successfully!');
    
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  } finally {
    await disconnectDatabase();
  }
}

async function createSystemAdmin() {
  try {
    // Check if system admin already exists
    const existingAdmin = await User.findOne({ 
      email: 'admin@system.local',
      'institutions.role': 'institution_admin' 
    });
    
    if (existingAdmin) {
      console.log('📋 System administrator already exists');
      return;
    }
    
    // Create system admin user
    const systemAdmin = new User({
      email: 'admin@system.local',
      password: 'admin123', // This will be hashed by the pre-save hook
      firstName: 'System',
      lastName: 'Administrator',
      institutions: [], // System admin can be assigned to institutions later
      isActive: true
    });
    
    await systemAdmin.save();
    console.log('👤 System administrator created: admin@system.local');
    
  } catch (error) {
    console.error('Error creating system administrator:', error);
    throw error;
  }
}

async function createSampleInstitution() {
  try {
    // Check if sample institution already exists
    const existingInstitution = await Institution.findOne({ name: 'Sample University' });
    
    if (existingInstitution) {
      console.log('🏫 Sample institution already exists');
      return;
    }
    
    // Create sample institution
    const sampleInstitution = new Institution({
      name: 'Sample University',
      type: 'university',
      address: {
        street: '123 Education Street',
        city: 'Learning City',
        state: 'Knowledge State',
        zipCode: '12345'
      },
      contactInfo: {
        email: 'admin@sampleuniversity.edu',
        phone: '+1-555-0123'
      },
      settings: {
        academicYear: '2024-2025',
        semesterSystem: 'semester',
        enrollmentPolicies: {
          maxCreditsPerSemester: 18,
          minCreditsForFullTime: 12,
          allowLateEnrollment: true,
          lateEnrollmentDeadlineDays: 7
        }
      },
      branding: {
        primaryColor: '#1e40af',
        logo: '',
        theme: 'university'
      },
      status: 'active'
    });
    
    await sampleInstitution.save();
    console.log('🏫 Sample institution created: Sample University');
    
  } catch (error) {
    console.error('Error creating sample institution:', error);
    throw error;
  }
}

// Run the initialization if this script is executed directly
if (require.main === module) {
  initializeDatabase();
}

export { initializeDatabase };