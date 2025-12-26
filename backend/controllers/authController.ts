import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import User, { IUser } from '../models/User';
import Student from '../models/Student';
import Institution from '../models/Institution';
import { TenantContextManager, AuthenticatedRequest } from '../services/TenantContextManager';
import { SessionManager } from '../services/SessionManager';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRE = process.env.JWT_EXPIRE || '7d';

if (!JWT_SECRET) {
  console.error('JWT_SECRET environment variable is required');
  process.exit(1);
}

const generateToken = (id: string): string => {
  return jwt.sign({ id }, JWT_SECRET as string, { expiresIn: JWT_EXPIRE });
};

interface RegisterRequest extends Request {
  body: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    role: 'admin' | 'teacher' | 'student';
  };
}

interface LoginRequest extends Request {
  body: {
    email: string;
    password: string;
    institutionId?: string; // Optional for multi-institutional login
  };
}

interface ForgotPasswordRequest extends Request {
  body: {
    email: string;
  };
}

interface ResetPasswordRequest extends Request {
  body: {
    resetToken: string;
    newPassword: string;
  };
}

interface SwitchInstitutionRequest extends Request {
  body: {
    institutionId: string;
  };
}

export const register = async (req: RegisterRequest, res: Response): Promise<void> => {
  try {
    const { email, password, firstName, lastName, role } = req.body;
    
    // Input validation
    if (!email || !password || !firstName || !lastName || !role) {
      res.status(400).json({ error: 'All fields are required' });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters' });
      return;
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      res.status(400).json({ error: 'User already exists' });
      return;
    }

    const user = await User.create({
      email: email.toLowerCase(),
      password,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      role
    });

    // If registering as a student, create a Student profile
    if (role === 'student') {
      // Generate a unique student ID
      const studentCount = await Student.countDocuments();
      const studentId = `STU${String(studentCount + 1).padStart(6, '0')}`;
      
      await Student.create({
        user: user._id,
        studentId,
        major: 'Undeclared', // Default major
        year: 1, // Default to first year
        gpa: 0.0,
        enrolledCourses: [],
        totalCredits: 0,
        maxCredits: 18,
        isActive: true
      });
    }

    const token = generateToken(user._id.toString());
    
    res.status(201).json({
      token,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
};

export const login = async (req: LoginRequest, res: Response): Promise<void> => {
  try {
    const { email, password, institutionId } = req.body;
    
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }
    
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !await user.comparePassword(password)) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    if (!user.isActive) {
      res.status(401).json({ error: 'Account is deactivated' });
      return;
    }

    user.lastLogin = new Date();
    await user.save();

    const token = generateToken(user._id.toString());
    
    // Get user's active institutions
    const activeInstitutions = user.institutions.filter(inst => inst.status === 'active');
    
    // If user has no active institutions, return error
    if (activeInstitutions.length === 0) {
      res.status(403).json({ 
        error: 'No active institutional access',
        message: 'Your account is not associated with any active institutions. Please contact an administrator.'
      });
      return;
    }

    // If institutionId is provided, validate and set context
    if (institutionId) {
      const userInstitution = activeInstitutions.find(
        inst => inst.institutionId.toString() === institutionId
      );
      
      if (!userInstitution) {
        res.status(403).json({ 
          error: 'Invalid institution access',
          message: 'You do not have access to the specified institution.',
          availableInstitutions: activeInstitutions.map(inst => ({
            id: inst.institutionId,
            role: inst.role
          }))
        });
        return;
      }

      // Get institution details
      const institution = await Institution.findById(institutionId);
      if (!institution || institution.status !== 'active') {
        res.status(403).json({ 
          error: 'Institution unavailable',
          message: 'The selected institution is not currently available.'
        });
        return;
      }

      // Set institutional context
      const tenantManager = TenantContextManager.getInstance();
      const sessionManager = SessionManager.getInstance();
      
      try {
        const context = await tenantManager.setInstitutionContext(
          institutionId, 
          user._id.toString()
        );

        // Create session with institutional context
        const sessionId = user._id.toString();
        const session = sessionManager.createSession(user._id.toString(), sessionId);
        sessionManager.setInstitutionalContext(sessionId, institutionId, context);

        res.json({
          token,
          user: {
            id: user._id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName
          },
          institutionalContext: {
            institutionId: institution._id,
            institutionName: institution.name,
            role: userInstitution.role,
            branding: institution.branding
          }
        });
        return;
      } catch (error) {
        console.error('Error setting institutional context:', error);
        res.status(500).json({ error: 'Failed to establish institutional context' });
        return;
      }
    }

    // If no institutionId provided and user has multiple institutions, require selection
    if (activeInstitutions.length > 1) {
      // Populate institution details for selection
      const institutionIds = activeInstitutions.map(inst => inst.institutionId);
      const institutions = await Institution.find({
        _id: { $in: institutionIds },
        status: 'active'
      });

      const institutionOptions = activeInstitutions.map(userInst => {
        const institution = institutions.find(inst => 
          inst._id.toString() === userInst.institutionId.toString()
        );
        return {
          id: userInst.institutionId,
          name: institution?.name || 'Unknown Institution',
          role: userInst.role,
          branding: institution?.branding
        };
      });

      res.json({
        token,
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName
        },
        requiresInstitutionSelection: true,
        availableInstitutions: institutionOptions
      });
      return;
    }

    // Single institution - automatically set context
    const singleInstitution = activeInstitutions[0];
    const institution = await Institution.findById(singleInstitution.institutionId);
    
    if (!institution || institution.status !== 'active') {
      res.status(403).json({ 
        error: 'Institution unavailable',
        message: 'Your institution is not currently available.'
      });
      return;
    }

    // Set institutional context for single institution
    const tenantManager = TenantContextManager.getInstance();
    const sessionManager = SessionManager.getInstance();
    
    try {
      const context = await tenantManager.setInstitutionContext(
        singleInstitution.institutionId.toString(), 
        user._id.toString()
      );

      // Create session with institutional context
      const sessionId = user._id.toString();
      const session = sessionManager.createSession(user._id.toString(), sessionId);
      sessionManager.setInstitutionalContext(
        sessionId, 
        singleInstitution.institutionId.toString(), 
        context
      );

      res.json({
        token,
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName
        },
        institutionalContext: {
          institutionId: institution._id,
          institutionName: institution.name,
          role: singleInstitution.role,
          branding: institution.branding
        }
      });
    } catch (error) {
      console.error('Error setting institutional context:', error);
      res.status(500).json({ error: 'Failed to establish institutional context' });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
};

export const forgotPassword = async (req: ForgotPasswordRequest, res: Response): Promise<void> => {
  try {
    const { email } = req.body;
    
    if (!email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      // Don't reveal if user exists
      res.json({ message: 'If user exists, reset instructions have been sent' });
      return;
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetToken = resetToken;
    user.resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour
    await user.save();

    // TODO: Send email with resetToken
    console.log(`Reset token for ${email}: ${resetToken}`);
    
    res.json({ message: 'If user exists, reset instructions have been sent' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Password reset failed' });
  }
};

export const resetPassword = async (req: ResetPasswordRequest, res: Response): Promise<void> => {
  try {
    const { resetToken, newPassword } = req.body;
    
    if (!resetToken || !newPassword) {
      res.status(400).json({ error: 'Reset token and new password are required' });
      return;
    }

    if (newPassword.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters' });
      return;
    }
    
    const user = await User.findOne({
      resetToken,
      resetTokenExpiry: { $gt: new Date() }
    });

    if (!user) {
      res.status(400).json({ error: 'Invalid or expired reset token' });
      return;
    }

    user.password = newPassword;
    user.resetToken = undefined;
    user.resetTokenExpiry = undefined;
    await user.save();

    res.json({ message: 'Password reset successful' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Password reset failed' });
  }
};

/**
 * Switch institutional context for authenticated user
 * Requirements: 4.5, 9.2, 10.4 - Context switching security
 */
export const switchInstitution = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { institutionId } = req.body as SwitchInstitutionRequest['body'];

    if (!authReq.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!institutionId) {
      res.status(400).json({ error: 'Institution ID is required' });
      return;
    }

    // Validate user has access to the requested institution
    const userInstitution = authReq.user.institutions.find(
      inst => inst.institutionId.toString() === institutionId && inst.status === 'active'
    );

    if (!userInstitution) {
      res.status(403).json({ 
        error: 'Access denied',
        message: 'You do not have access to the specified institution.'
      });
      return;
    }

    // Validate institution exists and is active
    const institution = await Institution.findOne({
      _id: institutionId,
      status: 'active'
    });

    if (!institution) {
      res.status(404).json({ 
        error: 'Institution not found',
        message: 'The specified institution is not available.'
      });
      return;
    }

    // Clear existing context and set new one (security requirement)
    const tenantManager = TenantContextManager.getInstance();
    const sessionManager = SessionManager.getInstance();
    
    // Clear all existing contexts for security
    tenantManager.clearContext(authReq.user._id.toString());
    
    const sessionId = authReq.user._id.toString();
    sessionManager.clearInstitutionalContext(sessionId);

    // Set new institutional context
    const context = await tenantManager.setInstitutionContext(
      institutionId,
      authReq.user._id.toString()
    );

    // Update session with new context
    sessionManager.setInstitutionalContext(sessionId, institutionId, context);

    res.json({
      message: 'Institution context switched successfully',
      institutionalContext: {
        institutionId: institution._id,
        institutionName: institution.name,
        role: userInstitution.role,
        branding: institution.branding
      }
    });
  } catch (error) {
    console.error('Switch institution error:', error);
    res.status(500).json({ error: 'Failed to switch institution context' });
  }
};

/**
 * Get user's available institutions
 * Requirements: 14.5 - Multi-institutional user management
 */
export const getUserInstitutions = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;

    if (!authReq.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Get active institutions for the user
    const activeInstitutions = authReq.user.institutions.filter(inst => inst.status === 'active');
    
    if (activeInstitutions.length === 0) {
      res.json({ institutions: [] });
      return;
    }

    // Populate institution details
    const institutionIds = activeInstitutions.map(inst => inst.institutionId);
    const institutions = await Institution.find({
      _id: { $in: institutionIds },
      status: 'active'
    });

    const institutionDetails = activeInstitutions.map(userInst => {
      const institution = institutions.find(inst => 
        inst._id.toString() === userInst.institutionId.toString()
      );
      return {
        id: userInst.institutionId,
        name: institution?.name || 'Unknown Institution',
        type: institution?.type,
        role: userInst.role,
        status: userInst.status,
        createdAt: userInst.createdAt,
        approvedAt: userInst.approvedAt,
        branding: institution?.branding
      };
    });

    res.json({ institutions: institutionDetails });
  } catch (error) {
    console.error('Get user institutions error:', error);
    res.status(500).json({ error: 'Failed to get user institutions' });
  }
};

/**
 * Get current institutional context
 */
export const getCurrentContext = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;

    if (!authReq.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const sessionManager = SessionManager.getInstance();
    const sessionId = authReq.user._id.toString();
    const currentContext = sessionManager.getCurrentInstitutionalContext(sessionId);

    if (!currentContext) {
      res.json({ 
        hasContext: false,
        message: 'No institutional context established'
      });
      return;
    }

    res.json({
      hasContext: true,
      institutionalContext: {
        institutionId: currentContext.institutionId,
        institutionName: currentContext.institution.name,
        role: currentContext.userInstitution.role,
        branding: currentContext.institution.branding
      }
    });
  } catch (error) {
    console.error('Get current context error:', error);
    res.status(500).json({ error: 'Failed to get current context' });
  }
};

/**
 * Logout and clear all institutional contexts
 */
export const logout = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;

    if (!authReq.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Clear all contexts and session data for security
    const tenantManager = TenantContextManager.getInstance();
    const sessionManager = SessionManager.getInstance();
    
    const sessionId = authReq.user._id.toString();
    
    // Clear tenant contexts
    tenantManager.clearContext(authReq.user._id.toString());
    
    // Destroy session
    sessionManager.destroySession(sessionId);

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
};
