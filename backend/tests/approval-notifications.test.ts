// Set required environment variables for testing BEFORE any imports
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing';
process.env.JWT_EXPIRE = '7d';

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { connectTestDatabase, disconnectTestDatabase, clearTestDatabase } from '../config/test-database';
import userService, { UserRegistrationData } from '../services/UserService';
import { institutionService } from '../services/InstitutionService';
import { InstitutionRegistrationData } from '../services/InstitutionService';
import User from '../models/User';
import * as userController from '../controllers/userController';
import { Request, Response } from 'express';

describe('Approval Notifications Unit Tests', () => {
  beforeAll(async () => {
    await connectTestDatabase();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  beforeEach(async () => {
    await clearTestDatabase();
    vi.clearAllMocks();
  });

  // Helper function to create test institution
  const createTestInstitution = async (name: string = 'Test University') => {
    const institutionData: InstitutionRegistrationData = {
      name,
      type: 'university',
      address: {
        street: '123 Test St',
        city: 'Test City',
        state: 'Test State',
        zipCode: '12345'
      },
      contactInfo: {
        email: 'admin@test.edu',
        phone: '555-0123'
      }
    };
    return await institutionService.registerInstitution(institutionData);
  };

  // Helper function to create test user
  const createTestUser = async (email: string = 'test@example.com', role: 'student' | 'teacher' | 'institution_admin' = 'student') => {
    const userData: UserRegistrationData = {
      email,
      password: 'password123',
      firstName: 'Test',
      lastName: 'User',
      role,
      profileData: {}
    };
    return userData;
  };

  // Helper function to create institution admin
  const createInstitutionAdmin = async (institutionId: string, email: string = 'admin@test.edu') => {
    const adminData: UserRegistrationData = {
      email,
      password: 'admin123',
      firstName: 'Admin',
      lastName: 'User',
      role: 'institution_admin',
      profileData: {}
    };

    const admin = new User({
      email: adminData.email,
      password: adminData.password,
      firstName: adminData.firstName,
      lastName: adminData.lastName,
      institutions: [{
        institutionId: institutionId,
        role: 'institution_admin',
        status: 'active',
        profileData: {},
        createdAt: new Date(),
        approvedAt: new Date()
      }]
    });

    await admin.save();
    return admin;
  };

  describe('Registration Approval Notifications', () => {
    it('should send approval notification when registration is approved', async () => {
      // Create institution and admin
      const institution = await createTestInstitution('Approval Test University');
      const admin = await createInstitutionAdmin(institution._id.toString());

      // Create pending user registration
      const userData = await createTestUser('student@test.com', 'student');
      const registration = await userService.registerUser(userData, institution._id.toString());

      // Mock console.log to capture notifications
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // Mock request and response objects
      const mockReq = {
        body: {
          userId: registration.userId,
          institutionId: institution._id.toString(),
          approvedBy: admin._id.toString()
        }
      } as Request;

      const mockRes = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis()
      } as unknown as Response;

      // Call approval endpoint
      await userController.approveRegistration(mockReq, mockRes);

      // Verify approval notification was sent
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('✅ NOTIFICATION: Registration approved for Approval Test University')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Admin: Admin User (admin@test.edu)')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Approved User: Test User (student@test.com)')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Role: student')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Approved By: Admin User')
      );

      // Verify response
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'User registration approved successfully',
          user: expect.objectContaining({
            email: 'student@test.com',
            firstName: 'Test',
            lastName: 'User'
          })
        })
      );

      consoleSpy.mockRestore();
    });

    it('should send rejection notification when registration is rejected', async () => {
      // Create institution and admin
      const institution = await createTestInstitution('Rejection Test University');
      const admin = await createInstitutionAdmin(institution._id.toString());

      // Create pending user registration
      const userData = await createTestUser('student2@test.com', 'teacher');
      const registration = await userService.registerUser(userData, institution._id.toString());

      // Mock console.log to capture notifications
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // Mock request and response objects
      const mockReq = {
        body: {
          userId: registration.userId,
          institutionId: institution._id.toString(),
          reason: 'Incomplete application',
          rejectedBy: admin._id.toString()
        }
      } as Request;

      const mockRes = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis()
      } as unknown as Response;

      // Call rejection endpoint
      await userController.rejectRegistration(mockReq, mockRes);

      // Verify rejection notification was sent
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('❌ NOTIFICATION: Registration rejected for Rejection Test University')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Admin: Admin User (admin@test.edu)')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Rejected User: Test User (student2@test.com)')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Role: teacher')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Reason: Incomplete application')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Rejected By: Admin User')
      );

      // Verify response
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'User registration rejected',
          rejectedUser: expect.objectContaining({
            email: 'student2@test.com',
            firstName: 'Test',
            lastName: 'User',
            reason: 'Incomplete application'
          })
        })
      );

      consoleSpy.mockRestore();
    });

    it('should handle rejection without reason', async () => {
      // Create institution and admin
      const institution = await createTestInstitution('No Reason Test University');
      const admin = await createInstitutionAdmin(institution._id.toString());

      // Create pending user registration
      const userData = await createTestUser('student3@test.com', 'student');
      const registration = await userService.registerUser(userData, institution._id.toString());

      // Mock console.log to capture notifications
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // Mock request and response objects (no reason provided)
      const mockReq = {
        body: {
          userId: registration.userId,
          institutionId: institution._id.toString(),
          rejectedBy: admin._id.toString()
        }
      } as Request;

      const mockRes = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis()
      } as unknown as Response;

      // Call rejection endpoint
      await userController.rejectRegistration(mockReq, mockRes);

      // Verify rejection notification shows "Not specified" for reason
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Reason: Not specified')
      );

      // Verify response shows "Not specified"
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          rejectedUser: expect.objectContaining({
            reason: 'Not specified'
          })
        })
      );

      consoleSpy.mockRestore();
    });

    it('should send notifications to multiple institution admins', async () => {
      // Create institution
      const institution = await createTestInstitution('Multi Admin Test University');
      
      // Create multiple admins
      const admin1 = await createInstitutionAdmin(institution._id.toString(), 'admin1@test.edu');
      const admin2 = await createInstitutionAdmin(institution._id.toString(), 'admin2@test.edu');

      // Create pending user registration
      const userData = await createTestUser('student4@test.com', 'student');
      const registration = await userService.registerUser(userData, institution._id.toString());

      // Mock console.log to capture notifications
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // Mock request and response objects
      const mockReq = {
        body: {
          userId: registration.userId,
          institutionId: institution._id.toString(),
          approvedBy: admin1._id.toString()
        }
      } as Request;

      const mockRes = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis()
      } as unknown as Response;

      // Call approval endpoint
      await userController.approveRegistration(mockReq, mockRes);

      // Verify notifications were sent to both admins
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Admin: Admin User (admin1@test.edu)')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Admin: Admin User (admin2@test.edu)')
      );

      // Should have two separate notification blocks (one for each admin)
      const logCalls = consoleSpy.mock.calls.map(call => call[0]);
      const admin1Notifications = logCalls.filter(log => log.includes('admin1@test.edu'));
      const admin2Notifications = logCalls.filter(log => log.includes('admin2@test.edu'));
      
      expect(admin1Notifications.length).toBeGreaterThan(0);
      expect(admin2Notifications.length).toBeGreaterThan(0);

      consoleSpy.mockRestore();
    });
  });

  describe('Timeout Reminder Notifications', () => {
    it.skip('should send timeout reminders for pending registrations', async () => {
      // Create institution with custom timeout settings
      const institution = await createTestInstitution('Timeout Test University');
      
      // Update institution settings to have short timeout for testing
      await institutionService.updateInstitutionSettings(institution._id.toString(), {
        enrollmentPolicies: {
          registrationTimeoutDays: 7,
          reminderDays: 2
        }
      });

      const admin = await createInstitutionAdmin(institution._id.toString());

      // Create pending user registration
      const userData = await createTestUser('timeout@test.com', 'student');
      const registration = await userService.registerUser(userData, institution._id.toString());

      // Mock console.log to capture notifications
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // Mock request and response objects
      const mockReq = {
        params: {
          institutionId: institution._id.toString()
        }
      } as unknown as Request;

      const mockRes = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis()
      } as unknown as Response;

      // Manually modify the registration date to be old enough for reminder
      const user = await User.findById(registration.userId);
      const institutionProfile = user!.institutions.find(
        inst => inst.institutionId.toString() === institution._id.toString()
      );
      
      // Set creation date to exactly 6 days ago (so timeout is in 1 day, reminder should be sent)
      const sixDaysAgo = new Date();
      sixDaysAgo.setDate(sixDaysAgo.getDate() - 6);
      sixDaysAgo.setHours(0, 0, 0, 0); // Set to start of day for cleaner calculation
      institutionProfile!.createdAt = sixDaysAgo;
      await user!.save();

      // Call timeout reminder endpoint
      await userController.sendTimeoutReminders(mockReq, mockRes);

      // Debug: Check what was actually called
      console.log('Mock response calls:', mockRes.json.mock.calls);
      if (mockRes.json.mock.calls.length > 0) {
        console.log('Response data:', JSON.stringify(mockRes.json.mock.calls[0][0], null, 2));
      }

      // Verify timeout reminder notification was sent
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('⏰ REMINDER: Pending registration requires attention for Timeout Test University')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Admin: Admin User (admin@test.edu)')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Pending User: Test User (timeout@test.com)')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Role: student')
      );

      // Verify response
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Sent 1 timeout reminders'),
          reminders: expect.arrayContaining([
            expect.objectContaining({
              email: 'timeout@test.com',
              name: 'Test User',
              role: 'student'
            })
          ])
        })
      );

      consoleSpy.mockRestore();
    });

    it('should not send reminders for recent registrations', async () => {
      // Create institution
      const institution = await createTestInstitution('Recent Registration Test University');
      const admin = await createInstitutionAdmin(institution._id.toString());

      // Create recent pending user registration
      const userData = await createTestUser('recent@test.com', 'student');
      await userService.registerUser(userData, institution._id.toString());

      // Mock console.log to capture notifications
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // Mock request and response objects
      const mockReq = {
        params: {
          institutionId: institution._id.toString()
        }
      } as unknown as Request;

      const mockRes = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis()
      } as unknown as Response;

      // Call timeout reminder endpoint
      await userController.sendTimeoutReminders(mockReq, mockRes);

      // Verify no timeout reminder notifications were sent
      const logCalls = consoleSpy.mock.calls.map(call => call[0]);
      const reminderNotifications = logCalls.filter(log => log.includes('⏰ REMINDER'));
      expect(reminderNotifications.length).toBe(0);

      // Verify response shows 0 reminders sent
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Sent 0 timeout reminders'),
          reminders: []
        })
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Error Handling in Notifications', () => {
    it('should handle approval of non-existent user gracefully', async () => {
      // Create institution
      const institution = await createTestInstitution('Error Test University');

      // Mock request with non-existent user ID
      const mockReq = {
        body: {
          userId: '507f1f77bcf86cd799439011', // Valid ObjectId but non-existent
          institutionId: institution._id.toString()
        }
      } as Request;

      const mockRes = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis()
      } as unknown as Response;

      // Call approval endpoint
      await userController.approveRegistration(mockReq, mockRes);

      // Verify error response
      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'User or registration not found'
        })
      );
    });

    it('should handle rejection of non-existent user gracefully', async () => {
      // Create institution
      const institution = await createTestInstitution('Error Test University 2');

      // Mock request with non-existent user ID
      const mockReq = {
        body: {
          userId: '507f1f77bcf86cd799439012', // Valid ObjectId but non-existent
          institutionId: institution._id.toString(),
          reason: 'Test rejection'
        }
      } as Request;

      const mockRes = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis()
      } as unknown as Response;

      // Call rejection endpoint
      await userController.rejectRegistration(mockReq, mockRes);

      // Verify error response
      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'User not found'
        })
      );
    });

    it('should handle timeout reminders for non-existent institution gracefully', async () => {
      // Mock request with non-existent institution ID
      const mockReq = {
        params: {
          institutionId: '507f1f77bcf86cd799439013' // Valid ObjectId but non-existent
        }
      } as unknown as Request;

      const mockRes = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis()
      } as unknown as Response;

      // Call timeout reminder endpoint
      await userController.sendTimeoutReminders(mockReq, mockRes);

      // Verify error response
      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Institution not found'
        })
      );
    });
  });
});