import mongoose from 'mongoose';
import Institution, { IInstitution } from '../models/Institution';

export interface AcademicCalendar {
  academicYear: string;
  semesterSystem: 'semester' | 'quarter' | 'trimester';
  semesters: Array<{
    name: string;
    startDate: Date;
    endDate: Date;
    registrationStart: Date;
    registrationEnd: Date;
    dropDeadline: Date;
    finalExamsStart: Date;
    finalExamsEnd: Date;
  }>;
  holidays: Array<{
    name: string;
    startDate: Date;
    endDate: Date;
    type: 'holiday' | 'break' | 'closure';
  }>;
}

export interface EnrollmentPolicies {
  registrationTimeoutDays: number;
  reminderDays: number;
  maxPendingRegistrations: number;
  autoApprovalEnabled: boolean;
  maxCoursesPerSemester: number;
  minCreditsPerSemester: number;
  maxCreditsPerSemester: number;
  allowLateRegistration: boolean;
  lateRegistrationFee: number;
  dropWithoutPenaltyDays: number;
  withdrawalDeadlineDays: number;
  gradeSubmissionDeadlineDays: number;
  transcriptRequestProcessingDays: number;
}

export interface NotificationSettings {
  emailNotifications: {
    registrationApproval: boolean;
    enrollmentConfirmation: boolean;
    gradePosted: boolean;
    paymentDue: boolean;
    systemMaintenance: boolean;
  };
  smsNotifications: {
    urgentAlerts: boolean;
    paymentReminders: boolean;
    registrationDeadlines: boolean;
  };
  pushNotifications: {
    enabled: boolean;
    courseUpdates: boolean;
    announcements: boolean;
  };
}

export interface SecuritySettings {
  passwordPolicy: {
    minLength: number;
    requireUppercase: boolean;
    requireLowercase: boolean;
    requireNumbers: boolean;
    requireSpecialChars: boolean;
    passwordExpireDays: number;
    preventReuse: number;
  };
  sessionSettings: {
    sessionTimeoutMinutes: number;
    maxConcurrentSessions: number;
    requireReauthForSensitive: boolean;
  };
  accessControl: {
    allowedIPRanges: string[];
    blockSuspiciousActivity: boolean;
    maxFailedLoginAttempts: number;
    lockoutDurationMinutes: number;
  };
}

export interface InstitutionalSettings {
  academicCalendar?: AcademicCalendar;
  enrollmentPolicies?: EnrollmentPolicies;
  notificationSettings?: NotificationSettings;
  securitySettings?: SecuritySettings;
  customSettings?: Record<string, any>;
}

export class SettingsService {
  private static instance: SettingsService;

  private constructor() {}

  public static getInstance(): SettingsService {
    if (!SettingsService.instance) {
      SettingsService.instance = new SettingsService();
    }
    return SettingsService.instance;
  }

  /**
   * Get complete institutional settings
   */
  async getInstitutionalSettings(institutionId: string): Promise<InstitutionalSettings | null> {
    if (!mongoose.Types.ObjectId.isValid(institutionId)) {
      throw new Error('Invalid institution ID format');
    }

    const institution = await Institution.findById(institutionId);
    if (!institution) {
      return null;
    }

    return {
      academicCalendar: institution.settings.academicCalendar,
      enrollmentPolicies: institution.settings.enrollmentPolicies,
      notificationSettings: institution.settings.notificationSettings,
      securitySettings: institution.settings.securitySettings,
      customSettings: institution.settings.customSettings
    };
  }

  /**
   * Update academic calendar settings
   */
  async updateAcademicCalendar(
    institutionId: string, 
    calendar: Partial<AcademicCalendar>
  ): Promise<AcademicCalendar> {
    if (!mongoose.Types.ObjectId.isValid(institutionId)) {
      throw new Error('Invalid institution ID format');
    }

    const institution = await Institution.findById(institutionId);
    if (!institution) {
      throw new Error('Institution not found');
    }

    // Validate calendar data
    this.validateAcademicCalendar(calendar);

    // Update academic calendar
    const currentCalendar = institution.settings.academicCalendar || this.getDefaultAcademicCalendar();
    const updatedCalendar = {
      ...currentCalendar,
      ...calendar
    };

    institution.settings.academicCalendar = updatedCalendar;
    await institution.save();

    return updatedCalendar;
  }

