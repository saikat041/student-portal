import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { AuthenticatedRequest, TenantContext } from './TenantContextManager';
import { IUser, IUserInstitution } from '../models/User';

export interface AccessValidationResult {
  allowed: boolean;
  reason?: string;
  logData?: Record<string, any>;
}

export interface SecurityAuditLog {
  userId: string;
  institutionId: string;
  action: string;
  resource: string;
  resourceId?: string;
  allowed: boolean;
  reason?: string;
  timestamp: Date;
  ipAddress?: string;
  userAgent?: string;
}

export class AccessValidator {
  private static instance: AccessValidator;
  private auditLogs: SecurityAuditLog[] = [];

  private constructor() {}

  public static getInstance(): AccessValidator {
    if (!AccessValidator.instance) {
      AccessValidator.instance = new AccessValidator();
    }
    return AccessValidator.instance;
  }

  /**
   * Validate cross-institutional access attempts
   * Requirement 7.4: Log all cross-institutional access attempts as security events
   * Requirement 7.5: Validate institutional context for all operations
   */
  async validateCrossInstitutionalAccess(
    user: IUser,
    requestedInstitutionId: string,
    action: string,
    resourceType: string,
    resourceId?: string,
    req?: Request
  ): Promise<AccessValidationResult> {
    const requestedObjectId = new mongoose.Types.ObjectId(requestedInstitutionId);
    
    // Check if user has access to the requested institution
    const userInstitution = user.institutions.find(
      inst => inst.institutionId.toString() === requestedInstitutionId && 
              inst.status === 'active'
    );

    const result: AccessValidationResult = {
      allowed: !!userInstitution,
      reason: userInstitution ? undefined : 'User does not have access to this institution',
      logData: {
        userInstitutions: user.institutions.map(inst => ({
          institutionId: inst.institutionId.toString(),
          role: inst.role,
          status: inst.status
        })),
        requestedInstitution: requestedInstitutionId,
        hasAccess: !!userInstitution
      }
    };

    // Always log cross-institutional access attempts (Requirement 7.4)
    await this.logSecurityEvent({
      userId: user._id.toString(),
      institutionId: requestedInstitutionId,
      action,
      resource: resourceType,
      resourceId,
      allowed: result.allowed,
      reason: result.reason,
      timestamp: new Date(),
      ipAddress: req?.ip,
      userAgent: req?.get('User-Agent')
    });

    return result;
  }

