import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../services/TenantContextManager';
import roleManager, { PermissionCheckResult } from '../services/RoleManager';
import { AccessValidator } from '../services/AccessValidator';

/**
 * Role-Based Access Control Middleware
 * Requirements 13.4, 13.5, 17.2, 18.1
 * 
 * Provides comprehensive permission checking based on user roles
 * within institutional boundaries
 */

export interface RoleBasedAuthOptions {
  resource: string;
  action: string;
  allowSelfAccess?: boolean; // Allow users to access their own resources
  requireInstitutionalContext?: boolean; // Require institutional context (default: true)
  customValidator?: (req: AuthenticatedRequest) => Promise<boolean>;
}

/**
 * Main role-based authorization middleware
 */
export const requirePermission = (options: RoleBasedAuthOptions) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const accessValidator = AccessValidator.getInstance();

      // Check authentication
      if (!authReq.user) {
        res.status(401).json({ 
          error: 'Authentication required',
          message: 'Please log in to access this resource'
        });
        return;
      }

      // Check institutional context (unless explicitly disabled)
      if (options.requireInstitutionalContext !== false && !authReq.tenantContext) {
        res.status(400).json({ 
          error: 'Institutional context required',
          message: 'Please select an institution to continue',
          availableInstitutions: authReq.user.institutions
            .filter(inst => inst.status === 'active')
            .map(inst => ({
              id: inst.institutionId,
              role: inst.role
            }))
        });
        return;
      }

      let permissionResult: PermissionCheckResult;

      if (authReq.tenantContext) {
        // Check permissions within institutional context
        const context = {
          userId: authReq.user._id.toString(),
          institutionId: authReq.tenantContext.institutionId.toString(),
          resourceOwnerId: req.params.userId || req.body.userId,
          profileUserId: req.params.id || req.params.userId,
          courseTeacherId: req.params.teacherId || req.body.teacherId
        };

        permissionResult = roleManager.hasPermission(
          authReq.tenantContext.userInstitution.role,
          options.resource,
          options.action,
          context
        );
      } else {
        // System-level permission check (for operations without institutional context)
        const hasSystemAdminRole = authReq.user.institutions.some(inst => 
          inst.role === 'institution_admin' && inst.status === 'active'
        );

        if (!hasSystemAdminRole) {
          res.status(403).json({ 
            error: 'Access denied',
            message: 'System administrator privileges required'
          });
          return;
        }

        permissionResult = {
          allowed: true,
          userRole: 'system_admin',
          institutionId: 'system'
        };
      }

      // Handle self-access for certain resources
      if (!permissionResult.allowed && options.allowSelfAccess) {
        const isSelfAccess = req.params.id === authReq.user._id.toString() ||
                           req.params.userId === authReq.user._id.toString();
        
        if (isSelfAccess) {
          permissionResult = {
            allowed: true,
            userRole: authReq.tenantContext?.userInstitution.role || 'self',
            institutionId: authReq.tenantContext?.institutionId.toString() || 'self'
          };
        }
      }

      // Run custom validator if provided
      if (permissionResult.allowed && options.customValidator) {
        const customResult = await options.customValidator(authReq);
        if (!customResult) {
          permissionResult = {
            allowed: false,
            reason: 'Custom validation failed',
            userRole: permissionResult.userRole,
            institutionId: permissionResult.institutionId
          };
        }
      }

      // Log the permission check
      await accessValidator.logSecurityEvent({
        userId: authReq.user._id.toString(),
        institutionId: permissionResult.institutionId,
        action: options.action,
        resource: options.resource,
        resourceId: req.params.id || req.params.resourceId,
        allowed: permissionResult.allowed,
        reason: permissionResult.reason,
        timestamp: new Date(),
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      if (!permissionResult.allowed) {
        res.status(403).json({ 
          error: 'Access denied',
          message: permissionResult.reason || 'Insufficient permissions',
          required: {
            resource: options.resource,
            action: options.action
          },
          current: {
            role: permissionResult.userRole,
            institution: permissionResult.institutionId
          }
        });
        return;
      }

      // Attach permission info to request for downstream use
      (authReq as any).permissionContext = {
        resource: options.resource,
        action: options.action,
        role: permissionResult.userRole,
        institutionId: permissionResult.institutionId
      };

      next();
    } catch (error) {
      console.error('Role-based authorization error:', error);
      res.status(500).json({ 
        error: 'Internal server error during authorization',
        message: (error as Error).message
      });
    }
  };
};