  /**
   * Update enrollment policies
   */
  async updateEnrollmentPolicies(
    institutionId: string, 
    policies: Partial<EnrollmentPolicies>
  ): Promise<EnrollmentPolicies> {
    if (!mongoose.Types.ObjectId.isValid(institutionId)) {
      throw new Error('Invalid institution ID format');
    }

    const institution = await Institution.findById(institutionId);
    if (!institution) {
      throw new Error('Institution not found');
    }

    // Validate policies
    this.validateEnrollmentPolicies(policies);

    // Update enrollment policies
    const currentPolicies = institution.settings.enrollmentPolicies || this.getDefaultEnrollmentPolicies();
    const updatedPolicies = {
      ...currentPolicies,
      ...policies
    };

    institution.settings.enrollmentPolicies = updatedPolicies;
    await institution.save();

    return updatedPolicies;
  }

  /**
   * Update notification settings
   */
  async updateNotificationSettings(
    institutionId: string, 
    settings: Partial<NotificationSettings>
  ): Promise<NotificationSettings> {
    if (!mongoose.Types.ObjectId.isValid(institutionId)) {
      throw new Error('Invalid institution ID format');
    }

    const institution = await Institution.findById(institutionId);
    if (!institution) {
      throw new Error('Institution not found');
    }

    // Update notification settings
    const currentSettings = institution.settings.notificationSettings || this.getDefaultNotificationSettings();
    const updatedSettings = {
      ...currentSettings,
      ...settings,
      emailNotifications: {
        ...currentSettings.emailNotifications,
        ...settings.emailNotifications
      },
      smsNotifications: {
        ...currentSettings.smsNotifications,
        ...settings.smsNotifications
      },
      pushNotifications: {
        ...currentSettings.pushNotifications,
        ...settings.pushNotifications
      }
    };

    institution.settings.notificationSettings = updatedSettings;
    await institution.save();

    return updatedSettings;
  }

  /**
   * Update security settings
   */
  async updateSecuritySettings(
    institutionId: string, 
    settings: Partial<SecuritySettings>
  ): Promise<SecuritySettings> {
    if (!mongoose.Types.ObjectId.isValid(institutionId)) {
      throw new Error('Invalid institution ID format');
    }

    const institution = await Institution.findById(institutionId);
    if (!institution) {
      throw new Error('Institution not found');
    }

    // Validate security settings
    this.validateSecuritySettings(settings);

    // Update security settings
    const currentSettings = institution.settings.securitySettings || this.getDefaultSecuritySettings();
    const updatedSettings = {
      ...currentSettings,
      ...settings,
      passwordPolicy: {
        ...currentSettings.passwordPolicy,
        ...settings.passwordPolicy
      },
      sessionSettings: {
        ...currentSettings.sessionSettings,
        ...settings.sessionSettings
      },
      accessControl: {
        ...currentSettings.accessControl,
        ...settings.accessControl
      }
    };

    institution.settings.securitySettings = updatedSettings;
    await institution.save();

    return updatedSettings;
  }

  /**
   * Update custom settings
   */
  async updateCustomSettings(
    institutionId: string, 
    customSettings: Record<string, any>
  ): Promise<Record<string, any>> {
    if (!mongoose.Types.ObjectId.isValid(institutionId)) {
      throw new Error('Invalid institution ID format');
    }

    const institution = await Institution.findById(institutionId);
    if (!institution) {
      throw new Error('Institution not found');
    }

    // Update custom settings
    const currentCustomSettings = institution.settings.customSettings || {};
    const updatedCustomSettings = {
      ...currentCustomSettings,
      ...customSettings
    };

    institution.settings.customSettings = updatedCustomSettings;
    await institution.save();

    return updatedCustomSettings;
  }

