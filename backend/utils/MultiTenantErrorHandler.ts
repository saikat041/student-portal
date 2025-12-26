import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../services/TenantContextManager';

/**
 * Multi-tenant specific error types
 */
export enum MultiTenantErrorType {
  INSTITUTION_CONTEXT_MISSING = 'INSTITUTION_CONTEXT_MISSING',
  INSTITUTION_CONTEXT_INVALID = 'INSTITUTION_CONTEXT_INVALID',
  CROSS_INSTITUTIONAL_ACCESS = 'CROSS_INSTITUTIONAL_ACCESS',
  INSTITUTION_NOT_FOUND = 'INSTITUTION_NOT_FOUND',
  INSTITUTION_INACTIVE = 'INSTITUTION_INACTIVE',
  USER_NOT_IN_INSTITUTION = 'USER_NOT_IN_INSTITUTION',
  INSUFFICIENT_PRIVILEGES = 'INSUFFICIENT_PRIVILEGES',
  REGISTRATION_PENDING = 'REGISTRATION_PENDING',
  REGISTRATION_REJECTED = 'REGISTRATION_REJECTED',
  CONTEXT_SWITCHING_FAILED = 'CONTEXT_SWITCHING_FAILED',
  BRANDING_CONFIGURATION_ERROR = 'BRANDING_CONFIGURATION_ERROR',
  ENROLLMENT_BOUNDARY_VIOLATION = 'ENROLLMENT_BOUNDARY_VIOLATION',
  ADMIN_PRIVILEGE_VIOLATION = 'ADMIN_PRIVILEGE_VIOLATION',
  DATA_ISOLATION_VIOLATION = 'DATA_ISOLATION_VIOLATION',
  SESSION_CONTEXT_CORRUPTED = 'SESSION_CONTEXT_CORRUPTED'
}

/**
 * Multi-tenant error class with enhanced context information
 */
export class MultiTenantError extends Error {
  public readonly type: MultiTenantErrorType;
  public readonly statusCode: number;
  public readonly institutionId?: string;
  public readonly userId?: string;
  public readonly resourceType?: string;
  public readonly resourceId?: string;
  public readonly userFriendlyMessage: string;
  public readonly suggestedActions: string[];
  public readonly timestamp: Date;
  public readonly requestId?: string;