/**
 * Middleware to require specific role
 */
export const requireRole = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authReq = req as AuthenticatedRequest;
    
    if (!authReq.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!authReq.tenantContext) {
      res.status(400).json({ error: 'Institutional context required' });
      return;
    }

    const userRole = authReq.tenantContext.userInstitution.role;
    
    if (!roles.includes(userRole)) {
      res.status(403).json({ 
        error: 'Access denied',
        message: `Required role: ${roles.join(' or ')}, current role: ${userRole}`,
        required: roles,
        current: userRole
      });
      return;
    }

    next();
  };
};

/**
 * Middleware to require institution admin role
 */
export const requireInstitutionAdmin = requireRole('institution_admin');

/**
 * Middleware to require teacher or admin role
 */
export const requireTeacherOrAdmin = requireRole('teacher', 'institution_admin');

/**
 * Middleware to require student, teacher, or admin role (any active user)
 */
export const requireActiveUser = requireRole('student', 'teacher', 'institution_admin');

/**
 * Middleware for course management permissions
 */
export const requireCoursePermission = (action: string) => {
  return requirePermission({
    resource: 'course',
    action,
    customValidator: async (req: AuthenticatedRequest) => {
      // For course-specific actions, validate course ownership for teachers
      if (req.tenantContext?.userInstitution.role === 'teacher' && req.params.courseId) {
        const Course = require('../models/Course').default;
        const course = await Course.findOne({
          _id: req.params.courseId,
          institutionId: req.tenantContext.institutionId,
          teacherId: req.user._id
        });
        return !!course;
      }
      return true;
    }
  });
};

/**
 * Middleware for user management permissions
 */
export const requireUserManagementPermission = (action: string) => {
  return requirePermission({
    resource: 'user',
    action,
    allowSelfAccess: action === 'read' || action === 'update'
  });
};

/**
 * Middleware for enrollment permissions
 */
export const requireEnrollmentPermission = (action: string) => {
  return requirePermission({
    resource: 'enrollment',
    action,
    customValidator: async (req: AuthenticatedRequest) => {
      // Students can only manage their own enrollments
      if (req.tenantContext?.userInstitution.role === 'student' && req.params.enrollmentId) {
        const Enrollment = require('../models/Enrollment').default;
        const enrollment = await Enrollment.findOne({
          _id: req.params.enrollmentId,
          studentId: req.user._id,
          institutionId: req.tenantContext.institutionId
        });
        return !!enrollment;
      }
      return true;
    }
  });
};

/**
 * Middleware for administrative functions
 */
export const requireAdminPermission = (resource: string, action: string) => {
  return requirePermission({
    resource,
    action,
    customValidator: async (req: AuthenticatedRequest) => {
      // Only institution admins can perform administrative actions
      return req.tenantContext?.userInstitution.role === 'institution_admin';
    }
  });
};

/**
 * Middleware to check role promotion permissions
 */
