import express from 'express';
import { 
  register, 
  login, 
  forgotPassword, 
  resetPassword,
  switchInstitution,
  getUserInstitutions,
  getCurrentContext,
  logout
} from '../controllers/authController';
import { authenticate } from '../middleware/auth';

const router = express.Router();

// Public routes
router.post('/register', register);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// Protected routes (require authentication)
router.post('/switch-institution', authenticate, switchInstitution);
router.get('/institutions', authenticate, getUserInstitutions);
router.get('/context', authenticate, getCurrentContext);
router.post('/logout', authenticate, logout);

export default router;
