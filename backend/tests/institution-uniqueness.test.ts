import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { connectTestDatabase, disconnectTestDatabase, clearTestDatabase } from '../config/test-database';
import { institutionService } from '../services/InstitutionService';
import { InstitutionRegistrationData } from '../services/InstitutionService';

describe('Institution Uniqueness Property Tests', () => {
  beforeAll(async () => {
    await connectTestDatabase();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  beforeEach(async () => {
    await clearTestDatabase();
  });

  // Hardcoded test data for deterministic testing
  const testInstitutionNames = [
    'Harvard_University_001',
    'MIT_Institute_002',
    'Stanford_University_003',
    'Yale_University_004',
    'Princeton_University_005'
  ];

  // Simple helper to create valid institution data
  const createInstitutionData = (name: string): InstitutionRegistrationData => ({
    name,
    type: 'university',
    address: {
      street: '123 Main Street',
      city: 'Test City',
      state: 'Test State',
      zipCode: '12345'
    },
    contactInfo: {
      email: 'test@example.edu',
      phone: '+1-555-0123'
    }
  });

  /**
   * Feature: multi-institution-support, Property 1: Institution Identifier Uniqueness
   * For any institution name, attempting to register a second institution with the same name should fail
   * Validates: Requirements 1.1, 16.2
   */
  it('should reject duplicate institution names', async () => {
    // Test case 1: Basic duplicate rejection
    const institutionName1 = testInstitutionNames[0];
    
    // First registration should succeed
    const firstInstitution = await institutionService.registerInstitution(
      createInstitutionData(institutionName1)
    );
    expect(firstInstitution.name).toBe(institutionName1);

    // Second registration with same name should fail
    await expect(
      institutionService.registerInstitution(createInstitutionData(institutionName1))
    ).rejects.toThrow('Institution name already exists');

    // Verify only one institution exists with this name
    const allInstitutions = await institutionService.getInstitutionList();
    const matchingInstitutions = allInstitutions.filter(
      inst => inst.name === institutionName1
    );
    expect(matchingInstitutions).toHaveLength(1);
  });

  // Test case 2: Multiple unique institutions should succeed
  it('should allow registration of multiple institutions with different names', async () => {
    const name1 = testInstitutionNames[1];
    const name2 = testInstitutionNames[2];
    
    const institution1 = await institutionService.registerInstitution(
      createInstitutionData(name1)
    );
    expect(institution1.name).toBe(name1);

    const institution2 = await institutionService.registerInstitution(
      createInstitutionData(name2)
    );
    expect(institution2.name).toBe(name2);

    // Verify both institutions exist
    const allInstitutions = await institutionService.getInstitutionList();
    expect(allInstitutions.length).toBeGreaterThanOrEqual(2);
    
    const foundName1 = allInstitutions.find(inst => inst.name === name1);
    const foundName2 = allInstitutions.find(inst => inst.name === name2);
    
    expect(foundName1).toBeDefined();
    expect(foundName2).toBeDefined();
  });

  // Test case 3: Duplicate rejection after multiple registrations
  it('should reject duplicates even after multiple successful registrations', async () => {
    const name1 = testInstitutionNames[3];
    const name2 = testInstitutionNames[4];
    
    // Register two institutions
    await institutionService.registerInstitution(createInstitutionData(name1));
    await institutionService.registerInstitution(createInstitutionData(name2));

    // Try to register duplicate of first institution
    await expect(
      institutionService.registerInstitution(createInstitutionData(name1))
    ).rejects.toThrow('Institution name already exists');

    // Try to register duplicate of second institution
    await expect(
      institutionService.registerInstitution(createInstitutionData(name2))
    ).rejects.toThrow('Institution name already exists');

    // Verify exactly two institutions exist
    const allInstitutions = await institutionService.getInstitutionList();
    expect(allInstitutions).toHaveLength(2);
  });

  /**
   * Feature: multi-institution-support, Property 1: Institution Identifier Uniqueness (Case Insensitive)
   * Institution names should be unique regardless of case variations
   * Validates: Requirements 1.1, 16.2
   */
  it('should enforce case-insensitive institution name uniqueness', async () => {
    // Simple test with proper case variations of the SAME name
    const baseName = 'TestUniversity';
    const variations = [
      baseName.toLowerCase(),      // testuniversity
      baseName.toUpperCase(),      // TESTUNIVERSITY  
      'TestUniversity',            // TestUniversity
      'testUNIVERSITY'            // testUNIVERSITY
    ];

    // Register first variation
    const firstInstitution = await institutionService.registerInstitution(
      createInstitutionData(variations[0])
    );
    expect(firstInstitution).toBeDefined();

    // Try other variations - all should fail
    for (let i = 1; i < variations.length; i++) {
      await expect(
        institutionService.registerInstitution(createInstitutionData(variations[i]))
      ).rejects.toThrow('Institution name already exists');
    }

    // Verify only one institution exists
    const allInstitutions = await institutionService.getInstitutionList();
    expect(allInstitutions).toHaveLength(1);
  });
});