#!/usr/bin/env ts-node

/**
 * Manual script to run comprehensive MongoDB indexing
 * Usage: npm run create-indexes
 */

import { 
  createUserPerformanceIndexes, 
  createStudentPerformanceIndexes, 
  createInstitutionPerformanceIndexes,
  createCoursePerformanceIndexes,
  createEnrollmentPerformanceIndexes 
} from './create-performance-indexes';

async function main() {
  console.log('🚀 Starting comprehensive MongoDB indexing...\n');
  
  try {
    // Import and run the main function from create-performance-indexes
    const { main: createIndexes } = await import('./create-performance-indexes');
    await createIndexes();
    
    console.log('\n✅ All performance indexes created successfully!');
    console.log('📊 Your multi-tenant database is now optimized for high performance.');
    
  } catch (error) {
    console.error('❌ Failed to create performance indexes:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}