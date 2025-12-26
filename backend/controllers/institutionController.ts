import { Request, Response } from 'express';
import { institutionService } from '../services/InstitutionService';
import { InstitutionRegistrationData } from '../services/InstitutionService';
import { brandingService, BrandingConfiguration } from '../services/BrandingService';
import { settingsService, InstitutionalSettings, AcademicCalendar, EnrollmentPolicies, NotificationSettings, SecuritySettings } from '../services/SettingsService';
import userService from '../services/UserService';
import User from '../models/User';
import mongoose from 'mongoose';

interface InstitutionRegistrationRequest extends Request {
  body: InstitutionRegistrationData & {
    adminEmail: string;
    adminPassword: string;
    adminFirstName: string;
    adminLastName: string;
  };
}

interface InstitutionListRequest extends Request {
  query: {
    status?: string;
    type?: string;
  };
}

interface InstitutionUpdateRequest extends Request {
  body: {
    settings?: {
      academicYear?: string;
      semesterSystem?: 'semester' | 'quarter' | 'trimester';
      enrollmentPolicies?: Record<string, any>;
    };
    branding?: {
      primaryColor?: string;
      logo?: string;
      theme?: string;
    };
  };
}

/**
 * Register a new institution (System Admin only)
 */
export const registerInstitution = async (req: InstitutionRegistrationRequest, res: Response): Promise<void> => {
  try {
    const {
      name,
      type,
      address,
      contactInfo,
      settings,
      branding,
      adminEmail,
      adminPassword,
      adminFirstName,
      adminLastName
    } = req.body;

    // Validate required fields
    if (!name || !type || !address || !contactInfo || !adminEmail || !adminPassword || !adminFirstName || !adminLastName) {
      res.status(400).json({ 
        error: 'All institution details and admin account information are required' 
      });
      return;
    }

    // Validate admin password
    if (adminPassword.length < 6) {
      res.status(400).json({ error: 'Admin password must be at least 6 characters' });
      return;
    }

    // Check if admin email already exists
    const existingUser = await User.findOne({ email: adminEmail.toLowerCase() });
    if (existingUser) {
      res.status(400).json({ 
        error: 'Admin email already exists. Use a different email or link existing user to institution.' 
      });
      return;
    }

    // Register the institution
    const institutionData: InstitutionRegistrationData = {
      name: name.trim(),
      type,
      address: {
        street: address.street.trim(),
        city: address.city.trim(),
        state: address.state.trim(),
        zipCode: address.zipCode.trim()
      },
      contactInfo: {
        email: contactInfo.email.toLowerCase().trim(),
        phone: contactInfo.phone.trim()
      },
      settings,
      branding
    };

    const institution = await institutionService.registerInstitution(institutionData);

    // Create the first institution administrator
    const adminUser = await User.create({
      email: adminEmail.toLowerCase().trim(),
      password: adminPassword,
      firstName: adminFirstName.trim(),
      lastName: adminLastName.trim(),
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
        approvedBy: institution._id // Self-approved for initial setup
      }]
    });

    // Get institution statistics
    const stats = await institutionService.getInstitutionStatistics(institution._id.toString());

    res.status(201).json({
      message: 'Institution registered successfully',
      institution: {
        id: institution._id,
        name: institution.name,
        type: institution.type,
        status: institution.status,
        contactInfo: institution.contactInfo,
        createdAt: institution.createdAt
      },
      administrator: {
        id: adminUser._id,
        email: adminUser.email,
        firstName: adminUser.firstName,
        lastName: adminUser.lastName,
        role: 'institution_admin'
      },
      statistics: stats,
      setupInstructions: {
        message: 'Institution setup complete. The administrator can now log in and begin configuring the institution.',
        nextSteps: [
          'Log in with the administrator credentials',
          'Complete institution branding and settings',
          'Set up academic calendar and enrollment policies',
          'Begin accepting user registrations'
        ]
      }
    });
  } catch (error) {
    console.error('Institution registration error:', error);
    
    if ((error as Error).message.includes('Institution name already exists')) {
      res.status(400).json({ error: 'Institution name already exists' });
      return;
    }
    
    if ((error as Error).message.includes('validation failed')) {
      res.status(400).json({ error: 'Invalid institution data provided' });
      return;
    }
    
    res.status(500).json({ error: 'Institution registration failed' });
  }
};

/**
 * Get list of all institutions (System Admin only)
 */
