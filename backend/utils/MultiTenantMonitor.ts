import { Request } from 'express';
import { AuthenticatedRequest } from '../services/TenantContextManager';

/**
 * Multi-tenant operation types for monitoring
 */
export enum OperationType {
  USER_LOGIN = 'USER_LOGIN',
  CONTEXT_SWITCH = 'CONTEXT_SWITCH',
  CROSS_INSTITUTIONAL_ACCESS_ATTEMPT = 'CROSS_INSTITUTIONAL_ACCESS_ATTEMPT',
  ADMIN_PRIVILEGE_ASSIGNMENT = 'ADMIN_PRIVILEGE_ASSIGNMENT',
  ADMIN_PRIVILEGE_REMOVAL = 'ADMIN_PRIVILEGE_REMOVAL',
  INSTITUTION_REGISTRATION = 'INSTITUTION_REGISTRATION',
  USER_REGISTRATION = 'USER_REGISTRATION',
  REGISTRATION_APPROVAL = 'REGISTRATION_APPROVAL',
  REGISTRATION_REJECTION = 'REGISTRATION_REJECTION',
  COURSE_ENROLLMENT = 'COURSE_ENROLLMENT',
  COURSE_CREATION = 'COURSE_CREATION',
  BRANDING_UPDATE = 'BRANDING_UPDATE',
  SETTINGS_UPDATE = 'SETTINGS_UPDATE',
  DATA_ACCESS = 'DATA_ACCESS',
  SECURITY_VIOLATION = 'SECURITY_VIOLATION',
  SESSION_CORRUPTION = 'SESSION_CORRUPTION',
  PERFORMANCE_ISSUE = 'PERFORMANCE_ISSUE'
}

/**
 * Monitoring event interface
 */
export interface MonitoringEvent {
  id: string;
  type: OperationType;
  timestamp: Date;
  institutionId?: string;
  userId?: string;
  resourceType?: string;
  resourceId?: string;
  action: string;
  result: 'success' | 'failure' | 'warning';
  duration?: number;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Performance metrics interface
 */
export interface PerformanceMetrics {
  institutionId: string;
  operationType: OperationType;
  averageResponseTime: number;
  totalRequests: number;
  successRate: number;
  errorRate: number;
  timestamp: Date;
}

/**
 * Security alert interface
 */
export interface SecurityAlert {
  id: string;
  type: 'CROSS_INSTITUTIONAL_ACCESS' | 'PRIVILEGE_ESCALATION' | 'SUSPICIOUS_ACTIVITY' | 'DATA_BREACH_ATTEMPT';
  severity: 'medium' | 'high' | 'critical';
  institutionId?: string;
  userId?: string;
  description: string;
  timestamp: Date;
  resolved: boolean;
  metadata?: Record<string, any>;
}

/**
 * Multi-tenant monitoring and logging utility
 */
export class MultiTenantMonitor {
  private static instance: MultiTenantMonitor;
  private events: MonitoringEvent[] = [];
  private performanceMetrics: Map<string, PerformanceMetrics[]> = new Map();
  private securityAlerts: SecurityAlert[] = [];
  private operationTimers: Map<string, number> = new Map();

  private constructor() {}

  public static getInstance(): MultiTenantMonitor {
    if (!MultiTenantMonitor.instance) {
      MultiTenantMonitor.instance = new MultiTenantMonitor();
    }
    return MultiTenantMonitor.instance;
  }

  /**
   * Log a multi-tenant operation
   */
  public logOperation(
    type: OperationType,
    action: string,
    result: 'success' | 'failure' | 'warning',
    req?: Request,
    metadata?: Record<string, any>
  ): string {
    const authReq = req as AuthenticatedRequest;
    const eventId = this.generateEventId();

    const event: MonitoringEvent = {
      id: eventId,
      type,
      timestamp: new Date(),
      institutionId: authReq?.tenantContext?.institutionId?.toString(),
      userId: authReq?.user?._id?.toString(),
      action,
      result,
      metadata,
      ipAddress: this.getClientIP(req),
      userAgent: req?.headers['user-agent'],
      requestId: this.getRequestId(req),
      severity: this.determineSeverity(type, result)
    };

    this.events.push(event);

    // Keep only last 10000 events in memory
    if (this.events.length > 10000) {
      this.events = this.events.slice(-10000);
    }

    // Log to console with structured format
    this.logToConsole(event);

    // Check for security concerns
    this.checkSecurityConcerns(event);

    return eventId;
  }

  /**
   * Start timing an operation
   */
  public startTimer(operationId: string): void {
    this.operationTimers.set(operationId, Date.now());
  }

