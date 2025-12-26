import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { connectTestDatabase, disconnectTestDatabase, clearTestDatabase } from '../config/test-database';
import { institutionService } from '../services/InstitutionService';
import { InstitutionRegistrationData } from '../services/InstitutionService';
import User from '../models/User';
import Institution from '../models/Institution';

describe('Institution Setup Completeness Property Tests', () => {
  beforeAll(async () => {
    await connectTestDatabase();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  beforeEach(async () => {
    await clearTestDatabase();
  });

  // Generator for complete institution registration data with guaranteed unique names
  const completeInstitutionDataGenerator = (): fc.Arbitrary<InstitutionRegistrationData> => {
    return fc.record({
      name: fc.uuid().map(uuid => `Test Institution ${uuid}`),
      type: fc.constantFrom('university', 'college', 'school'),
      address: fc.record({
        street: fc.constantFrom('123 Main St', '456 Oak Ave', '789 Pine Rd', '321 Elm St', '654 Maple Dr'),
        city: fc.constantFrom('Boston', 'New York', 'Chicago', 'Los Angeles', 'San Francisco'),
        state: fc.constantFrom('MA', 'NY', 'IL', 'CA', 'TX'),
        zipCode: fc.constantFrom('02101', '10001', '60601', '90210', '94102')
      }),
      contactInfo: fc.record({
        email: fc.constantFrom(
          'admin@university.edu',
          'contact@college.edu', 
          'info@school.edu',
          'registrar@institution.edu',
          'admissions@academy.edu'
        ),
        phone: fc.constantFrom('555-123-4567', '555-987-6543', '555-456-7890', '555-321-0987', '555-654-3210')
      }),
      settings: fc.record({
        academicYear: fc.constantFrom('2023-2024', '2024-2025', '2025-2026'),
        semesterSystem: fc.constantFrom('semester', 'quarter', 'trimester'),
        enrollmentPolicies: fc.constantFrom(
          {},
          { maxStudentsPerCourse: 100 },
          { allowLateEnrollment: true },
          { requireApproval: false },
          { maxStudentsPerCourse: 50, allowLateEnrollment: false }
        )
      }),
      branding: fc.record({
        primaryColor: fc.constantFrom('#007bff', '#28a745', '#dc3545', '#ffc107', '#6f42c1'),
        logo: fc.string({ maxLength: 200 }),
        theme: fc.constantFrom('default', 'dark', 'light')
      })
    });
  };

  // Generator for admin user data with guaranteed unique emails
  const adminUserDataGenerator = () => {
    return fc.record({
      email: fc.uuid().map(uuid => `testuser-${uuid}@example.com`),
      password: fc.constantFrom('password123', 'admin2024', 'secure456', 'test789', 'admin123'),
      firstName: fc.constantFrom('John', 'Jane', 'Michael', 'Sarah', 'David', 'Emily', 'Robert', 'Lisa'),
      lastName: fc.constantFrom('Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis')
    });
  };

  /**
   * Feature: multi-institution-support, Property 9: Institution Setup Completeness
   * For any newly created institution, the system should initialize all required default settings, 
   * create the first administrator account, and make the institution available for user registration
   * Validates: Requirements 1.2, 16.4, 16.5
   */
  it('should complete full institution setup with all required components', async () => {
    await fc.assert(
      fc.asyncProperty(
        completeInstitutionDataGenerator(),
        adminUserDataGenerator(),
        async (institutionData, adminData) => {
          // Register the institution
          const institution = await institutionService.registerInstitution(institutionData);

          // Property 1: Institution should be created with all required fields
          expect(institution).toBeDefined();
          expect(institution._id).toBeDefined();
          expect(institution.name).toBe(institutionData.name.trim());
          expect(institution.type).toBe(institutionData.type);
          expect(institution.status).toBe('active');

          // Property 2: Institution should have all default settings initialized
          expect(institution.settings).toBeDefined();
          expect(institution.settings.academicYear).toBeDefined();
          expect(institution.settings.semesterSystem).toBeDefined();
          expect(institution.settings.enrollmentPolicies).toBeDefined();

          // Property 3: Institution should have branding configuration
          expect(institution.branding).toBeDefined();
          expect(institution.branding.primaryColor).toBeDefined();
          expect(institution.branding.theme).toBeDefined();

          // Property 4: Institution should be available in the active institutions list
          const availableInstitutions = await institutionService.getInstitutionList({ status: 'active' });
          const foundInstitution = availableInstitutions.find(
            inst => inst._id.toString() === institution._id.toString()
          );
          expect(foundInstitution).toBeDefined();

          // Property 5: Institution should be retrievable by ID
          const retrievedInstitution = await institutionService.getInstitutionById(institution._id.toString());
          expect(retrievedInstitution).toBeDefined();
          expect(retrievedInstitution!.name).toBe(institution.name);

          // Property 6: Institution should be retrievable by name
          const institutionByName = await institutionService.getInstitutionByName(institution.name);
          expect(institutionByName).toBeDefined();
          expect(institutionByName!._id.toString()).toBe(institution._id.toString());

          // Property 7: Institution statistics should be available and initialized
          const stats = await institutionService.getInstitutionStatistics(institution._id.toString());
          expect(stats).toBeDefined();
          expect(stats.totalUsers).toBe(0); // No users yet since we only created institution
          expect(stats.activeUsers).toBe(0);
          expect(stats.pendingUsers).toBe(0);
          expect(stats.totalCourses).toBe(0);
          expect(stats.totalEnrollments).toBe(0);
        }
      ),
      { numRuns: 100, endOnFailure: true }
    );
  });

  /**
   * Feature: multi-institution-support, Property 9: Institution Setup Completeness (Admin Creation)
   * When creating an institution with an administrator, the system should create the admin account
   * and properly link it to the institution with appropriate privileges
   * Validates: Requirements 16.4, 16.5
   */
  it('should create first administrator account during institution setup', async () => {
    await fc.assert(
      fc.asyncProperty(
        completeInstitutionDataGenerator(),
        adminUserDataGenerator(),
        async (institutionData, adminData) => {
          // Register the institution
          const institution = await institutionService.registerInstitution(institutionData);

          // Create the first administrator manually (simulating the full registration workflow)
          const adminUser = await User.create({
            email: adminData.email.toLowerCase().trim(),
            password: adminData.password,
            firstName: adminData.firstName.trim(),
            lastName: adminData.lastName.trim(),
            institutions: [{
              institutionId: institution._id,
              role: 'institution_admin',
              status: 'active',
              profileData: {
                title: 'Institution Administrator',
                department: 'Administration'
              },
              createdAt: new Date(),
              approvedAt: new Date(),
              approvedBy: institution._id
            }]
          });

          // Property 1: Admin user should be created successfully
          expect(adminUser).toBeDefined();
          expect(adminUser._id).toBeDefined();
          expect(adminUser.email).toBe(adminData.email.toLowerCase().trim());

          // Property 2: Admin user should have institutional profile
          expect(adminUser.institutions).toHaveLength(1);
          const institutionProfile = adminUser.institutions[0];
          expect(institutionProfile.institutionId.toString()).toBe(institution._id.toString());
          expect(institutionProfile.role).toBe('institution_admin');
          expect(institutionProfile.status).toBe('active');

          // Property 3: Admin user should be retrievable
          const retrievedAdmin = await User.findById(adminUser._id);
          expect(retrievedAdmin).toBeDefined();
          expect(retrievedAdmin!.institutions).toHaveLength(1);

          // Property 4: Institution statistics should reflect the admin user
          const stats = await institutionService.getInstitutionStatistics(institution._id.toString());
          expect(stats.totalUsers).toBe(1);
          expect(stats.activeUsers).toBe(1);
          expect(stats.pendingUsers).toBe(0);

          // Property 5: Admin should be able to be assigned additional admin privileges
          await institutionService.assignInstitutionAdmin(institution._id.toString(), adminUser._id.toString());
          
          // Verify the assignment didn't create duplicate profiles
          const updatedAdmin = await User.findById(adminUser._id);
          expect(updatedAdmin!.institutions).toHaveLength(1);
          expect(updatedAdmin!.institutions[0].role).toBe('institution_admin');
        }
      ),
      { numRuns: 50, endOnFailure: true } // Reduced runs for more complex test
    );
  });

  /**
   * Feature: multi-institution-support, Property 9: Institution Setup Completeness (Settings Persistence)
   * All institution settings should persist correctly and be retrievable after creation
   * Validates: Requirements 1.2, 16.4
   */
  it('should persist all institution settings and make them retrievable', async () => {
    await fc.assert(
      fc.asyncProperty(
        completeInstitutionDataGenerator(),
        async (institutionData) => {
          // Register the institution
          const institution = await institutionService.registerInstitution(institutionData);

          // Property 1: All provided settings should be persisted
          if (institutionData.settings) {
            if (institutionData.settings.academicYear) {
              expect(institution.settings.academicYear).toBe(institutionData.settings.academicYear);
            }
            if (institutionData.settings.semesterSystem) {
              expect(institution.settings.semesterSystem).toBe(institutionData.settings.semesterSystem);
            }
            if (institutionData.settings.enrollmentPolicies) {
              // Check that all provided enrollment policies are preserved
              for (const [key, value] of Object.entries(institutionData.settings.enrollmentPolicies)) {
                expect(institution.settings.enrollmentPolicies[key]).toEqual(value);
              }
              // Check that default policies are also present
              expect(institution.settings.enrollmentPolicies.registrationTimeoutDays).toBe(7);
              expect(institution.settings.enrollmentPolicies.reminderDays).toBe(2);
              expect(institution.settings.enrollmentPolicies.maxPendingRegistrations).toBe(100);
              expect(institution.settings.enrollmentPolicies.autoApprovalEnabled).toBe(false);
            }
          }

          // Property 2: All provided branding should be persisted
          if (institutionData.branding) {
            if (institutionData.branding.primaryColor) {
              expect(institution.branding.primaryColor).toBe(institutionData.branding.primaryColor);
            }
            if (institutionData.branding.logo) {
              expect(institution.branding.logo).toBe(institutionData.branding.logo);
            }
            if (institutionData.branding.theme) {
              expect(institution.branding.theme).toBe(institutionData.branding.theme);
            }
          }

          // Property 3: Settings should be retrievable after creation
          const retrievedInstitution = await institutionService.getInstitutionById(institution._id.toString());
          expect(retrievedInstitution!.settings).toEqual(institution.settings);
          expect(retrievedInstitution!.branding).toEqual(institution.branding);

          // Property 4: Settings should be updatable
          const newSettings = {
            academicYear: '2025-2026',
            semesterSystem: 'quarter' as const,
            branding: {
              primaryColor: '#ff6b6b',
              theme: 'dark'
            }
          };

          const updatedInstitution = await institutionService.updateInstitutionSettings(
            institution._id.toString(),
            newSettings
          );

          expect(updatedInstitution.settings.academicYear).toBe(newSettings.academicYear);
          expect(updatedInstitution.settings.semesterSystem).toBe(newSettings.semesterSystem);
          expect(updatedInstitution.branding.primaryColor).toBe(newSettings.branding.primaryColor);
          expect(updatedInstitution.branding.theme).toBe(newSettings.branding.theme);
        }
      ),
      { numRuns: 100, endOnFailure: true }
    );
  });

  /**
   * Feature: multi-institution-support, Property 9: Institution Setup Completeness (Status Management)
   * Institution status should be properly managed and affect availability
   * Validates: Requirements 1.2, 16.4
   */
  it('should properly manage institution status and availability', async () => {
    await fc.assert(
      fc.asyncProperty(
        completeInstitutionDataGenerator(),
        fc.constantFrom('active', 'inactive', 'suspended'),
        async (institutionData, targetStatus) => {
          // Register the institution (always starts as active)
          const institution = await institutionService.registerInstitution(institutionData);
          expect(institution.status).toBe('active');

          // Property 1: Institution should be available when active
          let availableInstitutions = await institutionService.getInstitutionList({ status: 'active' });
          let foundActive = availableInstitutions.find(inst => inst._id.toString() === institution._id.toString());
          expect(foundActive).toBeDefined();

          // Property 2: Status should be updatable
          const updatedInstitution = await institutionService.updateInstitutionStatus(
            institution._id.toString(),
            targetStatus
          );
          expect(updatedInstitution.status).toBe(targetStatus);

          // Property 3: Institution availability should reflect status
          availableInstitutions = await institutionService.getInstitutionList({ status: 'active' });
          foundActive = availableInstitutions.find(inst => inst._id.toString() === institution._id.toString());
          
          if (targetStatus === 'active') {
            expect(foundActive).toBeDefined();
          } else {
            expect(foundActive).toBeUndefined();
          }

          // Property 4: Institution should appear in status-specific lists
          const statusSpecificList = await institutionService.getInstitutionList({ status: targetStatus });
          const foundInStatusList = statusSpecificList.find(inst => inst._id.toString() === institution._id.toString());
          expect(foundInStatusList).toBeDefined();
          expect(foundInStatusList!.status).toBe(targetStatus);
        }
      ),
      { numRuns: 100, endOnFailure: true }
    );
  });
});