  constructor(
    type: MultiTenantErrorType,
    message: string,
    statusCode: number = 400,
    context?: {
      institutionId?: string;
      userId?: string;
      resourceType?: string;
      resourceId?: string;
      userFriendlyMessage?: string;
      suggestedActions?: string[];
      requestId?: string;
    }
  ) {
    super(message);
    this.name = 'MultiTenantError';
    this.type = type;
    this.statusCode = statusCode;
    this.institutionId = context?.institutionId;
    this.userId = context?.userId;
    this.resourceType = context?.resourceType;
    this.resourceId = context?.resourceId;
    this.userFriendlyMessage = context?.userFriendlyMessage || this.getDefaultUserMessage(type);
    this.suggestedActions = context?.suggestedActions || this.getDefaultSuggestedActions(type);
    this.timestamp = new Date();
    this.requestId = context?.requestId;

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, MultiTenantError);
    }
  }

  private getDefaultUserMessage(type: MultiTenantErrorType): string {
    const messages: Record<MultiTenantErrorType, string> = {
      [MultiTenantErrorType.INSTITUTION_CONTEXT_MISSING]: 
        'Please select an institution to continue.',
      [MultiTenantErrorType.INSTITUTION_CONTEXT_INVALID]: 
        'The selected institution is not valid or accessible.',
      [MultiTenantErrorType.CROSS_INSTITUTIONAL_ACCESS]: 
        'You cannot access resources from a different institution.',
      [MultiTenantErrorType.INSTITUTION_NOT_FOUND]: 
        'The requested institution could not be found.',
      [MultiTenantErrorType.INSTITUTION_INACTIVE]: 
        'This institution is currently unavailable.',
      [MultiTenantErrorType.USER_NOT_IN_INSTITUTION]: 
        'You do not have access to this institution.',
      [MultiTenantErrorType.INSUFFICIENT_PRIVILEGES]: 
        'You do not have sufficient privileges for this action.',
      [MultiTenantErrorType.REGISTRATION_PENDING]: 
        'Your registration is pending approval from an administrator.',
      [MultiTenantErrorType.REGISTRATION_REJECTED]: 
        'Your registration has been rejected.',
      [MultiTenantErrorType.CONTEXT_SWITCHING_FAILED]: 
        'Unable to switch to the requested institution.',
      [MultiTenantErrorType.BRANDING_CONFIGURATION_ERROR]: 
        'There was an error with the institution\'s branding configuration.',
      [MultiTenantErrorType.ENROLLMENT_BOUNDARY_VIOLATION]: 
        'You can only enroll in courses from your current institution.',
      [MultiTenantErrorType.ADMIN_PRIVILEGE_VIOLATION]: 
        'Administrative actions are restricted to your institution.',
      [MultiTenantErrorType.DATA_ISOLATION_VIOLATION]: 
        'Access to this data is restricted.',
      [MultiTenantErrorType.SESSION_CONTEXT_CORRUPTED]: 
        'Your session has become corrupted. Please log in again.'
    };
    return messages[type];
  }

  private getDefaultSuggestedActions(type: MultiTenantErrorType): string[] {
    const actions: Record<MultiTenantErrorType, string[]> = {
      [MultiTenantErrorType.INSTITUTION_CONTEXT_MISSING]: [
        'Select an institution from the available list',
        'Contact support if no institutions are available'
      ],
      [MultiTenantErrorType.INSTITUTION_CONTEXT_INVALID]: [
        'Select a different institution',
        'Contact your institution administrator'
      ],
      [MultiTenantErrorType.CROSS_INSTITUTIONAL_ACCESS]: [
        'Switch to the correct institution context',
        'Verify you have access to the requested resource'
      ],
      [MultiTenantErrorType.INSTITUTION_NOT_FOUND]: [
        'Verify the institution name or ID',
        'Contact system administrator'
      ],
      [MultiTenantErrorType.INSTITUTION_INACTIVE]: [
        'Contact your institution administrator',
        'Try again later'
      ],
      [MultiTenantErrorType.USER_NOT_IN_INSTITUTION]: [
        'Register for access to this institution',
        'Contact the institution administrator'
      ],
      [MultiTenantErrorType.INSUFFICIENT_PRIVILEGES]: [
        'Contact your institution administrator',
        'Verify your role and permissions'
      ],
      [MultiTenantErrorType.REGISTRATION_PENDING]: [
        'Wait for administrator approval',
        'Contact the institution administrator if urgent'
      ],
      [MultiTenantErrorType.REGISTRATION_REJECTED]: [
        'Contact the institution administrator for details',
        'Review and resubmit your registration if appropriate'
      ],
      [MultiTenantErrorType.CONTEXT_SWITCHING_FAILED]: [
        'Try logging out and logging back in',
        'Contact support if the problem persists'
      ],
      [MultiTenantErrorType.BRANDING_CONFIGURATION_ERROR]: [
        'Contact your institution administrator',
        'Try refreshing the page'
      ],
      [MultiTenantErrorType.ENROLLMENT_BOUNDARY_VIOLATION]: [
        'Switch to the correct institution context',
        'Verify the course belongs to your institution'
      ],
      [MultiTenantErrorType.ADMIN_PRIVILEGE_VIOLATION]: [
        'Verify you have administrative privileges',
        'Switch to the correct institution context'
      ],
      [MultiTenantErrorType.DATA_ISOLATION_VIOLATION]: [
        'Contact system administrator',
        'Verify your access permissions'
      ],
      [MultiTenantErrorType.SESSION_CONTEXT_CORRUPTED]: [
        'Log out and log back in',
        'Clear your browser cache and cookies'
      ]
    };
    return actions[type];
  }

  /**
   * Convert error to JSON response format
   */
  toJSON() {
    return {
      error: {
        type: this.type,
        message: this.message,
        userFriendlyMessage: this.userFriendlyMessage,
        suggestedActions: this.suggestedActions,
        timestamp: this.timestamp.toISOString(),
        requestId: this.requestId
      },
      context: {
        institutionId: this.institutionId,
        userId: this.userId,
        resourceType: this.resourceType,
        resourceId: this.resourceId
      }
    };
  }
}

/**
 * Multi-tenant error handler utility class
 */
export class MultiTenantErrorHandler {
  private static instance: MultiTenantErrorHandler;
  private errorLog: Array<{
    error: MultiTenantError;
    request: Partial<Request>;
    timestamp: Date;
  }> = [];

  private constructor() {}

  public static getInstance(): MultiTenantErrorHandler {
    if (!MultiTenantErrorHandler.instance) {
      MultiTenantErrorHandler.instance = new MultiTenantErrorHandler();
    }
    return MultiTenantErrorHandler.instance;
  }

  /**
   * Create a multi-tenant error with request context
   */
  public createError(
    type: MultiTenantErrorType,
    message: string,
    req?: Request,
    statusCode?: number,
    additionalContext?: any
  ): MultiTenantError {
    const authReq = req as AuthenticatedRequest;
    const requestId = this.generateRequestId();

    const context = {
      institutionId: authReq?.tenantContext?.institutionId?.toString(),
      userId: authReq?.user?._id?.toString(),
      requestId,
      ...additionalContext
    };

    const error = new MultiTenantError(type, message, statusCode, context);

    // Log the error
    this.logError(error, req);

    return error;
  }

