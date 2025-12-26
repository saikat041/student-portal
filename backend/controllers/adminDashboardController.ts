import { Request, Response } from 'express';
import { institutionService } from '../services/InstitutionService';
import userService from '../services/UserService';
import User from '../models/User';
import Course from '../models/Course';
import Enrollment from '../models/Enrollment';
import mongoose from 'mongoose';

interface AdminDashboardRequest extends Request {
  tenantContext?: {
    institutionId: string;
    institution: any;
    userInstitution: any;
  };
}

/**
 * Get comprehensive dashboard overview for institution administrators
 * Requirements: 15.2, 17.4, 18.5
 */
export const getDashboardOverview = async (req: AdminDashboardRequest, res: Response): Promise<void> => {
  try {
    const institutionId = req.params.institutionId || req.tenantContext?.institutionId;
    
    if (!institutionId) {
      res.status(400).json({ error: 'Institution ID is required' });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(institutionId)) {
      res.status(400).json({ error: 'Invalid institution ID' });
      return;
    }

    // Get institution details
    const institution = await institutionService.getInstitutionById(institutionId);
    if (!institution) {
      res.status(404).json({ error: 'Institution not found' });
      return;
    }

    // Get comprehensive statistics
    const stats = await institutionService.getInstitutionStatistics(institutionId);
    
    // Get pending registrations with urgency analysis
    const pendingUsers = await userService.getPendingRegistrations(institutionId);
    const timeoutDays = institution.settings?.enrollmentPolicies?.registrationTimeoutDays || 7;
    const timeoutMs = timeoutDays * 24 * 60 * 60 * 1000;
    
    const pendingAnalysis = pendingUsers.map(user => {
      const institutionProfile = user.institutions.find(
        inst => inst.institutionId.toString() === institutionId && inst.status === 'pending'
      );
      
      const submittedAt = institutionProfile?.createdAt || new Date();
      const timeoutAt = new Date(submittedAt.getTime() + timeoutMs);
      const isOverdue = new Date() > timeoutAt;
      const daysRemaining = Math.ceil((timeoutAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
      
      return {
        userId: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: institutionProfile?.role,
        submittedAt: submittedAt,
        isOverdue: isOverdue,
        daysRemaining: Math.max(0, daysRemaining),
        urgency: isOverdue ? 'overdue' : (daysRemaining <= 2 ? 'urgent' : 'normal')
      };
    });

    const pendingSummary = {
      total: pendingAnalysis.length,
      overdue: pendingAnalysis.filter(r => r.urgency === 'overdue').length,
      urgent: pendingAnalysis.filter(r => r.urgency === 'urgent').length,
      normal: pendingAnalysis.filter(r => r.urgency === 'normal').length
    };

    // Get recent user activity (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentUsers = await User.find({
      'institutions.institutionId': new mongoose.Types.ObjectId(institutionId),
      'institutions.createdAt': { $gte: thirtyDaysAgo }
    }).sort({ 'institutions.createdAt': -1 }).limit(10);

    const recentActivity = recentUsers.map(user => {
      const institutionProfile = user.institutions.find(
        inst => inst.institutionId.toString() === institutionId
      );
      
      return {
        userId: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: institutionProfile?.role,
        status: institutionProfile?.status,
        joinedAt: institutionProfile?.createdAt,
        approvedAt: institutionProfile?.approvedAt
      };
    });

    // Get administrators list
    const administrators = await userService.getInstitutionAdministrators(institutionId);

    // Get role distribution
    const roleDistribution = await User.aggregate([
      { $unwind: '$institutions' },
      { 
        $match: { 
          'institutions.institutionId': new mongoose.Types.ObjectId(institutionId),
          'institutions.status': 'active'
        } 
      },
      {
        $group: {
          _id: '$institutions.role',
          count: { $sum: 1 }
        }
      }
    ]);

    const roleStats = roleDistribution.reduce((acc, role) => {
      acc[role._id] = role.count;
      return acc;
    }, {} as Record<string, number>);

    // Get course statistics if Course model exists
    let courseStats = { total: 0, active: 0, inactive: 0 };
    try {
      const totalCourses = await Course.countDocuments({ institutionId: new mongoose.Types.ObjectId(institutionId) });
      const activeCourses = await Course.countDocuments({ 
        institutionId: new mongoose.Types.ObjectId(institutionId), 
        isActive: true 
      });
      courseStats = {
        total: totalCourses,
        active: activeCourses,
        inactive: totalCourses - activeCourses
      };
    } catch (error) {
      // Course model doesn't exist yet
    }

    // Get enrollment statistics if Enrollment model exists
    let enrollmentStats = { total: 0, active: 0, completed: 0 };
    try {
      const totalEnrollments = await Enrollment.countDocuments({ institutionId: new mongoose.Types.ObjectId(institutionId) });
      const activeEnrollments = await Enrollment.countDocuments({ 
        institutionId: new mongoose.Types.ObjectId(institutionId), 
        status: 'enrolled' 
      });
      const completedEnrollments = await Enrollment.countDocuments({ 
        institutionId: new mongoose.Types.ObjectId(institutionId), 
        status: 'completed' 
      });
      enrollmentStats = {
        total: totalEnrollments,
        active: activeEnrollments,
        completed: completedEnrollments
      };
    } catch (error) {
      // Enrollment model doesn't exist yet
    }

    res.json({
      institution: {
        id: institution._id,
        name: institution.name,
        type: institution.type,
        status: institution.status,
        createdAt: institution.createdAt
      },
      statistics: {
        users: stats,
        courses: courseStats,
        enrollments: enrollmentStats,
        roleDistribution: roleStats
      },
      pendingRegistrations: {
        summary: pendingSummary,
        recentPending: pendingAnalysis.slice(0, 5) // Show top 5 most urgent
      },
      recentActivity: recentActivity,
      administrators: {
        count: administrators.length,
        list: administrators.slice(0, 5) // Show top 5 administrators
      },
      alerts: {
        overdueRegistrations: pendingSummary.overdue,
        urgentRegistrations: pendingSummary.urgent,
        totalPendingActions: pendingSummary.overdue + pendingSummary.urgent
      }
    });
  } catch (error) {
    console.error('Get dashboard overview error:', error);
    res.status(500).json({ error: 'Failed to retrieve dashboard overview' });
  }
};

