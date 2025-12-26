import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../services/TenantContextManager';
import MultiTenantErrorHandler, { MultiTenantError, MultiTenantErrorType } from '../utils/MultiTenantErrorHandler';
import MultiTenantMonitor, { OperationType } from '../utils/MultiTenantMonitor';

const errorHandler = MultiTenantErrorHandler.getInstance();
const monitor = MultiTenantMonitor.getInstance();

/**
 * Enhanced error handling middleware with monitoring integration
 */
export const enhancedErrorMiddleware = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const authReq = req as AuthenticatedRequest;
  const operationId = `error_${Date.now()}`;
  
  // Start monitoring the error handling
  monitor.startTimer(operationId);

  try {
    // Use the MultiTenantErrorHandler to process the error
    errorHandler.errorMiddleware(error, req, res, next);
    
    // Log the error handling completion
    monitor.endTimer(
      operationId,
      OperationType.DATA_ACCESS,
      'Error handling',
      'success',
      req,
      {
        originalError: error.message,
        errorType: error instanceof MultiTenantError ? error.type : 'UNKNOWN'
      }
    );
  } catch (handlingError) {
    // If error handling itself fails, log and provide fallback
    console.error('Error in error handling middleware:', handlingError);
    
    monitor.endTimer(
      operationId,
      OperationType.DATA_ACCESS,
      'Error handling',
      'failure',
      req,
      {
        originalError: error.message,
        handlingError: (handlingError as Error).message
      }
    );

    // Fallback error response
    res.status(500).json({
      error: {
        type: 'SYSTEM_ERROR',
        message: 'An unexpected error occurred',
        userFriendlyMessage: 'We\'re experiencing technical difficulties. Please try again later.',
        suggestedActions: [
          'Try refreshing the page',
          'Contact support if the problem persists'
        ],
        timestamp: new Date().toISOString()
      }
    });
  }
};

/**
 * Middleware to validate institutional context with enhanced error handling
 */
export const validateInstitutionalContextEnhanced = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const authReq = req as AuthenticatedRequest;
  const operationId = `context_validation_${Date.now()}`;
  
  monitor.startTimer(operationId);

  try {
    // Check authentication
    if (!authReq.user) {
      const error = errorHandler.createError(
        MultiTenantErrorType.INSTITUTION_CONTEXT_MISSING,
        'Authentication required for institutional context',
        req,
        401
      );
      
      monitor.endTimer(
        operationId,
        OperationType.DATA_ACCESS,
        'Context validation - authentication check',
        'failure',
        req
      );
      
      res.status(error.statusCode).json(error.toJSON());
      return;
    }

    // Check institutional context
    if (!authReq.tenantContext) {
      const availableInstitutions = authReq.user.institutions
        .filter(inst => inst.status === 'active')
        .map(inst => ({
          id: inst.institutionId,
          role: inst.role,
          status: inst.status
        }));

      const error = errorHandler.createError(
        MultiTenantErrorType.INSTITUTION_CONTEXT_MISSING,
        'Institutional context required',
        req,
        400,
        { availableInstitutions }
      );

      monitor.endTimer(
        operationId,
        OperationType.DATA_ACCESS,
        'Context validation - institutional context check',
        'failure',
        req,
        { availableInstitutionsCount: availableInstitutions.length }
      );

      res.status(error.statusCode).json({
        ...error.toJSON(),
        availableInstitutions
      });
      return;
    }

    // Validate institution is active
    if (authReq.tenantContext.institution.status !== 'active') {
      const error = errorHandler.createError(
        MultiTenantErrorType.INSTITUTION_INACTIVE,
        'Current institution is not active',
        req,
        403
      );

      monitor.endTimer(
        operationId,
        OperationType.DATA_ACCESS,
        'Context validation - institution status check',
        'failure',
        req,
        { institutionStatus: authReq.tenantContext.institution.status }
      );

      res.status(error.statusCode).json(error.toJSON());
      return;
    }

    // Validate user's institutional profile is active
    if (authReq.tenantContext.userInstitution.status !== 'active') {
      const error = errorHandler.createError(
        MultiTenantErrorType.USER_NOT_IN_INSTITUTION,
        'User profile is not active in current institution',
        req,
        403
      );

      monitor.endTimer(
        operationId,
        OperationType.DATA_ACCESS,
        'Context validation - user profile status check',
        'failure',
        req,
        { userProfileStatus: authReq.tenantContext.userInstitution.status }
      );

      res.status(error.statusCode).json(error.toJSON());
      return;
    }

    // Context validation successful
    monitor.endTimer(
      operationId,
      OperationType.DATA_ACCESS,
      'Context validation',
      'success',
      req
    );

    next();
  } catch (error) {
    monitor.endTimer(
      operationId,
      OperationType.DATA_ACCESS,
      'Context validation',
      'failure',
      req,
      { error: (error as Error).message }
    );

    next(error);
  }
};

/**
 * Middleware to validate cross-institutional access with enhanced monitoring
 */
