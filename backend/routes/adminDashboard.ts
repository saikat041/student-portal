import express from 'express';
import { authenticate } from '../middleware/auth';
import { establishInstitutionalContext, requireInstitutionAdmin } from '../middleware/tenantContext';
import {
  getDashboardOverview,
  getUserManagementData,
  getPendingRegistrationsManagement,
  getInstitutionalReports,
  bulkApproveRegistrations,
  bulkRejectRegistrations
} from '../controllers/adminDashboardController';

const router = express.Router();

/**
 * Institution Admin Dashboard Endpoints
 * All endpoints require authentication and institution admin privileges
 */

/**
 * Get comprehensive dashboard overview
 * Requirements: 15.2, 17.4, 18.5
 */
router.get(
  '/:institutionId/overview',
  authenticate,
  establishInstitutionalContext,
  requireInstitutionAdmin,
  getDashboardOverview
);

/**
 * Get detailed user management interface data
 * Requirements: 15.2, 17.4
 * Query parameters:
 * - role: filter by user role (student, teacher, institution_admin)
 * - status: filter by user status (pending, active, inactive)
 * - page: page number for pagination
 * - limit: number of items per page
 * - search: search term for name/email
 */
router.get(
  '/:institutionId/users',
  authenticate,
  establishInstitutionalContext,
  requireInstitutionAdmin,
  getUserManagementData
);

/**
 * Get detailed pending registrations management interface
 * Requirements: 15.2, 15.3
 * Query parameters:
 * - role: filter by user role (student, teacher, institution_admin)
 * - urgency: filter by urgency level (overdue, urgent, normal)
 * - page: page number for pagination
 * - limit: number of items per page
 */
router.get(
  '/:institutionId/pending-registrations',
  authenticate,
  establishInstitutionalContext,
  requireInstitutionAdmin,
  getPendingRegistrationsManagement
);

/**
 * Get institutional statistics and reporting data
 * Requirements: 17.4, 18.5
 * Query parameters:
 * - reportType: type of report (overview, users, admin, courses, enrollments)
 * - dateRange: date range for analytics (7d, 30d, 90d, 1y)
 */
router.get(
  '/:institutionId/reports',
  authenticate,
  establishInstitutionalContext,
  requireInstitutionAdmin,
  getInstitutionalReports
);

/**
 * Bulk approve multiple pending registrations
 * Requirements: 15.2, 15.3
 * Body parameters:
 * - userIds: array of user IDs to approve
 * - approvedBy: ID of the admin performing the approval
 */
router.post(
  '/:institutionId/bulk-approve',
  authenticate,
  establishInstitutionalContext,
  requireInstitutionAdmin,
  bulkApproveRegistrations
);

/**
 * Bulk reject multiple pending registrations
 * Requirements: 15.2, 15.4
 * Body parameters:
 * - userIds: array of user IDs to reject
 * - reason: reason for rejection
 * - rejectedBy: ID of the admin performing the rejection
 */
router.post(
  '/:institutionId/bulk-reject',
  authenticate,
  establishInstitutionalContext,
  requireInstitutionAdmin,
  bulkRejectRegistrations
);

/**
 * Alternative routes using tenant context (when institution ID is in context)
 */

/**
 * Get dashboard overview using current institutional context
 */
router.get(
  '/overview',
  authenticate,
  establishInstitutionalContext,
  requireInstitutionAdmin,
  getDashboardOverview
);

/**
 * Get user management data using current institutional context
 */
router.get(
  '/users',
  authenticate,
  establishInstitutionalContext,
  requireInstitutionAdmin,
  getUserManagementData
);

/**
 * Get pending registrations using current institutional context
 */
router.get(
  '/pending-registrations',
  authenticate,
  establishInstitutionalContext,
  requireInstitutionAdmin,
  getPendingRegistrationsManagement
);

/**
 * Get reports using current institutional context
 */
router.get(
  '/reports',
  authenticate,
  establishInstitutionalContext,
  requireInstitutionAdmin,
  getInstitutionalReports
);

/**
 * Bulk approve using current institutional context
 */
router.post(
  '/bulk-approve',
  authenticate,
  establishInstitutionalContext,
  requireInstitutionAdmin,
  bulkApproveRegistrations
);

/**
 * Bulk reject using current institutional context
 */
router.post(
  '/bulk-reject',
  authenticate,
  establishInstitutionalContext,
  requireInstitutionAdmin,
  bulkRejectRegistrations
);

export default router;