export const getInstitutions = async (req: InstitutionListRequest, res: Response): Promise<void> => {
  try {
    const { status, type } = req.query;
    
    const institutions = await institutionService.getInstitutionList({ status, type });
    
    // Get statistics for each institution
    const institutionsWithStats = await Promise.all(
      institutions.map(async (institution) => {
        const stats = await institutionService.getInstitutionStatistics(institution._id.toString());
        return {
          id: institution._id,
          name: institution.name,
          type: institution.type,
          status: institution.status,
          contactInfo: institution.contactInfo,
          createdAt: institution.createdAt,
          updatedAt: institution.updatedAt,
          statistics: stats
        };
      })
    );

    res.json({
      institutions: institutionsWithStats,
      total: institutionsWithStats.length
    });
  } catch (error) {
    console.error('Get institutions error:', error);
    res.status(500).json({ error: 'Failed to retrieve institutions' });
  }
};

/**
 * Get institution by ID
 */
export const getInstitutionById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: 'Invalid institution ID' });
      return;
    }

    const institution = await institutionService.getInstitutionById(id);
    
    if (!institution) {
      res.status(404).json({ error: 'Institution not found' });
      return;
    }

    const stats = await institutionService.getInstitutionStatistics(id);

    res.json({
      institution: {
        id: institution._id,
        name: institution.name,
        type: institution.type,
        address: institution.address,
        contactInfo: institution.contactInfo,
        settings: institution.settings,
        branding: institution.branding,
        status: institution.status,
        createdAt: institution.createdAt,
        updatedAt: institution.updatedAt
      },
      statistics: stats
    });
  } catch (error) {
    console.error('Get institution by ID error:', error);
    res.status(500).json({ error: 'Failed to retrieve institution' });
  }
};

/**
 * Update institution settings (Institution Admin only)
 */
export const updateInstitutionSettings = async (req: InstitutionUpdateRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { settings, branding } = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: 'Invalid institution ID' });
      return;
    }

    if (!settings && !branding) {
      res.status(400).json({ error: 'Settings or branding data required' });
      return;
    }

    const updateData = {
      ...(settings && { ...settings }),
      ...(branding && { branding })
    };

    const updatedInstitution = await institutionService.updateInstitutionSettings(id, updateData);

    res.json({
      message: 'Institution settings updated successfully',
      institution: {
        id: updatedInstitution._id,
        name: updatedInstitution.name,
        settings: updatedInstitution.settings,
        branding: updatedInstitution.branding,
        updatedAt: updatedInstitution.updatedAt
      }
    });
  } catch (error) {
    console.error('Update institution settings error:', error);
    
    if ((error as Error).message.includes('Institution not found')) {
      res.status(404).json({ error: 'Institution not found' });
      return;
    }
    
    res.status(500).json({ error: 'Failed to update institution settings' });
  }
};

/**
 * Update institution status (System Admin only)
 */
export const updateInstitutionStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: 'Invalid institution ID' });
      return;
    }

    if (!status || !['active', 'inactive', 'suspended'].includes(status)) {
      res.status(400).json({ error: 'Valid status (active, inactive, suspended) is required' });
      return;
    }

    const updatedInstitution = await institutionService.updateInstitutionStatus(id, status);

    res.json({
      message: `Institution status updated to ${status}`,
      institution: {
        id: updatedInstitution._id,
        name: updatedInstitution.name,
        status: updatedInstitution.status,
        updatedAt: updatedInstitution.updatedAt
      }
    });
  } catch (error) {
    console.error('Update institution status error:', error);
    
    if ((error as Error).message.includes('Institution not found')) {
      res.status(404).json({ error: 'Institution not found' });
      return;
    }
    
    res.status(500).json({ error: 'Failed to update institution status' });
  }
};

/**
 * Assign institution administrator (System Admin only)
 */