/**
 * Get detailed user management interface data
 * Requirements: 15.2, 17.4
 */
export const getUserManagementData = async (req: AdminDashboardRequest, res: Response): Promise<void> => {
  try {
    const institutionId = req.params.institutionId || req.tenantContext?.institutionId;
    const { role, status, page = 1, limit = 20, search } = req.query;
    
    if (!institutionId) {
      res.status(400).json({ error: 'Institution ID is required' });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(institutionId)) {
      res.status(400).json({ error: 'Invalid institution ID' });
      return;
    }

    // Build query for user filtering
    const query: any = {
      'institutions.institutionId': new mongoose.Types.ObjectId(institutionId)
    };

    if (role && ['student', 'teacher', 'institution_admin'].includes(role as string)) {
      query['institutions.role'] = role;
    }

    if (status && ['pending', 'active', 'inactive'].includes(status as string)) {
      query['institutions.status'] = status;
    }

    // Add search functionality
    if (search) {
      const searchRegex = new RegExp(search as string, 'i');
      query.$or = [
        { firstName: searchRegex },
        { lastName: searchRegex },
        { email: searchRegex }
      ];
    }

    // Calculate pagination
    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 20;
    const skip = (pageNum - 1) * limitNum;

    // Get users with pagination
    const users = await User.find(query)
      .sort({ 'institutions.createdAt': -1 })
      .skip(skip)
      .limit(limitNum)
      .populate('institutions.institutionId');

    const totalUsers = await User.countDocuments(query);
    const totalPages = Math.ceil(totalUsers / limitNum);

    // Format user data for admin interface
    const userData = users.map(user => {
      const institutionProfile = user.institutions.find(
        inst => inst.institutionId.toString() === institutionId
      );

      return {
        userId: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: `${user.firstName} ${user.lastName}`,
        role: institutionProfile?.role,
        status: institutionProfile?.status,
        profileData: institutionProfile?.profileData,
        joinedAt: institutionProfile?.createdAt,
        approvedAt: institutionProfile?.approvedAt,
        approvedBy: institutionProfile?.approvedBy,
        lastLogin: user.lastLogin,
        isActive: user.isActive
      };
    });

    // Get summary statistics for current filter
    const filterStats = await User.aggregate([
      { $unwind: '$institutions' },
      { 
        $match: { 
          'institutions.institutionId': new mongoose.Types.ObjectId(institutionId),
          ...(role && { 'institutions.role': role }),
          ...(status && { 'institutions.status': status })
        } 
      },
      {
        $group: {
          _id: null,
          totalUsers: { $sum: 1 },
          activeUsers: { 
            $sum: { $cond: [{ $eq: ['$institutions.status', 'active'] }, 1, 0] } 
          },
          pendingUsers: { 
            $sum: { $cond: [{ $eq: ['$institutions.status', 'pending'] }, 1, 0] } 
          },
          inactiveUsers: { 
            $sum: { $cond: [{ $eq: ['$institutions.status', 'inactive'] }, 1, 0] } 
          }
        }
      }
    ]);

    const stats = filterStats[0] || {
      totalUsers: 0,
      activeUsers: 0,
      pendingUsers: 0,
      inactiveUsers: 0
    };

    res.json({
      users: userData,
      pagination: {
        currentPage: pageNum,
        totalPages: totalPages,
        totalUsers: totalUsers,
        limit: limitNum,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1
      },
      filters: {
        role: role || 'all',
        status: status || 'all',
        search: search || ''
      },
      statistics: stats,
      availableFilters: {
        roles: ['student', 'teacher', 'institution_admin'],
        statuses: ['pending', 'active', 'inactive']
      }
    });
  } catch (error) {
    console.error('Get user management data error:', error);
    res.status(500).json({ error: 'Failed to retrieve user management data' });
  }
};