export const validateCrossInstitutionalAccess = (
  resourceType: string,
  getResourceInstitutionId: (req: Request) => string | Promise<string>
) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authReq = req as AuthenticatedRequest;
    const operationId = `cross_institutional_check_${Date.now()}`;
    
    monitor.startTimer(operationId);

    try {
      const currentInstitutionId = authReq.tenantContext?.institutionId?.toString();
      if (!currentInstitutionId) {
        const error = errorHandler.createError(
          MultiTenantErrorType.INSTITUTION_CONTEXT_MISSING,
          'Institutional context required for access validation',
          req,
          400
        );

        monitor.endTimer(
          operationId,
          OperationType.CROSS_INSTITUTIONAL_ACCESS_ATTEMPT,
          `Cross-institutional access check for ${resourceType}`,
          'failure',
          req
        );

        res.status(error.statusCode).json(error.toJSON());
        return;
      }

      const resourceInstitutionId = await getResourceInstitutionId(req);
      
      if (currentInstitutionId !== resourceInstitutionId) {
        // Log the cross-institutional access attempt
        monitor.logCrossInstitutionalAccess(
          authReq.user?._id?.toString() || 'unknown',
          currentInstitutionId,
          resourceInstitutionId,
          resourceType,
          req.params.id || 'unknown',
          true, // blocked
          req
        );

        const error = errorHandler.handleCrossInstitutionalAccess(
          req,
          resourceInstitutionId,
          resourceType,
          req.params.id
        );

        if (error) {
          monitor.endTimer(
            operationId,
            OperationType.CROSS_INSTITUTIONAL_ACCESS_ATTEMPT,
            `Cross-institutional access blocked for ${resourceType}`,
            'warning',
            req,
            {
              currentInstitutionId,
              resourceInstitutionId,
              resourceType
            }
          );

          res.status(error.statusCode).json(error.toJSON());
          return;
        }
      }

      // Access validation successful
      monitor.endTimer(
        operationId,
        OperationType.DATA_ACCESS,
        `Cross-institutional access validation for ${resourceType}`,
        'success',
        req
      );

      next();
    } catch (error) {
      monitor.endTimer(
        operationId,
        OperationType.CROSS_INSTITUTIONAL_ACCESS_ATTEMPT,
        `Cross-institutional access validation error for ${resourceType}`,
        'failure',
        req,
        { error: (error as Error).message }
      );

      next(error);
    }
  };
};

/**
 * Middleware to validate administrative privileges with enhanced monitoring
 */
export const validateAdminPrivileges = (
  requiredLevel: 'institution_admin' | 'system_admin' = 'institution_admin',
  action?: string
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authReq = req as AuthenticatedRequest;
    const operationId = `admin_privilege_check_${Date.now()}`;
    
    monitor.startTimer(operationId);

    try {
      if (!authReq.user) {
        const error = errorHandler.createError(
          MultiTenantErrorType.INSUFFICIENT_PRIVILEGES,
          'Authentication required for administrative action',
          req,
          401
        );

        monitor.endTimer(
          operationId,
          OperationType.ADMIN_PRIVILEGE_ASSIGNMENT,
          `Admin privilege check - authentication`,
          'failure',
          req
        );

        res.status(error.statusCode).json(error.toJSON());
        return;
      }

      if (!authReq.tenantContext && requiredLevel === 'institution_admin') {
        const error = errorHandler.createError(
          MultiTenantErrorType.INSTITUTION_CONTEXT_MISSING,
          'Institutional context required for administrative action',
          req,
          400
        );

        monitor.endTimer(
          operationId,
          OperationType.ADMIN_PRIVILEGE_ASSIGNMENT,
          `Admin privilege check - context`,
          'failure',
          req
        );

        res.status(error.statusCode).json(error.toJSON());
        return;
      }

      // Check institution admin privileges
      if (requiredLevel === 'institution_admin') {
        const userRole = authReq.tenantContext?.userInstitution?.role;
        const userStatus = authReq.tenantContext?.userInstitution?.status;

        if (userRole !== 'institution_admin' || userStatus !== 'active') {
          const error = errorHandler.handleInsufficientPrivileges(
            req,
            'institution_admin',
            action || 'administrative action'
          );

          monitor.endTimer(
            operationId,
            OperationType.ADMIN_PRIVILEGE_ASSIGNMENT,
            `Admin privilege check - insufficient privileges`,
            'failure',
            req,
            {
              requiredLevel,
              currentRole: userRole,
              currentStatus: userStatus,
              action
            }
          );

          res.status(error.statusCode).json(error.toJSON());
          return;
        }
      }

      // TODO: Add system admin check when implemented
      if (requiredLevel === 'system_admin') {
        // For now, treat as institution admin
        // This should be enhanced when system admin roles are implemented
      }

      // Privilege validation successful
      monitor.endTimer(
        operationId,
        OperationType.ADMIN_PRIVILEGE_ASSIGNMENT,
        `Admin privilege validation for ${action || 'action'}`,
        'success',
        req,
        { requiredLevel, action }
      );

      next();
    } catch (error) {
      monitor.endTimer(
        operationId,
        OperationType.ADMIN_PRIVILEGE_ASSIGNMENT,
        `Admin privilege validation error`,
        'failure',
        req,
        { error: (error as Error).message }
      );

      next(error);
    }
  };
};

