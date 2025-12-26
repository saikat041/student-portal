import mongoose from 'mongoose';
import Institution, { IInstitution } from '../models/Institution';
import User, { IUser } from '../models/User';

export interface InstitutionRegistrationData {
  name: string;
  type: 'university' | 'college' | 'school';
  address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
  };
  contactInfo: {
    email: string;
    phone: string;
  };
  settings?: {
    academicYear?: string;
    semesterSystem?: 'semester' | 'quarter' | 'trimester';
    enrollmentPolicies?: Record<string, any>;
  };
  branding?: {
    primaryColor?: string;
    logo?: string;
    theme?: string;
  };
}

export interface InstitutionSettings {
  academicYear?: string;
  semesterSystem?: 'semester' | 'quarter' | 'trimester';
  enrollmentPolicies?: Record<string, any>;
  branding?: {
    primaryColor?: string;
    logo?: string;
    theme?: string;
  };
}

export class InstitutionService {
  private static instance: InstitutionService;

  private constructor() {}

  public static getInstance(): InstitutionService {
    if (!InstitutionService.instance) {
      InstitutionService.instance = new InstitutionService();
    }
    return InstitutionService.instance;
  }

  /**
   * Register a new institution with validation and setup
   */
  async registerInstitution(details: InstitutionRegistrationData): Promise<IInstitution> {
    // Validate required fields
    this.validateRegistrationData(details);

    // Check for name uniqueness
    const existingInstitution = await Institution.findOne({ 
      name: { $regex: new RegExp(`^${details.name}$`, 'i') } 
    });
    
    if (existingInstitution) {
      throw new Error('Institution name already exists');
    }

    // Create institution with default settings
    const institutionData = {
      ...details,
      settings: {
        academicYear: details.settings?.academicYear || '2024-2025',
        semesterSystem: details.settings?.semesterSystem || 'semester',
        enrollmentPolicies: {
          registrationTimeoutDays: 7,
          reminderDays: 2,
          maxPendingRegistrations: 100,
          autoApprovalEnabled: false,
          ...details.settings?.enrollmentPolicies
        }
      },
      branding: {
        primaryColor: details.branding?.primaryColor || '#007bff',
        logo: details.branding?.logo || '',
        theme: details.branding?.theme || 'default'
      },
      status: 'active' as const
    };

    const institution = new Institution(institutionData);
    await institution.save();

    return institution;
  }

  /**
   * Get institution by ID
   */
  async getInstitutionById(institutionId: string): Promise<IInstitution | null> {
    if (!mongoose.Types.ObjectId.isValid(institutionId)) {
      throw new Error('Invalid institution ID format');
    }

    return await Institution.findById(institutionId);
  }

  /**
   * Get institution by name
   */
  async getInstitutionByName(name: string): Promise<IInstitution | null> {
    return await Institution.findOne({ 
      name: { $regex: new RegExp(`^${name}$`, 'i') } 
    });
  }

  /**
   * Get list of all institutions with optional filtering
   */
  async getInstitutionList(filter: { status?: string; type?: string } = {}): Promise<IInstitution[]> {
    const query: any = {};
    
    if (filter.status) {
      query.status = filter.status;
    }
    
    if (filter.type) {
      query.type = filter.type;
    }

    return await Institution.find(query).sort({ name: 1 });
  }

  /**
   * Update institution settings
   */
  async updateInstitutionSettings(
    institutionId: string, 
    settings: InstitutionSettings
  ): Promise<IInstitution> {
    if (!mongoose.Types.ObjectId.isValid(institutionId)) {
      throw new Error('Invalid institution ID format');
    }

    const institution = await Institution.findById(institutionId);
    if (!institution) {
      throw new Error('Institution not found');
    }

    // Update settings
    if (settings.academicYear) {
      institution.settings.academicYear = settings.academicYear;
    }
    
    if (settings.semesterSystem) {
      institution.settings.semesterSystem = settings.semesterSystem;
    }
    
    if (settings.enrollmentPolicies) {
      institution.settings.enrollmentPolicies = {
        ...institution.settings.enrollmentPolicies,
        ...settings.enrollmentPolicies
      };
    }

    // Update branding
    if (settings.branding) {
      institution.branding = {
        ...institution.branding,
        ...settings.branding
      };
    }

    await institution.save();
    return institution;
  }

  /**
   * Update institution status (active/inactive/suspended)
   */
  async updateInstitutionStatus(
    institutionId: string, 
    status: 'active' | 'inactive' | 'suspended'
  ): Promise<IInstitution> {
    if (!mongoose.Types.ObjectId.isValid(institutionId)) {
      throw new Error('Invalid institution ID format');
    }

    const institution = await Institution.findById(institutionId);
    if (!institution) {
      throw new Error('Institution not found');
    }

    institution.status = status;
    await institution.save();

    return institution;
  }