  /**
   * Reset settings to default values
   */
  async resetSettingsToDefault(institutionId: string): Promise<InstitutionalSettings> {
    if (!mongoose.Types.ObjectId.isValid(institutionId)) {
      throw new Error('Invalid institution ID format');
    }

    const institution = await Institution.findById(institutionId);
    if (!institution) {
      throw new Error('Institution not found');
    }

    // Reset to default settings
    institution.settings = {
      academicYear: '2024-2025',
      semesterSystem: 'semester',
      academicCalendar: this.getDefaultAcademicCalendar(),
      enrollmentPolicies: this.getDefaultEnrollmentPolicies(),
      notificationSettings: this.getDefaultNotificationSettings(),
      securitySettings: this.getDefaultSecuritySettings(),
      customSettings: {}
    };

    await institution.save();

    return {
      academicCalendar: institution.settings.academicCalendar,
      enrollmentPolicies: institution.settings.enrollmentPolicies,
      notificationSettings: institution.settings.notificationSettings,
      securitySettings: institution.settings.securitySettings,
      customSettings: institution.settings.customSettings
    };
  }

  /**
   * Get default academic calendar
   */
  private getDefaultAcademicCalendar(): AcademicCalendar {
    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;

    return {
      academicYear: `${currentYear}-${nextYear}`,
      semesterSystem: 'semester',
      semesters: [
        {
          name: 'Fall Semester',
          startDate: new Date(currentYear, 8, 1), // September 1
          endDate: new Date(currentYear, 11, 15), // December 15
          registrationStart: new Date(currentYear, 7, 1), // August 1
          registrationEnd: new Date(currentYear, 8, 15), // September 15
          dropDeadline: new Date(currentYear, 8, 30), // September 30
          finalExamsStart: new Date(currentYear, 11, 8), // December 8
          finalExamsEnd: new Date(currentYear, 11, 15) // December 15
        },
        {
          name: 'Spring Semester',
          startDate: new Date(nextYear, 0, 15), // January 15
          endDate: new Date(nextYear, 4, 15), // May 15
          registrationStart: new Date(currentYear, 11, 1), // December 1
          registrationEnd: new Date(nextYear, 0, 30), // January 30
          dropDeadline: new Date(nextYear, 1, 15), // February 15
          finalExamsStart: new Date(nextYear, 4, 8), // May 8
          finalExamsEnd: new Date(nextYear, 4, 15) // May 15
        }
      ],
      holidays: [
        {
          name: 'Thanksgiving Break',
          startDate: new Date(currentYear, 10, 25), // November 25
          endDate: new Date(currentYear, 10, 29), // November 29
          type: 'break'
        },
        {
          name: 'Winter Break',
          startDate: new Date(currentYear, 11, 16), // December 16
          endDate: new Date(nextYear, 0, 14), // January 14
          type: 'break'
        },
        {
          name: 'Spring Break',
          startDate: new Date(nextYear, 2, 15), // March 15
          endDate: new Date(nextYear, 2, 22), // March 22
          type: 'break'
        }
      ]
    };
  }

  /**
   * Get default enrollment policies
   */
  private getDefaultEnrollmentPolicies(): EnrollmentPolicies {
    return {
      registrationTimeoutDays: 7,
      reminderDays: 2,
      maxPendingRegistrations: 100,
      autoApprovalEnabled: false,
      maxCoursesPerSemester: 6,
      minCreditsPerSemester: 12,
      maxCreditsPerSemester: 18,
      allowLateRegistration: true,
      lateRegistrationFee: 50,
      dropWithoutPenaltyDays: 14,
      withdrawalDeadlineDays: 60,
      gradeSubmissionDeadlineDays: 7,
      transcriptRequestProcessingDays: 5
    };
  }

  /**
   * Get default notification settings
   */
  private getDefaultNotificationSettings(): NotificationSettings {
    return {
      emailNotifications: {
        registrationApproval: true,
        enrollmentConfirmation: true,
        gradePosted: true,
        paymentDue: true,
        systemMaintenance: false
      },
      smsNotifications: {
        urgentAlerts: false,
        paymentReminders: false,
        registrationDeadlines: false
      },
      pushNotifications: {
        enabled: true,
        courseUpdates: true,
        announcements: true
      }
    };
  }