export const assignInstitutionAdmin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { userId } = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(userId)) {
      res.status(400).json({ error: 'Valid institution ID and user ID are required' });
      return;
    }

    // TODO: Add authentication middleware to verify system admin access
    const assignedBy = (req.body as any).assignedBy; // Temporary for testing

    await institutionService.assignInstitutionAdmin(id, userId);

    // Get user and institution details for logging
    const user = await User.findById(userId);
    const institution = await institutionService.getInstitutionById(id);
    const assigner = assignedBy ? await User.findById(assignedBy) : null;

    // Log the administrative privilege assignment
    console.log(`🔐 ADMIN PRIVILEGE ASSIGNED: ${user?.firstName} ${user?.lastName} (${user?.email}) granted institution admin privileges for ${institution?.name}`);
    console.log(`   Assigned by: ${assigner ? `${assigner.firstName} ${assigner.lastName} (${assigner.email})` : 'System Administrator'}`);
    console.log(`   Institution: ${institution?.name} (${institution?._id})`);
    console.log(`   Timestamp: ${new Date().toISOString()}`);
    console.log('---');

    res.json({
      message: 'Institution administrator assigned successfully',
      assignment: {
        userId: user?._id,
        userEmail: user?.email,
        userName: `${user?.firstName} ${user?.lastName}`,
        institutionId: institution?._id,
        institutionName: institution?.name,
        assignedAt: new Date(),
        assignedBy: assigner ? `${assigner.firstName} ${assigner.lastName}` : 'System Administrator'
      }
    });
  } catch (error) {
    console.error('Assign institution admin error:', error);
    
    if ((error as Error).message.includes('Institution not found')) {
      res.status(404).json({ error: 'Institution not found' });
      return;
    }
    
    if ((error as Error).message.includes('User not found')) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    
    res.status(500).json({ error: 'Failed to assign institution administrator' });
  }
};

/**
 * Get institutions available for user registration (Public endpoint)
 */
export const getAvailableInstitutions = async (req: Request, res: Response): Promise<void> => {
  try {
    const institutions = await institutionService.getInstitutionList({ status: 'active' });
    
    // Return only public information needed for registration
    const publicInstitutions = institutions.map(institution => ({
      id: institution._id,
      name: institution.name,
      type: institution.type,
      branding: {
        primaryColor: institution.branding.primaryColor,
        logo: institution.branding.logo,
        theme: institution.branding.theme
      }
    }));

    res.json({
      institutions: publicInstitutions,
      total: publicInstitutions.length
    });
  } catch (error) {
    console.error('Get available institutions error:', error);
    res.status(500).json({ error: 'Failed to retrieve available institutions' });
  }
};

/**
 * Delete institution (System Admin only - use with extreme caution)
 */
export const deleteInstitution = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: 'Invalid institution ID' });
      return;
    }

    await institutionService.deleteInstitution(id);

    res.json({
      message: 'Institution deleted successfully'
    });
  } catch (error) {
    console.error('Delete institution error:', error);
    
    if ((error as Error).message.includes('Institution not found')) {
      res.status(404).json({ error: 'Institution not found' });
      return;
    }
    
    if ((error as Error).message.includes('Cannot delete institution with existing users')) {
      res.status(400).json({ 
        error: 'Cannot delete institution with existing users. Deactivate the institution instead.' 
      });
      return;
    }
    
    res.status(500).json({ error: 'Failed to delete institution' });
  }
};
/**
 * Delegate administrative privileges (Institution Admin only)
 */
export const delegateAdminPrivileges = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { userId } = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(userId)) {
      res.status(400).json({ error: 'Valid institution ID and user ID are required' });
      return;
    }

    // TODO: Add authentication middleware to verify institution admin access
    const delegatedBy = (req.body as any).delegatedBy; // Temporary for testing

    // Verify the delegator is an institution admin for this institution
    if (delegatedBy) {
      const delegator = await User.findById(delegatedBy);
      if (!delegator) {
        res.status(404).json({ error: 'Delegator not found' });
        return;
      }

      const delegatorProfile = delegator.institutions.find(
        inst => inst.institutionId.toString() === id && inst.role === 'institution_admin' && inst.status === 'active'
      );

      if (!delegatorProfile) {
        res.status(403).json({ error: 'Only institution administrators can delegate privileges' });
        return;
      }
    }

    // Verify the target user exists and has access to this institution
    const targetUser = await User.findById(userId);
    if (!targetUser) {
      res.status(404).json({ error: 'Target user not found' });
      return;
    }

    const targetProfile = targetUser.institutions.find(
      inst => inst.institutionId.toString() === id && inst.status === 'active'
    );

    if (!targetProfile) {
      res.status(400).json({ error: 'Target user must have active access to the institution before being granted admin privileges' });
      return;
    }

    // Assign admin privileges
    await institutionService.assignInstitutionAdmin(id, userId);

    // Get institution details for logging
    const institution = await institutionService.getInstitutionById(id);
    const delegator = delegatedBy ? await User.findById(delegatedBy) : null;

    // Log the delegation
    console.log(`👥 ADMIN PRIVILEGE DELEGATED: ${targetUser.firstName} ${targetUser.lastName} (${targetUser.email}) granted institution admin privileges for ${institution?.name}`);
    console.log(`   Delegated by: ${delegator ? `${delegator.firstName} ${delegator.lastName} (${delegator.email})` : 'System Administrator'}`);
    console.log(`   Institution: ${institution?.name} (${institution?._id})`);
    console.log(`   Previous role: ${targetProfile.role}`);
    console.log(`   Timestamp: ${new Date().toISOString()}`);
    console.log('---');

    res.json({
      message: 'Administrative privileges delegated successfully',
      delegation: {
        userId: targetUser._id,
        userEmail: targetUser.email,
        userName: `${targetUser.firstName} ${targetUser.lastName}`,
        institutionId: institution?._id,
        institutionName: institution?.name,
        previousRole: targetProfile.role,
        newRole: 'institution_admin',
        delegatedAt: new Date(),
        delegatedBy: delegator ? `${delegator.firstName} ${delegator.lastName}` : 'System Administrator'
      }
    });
  } catch (error) {
    console.error('Delegate admin privileges error:', error);
    
    if ((error as Error).message.includes('Institution not found')) {
      res.status(404).json({ error: 'Institution not found' });
      return;
    }
    
    if ((error as Error).message.includes('User not found')) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    
    res.status(500).json({ error: 'Failed to delegate administrative privileges' });
  }
};

