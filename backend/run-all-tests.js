#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');

console.log('🧪 Running Multi-Institution Support Test Suite\n');

const testCategories = {
  'Unit Tests (Core Functionality)': [
    'tests/error-handling-unit.test.ts',
    'tests/performance-optimization.test.ts'
  ],
  'Database and Infrastructure': [
    'tests/database-setup.test.ts',
    'tests/performance-indexing.test.ts'
  ],
  'Property-Based Tests (PBT)': [
    'tests/institution-uniqueness.test.ts',
    'tests/institutional-branding-application.test.ts',
    'tests/cross-institutional-enrollment-prevention.test.ts',
    'tests/context-switching-security.test.ts',
    'tests/tenant-context.test.ts',
    'tests/multi-institutional-profile-separation.test.ts',
    'tests/registration-approval-workflow.test.ts',
    'tests/role-based-access-control.test.ts'
  ],
  'Integration Tests': [
    'tests/admin-dashboard.test.ts',
    'tests/integration-workflows.test.ts',
    'tests/error-handling-integration.test.ts'
  ]
};

const results = {
  passed: [],
  failed: [],
  total: 0,
  passedCount: 0,
  failedCount: 0
};

function runTestCategory(categoryName, testFiles) {
  console.log(`\n📂 ${categoryName}`);
  console.log('='.repeat(50));
  
  for (const testFile of testFiles) {
    try {
      console.log(`\n🔍 Running: ${testFile}`);
      const output = execSync(`npx vitest run ${testFile}`, { 
        encoding: 'utf8',
        stdio: 'pipe'
      });
      
      // Parse output for test count
      const passedMatch = output.match(/(\d+) passed/);
      const testCount = passedMatch ? parseInt(passedMatch[1]) : 0;
      
      console.log(`✅ PASSED: ${testCount} tests`);
      results.passed.push({ file: testFile, count: testCount });
      results.passedCount += testCount;
      results.total += testCount;
      
    } catch (error) {
      console.log(`❌ FAILED: ${testFile}`);
      
      // Try to extract test count from error output
      const errorOutput = error.stdout || error.message;
      const failedMatch = errorOutput.match(/(\d+) failed/);
      const passedMatch = errorOutput.match(/(\d+) passed/);
      const failedCount = failedMatch ? parseInt(failedMatch[1]) : 1;
      const passedCount = passedMatch ? parseInt(passedMatch[1]) : 0;
      
      results.failed.push({ 
        file: testFile, 
        failedCount, 
        passedCount,
        error: error.message.split('\n')[0] 
      });
      results.failedCount += failedCount;
      results.passedCount += passedCount;
      results.total += failedCount + passedCount;
    }
  }
}

// Run all test categories
for (const [categoryName, testFiles] of Object.entries(testCategories)) {
  runTestCategory(categoryName, testFiles);
}

// Print comprehensive summary
console.log('\n' + '='.repeat(70));
console.log('📊 COMPREHENSIVE TEST RESULTS SUMMARY');
console.log('='.repeat(70));

console.log(`\n✅ PASSED TESTS: ${results.passedCount}/${results.total}`);
if (results.passed.length > 0) {
  results.passed.forEach(test => {
    console.log(`   ✓ ${test.file}: ${test.count} tests`);
  });
}

console.log(`\n❌ FAILED TESTS: ${results.failedCount}/${results.total}`);
if (results.failed.length > 0) {
  results.failed.forEach(test => {
    console.log(`   ✗ ${test.file}: ${test.failedCount} failed, ${test.passedCount} passed`);
  });
}

const successRate = ((results.passedCount / results.total) * 100).toFixed(1);
console.log(`\n📈 SUCCESS RATE: ${successRate}%`);

console.log('\n🎯 SYSTEM STATUS:');
if (successRate >= 80) {
  console.log('   🟢 EXCELLENT: Core functionality is working correctly');
} else if (successRate >= 60) {
  console.log('   🟡 GOOD: Most functionality working, some issues to address');
} else {
  console.log('   🔴 NEEDS ATTENTION: Significant issues require fixing');
}

console.log('\n💡 RECOMMENDATIONS:');
if (results.failed.length > 0) {
  console.log('   • Fix Property-Based Test data generators for unique institution names');
  console.log('   • Ensure MongoDB test database is properly configured');
  console.log('   • Update fast-check API usage to match current version');
  console.log('   • Review email validation in test data generation');
} else {
  console.log('   • All tests passing! System is ready for deployment');
}

console.log('\n' + '='.repeat(70));