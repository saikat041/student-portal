import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../services/TenantContextManager';
import roleManager from '../services/RoleManager';
import UserService from '../services/UserService';
import { 
  requirePermission, 
  requireInstitutionAdmin, 
  requireRolePromotionPermission,
  checkPermission 
} from '../middleware/roleBasedAuth';

/**
 * Role Management Controller
 * Requirements 13.4, 13.5, 17.2, 18.1
 * 
 * Handles role assignments, permission checks, and role management
 * within institutional boundaries
 */

/**
 * Get all available roles and their permissions
 * GET /api/roles
 */
export const getRoles = async (req: Request, res: Response): Promise<void> => {
  try {
    const roles = roleManager.getAllRoles();

    res.json({
      roles: roles.map((role: any) => ({
        name: role.name,
        displayName: role.displayName,
        description: role.description,
        hierarchyLevel: role.hierarchyLevel,
        permissions: role.permissions.map((p: any) => ({
          resource: p.resource,
          actions: p.actions,
          conditions: p.conditions
        }))
      }))
    });
  } catch (error) {
    console.error('Error getting roles:', error);
    res.status(500).json({ 
      error: 'Failed to get roles',
      message: (error as Error).message
    });
  }
};

/**
 * Get current user's permissions within institutional context
 * GET /api/roles/my-permissions
 */
export const getMyPermissions = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;

    if (!authReq.tenantContext) {
      res.status(400).json({ error: 'Institutional context required' });
      return;
    }

    const permissions = roleManager.getUserPermissions(authReq.tenantContext.userInstitution);
    const roleDefinition = roleManager.getRoleDefinition(authReq.tenantContext.userInstitution.role);

    res.json({
      user: {
        id: authReq.user._id.toString(),
        email: authReq.user.email,
        firstName: authReq.user.firstName,
        lastName: authReq.user.lastName
      },
      institution: {
        id: authReq.tenantContext.institutionId.toString(),
        name: authReq.tenantContext.institution.name
      },
      role: {
        name: authReq.tenantContext.userInstitution.role,
        displayName: roleDefinition?.displayName,
        description: roleDefinition?.description,
        hierarchyLevel: roleDefinition?.hierarchyLevel
      },
      permissions,
      status: authReq.tenantContext.userInstitution.status
    });
  } catch (error) {
    console.error('Error getting user permissions:', error);
    res.status(500).json({ 
      error: 'Failed to get user permissions',
      message: (error as Error).message
    });
  }
};

/**
 * Check if current user has specific permission
 * POST /api/roles/check-permission
 */
export const checkUserPermission = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { resource, action, context } = req.body;

    if (!resource || !action) {
      res.status(400).json({ error: 'Resource and action are required' });
      return;
    }

    if (!authReq.tenantContext) {
      res.status(400).json({ error: 'Institutional context required' });
      return;
    }

    const permissionResult = await checkPermission(
      authReq.user,
      authReq.tenantContext.institutionId.toString(),
      resource,
      action,
      context
    );

    res.json({
      permission: {
        resource,
        action,
        context
      },
      result: permissionResult,
      user: {
        role: authReq.tenantContext.userInstitution.role,
        institutionId: authReq.tenantContext.institutionId.toString()
      }
    });
  } catch (error) {
    console.error('Error checking permission:', error);
    res.status(500).json({ 
      error: 'Failed to check permission',
      message: (error as Error).message
    });
  }
};

/**
 * Assign role to user (admin only)
 * PUT /api/roles/assign/:userId
 */
export const assignRole = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { userId } = req.params;
    const { newRole, reason } = req.body;

    if (!authReq.tenantContext) {
      res.status(400).json({ error: 'Institutional context required' });
      return;
    }

    if (!newRole) {
      res.status(400).json({ error: 'New role is required' });
      return;
    }

    const result = await roleManager.assignRole(
      userId,
      authReq.tenantContext.institutionId.toString(),
      newRole,
      authReq.user._id.toString(),
      reason
    );

    if (!result.success) {
      res.status(400).json({ 
        error: 'Role assignment failed',
        message: result.message
      });
      return;
    }

    res.json({
      message: result.message,
      assignment: {
        userId,
        previousRole: result.previousRole,
        newRole: result.newRole,
        assignedBy: result.assignedBy,
        timestamp: result.timestamp,
        reason
      }
    });
  } catch (error) {
    console.error('Error assigning role:', error);
    res.status(500).json({ 
      error: 'Failed to assign role',
      message: (error as Error).message
    });
  }
};

/**
 * Get role assignment history for a user (admin only)
 * GET /api/roles/history/:userId
 */
export const getRoleHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { userId } = req.params;

    if (!authReq.tenantContext) {
      res.status(400).json({ error: 'Institutional context required' });
      return;
    }

    const history = await roleManager.getRoleHistory(
      userId,
      authReq.tenantContext.institutionId.toString()
    );

    res.json({
      userId,
      institutionId: authReq.tenantContext.institutionId.toString(),
      history
    });
  } catch (error) {
    console.error('Error getting role history:', error);
    res.status(500).json({ 
      error: 'Failed to get role history',
      message: (error as Error).message
    });
  }
};

/**
 * Get all role assignments for current institution (admin only)
 * GET /api/roles/assignments
 */