  /**
   * Handle institutional context errors
   */
  public handleContextError(req: Request, res: Response, next: NextFunction): void {
    const authReq = req as AuthenticatedRequest;

    // Check for missing authentication
    if (!authReq.user) {
      const error = this.createError(
        MultiTenantErrorType.INSTITUTION_CONTEXT_MISSING,
        'Authentication required',
        req,
        401
      );
      res.status(error.statusCode).json(error.toJSON());
      return;
    }

    // Check for missing institutional context
    if (!authReq.tenantContext) {
      const availableInstitutions = authReq.user.institutions
        .filter(inst => inst.status === 'active')
        .map(inst => ({
          id: inst.institutionId,
          role: inst.role
        }));

      const error = this.createError(
        MultiTenantErrorType.INSTITUTION_CONTEXT_MISSING,
        'Institution context required',
        req,
        400,
        { availableInstitutions }
      );

      res.status(error.statusCode).json({
        ...error.toJSON(),
        availableInstitutions
      });
      return;
    }

    next();
  }

  /**
   * Handle cross-institutional access attempts
   */
  public handleCrossInstitutionalAccess(
    req: Request,
    resourceInstitutionId: string,
    resourceType: string,
    resourceId?: string
  ): MultiTenantError | null {
    const authReq = req as AuthenticatedRequest;
    const currentInstitutionId = authReq.tenantContext?.institutionId?.toString();

    if (currentInstitutionId !== resourceInstitutionId) {
      return this.createError(
        MultiTenantErrorType.CROSS_INSTITUTIONAL_ACCESS,
        `Cross-institutional access denied for ${resourceType}`,
        req,
        403,
        {
          resourceType,
          resourceId,
          resourceInstitutionId,
          currentInstitutionId
        }
      );
    }

    return null;
  }

  /**
   * Handle insufficient privileges
   */
  public handleInsufficientPrivileges(
    req: Request,
    requiredRole: string,
    action: string
  ): MultiTenantError {
    const authReq = req as AuthenticatedRequest;
    const currentRole = authReq.tenantContext?.userInstitution?.role;

    return this.createError(
      MultiTenantErrorType.INSUFFICIENT_PRIVILEGES,
      `Insufficient privileges: ${requiredRole} required for ${action}`,
      req,
      403,
      {
        requiredRole,
        currentRole,
        action
      }
    );
  }

  /**
   * Handle enrollment boundary violations
   */
  public handleEnrollmentBoundaryViolation(
    req: Request,
    courseId: string,
    courseInstitutionId: string
  ): MultiTenantError {
    return this.createError(
      MultiTenantErrorType.ENROLLMENT_BOUNDARY_VIOLATION,
      'Cannot enroll in course from different institution',
      req,
      403,
      {
        resourceType: 'course',
        resourceId: courseId,
        resourceInstitutionId: courseInstitutionId
      }
    );
  }

  /**
   * Handle session context corruption
   */
  public handleSessionCorruption(req: Request): MultiTenantError {
    return this.createError(
      MultiTenantErrorType.SESSION_CONTEXT_CORRUPTED,
      'Session context is corrupted',
      req,
      401
    );
  }

  /**
   * Express error handling middleware
   */
  public errorMiddleware = (
    error: Error,
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    // Handle MultiTenantError instances
    if (error instanceof MultiTenantError) {
      this.logError(error, req);
      res.status(error.statusCode).json(error.toJSON());
      return;
    }

    // Handle standard errors with multi-tenant context
    const authReq = req as AuthenticatedRequest;
    const institutionId = authReq.tenantContext?.institutionId?.toString();
    const userId = authReq.user?._id?.toString();

    // Log the error with context
    console.error('🚨 Multi-tenant system error:', {
      message: error.message,
      stack: error.stack,
      institutionId,
      userId,
      url: req.url,
      method: req.method,
      timestamp: new Date().toISOString()
    });

    // Determine error type based on message content
    let multiTenantError: MultiTenantError;

    if (error.message.includes('Institution not found')) {
      multiTenantError = this.createError(
        MultiTenantErrorType.INSTITUTION_NOT_FOUND,
        error.message,
        req,
        404
      );
    } else if (error.message.includes('not active') || error.message.includes('inactive')) {
      multiTenantError = this.createError(
        MultiTenantErrorType.INSTITUTION_INACTIVE,
        error.message,
        req,
        403
      );
    } else if (error.message.includes('access') && error.message.includes('institution')) {
      multiTenantError = this.createError(
        MultiTenantErrorType.USER_NOT_IN_INSTITUTION,
        error.message,
        req,
        403
      );
    } else if (error.message.includes('privileges') || error.message.includes('admin')) {
      multiTenantError = this.createError(
        MultiTenantErrorType.INSUFFICIENT_PRIVILEGES,
        error.message,
        req,
        403
      );
    } else {
      // Generic error with multi-tenant context
      multiTenantError = this.createError(
        MultiTenantErrorType.DATA_ISOLATION_VIOLATION,
        'An error occurred while processing your request',
        req,
        500
      );
    }

    res.status(multiTenantError.statusCode).json(multiTenantError.toJSON());
  };

