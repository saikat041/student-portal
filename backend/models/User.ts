import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IUserInstitution {
  institutionId: mongoose.Types.ObjectId;
  role: 'student' | 'teacher' | 'institution_admin';
  status: 'pending' | 'active' | 'inactive';
  profileData: Record<string, any>;
  createdAt: Date;
  approvedAt?: Date;
  approvedBy?: mongoose.Types.ObjectId;
}

export interface IUser extends Document {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  institutions: IUserInstitution[];
  isActive: boolean;
  lastLogin?: Date;
  resetToken?: string;
  resetTokenExpiry?: Date;
  comparePassword(password: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  institutions: [{
    institutionId: {
      type: Schema.Types.ObjectId,
      ref: 'Institution',
      required: true
    },
    role: {
      type: String,
      enum: ['student', 'teacher', 'institution_admin'],
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'active', 'inactive'],
      default: 'pending'
    },
    profileData: {
      type: Schema.Types.Mixed,
      default: {}
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    approvedAt: Date,
    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  isActive: { type: Boolean, default: true },
  lastLogin: Date,
  resetToken: String,
  resetTokenExpiry: Date
}, { timestamps: true });

userSchema.pre<IUser>('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function(password: string): Promise<boolean> {
  return bcrypt.compare(password, this.password);
};

// Indexes for multi-institutional queries (email is already unique from schema)
userSchema.index({ 'institutions.institutionId': 1, 'institutions.role': 1 });
userSchema.index({ 'institutions.institutionId': 1, 'institutions.status': 1 });

export default mongoose.model<IUser>('User', userSchema);
