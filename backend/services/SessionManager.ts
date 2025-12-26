import { Request, Response } from 'express';
import { AuthenticatedRequest, TenantContext } from './TenantContextManager';

export interface SessionData {
  userId: string;
  currentInstitutionId?: string;
  institutionContexts: Map<string, TenantContext>;
  lastActivity: Date;
}

export class SessionManager {
  private static instance: SessionManager;
  private sessions: Map<string, SessionData> = new Map();
  private readonly SESSION_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours

  private constructor() {
    // Clean up expired sessions every hour
    setInterval(() => this.cleanupExpiredSessions(), 60 * 60 * 1000);
  }

  public static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager();
    }
    return SessionManager.instance;
  }

  /**
   * Create or update session data
   */
  createSession(userId: string, sessionId: string): SessionData {
    const sessionData: SessionData = {
      userId,
      institutionContexts: new Map(),
      lastActivity: new Date()
    };

    this.sessions.set(sessionId, sessionData);
    return sessionData;
  }

  /**
   * Get session data
   */
  getSession(sessionId: string): SessionData | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    // Check if session is expired
    const now = new Date();
    if (now.getTime() - session.lastActivity.getTime() > this.SESSION_TIMEOUT) {
      this.sessions.delete(sessionId);
      return null;
    }

    // Update last activity
    session.lastActivity = now;
    return session;
  }

  /**
   * Update session with institutional context
   */
  setInstitutionalContext(
    sessionId: string, 
    institutionId: string, 
    context: TenantContext
  ): void {
    const session = this.getSession(sessionId);
    if (session) {
      session.institutionContexts.set(institutionId, context);
      session.currentInstitutionId = institutionId;
      session.lastActivity = new Date();
    }
  }

  /**
   * Switch institutional context within session
   */
  switchInstitutionalContext(sessionId: string, institutionId: string): boolean {
    const session = this.getSession(sessionId);
    if (!session) return false;

    const context = session.institutionContexts.get(institutionId);
    if (!context) return false;

    session.currentInstitutionId = institutionId;
    session.lastActivity = new Date();
    return true;
  }

  /**
   * Clear institutional context from session
   */
  clearInstitutionalContext(sessionId: string, institutionId?: string): void {
    const session = this.getSession(sessionId);
    if (!session) return;

    if (institutionId) {
      session.institutionContexts.delete(institutionId);
      if (session.currentInstitutionId === institutionId) {
        session.currentInstitutionId = undefined;
      }
    } else {
      session.institutionContexts.clear();
      session.currentInstitutionId = undefined;
    }

    session.lastActivity = new Date();
  }

  /**
   * Destroy session
   */
  destroySession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /**
   * Clean up expired sessions
   */
  private cleanupExpiredSessions(): void {
    const now = new Date();
    const expiredSessions: string[] = [];

    this.sessions.forEach((session, sessionId) => {
      if (now.getTime() - session.lastActivity.getTime() > this.SESSION_TIMEOUT) {
        expiredSessions.push(sessionId);
      }
    });

    expiredSessions.forEach(sessionId => {
      this.sessions.delete(sessionId);
    });

    if (expiredSessions.length > 0) {
      console.log(`Cleaned up ${expiredSessions.length} expired sessions`);
    }
  }

  /**
   * Get current institutional context from session
   */
  getCurrentInstitutionalContext(sessionId: string): TenantContext | null {
    const session = this.getSession(sessionId);
    if (!session || !session.currentInstitutionId) return null;

    return session.institutionContexts.get(session.currentInstitutionId) || null;
  }

  /**
   * Middleware to attach session data to request
   */
  attachSession() {
    return (req: Request, res: Response, next: Function): void => {
      const authReq = req as AuthenticatedRequest;
      
      if (authReq.user) {
        // Use user ID as session ID for simplicity (in production, use proper session management)
        const sessionId = authReq.user._id.toString();
        let session = this.getSession(sessionId);
        
        if (!session) {
          session = this.createSession(authReq.user._id.toString(), sessionId);
        }

        // Attach session to request
        (authReq as any).session = session;
        (authReq as any).sessionId = sessionId;
      }

      next();
    };
  }
}

export default SessionManager.getInstance();