  /**
   * End timing an operation and log performance
   */
  public endTimer(
    operationId: string,
    type: OperationType,
    action: string,
    result: 'success' | 'failure' | 'warning',
    req?: Request,
    metadata?: Record<string, any>
  ): string {
    const startTime = this.operationTimers.get(operationId);
    const duration = startTime ? Date.now() - startTime : undefined;
    
    if (startTime) {
      this.operationTimers.delete(operationId);
    }

    const eventId = this.logOperation(type, action, result, req, {
      ...metadata,
      duration
    });

    // Update performance metrics
    if (duration && req) {
      this.updatePerformanceMetrics(type, duration, result, req);
    }

    return eventId;
  }

  /**
   * Log cross-institutional access attempt
   */
  public logCrossInstitutionalAccess(
    userId: string,
    currentInstitutionId: string,
    targetInstitutionId: string,
    resourceType: string,
    resourceId: string,
    blocked: boolean,
    req?: Request
  ): void {
    const severity = blocked ? 'high' : 'critical';
    
    this.logOperation(
      OperationType.CROSS_INSTITUTIONAL_ACCESS_ATTEMPT,
      `Access ${resourceType} from different institution`,
      blocked ? 'warning' : 'failure',
      req,
      {
        currentInstitutionId,
        targetInstitutionId,
        resourceType,
        resourceId,
        blocked
      }
    );

    // Create security alert if not blocked
    if (!blocked) {
      this.createSecurityAlert(
        'CROSS_INSTITUTIONAL_ACCESS',
        'critical',
        `User ${userId} accessed ${resourceType} ${resourceId} from different institution`,
        currentInstitutionId,
        userId,
        {
          targetInstitutionId,
          resourceType,
          resourceId
        }
      );
    }
  }

  /**
   * Log administrative privilege changes
   */
  public logAdminPrivilegeChange(
    action: 'assigned' | 'removed' | 'updated',
    targetUserId: string,
    institutionId: string,
    performedBy: string,
    previousRole?: string,
    newRole?: string,
    req?: Request
  ): void {
    const operationType = action === 'assigned' || action === 'updated' 
      ? OperationType.ADMIN_PRIVILEGE_ASSIGNMENT 
      : OperationType.ADMIN_PRIVILEGE_REMOVAL;

    this.logOperation(
      operationType,
      `Admin privileges ${action}`,
      'success',
      req,
      {
        targetUserId,
        performedBy,
        previousRole,
        newRole,
        institutionId
      }
    );

    // Log to console with special formatting for admin changes
    console.log(`🔐 ADMIN PRIVILEGE ${action.toUpperCase()}: User ${targetUserId} ${action} admin privileges for institution ${institutionId}`);
    console.log(`   Performed by: ${performedBy}`);
    if (previousRole) console.log(`   Previous role: ${previousRole}`);
    if (newRole) console.log(`   New role: ${newRole}`);
    console.log(`   Timestamp: ${new Date().toISOString()}`);
    console.log('---');
  }

  /**
   * Log user registration events
   */
  public logUserRegistration(
    action: 'submitted' | 'approved' | 'rejected',
    userId: string,
    institutionId: string,
    role: string,
    performedBy?: string,
    reason?: string,
    req?: Request
  ): void {
    let operationType: OperationType;
    switch (action) {
      case 'submitted':
        operationType = OperationType.USER_REGISTRATION;
        break;
      case 'approved':
        operationType = OperationType.REGISTRATION_APPROVAL;
        break;
      case 'rejected':
        operationType = OperationType.REGISTRATION_REJECTION;
        break;
    }

    this.logOperation(
      operationType,
      `User registration ${action}`,
      'success',
      req,
      {
        userId,
        institutionId,
        role,
        performedBy,
        reason
      }
    );
  }

  /**
   * Log performance issues
   */
  public logPerformanceIssue(
    operation: string,
    duration: number,
    threshold: number,
    institutionId?: string,
    req?: Request
  ): void {
    this.logOperation(
      OperationType.PERFORMANCE_ISSUE,
      `Slow operation: ${operation}`,
      'warning',
      req,
      {
        operation,
        duration,
        threshold,
        institutionId
      }
    );

    console.warn(`⚠️ PERFORMANCE ISSUE: ${operation} took ${duration}ms (threshold: ${threshold}ms)`);
    if (institutionId) console.warn(`   Institution: ${institutionId}`);
    console.warn(`   Timestamp: ${new Date().toISOString()}`);
  }

