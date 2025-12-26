import express from 'express';
import {
  registerForInstitution,
  loginWithInstitution,
  getPendingRegistrations,
  approveRegistration,
  rejectRegistration,
  switchInstitution,
  getUserInstitutions,
  getRoleRegistrationFields
} from '../controllers/userController';

const router = express.Router();

// User registration and authentication with institutional context
router.post('/register', registerForInstitution);
router.post('/login', loginWithInstitution);
router.post('/switch-institution', switchInstitution);

// Registration form fields (public endpoint)
router.get('/registration-fields/:institutionId/:role', getRoleRegistrationFields);

// User institutional profiles
router.get('/:userId/institutions', getUserInstitutions);

// Administrative endpoints for managing user registrations
router.get('/pending/:institutionId', getPendingRegistrations);
router.post('/approve', approveRegistration);
router.post('/reject', rejectRegistration);

export default router;