/**
 * Promote user to institution administrator (System Admin or Institution Admin)
 */
export const promoteToInstitutionAdmin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { userId, adminLevel, permissions } = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(userId)) {
      res.status(400).json({ error: 'Valid institution ID and user ID are required' });
      return;
    }

    // TODO: Add authentication middleware to verify admin access
    const promotedBy = (req.body as any).promotedBy; // Temporary for testing

    // Use UserService to promote the user
    const promotedUser = await userService.promoteToInstitutionAdmin(
      userId,
      id,
      promotedBy,
      adminLevel,
      permissions
    );

    // Get institution details for response
    const institution = await institutionService.getInstitutionById(id);
    const promoter = promotedBy ? await userService.getUserById(promotedBy) : null;

    res.json({
      message: 'User promoted to institution administrator successfully',
      promotion: {
        userId: promotedUser._id,
        userEmail: promotedUser.email,
        userName: `${promotedUser.firstName} ${promotedUser.lastName}`,
        institutionId: institution?._id,
        institutionName: institution?.name,
        adminLevel: adminLevel || 'institution',
        permissions: permissions || ['user_management', 'registration_approval', 'settings_management'],
        promotedAt: new Date(),
        promotedBy: promoter ? `${promoter.firstName} ${promoter.lastName}` : 'System Administrator'
      }
    });
  } catch (error) {
    console.error('Promote to institution admin error:', error);
    
    if ((error as Error).message.includes('not found')) {
      res.status(404).json({ error: (error as Error).message });
      return;
    }
    
    if ((error as Error).message.includes('not registered') || (error as Error).message.includes('active status')) {
      res.status(400).json({ error: (error as Error).message });
      return;
    }
    
    res.status(500).json({ error: 'Failed to promote user to institution administrator' });
  }
};

/**
 * Remove administrative privileges (System Admin or Institution Admin only)
 */
export const removeAdminPrivileges = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { userId, newRole, reason } = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(userId)) {
      res.status(400).json({ error: 'Valid institution ID and user ID are required' });
      return;
    }

    if (!newRole || !['student', 'teacher'].includes(newRole)) {
      res.status(400).json({ error: 'Valid new role (student or teacher) is required' });
      return;
    }

    // TODO: Add authentication middleware to verify admin access
    const removedBy = (req.body as any).removedBy; // Temporary for testing

    // Use UserService to remove admin privileges
    const updatedUser = await userService.removeAdminPrivileges(
      userId,
      id,
      newRole,
      removedBy,
      reason
    );

    // Get institution details for response
    const institution = await institutionService.getInstitutionById(id);
    const remover = removedBy ? await userService.getUserById(removedBy) : null;

    res.json({
      message: 'Administrative privileges removed successfully',
      removal: {
        userId: updatedUser._id,
        userEmail: updatedUser.email,
        userName: `${updatedUser.firstName} ${updatedUser.lastName}`,
        institutionId: institution?._id,
        institutionName: institution?.name,
        previousRole: 'institution_admin',
        newRole: newRole,
        reason: reason || 'Not specified',
        removedAt: new Date(),
        removedBy: remover ? `${remover.firstName} ${remover.lastName}` : 'System Administrator'
      }
    });
  } catch (error) {
    console.error('Remove admin privileges error:', error);
    
    if ((error as Error).message.includes('not found')) {
      res.status(404).json({ error: (error as Error).message });
      return;
    }
    
    if ((error as Error).message.includes('not an institution administrator')) {
      res.status(400).json({ error: (error as Error).message });
      return;
    }
    
    res.status(500).json({ error: 'Failed to remove administrative privileges' });
  }
};

