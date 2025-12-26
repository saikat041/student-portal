import { Request, Response, NextFunction } from 'express';
import { TenantContextManager, AuthenticatedRequest } from '../services/TenantContextManager';
import { SessionManager } from '../services/SessionManager';
import { AccessValidator } from '../services/AccessValidator';
import MultiTenantErrorHandler, { MultiTenantErrorType } from '../utils/MultiTenantErrorHandler';
import MultiTenantMonitor, { OperationType } from '../utils/MultiTenantMonitor';

const tenantManager = TenantContextManager.getInstance();
const sessionManager = SessionManager.getInstance();
const accessValidator = AccessValidator.getInstance();
const errorHandler = MultiTenantErrorHandler.getInstance();
const monitor = MultiTenantMonitor.getInstance();

/**
 * Middleware to establish institutional context
 * Requires authentication middleware to be applied first
 * Requirement 7.5: Validate institutional context for all operations
 */
export const establishInstitutionalContext = async (
  req: Request, 
  res: Response, 
  next: NextFunction
): Promise<void> => {
  const operationId = `establish_context_${Date.now()}`;
  monitor.startTimer(operationId);

  try {
    const authReq = req as AuthenticatedRequest;
    
    if (!authReq.user) {
      const error = errorHandler.createError(
        MultiTenantErrorType.INSTITUTION_CONTEXT_MISSING,
        'Authentication required',
        req,
        401
      );

      monitor.endTimer(
        operationId,
        OperationType.DATA_ACCESS,
        'Establish institutional context - authentication check',
        'failure',
        req
      );

      res.status(error.statusCode).json(error.toJSON());
      return;
    }

    // Get institution ID from various sources
    const institutionId = req.headers['x-institution-id'] as string ||
                        req.query.institutionId as string ||
                        req.body.institutionId as string;

    if (!institutionId) {
      const availableInstitutions = authReq.user.institutions
        .filter(inst => inst.status === 'active')
        .map(inst => ({
          id: inst.institutionId,
          role: inst.role
        }));

      const error = errorHandler.createError(
        MultiTenantErrorType.INSTITUTION_CONTEXT_MISSING,
        'Institution context required',
        req,
        400,
        { availableInstitutions }
      );

      monitor.endTimer(
        operationId,
        OperationType.DATA_ACCESS,
        'Establish institutional context - institution ID missing',
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

    // Validate cross-institutional access using AccessValidator
    const accessValidation = await accessValidator.validateCrossInstitutionalAccess(
      authReq.user,
      institutionId,
      'access_context',
      'institution',
      institutionId,
      req
    );

    if (!accessValidation.allowed) {
      const error = errorHandler.createError(
        MultiTenantErrorType.CROSS_INSTITUTIONAL_ACCESS,
        accessValidation.reason,
        req,
        403
      );

      monitor.logCrossInstitutionalAccess(
        authReq.user._id.toString(),
        authReq.user.institutions.find(inst => inst.status === 'active')?.institutionId.toString() || 'unknown',
        institutionId,
        'institution_context',
        institutionId,
        true,
        req
      );

      monitor.endTimer(
        operationId,
        OperationType.CROSS_INSTITUTIONAL_ACCESS_ATTEMPT,
        'Establish institutional context - access denied',
        'warning',
        req,
        { reason: accessValidation.reason }
      );

      res.status(error.statusCode).json(error.toJSON());
      return;
    }

    // Set institutional context
    const context = await tenantManager.setInstitutionContext(
      institutionId, 
      authReq.user._id.toString()
    );

    // Attach context to request
    authReq.tenantContext = context;
    authReq.dbFilter = { institutionId: context.institutionId };

    // Update session with institutional context
    const sessionId = authReq.user._id.toString();
    sessionManager.setInstitutionalContext(sessionId, institutionId, context);

    monitor.endTimer(
      operationId,
      OperationType.CONTEXT_SWITCH,
      'Establish institutional context',
      'success',
      req,
      { institutionId }
    );

    next();
  } catch (error) {
    monitor.endTimer(
      operationId,
      OperationType.DATA_ACCESS,
      'Establish institutional context',
      'failure',
      req,
      { error: (error as Error).message }
    );

    const multiTenantError = errorHandler.createError(
      MultiTenantErrorType.INSTITUTION_CONTEXT_INVALID,
      'Failed to establish institutional context',
      req,
      500
    );

    res.status(multiTenantError.statusCode).json(multiTenantError.toJSON());
  }
};

/**
 * Middleware to enforce institutional filtering on database queries
 */
export const enforceInstitutionalFiltering = (
  req: Request, 
  res: Response, 
  next: NextFunction
): void => {
  const authReq = req as AuthenticatedRequest;
  
  if (!authReq.tenantContext) {
    res.status(400).json({ error: 'Institutional context not established' });
    return;
  }

  // Ensure database filter is set
  authReq.dbFilter = { institutionId: authReq.tenantContext.institutionId };
  
  next();
};

/**
 * Middleware to validate resource access within institutional boundaries
 */
export const validateResourceAccess = (resourceType: string, action: string = 'read') => {
  return accessValidator.requireInstitutionalAccess(resourceType, action);
};

/**
 * Middleware to switch institutional context
 */
export const switchInstitutionalContext = async (
  req: Request, 
  res: Response, 
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { newInstitutionId } = req.body;

    if (!authReq.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!newInstitutionId) {
      res.status(400).json({ error: 'New institution ID required' });
      return;
    }

    // Validate access to new institution
    const accessValidation = await accessValidator.validateCrossInstitutionalAccess(
      authReq.user,
      newInstitutionId,
      'switch_context',
      'institution',
      newInstitutionId,
      req
    );

    if (!accessValidation.allowed) {
      res.status(403).json({ 
        error: 'Access denied',
        message: accessValidation.reason
      });
      return;
    }

    // Clear existing context and set new one
    const newContext = await tenantManager.switchInstitutionalContext(
      authReq.user._id.toString(),
      newInstitutionId
    );

    // Update session
    const sessionId = authReq.user._id.toString();
    sessionManager.switchInstitutionalContext(sessionId, newInstitutionId);

    // Attach new context to request
    authReq.tenantContext = newContext;
    authReq.dbFilter = { institutionId: newContext.institutionId };

    next();
  } catch (error) {
    console.error('Error switching institutional context:', error);
    res.status(500).json({ 
      error: 'Failed to switch institutional context',
      message: (error as Error).message
    });
  }
};

/**
 * Middleware to get user's available institutions
 */
export const getUserInstitutions = async (
  req: Request, 
  res: Response
): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    
    if (!authReq.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const institutions = await tenantManager.getUserInstitutions(
      authReq.user._id.toString()
    );

    res.json({
      institutions: institutions.map(inst => ({
        id: inst.institutionId,
        role: inst.role,
        status: inst.status,
        createdAt: inst.createdAt,
        approvedAt: inst.approvedAt
      }))
    });
  } catch (error) {
    console.error('Error getting user institutions:', error);
    res.status(500).json({ 
      error: 'Failed to get user institutions',
      message: (error as Error).message
    });
  }
};

