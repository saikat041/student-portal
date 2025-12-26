import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import User from '../models/User';
import Institution from '../models/Institution';
import userService from '../services/UserService';
import { institutionService } from '../services/InstitutionService';

describe('Administrative Privilege Management', () => {
  let mongod: MongoMemoryServer;
  let institutionId: string;
  let userId1: string;
  let userId2: string;

  beforeEach(async () => {
    // Start in-memory MongoDB
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    await mongoose.connect(uri);
    console.log('Connected to in-memory test database');

    // Create test institution
    const institutionData = {
      name: 'Test University',
      type: 'university' as const,
      address: {
        street: '123 Test St',
        city: 'Test City',
        state: 'TS',
        zipCode: '12345'
      },
      contactInfo: {
        email: 'admin@test.edu',
        phone: '555-0123'
      }
    };

    const institution = await institutionService.registerInstitution(institutionData);
    institutionId = institution._id.toString();

    // Create test users
    const userData1 = {
      email: 'user1@test.edu',
      password: 'password123',
      firstName: 'John',
      lastName: 'Doe',
      role: 'teacher' as const,
      profileData: { department: 'Computer Science' }
    };

    const userData2 = {
      email: 'user2@test.edu',
      password: 'password123',
      firstName: 'Jane',
      lastName: 'Smith',
      role: 'student' as const,
      profileData: { major: 'Computer Science' }
    };

    const pendingUser1 = await userService.registerUser(userData1, institutionId);
    const pendingUser2 = await userService.registerUser(userData2, institutionId);
    
    // Approve the users
    await userService.approveUserRegistration(pendingUser1.userId, institutionId);
    await userService.approveUserRegistration(pendingUser2.userId, institutionId);
    
    userId1 = pendingUser1.userId;
    userId2 = pendingUser2.userId;
  });

  afterEach(async () => {
    await mongoose.disconnect();
    await mongod.stop();
    console.log('Disconnected from test database');
  });

  it('should promote user to institution administrator', async () => {
    // Promote user to admin
    const promotedUser = await userService.promoteToInstitutionAdmin(
      userId1,
      institutionId,
      'system',
      'institution',
      ['user_management', 'registration_approval', 'settings_management']
    );

    expect(promotedUser).toBeDefined();
    expect(promotedUser.email).toBe('user1@test.edu');

    // Verify the user has admin role
    const user = await User.findById(userId1);
    const institutionProfile = user?.institutions.find(
      inst => inst.institutionId.toString() === institutionId
    );

    expect(institutionProfile?.role).toBe('institution_admin');
    expect(institutionProfile?.profileData.adminLevel).toBe('institution');
    expect(institutionProfile?.profileData.permissions).toEqual([
      'user_management', 'registration_approval', 'settings_management'
    ]);
  });

  it('should get institution administrators', async () => {
    // Promote user to admin first
    await userService.promoteToInstitutionAdmin(
      userId1,
      institutionId,
      'system',
      'institution',
      ['user_management', 'registration_approval']
    );

    // Get administrators
    const administrators = await userService.getInstitutionAdministrators(institutionId);

    expect(administrators).toHaveLength(1);
    expect(administrators[0].email).toBe('user1@test.edu');
    expect(administrators[0].adminLevel).toBe('institution');
    expect(administrators[0].permissions).toEqual(['user_management', 'registration_approval']);
  });

  it('should update administrator permissions', async () => {
    // Promote user to admin first
    await userService.promoteToInstitutionAdmin(
      userId1,
      institutionId,
      'system',
      'institution',
      ['user_management']
    );

    // Update permissions
    const newPermissions = ['user_management', 'registration_approval', 'course_management'];
    await userService.updateAdminPermissions(
      userId1,
      institutionId,
      newPermissions,
      'system'
    );

    // Verify permissions were updated - reload user from database
    const updatedUser = await User.findById(userId1);
    const institutionProfile = updatedUser?.institutions.find(
      inst => inst.institutionId.toString() === institutionId
    );

    expect(institutionProfile?.profileData.permissions).toEqual(newPermissions);
    expect(institutionProfile?.profileData.permissionsUpdatedBy).toBeDefined();
  });

  it('should remove administrative privileges', async () => {
    // Promote user to admin first
    await userService.promoteToInstitutionAdmin(
      userId1,
      institutionId,
      'system',
      'institution',
      ['user_management', 'registration_approval']
    );

    // Remove admin privileges
    await userService.removeAdminPrivileges(
      userId1,
      institutionId,
      'teacher',
      'system',
      'Testing privilege removal'
    );

    // Verify privileges were removed
    const user = await User.findById(userId1);
    const institutionProfile = user?.institutions.find(
      inst => inst.institutionId.toString() === institutionId
    );

    expect(institutionProfile?.role).toBe('teacher');
    expect(institutionProfile?.profileData.adminPrivilegesRemovedAt).toBeDefined();
    expect(institutionProfile?.profileData.adminPrivilegesRemovalReason).toBe('Testing privilege removal');
  });

  it('should track administrative privilege history', async () => {
    // Promote user to admin
    await userService.promoteToInstitutionAdmin(
      userId1,
      institutionId,
      'system',
      'institution',
      ['user_management']
    );

    // Update permissions
    await userService.updateAdminPermissions(
      userId1,
      institutionId,
      ['user_management', 'registration_approval'],
      'system'
    );

    // Remove privileges
    await userService.removeAdminPrivileges(
      userId1,
      institutionId,
      'teacher',
      'system',
      'Test removal'
    );

    // Get privilege history
    const history = await userService.getAdminPrivilegeHistory(institutionId);

    expect(history.length).toBeGreaterThanOrEqual(2); // promotion and removal (permission update might not be tracked separately)
    
    const promotionEvent = history.find(event => event.action === 'promoted');
    const removalEvent = history.find(event => event.action === 'removed');

    expect(promotionEvent).toBeDefined();
    expect(promotionEvent?.email).toBe('user1@test.edu');
    
    // The adminLevel is preserved in the removal event's previousAdminLevel
    expect(removalEvent).toBeDefined();
    expect(removalEvent?.details.reason).toBe('Test removal');
    expect(removalEvent?.details.newRole).toBe('teacher');
    expect(removalEvent?.details.previousAdminLevel).toBe('institution');
  });

  it('should enforce institutional boundaries for admin operations', async () => {
    // Create another institution
    const institution2Data = {
      name: 'Another University',
      type: 'university' as const,
      address: {
        street: '456 Other St',
        city: 'Other City',
        state: 'OS',
        zipCode: '67890'
      },
      contactInfo: {
        email: 'admin@other.edu',
        phone: '555-0456'
      }
    };

    const institution2 = await institutionService.registerInstitution(institution2Data);
    const institution2Id = institution2._id.toString();

    // Try to promote user from institution1 to admin of institution2 (should fail)
    await expect(
      userService.promoteToInstitutionAdmin(
        userId1,
        institution2Id,
        'system',
        'institution',
        ['user_management']
      )
    ).rejects.toThrow('User is not registered for this institution');
  });

  it('should validate admin role requirements', async () => {
    // Try to remove admin privileges from non-admin user (should fail)
    await expect(
      userService.removeAdminPrivileges(
        userId1,
        institutionId,
        'teacher',
        'system'
      )
    ).rejects.toThrow('User is not an institution administrator');

    // Try to update permissions for non-admin user (should fail)
    await expect(
      userService.updateAdminPermissions(
        userId1,
        institutionId,
        ['user_management'],
        'system'
      )
    ).rejects.toThrow('User is not an institution administrator');
  });
});