  /**
   * Deactivate institution (preserves data but prevents new operations)
   */
  async deactivateInstitution(institutionId: string): Promise<IInstitution> {
    return await this.updateInstitutionStatus(institutionId, 'inactive');
  }

  /**
   * Suspend institution (temporary deactivation)
   */
  async suspendInstitution(institutionId: string): Promise<IInstitution> {
    return await this.updateInstitutionStatus(institutionId, 'suspended');
  }

  /**
   * Reactivate institution
   */
  async reactivateInstitution(institutionId: string): Promise<IInstitution> {
    return await this.updateInstitutionStatus(institutionId, 'active');
  }

  /**
   * Assign institution administrator
   */
  async assignInstitutionAdmin(institutionId: string, userId: string): Promise<void> {
    if (!mongoose.Types.ObjectId.isValid(institutionId) || !mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error('Invalid institution ID or user ID format');
    }

    const institution = await Institution.findById(institutionId);
    if (!institution) {
      throw new Error('Institution not found');
    }

    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Check if user already has a profile at this institution
    const existingProfile = user.institutions.find(
      inst => inst.institutionId.toString() === institutionId
    );

    if (existingProfile) {
      // Update existing profile to admin role
      existingProfile.role = 'institution_admin';
      existingProfile.status = 'active';
    } else {
      // Create new institutional profile
      user.institutions.push({
        institutionId: new mongoose.Types.ObjectId(institutionId),
        role: 'institution_admin',
        status: 'active',
        profileData: {},
        createdAt: new Date(),
        approvedAt: new Date(),
        approvedBy: new mongoose.Types.ObjectId(userId) // Self-approved for admin assignment
      });
    }

    await user.save();
  }

  /**
   * Get institution statistics
   */
  async getInstitutionStatistics(institutionId: string): Promise<{
    totalUsers: number;
    activeUsers: number;
    pendingUsers: number;
    totalCourses: number;
    totalEnrollments: number;
  }> {
    if (!mongoose.Types.ObjectId.isValid(institutionId)) {
      throw new Error('Invalid institution ID format');
    }

    const institutionObjectId = new mongoose.Types.ObjectId(institutionId);

    // Count users with profiles at this institution
    const userStats = await User.aggregate([
      { $unwind: '$institutions' },
      { $match: { 'institutions.institutionId': institutionObjectId } },
      {
        $group: {
          _id: '$institutions.status',
          count: { $sum: 1 }
        }
      }
    ]);

    const totalUsers = userStats.reduce((sum, stat) => sum + stat.count, 0);
    const activeUsers = userStats.find(stat => stat._id === 'active')?.count || 0;
    const pendingUsers = userStats.find(stat => stat._id === 'pending')?.count || 0;

    // Count courses (if Course model exists)
    let totalCourses = 0;
    try {
      const Course = mongoose.model('Course');
      totalCourses = await Course.countDocuments({ institutionId: institutionObjectId });
    } catch (error) {
      // Course model doesn't exist yet
    }

    // Count enrollments (if Enrollment model exists)
    let totalEnrollments = 0;
    try {
      const Enrollment = mongoose.model('Enrollment');
      totalEnrollments = await Enrollment.countDocuments({ institutionId: institutionObjectId });
    } catch (error) {
      // Enrollment model doesn't exist yet
    }

    return {
      totalUsers,
      activeUsers,
      pendingUsers,
      totalCourses,
      totalEnrollments
    };
  }

  /**
   * Delete institution (use with extreme caution)
   */
  async deleteInstitution(institutionId: string): Promise<void> {
    if (!mongoose.Types.ObjectId.isValid(institutionId)) {
      throw new Error('Invalid institution ID format');
    }

    const institution = await Institution.findById(institutionId);
    if (!institution) {
      throw new Error('Institution not found');
    }

    // Check if institution has any users
    const userCount = await User.countDocuments({
      'institutions.institutionId': new mongoose.Types.ObjectId(institutionId)
    });

    if (userCount > 0) {
      throw new Error('Cannot delete institution with existing users. Deactivate instead.');
    }

    await Institution.findByIdAndDelete(institutionId);
  }

  /**
   * Validate institution registration data
   */
  private validateRegistrationData(details: InstitutionRegistrationData): void {
    if (!details.name || details.name.trim().length === 0) {
      throw new Error('Institution name is required');
    }

    if (!details.type || !['university', 'college', 'school'].includes(details.type)) {
      throw new Error('Valid institution type is required');
    }

    if (!details.address || !details.address.street || !details.address.city || 
        !details.address.state || !details.address.zipCode) {
      throw new Error('Complete address is required');
    }

    if (!details.contactInfo || !details.contactInfo.email || !details.contactInfo.phone) {
      throw new Error('Contact information (email and phone) is required');
    }

    // Validate email format
    const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
    if (!emailRegex.test(details.contactInfo.email)) {
      throw new Error('Valid email address is required');
    }
  }
}

// Export both the class and a default instance
export const institutionService = InstitutionService.getInstance();
export default institutionService;