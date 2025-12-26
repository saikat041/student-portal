/**
 * Unit Tests for Context Switching Security
 * Feature: multi-institution-support, Property 4: Context Switching Security
 * **Validates: Requirements 4.5, 9.2, 10.4**
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { connectTestDatabase, disconnectTestDatabase, clearTestDatabase } from '../config/test-database';
import { TenantContextManager } from '../services/TenantContextManager';
import { SessionManager } from '../services/SessionManager';
import userService, { UserRegistrationData } from '../services/UserService';
import institutionService, { InstitutionRegistrationData } from '../services/InstitutionService';
import User from '../models/User';
import Institution from '../models/Institution';

describe('Context Switching Security Unit Tests', () => {
  let tenantManager: TenantContextManager;
  let sessionManager: SessionManager;

  beforeAll(async () => {
    await connectTestDatabase();
    tenantManager = TenantContextManager.getInstance();
    sessionManager = SessionManager.getInstance();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  beforeEach(async () => {
    await clearTestDatabase();
  });

  /**
   * Property 4: Context Switching Security
   * For any user switching between institutional contexts, the system should require 
   * authentication and clear all session data from the previous context
   * **Validates: Requirements 4.5, 9.2, 10.4**
   */
  it('should clear all previous context data when switching institutions', async () => {
    // Register two institutions
    const institution1Data: InstitutionRegistrationData = {
      name: 'Test University 1',
      type: 'university',
      address: {
        street: '123 Main St',
        city: 'Test City',
        state: 'TS',
        zipCode: '12345'
      },
      contactInfo: {
        email: 'admin1@testuniv1.edu',
        phone: '5551234567'
      }
    };

    const institution2Data: InstitutionRegistrationData = {
      name: 'Test University 2',
      type: 'university',
      address: {
        street: '456 Oak Ave',
        city: 'Another City',
        state: 'AC',
        zipCode: '54321'
      },
      contactInfo: {
        email: 'admin2@testuniv2.edu',
        phone: '5559876543'
      }
    };

    const institution1 = await institutionService.registerInstitution(institution1Data);
    const institution2 = await institutionService.registerInstitution(institution2Data);

    // Create user with access to both institutions
    const userData = {
      email: 'testuser@example.com',
      password: 'TestPassword123!',
      firstName: 'Test',
      lastName: 'User',
      role: 'student' as const,
      profileData: {}
    };

    const userId = new mongoose.Types.ObjectId().toString();
    const user = await User.create({
      _id: userId,
      email: userData.email,
      password: userData.password,
      firstName: userData.firstName,
      lastName: userData.lastName,
      institutions: [
        {
          institutionId: institution1._id,
          role: userData.role,
          status: 'active',
          profileData: userData.profileData,
          createdAt: new Date(),
          approvedAt: new Date(),
          approvedBy: new mongoose.Types.ObjectId()
        },
        {
          institutionId: institution2._id,
          role: userData.role,
          status: 'active',
          profileData: userData.profileData,
          createdAt: new Date(),
          approvedAt: new Date(),
          approvedBy: new mongoose.Types.ObjectId()
        }
      ]
    });

    const sessionId = user._id.toString();

    // Create session first
    sessionManager.createSession(user._id.toString(), sessionId);

    // Set context for institution1
    const context1 = await tenantManager.setInstitutionContext(
      institution1._id.toString(),
      user._id.toString()
    );

    sessionManager.setInstitutionalContext(
      sessionId,
      institution1._id.toString(),
      context1
    );

    // Verify context1 is set
    const currentContext1 = sessionManager.getCurrentInstitutionalContext(sessionId);
    expect(currentContext1).toBeTruthy();
    expect(currentContext1?.institutionId.toString()).toBe(institution1._id.toString());

    // Clear existing context (simulating security requirement)
    tenantManager.clearContext(user._id.toString());
    sessionManager.clearInstitutionalContext(sessionId);

    // Verify previous context is cleared
    const clearedContext = sessionManager.getCurrentInstitutionalContext(sessionId);
    expect(clearedContext).toBeNull();

    // Set new context for institution2
    const context2 = await tenantManager.setInstitutionContext(
      institution2._id.toString(),
      user._id.toString()
    );

    sessionManager.setInstitutionalContext(
      sessionId,
      institution2._id.toString(),
      context2
    );

    // Verify new context is different and properly isolated
    const newCurrentContext = sessionManager.getCurrentInstitutionalContext(sessionId);
    expect(newCurrentContext).toBeTruthy();
    expect(newCurrentContext?.institutionId.toString()).toBe(institution2._id.toString());
    expect(newCurrentContext?.institutionId.toString()).not.toBe(institution1._id.toString());
  });

  /**
   * Property 4: Context Switching Security (Session Isolation)
   * For any user, switching contexts should not allow access to data from previous contexts
   * **Validates: Requirements 4.5, 9.2, 10.4**
   */
  it('should prevent access to previous institutional data after context switch', async () => {
    // Register two institutions
    const institution1Data: InstitutionRegistrationData = {
      name: 'First Institution',
      type: 'college',
      address: {
        street: '100 College Rd',
        city: 'College Town',
        state: 'CT',
        zipCode: '11111'
      },
      contactInfo: {
        email: 'contact1@firstinst.edu',
        phone: '5551111111'
      }
    };

    const institution2Data: InstitutionRegistrationData = {
      name: 'Second Institution',
      type: 'college',
      address: {
        street: '200 Academy Ln',
        city: 'Academy City',
        state: 'AC',
        zipCode: '22222'
      },
      contactInfo: {
        email: 'contact2@secondinst.edu',
        phone: '5552222222'
      }
    };

    const institution1 = await institutionService.registerInstitution(institution1Data);
    const institution2 = await institutionService.registerInstitution(institution2Data);

    // Create user with access to both institutions
    const userData = {
      email: 'multiuser@example.com',
      password: 'SecurePass123!',
      firstName: 'Multi',
      lastName: 'User',
      role: 'teacher' as const,
      profileData: {}
    };

    const userId = new mongoose.Types.ObjectId().toString();
    const user = await User.create({
      _id: userId,
      email: userData.email,
      password: userData.password,
      firstName: userData.firstName,
      lastName: userData.lastName,
      institutions: [
        {
          institutionId: institution1._id,
          role: userData.role,
          status: 'active',
          profileData: { ...userData.profileData, institution: 'first' },
          createdAt: new Date(),
          approvedAt: new Date(),
          approvedBy: new mongoose.Types.ObjectId()
        },
        {
          institutionId: institution2._id,
          role: userData.role,
          status: 'active',
          profileData: { ...userData.profileData, institution: 'second' },
          createdAt: new Date(),
          approvedAt: new Date(),
          approvedBy: new mongoose.Types.ObjectId()
        }
      ]
    });

    const sessionId = user._id.toString();

    // Create session first
    sessionManager.createSession(user._id.toString(), sessionId);

    // Set context for institution1
    const context1 = await tenantManager.setInstitutionContext(
      institution1._id.toString(),
      user._id.toString()
    );

    sessionManager.setInstitutionalContext(
      sessionId,
      institution1._id.toString(),
      context1
    );

    // Verify context1 is active
    const activeContext1 = sessionManager.getCurrentInstitutionalContext(sessionId);
    expect(activeContext1?.institutionId.toString()).toBe(institution1._id.toString());

    // Switch to institution2 (with security clearing)
    tenantManager.clearContext(user._id.toString());
    sessionManager.clearInstitutionalContext(sessionId);

    const context2 = await tenantManager.setInstitutionContext(
      institution2._id.toString(),
      user._id.toString()
    );

    sessionManager.setInstitutionalContext(
      sessionId,
      institution2._id.toString(),
      context2
    );

    // Verify context2 is active and context1 is not accessible
    const activeContext2 = sessionManager.getCurrentInstitutionalContext(sessionId);
    expect(activeContext2?.institutionId.toString()).toBe(institution2._id.toString());

    // Attempt to access institution1 context should fail
    const attemptContext1Access = tenantManager.getCurrentInstitution(
      user._id.toString(),
      institution1._id.toString()
    );
    expect(attemptContext1Access).toBeNull();

    // Verify session only contains current context
    const session = sessionManager.getSession(sessionId);
    expect(session?.currentInstitutionId).toBe(institution2._id.toString());
    expect(session?.institutionContexts.has(institution1._id.toString())).toBe(false);
    expect(session?.institutionContexts.has(institution2._id.toString())).toBe(true);
  });

  /**
   * Property 4: Context Switching Security (Authentication Requirement)
   * For any context switch attempt, the system should validate user authentication
   * **Validates: Requirements 4.5, 9.2, 10.4**
   */
  it('should require valid user authentication for context switching', async () => {
    // Register two institutions
    const institution1Data: InstitutionRegistrationData = {
      name: 'Auth Test Institution 1',
      type: 'school',
      address: {
        street: '300 School St',
        city: 'School City',
        state: 'SC',
        zipCode: '33333'
      },
      contactInfo: {
        email: 'auth1@school1.edu',
        phone: '5553333333'
      }
    };

    const institution2Data: InstitutionRegistrationData = {
      name: 'Auth Test Institution 2',
      type: 'school',
      address: {
        street: '400 Learning Ave',
        city: 'Learning City',
        state: 'LC',
        zipCode: '44444'
      },
      contactInfo: {
        email: 'auth2@school2.edu',
        phone: '5554444444'
      }
    };

    const institution1 = await institutionService.registerInstitution(institution1Data);
    const institution2 = await institutionService.registerInstitution(institution2Data);

    // Create user with access to both institutions
    const userData = {
      email: 'authuser@example.com',
      password: 'AuthPass123!',
      firstName: 'Auth',
      lastName: 'User',
      role: 'student' as const,
      profileData: {}
    };

    const userId = new mongoose.Types.ObjectId().toString();
    const user = await User.create({
      _id: userId,
      email: userData.email,
      password: userData.password,
      firstName: userData.firstName,
      lastName: userData.lastName,
      institutions: [
        {
          institutionId: institution1._id,
          role: userData.role,
          status: 'active',
          profileData: userData.profileData,
          createdAt: new Date(),
          approvedAt: new Date(),
          approvedBy: new mongoose.Types.ObjectId()
        },
        {
          institutionId: institution2._id,
          role: userData.role,
          status: 'active',
          profileData: userData.profileData,
          createdAt: new Date(),
          approvedAt: new Date(),
          approvedBy: new mongoose.Types.ObjectId()
        }
      ]
    });

    // Test with invalid user ID should fail
    const invalidUserId = new mongoose.Types.ObjectId().toString();
    
    try {
      await tenantManager.setInstitutionContext(
        institution1._id.toString(),
        invalidUserId
      );
      // Should not reach here
      expect(false).toBe(true);
    } catch (error) {
      expect(error).toBeTruthy();
      expect((error as Error).message).toContain('User not found');
    }

    // Test with valid user but invalid institution should fail
    const invalidInstitutionId = new mongoose.Types.ObjectId().toString();
    
    try {
      await tenantManager.setInstitutionContext(
        invalidInstitutionId,
        user._id.toString()
      );
      // Should not reach here
      expect(false).toBe(true);
    } catch (error) {
      expect(error).toBeTruthy();
      expect((error as Error).message).toContain('Institution not found');
    }

    // Test with valid user and institution should succeed
    const validContext = await tenantManager.setInstitutionContext(
      institution1._id.toString(),
      user._id.toString()
    );

    expect(validContext).toBeTruthy();
    expect(validContext.institutionId.toString()).toBe(institution1._id.toString());
    expect(validContext.userInstitution.role).toBe(userData.role);
  });
});