/**
 * Update administrator permissions (Institution Admin only)
 */
export const updateAdminPermissions = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { userId, permissions } = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(userId)) {
      res.status(400).json({ error: 'Valid institution ID and user ID are required' });
      return;
    }

    if (!permissions || !Array.isArray(permissions)) {
      res.status(400).json({ error: 'Valid permissions array is required' });
      return;
    }

    // TODO: Add authentication middleware to verify admin access
    const updatedBy = (req.body as any).updatedBy; // Temporary for testing

    // Use UserService to update permissions
    const updatedUser = await userService.updateAdminPermissions(
      userId,
      id,
      permissions,
      updatedBy
    );

    // Get institution details for response
    const institution = await institutionService.getInstitutionById(id);
    const updater = updatedBy ? await userService.getUserById(updatedBy) : null;

    res.json({
      message: 'Administrator permissions updated successfully',
      update: {
        userId: updatedUser._id,
        userEmail: updatedUser.email,
        userName: `${updatedUser.firstName} ${updatedUser.lastName}`,
        institutionId: institution?._id,
        institutionName: institution?.name,
        newPermissions: permissions,
        updatedAt: new Date(),
        updatedBy: updater ? `${updater.firstName} ${updater.lastName}` : 'System Administrator'
      }
    });
  } catch (error) {
    console.error('Update admin permissions error:', error);
    
    if ((error as Error).message.includes('not found')) {
      res.status(404).json({ error: (error as Error).message });
      return;
    }
    
    if ((error as Error).message.includes('not an institution administrator')) {
      res.status(400).json({ error: (error as Error).message });
      return;
    }
    
    res.status(500).json({ error: 'Failed to update administrator permissions' });
  }
};

/**
 * Get institution administrators (Institution Admin or System Admin only)
 */
export const getInstitutionAdmins = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: 'Valid institution ID is required' });
      return;
    }

    // TODO: Add authentication middleware to verify admin access

    // Get institution details
    const institution = await institutionService.getInstitutionById(id);
    if (!institution) {
      res.status(404).json({ error: 'Institution not found' });
      return;
    }

    // Use UserService to get administrators
    const administrators = await userService.getInstitutionAdministrators(id);

    res.json({
      institution: {
        id: institution._id,
        name: institution.name,
        type: institution.type
      },
      administrators,
      count: administrators.length,
      summary: {
        total: administrators.length,
        byAdminLevel: administrators.reduce((acc, admin) => {
          acc[admin.adminLevel] = (acc[admin.adminLevel] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
      }
    });
  } catch (error) {
    console.error('Get institution admins error:', error);
    res.status(500).json({ error: 'Failed to retrieve institution administrators' });
  }
};

/**
 * Get administrative privilege history for an institution (System Admin only)
 */
export const getAdminPrivilegeHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: 'Valid institution ID is required' });
      return;
    }

    // TODO: Add authentication middleware to verify system admin access

    // Get institution details
    const institution = await institutionService.getInstitutionById(id);
    if (!institution) {
      res.status(404).json({ error: 'Institution not found' });
      return;
    }

    // Use UserService to get privilege history
    const privilegeHistory = await userService.getAdminPrivilegeHistory(id);

    res.json({
      institution: {
        id: institution._id,
        name: institution.name,
        type: institution.type
      },
      privilegeHistory,
      summary: {
        total: privilegeHistory.length,
        byAction: privilegeHistory.reduce((acc, event) => {
          acc[event.action] = (acc[event.action] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        recentActivity: privilegeHistory.slice(0, 10) // Last 10 events
      }
    });
  } catch (error) {
    console.error('Get admin privilege history error:', error);
    res.status(500).json({ error: 'Failed to retrieve administrative privilege history' });
  }
};

/**
 * Get institution branding configuration (Institution Admin only)
 */
export const getBrandingConfiguration = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: 'Invalid institution ID' });
      return;
    }

    // TODO: Add authentication middleware to verify institution admin access

    const branding = await brandingService.getBrandingConfiguration(id);
    
    if (!branding) {
      res.status(404).json({ error: 'Institution not found' });
      return;
    }

    res.json({
      institutionId: id,
      branding
    });
  } catch (error) {
    console.error('Get branding configuration error:', error);
    res.status(500).json({ error: 'Failed to retrieve branding configuration' });
  }
};

