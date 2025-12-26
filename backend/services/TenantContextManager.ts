import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import Institution, { IInstitution } from '../models/Institution';
import User, { IUser, IUserInstitution } from '../models/User';

export interface TenantContext {
  institutionId: mongoose.Types.ObjectId;
  institution: IInstitution;
  userInstitution: IUserInstitution;
}

export interface AuthenticatedRequest extends Request {
  user: IUser;
  tenantContext?: TenantContext;
  dbFilter?: { institutionId: mongoose.Types.ObjectId };
}

export class TenantContextManager {
  private static instance: TenantContextManager;
  private contextStore: Map<string, TenantContext> = new Map();

  private constructor() {}

  public static getInstance(): TenantContextManager {
    if (!TenantContextManager.instance) {
      TenantContextManager.instance = new TenantContextManager();
    }
    return TenantContextManager.instance;
  }

  /**
   * Set institutional context for a user session
   */
  async setInstitutionContext(
    institutionId: string, 
    userId: string
  ): Promise<TenantContext> {
    const institutionObjectId = new mongoose.Types.ObjectId(institutionId);
    
    // Validate institution exists and is active
    const institution = await Institution.findOne({
      _id: institutionObjectId,
      status: 'active'
    });
    
    if (!institution) {
      throw new Error('Institution not found or inactive');
    }

    // Validate user has access to this institution
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const userInstitution = user.institutions.find(
      inst => inst.institutionId.toString() === institutionId && 
              inst.status === 'active'
    );

    if (!userInstitution) {
      throw new Error('User does not have access to this institution');
    }

    const context: TenantContext = {
      institutionId: institutionObjectId,
      institution,
      userInstitution
    };

    // Store context with session key
    const sessionKey = `${userId}_${institutionId}`;
    this.contextStore.set(sessionKey, context);

    return context;
  }

  /**
   * Get current institutional context
   */
  getCurrentInstitution(userId: string, institutionId: string): TenantContext | null {
    const sessionKey = `${userId}_${institutionId}`;
    return this.contextStore.get(sessionKey) || null;
  }

  /**
   * Validate user access to a specific resource within institutional context
   */
  async validateAccess(
    resourceId: string, 
    resourceType: string, 
    context: TenantContext
  ): Promise<boolean> {
    try {
      // For now, implement basic validation - can be extended for specific resource types
      switch (resourceType) {
        case 'course':
          const Course = mongoose.model('Course');
          const course = await Course.findOne({
            _id: resourceId,
            institutionId: context.institutionId
          });
          return !!course;
          
        case 'enrollment':
          const Enrollment = mongoose.model('Enrollment');
          const enrollment = await Enrollment.findOne({
            _id: resourceId,
            institutionId: context.institutionId
          });
          return !!enrollment;
          
        default:
          return true; // Allow access for unknown resource types (can be restricted later)
      }
    } catch (error) {
      console.error('Error validating access:', error);
      return false;
    }
  }

  /**
   * Clear institutional context
   */
  clearContext(userId: string, institutionId?: string): void {
    if (institutionId) {
      const sessionKey = `${userId}_${institutionId}`;
      this.contextStore.delete(sessionKey);
    } else {
      // Clear all contexts for user
      const keysToDelete = Array.from(this.contextStore.keys())
        .filter(key => key.startsWith(`${userId}_`));
      keysToDelete.forEach(key => this.contextStore.delete(key));
    }
  }

  /**
   * Middleware to establish institutional context from request
   */
  establishContext() {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const authReq = req as AuthenticatedRequest;
        
        if (!authReq.user) {
          res.status(401).json({ error: 'Authentication required' });
          return;
        }

        // Get institution ID from header, query param, or body
        const institutionId = req.headers['x-institution-id'] as string ||
                            req.query.institutionId as string ||
                            req.body.institutionId as string;

        if (!institutionId) {
          res.status(400).json({ 
            error: 'Institution context required',
            message: 'Please select an institution to continue'
          });
          return;
        }

        // Set institutional context
        const context = await this.setInstitutionContext(
          institutionId, 
          authReq.user._id.toString()
        );

        // Attach context to request
        authReq.tenantContext = context;
        authReq.dbFilter = { institutionId: context.institutionId };

        next();
      } catch (error) {
        console.error('Error establishing institutional context:', error);
        res.status(403).json({ 
          error: 'Invalid institutional context',
          message: (error as Error).message
        });
      }
    };
  }

  /**
   * Middleware for automatic institutional filtering
   */
  enforceInstitutionalFiltering() {
    return (req: Request, res: Response, next: NextFunction): void => {
      const authReq = req as AuthenticatedRequest;
      
      if (!authReq.tenantContext) {
        res.status(400).json({ error: 'Institutional context not established' });
        return;
      }

      // Add institutional filter to request for use in controllers
      authReq.dbFilter = { institutionId: authReq.tenantContext.institutionId };
      
      next();
    };
  }

  /**
   * Get user's available institutions
   */
  async getUserInstitutions(userId: string): Promise<IUserInstitution[]> {
    const user = await User.findById(userId).populate('institutions.institutionId');
    if (!user) {
      throw new Error('User not found');
    }

    return user.institutions.filter(inst => inst.status === 'active');
  }

  /**
   * Switch user's institutional context
   */
  async switchInstitutionalContext(
    userId: string, 
    newInstitutionId: string
  ): Promise<TenantContext> {
    // Clear existing contexts for user
    this.clearContext(userId);
    
    // Set new context
    return await this.setInstitutionContext(newInstitutionId, userId);
  }
}

// Export both the class and a default instance
export const tenantContextManager = TenantContextManager.getInstance();
export default tenantContextManager;