  /**
   * Get monitoring statistics
   */
  public getStatistics(institutionId?: string, hours: number = 24): {
    totalEvents: number;
    eventsByType: Record<string, number>;
    eventsByResult: Record<string, number>;
    securityAlerts: number;
    performanceIssues: number;
    recentEvents: MonitoringEvent[];
  } {
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    let filteredEvents = this.events.filter(event => 
      event.timestamp >= cutoffTime &&
      (!institutionId || event.institutionId === institutionId)
    );

    const eventsByType: Record<string, number> = {};
    const eventsByResult: Record<string, number> = {};
    let securityAlerts = 0;
    let performanceIssues = 0;

    filteredEvents.forEach(event => {
      eventsByType[event.type] = (eventsByType[event.type] || 0) + 1;
      eventsByResult[event.result] = (eventsByResult[event.result] || 0) + 1;
      
      if (event.type === OperationType.CROSS_INSTITUTIONAL_ACCESS_ATTEMPT || 
          event.type === OperationType.SECURITY_VIOLATION) {
        securityAlerts++;
      }
      
      if (event.type === OperationType.PERFORMANCE_ISSUE) {
        performanceIssues++;
      }
    });

    return {
      totalEvents: filteredEvents.length,
      eventsByType,
      eventsByResult,
      securityAlerts,
      performanceIssues,
      recentEvents: filteredEvents.slice(-20)
    };
  }

  /**
   * Get performance metrics for an institution
   */
  public getPerformanceMetrics(institutionId: string, hours: number = 24): PerformanceMetrics[] {
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    const metrics = this.performanceMetrics.get(institutionId) || [];
    
    return metrics.filter(metric => metric.timestamp >= cutoffTime);
  }

  /**
   * Get security alerts
   */
  public getSecurityAlerts(institutionId?: string, resolved?: boolean): SecurityAlert[] {
    return this.securityAlerts.filter(alert => 
      (!institutionId || alert.institutionId === institutionId) &&
      (resolved === undefined || alert.resolved === resolved)
    );
  }

  /**
   * Resolve a security alert
   */
  public resolveSecurityAlert(alertId: string): boolean {
    const alert = this.securityAlerts.find(a => a.id === alertId);
    if (alert) {
      alert.resolved = true;
      return true;
    }
    return false;
  }

  /**
   * Create a security alert
   */
  private createSecurityAlert(
    type: SecurityAlert['type'],
    severity: SecurityAlert['severity'],
    description: string,
    institutionId?: string,
    userId?: string,
    metadata?: Record<string, any>
  ): void {
    const alert: SecurityAlert = {
      id: this.generateEventId(),
      type,
      severity,
      description,
      institutionId,
      userId,
      timestamp: new Date(),
      resolved: false,
      metadata
    };

    this.securityAlerts.push(alert);

    // Keep only last 1000 alerts
    if (this.securityAlerts.length > 1000) {
      this.securityAlerts = this.securityAlerts.slice(-1000);
    }

    console.error(`🚨 SECURITY ALERT [${severity.toUpperCase()}]: ${description}`);
    if (institutionId) console.error(`   Institution: ${institutionId}`);
    if (userId) console.error(`   User: ${userId}`);
    console.error(`   Alert ID: ${alert.id}`);
    console.error(`   Timestamp: ${alert.timestamp.toISOString()}`);
  }

  /**
   * Update performance metrics
   */
  private updatePerformanceMetrics(
    type: OperationType,
    duration: number,
    result: 'success' | 'failure' | 'warning',
    req: Request
  ): void {
    const authReq = req as AuthenticatedRequest;
    const institutionId = authReq.tenantContext?.institutionId?.toString();
    
    if (!institutionId) return;

    const key = `${institutionId}-${type}`;
    const existing = this.performanceMetrics.get(institutionId) || [];
    
    // Find or create metrics for this operation type
    let metrics = existing.find(m => m.operationType === type);
    if (!metrics) {
      metrics = {
        institutionId,
        operationType: type,
        averageResponseTime: duration,
        totalRequests: 1,
        successRate: result === 'success' ? 100 : 0,
        errorRate: result === 'failure' ? 100 : 0,
        timestamp: new Date()
      };
      existing.push(metrics);
    } else {
      // Update existing metrics
      const totalRequests = metrics.totalRequests + 1;
      const successCount = Math.round(metrics.successRate * metrics.totalRequests / 100) + 
                          (result === 'success' ? 1 : 0);
      const errorCount = Math.round(metrics.errorRate * metrics.totalRequests / 100) + 
                        (result === 'failure' ? 1 : 0);
      
      metrics.averageResponseTime = 
        (metrics.averageResponseTime * metrics.totalRequests + duration) / totalRequests;
      metrics.totalRequests = totalRequests;
      metrics.successRate = (successCount / totalRequests) * 100;
      metrics.errorRate = (errorCount / totalRequests) * 100;
      metrics.timestamp = new Date();
    }

    this.performanceMetrics.set(institutionId, existing);

    // Check for performance issues
    if (duration > 5000) { // 5 second threshold
      this.logPerformanceIssue(
        type,
        duration,
        5000,
        institutionId,
        req
      );
    }
  }

