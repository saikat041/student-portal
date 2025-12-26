import mongoose from 'mongoose';
import { IUser, IUserInstitution } from '../models/User';
import { AccessValidator } from './AccessValidator';

export interface Permission {
  resource: string;
  actions: string[];
  conditions?: Record<string, any>;
}

export interface RoleDefinition {
  name: string;
  displayName: string;
  description: string;
  permissions: Permission[];
  hierarchyLevel: number; // Higher number = more privileges
}

export interface RoleAssignmentResult {
  success: boolean;
  message: string;
  previousRole?: string;
  newRole: string;
  assignedBy: string;
  timestamp: Date;
}

export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
  requiredRole?: string;
  userRole: string;
  institutionId: string;
}

/**
 * Role Management System
 * Requirements 13.4, 13.5, 17.2, 18.1
 * 
 * Manages role definitions, assignments, and permission validation
 * within institutional boundaries
 */
export class RoleManager {
  private static instance: RoleManager;
  private accessValidator: AccessValidator;

  // Role definitions with hierarchical permissions
  private roleDefinitions: Record<string, RoleDefinition> = {
    student: {
      name: 'student',
      displayName: 'Student',
      description: 'Can enroll in courses and view their academic progress',
      hierarchyLevel: 1,
      permissions: [
        {
          resource: 'course',
          actions: ['read', 'search', 'enroll']
        },
        {
          resource: 'enrollment',
          actions: ['read', 'create', 'delete'],
          conditions: { ownOnly: true }
        },
        {
          resource: 'user',
          actions: ['read', 'update'],
          conditions: { ownProfileOnly: true }
        },
        {
          resource: 'grade',
          actions: ['read'],
          conditions: { ownOnly: true }
        }
      ]
    },
    teacher: {
      name: 'teacher',
      displayName: 'Teacher',
      description: 'Can create and manage courses, view enrolled students',
      hierarchyLevel: 2,
      permissions: [
        {
          resource: 'course',
          actions: ['read', 'create', 'update', 'delete', 'search'],
          conditions: { ownCoursesOnly: true }
        },
        {
          resource: 'enrollment',
          actions: ['read', 'approve', 'reject'],
          conditions: { ownCoursesOnly: true }
        },
        {
          resource: 'user',
          actions: ['read'],
          conditions: { studentsInOwnCoursesOnly: true }
        },
        {
          resource: 'grade',
          actions: ['read', 'create', 'update'],
          conditions: { ownCoursesOnly: true }
        },
        {
          resource: 'student_progress',
          actions: ['read'],
          conditions: { ownCoursesOnly: true }
        }
      ]
    },
    institution_admin: {
      name: 'institution_admin',
      displayName: 'Institution Administrator',
      description: 'Can manage all aspects of their institution',
      hierarchyLevel: 3,
      permissions: [
        {
          resource: 'course',
          actions: ['read', 'create', 'update', 'delete', 'search', 'manage']
        },
        {
          resource: 'enrollment',
          actions: ['read', 'create', 'update', 'delete', 'approve', 'reject', 'manage']
        },
        {
          resource: 'user',
          actions: ['read', 'create', 'update', 'approve', 'suspend', 'manage', 'promote']
        },
        {
          resource: 'grade',
          actions: ['read', 'create', 'update', 'delete', 'manage']
        },
        {
          resource: 'institution_settings',
          actions: ['read', 'update', 'manage']
        },
        {
          resource: 'reports',
          actions: ['read', 'generate', 'export']
        },
        {
          resource: 'audit_logs',
          actions: ['read', 'export']
        },
        {
          resource: 'branding',
          actions: ['read', 'update', 'manage']
        }
      ]
    }
  };

  private constructor() {
    this.accessValidator = AccessValidator.getInstance();
  }

  public static getInstance(): RoleManager {
    if (!RoleManager.instance) {
      RoleManager.instance = new RoleManager();
    }
    return RoleManager.instance;
  }

