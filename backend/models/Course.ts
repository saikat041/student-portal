import mongoose, { Document, Schema } from 'mongoose';
import { IUser } from './User';

export interface ICourse extends Document {
  institutionId: mongoose.Types.ObjectId;
  courseCode: string;
  courseName: string;
  description: string;
  credits: number;
  department: string;
  instructor: IUser['_id'];
  semester: string;
  maxStudents: number;
  enrolledStudents: mongoose.Types.ObjectId[];
  isActive: boolean;
  enrolledCount: number;
  availableSpots: number;
  __v: number; // Version field for optimistic locking
}

const courseSchema = new Schema<ICourse>({
  institutionId: {
    type: Schema.Types.ObjectId,
    ref: 'Institution',
    required: true
  },
  courseCode: { 
    type: String, 
    required: true, 
    uppercase: true,
    trim: true
  },
  courseName: { 
    type: String, 
    required: true,
    trim: true
  },
  description: { 
    type: String, 
    required: true 
  },
  credits: { 
    type: Number, 
    required: true,
    min: 1,
    max: 6
  },
  department: { 
    type: String, 
    required: true 
  },
  instructor: { 
    type: Schema.Types.ObjectId, 
    ref: 'User',
    required: true
  },
  semester: { 
    type: String, 
    required: true 
  },
  maxStudents: { 
    type: Number, 
    default: 30,
    min: 1
  },
  enrolledStudents: [{
    type: Schema.Types.ObjectId,
    ref: 'Student'
  }],
  isActive: { 
    type: Boolean, 
    default: true 
  }
}, { timestamps: true, optimisticConcurrency: true });

// Virtual for enrolled count
courseSchema.virtual('enrolledCount').get(function(this: ICourse) {
  return this.enrolledStudents.length;
});

// Virtual for available spots
courseSchema.virtual('availableSpots').get(function(this: ICourse) {
  return this.maxStudents - this.enrolledStudents.length;
});

// Compound unique index for courseCode within institution
courseSchema.index({ institutionId: 1, courseCode: 1 }, { unique: true });

// Performance indexes for multi-tenant queries
courseSchema.index({ institutionId: 1, status: 1, createdAt: -1 });
courseSchema.index({ institutionId: 1, instructor: 1 });
courseSchema.index({ institutionId: 1, department: 1 });

export default mongoose.model<ICourse>('Course', courseSchema);