/**
 * Middleware to get security audit logs (admin only)
 */
export const getSecurityAuditLogs = async (
  req: Request, 
  res: Response
): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    
    if (!authReq.user || !authReq.tenantContext) {
      res.status(401).json({ error: 'Authentication and institutional context required' });
      return;
    }

    // Check if user is institution admin
    if (authReq.tenantContext.userInstitution.role !== 'institution_admin') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const { limit = 100, alertsOnly = false, crossInstitutional = false, hours = 24 } = req.query;
    const institutionId = authReq.tenantContext.institutionId.toString();

    let logs;
    if (alertsOnly === 'true') {
      logs = accessValidator.getSecurityAlerts(institutionId, Number(limit));
    } else if (crossInstitutional === 'true') {
      logs = accessValidator.getCrossInstitutionalAttempts(institutionId, Number(limit));
    } else {
      logs = accessValidator.getAuditLogs(institutionId, Number(limit));
    }

    // Also get summary statistics
    const summary = accessValidator.getAuditSummary(institutionId, Number(hours));

    res.json({ 
      logs,
      summary,
      metadata: {
        institutionId,
        requestedBy: authReq.user._id.toString(),
        timestamp: new Date().toISOString(),
        filters: {
          limit: Number(limit),
          alertsOnly: alertsOnly === 'true',
          crossInstitutional: crossInstitutional === 'true',
          hours: Number(hours)
        }
      }
    });
  } catch (error) {
    console.error('Error getting security audit logs:', error);
    res.status(500).json({ 
      error: 'Failed to get security audit logs',
      message: (error as Error).message
    });
  }
};

/**
 * Middleware to require institution admin privileges
 * Requirements: 15.2, 17.4, 18.5
 */
export const requireInstitutionAdmin = (
  req: Request, 
  res: Response, 
  next: NextFunction
): void => {
  const authReq = req as AuthenticatedRequest;
  
  if (!authReq.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  if (!authReq.tenantContext) {
    res.status(400).json({ error: 'Institutional context required' });
    return;
  }

  // Check if user has institution admin role in current context
  if (authReq.tenantContext.userInstitution.role !== 'institution_admin') {
    res.status(403).json({ 
      error: 'Institution administrator privileges required',
      message: 'This action requires institution administrator access',
      currentRole: authReq.tenantContext.userInstitution.role
    });
    return;
  }

  // Check if user's admin status is active
  if (authReq.tenantContext.userInstitution.status !== 'active') {
    res.status(403).json({ 
      error: 'Active institution administrator status required',
      message: 'Your administrator account is not active',
      currentStatus: authReq.tenantContext.userInstitution.status
    });
    return;
  }

  next();
};

/**
 * Middleware to validate API requests with comprehensive logging
 * Requirement 7.5: Validate institutional context for all operations
 */
export const validateAPIRequest = (resourceType?: string, action?: string) => {
  return accessValidator.requireAPIContextValidation(resourceType, action);
};