  /**
   * Get role definition by name
   */
  getRoleDefinition(roleName: string): RoleDefinition | null {
    return this.roleDefinitions[roleName] || null;
  }

  /**
   * Get all available roles
   */
  getAllRoles(): RoleDefinition[] {
    return Object.values(this.roleDefinitions);
  }

  /**
   * Check if a role has permission for a specific action on a resource
   * Requirements 13.4, 13.5
   */
  hasPermission(
    roleName: string,
    resource: string,
    action: string,
    context?: Record<string, any>
  ): PermissionCheckResult {
    const role = this.roleDefinitions[roleName];
    
    if (!role) {
      return {
        allowed: false,
        reason: `Unknown role: ${roleName}`,
        userRole: roleName,
        institutionId: context?.institutionId || 'unknown'
      };
    }

    // Find permission for the resource
    const permission = role.permissions.find(p => p.resource === resource);
    
    if (!permission) {
      return {
        allowed: false,
        reason: `Role ${roleName} has no permissions for resource ${resource}`,
        userRole: roleName,
        institutionId: context?.institutionId || 'unknown'
      };
    }

    // Check if action is allowed
    if (!permission.actions.includes(action)) {
      return {
        allowed: false,
        reason: `Role ${roleName} cannot perform action ${action} on resource ${resource}`,
        userRole: roleName,
        institutionId: context?.institutionId || 'unknown'
      };
    }

    // Check conditions if they exist
    if (permission.conditions && context) {
      const conditionCheck = this.validateConditions(permission.conditions, context);
      if (!conditionCheck.allowed) {
        return {
          allowed: false,
          reason: conditionCheck.reason,
          userRole: roleName,
          institutionId: context?.institutionId || 'unknown'
        };
      }
    }

    return {
      allowed: true,
      userRole: roleName,
      institutionId: context?.institutionId || 'unknown'
    };
  }

  /**
   * Validate permission conditions
   */
  private validateConditions(
    conditions: Record<string, any>,
    context: Record<string, any>
  ): { allowed: boolean; reason?: string } {
    // Own resource only conditions
    if (conditions.ownOnly && context.resourceOwnerId !== context.userId) {
      return {
        allowed: false,
        reason: 'Can only access own resources'
      };
    }

    if (conditions.ownProfileOnly && context.profileUserId !== context.userId) {
      return {
        allowed: false,
        reason: 'Can only access own profile'
      };
    }

    if (conditions.ownCoursesOnly && context.courseTeacherId !== context.userId) {
      return {
        allowed: false,
        reason: 'Can only access own courses'
      };
    }

    if (conditions.studentsInOwnCoursesOnly) {
      // This would require additional validation logic
      // For now, we'll assume it's handled at the service layer
    }

    return { allowed: true };
  }

  /**
   * Check if user can be promoted to a higher role
   * Requirements 17.2, 18.1
   */
  canPromoteToRole(
    currentRole: string,
    targetRole: string,
    promoterRole: string
  ): { allowed: boolean; reason?: string } {
    const current = this.roleDefinitions[currentRole];
    const target = this.roleDefinitions[targetRole];
    const promoter = this.roleDefinitions[promoterRole];

    if (!current || !target || !promoter) {
      return {
        allowed: false,
        reason: 'Invalid role specified'
      };
    }

    // Can't promote to same role
    if (currentRole === targetRole) {
      return {
        allowed: false,
        reason: 'User already has the target role'
      };
    }

    // Promoter must have higher hierarchy level than target role
    if (promoter.hierarchyLevel <= target.hierarchyLevel) {
      return {
        allowed: false,
        reason: `Role ${promoterRole} cannot promote users to ${targetRole}`
      };
    }

    // Institution admins can promote anyone to any role below them
    if (promoterRole === 'institution_admin') {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: `Role ${promoterRole} does not have promotion privileges`
    };
  }

