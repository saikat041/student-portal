import mongoose from 'mongoose';
import User, { IUser, IUserInstitution } from '../models/User';
import Institution, { IInstitution } from '../models/Institution';

export interface UserRegistrationData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: 'student' | 'teacher' | 'institution_admin';
  profileData?: Record<string, any>;
}

export interface PendingUser {
  userId: string;
  institutionId: string;
  role: string;
  status: 'pending';
  createdAt: Date;
}

export interface UserInstitution {
  institutionId: string;
  institutionName: string;
  role: 'student' | 'teacher' | 'institution_admin';
  status: 'pending' | 'active' | 'inactive';
  profileData: Record<string, any>;
  createdAt: Date;
  approvedAt?: Date;
}

export class UserService {
  /**
   * Register a new user for an institution or add an existing user to a new institution
   */
  async registerUser(userData: UserRegistrationData, institutionId: string): Promise<PendingUser> {
    // Validate institution exists and is active
    const institution = await Institution.findById(institutionId);
    if (!institution) {
      throw new Error('Institution not found');
    }
    if (institution.status !== 'active') {
      throw new Error('Institution is not active');
    }

    // Check if user already exists
    let user = await User.findOne({ email: userData.email });
    
    if (user) {
      // Check if user is already registered for this institution
      const existingInstitution = user.institutions.find(
        inst => inst.institutionId.toString() === institutionId
      );
      
      if (existingInstitution) {
        throw new Error('User is already registered for this institution');
      }

      // Add new institutional profile to existing user
      const newInstitutionProfile: IUserInstitution = {
        institutionId: new mongoose.Types.ObjectId(institutionId),
        role: userData.role,
        status: 'pending',
        profileData: userData.profileData || {},
        createdAt: new Date()
      };

      user.institutions.push(newInstitutionProfile);
      await user.save();
    } else {
      // Create new user with first institutional profile
      const institutionProfile: IUserInstitution = {
        institutionId: new mongoose.Types.ObjectId(institutionId),
        role: userData.role,
        status: 'pending',
        profileData: userData.profileData || {},
        createdAt: new Date()
      };

      user = new User({
        email: userData.email,
        password: userData.password,
        firstName: userData.firstName,
        lastName: userData.lastName,
        institutions: [institutionProfile]
      });

      await user.save();
    }

    return {
      userId: user._id.toString(),
      institutionId,
      role: userData.role,
      status: 'pending',
      createdAt: new Date()
    };
  }

  /**
   * Approve a user's registration for an institution
   */
  async approveUserRegistration(userId: string, institutionId: string, approvedBy?: string): Promise<IUser> {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const institutionProfile = user.institutions.find(
      inst => inst.institutionId.toString() === institutionId
    );

    if (!institutionProfile) {
      throw new Error('User is not registered for this institution');
    }

    if (institutionProfile.status !== 'pending') {
      throw new Error('User registration is not pending');
    }

    // Update the institutional profile status
    institutionProfile.status = 'active';
    institutionProfile.approvedAt = new Date();
    if (approvedBy) {
      institutionProfile.approvedBy = new mongoose.Types.ObjectId(approvedBy);
    }

    await user.save();
    return user;
  }

  /**
   * Link an existing user to a new institution
   */
  async linkUserToInstitution(
    userId: string, 
    institutionId: string, 
    role: 'student' | 'teacher' | 'institution_admin',
    profileData: Record<string, any> = {}
  ): Promise<void> {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const institution = await Institution.findById(institutionId);
    if (!institution) {
      throw new Error('Institution not found');
    }

    // Check if user is already linked to this institution
    const existingLink = user.institutions.find(
      inst => inst.institutionId.toString() === institutionId
    );

    if (existingLink) {
      throw new Error('User is already linked to this institution');
    }

    // Add new institutional profile
    const newProfile: IUserInstitution = {
      institutionId: new mongoose.Types.ObjectId(institutionId),
      role,
      status: 'pending',
      profileData,
      createdAt: new Date()
    };

    user.institutions.push(newProfile);
    await user.save();
  }

