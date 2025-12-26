import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import userService, { UserRegistrationData } from '../services/UserService';
import { institutionService } from '../services/InstitutionService';
import User from '../models/User';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRE = process.env.JWT_EXPIRE || '7d';

if (!JWT_SECRET && process.env.NODE_ENV !== 'test') {
  console.error('JWT_SECRET environment variable is required');
  process.exit(1);
}

const generateToken = (id: string): string => {
  const secret = JWT_SECRET || 'test-jwt-secret-for-testing';
  return jwt.sign({ id }, secret, { expiresIn: JWT_EXPIRE });
};

/**
 * Send notification to institution administrators about registration events
 */
const notifyInstitutionAdmins = async (institutionId: string, notificationData: {
  type: 'new_registration' | 'approval' | 'rejection' | 'timeout_reminder';
  userEmail: string;
  userName: string;
  role: string;
  institutionName: string;
  submittedAt?: Date;
  reason?: string;
  adminName?: string;
}): Promise<void> => {
  try {
    // Get all institution administrators for this institution
    const admins = await userService.getUsersByInstitution(institutionId, 'institution_admin', 'active');
    
    // Log notification for each admin (in a real system, this would send emails)
    for (const admin of admins) {
      switch (notificationData.type) {
        case 'new_registration':
          console.log(`📧 NOTIFICATION: New ${notificationData.role} registration pending for ${notificationData.institutionName}`);
          console.log(`   Admin: ${admin.firstName} ${admin.lastName} (${admin.email})`);
          console.log(`   Applicant: ${notificationData.userName} (${notificationData.userEmail})`);
          console.log(`   Role: ${notificationData.role}`);
          console.log(`   Submitted: ${notificationData.submittedAt?.toISOString()}`);
          console.log(`   Action Required: Review and approve/reject this registration`);
          break;
          
        case 'approval':
          console.log(`✅ NOTIFICATION: Registration approved for ${notificationData.institutionName}`);
          console.log(`   Admin: ${admin.firstName} ${admin.lastName} (${admin.email})`);
          console.log(`   Approved User: ${notificationData.userName} (${notificationData.userEmail})`);
          console.log(`   Role: ${notificationData.role}`);
          console.log(`   Approved By: ${notificationData.adminName}`);
          break;
          
        case 'rejection':
          console.log(`❌ NOTIFICATION: Registration rejected for ${notificationData.institutionName}`);
          console.log(`   Admin: ${admin.firstName} ${admin.lastName} (${admin.email})`);
          console.log(`   Rejected User: ${notificationData.userName} (${notificationData.userEmail})`);
          console.log(`   Role: ${notificationData.role}`);
          console.log(`   Reason: ${notificationData.reason || 'Not specified'}`);
          console.log(`   Rejected By: ${notificationData.adminName}`);
          break;
          
        case 'timeout_reminder':
          console.log(`⏰ REMINDER: Pending registration requires attention for ${notificationData.institutionName}`);
          console.log(`   Admin: ${admin.firstName} ${admin.lastName} (${admin.email})`);
          console.log(`   Pending User: ${notificationData.userName} (${notificationData.userEmail})`);
          console.log(`   Role: ${notificationData.role}`);
          console.log(`   Submitted: ${notificationData.submittedAt?.toISOString()}`);
          console.log(`   Action Required: Please review this pending registration`);
          break;
      }
      console.log('---');
    }

    // TODO: In a production system, this would:
    // 1. Send email notifications to all institution admins
    // 2. Create in-app notifications
    // 3. Possibly send SMS for urgent notifications
    // 4. Log the notification in an audit trail
    // 5. Store notification history for tracking
  } catch (error) {
    console.error('Failed to notify institution administrators:', error);
    // Don't throw error - notification failure shouldn't break registration
  }
};

interface MultiInstitutionalRegisterRequest extends Request {
  body: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    institutionId: string;
    role: 'student' | 'teacher' | 'institution_admin';
    profileData?: Record<string, any>;
  };
}

interface InstitutionalLoginRequest extends Request {
  body: {
    email: string;
    password: string;
    institutionId?: string;
  };
}

interface ApproveRegistrationRequest extends Request {
  body: {
    userId: string;
    institutionId: string;
  };
}