  /**
   * Assign role to user within institution
   * Requirements 13.4, 17.2, 18.1
   */
  async assignRole(
    userId: string,
    institutionId: string,
    newRole: string,
    assignedBy: string,
    reason?: string
  ): Promise<RoleAssignmentResult> {
    try {
      const User = mongoose.model('User');
      const user = await User.findById(userId);

      if (!user) {
        return {
          success: false,
          message: 'User not found',
          newRole,
          assignedBy,
          timestamp: new Date()
        };
      }

      // Find user's institutional profile
      const institutionProfile = user.institutions.find(
        (inst: IUserInstitution) => inst.institutionId.toString() === institutionId
      );

      if (!institutionProfile) {
        return {
          success: false,
          message: 'User is not registered for this institution',
          newRole,
          assignedBy,
          timestamp: new Date()
        };
      }

      // Get assigner's role to validate promotion authority
      const assigner = await User.findById(assignedBy);
      if (!assigner) {
        return {
          success: false,
          message: 'Assigner not found',
          newRole,
          assignedBy,
          timestamp: new Date()
        };
      }

      const assignerProfile = assigner.institutions.find(
        (inst: IUserInstitution) => inst.institutionId.toString() === institutionId
      );

      if (!assignerProfile) {
        return {
          success: false,
          message: 'Assigner does not have access to this institution',
          newRole,
          assignedBy,
          timestamp: new Date()
        };
      }

      // Validate promotion authority
      const promotionCheck = this.canPromoteToRole(
        institutionProfile.role,
        newRole,
        assignerProfile.role
      );

      if (!promotionCheck.allowed) {
        return {
          success: false,
          message: promotionCheck.reason || 'Promotion not allowed',
          newRole,
          assignedBy,
          timestamp: new Date()
        };
      }

      const previousRole = institutionProfile.role;

      // Update role
      institutionProfile.role = newRole as 'student' | 'teacher' | 'institution_admin';
      
      // Update profile data with role assignment history
      institutionProfile.profileData = {
        ...institutionProfile.profileData,
        roleHistory: [
          ...(institutionProfile.profileData.roleHistory || []),
          {
            previousRole,
            newRole,
            assignedBy,
            assignedAt: new Date(),
            reason
          }
        ],
        lastRoleChange: {
          from: previousRole,
          to: newRole,
          by: assignedBy,
          at: new Date(),
          reason
        }
      };

      // Mark the nested field as modified to ensure Mongoose saves it
      user.markModified('institutions');
      await user.save();

      // Log the role assignment
      await this.accessValidator.logSecurityEvent({
        userId,
        institutionId,
        action: 'role_assignment',
        resource: 'user_role',
        resourceId: userId,
        allowed: true,
        reason: `Role changed from ${previousRole} to ${newRole}`,
        timestamp: new Date()
      });

      console.log(`🔄 ROLE ASSIGNMENT: ${user.firstName} ${user.lastName} (${user.email})`);
      console.log(`   Institution: ${institutionId}`);
      console.log(`   Previous Role: ${previousRole}`);
      console.log(`   New Role: ${newRole}`);
      console.log(`   Assigned By: ${assignedBy}`);
      console.log(`   Reason: ${reason || 'Not specified'}`);
      console.log(`   Timestamp: ${new Date().toISOString()}`);
      console.log('---');

      return {
        success: true,
        message: `Role successfully changed from ${previousRole} to ${newRole}`,
        previousRole,
        newRole,
        assignedBy,
        timestamp: new Date()
      };

    } catch (error) {
      console.error('Error assigning role:', error);
      return {
        success: false,
        message: `Failed to assign role: ${(error as Error).message}`,
        newRole,
        assignedBy,
        timestamp: new Date()
      };
    }
  }

  /**
   * Get user's effective permissions within an institution
   */
  getUserPermissions(
    userInstitution: IUserInstitution
  ): Permission[] {
    const role = this.roleDefinitions[userInstitution.role];
    return role ? role.permissions : [];
  }