  /**
   * Get all institutions a user belongs to
   */
  async getUserInstitutions(userId: string): Promise<UserInstitution[]> {
    const user = await User.findById(userId).populate('institutions.institutionId');
    if (!user) {
      throw new Error('User not found');
    }

    return user.institutions.map(inst => ({
      institutionId: inst.institutionId.toString(),
      institutionName: (inst.institutionId as any).name || 'Unknown Institution',
      role: inst.role,
      status: inst.status,
      profileData: inst.profileData,
      createdAt: inst.createdAt,
      approvedAt: inst.approvedAt
    }));
  }

  /**
   * Get users by institution with optional role and status filtering
   */
  async getUsersByInstitution(
    institutionId: string,
    role?: 'student' | 'teacher' | 'institution_admin',
    status?: 'pending' | 'active' | 'inactive'
  ): Promise<IUser[]> {
    const query: any = {
      'institutions.institutionId': new mongoose.Types.ObjectId(institutionId)
    };

    if (role) {
      query['institutions.role'] = role;
    }

    if (status) {
      query['institutions.status'] = status;
    }

    return User.find(query);
  }

  /**
   * Get pending registrations for an institution
   */
  async getPendingRegistrations(institutionId: string): Promise<IUser[]> {
    return this.getUsersByInstitution(institutionId, undefined, 'pending');
  }

  /**
   * Update user's institutional profile data
   */
  async updateUserInstitutionalProfile(
    userId: string,
    institutionId: string,
    profileData: Record<string, any>
  ): Promise<void> {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const institutionProfile = user.institutions.find(
      inst => inst.institutionId.toString() === institutionId
    );

    if (!institutionProfile) {
      throw new Error('User is not registered for this institution');
    }

    institutionProfile.profileData = { ...institutionProfile.profileData, ...profileData };
    await user.save();
  }

  /**
   * Deactivate user's access to an institution
   */
  async deactivateUserInstitution(userId: string, institutionId: string): Promise<void> {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const institutionProfile = user.institutions.find(
      inst => inst.institutionId.toString() === institutionId
    );

    if (!institutionProfile) {
      throw new Error('User is not registered for this institution');
    }

    institutionProfile.status = 'inactive';
    await user.save();
  }

