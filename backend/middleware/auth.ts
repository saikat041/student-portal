import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User, { IUser } from '../models/User';
import { AuthenticatedRequest } from '../services/TenantContextManager';
import { SessionManager } from '../services/SessionManager';
import roleManager from '../services/RoleManager';
import { AccessValidator } from '../services/AccessValidator';

const JWT_SECRET = process.env.JWT_SECRET;

interface JwtPayload {
  id: string;
}

export const authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      res.status(401).json({ error: 'Access denied. No token provided.' });
      return;
    }

    if (!JWT_SECRET) {
      res.status(500).json({ error: 'Server configuration error' });
      return;
    }

    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    const user = await User.findById(decoded.id);
    
    if (!user || !user.isActive) {
      res.status(401).json({ error: 'Invalid token or user deactivated' });
      return;
    }

    // Attach user to request
    (req as AuthenticatedRequest).user = user;
    
    // Attach session manager for context management
    const sessionManager = SessionManager.getInstance();
    const sessionId = user._id.toString();
    
    // Get or create session
    let session = sessionManager.getSession(sessionId);
    if (!session) {
      session = sessionManager.createSession(user._id.toString(), sessionId);
    }
    
    // Attach session data to request
    (req as any).session = session;
    (req as any).sessionId = sessionId;
    
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

export const authorize = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as AuthenticatedRequest).user;
    const tenantContext = (req as AuthenticatedRequest).tenantContext;
    const accessValidator = AccessValidator.getInstance();
    
    // For multi-institutional system, check role within current institution
    if (tenantContext) {
      const userRole = tenantContext.userInstitution.role;
      if (!roles.includes(userRole)) {
        // Log unauthorized access attempt
        accessValidator.logSecurityEvent({
          userId: user._id.toString(),
          institutionId: tenantContext.institutionId.toString(),
          action: 'authorization_check',
          resource: 'endpoint',
          allowed: false,
          reason: `Role ${userRole} not in required roles: ${roles.join(', ')}`,
          timestamp: new Date()
        });

        res.status(403).json({ 
          error: 'Access denied. Insufficient permissions within this institution.',
          required: roles,
          current: userRole,
          institution: tenantContext.institutionId.toString()
        });
        return;
      }

      // Log successful authorization
      accessValidator.logSecurityEvent({
        userId: user._id.toString(),
        institutionId: tenantContext.institutionId.toString(),
        action: 'authorization_check',
        resource: 'endpoint',
        allowed: true,
        reason: `Role ${userRole} authorized for endpoint`,
        timestamp: new Date()
      });
    } else {
      // For system-level operations, check if user has any admin role
      const hasAdminRole = user.institutions.some(inst => 
        inst.role === 'institution_admin' && inst.status === 'active'
      );
      
      if (roles.includes('system_admin') && !hasAdminRole) {
        // Log unauthorized system access attempt
        accessValidator.logSecurityEvent({
          userId: user._id.toString(),
          institutionId: 'system',
          action: 'system_authorization_check',
          resource: 'system_endpoint',
          allowed: false,
          reason: 'No active institution admin role for system access',
          timestamp: new Date()
        });

        res.status(403).json({ 
          error: 'Access denied. System administrator privileges required.',
          message: 'Only institution administrators can perform system-level operations.'
        });
        return;
      }

      // Log successful system authorization
      if (hasAdminRole) {
        accessValidator.logSecurityEvent({
          userId: user._id.toString(),
          institutionId: 'system',
          action: 'system_authorization_check',
          resource: 'system_endpoint',
          allowed: true,
          reason: 'Institution admin role authorized for system access',
          timestamp: new Date()
        });
      }
    }
    next();
  };
};

/**
 * Middleware to check for system administrator privileges
 * For now, any active institution admin can perform system operations
 * This can be refined later with a dedicated system admin role
 */