  /**
   * Get role assignment history for a user in an institution
   */
  async getRoleHistory(
    userId: string,
    institutionId: string
  ): Promise<Array<{
    previousRole: string;
    newRole: string;
    assignedBy: string;
    assignedAt: Date;
    reason?: string;
  }>> {
    try {
      const User = mongoose.model('User');
      const user = await User.findById(userId);

      if (!user) {
        return [];
      }

      const institutionProfile = user.institutions.find(
        (inst: IUserInstitution) => inst.institutionId.toString() === institutionId
      );

      if (!institutionProfile || !institutionProfile.profileData.roleHistory) {
        return [];
      }

      return institutionProfile.profileData.roleHistory;
    } catch (error) {
      console.error('Error getting role history:', error);
      return [];
    }
  }

  /**
   * Get all role assignments for an institution (admin only)
   */
  async getInstitutionRoleAssignments(
    institutionId: string
  ): Promise<Array<{
    userId: string;
    email: string;
    firstName: string;
    lastName: string;
    currentRole: string;
    status: string;
    lastRoleChange?: {
      from: string;
      to: string;
      by: string;
      at: Date;
      reason?: string;
    };
  }>> {
    try {
      const User = mongoose.model('User');
      const users = await User.find({
        'institutions.institutionId': new mongoose.Types.ObjectId(institutionId)
      });

      return users.map(user => {
        const institutionProfile = user.institutions.find(
          (inst: IUserInstitution) => inst.institutionId.toString() === institutionId
        );

        if (!institutionProfile) {
          throw new Error('Institution profile not found');
        }

        return {
          userId: user._id.toString(),
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          currentRole: institutionProfile.role,
          status: institutionProfile.status,
          lastRoleChange: institutionProfile.profileData.lastRoleChange
        };
      });
    } catch (error) {
      console.error('Error getting institution role assignments:', error);
      return [];
    }
  }

  /**
   * Validate bulk role assignments
   */
  async validateBulkRoleAssignments(
    assignments: Array<{
      userId: string;
      newRole: string;
    }>,
    institutionId: string,
    assignedBy: string
  ): Promise<Array<{
    userId: string;
    valid: boolean;
    reason?: string;
  }>> {
    const results = [];

    for (const assignment of assignments) {
      try {
        const User = mongoose.model('User');
        const user = await User.findById(assignment.userId);
        
        if (!user) {
          results.push({
            userId: assignment.userId,
            valid: false,
            reason: 'User not found'
          });
          continue;
        }

        const institutionProfile = user.institutions.find(
          (inst: IUserInstitution) => inst.institutionId.toString() === institutionId
        );

        if (!institutionProfile) {
          results.push({
            userId: assignment.userId,
            valid: false,
            reason: 'User not registered for this institution'
          });
          continue;
        }

        // Get assigner's role
        const assigner = await User.findById(assignedBy);
        if (!assigner) {
          results.push({
            userId: assignment.userId,
            valid: false,
            reason: 'Assigner not found'
          });
          continue;
        }

        const assignerProfile = assigner.institutions.find(
          (inst: IUserInstitution) => inst.institutionId.toString() === institutionId
        );

        if (!assignerProfile) {
          results.push({
            userId: assignment.userId,
            valid: false,
            reason: 'Assigner does not have access to this institution'
          });
          continue;
        }

        // Validate promotion authority
        const promotionCheck = this.canPromoteToRole(
          institutionProfile.role,
          assignment.newRole,
          assignerProfile.role
        );

        results.push({
          userId: assignment.userId,
          valid: promotionCheck.allowed,
          reason: promotionCheck.reason
        });

      } catch (error) {
        results.push({
          userId: assignment.userId,
          valid: false,
          reason: `Validation error: ${(error as Error).message}`
        });
      }
    }

    return results;
  }
}

export default new RoleManager();