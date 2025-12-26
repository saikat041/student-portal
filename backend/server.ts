import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { connectDatabase } from './config/database';
import { authenticate, authorize } from './middleware/auth';
import authRoutes from './routes/auth';
import courseRoutes from './routes/courses';
import enrollmentRoutes from './routes/enrollments';
import institutionRoutes from './routes/institutions';
import userRoutes from './routes/users';
import roleRoutes from './routes/roleRoutes';
import adminDashboardRoutes from './routes/adminDashboard';
import performanceRoutes from './routes/performance';
import Student from './models/Student';

const app = express();

// Security middleware
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // 5 login attempts per 15 minutes
  message: 'Too many login attempts, please try again later.'
});

app.use('/api/auth', authLimiter);
app.use(limiter);

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));

// Initialize MongoDB Atlas connection with multi-tenant configuration
connectDatabase();

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/enrollments', enrollmentRoutes);
app.use('/api/institutions', institutionRoutes);
app.use('/api/users', userRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/admin', adminDashboardRoutes);
app.use('/api/performance', performanceRoutes);

interface AuthenticatedRequest extends Request {
  user: any;
}

// Protected student routes
app.get('/api/students', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const students = await Student.find().populate('user', 'firstName lastName email');
    res.json(students);
  } catch (error) {
    console.error('Error fetching students:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/students', authenticate, authorize('admin', 'teacher'), async (req: Request, res: Response): Promise<void> => {
  try {
    const student = new Student(req.body);
    await student.save();
    res.status(201).json(student);
  } catch (error) {
    console.error('Error creating student:', error);
    res.status(400).json({ error: (error as Error).message });
  }
});

app.put('/api/students/:id', authenticate, authorize('admin', 'teacher'), async (req: Request, res: Response): Promise<void> => {
  try {
    const student = await Student.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!student) {
      res.status(404).json({ error: 'Student not found' });
      return;
    }
    res.json(student);
  } catch (error) {
    console.error('Error updating student:', error);
    res.status(400).json({ error: (error as Error).message });
  }
});

app.delete('/api/students/:id', authenticate, authorize('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const student = await Student.findByIdAndDelete(req.params.id);
    if (!student) {
      res.status(404).json({ error: 'Student not found' });
      return;
    }
    res.json({ message: 'Student deleted' });
  } catch (error) {
    console.error('Error deleting student:', error);
    res.status(400).json({ error: (error as Error).message });
  }
});

// User profile route
app.get('/api/profile', authenticate, (req: Request, res: Response): void => {
  const user = (req as AuthenticatedRequest).user;
  res.json({
    id: user._id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role
  });
});

// Global error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction): void => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use('*', (req: Request, res: Response): void => {
  res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