export const requireSystemAdmin = (req: Request, res: Response, next: NextFunction): void => {
  const user = (req as AuthenticatedRequest).user;
  const accessValidator = AccessValidator.getInstance();
  
  // Check if user has any active institution admin role
  const hasSystemAdminPrivileges = user.institutions.some(inst => 
    inst.role === 'institution_admin' && inst.status === 'active'
  );
  
  if (!hasSystemAdminPrivileges) {
    // Log unauthorized system admin access attempt
    accessValidator.logSecurityEvent({
      userId: user._id.toString(),
      institutionId: 'system',
      action: 'system_admin_check',
      resource: 'system_admin_endpoint',
      allowed: false,
      reason: 'No active institution admin role for system admin access',
      timestamp: new Date()
    });

    res.status(403).json({ 
      error: 'Access denied. System administrator privileges required.',
      message: 'Only institution administrators can perform system-level operations.'
    });
    return;
  }
  
  // Log successful system admin authorization
  accessValidator.logSecurityEvent({
    userId: user._id.toString(),
    institutionId: 'system',
    action: 'system_admin_check',
    resource: 'system_admin_endpoint',
    allowed: true,
    reason: 'Institution admin role authorized for system admin access',
    timestamp: new Date()
  });

  next();
};

/**
 * Enhanced role-based authorization with permission checking
 * Requirements 13.4, 13.5, 17.2, 18.1
 */
export const requirePermissions = (resource: string, action: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authReq = req as AuthenticatedRequest;
    const accessValidator = AccessValidator.getInstance();

    if (!authReq.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!authReq.tenantContext) {
      res.status(400).json({ error: 'Institutional context required' });
      return;
    }

    // Check permissions using role manager
    const permissionResult = roleManager.hasPermission(
      authReq.tenantContext.userInstitution.role,
      resource,
      action,
      {
        userId: authReq.user._id.toString(),
        institutionId: authReq.tenantContext.institutionId.toString()
      }
    );

    // Log permission check
    accessValidator.logSecurityEvent({
      userId: authReq.user._id.toString(),
      institutionId: authReq.tenantContext.institutionId.toString(),
      action: `permission_check_${action}`,
      resource,
      resourceId: req.params.id || req.params.resourceId,
      allowed: permissionResult.allowed,
      reason: permissionResult.reason || `Permission check for ${action} on ${resource}`,
      timestamp: new Date()
    });

    if (!permissionResult.allowed) {
      res.status(403).json({ 
        error: 'Access denied',
        message: permissionResult.reason,
        required: { resource, action },
        current: { 
          role: permissionResult.userRole,
          institution: permissionResult.institutionId
        }
      });
      return;
    }

    next();
  };
};

/**
 * Middleware to validate role hierarchy for administrative actions
 * Requirements 17.2, 18.1
 */
export const requireRoleHierarchy = (minimumRole: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authReq = req as AuthenticatedRequest;
    const accessValidator = AccessValidator.getInstance();

    if (!authReq.user || !authReq.tenantContext) {
      res.status(401).json({ error: 'Authentication and institutional context required' });
      return;
    }

    const userRole = authReq.tenantContext.userInstitution.role;
    const userRoleDefinition = roleManager.getRoleDefinition(userRole);
    const minimumRoleDefinition = roleManager.getRoleDefinition(minimumRole);

    if (!userRoleDefinition || !minimumRoleDefinition) {
      res.status(500).json({ error: 'Invalid role configuration' });
      return;
    }

    const hasRequiredLevel = userRoleDefinition.hierarchyLevel >= minimumRoleDefinition.hierarchyLevel;

    // Log hierarchy check
    accessValidator.logSecurityEvent({
      userId: authReq.user._id.toString(),
      institutionId: authReq.tenantContext.institutionId.toString(),
      action: 'role_hierarchy_check',
      resource: 'role_hierarchy',
      allowed: hasRequiredLevel,
      reason: `User role ${userRole} (level ${userRoleDefinition.hierarchyLevel}) vs required ${minimumRole} (level ${minimumRoleDefinition.hierarchyLevel})`,
      timestamp: new Date()
    });

    if (!hasRequiredLevel) {
      res.status(403).json({ 
        error: 'Access denied',
        message: `Minimum role required: ${minimumRole}`,
        required: {
          role: minimumRole,
          level: minimumRoleDefinition.hierarchyLevel
        },
        current: {
          role: userRole,
          level: userRoleDefinition.hierarchyLevel
        }
      });
      return;
    }

    next();
  };
};