export const requireRolePromotionPermission = () => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;

      if (!authReq.user || !authReq.tenantContext) {
        res.status(401).json({ error: 'Authentication and institutional context required' });
        return;
      }

      const { targetRole } = req.body;
      const { userId } = req.params;

      if (!targetRole || !userId) {
        res.status(400).json({ error: 'Target role and user ID required' });
        return;
      }

      // Get target user's current role
      const User = require('../models/User').default;
      const targetUser = await User.findById(userId);
      
      if (!targetUser) {
        res.status(404).json({ error: 'Target user not found' });
        return;
      }

      const targetUserInstitution = targetUser.institutions.find(
        (inst: any) => inst.institutionId.toString() === authReq.tenantContext!.institutionId.toString()
      );

      if (!targetUserInstitution) {
        res.status(404).json({ error: 'Target user not found in this institution' });
        return;
      }

      // Check promotion permissions
      const promotionCheck = roleManager.canPromoteToRole(
        targetUserInstitution.role,
        targetRole,
        authReq.tenantContext.userInstitution.role
      );

      if (!promotionCheck.allowed) {
        res.status(403).json({ 
          error: 'Access denied',
          message: promotionCheck.reason
        });
        return;
      }

      next();
    } catch (error) {
      console.error('Role promotion permission check error:', error);
      res.status(500).json({ 
        error: 'Internal server error during role promotion check',
        message: (error as Error).message
      });
    }
  };
};

/**
 * Middleware to validate resource ownership
 */
export const requireResourceOwnership = (resourceType: string, ownerField: string = 'userId') => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;

      if (!authReq.user || !authReq.tenantContext) {
        res.status(401).json({ error: 'Authentication and institutional context required' });
        return;
      }

      const resourceId = req.params.id || req.params.resourceId;
      if (!resourceId) {
        res.status(400).json({ error: 'Resource ID required' });
        return;
      }

      // Skip ownership check for institution admins
      if (authReq.tenantContext.userInstitution.role === 'institution_admin') {
        next();
        return;
      }

      // Dynamic model loading based on resource type
      let Model;
      try {
        Model = require(`../models/${resourceType.charAt(0).toUpperCase() + resourceType.slice(1)}`).default;
      } catch (error) {
        res.status(400).json({ error: `Unknown resource type: ${resourceType}` });
        return;
      }

      const resource = await Model.findOne({
        _id: resourceId,
        institutionId: authReq.tenantContext.institutionId
      });

      if (!resource) {
        res.status(404).json({ error: 'Resource not found' });
        return;
      }

      // Check ownership
      const ownerId = resource[ownerField]?.toString();
      const userId = authReq.user._id.toString();

      if (ownerId !== userId) {
        res.status(403).json({ 
          error: 'Access denied',
          message: 'You can only access your own resources'
        });
        return;
      }

      next();
    } catch (error) {
      console.error('Resource ownership validation error:', error);
      res.status(500).json({ 
        error: 'Internal server error during ownership validation',
        message: (error as Error).message
      });
    }
  };
};

/**
 * Utility function to check permissions programmatically
 */
export const checkPermission = async (
  user: any,
  institutionId: string,
  resource: string,
  action: string,
  context?: Record<string, any>
): Promise<PermissionCheckResult> => {
  
  const userInstitution = user.institutions.find(
    (inst: any) => inst.institutionId.toString() === institutionId && inst.status === 'active'
  );

  if (!userInstitution) {
    return {
      allowed: false,
      reason: 'User does not have access to this institution',
      userRole: 'none',
      institutionId
    };
  }

  return roleManager.hasPermission(
    userInstitution.role,
    resource,
    action,
    { ...context, userId: user._id.toString(), institutionId }
  );
};

/**
 * Express middleware to add permission checking utilities to request
 */
export const addPermissionUtils = (req: Request, res: Response, next: NextFunction): void => {
  const authReq = req as AuthenticatedRequest;
  
  // Add utility function to request object
  (authReq as any).checkPermission = async (
    resource: string,
    action: string,
    context?: Record<string, any>
  ): Promise<PermissionCheckResult> => {
    if (!authReq.user || !authReq.tenantContext) {
      return {
        allowed: false,
        reason: 'Authentication and institutional context required',
        userRole: 'none',
        institutionId: 'unknown'
      };
    }

    return checkPermission(
      authReq.user,
      authReq.tenantContext.institutionId.toString(),
      resource,
      action,
      context
    );
  };

  next();
};