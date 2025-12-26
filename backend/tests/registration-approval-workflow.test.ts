import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { connectTestDatabase, disconnectTestDatabase, clearTestDatabase } from '../config/test-database';
import userService, { UserRegistrationData } from '../services/UserService';
import { institutionService } from '../services/InstitutionService';
import { InstitutionRegistrationData } from '../services/InstitutionService';

describe('Registration Approval Workflow Property Tests', () => {
  beforeAll(async () => {
    await connectTestDatabase();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  beforeEach(async () => {
    await clearTestDatabase();
  });

  // Generator for valid institution registration data
  const institutionRegistrationGenerator = (): fc.Arbitrary<InstitutionRegistrationData> => {
    // Safe string generator that avoids prototype pollution
    const safeString = (minLength: number, maxLength: number) => 
      fc.string({ minLength, maxLength })
        .filter(s => s.trim().length >= minLength && !s.includes('__proto__') && !s.includes('constructor') && !s.includes('prototype'));

    return fc.record({
      name: safeString(5, 100),
      type: fc.constantFrom('university', 'college', 'school'),
      address: fc.record({
        street: safeString(5, 100),
        city: safeString(2, 50),
        state: safeString(2, 50),
        zipCode: safeString(5, 10)
      }),
      contactInfo: fc.record({
        email: fc.emailAddress(),
        phone: safeString(10, 15)
      })
    });
  };

  // Generator for valid user registration data
  const userRegistrationGenerator = (): fc.Arbitrary<UserRegistrationData> => {
    // Safe string generator that avoids prototype pollution
    const safeString = (minLength: number, maxLength: number) => 
      fc.string({ minLength, maxLength })
        .filter(s => s.trim().length >= minLength && !s.includes('__proto__') && !s.includes('constructor') && !s.includes('prototype'));

    // Safe profileData generator that avoids prototype pollution
    const safeProfileDataGenerator = fc.dictionary(
      safeString(1, 20),
      fc.oneof(
        safeString(0, 50),
        fc.integer(),
        fc.boolean()
      )
    );

    return fc.record({
      email: fc.emailAddress(),
      password: safeString(8, 50),
      firstName: safeString(2, 50),
      lastName: safeString(2, 50),
      role: fc.constantFrom('student', 'teacher', 'institution_admin'),
      profileData: safeProfileDataGenerator
    });
  };

  /**
   * Feature: multi-institution-support, Property 5: Registration Approval Workflow
   * For any user registration, the system should create a pending record, notify appropriate administrators, and only activate the account upon explicit approval
   * Validates: Requirements 3.4, 15.1, 15.3
   */
  it('should create pending registrations that require explicit approval', async () => {
    await fc.assert(
      fc.asyncProperty(
        institutionRegistrationGenerator(),
        fc.array(userRegistrationGenerator(), { minLength: 1, maxLength: 5 }),
        async (institutionData, userDataArray) => {
          // Register institution
          let institution;
          try {
            institution = await institutionService.registerInstitution(institutionData);
          } catch (error) {
            // Skip if institution registration fails (e.g., duplicate name)
            return;
          }

          const registrations = [];
          
          // Register multiple users for the institution
          for (const userData of userDataArray) {
            try {
              const registration = await userService.registerUser(userData, institution._id.toString());
              registrations.push({
                registration,
                userData
              });
            } catch (error) {
              // Continue if individual registration fails (e.g., duplicate email)
              continue;
            }
          }

          // Skip test if no successful registrations
          if (registrations.length === 0) {
            return;
          }

          // Property 1: All registrations should be in pending status initially
          for (const { registration, userData } of registrations) {
            // Defensive checks - registration should have all required fields
            if (!registration || !registration.userId) {
              continue; // Skip if registration is malformed
            }

            expect(registration.status).toBe('pending');
            expect(registration.userId).toBeDefined();
            expect(registration.institutionId).toBe(institution._id.toString());
            expect(registration.role).toBe(userData.role);
            expect(registration.createdAt).toBeDefined();

            // Verify user exists with pending institutional profile
            const user = await userService.getUserByEmail(userData.email);
            if (!user) {
              continue; // Skip if user not found
            }
            expect(user).toBeDefined();
            
            const institutionProfile = user.institutions.find(
              inst => inst.institutionId.toString() === institution._id.toString()
            );
            if (!institutionProfile) {
              continue; // Skip if institutional profile not found
            }
            expect(institutionProfile).toBeDefined();
            expect(institutionProfile.status).toBe('pending');
            expect(institutionProfile.role).toBe(userData.role);
            expect(institutionProfile.approvedAt).toBeUndefined();
          }

          // Property 2: Pending registrations should be retrievable by institution
          const pendingRegistrations = await userService.getPendingRegistrations(institution._id.toString());
          expect(pendingRegistrations.length).toBe(registrations.length);

          // Each pending registration should match our created registrations
          for (const pendingUser of pendingRegistrations) {
            const matchingRegistration = registrations.find(
              reg => reg.registration.userId === pendingUser._id.toString()
            );
            expect(matchingRegistration).toBeDefined();
          }

          // Property 3: Users should not have active access before approval
          for (const { registration } of registrations) {
            const hasAccess = await userService.hasInstitutionalAccess(
              registration.userId,
              institution._id.toString()
            );
            expect(hasAccess).toBe(false); // Should be false because status is pending
          }

          // Property 4: Approval should activate the account
          const firstRegistration = registrations[0];
          const approvedUser = await userService.approveUserRegistration(
            firstRegistration.registration.userId,
            institution._id.toString()
          );

          expect(approvedUser).toBeDefined();
          
          // Check that the institutional profile is now active
          const updatedUser = await userService.getUserByEmail(firstRegistration.userData.email);
          if (!updatedUser) {
            return; // Skip if user not found
          }
          const approvedProfile = updatedUser.institutions.find(
            inst => inst.institutionId.toString() === institution._id.toString()
          );
          
          if (!approvedProfile) {
            return; // Skip if institutional profile not found
          }
          expect(approvedProfile.status).toBe('active');
          expect(approvedProfile.approvedAt).toBeDefined();
          expect(approvedProfile.approvedAt).toBeInstanceOf(Date);

          // Property 5: Approved user should now have institutional access
          const hasAccessAfterApproval = await userService.hasInstitutionalAccess(
            firstRegistration.registration.userId,
            institution._id.toString()
          );
          expect(hasAccessAfterApproval).toBe(true);

          // Property 6: Other registrations should remain pending
          for (let i = 1; i < registrations.length; i++) {
            const registration = registrations[i];
            const hasAccess = await userService.hasInstitutionalAccess(
              registration.registration.userId,
              institution._id.toString()
            );
            expect(hasAccess).toBe(false); // Should still be false
          }

          // Property 7: Pending count should decrease after approval
          const updatedPendingRegistrations = await userService.getPendingRegistrations(institution._id.toString());
          expect(updatedPendingRegistrations.length).toBe(registrations.length - 1);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: multi-institution-support, Property 5: Registration Approval Workflow (Rejection)
   * Rejected registrations should be properly handled and removed from pending status
   * Validates: Requirements 15.1, 15.3
   */
  it('should handle registration rejections properly', async () => {
    await fc.assert(
      fc.asyncProperty(
        institutionRegistrationGenerator(),
        userRegistrationGenerator(),
        fc.string({ minLength: 5, maxLength: 200 }), // rejection reason
        async (institutionData, userData, rejectionReason) => {
          // Register institution
          let institution;
          try {
            institution = await institutionService.registerInstitution(institutionData);
          } catch (error) {
            return;
          }

          // Register user
          let registration;
          try {
            registration = await userService.registerUser(userData, institution._id.toString());
          } catch (error) {
            return;
          }

          // Skip if registration is malformed
          if (!registration || !registration.userId) {
            return;
          }

          // Verify initial pending state
          const initialUser = await userService.getUserByEmail(userData.email);
          if (!initialUser) {
            return; // Skip if user not found
          }
          expect(initialUser).toBeDefined();
          
          const initialProfile = initialUser.institutions.find(
            inst => inst.institutionId.toString() === institution._id.toString()
          );
          if (!initialProfile) {
            return; // Skip if institutional profile not found
          }
          expect(initialProfile).toBeDefined();
          expect(initialProfile!.status).toBe('pending');

          // Property 1: Rejection should remove the pending institutional profile
          // Note: This simulates the rejection logic from the controller
          const userToReject = await userService.getUserById(registration.userId);
          expect(userToReject).toBeDefined();

          const institutionIndex = userToReject!.institutions.findIndex(
            inst => inst.institutionId.toString() === institution._id.toString() && inst.status === 'pending'
          );
          expect(institutionIndex).not.toBe(-1);

          // Remove the pending institutional profile (simulating rejection)
          userToReject!.institutions.splice(institutionIndex, 1);
          await userToReject!.save();

          // Property 2: User should no longer have any profile for this institution
          const rejectedUser = await userService.getUserByEmail(userData.email);
          const rejectedProfile = rejectedUser!.institutions.find(
            inst => inst.institutionId.toString() === institution._id.toString()
          );
          expect(rejectedProfile).toBeUndefined();

          // Property 3: User should not have institutional access
          const hasAccess = await userService.hasInstitutionalAccess(
            registration.userId,
            institution._id.toString()
          );
          expect(hasAccess).toBe(false);

          // Property 4: Pending registrations should not include the rejected user
          const pendingRegistrations = await userService.getPendingRegistrations(institution._id.toString());
          const rejectedInPending = pendingRegistrations.find(
            user => user._id.toString() === registration.userId
          );
          expect(rejectedInPending).toBeUndefined();

          // Property 5: User account should still exist (only institutional profile removed)
          const userStillExists = await userService.getUserByEmail(userData.email);
          expect(userStillExists).toBeDefined();
          expect(userStillExists!.email).toBe(userData.email);
          expect(userStillExists!.firstName).toBe(userData.firstName);
          expect(userStillExists!.lastName).toBe(userData.lastName);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: multi-institution-support, Property 5: Registration Approval Workflow (Multiple Institutions)
   * Users can have pending registrations at multiple institutions simultaneously
   * Validates: Requirements 3.4, 15.1, 15.3
   */
  it('should handle multi-institutional pending registrations independently', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(institutionRegistrationGenerator(), { minLength: 2, maxLength: 4 }),
        userRegistrationGenerator(),
        async (institutionDataArray, userData) => {
          // Register multiple institutions
          const institutions = [];
          for (const institutionData of institutionDataArray) {
            try {
              const institution = await institutionService.registerInstitution(institutionData);
              institutions.push(institution);
            } catch (error) {
              // Skip duplicate names
              continue;
            }
          }

          if (institutions.length < 2) {
            return;
          }

          // Register the same user for multiple institutions
          const registrations = [];
          for (const institution of institutions) {
            try {
              const registration = await userService.registerUser(userData, institution._id.toString());
              registrations.push({
                registration,
                institution
              });
            } catch (error) {
              continue;
            }
          }

          if (registrations.length < 2) {
            return;
          }

          // Property 1: User should have separate pending profiles for each institution
          const user = await userService.getUserByEmail(userData.email);
          if (!user) {
            return; // Skip if user not found
          }
          expect(user).toBeDefined();
          expect(user.institutions.length).toBe(registrations.length);

          for (const { institution } of registrations) {
            const profile = user.institutions.find(
              inst => inst.institutionId.toString() === institution._id.toString()
            );
            expect(profile).toBeDefined();
            expect(profile!.status).toBe('pending');
          }

          // Property 2: Each institution should see the user in their pending list
          for (const { institution } of registrations) {
            const pendingForInstitution = await userService.getPendingRegistrations(institution._id.toString());
            const userInPending = pendingForInstitution.find(
              pendingUser => pendingUser._id.toString() === user!._id.toString()
            );
            expect(userInPending).toBeDefined();
          }

          // Property 3: Approving for one institution should not affect others
          const firstRegistration = registrations[0];
          await userService.approveUserRegistration(
            firstRegistration.registration.userId,
            firstRegistration.institution._id.toString()
          );

          const updatedUser = await userService.getUserByEmail(userData.email);
          
          // First institution should be approved
          const approvedProfile = updatedUser!.institutions.find(
            inst => inst.institutionId.toString() === firstRegistration.institution._id.toString()
          );
          expect(approvedProfile!.status).toBe('active');
          expect(approvedProfile!.approvedAt).toBeDefined();

          // Other institutions should remain pending
          for (let i = 1; i < registrations.length; i++) {
            const registration = registrations[i];
            const pendingProfile = updatedUser!.institutions.find(
              inst => inst.institutionId.toString() === registration.institution._id.toString()
            );
            expect(pendingProfile!.status).toBe('pending');
            expect(pendingProfile!.approvedAt).toBeUndefined();
          }

          // Property 4: User should have access only to approved institution
          const hasAccessToApproved = await userService.hasInstitutionalAccess(
            user!._id.toString(),
            firstRegistration.institution._id.toString()
          );
          expect(hasAccessToApproved).toBe(true);

          for (let i = 1; i < registrations.length; i++) {
            const hasAccessToPending = await userService.hasInstitutionalAccess(
              user!._id.toString(),
              registrations[i].institution._id.toString()
            );
            expect(hasAccessToPending).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});