  /**
   * Log error with institutional context
   */
  private logError(error: MultiTenantError, req?: Request): void {
    const logEntry = {
      error,
      request: req ? {
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: req.body,
        params: req.params,
        query: req.query
      } : {},
      timestamp: new Date()
    };

    this.errorLog.push(logEntry);

    // Keep only last 1000 errors in memory
    if (this.errorLog.length > 1000) {
      this.errorLog = this.errorLog.slice(-1000);
    }

    // Console logging with structured format
    console.error('🚨 MULTI-TENANT ERROR:', {
      type: error.type,
      message: error.message,
      institutionId: error.institutionId,
      userId: error.userId,
      resourceType: error.resourceType,
      resourceId: error.resourceId,
      statusCode: error.statusCode,
      timestamp: error.timestamp.toISOString(),
      requestId: error.requestId,
      url: req?.url,
      method: req?.method
    });
  }

  /**
   * Get error statistics for monitoring
   */
  public getErrorStatistics(institutionId?: string, hours: number = 24): {
    total: number;
    byType: Record<string, number>;
    byStatusCode: Record<string, number>;
    recentErrors: Array<any>;
  } {
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    let filteredErrors = this.errorLog.filter(entry => 
      entry.timestamp >= cutoffTime &&
      (!institutionId || entry.error.institutionId === institutionId)
    );

    const byType: Record<string, number> = {};
    const byStatusCode: Record<string, number> = {};

    filteredErrors.forEach(entry => {
      byType[entry.error.type] = (byType[entry.error.type] || 0) + 1;
      byStatusCode[entry.error.statusCode.toString()] = 
        (byStatusCode[entry.error.statusCode.toString()] || 0) + 1;
    });

    return {
      total: filteredErrors.length,
      byType,
      byStatusCode,
      recentErrors: filteredErrors.slice(-10).map(entry => ({
        type: entry.error.type,
        message: entry.error.userFriendlyMessage,
        timestamp: entry.error.timestamp,
        institutionId: entry.error.institutionId,
        userId: entry.error.userId
      }))
    };
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Clear error log (for testing or maintenance)
   */
  public clearErrorLog(): void {
    this.errorLog = [];
  }
}

/**
 * Factory functions for common multi-tenant errors
 */
export const MultiTenantErrors = {
  institutionContextMissing: (req?: Request) => 
    MultiTenantErrorHandler.getInstance().createError(
      MultiTenantErrorType.INSTITUTION_CONTEXT_MISSING,
      'Institution context is required',
      req,
      400
    ),

  institutionNotFound: (institutionId: string, req?: Request) =>
    MultiTenantErrorHandler.getInstance().createError(
      MultiTenantErrorType.INSTITUTION_NOT_FOUND,
      `Institution ${institutionId} not found`,
      req,
      404,
      { resourceId: institutionId, resourceType: 'institution' }
    ),

  crossInstitutionalAccess: (resourceType: string, resourceId: string, req?: Request) =>
    MultiTenantErrorHandler.getInstance().createError(
      MultiTenantErrorType.CROSS_INSTITUTIONAL_ACCESS,
      `Cross-institutional access denied for ${resourceType} ${resourceId}`,
      req,
      403,
      { resourceType, resourceId }
    ),

  insufficientPrivileges: (requiredRole: string, action: string, req?: Request) =>
    MultiTenantErrorHandler.getInstance().createError(
      MultiTenantErrorType.INSUFFICIENT_PRIVILEGES,
      `${requiredRole} privileges required for ${action}`,
      req,
      403,
      { requiredRole, action }
    ),

  enrollmentBoundaryViolation: (courseId: string, req?: Request) =>
    MultiTenantErrorHandler.getInstance().createError(
      MultiTenantErrorType.ENROLLMENT_BOUNDARY_VIOLATION,
      'Cannot enroll in course from different institution',
      req,
      403,
      { resourceType: 'course', resourceId: courseId }
    )
};

export default MultiTenantErrorHandler;