/**
 * Get detailed pending registrations management interface
 * Requirements: 15.2, 15.3
 */
export const getPendingRegistrationsManagement = async (req: AdminDashboardRequest, res: Response): Promise<void> => {
  try {
    const institutionId = req.params.institutionId || req.tenantContext?.institutionId;
    const { role, urgency, page = 1, limit = 20 } = req.query;
    
    if (!institutionId) {
      res.status(400).json({ error: 'Institution ID is required' });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(institutionId)) {
      res.status(400).json({ error: 'Invalid institution ID' });
      return;
    }

    // Get institution for timeout settings
    const institution = await institutionService.getInstitutionById(institutionId);
    if (!institution) {
      res.status(404).json({ error: 'Institution not found' });
      return;
    }

    const timeoutDays = institution.settings?.enrollmentPolicies?.registrationTimeoutDays || 7;
    const timeoutMs = timeoutDays * 24 * 60 * 60 * 1000;

    // Get all pending registrations
    let pendingUsers = await userService.getPendingRegistrations(institutionId);

    // Filter by role if specified
    if (role && ['student', 'teacher', 'institution_admin'].includes(role as string)) {
      pendingUsers = pendingUsers.filter(user => {
        const institutionProfile = user.institutions.find(
          inst => inst.institutionId.toString() === institutionId && inst.status === 'pending'
        );
        return institutionProfile?.role === role;
      });
    }

    // Process and analyze each pending registration
    const pendingRegistrations = pendingUsers.map(user => {
      const institutionProfile = user.institutions.find(
        inst => inst.institutionId.toString() === institutionId && inst.status === 'pending'
      );
      
      const submittedAt = institutionProfile?.createdAt || new Date();
      const timeoutAt = new Date(submittedAt.getTime() + timeoutMs);
      const isOverdue = new Date() > timeoutAt;
      const daysRemaining = Math.ceil((timeoutAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
      const urgencyLevel = isOverdue ? 'overdue' : (daysRemaining <= 2 ? 'urgent' : 'normal');
      
      return {
        userId: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: `${user.firstName} ${user.lastName}`,
        role: institutionProfile?.role,
        profileData: institutionProfile?.profileData,
        submittedAt: submittedAt,
        timeoutAt: timeoutAt,
        isOverdue: isOverdue,
        daysRemaining: Math.max(0, daysRemaining),
        urgency: urgencyLevel,
        daysSinceSubmission: Math.floor((Date.now() - submittedAt.getTime()) / (24 * 60 * 60 * 1000))
      };
    });

    // Filter by urgency if specified
    let filteredRegistrations = pendingRegistrations;
    if (urgency && ['overdue', 'urgent', 'normal'].includes(urgency as string)) {
      filteredRegistrations = pendingRegistrations.filter(reg => reg.urgency === urgency);
    }

    // Sort by urgency and submission date
    filteredRegistrations.sort((a, b) => {
      if (a.urgency === 'overdue' && b.urgency !== 'overdue') return -1;
      if (b.urgency === 'overdue' && a.urgency !== 'overdue') return 1;
      if (a.urgency === 'urgent' && b.urgency === 'normal') return -1;
      if (b.urgency === 'urgent' && a.urgency === 'normal') return 1;
      return a.submittedAt.getTime() - b.submittedAt.getTime();
    });

    // Apply pagination
    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 20;
    const skip = (pageNum - 1) * limitNum;
    const paginatedRegistrations = filteredRegistrations.slice(skip, skip + limitNum);
    const totalPages = Math.ceil(filteredRegistrations.length / limitNum);

    // Calculate summary statistics
    const summary = {
      total: pendingRegistrations.length,
      overdue: pendingRegistrations.filter(r => r.urgency === 'overdue').length,
      urgent: pendingRegistrations.filter(r => r.urgency === 'urgent').length,
      normal: pendingRegistrations.filter(r => r.urgency === 'normal').length,
      byRole: pendingRegistrations.reduce((acc, reg) => {
        acc[reg.role || 'unknown'] = (acc[reg.role || 'unknown'] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    };

    res.json({
      pendingRegistrations: paginatedRegistrations,
      pagination: {
        currentPage: pageNum,
        totalPages: totalPages,
        totalItems: filteredRegistrations.length,
        limit: limitNum,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1
      },
      filters: {
        role: role || 'all',
        urgency: urgency || 'all'
      },
      summary: summary,
      settings: {
        timeoutDays: timeoutDays,
        reminderDays: institution.settings?.enrollmentPolicies?.reminderDays || 2
      },
      availableFilters: {
        roles: ['student', 'teacher', 'institution_admin'],
        urgencyLevels: ['overdue', 'urgent', 'normal']
      }
    });
  } catch (error) {
    console.error('Get pending registrations management error:', error);
    res.status(500).json({ error: 'Failed to retrieve pending registrations management data' });
  }
};

/**
 * Get institutional statistics and reporting data
 * Requirements: 17.4, 18.5
 */
export const getInstitutionalReports = async (req: AdminDashboardRequest, res: Response): Promise<void> => {
  try {
    const institutionId = req.params.institutionId || req.tenantContext?.institutionId;
    const { reportType = 'overview', dateRange = '30d' } = req.query;
    
    if (!institutionId) {
      res.status(400).json({ error: 'Institution ID is required' });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(institutionId)) {
      res.status(400).json({ error: 'Invalid institution ID' });
      return;
    }

    // Calculate date range
    const now = new Date();
    let startDate = new Date();
    
    switch (dateRange) {
      case '7d':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(now.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(now.getDate() - 90);
        break;
      case '1y':
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      default:
        startDate.setDate(now.getDate() - 30);
    }

    // Get institution details
    const institution = await institutionService.getInstitutionById(institutionId);
    if (!institution) {
      res.status(404).json({ error: 'Institution not found' });
      return;
    }

    // Get comprehensive statistics
    const stats = await institutionService.getInstitutionStatistics(institutionId);

    // Get user growth over time
    const userGrowth = await User.aggregate([
      { $unwind: '$institutions' },
      { 
        $match: { 
          'institutions.institutionId': new mongoose.Types.ObjectId(institutionId),
          'institutions.createdAt': { $gte: startDate }
        } 
      },
      {
        $group: {
          _id: {
            year: { $year: '$institutions.createdAt' },
            month: { $month: '$institutions.createdAt' },
            day: { $dayOfMonth: '$institutions.createdAt' }
          },
          count: { $sum: 1 },
          roles: { $push: '$institutions.role' }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
    ]);

    // Get role distribution over time
    const roleDistribution = await User.aggregate([
      { $unwind: '$institutions' },
      { 
        $match: { 
          'institutions.institutionId': new mongoose.Types.ObjectId(institutionId),
          'institutions.status': 'active'
        } 
      },
      {
        $group: {
          _id: '$institutions.role',
          count: { $sum: 1 },
          recentJoins: {
            $sum: {
              $cond: [
                { $gte: ['$institutions.createdAt', startDate] },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    // Get approval statistics
    const approvalStats = await User.aggregate([
      { $unwind: '$institutions' },
      { 
        $match: { 
          'institutions.institutionId': new mongoose.Types.ObjectId(institutionId),
          'institutions.approvedAt': { $gte: startDate }
        } 
      },
      {
        $group: {
          _id: {
            year: { $year: '$institutions.approvedAt' },
            month: { $month: '$institutions.approvedAt' },
            week: { $week: '$institutions.approvedAt' }
          },
          approved: { $sum: 1 },
          avgApprovalTime: {
            $avg: {
              $subtract: ['$institutions.approvedAt', '$institutions.createdAt']
            }
          }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.week': 1 } }
    ]);

    // Get administrator activity
    const adminActivity = await userService.getAdminPrivilegeHistory(institutionId);
    const recentAdminActivity = adminActivity.filter(
      activity => activity.timestamp >= startDate
    );

    // Get course statistics if available
    let courseStats = { total: 0, active: 0, byTeacher: [] };
    try {
      const courses = await Course.aggregate([
        { $match: { institutionId: new mongoose.Types.ObjectId(institutionId) } },
        {
          $group: {
            _id: '$instructor',
            courseCount: { $sum: 1 },
            activeCourses: {
              $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] }
            }
          }
        },
        { $sort: { courseCount: -1 } },
        { $limit: 10 }
      ]);

      courseStats = {
        total: await Course.countDocuments({ institutionId: new mongoose.Types.ObjectId(institutionId) }),
        active: await Course.countDocuments({ 
          institutionId: new mongoose.Types.ObjectId(institutionId), 
          isActive: true 
        }),
        byTeacher: courses
      };
    } catch (error) {
      // Course model doesn't exist yet
    }

    // Get enrollment statistics if available
    let enrollmentStats = { total: 0, active: 0, trends: [] };
    try {
      const enrollmentTrends = await Enrollment.aggregate([
        { 
          $match: { 
            institutionId: new mongoose.Types.ObjectId(institutionId),
            enrollmentDate: { $gte: startDate }
          } 
        },
        {
          $group: {
            _id: {
              year: { $year: '$enrollmentDate' },
              month: { $month: '$enrollmentDate' },
              week: { $week: '$enrollmentDate' }
            },
            enrollments: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.week': 1 } }
      ]);

      enrollmentStats = {
        total: await Enrollment.countDocuments({ institutionId: new mongoose.Types.ObjectId(institutionId) }),
        active: await Enrollment.countDocuments({ 
          institutionId: new mongoose.Types.ObjectId(institutionId), 
          status: 'enrolled' 
        }),
        trends: enrollmentTrends
      };
    } catch (error) {
      // Enrollment model doesn't exist yet
    }

    // Format response based on report type
    let reportData: any = {
      institution: {
        id: institution._id,
        name: institution.name,
        type: institution.type,
        status: institution.status,
        createdAt: institution.createdAt
      },
      reportMetadata: {
        type: reportType,
        dateRange: dateRange,
        startDate: startDate,
        endDate: now,
        generatedAt: now
      },
      summary: {
        totalUsers: stats.totalUsers,
        activeUsers: stats.activeUsers,
        pendingUsers: stats.pendingUsers,
        totalCourses: stats.totalCourses,
        totalEnrollments: stats.totalEnrollments
      }
    };

    switch (reportType) {
      case 'users':
        reportData.userAnalytics = {
          growth: userGrowth,
          roleDistribution: roleDistribution,
          approvalStatistics: approvalStats
        };
        break;
        
      case 'admin':
        reportData.adminAnalytics = {
          totalAdmins: await userService.getInstitutionAdministrators(institutionId).then(admins => admins.length),
          recentActivity: recentAdminActivity,
          privilegeHistory: adminActivity.slice(0, 20)
        };
        break;
        
      case 'courses':
        reportData.courseAnalytics = courseStats;
        break;
        
      case 'enrollments':
        reportData.enrollmentAnalytics = enrollmentStats;
        break;
        
      default: // 'overview'
        reportData.analytics = {
          userGrowth: userGrowth.slice(-30), // Last 30 data points
          roleDistribution: roleDistribution,
          recentApprovals: approvalStats.slice(-10), // Last 10 approval periods
          adminActivity: recentAdminActivity.slice(0, 10), // Top 10 recent admin activities
          courseOverview: { total: courseStats.total, active: courseStats.active },
          enrollmentOverview: { total: enrollmentStats.total, active: enrollmentStats.active }
        };
    }

    res.json(reportData);
  } catch (error) {
    console.error('Get institutional reports error:', error);
    res.status(500).json({ error: 'Failed to retrieve institutional reports' });
  }
};

/**
 * Bulk approve multiple pending registrations
 * Requirements: 15.2, 15.3
 */
export const bulkApproveRegistrations = async (req: AdminDashboardRequest, res: Response): Promise<void> => {
  try {
    const institutionId = req.params.institutionId || req.tenantContext?.institutionId;
    const { userIds, approvedBy } = req.body;
    
    if (!institutionId) {
      res.status(400).json({ error: 'Institution ID is required' });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(institutionId)) {
      res.status(400).json({ error: 'Invalid institution ID' });
      return;
    }

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      res.status(400).json({ error: 'User IDs array is required' });
      return;
    }

    if (userIds.length > 50) {
      res.status(400).json({ error: 'Cannot approve more than 50 registrations at once' });
      return;
    }

    const results = {
      successful: [] as any[],
      failed: [] as any[]
    };

    // Process each user approval
    for (const userId of userIds) {
      try {
        const approvedUser = await userService.approveUserRegistration(userId, institutionId, approvedBy);
        results.successful.push({
          userId: approvedUser._id,
          email: approvedUser.email,
          name: `${approvedUser.firstName} ${approvedUser.lastName}`
        });
      } catch (error) {
        results.failed.push({
          userId: userId,
          error: (error as Error).message
        });
      }
    }

    res.json({
      message: `Bulk approval completed: ${results.successful.length} successful, ${results.failed.length} failed`,
      results: results,
      summary: {
        totalRequested: userIds.length,
        successful: results.successful.length,
        failed: results.failed.length
      }
    });
  } catch (error) {
    console.error('Bulk approve registrations error:', error);
    res.status(500).json({ error: 'Failed to bulk approve registrations' });
  }
};

/**
 * Bulk reject multiple pending registrations
 * Requirements: 15.2, 15.4
 */
export const bulkRejectRegistrations = async (req: AdminDashboardRequest, res: Response): Promise<void> => {
  try {
    const institutionId = req.params.institutionId || req.tenantContext?.institutionId;
    const { userIds, reason, rejectedBy } = req.body;
    
    if (!institutionId) {
      res.status(400).json({ error: 'Institution ID is required' });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(institutionId)) {
      res.status(400).json({ error: 'Invalid institution ID' });
      return;
    }

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      res.status(400).json({ error: 'User IDs array is required' });
      return;
    }

    if (userIds.length > 50) {
      res.status(400).json({ error: 'Cannot reject more than 50 registrations at once' });
      return;
    }

    const results = {
      successful: [] as any[],
      failed: [] as any[]
    };

    // Process each user rejection
    for (const userId of userIds) {
      try {
        // Find the user and remove the pending institutional profile
        const user = await User.findById(userId);
        if (!user) {
          results.failed.push({
            userId: userId,
            error: 'User not found'
          });
          continue;
        }

        const institutionIndex = user.institutions.findIndex(
          inst => inst.institutionId.toString() === institutionId && inst.status === 'pending'
        );

        if (institutionIndex === -1) {
          results.failed.push({
            userId: userId,
            error: 'Pending registration not found'
          });
          continue;
        }

        // Remove the pending institutional profile
        user.institutions.splice(institutionIndex, 1);
        await user.save();

        results.successful.push({
          userId: user._id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`
        });
      } catch (error) {
        results.failed.push({
          userId: userId,
          error: (error as Error).message
        });
      }
    }

    res.json({
      message: `Bulk rejection completed: ${results.successful.length} successful, ${results.failed.length} failed`,
      results: results,
      reason: reason || 'Bulk rejection',
      summary: {
        totalRequested: userIds.length,
        successful: results.successful.length,
        failed: results.failed.length
      }
    });
  } catch (error) {
    console.error('Bulk reject registrations error:', error);
    res.status(500).json({ error: 'Failed to bulk reject registrations' });
  }
};