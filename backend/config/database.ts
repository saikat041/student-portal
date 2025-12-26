import mongoose from 'mongoose';

// Import models to ensure indexes are created
import Institution from '../models/Institution';
import User from '../models/User';
import Course from '../models/Course';
import Enrollment from '../models/Enrollment';
import Student from '../models/Student';

export interface DatabaseConfig {
  uri: string;
  options: mongoose.ConnectOptions;
}

export const getDatabaseConfig = (): DatabaseConfig => {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/student-portal-multi-tenant';
  
  const options: mongoose.ConnectOptions = {
    // Connection pool settings for multi-tenant performance
    maxPoolSize: 10, // Maintain up to 10 socket connections
    serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
    socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
    
    // Multi-tenant specific settings
    retryWrites: true,
    w: 'majority', // Write concern for data consistency
    readPreference: 'primary', // Ensure read consistency for multi-tenant data
  };

  return { uri, options };
};

export const connectDatabase = async (): Promise<void> => {
  try {
    const { uri, options } = getDatabaseConfig();
    
    console.log('Connecting to MongoDB Atlas...');
    await mongoose.connect(uri, options);
    
    console.log('MongoDB Atlas connected successfully');
    
    // Ensure indexes are created for multi-tenant performance
    await ensureIndexes();
    
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

export const ensureIndexes = async (): Promise<void> => {
  try {
    console.log('Creating multi-tenant database indexes...');
    
    // Ensure all model indexes are created (basic indexes defined in schemas)
    await Promise.all([
      Institution.createIndexes(),
      User.createIndexes(),
      Course.createIndexes(),
      Enrollment.createIndexes(),
      Student.createIndexes()
    ]);
    
    // Create additional performance indexes for multi-tenant operations
    const { 
      createUserPerformanceIndexes, 
      createStudentPerformanceIndexes, 
      createInstitutionPerformanceIndexes,
      createCoursePerformanceIndexes,
      createEnrollmentPerformanceIndexes 
    } = await import('../scripts/create-performance-indexes');
    
    await Promise.all([
      createUserPerformanceIndexes(),
      createStudentPerformanceIndexes(),
      createInstitutionPerformanceIndexes(),
      createCoursePerformanceIndexes(),
      createEnrollmentPerformanceIndexes()
    ]);
    
    console.log('Multi-tenant database indexes created successfully');
    
  } catch (error) {
    console.error('Error creating database indexes:', error);
    throw error;
  }
};

export const disconnectDatabase = async (): Promise<void> => {
  try {
    await mongoose.disconnect();
    console.log('MongoDB disconnected');
  } catch (error) {
    console.error('Error disconnecting from MongoDB:', error);
  }
};

// Connection event handlers
mongoose.connection.on('connected', () => {
  console.log('Mongoose connected to MongoDB Atlas');
});

mongoose.connection.on('error', (err) => {
  console.error('Mongoose connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('Mongoose disconnected from MongoDB Atlas');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await disconnectDatabase();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await disconnectDatabase();
  process.exit(0);
});