  /**
   * Validate resource access within institutional context
   * Requirement 7.5: Validate institutional context for all operations
   */
  async validateResourceAccess(
    context: TenantContext,
    resourceType: string,
    resourceId: string,
    action: string,
    req?: Request
  ): Promise<AccessValidationResult> {
    try {
      let allowed = false;
      let reason = '';
      let resourceData: any = null;

      switch (resourceType) {
        case 'course':
          const Course = mongoose.model('Course');
          const course = await Course.findOne({
            _id: resourceId,
            institutionId: context.institutionId
          });
          allowed = !!course;
          reason = allowed ? undefined : 'Course not found in current institution';
          resourceData = course ? { courseCode: course.courseCode, courseName: course.courseName } : null;
          break;

        case 'enrollment':
          const Enrollment = mongoose.model('Enrollment');
          const enrollment = await Enrollment.findOne({
            _id: resourceId,
            institutionId: context.institutionId
          });
          allowed = !!enrollment;
          reason = allowed ? undefined : 'Enrollment not found in current institution';
          resourceData = enrollment ? { studentId: enrollment.studentId, courseId: enrollment.courseId } : null;
          break;

        case 'user':
          const User = mongoose.model('User');
          const user = await User.findOne({
            _id: resourceId,
            'institutions.institutionId': context.institutionId,
            'institutions.status': 'active'
          });
          allowed = !!user;
          reason = allowed ? undefined : 'User not found in current institution';
          resourceData = user ? { email: user.email, firstName: user.firstName, lastName: user.lastName } : null;
          break;

        case 'institution':
          // Special case: validate institution exists and is active
          const Institution = mongoose.model('Institution');
          const institution = await Institution.findOne({
            _id: resourceId,
            status: 'active'
          });
          allowed = !!institution;
          reason = allowed ? undefined : 'Institution not found or inactive';
          resourceData = institution ? { name: institution.name, type: institution.type } : null;
          break;

        default:
          // For unknown resource types, deny access and log the attempt
          allowed = false;
          reason = `Unknown resource type: ${resourceType}`;
      }

      const result: AccessValidationResult = {
        allowed,
        reason: allowed ? undefined : reason,
        logData: {
          resourceData,
          institutionContext: context.institutionId.toString(),
          userRole: context.userInstitution.role
        }
      };

      // Always log resource access attempts for audit trail (Requirement 7.4)
      await this.logSecurityEvent({
        userId: context.userInstitution.institutionId.toString(), // Using institution as context
        institutionId: context.institutionId.toString(),
        action,
        resource: resourceType,
        resourceId,
        allowed,
        reason: result.reason,
        timestamp: new Date(),
        ipAddress: req?.ip,
        userAgent: req?.get('User-Agent')
      });

      return result;
    } catch (error) {
      console.error('Error validating resource access:', error);
      
      const result: AccessValidationResult = {
        allowed: false,
        reason: 'Internal validation error',
        logData: {
          error: (error as Error).message,
          institutionContext: context.institutionId.toString()
        }
      };

      // Log validation errors as security events
      await this.logSecurityEvent({
        userId: 'unknown',
        institutionId: context.institutionId.toString(),
        action,
        resource: resourceType,
        resourceId,
        allowed: false,
        reason: `Validation error: ${(error as Error).message}`,
        timestamp: new Date(),
        ipAddress: req?.ip,
        userAgent: req?.get('User-Agent')
      });

      return result;
    }
  }

