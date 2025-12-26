import mongoose, { Document, Schema } from 'mongoose';
import { IStudent } from './Student';
import { ICourse } from './Course';

export type EnrollmentStatus = 'enrolled' | 'dropped' | 'completed';

export interface IEnrollment extends Document {
  student: IStudent['_id'];
  course: ICourse['_id'];
  institutionId: mongoose.Types.ObjectId;
  enrollmentDate: Date;
  status: EnrollmentStatus;
  grade?: string;
  credits: number;
  semester: string;
  academicYear: string;
  courseSnapshot: {
    code: string;
    name: string;
    credits: number;
    semester: string;
  };
}

const enrollmentSchema = new Schema<IEnrollment>({
  student: {
    type: Schema.Types.ObjectId,
    ref: 'Student',
    required: true
  },
  course: {
    type: Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  institutionId: {
    type: Schema.Types.ObjectId,
    ref: 'Institution',
    required: true
  },
  enrollmentDate: {
    type: Date,
    default: Date.now,
    required: true
  },
  status: {
    type: String,
    enum: ['enrolled', 'dropped', 'completed'],
    default: 'enrolled',
    required: true
  },
  grade: {
    type: String,
    trim: true
  },
  credits: {
    type: Number,
    required: true,
    min: 1,
    max: 6
  },
  semester: {
    type: String,
    required: true,
    trim: true
  },
  academicYear: {
    type: String,
    required: true,
    trim: true
  },
  courseSnapshot: {
    code: { type: String, required: true },
    name: { type: String, required: true },
    credits: { type: Number, required: true },
    semester: { type: String, required: true }
  }
}, { timestamps: true });

// Compound unique index to prevent duplicate enrollments for same student + course + semester
enrollmentSchema.index(
  { student: 1, course: 1, semester: 1 },
  { unique: true }
);

// Performance indexes for multi-tenant queries
enrollmentSchema.index({ institutionId: 1, student: 1, status: 1 });
enrollmentSchema.index({ institutionId: 1, course: 1 });
enrollmentSchema.index({ institutionId: 1, semester: 1, academicYear: 1 });

export default mongoose.model<IEnrollment>('Enrollment', enrollmentSchema);