/**
 * Update institution branding configuration (Institution Admin only)
 */
export const updateBrandingConfiguration = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const brandingConfig: Partial<BrandingConfiguration> = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: 'Invalid institution ID' });
      return;
    }

    if (!brandingConfig || Object.keys(brandingConfig).length === 0) {
      res.status(400).json({ error: 'Branding configuration data is required' });
      return;
    }

    // TODO: Add authentication middleware to verify institution admin access

    const updatedBranding = await brandingService.updateBrandingConfiguration(id, brandingConfig);

    res.json({
      message: 'Branding configuration updated successfully',
      institutionId: id,
      branding: updatedBranding
    });
  } catch (error) {
    console.error('Update branding configuration error:', error);
    
    if ((error as Error).message.includes('Institution not found')) {
      res.status(404).json({ error: 'Institution not found' });
      return;
    }
    
    if ((error as Error).message.includes('must be a valid')) {
      res.status(400).json({ error: (error as Error).message });
      return;
    }
    
    res.status(500).json({ error: 'Failed to update branding configuration' });
  }
};

/**
 * Reset branding to default values (Institution Admin only)
 */
export const resetBrandingToDefault = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: 'Invalid institution ID' });
      return;
    }

    // TODO: Add authentication middleware to verify institution admin access

    const defaultBranding = await brandingService.resetBrandingToDefault(id);

    res.json({
      message: 'Branding reset to default values successfully',
      institutionId: id,
      branding: defaultBranding
    });
  } catch (error) {
    console.error('Reset branding error:', error);
    
    if ((error as Error).message.includes('Institution not found')) {
      res.status(404).json({ error: 'Institution not found' });
      return;
    }
    
    res.status(500).json({ error: 'Failed to reset branding configuration' });
  }
};

/**
 * Generate branding CSS for institution (Public endpoint)
 */
export const getBrandingCSS = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: 'Invalid institution ID' });
      return;
    }

    const css = await brandingService.generateBrandingCSS(id);

    res.setHeader('Content-Type', 'text/css');
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    res.send(css);
  } catch (error) {
    console.error('Get branding CSS error:', error);
    res.status(500).json({ error: 'Failed to generate branding CSS' });
  }
};

/**
 * Get email branding for institution (Internal use)
 */
export const getEmailBranding = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: 'Invalid institution ID' });
      return;
    }

    // TODO: Add authentication middleware to verify internal service access

    const emailBranding = await brandingService.getEmailBranding(id);

    res.json({
      institutionId: id,
      emailBranding
    });
  } catch (error) {
    console.error('Get email branding error:', error);
    res.status(500).json({ error: 'Failed to retrieve email branding' });
  }
};

/**
 * Preview branding configuration (Institution Admin only)
 */
export const previewBrandingConfiguration = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const previewConfig: Partial<BrandingConfiguration> = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: 'Invalid institution ID' });
      return;
    }

    // TODO: Add authentication middleware to verify institution admin access

    // Get current branding
    const currentBranding = await brandingService.getBrandingConfiguration(id);
    
    if (!currentBranding) {
      res.status(404).json({ error: 'Institution not found' });
      return;
    }

    // Merge current branding with preview changes
    const previewBranding = {
      ...currentBranding,
      ...previewConfig
    };

    // Generate preview CSS (without saving to database)
    const previewCSS = await this.generatePreviewCSS(previewBranding);

    res.json({
      institutionId: id,
      previewBranding,
      previewCSS,
      message: 'Preview generated successfully. Changes are not saved.'
    });
  } catch (error) {
    console.error('Preview branding configuration error:', error);
    res.status(500).json({ error: 'Failed to generate branding preview' });
  }
};

/**
 * Helper function to generate preview CSS
 */
