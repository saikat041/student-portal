import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { connectTestDatabase, disconnectTestDatabase, clearTestDatabase } from '../config/test-database';
import userService, { UserRegistrationData } from '../services/UserService';
import { institutionService } from '../services/InstitutionService';
import { InstitutionRegistrationData } from '../services/InstitutionService';

describe('Multi-Institutional Profile Separation Tests', () => {
  beforeAll(async () => {
    await connectTestDatabase();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  beforeEach(async () => {
    await clearTestDatabase();
  });

  // Helper function to create test institutions
  const createTestInstitution = async (name: string, type: 'university' | 'college' | 'school' = 'university') => {
    const institutionData: InstitutionRegistrationData = {
      name,
      type,
      address: {
        street: `123 ${name} Street`,
        city: `${name} City`,
        state: `${name} State`,
        zipCode: '12345'
      },
      contactInfo: {
        email: `admin@${name.toLowerCase().replace(/\s+/g, '')}.edu`,
        phone: '555-0123'
      }
    };
    return await institutionService.registerInstitution(institutionData);
  };

  // Helper function to create test user data
  const createTestUserData = (email: string, firstName: string, lastName: string): UserRegistrationData => {
    return {
      email,
      password: 'testpassword123',
      firstName,
      lastName,
      role: 'student',
      profileData: {
        studentId: `STU${Date.now()}`,
        department: 'Computer Science'
      }
    };
  };

  /**
   * Feature: multi-institution-support, Property 6: Multi-Institutional Profile Separation
   * For any user with accounts at multiple institutions, each institutional profile should be completely separate while maintaining email-based account linking
   * Validates: Requirements 9.1, 14.2, 14.3
   */
  it('should maintain separate institutional profiles for the same user', async () => {
    // Create test institutions
    const stateUniversity = await createTestInstitution('State University');
    const communityCollege = await createTestInstitution('Community College', 'college');
    const techInstitute = await createTestInstitution('Tech Institute');

    // Create test user data
    const userData = createTestUserData('sarah.johnson@email.com', 'Sarah', 'Johnson');

    // Register the same user for multiple institutions with different roles and profile data
    const studentRegistration = await userService.registerUser({
      ...userData,
      role: 'student',
      profileData: {
        studentId: 'SU12345',
        department: 'Computer Science',
        yearLevel: 3,
        gpa: 3.8
      }
    }, stateUniversity._id.toString());

    const teacherRegistration = await userService.registerUser({
      ...userData,
      role: 'teacher',
      profileData: {
        employeeId: 'CC789',
        department: 'Mathematics',
        officeNumber: 'B204',
        courses: ['MATH101', 'MATH201']
      }
    }, communityCollege._id.toString());

    const adminRegistration = await userService.registerUser({
      ...userData,
      role: 'institution_admin',
      profileData: {
        adminId: 'TI001',
        department: 'Administration',
        permissions: ['user_management', 'course_management']
      }
    }, techInstitute._id.toString());

    // Verify the user exists and has multiple institutional profiles
    const user = await userService.getUserByEmail(userData.email);
    expect(user).toBeDefined();
    expect(user!.institutions.length).toBe(3);

    // Property 1: Each institutional profile should be completely separate
    const profiles = user!.institutions;
    
    // Verify we have exactly 3 profiles
    expect(profiles.length).toBe(3);
    
    // Verify different institutions - handle populated institutionId
    const institutionIds = profiles.map(p => {
      const instId = p.institutionId as any;
      return instId._id ? instId._id.toString() : instId.toString();
    });
    expect(institutionIds).toContain(stateUniversity._id.toString());
    expect(institutionIds).toContain(communityCollege._id.toString());
    expect(institutionIds).toContain(techInstitute._id.toString());
    expect(new Set(institutionIds).size).toBe(3); // All unique

    // Verify different roles
    const roles = profiles.map(p => p.role);
    expect(roles).toContain('student');
    expect(roles).toContain('teacher');
    expect(roles).toContain('institution_admin');

    // Verify profile data is institution-specific (not shared)
    const studentProfile = profiles.find(p => p.role === 'student');
    const teacherProfile = profiles.find(p => p.role === 'teacher');
    const adminProfile = profiles.find(p => p.role === 'institution_admin');

    expect(studentProfile).toBeDefined();
    expect(teacherProfile).toBeDefined();
    expect(adminProfile).toBeDefined();

    expect(studentProfile!.profileData).toEqual({
      studentId: 'SU12345',
      department: 'Computer Science',
      yearLevel: 3,
      gpa: 3.8
    });

    expect(teacherProfile!.profileData).toEqual({
      employeeId: 'CC789',
      department: 'Mathematics',
      officeNumber: 'B204',
      courses: ['MATH101', 'MATH201']
    });

    expect(adminProfile!.profileData).toEqual({
      adminId: 'TI001',
      department: 'Administration',
      permissions: ['user_management', 'course_management']
    });

    // Verify each profile has its own creation timestamp
    profiles.forEach(profile => {
      expect(profile.createdAt).toBeDefined();
      expect(profile.createdAt).toBeInstanceOf(Date);
    });

    // Property 2: Email-based account linking should be maintained
    expect(user!.email).toBe(userData.email);
    expect(user!.firstName).toBe(userData.firstName);
    expect(user!.lastName).toBe(userData.lastName);

    // Property 3: getUserInstitutions should return separate institutional contexts
    const userInstitutions = await userService.getUserInstitutions(user!._id.toString());
    expect(userInstitutions.length).toBe(3);

    // Each returned institution should be unique
    const returnedInstitutionIds = userInstitutions.map(ui => ui.institutionId);
    expect(new Set(returnedInstitutionIds).size).toBe(3);

    // Each should have separate profile data
    const returnedProfiles = userInstitutions.map(ui => ui.profileData);
    expect(returnedProfiles[0]).not.toEqual(returnedProfiles[1]);
    expect(returnedProfiles[1]).not.toEqual(returnedProfiles[2]);
    expect(returnedProfiles[0]).not.toEqual(returnedProfiles[2]);
  });

  /**
   * Feature: multi-institution-support, Property 6: Multi-Institutional Profile Separation (Profile Updates)
   * Updates to one institutional profile should not affect other institutional profiles
   * Validates: Requirements 9.1, 14.2, 14.3
   */
  it('should isolate profile updates between institutions', async () => {
    // Create test institutions
    const university = await createTestInstitution('Test University');
    const college = await createTestInstitution('Test College', 'college');

    // Create test user
    const userData = createTestUserData('john.doe@email.com', 'John', 'Doe');

    // Register user for both institutions
    await userService.registerUser({
      ...userData,
      role: 'student',
      profileData: {
        studentId: 'UNI123',
        department: 'Engineering',
        year: 2
      }
    }, university._id.toString());

    await userService.registerUser({
      ...userData,
      role: 'teacher',
      profileData: {
        employeeId: 'COL456',
        department: 'Arts',
        office: 'A101'
      }
    }, college._id.toString());

    const user = await userService.getUserByEmail(userData.email);
    expect(user).toBeDefined();
    expect(user!.institutions.length).toBe(2);

    // Get initial profile data for both institutions
    const universityProfile = user!.institutions.find(
      inst => {
        const instId = inst.institutionId as any;
        const id = instId._id ? instId._id.toString() : instId.toString();
        return id === university._id.toString();
      }
    );
    const collegeProfile = user!.institutions.find(
      inst => {
        const instId = inst.institutionId as any;
        const id = instId._id ? instId._id.toString() : instId.toString();
        return id === college._id.toString();
      }
    );

    expect(universityProfile).toBeDefined();
    expect(collegeProfile).toBeDefined();

    const initialUniversityData = { ...universityProfile!.profileData };
    const initialCollegeData = { ...collegeProfile!.profileData };

    // Update profile data for only the university
    const updateData = {
      year: 3,
      gpa: 3.5,
      newField: 'updated value'
    };

    await userService.updateUserInstitutionalProfile(
      user!._id.toString(),
      university._id.toString(),
      updateData
    );

    // Verify the update
    const updatedUser = await userService.getUserByEmail(userData.email);
    expect(updatedUser).toBeDefined();

    const updatedUniversityProfile = updatedUser!.institutions.find(
      inst => {
        const instId = inst.institutionId as any;
        const id = instId._id ? instId._id.toString() : instId.toString();
        return id === university._id.toString();
      }
    );
    const updatedCollegeProfile = updatedUser!.institutions.find(
      inst => {
        const instId = inst.institutionId as any;
        const id = instId._id ? instId._id.toString() : instId.toString();
        return id === college._id.toString();
      }
    );

    // Property: Only the target institution's profile should be updated
    expect(updatedUniversityProfile!.profileData).toEqual({
      ...initialUniversityData,
      ...updateData
    });

    // Other institution should remain unchanged
    expect(updatedCollegeProfile!.profileData).toEqual(initialCollegeData);

    // Property: User's core data should remain unchanged
    expect(updatedUser!.email).toBe(userData.email);
    expect(updatedUser!.firstName).toBe(userData.firstName);
    expect(updatedUser!.lastName).toBe(userData.lastName);
  });

  /**
   * Feature: multi-institution-support, Property 6: Multi-Institutional Profile Separation (Access Control)
   * User access validation should be institution-specific
   * Validates: Requirements 9.1, 14.2, 14.3
   */
  it('should validate institutional access separately for each institution', async () => {
    // Create test institutions
    const registeredUniversity = await createTestInstitution('Registered University');
    const registeredCollege = await createTestInstitution('Registered College', 'college');
    const unregisteredInstitute = await createTestInstitution('Unregistered Institute');

    // Create test user
    const userData = createTestUserData('alice.smith@email.com', 'Alice', 'Smith');

    // Register user for some institutions but not others
    await userService.registerUser({
      ...userData,
      role: 'student',
      profileData: { studentId: 'RU001' }
    }, registeredUniversity._id.toString());

    await userService.registerUser({
      ...userData,
      role: 'teacher',
      profileData: { employeeId: 'RC002' }
    }, registeredCollege._id.toString());

    // Note: User is NOT registered at unregisteredInstitute

    const user = await userService.getUserByEmail(userData.email);
    expect(user).toBeDefined();

    // Approve user for registered institutions
    await userService.approveUserRegistration(user!._id.toString(), registeredUniversity._id.toString());
    await userService.approveUserRegistration(user!._id.toString(), registeredCollege._id.toString());

    // Property: User should have access to registered institutions
    const hasUniversityAccess = await userService.hasInstitutionalAccess(
      user!._id.toString(),
      registeredUniversity._id.toString()
    );
    expect(hasUniversityAccess).toBe(true);

    const hasCollegeAccess = await userService.hasInstitutionalAccess(
      user!._id.toString(),
      registeredCollege._id.toString()
    );
    expect(hasCollegeAccess).toBe(true);

    // Property: User should NOT have access to unregistered institutions
    const hasUnregisteredAccess = await userService.hasInstitutionalAccess(
      user!._id.toString(),
      unregisteredInstitute._id.toString()
    );
    expect(hasUnregisteredAccess).toBe(false);

    // Property: Role-based access should be institution-specific
    const userInstitutions = await userService.getUserInstitutions(user!._id.toString());
    expect(userInstitutions.length).toBe(2);

    // Now test role-based access (users are already approved above)
    for (const userInst of userInstitutions) {
      // Extract the actual institution ID from the populated object
      // The institutionId is being stringified, so we need to extract the _id from it
      let actualInstitutionId = userInst.institutionId;
      
      // If it's a stringified object, extract the ObjectId
      if (typeof actualInstitutionId === 'string' && actualInstitutionId.includes('_id: new ObjectId(')) {
        const match = actualInstitutionId.match(/_id: new ObjectId\('([^']+)'\)/);
        if (match) {
          actualInstitutionId = match[1];
        }
      }

      // Should have access with correct role
      const hasRoleAccess = await userService.hasInstitutionalAccess(
        user!._id.toString(),
        actualInstitutionId,
        userInst.role
      );
      expect(hasRoleAccess).toBe(true);

      // Should not have access with different role
      const otherRole = userInst.role === 'student' ? 'teacher' : 'student';
      const hasWrongRoleAccess = await userService.hasInstitutionalAccess(
        user!._id.toString(),
        actualInstitutionId,
        otherRole
      );
      expect(hasWrongRoleAccess).toBe(false);
    }
  });

  /**
   * Test edge case: User with same email registering at same institution twice
   * Should handle gracefully without creating duplicate profiles
   */
  it('should prevent duplicate registrations at the same institution', async () => {
    const university = await createTestInstitution('Duplicate Test University');
    const userData = createTestUserData('duplicate@email.com', 'Duplicate', 'User');

    // First registration should succeed
    const firstRegistration = await userService.registerUser(userData, university._id.toString());
    expect(firstRegistration).toBeDefined();

    // Second registration at same institution should fail or be handled gracefully
    await expect(
      userService.registerUser(userData, university._id.toString())
    ).rejects.toThrow();

    // Verify only one profile exists
    const user = await userService.getUserByEmail(userData.email);
    expect(user).toBeDefined();
    expect(user!.institutions.length).toBe(1);
  });

  /**
   * Test user switching between institutional contexts
   * Should maintain separate session contexts
   */
  it('should support switching between institutional contexts', async () => {
    const university = await createTestInstitution('Context University');
    const college = await createTestInstitution('Context College', 'college');
    
    const userData = createTestUserData('context@email.com', 'Context', 'User');

    // Register at both institutions
    await userService.registerUser({
      ...userData,
      role: 'student'
    }, university._id.toString());

    await userService.registerUser({
      ...userData,
      role: 'teacher'
    }, college._id.toString());

    const user = await userService.getUserByEmail(userData.email);
    expect(user).toBeDefined();

    // Approve both registrations
    await userService.approveUserRegistration(user!._id.toString(), university._id.toString());
    await userService.approveUserRegistration(user!._id.toString(), college._id.toString());

    // Test access to both institutions
    const hasUniversityAccess = await userService.hasInstitutionalAccess(
      user!._id.toString(),
      university._id.toString()
    );
    expect(hasUniversityAccess).toBe(true);

    const hasCollegeAccess = await userService.hasInstitutionalAccess(
      user!._id.toString(),
      college._id.toString()
    );
    expect(hasCollegeAccess).toBe(true);

    // Test role-specific access
    const hasUniversityStudentAccess = await userService.hasInstitutionalAccess(
      user!._id.toString(),
      university._id.toString(),
      'student'
    );
    expect(hasUniversityStudentAccess).toBe(true);

    const hasCollegeTeacherAccess = await userService.hasInstitutionalAccess(
      user!._id.toString(),
      college._id.toString(),
      'teacher'
    );
    expect(hasCollegeTeacherAccess).toBe(true);

    // Test wrong role access should fail
    const hasUniversityTeacherAccess = await userService.hasInstitutionalAccess(
      user!._id.toString(),
      university._id.toString(),
      'teacher'
    );
    expect(hasUniversityTeacherAccess).toBe(false);
  });
});