  /**
   * Validate API request has proper institutional context
   * Requirement 7.5: Validate institutional context for all operations
   */
  async validateAPIRequestContext(
    req: Request,
    requiredResourceType?: string,
    requiredAction?: string
  ): Promise<AccessValidationResult> {
    const authReq = req as AuthenticatedRequest;
    
    // Check if user is authenticated
    if (!authReq.user) {
      const result: AccessValidationResult = {
        allowed: false,
        reason: 'Authentication required'
      };

      await this.logSecurityEvent({
        userId: 'anonymous',
        institutionId: 'unknown',
        action: requiredAction || 'api_access',
        resource: requiredResourceType || 'api',
        allowed: false,
        reason: 'Unauthenticated API request',
        timestamp: new Date(),
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      return result;
    }

    // Check if institutional context is established
    if (!authReq.tenantContext) {
      const result: AccessValidationResult = {
        allowed: false,
        reason: 'Institutional context required',
        logData: {
          userId: authReq.user._id.toString(),
          availableInstitutions: authReq.user.institutions.map(inst => ({
            institutionId: inst.institutionId.toString(),
            role: inst.role,
            status: inst.status
          }))
        }
      };

      await this.logSecurityEvent({
        userId: authReq.user._id.toString(),
        institutionId: 'unknown',
        action: requiredAction || 'api_access',
        resource: requiredResourceType || 'api',
        allowed: false,
        reason: 'API request without institutional context',
        timestamp: new Date(),
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      return result;
    }

    // Validate role permissions if resource type and action are specified
    if (requiredResourceType && requiredAction) {
      const roleValidation = this.validateRolePermissions(
        authReq.tenantContext.userInstitution,
        requiredAction,
        requiredResourceType
      );

      if (!roleValidation.allowed) {
        await this.logSecurityEvent({
          userId: authReq.user._id.toString(),
          institutionId: authReq.tenantContext.institutionId.toString(),
          action: requiredAction,
          resource: requiredResourceType,
          allowed: false,
          reason: roleValidation.reason,
          timestamp: new Date(),
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        });

        return roleValidation;
      }
    }

    // Log successful API access with institutional context
    await this.logSecurityEvent({
      userId: authReq.user._id.toString(),
      institutionId: authReq.tenantContext.institutionId.toString(),
      action: requiredAction || 'api_access',
      resource: requiredResourceType || 'api',
      allowed: true,
      reason: 'Valid API request with institutional context',
      timestamp: new Date(),
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    return {
      allowed: true,
      logData: {
        institutionId: authReq.tenantContext.institutionId.toString(),
        userRole: authReq.tenantContext.userInstitution.role,
        institutionName: authReq.tenantContext.institution.name
      }
    };
  }

  /**
   * Middleware for API request validation
   * Requirement 7.5: Validate institutional context for all operations
   */
  requireAPIContextValidation(resourceType?: string, action?: string) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const validation = await this.validateAPIRequestContext(req, resourceType, action);
        
        if (!validation.allowed) {
          const statusCode = validation.reason?.includes('Authentication') ? 401 : 
                           validation.reason?.includes('context') ? 400 : 403;
          
          res.status(statusCode).json({
            error: 'Access denied',
            message: validation.reason,
            ...(validation.logData && { context: validation.logData })
          });
          return;
        }

        next();
      } catch (error) {
        console.error('API context validation error:', error);
        res.status(500).json({ 
          error: 'Internal server error during API validation',
          message: (error as Error).message
        });
      }
    };
  }
  validateRolePermissions(
    userInstitution: IUserInstitution,
    action: string,
    resourceType: string
  ): AccessValidationResult {
    const role = userInstitution.role;
    
    // Define role-based permissions
    const permissions = {
      student: {
        course: ['read', 'enroll'],
        enrollment: ['read', 'create', 'delete'], // own enrollments only
        user: ['read'] // own profile only
      },
      teacher: {
        course: ['read', 'create', 'update', 'delete'], // own courses
        enrollment: ['read'], // courses they teach
        user: ['read'] // students in their courses
      },
      institution_admin: {
        course: ['read', 'create', 'update', 'delete'],
        enrollment: ['read', 'create', 'update', 'delete'],
        user: ['read', 'create', 'update', 'approve', 'suspend']
      }
    };

    const rolePermissions = permissions[role];
    if (!rolePermissions) {
      return {
        allowed: false,
        reason: `Unknown role: ${role}`
      };
    }

    const resourcePermissions = rolePermissions[resourceType as keyof typeof rolePermissions];
    if (!resourcePermissions) {
      return {
        allowed: false,
        reason: `No permissions defined for resource type: ${resourceType}`
      };
    }

    const allowed = resourcePermissions.includes(action);
    return {
      allowed,
      reason: allowed ? undefined : `Role ${role} does not have permission to ${action} ${resourceType}`
    };
  }

  /**
   * Middleware for institutional access validation
   */
  requireInstitutionalAccess(resourceType: string, action: string = 'access') {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const authReq = req as AuthenticatedRequest;
        
        if (!authReq.user || !authReq.tenantContext) {
          res.status(401).json({ error: 'Authentication and institutional context required' });
          return;
        }

        // Validate role permissions
        const roleValidation = this.validateRolePermissions(
          authReq.tenantContext.userInstitution,
          action,
          resourceType
        );

        if (!roleValidation.allowed) {
          await this.logSecurityEvent({
            userId: authReq.user._id.toString(),
            institutionId: authReq.tenantContext.institutionId.toString(),
            action,
            resource: resourceType,
            allowed: false,
            reason: roleValidation.reason,
            timestamp: new Date(),
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
          });

          res.status(403).json({ 
            error: 'Access denied',
            message: roleValidation.reason
          });
          return;
        }

        // If resource ID is provided in params, validate resource access
        const resourceId = req.params.id || req.params.resourceId;
        if (resourceId) {
          const resourceValidation = await this.validateResourceAccess(
            authReq.tenantContext,
            resourceType,
            resourceId,
            action,
            req
          );

          if (!resourceValidation.allowed) {
            res.status(404).json({ 
              error: 'Resource not found',
              message: resourceValidation.reason
            });
            return;
          }
        }

        next();
      } catch (error) {
        console.error('Access validation error:', error);
        res.status(500).json({ error: 'Internal server error during access validation' });
      }
    };
  }

  /**
   * Log security events for audit trail
   * Requirement 7.4: Log all cross-institutional access attempts as security events
   */
  async logSecurityEvent(event: SecurityAuditLog): Promise<void> {
    try {
      // Store in memory for now (in production, use proper logging service)
      this.auditLogs.push(event);
      
      // Enhanced logging for different event types
      if (!event.allowed) {
        console.warn('🚨 SECURITY ALERT - Unauthorized access attempt:', {
          timestamp: event.timestamp.toISOString(),
          userId: event.userId,
          institutionId: event.institutionId,
          action: event.action,
          resource: event.resource,
          resourceId: event.resourceId,
          reason: event.reason,
          ipAddress: event.ipAddress,
          userAgent: event.userAgent
        });
      } else if (event.action.includes('cross') || event.action.includes('switch')) {
        // Log cross-institutional activities even when allowed
        console.info('🔄 Cross-institutional activity:', {
          timestamp: event.timestamp.toISOString(),
          userId: event.userId,
          institutionId: event.institutionId,
          action: event.action,
          resource: event.resource,
          ipAddress: event.ipAddress
        });
      } else {
        // Log normal access for audit trail
        console.debug('✅ Access granted:', {
          timestamp: event.timestamp.toISOString(),
          userId: event.userId,
          institutionId: event.institutionId,
          action: event.action,
          resource: event.resource
        });
      }

      // Keep only last 1000 logs in memory
      if (this.auditLogs.length > 1000) {
        this.auditLogs = this.auditLogs.slice(-1000);
      }
    } catch (error) {
      console.error('Error logging security event:', error);
    }
  }

  /**
   * Get security audit logs (for admin use)
   */
  getAuditLogs(institutionId?: string, limit: number = 100): SecurityAuditLog[] {
    let logs = this.auditLogs;
    
    if (institutionId) {
      logs = logs.filter(log => log.institutionId === institutionId);
    }

    return logs
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Get security alerts (failed access attempts)
   */
  getSecurityAlerts(institutionId?: string, limit: number = 50): SecurityAuditLog[] {
    return this.getAuditLogs(institutionId, limit)
      .filter(log => !log.allowed);
  }

  /**
   * Get cross-institutional access attempts (both allowed and denied)
   */
  getCrossInstitutionalAttempts(institutionId?: string, limit: number = 100): SecurityAuditLog[] {
    return this.getAuditLogs(institutionId, limit)
      .filter(log => 
        log.action.includes('cross') || 
        log.action.includes('switch') || 
        log.reason?.includes('institution')
      );
  }

  /**
   * Get audit summary for an institution
   */
  getAuditSummary(institutionId: string, hours: number = 24): {
    totalRequests: number;
    deniedRequests: number;
    crossInstitutionalAttempts: number;
    uniqueUsers: number;
    topActions: Array<{ action: string; count: number }>;
    topResources: Array<{ resource: string; count: number }>;
  } {
    const cutoffTime = new Date(Date.now() - (hours * 60 * 60 * 1000));
    const logs = this.auditLogs.filter(log => 
      log.institutionId === institutionId && 
      log.timestamp >= cutoffTime
    );

    const deniedLogs = logs.filter(log => !log.allowed);
    const crossInstitutionalLogs = logs.filter(log => 
      log.action.includes('cross') || 
      log.action.includes('switch') || 
      log.reason?.includes('institution')
    );

    const uniqueUsers = new Set(logs.map(log => log.userId)).size;

    // Count actions
    const actionCounts = logs.reduce((acc, log) => {
      acc[log.action] = (acc[log.action] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Count resources
    const resourceCounts = logs.reduce((acc, log) => {
      acc[log.resource] = (acc[log.resource] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalRequests: logs.length,
      deniedRequests: deniedLogs.length,
      crossInstitutionalAttempts: crossInstitutionalLogs.length,
      uniqueUsers,
      topActions: Object.entries(actionCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .map(([action, count]) => ({ action, count })),
      topResources: Object.entries(resourceCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .map(([resource, count]) => ({ resource, count }))
    };
  }

  /**
   * Clear audit logs (for testing)
   */
  clearAuditLogs(): void {
    this.auditLogs = [];
  }
}

export default AccessValidator.getInstance();