import mongoose, { Document, Schema } from 'mongoose';
import { IUser } from './User';

export interface IStudent extends Document {
  user: IUser['_id'];
  institutionId: mongoose.Types.ObjectId;
  studentId: string;
  major: string;
  year: number;
  gpa: number;
  enrolledCourses: mongoose.Types.ObjectId[];
  totalCredits: number;
  maxCredits: number;
  isActive: boolean;
  fullName?: string;
}

const studentSchema = new Schema<IStudent>({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  institutionId: {
    type: Schema.Types.ObjectId,
    ref: 'Institution',
    required: true
  },
  studentId: {
    type: String,
    required: true,
    trim: true
  },
  major: {
    type: String,
    required: true,
    trim: true
  },
  year: {
    type: Number,
    required: true,
    min: 1,
    max: 6
  },
  gpa: {
    type: Number,
    default: 0.0,
    min: 0.0,
    max: 4.0
  },
  enrolledCourses: [{
    type: Schema.Types.ObjectId,
    ref: 'Course'
  }],
  totalCredits: {
    type: Number,
    default: 0,
    min: 0
  },
  maxCredits: {
    type: Number,
    default: 18,
    min: 1
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for full name from linked User
studentSchema.virtual('fullName', {
  ref: 'User',
  localField: 'user',
  foreignField: '_id',
  justOne: true
}).get(function(this: IStudent & { user: IUser }) {
  if (this.user && typeof this.user === 'object' && 'firstName' in this.user) {
    return `${this.user.firstName} ${this.user.lastName}`;
  }
  return undefined;
});

// Compound unique index for studentId within institution
studentSchema.index({ institutionId: 1, studentId: 1 }, { unique: true });

// Compound unique index for user within institution (one student profile per user per institution)
studentSchema.index({ institutionId: 1, user: 1 }, { unique: true });

// Performance indexes
studentSchema.index({ institutionId: 1, isActive: 1 });
studentSchema.index({ institutionId: 1, major: 1 });

export default mongoose.model<IStudent>('Student', studentSchema);
