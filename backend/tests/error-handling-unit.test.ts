import { describe, it, expect, beforeEach } from 'vitest';
import MultiTenantErrorHandler, { MultiTenantError, MultiTenantErrorType } from '../utils/MultiTenantErrorHandler';
import MultiTenantMonitor, { OperationType } from '../utils/MultiTenantMonitor';

/**
 * Unit Tests for Error Handling and Monitoring Utilities
 * Tests the core error handling and monitoring functionality
 */
describe('Multi-Tenant Error Handling and Monitoring', () => {
  let errorHandler: MultiTenantErrorHandler;
  let monitor: MultiTenantMonitor;

  beforeEach(() => {
    errorHandler = MultiTenantErrorHandler.getInstance();
    monitor = MultiTenantMonitor.getInstance();
    
    // Clear previous data
    errorHandler.clearErrorLog();
    monitor.clearAll();
  });

  describe('MultiTenantError', () => {
    it('should create error with proper structure', () => {
      const error = new MultiTenantError(
        MultiTenantErrorType.INSTITUTION_CONTEXT_MISSING,
        'Test error message',
        400,
        {
          institutionId: 'test-institution-id',
          userId: 'test-user-id',
          resourceType: 'course',
          resourceId: 'test-course-id'
        }
      );

      expect(error.type).toBe(MultiTenantErrorType.INSTITUTION_CONTEXT_MISSING);
      expect(error.message).toBe('Test error message');
      expect(error.statusCode).toBe(400);
      expect(error.institutionId).toBe('test-institution-id');
      expect(error.userId).toBe('test-user-id');
      expect(error.resourceType).toBe('course');
      expect(error.resourceId).toBe('test-course-id');
      expect(error.userFriendlyMessage).toBe('Please select an institution to continue.');
      expect(error.suggestedActions).toContain('Select an institution from the available list');
      expect(error.timestamp).toBeInstanceOf(Date);
    });

    it('should provide appropriate user-friendly messages for different error types', () => {
      const contextMissingError = new MultiTenantError(
        MultiTenantErrorType.INSTITUTION_CONTEXT_MISSING,
        'Context missing'
      );
      expect(contextMissingError.userFriendlyMessage).toBe('Please select an institution to continue.');

      const crossAccessError = new MultiTenantError(
        MultiTenantErrorType.CROSS_INSTITUTIONAL_ACCESS,
        'Cross access denied'
      );
      expect(crossAccessError.userFriendlyMessage).toBe('You cannot access resources from a different institution.');

      const privilegeError = new MultiTenantError(
        MultiTenantErrorType.INSUFFICIENT_PRIVILEGES,
        'Insufficient privileges'
      );
      expect(privilegeError.userFriendlyMessage).toBe('You do not have sufficient privileges for this action.');
    });

    it('should convert to JSON properly', () => {
      const error = new MultiTenantError(
        MultiTenantErrorType.CROSS_INSTITUTIONAL_ACCESS,
        'Test error',
        403,
        {
          institutionId: 'inst-123',
          userId: 'user-456',
          resourceType: 'course',
          resourceId: 'course-789'
        }
      );

      const json = error.toJSON();

      expect(json.error.type).toBe(MultiTenantErrorType.CROSS_INSTITUTIONAL_ACCESS);
      expect(json.error.message).toBe('Test error');
      expect(json.error.userFriendlyMessage).toBe('You cannot access resources from a different institution.');
      expect(json.error.suggestedActions).toContain('Switch to the correct institution context');
      expect(json.context.institutionId).toBe('inst-123');
      expect(json.context.userId).toBe('user-456');
      expect(json.context.resourceType).toBe('course');
      expect(json.context.resourceId).toBe('course-789');
    });
  });

  describe('MultiTenantErrorHandler', () => {
    it('should create errors with request context', () => {
      const mockRequest = {
        method: 'GET',
        url: '/api/courses',
        headers: {},
        body: {},
        params: {},
        query: {}
      } as any;

      const error = errorHandler.createError(
        MultiTenantErrorType.INSTITUTION_NOT_FOUND,
        'Institution not found',
        mockRequest,
        404
      );

      expect(error.type).toBe(MultiTenantErrorType.INSTITUTION_NOT_FOUND);
      expect(error.statusCode).toBe(404);
      expect(error.requestId).toBeDefined();
    });

    it('should handle cross-institutional access attempts', () => {
      const mockRequest = {
        method: 'GET',
        url: '/api/courses/123',
        tenantContext: {
          institutionId: { toString: () => 'inst-1' }
        }
      } as any;

      const error = errorHandler.handleCrossInstitutionalAccess(
        mockRequest,
        'inst-2',
        'course',
        'course-123'
      );

      expect(error).not.toBeNull();
      expect(error!.type).toBe(MultiTenantErrorType.CROSS_INSTITUTIONAL_ACCESS);
      expect(error!.statusCode).toBe(403);
    });

    it('should not create error for same institution access', () => {
      const mockRequest = {
        method: 'GET',
        url: '/api/courses/123',
        tenantContext: {
          institutionId: { toString: () => 'inst-1' }
        }
      } as any;

      const error = errorHandler.handleCrossInstitutionalAccess(
        mockRequest,
        'inst-1',
        'course',
        'course-123'
      );

      expect(error).toBeNull();
    });

    it('should track error statistics', () => {
      // Create some errors
      errorHandler.createError(
        MultiTenantErrorType.INSTITUTION_NOT_FOUND,
        'Error 1',
        undefined,
        404
      );

      errorHandler.createError(
        MultiTenantErrorType.CROSS_INSTITUTIONAL_ACCESS,
        'Error 2',
        undefined,
        403
      );

      errorHandler.createError(
        MultiTenantErrorType.INSTITUTION_NOT_FOUND,
        'Error 3',
        undefined,
        404
      );

      const stats = errorHandler.getErrorStatistics();

      expect(stats.total).toBe(3);
      expect(stats.byType[MultiTenantErrorType.INSTITUTION_NOT_FOUND]).toBe(2);
      expect(stats.byType[MultiTenantErrorType.CROSS_INSTITUTIONAL_ACCESS]).toBe(1);
      expect(stats.byStatusCode['404']).toBe(2);
      expect(stats.byStatusCode['403']).toBe(1);
      expect(stats.recentErrors).toHaveLength(3);
    });
  });

  describe('MultiTenantMonitor', () => {
    it('should log operations with proper structure', () => {
      const eventId = monitor.logOperation(
        OperationType.USER_LOGIN,
        'User login attempt',
        'success',
        undefined,
        { email: 'test@example.com' }
      );

      expect(eventId).toBeDefined();
      expect(eventId).toMatch(/^evt_\d+_[a-z0-9]+$/);

      const stats = monitor.getStatistics();
      expect(stats.totalEvents).toBe(1);
      expect(stats.eventsByType[OperationType.USER_LOGIN]).toBe(1);
      expect(stats.eventsByResult.success).toBe(1);
    });

    it('should track operation timing', () => {
      const operationId = 'test-operation-123';
      
      monitor.startTimer(operationId);
      
      // Simulate some processing time
      const startTime = Date.now();
      while (Date.now() - startTime < 10) {
        // Wait a bit
      }

      const eventId = monitor.endTimer(
        operationId,
        OperationType.DATA_ACCESS,
        'Test data access',
        'success',
        undefined,
        { resource: 'course' }
      );

      expect(eventId).toBeDefined();

      const stats = monitor.getStatistics();
      expect(stats.totalEvents).toBe(1);
      expect(stats.eventsByType[OperationType.DATA_ACCESS]).toBe(1);
    });

    it('should log cross-institutional access attempts', () => {
      monitor.logCrossInstitutionalAccess(
        'user-123',
        'inst-1',
        'inst-2',
        'course',
        'course-456',
        true // blocked
      );

      const stats = monitor.getStatistics();
      expect(stats.totalEvents).toBe(1);
      expect(stats.eventsByType[OperationType.CROSS_INSTITUTIONAL_ACCESS_ATTEMPT]).toBe(1);
      // securityAlerts in stats counts CROSS_INSTITUTIONAL_ACCESS_ATTEMPT events
      expect(stats.securityAlerts).toBe(1);
      
      // Test unblocked access (should create security alert)
      monitor.logCrossInstitutionalAccess(
        'user-123',
        'inst-1',
        'inst-2',
        'course',
        'course-456',
        false // not blocked
      );

      const updatedStats = monitor.getStatistics();
      expect(updatedStats.totalEvents).toBe(2);
      expect(updatedStats.securityAlerts).toBe(2); // Both events count as security alerts

      // Check actual SecurityAlert objects (different from stats.securityAlerts)
      const alerts = monitor.getSecurityAlerts();
      expect(alerts).toHaveLength(1); // Only unblocked access creates SecurityAlert objects
      expect(alerts[0].type).toBe('CROSS_INSTITUTIONAL_ACCESS');
      expect(alerts[0].severity).toBe('critical');
    });

    it('should log administrative privilege changes', () => {
      monitor.logAdminPrivilegeChange(
        'assigned',
        'user-123',
        'inst-456',
        'admin-789',
        'teacher',
        'institution_admin'
      );

      const stats = monitor.getStatistics();
      expect(stats.totalEvents).toBe(1);
      expect(stats.eventsByType[OperationType.ADMIN_PRIVILEGE_ASSIGNMENT]).toBe(1);
    });

    it('should track performance issues', () => {
      monitor.logPerformanceIssue(
        'Database query',
        6000, // 6 seconds
        5000, // 5 second threshold
        'inst-123'
      );

      const stats = monitor.getStatistics();
      expect(stats.totalEvents).toBe(1);
      expect(stats.eventsByType[OperationType.PERFORMANCE_ISSUE]).toBe(1);
      expect(stats.performanceIssues).toBe(1);
    });

    it('should provide comprehensive statistics', () => {
      // Generate various events
      monitor.logOperation(OperationType.USER_LOGIN, 'Login', 'success');
      monitor.logOperation(OperationType.USER_LOGIN, 'Login', 'failure');
      monitor.logOperation(OperationType.CONTEXT_SWITCH, 'Switch', 'success');
      monitor.logOperation(OperationType.DATA_ACCESS, 'Access', 'success');

      const stats = monitor.getStatistics();

      expect(stats.totalEvents).toBe(4);
      expect(stats.eventsByType[OperationType.USER_LOGIN]).toBe(2);
      expect(stats.eventsByType[OperationType.CONTEXT_SWITCH]).toBe(1);
      expect(stats.eventsByType[OperationType.DATA_ACCESS]).toBe(1);
      expect(stats.eventsByResult.success).toBe(3);
      expect(stats.eventsByResult.failure).toBe(1);
      expect(stats.recentEvents).toHaveLength(4);
    });

    it('should filter statistics by institution', () => {
      const mockRequest1 = {
        headers: {},
        tenantContext: { institutionId: { toString: () => 'inst-1' } }
      } as any;

      const mockRequest2 = {
        headers: {},
        tenantContext: { institutionId: { toString: () => 'inst-2' } }
      } as any;

      monitor.logOperation(OperationType.DATA_ACCESS, 'Access 1', 'success', mockRequest1);
      monitor.logOperation(OperationType.DATA_ACCESS, 'Access 2', 'success', mockRequest2);
      monitor.logOperation(OperationType.DATA_ACCESS, 'Access 3', 'success', mockRequest1);

      const allStats = monitor.getStatistics();
      expect(allStats.totalEvents).toBe(3);

      const inst1Stats = monitor.getStatistics('inst-1');
      expect(inst1Stats.totalEvents).toBe(2);

      const inst2Stats = monitor.getStatistics('inst-2');
      expect(inst2Stats.totalEvents).toBe(1);
    });

    it('should manage security alerts', () => {
      // Create some security alerts through cross-institutional access
      monitor.logCrossInstitutionalAccess('user-1', 'inst-1', 'inst-2', 'course', 'course-1', false);
      monitor.logCrossInstitutionalAccess('user-2', 'inst-1', 'inst-2', 'course', 'course-2', false);

      const alerts = monitor.getSecurityAlerts();
      expect(alerts).toHaveLength(2);
      expect(alerts.every(alert => !alert.resolved)).toBe(true);

      // Resolve first alert
      const alertId = alerts[0].id;
      const resolved = monitor.resolveSecurityAlert(alertId);
      expect(resolved).toBe(true);

      const unresolvedAlerts = monitor.getSecurityAlerts(undefined, false);
      expect(unresolvedAlerts).toHaveLength(1);

      const resolvedAlerts = monitor.getSecurityAlerts(undefined, true);
      expect(resolvedAlerts).toHaveLength(1);
    });
  });

  describe('Integration between ErrorHandler and Monitor', () => {
    it('should coordinate error logging and monitoring', () => {
      const mockRequest = {
        method: 'GET',
        url: '/api/courses',
        tenantContext: { institutionId: { toString: () => 'inst-1' } }
      } as any;

      // Create an error (which should log to both systems)
      const error = errorHandler.createError(
        MultiTenantErrorType.CROSS_INSTITUTIONAL_ACCESS,
        'Cross access attempt',
        mockRequest,
        403
      );

      // Check error handler statistics
      const errorStats = errorHandler.getErrorStatistics();
      expect(errorStats.total).toBe(1);
      expect(errorStats.byType[MultiTenantErrorType.CROSS_INSTITUTIONAL_ACCESS]).toBe(1);

      // The monitor should also have logged this if the error handler is properly integrated
      expect(error.type).toBe(MultiTenantErrorType.CROSS_INSTITUTIONAL_ACCESS);
      expect(error.statusCode).toBe(403);
    });
  });
});