  /**
   * Get user by email
   */
  async getUserByEmail(email: string): Promise<IUser | null> {
    return User.findOne({ email });
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<IUser | null> {
    return User.findById(userId);
  }

  /**
   * Check if user has access to an institution with specific role
   */
  async hasInstitutionalAccess(
    userId: string,
    institutionId: string,
    requiredRole?: 'student' | 'teacher' | 'institution_admin'
  ): Promise<boolean> {
    const user = await User.findById(userId);
    if (!user) {
      return false;
    }

    const institutionProfile = user.institutions.find(
      inst => inst.institutionId.toString() === institutionId && inst.status === 'active'
    );

    if (!institutionProfile) {
      return false;
    }

    if (requiredRole && institutionProfile.role !== requiredRole) {
      return false;
    }

    return true;
  }

  /**
   * Promote user to institution administrator (Requirements 17.1, 18.1)
   */
  async promoteToInstitutionAdmin(
    userId: string,
    institutionId: string,
    promotedBy: string,
    adminLevel?: string,
    permissions?: string[]
  ): Promise<IUser> {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const institutionProfile = user.institutions.find(
      inst => inst.institutionId.toString() === institutionId
    );

    if (!institutionProfile) {
      throw new Error('User is not registered for this institution');
    }

    if (institutionProfile.status !== 'active') {
      throw new Error('User must have active status to be promoted to administrator');
    }

    const previousRole = institutionProfile.role;

    // Update role to institution_admin
    institutionProfile.role = 'institution_admin';
    
    // Update profile data with admin-specific information
    institutionProfile.profileData = {
      ...institutionProfile.profileData,
      adminLevel: adminLevel || 'institution',
      permissions: permissions || ['user_management', 'registration_approval', 'settings_management'],
      promotedAt: new Date(),
      promotedBy: mongoose.Types.ObjectId.isValid(promotedBy) ? new mongoose.Types.ObjectId(promotedBy) : promotedBy,
      previousRole: previousRole
    };

    // Mark the nested field as modified to ensure Mongoose saves it
    user.markModified('institutions');
    await user.save();

    // Log the promotion
    console.log(`🔐 ADMIN PROMOTION: ${user.firstName} ${user.lastName} (${user.email}) promoted to institution admin`);
    console.log(`   Institution: ${institutionId}`);
    console.log(`   Previous Role: ${previousRole}`);
    console.log(`   Promoted By: ${promotedBy}`);
    console.log(`   Admin Level: ${adminLevel || 'institution'}`);
    console.log(`   Timestamp: ${new Date().toISOString()}`);
    console.log('---');

    return user;
  }

  /**
   * Remove administrative privileges (Requirements 17.3, 18.4)
   */
  async removeAdminPrivileges(
    userId: string,
    institutionId: string,
    newRole: 'student' | 'teacher',
    removedBy: string,
    reason?: string
  ): Promise<IUser> {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const institutionProfile = user.institutions.find(
      inst => inst.institutionId.toString() === institutionId && inst.role === 'institution_admin'
    );

    if (!institutionProfile) {
      throw new Error('User is not an institution administrator');
    }

    const previousAdminData = { ...institutionProfile.profileData };

    // Update role and profile data
    institutionProfile.role = newRole;
    institutionProfile.profileData = {
      ...institutionProfile.profileData,
      adminPrivilegesRemovedAt: new Date(),
      adminPrivilegesRemovedBy: mongoose.Types.ObjectId.isValid(removedBy) ? new mongoose.Types.ObjectId(removedBy) : removedBy,
      adminPrivilegesRemovalReason: reason,
      previousAdminLevel: previousAdminData.adminLevel,
      previousPermissions: previousAdminData.permissions
    };

    // Remove admin-specific fields
    delete institutionProfile.profileData.adminLevel;
    delete institutionProfile.profileData.permissions;

    await user.save();

    // Log the privilege removal
    console.log(`🔓 ADMIN PRIVILEGE REMOVAL: ${user.firstName} ${user.lastName} (${user.email}) admin privileges removed`);
    console.log(`   Institution: ${institutionId}`);
    console.log(`   New Role: ${newRole}`);
    console.log(`   Removed By: ${removedBy}`);
    console.log(`   Reason: ${reason || 'Not specified'}`);
    console.log(`   Timestamp: ${new Date().toISOString()}`);
    console.log('---');

    return user;
  }

  /**
   * Get institution administrators with detailed information (Requirements 17.2, 18.2)
   */
  async getInstitutionAdministrators(institutionId: string): Promise<Array<{
    userId: string;
    email: string;
    firstName: string;
    lastName: string;
    adminLevel: string;
    permissions: string[];
    assignedAt: Date;
    promotedBy?: string;
    previousRole?: string;
    profileData: Record<string, any>;
  }>> {
    const admins = await User.find({
      'institutions.institutionId': new mongoose.Types.ObjectId(institutionId),
      'institutions.role': 'institution_admin',
      'institutions.status': 'active'
    });

    return admins.map(admin => {
      const adminProfile = admin.institutions.find(
        inst => inst.institutionId.toString() === institutionId && inst.role === 'institution_admin'
      );

      if (!adminProfile) {
        throw new Error('Admin profile not found');
      }

      return {
        userId: admin._id.toString(),
        email: admin.email,
        firstName: admin.firstName,
        lastName: admin.lastName,
        adminLevel: adminProfile.profileData.adminLevel || 'institution',
        permissions: adminProfile.profileData.permissions || [],
        assignedAt: adminProfile.createdAt,
        promotedBy: adminProfile.profileData.promotedBy ? 
          adminProfile.profileData.promotedBy.toString() : 
          undefined,
        previousRole: adminProfile.profileData.previousRole,
        profileData: adminProfile.profileData
      };
    });
  }

  /**
   * Update administrator permissions (Requirements 18.1, 18.4)
   */
  async updateAdminPermissions(
    userId: string,
    institutionId: string,
    permissions: string[],
    updatedBy: string
  ): Promise<IUser> {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const institutionProfile = user.institutions.find(
      inst => inst.institutionId.toString() === institutionId && inst.role === 'institution_admin'
    );

    if (!institutionProfile) {
      throw new Error('User is not an institution administrator');
    }

    const previousPermissions = institutionProfile.profileData.permissions || [];

    // Update permissions
    institutionProfile.profileData = {
      ...institutionProfile.profileData,
      permissions: permissions,
      permissionsUpdatedAt: new Date(),
      permissionsUpdatedBy: mongoose.Types.ObjectId.isValid(updatedBy) ? new mongoose.Types.ObjectId(updatedBy) : updatedBy,
      previousPermissions: previousPermissions
    };

    // Mark the nested field as modified to ensure Mongoose saves it
    user.markModified('institutions');
    await user.save();

    // Log the permission update
    console.log(`🔧 ADMIN PERMISSIONS UPDATED: ${user.firstName} ${user.lastName} (${user.email})`);
    console.log(`   Institution: ${institutionId}`);
    console.log(`   Previous Permissions: ${previousPermissions.join(', ')}`);
    console.log(`   New Permissions: ${permissions.join(', ')}`);
    console.log(`   Updated By: ${updatedBy}`);
    console.log(`   Timestamp: ${new Date().toISOString()}`);
    console.log('---');

    return user;
  }

  /**
   * Get administrative privilege history for an institution (Requirements 17.3, 18.4)
   */
  async getAdminPrivilegeHistory(institutionId: string): Promise<Array<{
    userId: string;
    email: string;
    firstName: string;
    lastName: string;
    action: 'promoted' | 'removed' | 'permissions_updated';
    timestamp: Date;
    performedBy?: string;
    details: Record<string, any>;
  }>> {
    const users = await User.find({
      'institutions.institutionId': new mongoose.Types.ObjectId(institutionId),
      $or: [
        { 'institutions.role': 'institution_admin' },
        { 'institutions.profileData.adminPrivilegesRemovedAt': { $exists: true } }
      ]
    });

    const history: Array<{
      userId: string;
      email: string;
      firstName: string;
      lastName: string;
      action: 'promoted' | 'removed' | 'permissions_updated';
      timestamp: Date;
      performedBy?: string;
      details: Record<string, any>;
    }> = [];

    for (const user of users) {
      const institutionProfile = user.institutions.find(
        inst => inst.institutionId.toString() === institutionId
      );

      if (!institutionProfile) continue;

      // Promotion events
      if (institutionProfile.profileData.promotedAt) {
        history.push({
          userId: user._id.toString(),
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          action: 'promoted',
          timestamp: institutionProfile.profileData.promotedAt,
          performedBy: institutionProfile.profileData.promotedBy?.toString(),
          details: {
            previousRole: institutionProfile.profileData.previousRole,
            adminLevel: institutionProfile.profileData.adminLevel,
            permissions: institutionProfile.profileData.permissions
          }
        });
      }

      // Removal events
      if (institutionProfile.profileData.adminPrivilegesRemovedAt) {
        history.push({
          userId: user._id.toString(),
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          action: 'removed',
          timestamp: institutionProfile.profileData.adminPrivilegesRemovedAt,
          performedBy: institutionProfile.profileData.adminPrivilegesRemovedBy?.toString(),
          details: {
            reason: institutionProfile.profileData.adminPrivilegesRemovalReason,
            newRole: institutionProfile.role,
            previousAdminLevel: institutionProfile.profileData.previousAdminLevel,
            previousPermissions: institutionProfile.profileData.previousPermissions
          }
        });
      }

      // Permission update events
      if (institutionProfile.profileData.permissionsUpdatedAt) {
        history.push({
          userId: user._id.toString(),
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          action: 'permissions_updated',
          timestamp: institutionProfile.profileData.permissionsUpdatedAt,
          performedBy: institutionProfile.profileData.permissionsUpdatedBy?.toString(),
          details: {
            previousPermissions: institutionProfile.profileData.previousPermissions,
            newPermissions: institutionProfile.profileData.permissions
          }
        });
      }
    }

    // Sort by timestamp (most recent first)
    history.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return history;
  }
}

export default new UserService();