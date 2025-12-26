import express from 'express';
import { authenticate } from '../middleware/auth';
import { establishInstitutionalContext } from '../middleware/tenantContext';
import { 
  requirePermission,
  requireInstitutionAdmin,
  requireRolePromotionPermission,
  addPermissionUtils
} from '../middleware/roleBasedAuth';
import {
  getRoles,
  getMyPermissions,
  checkUserPermission,
  assignRole,
  getRoleHistory,
  getInstitutionRoleAssignments,
  validateBulkRoleAssignments,
  getInstitutionAdministrators,
  promoteToAdmin,
  removeAdminPrivileges
} from '../controllers/roleController';

const router = express.Router();

/**
 * Role Management Routes
 * Requirements 13.4, 13.5, 17.2, 18.1
 * 
 * All routes require authentication and most require institutional context
 */

// Apply authentication to all routes
router.use(authenticate);

// Add permission utilities to all requests
router.use(addPermissionUtils);

/**
 * Public role information (no institutional context required)
 */

// Get all available roles and their permissions
router.get('/', getRoles);

/**
 * User-specific role and permission routes (require institutional context)
 */

// Get current user's permissions within institutional context
router.get('/my-permissions', 
  establishInstitutionalContext,
  getMyPermissions
);

// Check if current user has specific permission
router.post('/check-permission',
  establishInstitutionalContext,
  checkUserPermission
);

/**
 * Administrative role management routes (require admin permissions)
 */

// Get all role assignments for current institution
router.get('/assignments',
  establishInstitutionalContext,
  requirePermission({
    resource: 'user',
    action: 'manage'
  }),
  getInstitutionRoleAssignments
);

// Assign role to user
router.put('/assign/:userId',
  establishInstitutionalContext,
  requireRolePromotionPermission(),
  assignRole
);

// Get role assignment history for a user
router.get('/history/:userId',
  establishInstitutionalContext,
  requirePermission({
    resource: 'user',
    action: 'manage'
  }),
  getRoleHistory
);

// Validate bulk role assignments
router.post('/validate-bulk-assignments',
  establishInstitutionalContext,
  requirePermission({
    resource: 'user',
    action: 'manage'
  }),
  validateBulkRoleAssignments
);

/**
 * Institution administrator management routes
 */

// Get institution administrators
router.get('/administrators',
  establishInstitutionalContext,
  requirePermission({
    resource: 'user',
    action: 'manage'
  }),
  getInstitutionAdministrators
);

// Promote user to institution administrator
router.post('/promote-admin/:userId',
  establishInstitutionalContext,
  requirePermission({
    resource: 'user',
    action: 'promote'
  }),
  promoteToAdmin
);

// Remove administrative privileges
router.post('/remove-admin/:userId',
  establishInstitutionalContext,
  requirePermission({
    resource: 'user',
    action: 'manage'
  }),
  removeAdminPrivileges
);

export default router;