interface RejectRegistrationRequest extends Request {
  body: {
    userId: string;
    institutionId: string;
    reason?: string;
  };
}

interface SwitchInstitutionRequest extends Request {
  body: {
    institutionId: string;
  };
}

/**
 * Validate role-specific registration data
 */
const validateRoleSpecificData = (role: string, profileData: Record<string, any>): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];

  switch (role) {
    case 'student':
      // Student-specific validation
      if (profileData.studentId && typeof profileData.studentId !== 'string') {
        errors.push('Student ID must be a string');
      }
      if (profileData.major && typeof profileData.major !== 'string') {
        errors.push('Major must be a string');
      }
      if (profileData.year && !['freshman', 'sophomore', 'junior', 'senior', 'graduate'].includes(profileData.year)) {
        errors.push('Year must be one of: freshman, sophomore, junior, senior, graduate');
      }
      if (profileData.expectedGraduation && isNaN(Date.parse(profileData.expectedGraduation))) {
        errors.push('Expected graduation date must be a valid date');
      }
      break;

    case 'teacher':
      // Teacher-specific validation
      if (profileData.employeeId && typeof profileData.employeeId !== 'string') {
        errors.push('Employee ID must be a string');
      }
      if (profileData.department && typeof profileData.department !== 'string') {
        errors.push('Department must be a string');
      }
      if (profileData.title && typeof profileData.title !== 'string') {
        errors.push('Title must be a string');
      }
      if (profileData.specializations && !Array.isArray(profileData.specializations)) {
        errors.push('Specializations must be an array');
      }
      if (profileData.officeLocation && typeof profileData.officeLocation !== 'string') {
        errors.push('Office location must be a string');
      }
      break;

    case 'institution_admin':
      // Institution admin-specific validation
      if (profileData.adminLevel && !['department', 'college', 'institution'].includes(profileData.adminLevel)) {
        errors.push('Admin level must be one of: department, college, institution');
      }
      if (profileData.department && typeof profileData.department !== 'string') {
        errors.push('Department must be a string');
      }
      if (profileData.title && typeof profileData.title !== 'string') {
        errors.push('Title must be a string');
      }
      if (profileData.permissions && !Array.isArray(profileData.permissions)) {
        errors.push('Permissions must be an array');
      }
      break;
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Register a user for an institution with pending approval
 */
export const registerForInstitution = async (req: MultiInstitutionalRegisterRequest, res: Response): Promise<void> => {
  try {
    const { email, password, firstName, lastName, institutionId, role, profileData } = req.body;
    
    // Input validation
    if (!email || !password || !firstName || !lastName || !institutionId || !role) {
      res.status(400).json({ error: 'All required fields must be provided' });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters' });
      return;
    }

    if (!['student', 'teacher', 'institution_admin'].includes(role)) {
      res.status(400).json({ error: 'Invalid role specified' });
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({ error: 'Invalid email format' });
      return;
    }

    // Validate institution exists and is active
    const institution = await institutionService.getInstitutionById(institutionId);
    if (!institution) {
      res.status(404).json({ error: 'Institution not found' });
      return;
    }

    if (institution.status !== 'active') {
      res.status(400).json({ error: 'Institution is not currently accepting registrations' });
      return;
    }

    // Role-specific validation (Requirement 13.3)
    const roleValidation = validateRoleSpecificData(role, profileData || {});
    if (!roleValidation.isValid) {
      res.status(400).json({ 
        error: 'Role-specific validation failed',
        details: roleValidation.errors
      });
      return;
    }

    const userData: UserRegistrationData = {
      email: email.toLowerCase().trim(),
      password,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      role,
      profileData: profileData || {}
    };

    // Register user for institution (creates pending registration)
    const pendingUser = await userService.registerUser(userData, institutionId);

    // Send notification to institution administrators
    await notifyInstitutionAdmins(institutionId, {
      type: 'new_registration',
      userEmail: email,
      userName: `${firstName} ${lastName}`,
      role: role,
      institutionName: institution.name,
      submittedAt: new Date()
    });

    res.status(201).json({
      message: 'Registration submitted successfully. You will receive an email once your registration is reviewed.',
      registration: {
        userId: pendingUser.userId,
        institutionId: pendingUser.institutionId,
        institutionName: institution.name,
        role: pendingUser.role,
        status: pendingUser.status,
        submittedAt: pendingUser.createdAt
      }
    });
  } catch (error) {
    console.error('Multi-institutional registration error:', error);
    
    if ((error as Error).message.includes('already registered')) {
      res.status(409).json({ error: 'User is already registered for this institution' });
      return;
    }
    
    if ((error as Error).message.includes('Institution not found')) {
      res.status(404).json({ error: 'Institution not found' });
      return;
    }
    
    if ((error as Error).message.includes('not active')) {
      res.status(400).json({ error: 'Institution is not currently accepting registrations' });
      return;
    }

    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
};

/**
 * Login with institutional context selection
 */
export const loginWithInstitution = async (req: InstitutionalLoginRequest, res: Response): Promise<void> => {
  try {
    const { email, password, institutionId } = req.body;
    
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }
    
    const user = await userService.getUserByEmail(email.toLowerCase().trim());
    if (!user || !await user.comparePassword(password)) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    if (!user.isActive) {
      res.status(401).json({ error: 'Account is deactivated' });
      return;
    }

    // Get user's institutions
    const userInstitutions = await userService.getUserInstitutions(user._id.toString());
    const activeInstitutions = userInstitutions.filter(inst => inst.status === 'active');

    if (activeInstitutions.length === 0) {
      res.status(403).json({ 
        error: 'No active institutional access. Please contact your institution administrator.' 
      });
      return;
    }

    // If institutionId is provided, validate access
    if (institutionId) {
      const hasAccess = await userService.hasInstitutionalAccess(user._id.toString(), institutionId);
      if (!hasAccess) {
        res.status(403).json({ error: 'Access denied to the specified institution' });
        return;
      }

      const selectedInstitution = activeInstitutions.find(inst => inst.institutionId === institutionId);
      if (!selectedInstitution) {
        res.status(403).json({ error: 'Access denied to the specified institution' });
        return;
      }

      // Update last login
      user.lastLogin = new Date();
      await user.save();

      const token = generateToken(user._id.toString());
      
      res.json({
        token,
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          currentInstitution: selectedInstitution
        },
        institutionalContext: selectedInstitution
      });
      return;
    }

    // If no institutionId provided, return available institutions for selection
    if (activeInstitutions.length === 1) {
      // Auto-select if only one institution
      const institution = activeInstitutions[0];
      user.lastLogin = new Date();
      await user.save();

      const token = generateToken(user._id.toString());
      
      res.json({
        token,
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          currentInstitution: institution
        },
        institutionalContext: institution
      });
    } else {
      // Multiple institutions - require selection
      res.json({
        requireInstitutionSelection: true,
        availableInstitutions: activeInstitutions,
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName
        }
      });
    }
  } catch (error) {
    console.error('Institutional login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
};

/**
 * Get pending registrations for an institution (admin only)
 */
export const getPendingRegistrations = async (req: Request, res: Response): Promise<void> => {
  try {
    const { institutionId } = req.params;
    
    if (!institutionId) {
      res.status(400).json({ error: 'Institution ID is required' });
      return;
    }

    // TODO: Add authentication middleware to verify admin access
    // For now, we'll assume the request is authenticated and authorized

    const pendingUsers = await userService.getPendingRegistrations(institutionId);
    
    // Get institution details for timeout calculation
    const institution = await institutionService.getInstitutionById(institutionId);
    const timeoutDays = institution?.settings?.enrollmentPolicies?.registrationTimeoutDays || 7;
    const timeoutMs = timeoutDays * 24 * 60 * 60 * 1000;
    
    const pendingRegistrations = pendingUsers.map(user => {
      const institutionProfile = user.institutions.find(
        inst => inst.institutionId.toString() === institutionId && inst.status === 'pending'
      );
      
      const submittedAt = institutionProfile?.createdAt || new Date();
      const timeoutAt = new Date(submittedAt.getTime() + timeoutMs);
      const isOverdue = new Date() > timeoutAt;
      const daysRemaining = Math.ceil((timeoutAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
      
      return {
        userId: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: institutionProfile?.role,
        profileData: institutionProfile?.profileData,
        submittedAt: submittedAt,
        timeoutAt: timeoutAt,
        isOverdue: isOverdue,
        daysRemaining: Math.max(0, daysRemaining),
        urgency: isOverdue ? 'overdue' : (daysRemaining <= 2 ? 'urgent' : 'normal')
      };
    });

    // Sort by urgency and submission date
    pendingRegistrations.sort((a, b) => {
      if (a.urgency === 'overdue' && b.urgency !== 'overdue') return -1;
      if (b.urgency === 'overdue' && a.urgency !== 'overdue') return 1;
      if (a.urgency === 'urgent' && b.urgency === 'normal') return -1;
      if (b.urgency === 'urgent' && a.urgency === 'normal') return 1;
      return a.submittedAt.getTime() - b.submittedAt.getTime();
    });

    res.json({
      pendingRegistrations,
      count: pendingRegistrations.length,
      summary: {
        total: pendingRegistrations.length,
        overdue: pendingRegistrations.filter(r => r.urgency === 'overdue').length,
        urgent: pendingRegistrations.filter(r => r.urgency === 'urgent').length,
        normal: pendingRegistrations.filter(r => r.urgency === 'normal').length
      },
      settings: {
        timeoutDays: timeoutDays
      }
    });
  } catch (error) {
    console.error('Get pending registrations error:', error);
    res.status(500).json({ error: 'Failed to retrieve pending registrations' });
  }
};

/**
 * Approve a user registration for an institution (admin only)
 */
export const approveRegistration = async (req: ApproveRegistrationRequest, res: Response): Promise<void> => {
  try {
    const { userId, institutionId } = req.body;
    
    if (!userId || !institutionId) {
      res.status(400).json({ error: 'User ID and Institution ID are required' });
      return;
    }

    // TODO: Add authentication middleware to verify admin access
    // const approvedBy = req.user.id; // From auth middleware
    const approvedBy = (req.body as any).approvedBy; // Temporary for testing

    const approvedUser = await userService.approveUserRegistration(userId, institutionId, approvedBy);
    
    // Get institution details for notification
    const institution = await institutionService.getInstitutionById(institutionId);
    const approverUser = approvedBy ? await userService.getUserById(approvedBy) : null;

    // Send approval notification
    await notifyInstitutionAdmins(institutionId, {
      type: 'approval',
      userEmail: approvedUser.email,
      userName: `${approvedUser.firstName} ${approvedUser.lastName}`,
      role: approvedUser.institutions.find(inst => inst.institutionId.toString() === institutionId)?.role || 'unknown',
      institutionName: institution?.name || 'Unknown Institution',
      adminName: approverUser ? `${approverUser.firstName} ${approverUser.lastName}` : 'System Administrator'
    });

    // TODO: Send welcome email to approved user
    console.log(`✅ User ${approvedUser.email} approved for institution ${institutionId}`);

    res.json({
      message: 'User registration approved successfully',
      user: {
        id: approvedUser._id,
        email: approvedUser.email,
        firstName: approvedUser.firstName,
        lastName: approvedUser.lastName,
        approvedAt: new Date()
      }
    });
  } catch (error) {
    console.error('Approve registration error:', error);
    
    if ((error as Error).message.includes('not found')) {
      res.status(404).json({ error: 'User or registration not found' });
      return;
    }
    
    if ((error as Error).message.includes('not pending')) {
      res.status(400).json({ error: 'Registration is not in pending status' });
      return;
    }

    res.status(500).json({ error: 'Failed to approve registration' });
  }
};

/**
 * Reject a user registration for an institution (admin only)
 */
export const rejectRegistration = async (req: RejectRegistrationRequest, res: Response): Promise<void> => {
  try {
    const { userId, institutionId, reason } = req.body;
    
    if (!userId || !institutionId) {
      res.status(400).json({ error: 'User ID and Institution ID are required' });
      return;
    }

    // TODO: Add authentication middleware to verify admin access
    const rejectedBy = (req.body as any).rejectedBy; // Temporary for testing

    // Find the user and remove the pending institutional profile
    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const institutionIndex = user.institutions.findIndex(
      inst => inst.institutionId.toString() === institutionId && inst.status === 'pending'
    );

    if (institutionIndex === -1) {
      res.status(404).json({ error: 'Pending registration not found' });
      return;
    }

    const rejectedProfile = user.institutions[institutionIndex];

    // Remove the pending institutional profile
    user.institutions.splice(institutionIndex, 1);
    await user.save();

    // Get institution and rejecter details for notification
    const institution = await institutionService.getInstitutionById(institutionId);
    const rejecterUser = rejectedBy ? await userService.getUserById(rejectedBy) : null;

    // Send rejection notification
    await notifyInstitutionAdmins(institutionId, {
      type: 'rejection',
      userEmail: user.email,
      userName: `${user.firstName} ${user.lastName}`,
      role: rejectedProfile.role,
      institutionName: institution?.name || 'Unknown Institution',
      reason: reason || 'Not specified',
      adminName: rejecterUser ? `${rejecterUser.firstName} ${rejecterUser.lastName}` : 'System Administrator'
    });

    // TODO: Send rejection email to user with reason
    console.log(`❌ User ${user.email} registration rejected for institution ${institutionId}. Reason: ${reason || 'Not specified'}`);

    res.json({
      message: 'User registration rejected',
      rejectedUser: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        reason: reason || 'Not specified'
      }
    });
  } catch (error) {
    console.error('Reject registration error:', error);
    res.status(500).json({ error: 'Failed to reject registration' });
  }
};

/**
 * Switch institutional context for multi-institutional users
 */
export const switchInstitution = async (req: SwitchInstitutionRequest, res: Response): Promise<void> => {
  try {
    const { institutionId } = req.body;
    
    if (!institutionId) {
      res.status(400).json({ error: 'Institution ID is required' });
      return;
    }

    // TODO: Get user ID from authentication middleware
    // const userId = req.user.id;
    
    // For now, we'll expect userId in the request body for testing
    const userId = (req.body as any).userId;
    if (!userId) {
      res.status(400).json({ error: 'User ID is required' });
      return;
    }

    // Validate user has access to the institution
    const hasAccess = await userService.hasInstitutionalAccess(userId, institutionId);
    if (!hasAccess) {
      res.status(403).json({ error: 'Access denied to the specified institution' });
      return;
    }

    // Get the institutional context
    const userInstitutions = await userService.getUserInstitutions(userId);
    const targetInstitution = userInstitutions.find(inst => 
      inst.institutionId === institutionId && inst.status === 'active'
    );

    if (!targetInstitution) {
      res.status(403).json({ error: 'Access denied to the specified institution' });
      return;
    }

    // Generate new token with updated context
    const token = generateToken(userId);

    res.json({
      message: 'Institution context switched successfully',
      token,
      institutionalContext: targetInstitution
    });
  } catch (error) {
    console.error('Switch institution error:', error);
    res.status(500).json({ error: 'Failed to switch institution' });
  }
};

/**
 * Get role-specific registration fields for an institution
 */
export const getRoleRegistrationFields = async (req: Request, res: Response): Promise<void> => {
  try {
    const { institutionId, role } = req.params;
    
    if (!institutionId || !role) {
      res.status(400).json({ error: 'Institution ID and role are required' });
      return;
    }

    if (!['student', 'teacher', 'institution_admin'].includes(role)) {
      res.status(400).json({ error: 'Invalid role specified' });
      return;
    }

    // Validate institution exists and is active
    const institution = await institutionService.getInstitutionById(institutionId);
    if (!institution) {
      res.status(404).json({ error: 'Institution not found' });
      return;
    }

    if (institution.status !== 'active') {
      res.status(400).json({ error: 'Institution is not currently accepting registrations' });
      return;
    }

    // Define role-specific fields (Requirement 13.2)
    const roleFields = {
      student: {
        required: ['firstName', 'lastName', 'email', 'password'],
        optional: [
          { name: 'studentId', type: 'text', label: 'Student ID', placeholder: 'Enter your student ID (if known)' },
          { name: 'major', type: 'text', label: 'Intended Major', placeholder: 'e.g., Computer Science' },
          { name: 'year', type: 'select', label: 'Academic Year', options: ['freshman', 'sophomore', 'junior', 'senior', 'graduate'] },
          { name: 'expectedGraduation', type: 'date', label: 'Expected Graduation Date' },
          { name: 'phoneNumber', type: 'tel', label: 'Phone Number', placeholder: '(555) 123-4567' },
          { name: 'emergencyContact', type: 'text', label: 'Emergency Contact', placeholder: 'Name and phone number' }
        ],
        description: 'Student registration requires basic academic information. Additional details can be updated after approval.'
      },
      teacher: {
        required: ['firstName', 'lastName', 'email', 'password'],
        optional: [
          { name: 'employeeId', type: 'text', label: 'Employee ID', placeholder: 'Enter your employee ID (if known)' },
          { name: 'department', type: 'text', label: 'Department', placeholder: 'e.g., Computer Science' },
          { name: 'title', type: 'text', label: 'Academic Title', placeholder: 'e.g., Assistant Professor' },
          { name: 'specializations', type: 'textarea', label: 'Specializations', placeholder: 'List your areas of expertise (comma-separated)' },
          { name: 'officeLocation', type: 'text', label: 'Office Location', placeholder: 'e.g., Building A, Room 123' },
          { name: 'phoneNumber', type: 'tel', label: 'Office Phone', placeholder: '(555) 123-4567' },
          { name: 'biography', type: 'textarea', label: 'Professional Biography', placeholder: 'Brief professional background' }
        ],
        description: 'Teacher registration requires professional information. Your department head will review and approve your application.'
      },
      institution_admin: {
        required: ['firstName', 'lastName', 'email', 'password'],
        optional: [
          { name: 'adminLevel', type: 'select', label: 'Administrative Level', options: ['department', 'college', 'institution'] },
          { name: 'department', type: 'text', label: 'Department/Division', placeholder: 'e.g., Registrar, IT Services' },
          { name: 'title', type: 'text', label: 'Job Title', placeholder: 'e.g., Department Administrator' },
          { name: 'permissions', type: 'textarea', label: 'Requested Permissions', placeholder: 'Describe the administrative functions you need access to' },
          { name: 'phoneNumber', type: 'tel', label: 'Office Phone', placeholder: '(555) 123-4567' },
          { name: 'justification', type: 'textarea', label: 'Access Justification', placeholder: 'Explain why you need administrative access' }
        ],
        description: 'Administrative access requires approval from existing institution administrators. Please provide detailed justification for your access request.'
      }
    };

    res.json({
      institution: {
        id: institution._id,
        name: institution.name,
        type: institution.type
      },
      role,
      fields: roleFields[role as keyof typeof roleFields],
      validationRules: {
        email: 'Must be a valid email address',
        password: 'Must be at least 8 characters long',
        firstName: 'Required field',
        lastName: 'Required field'
      }
    });
  } catch (error) {
    console.error('Get role registration fields error:', error);
    res.status(500).json({ error: 'Failed to retrieve registration fields' });
  }
};

/**
 * Send timeout reminders for pending registrations (admin or system cron job)
 */
export const sendTimeoutReminders = async (req: Request, res: Response): Promise<void> => {
  try {
    const { institutionId } = req.params;
    
    if (!institutionId) {
      res.status(400).json({ error: 'Institution ID is required' });
      return;
    }

    // Get institution settings for timeout configuration
    const institution = await institutionService.getInstitutionById(institutionId);
    if (!institution) {
      res.status(404).json({ error: 'Institution not found' });
      return;
    }

    const timeoutDays = institution.settings?.enrollmentPolicies?.registrationTimeoutDays || 7;
    const reminderDays = institution.settings?.enrollmentPolicies?.reminderDays || 2;
    const timeoutMs = timeoutDays * 24 * 60 * 60 * 1000;
    const reminderMs = reminderDays * 24 * 60 * 60 * 1000;

    const pendingUsers = await userService.getPendingRegistrations(institutionId);
    const remindersToSend = [];

    for (const user of pendingUsers) {
      const institutionProfile = user.institutions.find(
        inst => inst.institutionId.toString() === institutionId && inst.status === 'pending'
      );
      
      if (institutionProfile) {
        const submittedAt = institutionProfile.createdAt;
        const timeoutAt = new Date(submittedAt.getTime() + timeoutMs);
        const reminderAt = new Date(timeoutAt.getTime() - reminderMs);
        const now = new Date();

        // Send reminder if we're past the reminder time but before timeout
        if (now >= reminderAt && now < timeoutAt) {
          await notifyInstitutionAdmins(institutionId, {
            type: 'timeout_reminder',
            userEmail: user.email,
            userName: `${user.firstName} ${user.lastName}`,
            role: institutionProfile.role,
            institutionName: institution.name,
            submittedAt: submittedAt
          });

          remindersToSend.push({
            userId: user._id,
            email: user.email,
            name: `${user.firstName} ${user.lastName}`,
            role: institutionProfile.role,
            submittedAt: submittedAt,
            timeoutAt: timeoutAt
          });
        }
      }
    }

    res.json({
      message: `Sent ${remindersToSend.length} timeout reminders`,
      reminders: remindersToSend,
      settings: {
        timeoutDays: timeoutDays,
        reminderDays: reminderDays
      }
    });
  } catch (error) {
    console.error('Send timeout reminders error:', error);
    res.status(500).json({ error: 'Failed to send timeout reminders' });
  }
};

/**
 * Get user's institutional profiles
 */
export const getUserInstitutions = async (req: Request, res: Response): Promise<void> => {
  try {
    // TODO: Get user ID from authentication middleware
    // const userId = req.user.id;
    
    const userId = req.params.userId;
    if (!userId) {
      res.status(400).json({ error: 'User ID is required' });
      return;
    }

    const userInstitutions = await userService.getUserInstitutions(userId);

    res.json({
      institutions: userInstitutions,
      count: userInstitutions.length
    });
  } catch (error) {
    console.error('Get user institutions error:', error);
    
    if ((error as Error).message.includes('not found')) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.status(500).json({ error: 'Failed to retrieve user institutions' });
  }
};

/**
 * Clean up expired pending registrations (admin or system cron job)
 */
export const cleanupExpiredRegistrations = async (req: Request, res: Response): Promise<void> => {
  try {
    const { institutionId } = req.params;
    
    if (!institutionId) {
      res.status(400).json({ error: 'Institution ID is required' });
      return;
    }

    // Get institution settings for timeout configuration
    const institution = await institutionService.getInstitutionById(institutionId);
    if (!institution) {
      res.status(404).json({ error: 'Institution not found' });
      return;
    }

    const timeoutDays = institution.settings?.enrollmentPolicies?.registrationTimeoutDays || 7;
    const timeoutMs = timeoutDays * 24 * 60 * 60 * 1000;

    const pendingUsers = await userService.getPendingRegistrations(institutionId);
    const expiredRegistrations = [];

    for (const user of pendingUsers) {
      const institutionProfile = user.institutions.find(
        inst => inst.institutionId.toString() === institutionId && inst.status === 'pending'
      );
      
      if (institutionProfile) {
        const submittedAt = institutionProfile.createdAt;
        const timeoutAt = new Date(submittedAt.getTime() + timeoutMs);
        const now = new Date();

        // Remove expired registrations
        if (now > timeoutAt) {
          const institutionIndex = user.institutions.findIndex(
            inst => inst.institutionId.toString() === institutionId && inst.status === 'pending'
          );

          if (institutionIndex !== -1) {
            user.institutions.splice(institutionIndex, 1);
            await user.save();

            expiredRegistrations.push({
              userId: user._id,
              email: user.email,
              name: `${user.firstName} ${user.lastName}`,
              role: institutionProfile.role,
              submittedAt: submittedAt,
              expiredAt: now
            });

            // TODO: Send expiration notification to user
            console.log(`⏰ Registration expired for ${user.email} at institution ${institutionId}`);
          }
        }
      }
    }

    res.json({
      message: `Cleaned up ${expiredRegistrations.length} expired registrations`,
      expiredRegistrations: expiredRegistrations,
      settings: {
        timeoutDays: timeoutDays
      }
    });
  } catch (error) {
    console.error('Cleanup expired registrations error:', error);
    res.status(500).json({ error: 'Failed to cleanup expired registrations' });
  }
};