const generatePreviewCSS = (branding: BrandingConfiguration): string => {
  let css = `:root {
  --institution-primary-color: ${branding.primaryColor};
  --institution-secondary-color: ${branding.secondaryColor || '#6c757d'};
  --institution-font-family: ${branding.fontFamily || 'system-ui, -apple-system, sans-serif'};
}

.institution-branding {
  --primary: var(--institution-primary-color);
  --secondary: var(--institution-secondary-color);
  font-family: var(--institution-font-family);
}

.institution-logo {
  background-image: url('${branding.logo}');
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
}

.institution-theme-${branding.theme} {
  /* Theme-specific styles */
}`;

  // Add navigation style-specific CSS
  if (branding.navigationStyle === 'minimal') {
    css += `
.navbar-minimal {
  border: none;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}`;
  } else if (branding.navigationStyle === 'sidebar') {
    css += `
.sidebar-navigation {
  background-color: var(--institution-primary-color);
  color: white;
}`;
  }

  // Add custom CSS if provided
  if (branding.customCSS) {
    css += `\n\n/* Custom Institution CSS */\n${branding.customCSS}`;
  }

  return css;
};
/**
 * Get institutional settings (Institution Admin only)
 */
export const getInstitutionalSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: 'Invalid institution ID' });
      return;
    }

    // TODO: Add authentication middleware to verify institution admin access

    const settings = await settingsService.getInstitutionalSettings(id);
    
    if (!settings) {
      res.status(404).json({ error: 'Institution not found' });
      return;
    }

    res.json({
      institutionId: id,
      settings
    });
  } catch (error) {
    console.error('Get institutional settings error:', error);
    res.status(500).json({ error: 'Failed to retrieve institutional settings' });
  }
};

/**
 * Update academic calendar (Institution Admin only)
 */
export const updateAcademicCalendar = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const calendarData: Partial<AcademicCalendar> = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: 'Invalid institution ID' });
      return;
    }

    if (!calendarData || Object.keys(calendarData).length === 0) {
      res.status(400).json({ error: 'Academic calendar data is required' });
      return;
    }

    // TODO: Add authentication middleware to verify institution admin access

    const updatedCalendar = await settingsService.updateAcademicCalendar(id, calendarData);

    res.json({
      message: 'Academic calendar updated successfully',
      institutionId: id,
      academicCalendar: updatedCalendar
    });
  } catch (error) {
    console.error('Update academic calendar error:', error);
    
    if ((error as Error).message.includes('Institution not found')) {
      res.status(404).json({ error: 'Institution not found' });
      return;
    }
    
    if ((error as Error).message.includes('must be') || (error as Error).message.includes('cannot')) {
      res.status(400).json({ error: (error as Error).message });
      return;
    }
    
    res.status(500).json({ error: 'Failed to update academic calendar' });
  }
};

/**
 * Update enrollment policies (Institution Admin only)
 */
export const updateEnrollmentPolicies = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const policiesData: Partial<EnrollmentPolicies> = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: 'Invalid institution ID' });
      return;
    }

    if (!policiesData || Object.keys(policiesData).length === 0) {
      res.status(400).json({ error: 'Enrollment policies data is required' });
      return;
    }

    // TODO: Add authentication middleware to verify institution admin access

    const updatedPolicies = await settingsService.updateEnrollmentPolicies(id, policiesData);

    res.json({
      message: 'Enrollment policies updated successfully',
      institutionId: id,
      enrollmentPolicies: updatedPolicies
    });
  } catch (error) {
    console.error('Update enrollment policies error:', error);
    
    if ((error as Error).message.includes('Institution not found')) {
      res.status(404).json({ error: 'Institution not found' });
      return;
    }
    
    if ((error as Error).message.includes('must be') || (error as Error).message.includes('cannot')) {
      res.status(400).json({ error: (error as Error).message });
      return;
    }
    
    res.status(500).json({ error: 'Failed to update enrollment policies' });
  }
};

/**
 * Update notification settings (Institution Admin only)
 */
export const updateNotificationSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const notificationData: Partial<NotificationSettings> = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: 'Invalid institution ID' });
      return;
    }

    if (!notificationData || Object.keys(notificationData).length === 0) {
      res.status(400).json({ error: 'Notification settings data is required' });
      return;
    }

    // TODO: Add authentication middleware to verify institution admin access

    const updatedSettings = await settingsService.updateNotificationSettings(id, notificationData);

    res.json({
      message: 'Notification settings updated successfully',
      institutionId: id,
      notificationSettings: updatedSettings
    });
  } catch (error) {
    console.error('Update notification settings error:', error);
    
    if ((error as Error).message.includes('Institution not found')) {
      res.status(404).json({ error: 'Institution not found' });
      return;
    }
    
    res.status(500).json({ error: 'Failed to update notification settings' });
  }
};

/**
 * Update security settings (Institution Admin only)
 */
