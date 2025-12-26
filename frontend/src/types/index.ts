export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'teacher' | 'student';
  isActive?: boolean;
  lastLogin?: Date;
}

// Enrollment status type matching backend model
export type EnrollmentStatus = 'enrolled' | 'dropped' | 'completed';

// Enrollment interface matching backend model
export interface Enrollment {
  _id: string;
  student: string | Student;
  course: string | Course;
  enrollmentDate: Date;
  status: EnrollmentStatus;
  grade?: string;
  credits: number;
  semester: string;
  academicYear: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Student {
  _id: string;
  name: string;
  email: string;
  studentId: string;
  course: string;
  year: number;
  user?: User;
  createdAt: Date;
}

export interface Course {
  _id: string;
  courseCode: string;
  courseName: string;
  description: string;
  credits: number;
  department: string;
  instructor: User;
  semester: string;
  maxStudents: number;
  enrolledStudents: Student[];
  isActive: boolean;
  // Enrollment statistics
  enrolledCount: number;
  availableSpots: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  token: string | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (userData: RegisterData) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
}

export interface RegisterData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: 'admin' | 'teacher' | 'student';
}

export interface LoginData {
  email: string;
  password: string;
}

export interface CourseFormData {
  courseCode: string;
  courseName: string;
  description: string;
  credits: string;
  department: string;
  semester: string;
  maxStudents: string;
  instructor?: string;
}

export interface StudentFormData {
  name: string;
  email: string;
  studentId: string;
  course: string;
  year: string;
}