  /**
   * Get default security settings
   */
  private getDefaultSecuritySettings(): SecuritySettings {
    return {
      passwordPolicy: {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: false,
        passwordExpireDays: 90,
        preventReuse: 5
      },
      sessionSettings: {
        sessionTimeoutMinutes: 60,
        maxConcurrentSessions: 3,
        requireReauthForSensitive: true
      },
      accessControl: {
        allowedIPRanges: [],
        blockSuspiciousActivity: true,
        maxFailedLoginAttempts: 5,
        lockoutDurationMinutes: 15
      }
    };
  }

  /**
   * Validate academic calendar
   */
  private validateAcademicCalendar(calendar: Partial<AcademicCalendar>): void {
    if (calendar.semesterSystem && !['semester', 'quarter', 'trimester'].includes(calendar.semesterSystem)) {
      throw new Error('Semester system must be one of: semester, quarter, trimester');
    }

    if (calendar.semesters) {
      for (const semester of calendar.semesters) {
        if (semester.startDate >= semester.endDate) {
          throw new Error('Semester start date must be before end date');
        }
        if (semester.registrationStart >= semester.registrationEnd) {
          throw new Error('Registration start date must be before end date');
        }
      }
    }
  }

  /**
   * Validate enrollment policies
   */
  private validateEnrollmentPolicies(policies: Partial<EnrollmentPolicies>): void {
    if (policies.registrationTimeoutDays !== undefined && policies.registrationTimeoutDays < 1) {
      throw new Error('Registration timeout days must be at least 1');
    }

    if (policies.maxCoursesPerSemester !== undefined && policies.maxCoursesPerSemester < 1) {
      throw new Error('Maximum courses per semester must be at least 1');
    }

    if (policies.minCreditsPerSemester !== undefined && policies.minCreditsPerSemester < 0) {
      throw new Error('Minimum credits per semester cannot be negative');
    }

    if (policies.maxCreditsPerSemester !== undefined && policies.maxCreditsPerSemester < 1) {
      throw new Error('Maximum credits per semester must be at least 1');
    }

    if (policies.minCreditsPerSemester !== undefined && 
        policies.maxCreditsPerSemester !== undefined && 
        policies.minCreditsPerSemester > policies.maxCreditsPerSemester) {
      throw new Error('Minimum credits cannot exceed maximum credits');
    }

    if (policies.lateRegistrationFee !== undefined && policies.lateRegistrationFee < 0) {
      throw new Error('Late registration fee cannot be negative');
    }
  }

  /**
   * Validate security settings
   */
  private validateSecuritySettings(settings: Partial<SecuritySettings>): void {
    if (settings.passwordPolicy?.minLength !== undefined && settings.passwordPolicy.minLength < 6) {
      throw new Error('Password minimum length must be at least 6 characters');
    }

    if (settings.passwordPolicy?.passwordExpireDays !== undefined && settings.passwordPolicy.passwordExpireDays < 30) {
      throw new Error('Password expiration must be at least 30 days');
    }

    if (settings.sessionSettings?.sessionTimeoutMinutes !== undefined && settings.sessionSettings.sessionTimeoutMinutes < 5) {
      throw new Error('Session timeout must be at least 5 minutes');
    }

    if (settings.sessionSettings?.maxConcurrentSessions !== undefined && settings.sessionSettings.maxConcurrentSessions < 1) {
      throw new Error('Maximum concurrent sessions must be at least 1');
    }

    if (settings.accessControl?.maxFailedLoginAttempts !== undefined && settings.accessControl.maxFailedLoginAttempts < 3) {
      throw new Error('Maximum failed login attempts must be at least 3');
    }

    if (settings.accessControl?.lockoutDurationMinutes !== undefined && settings.accessControl.lockoutDurationMinutes < 5) {
      throw new Error('Lockout duration must be at least 5 minutes');
    }
  }
}

// Export both the class and a default instance
export const settingsService = SettingsService.getInstance();
export default settingsService;