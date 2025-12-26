import mongoose, { Document, Schema } from 'mongoose';

export interface IInstitution extends Document {
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
  settings: {
    academicYear: string;
    semesterSystem: string;
    enrollmentPolicies: Record<string, any>;
    academicCalendar?: {
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
    };
    notificationSettings?: {
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
    };
    securitySettings?: {
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
    };
    customSettings?: Record<string, any>;
  };
  branding: {
    primaryColor: string;
    secondaryColor?: string;
    logo: string;
    favicon?: string;
    theme: string;
    customCSS?: string;
    emailTemplate?: {
      headerColor?: string;
      footerText?: string;
      logoUrl?: string;
    };
    navigationStyle?: 'default' | 'minimal' | 'sidebar';
    fontFamily?: string;
  };
  status: 'active' | 'inactive' | 'suspended';
  createdAt: Date;
  updatedAt: Date;
}

const institutionSchema = new Schema<IInstitution>({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['university', 'college', 'school'],
    required: true
  },
  address: {
    street: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    zipCode: { type: String, required: true, trim: true }
  },
  contactInfo: {
    email: { 
      type: String, 
      required: true, 
      trim: true,
      lowercase: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
    },
    phone: { type: String, required: true, trim: true }
  },
  settings: {
    academicYear: { type: String, default: '2024-2025' },
    semesterSystem: { 
      type: String, 
      enum: ['semester', 'quarter', 'trimester'], 
      default: 'semester' 
    },
    enrollmentPolicies: { type: Schema.Types.Mixed, default: {} },
    academicCalendar: {
      academicYear: { type: String },
      semesterSystem: { 
        type: String, 
        enum: ['semester', 'quarter', 'trimester'] 
      },
      semesters: [{
        name: { type: String, required: true },
        startDate: { type: Date, required: true },
        endDate: { type: Date, required: true },
        registrationStart: { type: Date, required: true },
        registrationEnd: { type: Date, required: true },
        dropDeadline: { type: Date, required: true },
        finalExamsStart: { type: Date, required: true },
        finalExamsEnd: { type: Date, required: true }
      }],
      holidays: [{
        name: { type: String, required: true },
        startDate: { type: Date, required: true },
        endDate: { type: Date, required: true },
        type: { 
          type: String, 
          enum: ['holiday', 'break', 'closure'], 
          required: true 
        }
      }]
    },
    notificationSettings: {
      emailNotifications: {
        registrationApproval: { type: Boolean, default: true },
        enrollmentConfirmation: { type: Boolean, default: true },
        gradePosted: { type: Boolean, default: true },
        paymentDue: { type: Boolean, default: true },
        systemMaintenance: { type: Boolean, default: false }
      },
      smsNotifications: {
        urgentAlerts: { type: Boolean, default: false },
        paymentReminders: { type: Boolean, default: false },
        registrationDeadlines: { type: Boolean, default: false }
      },
      pushNotifications: {
        enabled: { type: Boolean, default: true },
        courseUpdates: { type: Boolean, default: true },
        announcements: { type: Boolean, default: true }
      }
    },
    securitySettings: {
      passwordPolicy: {
        minLength: { type: Number, default: 8 },
        requireUppercase: { type: Boolean, default: true },
        requireLowercase: { type: Boolean, default: true },
        requireNumbers: { type: Boolean, default: true },
        requireSpecialChars: { type: Boolean, default: false },
        passwordExpireDays: { type: Number, default: 90 },
        preventReuse: { type: Number, default: 5 }
      },
      sessionSettings: {
        sessionTimeoutMinutes: { type: Number, default: 60 },
        maxConcurrentSessions: { type: Number, default: 3 },
        requireReauthForSensitive: { type: Boolean, default: true }
      },
      accessControl: {
        allowedIPRanges: [{ type: String }],
        blockSuspiciousActivity: { type: Boolean, default: true },
        maxFailedLoginAttempts: { type: Number, default: 5 },
        lockoutDurationMinutes: { type: Number, default: 15 }
      }
    },
    customSettings: { type: Schema.Types.Mixed, default: {} }
  },
  branding: {
    primaryColor: { type: String, default: '#007bff' },
    secondaryColor: { type: String, default: '#6c757d' },
    logo: { type: String, default: '' },
    favicon: { type: String, default: '' },
    theme: { type: String, default: 'default' },
    customCSS: { type: String, default: '' },
    emailTemplate: {
      headerColor: { type: String, default: '#007bff' },
      footerText: { type: String, default: '' },
      logoUrl: { type: String, default: '' }
    },
    navigationStyle: { 
      type: String, 
      enum: ['default', 'minimal', 'sidebar'], 
      default: 'default' 
    },
    fontFamily: { type: String, default: 'system-ui, -apple-system, sans-serif' }
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active'
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Additional indexes for performance (name is already unique from schema)
institutionSchema.index({ status: 1 });
institutionSchema.index({ type: 1 });

export default mongoose.model<IInstitution>('Institution', institutionSchema);