export const getInstitutionRoleAssignments = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;

    if (!authReq.tenantContext) {
      res.status(400).json({ error: 'Institutional context required' });
      return;
    }

    const assignments = await roleManager.getInstitutionRoleAssignments(
      authReq.tenantContext.institutionId.toString()
    );

    res.json({
      institutionId: authReq.tenantContext.institutionId.toString(),
      institutionName: authReq.tenantContext.institution.name,
      assignments,
      summary: {
        total: assignments.length,
        byRole: assignments.reduce((acc: any, assignment: any) => {
          acc[assignment.currentRole] = (acc[assignment.currentRole] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        byStatus: assignments.reduce((acc: any, assignment: any) => {
          acc[assignment.status] = (acc[assignment.status] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
      }
    });
  } catch (error) {
    console.error('Error getting institution role assignments:', error);
    res.status(500).json({ 
      error: 'Failed to get institution role assignments',
      message: (error as Error).message
    });
  }
};

/**
 * Validate bulk role assignments (admin only)
 * POST /api/roles/validate-bulk-assignments
 */
export const validateBulkRoleAssignments = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { assignments } = req.body;

    if (!authReq.tenantContext) {
      res.status(400).json({ error: 'Institutional context required' });
      return;
    }

    if (!Array.isArray(assignments)) {
      res.status(400).json({ error: 'Assignments must be an array' });
      return;
    }

    const validationResults = await roleManager.validateBulkRoleAssignments(
      assignments,
      authReq.tenantContext.institutionId.toString(),
      authReq.user._id.toString()
    );

    const summary = {
      total: validationResults.length,
      valid: validationResults.filter((r: any) => r.valid).length,
      invalid: validationResults.filter((r: any) => !r.valid).length,
      validationErrors: validationResults
        .filter((r: any) => !r.valid)
        .reduce((acc: any, r: any) => {
          acc[r.reason || 'Unknown error'] = (acc[r.reason || 'Unknown error'] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
    };

    res.json({
      institutionId: authReq.tenantContext.institutionId.toString(),
      validationResults,
      summary
    });
  } catch (error) {
    console.error('Error validating bulk role assignments:', error);
    res.status(500).json({ 
      error: 'Failed to validate bulk role assignments',
      message: (error as Error).message
    });
  }
};

/**
 * Get institution administrators (admin only)
 * GET /api/roles/administrators
 */
export const getInstitutionAdministrators = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;

    if (!authReq.tenantContext) {
      res.status(400).json({ error: 'Institutional context required' });
      return;
    }

    const administrators = await UserService.getInstitutionAdministrators(
      authReq.tenantContext.institutionId.toString()
    );

    res.json({
      institutionId: authReq.tenantContext.institutionId.toString(),
      institutionName: authReq.tenantContext.institution.name,
      administrators,
      count: administrators.length
    });
  } catch (error) {
    console.error('Error getting institution administrators:', error);
    res.status(500).json({ 
      error: 'Failed to get institution administrators',
      message: (error as Error).message
    });
  }
};

/**
 * Promote user to institution administrator (admin only)
 * POST /api/roles/promote-admin/:userId
 */
export const promoteToAdmin = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { userId } = req.params;
    const { adminLevel, permissions, reason } = req.body;

    if (!authReq.tenantContext) {
      res.status(400).json({ error: 'Institutional context required' });
      return;
    }

    const promotedUser = await UserService.promoteToInstitutionAdmin(
      userId,
      authReq.tenantContext.institutionId.toString(),
      authReq.user._id.toString(),
      adminLevel,
      permissions
    );

    res.json({
      message: 'User successfully promoted to institution administrator',
      user: {
        id: promotedUser._id.toString(),
        email: promotedUser.email,
        firstName: promotedUser.firstName,
        lastName: promotedUser.lastName
      },
      promotion: {
        institutionId: authReq.tenantContext.institutionId.toString(),
        adminLevel: adminLevel || 'institution',
        permissions: permissions || ['user_management', 'registration_approval', 'settings_management'],
        promotedBy: authReq.user._id.toString(),
        promotedAt: new Date(),
        reason
      }
    });
  } catch (error) {
    console.error('Error promoting user to admin:', error);
    res.status(500).json({ 
      error: 'Failed to promote user to admin',
      message: (error as Error).message
    });
  }
};

/**
 * Remove administrative privileges (admin only)
 * POST /api/roles/remove-admin/:userId
 */
export const removeAdminPrivileges = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { userId } = req.params;
    const { newRole, reason } = req.body;

    if (!authReq.tenantContext) {
      res.status(400).json({ error: 'Institutional context required' });
      return;
    }

    if (!newRole || !['student', 'teacher'].includes(newRole)) {
      res.status(400).json({ error: 'Valid new role (student or teacher) is required' });
      return;
    }

    const updatedUser = await UserService.removeAdminPrivileges(
      userId,
      authReq.tenantContext.institutionId.toString(),
      newRole,
      authReq.user._id.toString(),
      reason
    );

    res.json({
      message: 'Administrative privileges successfully removed',
      user: {
        id: updatedUser._id.toString(),
        email: updatedUser.email,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName
      },
      change: {
        institutionId: authReq.tenantContext.institutionId.toString(),
        newRole,
        removedBy: authReq.user._id.toString(),
        removedAt: new Date(),
        reason
      }
    });
  } catch (error) {
    console.error('Error removing admin privileges:', error);
    res.status(500).json({ 
      error: 'Failed to remove admin privileges',
      message: (error as Error).message
    });
  }
};