  /**
   * Check for security concerns in events
   */
  private checkSecurityConcerns(event: MonitoringEvent): void {
    // Multiple failed login attempts
    if (event.type === OperationType.USER_LOGIN && event.result === 'failure') {
      const recentFailures = this.events.filter(e => 
        e.type === OperationType.USER_LOGIN &&
        e.result === 'failure' &&
        e.userId === event.userId &&
        e.timestamp > new Date(Date.now() - 15 * 60 * 1000) // Last 15 minutes
      ).length;

      if (recentFailures >= 5) {
        this.createSecurityAlert(
          'SUSPICIOUS_ACTIVITY',
          'medium',
          `Multiple failed login attempts for user ${event.userId}`,
          event.institutionId,
          event.userId,
          { failedAttempts: recentFailures }
        );
      }
    }

    // Rapid context switching
    if (event.type === OperationType.CONTEXT_SWITCH) {
      const recentSwitches = this.events.filter(e => 
        e.type === OperationType.CONTEXT_SWITCH &&
        e.userId === event.userId &&
        e.timestamp > new Date(Date.now() - 5 * 60 * 1000) // Last 5 minutes
      ).length;

      if (recentSwitches >= 10) {
        this.createSecurityAlert(
          'SUSPICIOUS_ACTIVITY',
          'medium',
          `Rapid context switching detected for user ${event.userId}`,
          event.institutionId,
          event.userId,
          { switchCount: recentSwitches }
        );
      }
    }
  }

  /**
   * Determine event severity
   */
  private determineSeverity(type: OperationType, result: 'success' | 'failure' | 'warning'): 'low' | 'medium' | 'high' | 'critical' {
    if (result === 'failure') {
      switch (type) {
        case OperationType.CROSS_INSTITUTIONAL_ACCESS_ATTEMPT:
        case OperationType.SECURITY_VIOLATION:
          return 'critical';
        case OperationType.ADMIN_PRIVILEGE_ASSIGNMENT:
        case OperationType.ADMIN_PRIVILEGE_REMOVAL:
          return 'high';
        default:
          return 'medium';
      }
    }

    if (result === 'warning') {
      return 'medium';
    }

    // Success cases
    switch (type) {
      case OperationType.ADMIN_PRIVILEGE_ASSIGNMENT:
      case OperationType.ADMIN_PRIVILEGE_REMOVAL:
        return 'medium';
      default:
        return 'low';
    }
  }

  /**
   * Log event to console with structured format
   */
  private logToConsole(event: MonitoringEvent): void {
    const emoji = this.getEmojiForEvent(event);
    const severity = event.severity.toUpperCase();
    
    console.log(`${emoji} [${severity}] ${event.type}: ${event.action}`);
    if (event.institutionId) console.log(`   Institution: ${event.institutionId}`);
    if (event.userId) console.log(`   User: ${event.userId}`);
    if (event.duration) console.log(`   Duration: ${event.duration}ms`);
    console.log(`   Result: ${event.result}`);
    console.log(`   Timestamp: ${event.timestamp.toISOString()}`);
    if (event.metadata && Object.keys(event.metadata).length > 0) {
      console.log(`   Metadata:`, event.metadata);
    }
    console.log('---');
  }

  /**
   * Get emoji for event type
   */
  private getEmojiForEvent(event: MonitoringEvent): string {
    if (event.result === 'failure') return '❌';
    if (event.result === 'warning') return '⚠️';
    
    switch (event.type) {
      case OperationType.USER_LOGIN: return '🔐';
      case OperationType.CONTEXT_SWITCH: return '🔄';
      case OperationType.ADMIN_PRIVILEGE_ASSIGNMENT: return '👑';
      case OperationType.ADMIN_PRIVILEGE_REMOVAL: return '👤';
      case OperationType.CROSS_INSTITUTIONAL_ACCESS_ATTEMPT: return '🚫';
      case OperationType.SECURITY_VIOLATION: return '🚨';
      case OperationType.PERFORMANCE_ISSUE: return '⏱️';
      default: return '📝';
    }
  }

  /**
   * Utility functions
   */
  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getClientIP(req?: Request): string | undefined {
    if (!req || !req.headers) return undefined;
    return (req.headers['x-forwarded-for'] as string)?.split(',')[0] || 
           (req as any).connection?.remoteAddress || 
           (req as any).socket?.remoteAddress;
  }

  private getRequestId(req?: Request): string | undefined {
    return req?.headers['x-request-id'] as string;
  }

  /**
   * Clear all monitoring data (for testing)
   */
  public clearAll(): void {
    this.events = [];
    this.performanceMetrics.clear();
    this.securityAlerts = [];
    this.operationTimers.clear();
  }
}

export default MultiTenantMonitor;