export const updateSecuritySettings = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const securityData: Partial<SecuritySettings> = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: 'Invalid institution ID' });
      return;
    }

    if (!securityData || Object.keys(securityData).length === 0) {
      res.status(400).json({ error: 'Security settings data is required' });
      return;
    }

    // TODO: Add authentication middleware to verify institution admin access

    const updatedSettings = await settingsService.updateSecuritySettings(id, securityData);

    res.json({
      message: 'Security settings updated successfully',
      institutionId: id,
      securitySettings: updatedSettings
    });
  } catch (error) {
    console.error('Update security settings error:', error);
    
    if ((error as Error).message.includes('Institution not found')) {
      res.status(404).json({ error: 'Institution not found' });
      return;
    }
    
    if ((error as Error).message.includes('must be') || (error as Error).message.includes('cannot')) {
      res.status(400).json({ error: (error as Error).message });
      return;
    }
    
    res.status(500).json({ error: 'Failed to update security settings' });
  }
};

/**
 * Update custom settings (Institution Admin only)
 */
export const updateCustomSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const customData: Record<string, any> = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: 'Invalid institution ID' });
      return;
    }

    if (!customData || Object.keys(customData).length === 0) {
      res.status(400).json({ error: 'Custom settings data is required' });
      return;
    }

    // TODO: Add authentication middleware to verify institution admin access

    const updatedSettings = await settingsService.updateCustomSettings(id, customData);

    res.json({
      message: 'Custom settings updated successfully',
      institutionId: id,
      customSettings: updatedSettings
    });
  } catch (error) {
    console.error('Update custom settings error:', error);
    
    if ((error as Error).message.includes('Institution not found')) {
      res.status(404).json({ error: 'Institution not found' });
      return;
    }
    
    res.status(500).json({ error: 'Failed to update custom settings' });
  }
};

/**
 * Reset all settings to default (Institution Admin only)
 */
export const resetSettingsToDefault = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: 'Invalid institution ID' });
      return;
    }

    // TODO: Add authentication middleware to verify institution admin access

    const defaultSettings = await settingsService.resetSettingsToDefault(id);

    res.json({
      message: 'Settings reset to default values successfully',
      institutionId: id,
      settings: defaultSettings
    });
  } catch (error) {
    console.error('Reset settings error:', error);
    
    if ((error as Error).message.includes('Institution not found')) {
      res.status(404).json({ error: 'Institution not found' });
      return;
    }
    
    res.status(500).json({ error: 'Failed to reset settings' });
  }
};

/**
 * Get academic calendar for institution (Public endpoint for students/teachers)
 */
export const getAcademicCalendar = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: 'Invalid institution ID' });
      return;
    }

    const settings = await settingsService.getInstitutionalSettings(id);
    
    if (!settings || !settings.academicCalendar) {
      res.status(404).json({ error: 'Academic calendar not found' });
      return;
    }

    res.json({
      institutionId: id,
      academicCalendar: settings.academicCalendar
    });
  } catch (error) {
    console.error('Get academic calendar error:', error);
    res.status(500).json({ error: 'Failed to retrieve academic calendar' });
  }
};

/**
 * Get enrollment policies for institution (Public endpoint for students)
 */
export const getEnrollmentPolicies = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: 'Invalid institution ID' });
      return;
    }

    const settings = await settingsService.getInstitutionalSettings(id);
    
    if (!settings || !settings.enrollmentPolicies) {
      res.status(404).json({ error: 'Enrollment policies not found' });
      return;
    }

    // Return only public-facing policies (hide internal settings)
    const publicPolicies = {
      maxCoursesPerSemester: settings.enrollmentPolicies.maxCoursesPerSemester,
      minCreditsPerSemester: settings.enrollmentPolicies.minCreditsPerSemester,
      maxCreditsPerSemester: settings.enrollmentPolicies.maxCreditsPerSemester,
      allowLateRegistration: settings.enrollmentPolicies.allowLateRegistration,
      lateRegistrationFee: settings.enrollmentPolicies.lateRegistrationFee,
      dropWithoutPenaltyDays: settings.enrollmentPolicies.dropWithoutPenaltyDays,
      withdrawalDeadlineDays: settings.enrollmentPolicies.withdrawalDeadlineDays
    };

    res.json({
      institutionId: id,
      enrollmentPolicies: publicPolicies
    });
  } catch (error) {
    console.error('Get enrollment policies error:', error);
    res.status(500).json({ error: 'Failed to retrieve enrollment policies' });
  }
};