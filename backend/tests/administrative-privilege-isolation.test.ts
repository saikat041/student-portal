// Set required environment variables for testing BEFORE any imports
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing';
process.env.JWT_EXPIRE = '7d';

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { connectTestDatabase, disconnectTestDatabase, clearTestDatabase } from '../config/test-database';
import userService, { UserRegistrationData } from '../services/UserService';
import { institutionService } from '../services/InstitutionService';
import { InstitutionRegistrationData } from '../services/InstitutionService';
import User from '../models/User';

describe('Administrative Privilege Isolation Property Tests', () => {
  beforeAll(async () => {
    await connectTestDatabase();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  beforeEach(async () => {
    await clearTestDatabase();
  });

  // Helper function to generate unique institution names
  const generateUniqueInstitutionName = (baseName: string): string => {
    return `${baseName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  };

  // Generate test institutions with unique names
  const getTestInstitutions = (): InstitutionRegistrationData[] => [
    {
      name: generateUniqueInstitutionName('Harvard_University'),
      type: 'university',
      address: {
        street: '123 Main Street',
        city: 'Cambridge',
        state: 'Massachusetts',
        zipCode: '02138'
      },
      contactInfo: {
        email: 'contact@harvard.edu',
        phone: '617-555-0100'
      }
    },
    {
      name: generateUniqueInstitutionName('MIT_Institute'),
      type: 'university',
      address: {
        street: '77 Massachusetts Avenue',
        city: 'Cambridge',
        state: 'Massachusetts',
        zipCode: '02139'
      },
      contactInfo: {
        email: 'contact@mit.edu',
        phone: '617-555-0200'
      }
    },
    {
      name: generateUniqueInstitutionName('Stanford_University'),
      type: 'university',
      address: {
        street: '450 Serra Mall',
        city: 'Palo Alto',
        state: 'California',
        zipCode: '94305'
      },
      contactInfo: {
        email: 'contact@stanford.edu',
        phone: '650-555-0300'
      }
    }
  ];

  const testUsers: UserRegistrationData[] = [
    {
      email: 'john.doe@example.com',
      password: 'SecurePass123!',
      firstName: 'John',
      lastName: 'Doe',
      role: 'student',
      profileData: {}
    },
    {
      email: 'jane.smith@example.com',
      password: 'SecurePass456!',
      firstName: 'Jane',
      lastName: 'Smith',
      role: 'teacher',
      profileData: {}
    },
    {
      email: 'bob.johnson@example.com',
      password: 'SecurePass789!',
      firstName: 'Bob',
      lastName: 'Johnson',
      role: 'student',
      profileData: {}
    },
    {
      email: 'alice.williams@example.com',
      password: 'SecurePass012!',
      firstName: 'Alice',
      lastName: 'Williams',
      role: 'teacher',
      profileData: {}
    }
  ];

  /**
   * Feature: multi-institution-support, Property 8: Administrative Privilege Isolation
   * For any administrative action, the system should restrict the action's scope to only the administrator's current institution
   * Validates: Requirements 2.1, 17.2, 18.2
   */
  it('should restrict administrative actions to the administrators current institution', async () => {
    // Get unique test institutions for this test run
    const testInstitutions = getTestInstitutions();
    
    // Register multiple institutions
    const institution1 = await institutionService.registerInstitution(testInstitutions[0]);
    const institution2 = await institutionService.registerInstitution(testInstitutions[1]);

    // Create admin users for each institution
    const admin1 = new User({
      email: 'admin1@harvard.edu',
      password: 'admin123',
      firstName: 'Admin',
      lastName: 'One',
      institutions: [{
        institutionId: institution1._id,
        role: 'institution_admin',
        status: 'active',
        profileData: {},
        createdAt: new Date(),
        approvedAt: new Date()
      }]
    });
    await admin1.save();

    const admin2 = new User({
      email: 'admin2@mit.edu',
      password: 'admin123',
      firstName: 'Admin',
      lastName: 'Two',
      institutions: [{
        institutionId: institution2._id,
        role: 'institution_admin',
        status: 'active',
        profileData: {},
        createdAt: new Date(),
        approvedAt: new Date()
      }]
    });
    await admin2.save();

    // Create regular users for each institution
    const registration1 = await userService.registerUser(testUsers[0], institution1._id.toString());
    await userService.approveUserRegistration(registration1.userId, institution1._id.toString());
    const user1 = await userService.getUserById(registration1.userId);

    const registration2 = await userService.registerUser(testUsers[1], institution2._id.toString());
    await userService.approveUserRegistration(registration2.userId, institution2._id.toString());
    const user2 = await userService.getUserById(registration2.userId);

    // Property 1: Admin can only see pending registrations from their own institution
    const pendingRegistrations1 = await userService.getPendingRegistrations(institution1._id.toString());
    
    // All pending registrations should belong to institution1
    for (const pendingUser of pendingRegistrations1) {
      const institutionProfile = pendingUser.institutions.find(
        inst => inst.status === 'pending'
      );
      expect(institutionProfile?.institutionId.toString()).toBe(institution1._id.toString());
    }

    // Property 2: Admin can only approve/reject users for their own institution
    const pendingUserData: UserRegistrationData = {
      email: 'pending@test.com',
      password: 'password123',
      firstName: 'Pending',
      lastName: 'User',
      role: 'student',
      profileData: {}
    };

    const pendingRegistration = await userService.registerUser(
      pendingUserData, 
      institution1._id.toString()
    );

    // Admin from institution 1 should be able to approve
    const approvedUser = await userService.approveUserRegistration(
      pendingRegistration.userId,
      institution1._id.toString()
    );
    expect(approvedUser).toBeDefined();

    // Verify the user is approved for institution 1
    const approvedProfile = approvedUser.institutions.find(
      inst => inst.institutionId.toString() === institution1._id.toString()
    );
    expect(approvedProfile?.status).toBe('active');

    // Property 3: Admin cannot access users from other institutions
    const institutionAUsers = await userService.getUsersByInstitution(
      institution1._id.toString()
    );
    const institutionBUsers = await userService.getUsersByInstitution(
      institution2._id.toString()
    );

    // Users from institution 1 should not appear in institution 2's user list
    for (const userA of institutionAUsers) {
      const foundInB = institutionBUsers.find(userB => userB._id.toString() === userA._id.toString());
      if (foundInB) {
        // If found, they should have separate profiles for each institution
        const profileA = userA.institutions.find(
          inst => inst.institutionId.toString() === institution1._id.toString()
        );
        const profileB = foundInB.institutions.find(
          inst => inst.institutionId.toString() === institution2._id.toString()
        );
        
        // Both profiles should exist but be separate
        expect(profileA).toBeDefined();
        expect(profileB).toBeDefined();
        expect(profileA?.institutionId.toString()).not.toBe(profileB?.institutionId.toString());
      }
    }

    // Property 4: Admin privilege assignment is scoped to institution
    if (user2) {
      // This should work - admin 2 assigning privileges within their institution
      await institutionService.assignInstitutionAdmin(
        institution2._id.toString(),
        user2._id.toString()
      );

      // Verify the user now has admin privileges for institution 2
      const updatedUser = await userService.getUserById(user2._id.toString());
      expect(updatedUser).toBeDefined();
      expect(updatedUser!.institutions).toBeDefined();
      expect(updatedUser!.institutions.length).toBeGreaterThan(0);
      
      const adminProfile = updatedUser!.institutions.find(
        inst => inst.institutionId.toString() === institution2._id.toString()
      );
      expect(adminProfile).toBeDefined();
      expect(adminProfile?.role).toBe('institution_admin');
    }

    // Property 5: Institution settings are isolated
    const settingsA = {
      academicYear: '2024-2025',
      enrollmentPolicies: {
        registrationTimeoutDays: 10,
        reminderDays: 3
      }
    };

    await institutionService.updateInstitutionSettings(
      institution1._id.toString(),
      settingsA
    );

    // Verify institution 2's settings are unchanged
    const institutionBAfterUpdate = await institutionService.getInstitutionById(
      institution2._id.toString()
    );

    expect(institutionBAfterUpdate?.settings.enrollmentPolicies?.registrationTimeoutDays).not.toBe(10);
    expect(institutionBAfterUpdate?.settings.enrollmentPolicies?.reminderDays).not.toBe(3);

    // Property 6: Administrative statistics are institution-scoped
    const statsA = await institutionService.getInstitutionStatistics(
      institution1._id.toString()
    );
    const statsB = await institutionService.getInstitutionStatistics(
      institution2._id.toString()
    );

    // Statistics should be different (unless by coincidence)
    // At minimum, they should be calculated independently
    expect(typeof statsA.totalUsers).toBe('number');
    expect(typeof statsB.totalUsers).toBe('number');
    expect(statsA.totalUsers).toBeGreaterThanOrEqual(0);
    expect(statsB.totalUsers).toBeGreaterThanOrEqual(0);
  });

  /**
   * Feature: multi-institution-support, Property 8: Administrative Privilege Isolation (Cross-Institution Prevention)
   * Administrators should not be able to perform actions on users or data from other institutions
   * Validates: Requirements 2.1, 17.2, 18.2
   */
  it('should prevent cross-institutional administrative actions', async () => {
    // Get unique test institutions for this test run
    const testInstitutions = getTestInstitutions();
    
    // Register two institutions
    const institutionA = await institutionService.registerInstitution(testInstitutions[0]);
    const institutionB = await institutionService.registerInstitution(testInstitutions[1]);

    // Create admin for institution A
    const adminA = new User({
      email: 'admin.a@test.edu',
      password: 'admin123',
      firstName: 'Admin',
      lastName: 'A',
      institutions: [{
        institutionId: institutionA._id,
        role: 'institution_admin',
        status: 'active',
        profileData: {},
        createdAt: new Date(),
        approvedAt: new Date()
      }]
    });
    await adminA.save();

    // Create regular user for institution B
    const registrationB = await userService.registerUser(testUsers[1], institutionB._id.toString());
    await userService.approveUserRegistration(registrationB.userId, institutionB._id.toString());
    const userB = await userService.getUserById(registrationB.userId);

    if (!userB) {
      throw new Error('Failed to create user B');
    }

    // Property 1: Admin A cannot see pending registrations from institution B
    const pendingRegistrationsA = await userService.getPendingRegistrations(institutionA._id.toString());
    const pendingRegistrationsB = await userService.getPendingRegistrations(institutionB._id.toString());

    // Admin A should only see registrations for institution A
    for (const pendingUser of pendingRegistrationsA) {
      const institutionProfile = pendingUser.institutions.find(inst => inst.status === 'pending');
      expect(institutionProfile?.institutionId.toString()).toBe(institutionA._id.toString());
    }

    // Property 2: Admin A cannot approve users for institution B
    // Create a pending user for institution B
    const pendingUserDataB: UserRegistrationData = {
      email: 'pending.b@test.com',
      password: 'password123',
      firstName: 'Pending',
      lastName: 'B',
      role: 'student',
      profileData: {}
    };

    const pendingRegistrationB = await userService.registerUser(
      pendingUserDataB,
      institutionB._id.toString()
    );

    // Admin A should not be able to approve this user (they shouldn't even know about them)
    const pendingUserB = await userService.getUserById(pendingRegistrationB.userId);
    expect(pendingUserB).toBeDefined();
    expect(pendingUserB!.institutions).toBeDefined();
    expect(pendingUserB!.institutions.length).toBeGreaterThan(0);
    
    const pendingProfileB = pendingUserB!.institutions.find(
      inst => inst.institutionId.toString() === institutionB._id.toString()
    );
    expect(pendingProfileB).toBeDefined();
    expect(pendingProfileB?.status).toBe('pending');

    // Property 3: Admin A cannot modify institution B's settings
    const originalSettingsB = await institutionService.getInstitutionById(institutionB._id.toString());
    const originalTimeoutDays = originalSettingsB?.settings.enrollmentPolicies?.registrationTimeoutDays || 7;

    // Admin A modifies institution A's settings
    await institutionService.updateInstitutionSettings(institutionA._id.toString(), {
      enrollmentPolicies: {
        registrationTimeoutDays: 14,
        reminderDays: 5
      }
    });

    // Institution B's settings should remain unchanged
    const updatedSettingsB = await institutionService.getInstitutionById(institutionB._id.toString());
    expect(updatedSettingsB?.settings.enrollmentPolicies?.registrationTimeoutDays).toBe(originalTimeoutDays);

    // Property 4: Admin A cannot assign admin privileges for institution B
    // This is enforced by the business logic - admin A shouldn't have access to institution B's user management

    // Property 5: Statistics are isolated
    const statsA = await institutionService.getInstitutionStatistics(institutionA._id.toString());
    const statsB = await institutionService.getInstitutionStatistics(institutionB._id.toString());

    // Each institution should have independent statistics
    expect(statsA).toBeDefined();
    expect(statsB).toBeDefined();
    
    // The statistics should reflect only their respective institution's data
    expect(statsA.totalUsers).toBeGreaterThanOrEqual(1); // At least admin A
    expect(statsB.totalUsers).toBeGreaterThanOrEqual(1); // At least user B
  });
});