/**
 * Middleware to monitor performance and detect slow operations
 */
export const performanceMonitoring = (
  operationType: OperationType,
  operationName: string,
  thresholdMs: number = 5000
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const operationId = `perf_${operationType}_${Date.now()}`;
    
    monitor.startTimer(operationId);

    // Override res.end to capture response time
    const originalEnd = res.end;
    res.end = function(chunk?: any, encoding?: any) {
      const duration = monitor.endTimer(
        operationId,
        operationType,
        operationName,
        res.statusCode >= 400 ? 'failure' : 'success',
        req
      );

      // Call original end method
      originalEnd.call(this, chunk, encoding);
    };

    next();
  };
};

/**
 * Middleware to log user operations with context
 */
export const logUserOperation = (
  operationType: OperationType,
  getOperationName: (req: Request) => string
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authReq = req as AuthenticatedRequest;
    
    // Log the operation start
    const operationName = getOperationName(req);
    
    monitor.logOperation(
      operationType,
      operationName,
      'success', // Will be updated if error occurs
      req,
      {
        method: req.method,
        url: req.url,
        params: req.params,
        query: req.query
      }
    );

    next();
  };
};

/**
 * Middleware to handle session corruption detection
 */
export const detectSessionCorruption = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const authReq = req as AuthenticatedRequest;

  try {
    // Check for session corruption indicators
    if (authReq.user && authReq.tenantContext) {
      const userInstitutionIds = authReq.user.institutions
        .filter(inst => inst.status === 'active')
        .map(inst => inst.institutionId.toString());
      
      const currentInstitutionId = authReq.tenantContext.institutionId.toString();
      
      // Check if current institution is in user's active institutions
      if (!userInstitutionIds.includes(currentInstitutionId)) {
        const error = errorHandler.handleSessionCorruption(req);
        
        monitor.logOperation(
          OperationType.SESSION_CORRUPTION,
          'Session corruption detected - invalid institution context',
          'failure',
          req,
          {
            currentInstitutionId,
            userInstitutionIds
          }
        );

        res.status(error.statusCode).json(error.toJSON());
        return;
      }

      // Check if user's role in context matches database
      const userInstitution = authReq.user.institutions.find(
        inst => inst.institutionId.toString() === currentInstitutionId
      );
      
      if (userInstitution && userInstitution.role !== authReq.tenantContext.userInstitution.role) {
        const error = errorHandler.handleSessionCorruption(req);
        
        monitor.logOperation(
          OperationType.SESSION_CORRUPTION,
          'Session corruption detected - role mismatch',
          'failure',
          req,
          {
            sessionRole: authReq.tenantContext.userInstitution.role,
            databaseRole: userInstitution.role
          }
        );

        res.status(error.statusCode).json(error.toJSON());
        return;
      }
    }

    next();
  } catch (error) {
    monitor.logOperation(
      OperationType.SESSION_CORRUPTION,
      'Session corruption check failed',
      'failure',
      req,
      { error: (error as Error).message }
    );

    next(error);
  }
};

/**
 * Middleware to provide monitoring dashboard data (admin only)
 */
export const getMonitoringDashboard = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { hours = 24 } = req.query;
    
    if (!authReq.tenantContext || authReq.tenantContext.userInstitution.role !== 'institution_admin') {
      const error = errorHandler.handleInsufficientPrivileges(
        req,
        'institution_admin',
        'view monitoring dashboard'
      );
      res.status(error.statusCode).json(error.toJSON());
      return;
    }

    const institutionId = authReq.tenantContext.institutionId.toString();
    
    // Get monitoring statistics
    const stats = monitor.getStatistics(institutionId, Number(hours));
    const performanceMetrics = monitor.getPerformanceMetrics(institutionId, Number(hours));
    const securityAlerts = monitor.getSecurityAlerts(institutionId, false); // Unresolved alerts
    const errorStats = errorHandler.getErrorStatistics(institutionId, Number(hours));

    res.json({
      institutionId,
      timeframe: `${hours} hours`,
      monitoring: stats,
      performance: performanceMetrics,
      security: {
        alerts: securityAlerts,
        alertCount: securityAlerts.length
      },
      errors: errorStats,
      summary: {
        totalEvents: stats.totalEvents,
        errorRate: errorStats.total > 0 ? (errorStats.total / stats.totalEvents * 100).toFixed(2) + '%' : '0%',
        securityAlerts: securityAlerts.length,
        performanceIssues: stats.performanceIssues
      }
    });
  } catch (error) {
    console.error('Error getting monitoring dashboard:', error);
    res.status(500).json({
      error: 'Failed to retrieve monitoring dashboard',
      message: (error as Error).message
    });
  }
};

export {
  MultiTenantErrorHandler,
  MultiTenantMonitor,
  MultiTenantError,
  MultiTenantErrorType,
  OperationType
};