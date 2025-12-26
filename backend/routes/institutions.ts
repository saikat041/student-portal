import express from 'express';
import { authenticate, requireSystemAdmin } from '../middleware/auth';
import { 
  establishInstitutionalContext,
  switchInstitutionalContext,
  getUserInstitutions,
  getSecurityAuditLogs
} from '../middleware/tenantContext';
import {
  registerInstitution,
  getInstitutions,
  getInstitutionById,
  updateInstitutionSettings,
  updateInstitutionStatus,
  assignInstitutionAdmin,
  getAvailableInstitutions,
  deleteInstitution,
  delegateAdminPrivileges,
  promoteToInstitutionAdmin,
  removeAdminPrivileges,
  updateAdminPermissions,
  getInstitutionAdmins,
  getAdminPrivilegeHistory,
  getBrandingConfiguration,
  updateBrandingConfiguration,
  resetBrandingToDefault,
  getBrandingCSS,
  getEmailBranding,
  previewBrandingConfiguration,
  getInstitutionalSettings,
  updateAcademicCalendar,
  updateEnrollmentPolicies,
  updateNotificationSettings,
  updateSecuritySettings,
  updateCustomSettings,
  resetSettingsToDefault,
  getAcademicCalendar,
  getEnrollmentPolicies
} from '../controllers/institutionController';

const router = express.Router();

/**
 * Public endpoints (no authentication required)
 */

/**
 * Get institutions available for user registration
 */
router.get('/available', getAvailableInstitutions);

/**
 * Get branding CSS for institution (public endpoint for styling)
 */
router.get('/:id/branding.css', getBrandingCSS);

/**
 * Get academic calendar (public endpoint for students/teachers)
 */
router.get('/:id/calendar', getAcademicCalendar);

/**
 * Get enrollment policies (public endpoint for students)
 */
router.get('/:id/policies', getEnrollmentPolicies);

/**
 * System Admin endpoints (require system admin authentication)
 */

/**
 * Register a new institution
 */
router.post('/register', authenticate, requireSystemAdmin, registerInstitution);

/**
 * Get all institutions (with statistics)
 */
router.get('/admin/list', authenticate, requireSystemAdmin, getInstitutions);

/**
 * Get institution by ID (detailed view)
 */
router.get('/admin/:id', authenticate, requireSystemAdmin, getInstitutionById);

/**
 * Update institution status
 */
router.patch('/admin/:id/status', authenticate, requireSystemAdmin, updateInstitutionStatus);

/**
 * Assign institution administrator
 */
router.post('/admin/:id/assign-admin', authenticate, requireSystemAdmin, assignInstitutionAdmin);

/**
 * Promote user to institution administrator
 */
router.post('/admin/:id/promote-admin', authenticate, requireSystemAdmin, promoteToInstitutionAdmin);

/**
 * Delegate administrative privileges (Institution Admin only)
 */
router.post('/:id/delegate-admin', authenticate, establishInstitutionalContext, delegateAdminPrivileges);

/**
 * Remove administrative privileges
 */
router.post('/admin/:id/remove-admin', authenticate, requireSystemAdmin, removeAdminPrivileges);

/**
 * Update administrator permissions
 */
router.patch('/:id/admin-permissions', authenticate, establishInstitutionalContext, updateAdminPermissions);

/**
 * Get institution administrators
 */
router.get('/:id/administrators', authenticate, establishInstitutionalContext, getInstitutionAdmins);

/**
 * Get administrative privilege history
 */
router.get('/admin/:id/privilege-history', authenticate, requireSystemAdmin, getAdminPrivilegeHistory);

/**
 * Delete institution (use with extreme caution)
 */
router.delete('/admin/:id', authenticate, requireSystemAdmin, deleteInstitution);

/**
 * Institution Admin endpoints (require institutional context)
 */

/**
 * Update institution settings
 */
router.patch('/:id/settings', authenticate, establishInstitutionalContext, updateInstitutionSettings);

/**
 * Branding management endpoints (Institution Admin only)
 */

/**
 * Get institution branding configuration
 */
router.get('/:id/branding', authenticate, establishInstitutionalContext, getBrandingConfiguration);

/**
 * Update institution branding configuration
 */
router.patch('/:id/branding', authenticate, establishInstitutionalContext, updateBrandingConfiguration);

/**
 * Reset branding to default values
 */
router.post('/:id/branding/reset', authenticate, establishInstitutionalContext, resetBrandingToDefault);

/**
 * Preview branding configuration changes
 */
router.post('/:id/branding/preview', authenticate, establishInstitutionalContext, previewBrandingConfiguration);

/**
 * Get email branding (internal service endpoint)
 */
router.get('/:id/branding/email', authenticate, establishInstitutionalContext, getEmailBranding);

/**
 * Settings management endpoints (Institution Admin only)
 */

/**
 * Get all institutional settings
 */
router.get('/:id/settings', authenticate, establishInstitutionalContext, getInstitutionalSettings);

/**
 * Update academic calendar
 */
router.patch('/:id/settings/calendar', authenticate, establishInstitutionalContext, updateAcademicCalendar);

/**
 * Update enrollment policies
 */
router.patch('/:id/settings/enrollment', authenticate, establishInstitutionalContext, updateEnrollmentPolicies);

/**
 * Update notification settings
 */
router.patch('/:id/settings/notifications', authenticate, establishInstitutionalContext, updateNotificationSettings);

/**
 * Update security settings
 */
router.patch('/:id/settings/security', authenticate, establishInstitutionalContext, updateSecuritySettings);

/**
 * Update custom settings
 */
router.patch('/:id/settings/custom', authenticate, establishInstitutionalContext, updateCustomSettings);

/**
 * Reset all settings to default
 */
router.post('/:id/settings/reset', authenticate, establishInstitutionalContext, resetSettingsToDefault);

/**
 * User context management endpoints
 */

/**
 * Get user's available institutions
 */
router.get('/my-institutions', authenticate, getUserInstitutions);

/**
 * Switch institutional context
 */
router.post('/switch-context', authenticate, switchInstitutionalContext, (req, res) => {
  res.json({ 
    message: 'Institutional context switched successfully',
    currentInstitution: {
      id: (req as any).tenantContext.institutionId,
      name: (req as any).tenantContext.institution.name,
      role: (req as any).tenantContext.userInstitution.role
    }
  });
});

/**
 * Get current institutional context
 */
router.get('/current-context', authenticate, establishInstitutionalContext, (req, res) => {
  const context = (req as any).tenantContext;
  res.json({
    institution: {
      id: context.institutionId,
      name: context.institution.name,
      type: context.institution.type,
      branding: context.institution.branding
    },
    userRole: context.userInstitution.role,
    userStatus: context.userInstitution.status
  });
});

/**
 * Get security audit logs (admin only)
 */
router.get('/security-logs', authenticate, establishInstitutionalContext, getSecurityAuditLogs);

/**
 * Get security alerts (admin only)
 */
router.get('/security-alerts', authenticate, establishInstitutionalContext, (req, res, next) => {
  req.query.alertsOnly = 'true';
  next();
}, getSecurityAuditLogs);

export default router;