/**
 * Admin Routes
 *
 * SECURITY:
 * - All endpoints require authentication
 * - Feature flag endpoints require 'admin' role OR DEV environment
 * - Audit log endpoints: admin sees own company, super-admin sees all
 * - All changes are audit logged
 */

const express = require('express');
const router = express.Router();
const featureFlags = require('../utils/feature-flags');
const logger = require('../utils/logger');
const { isValidFlag, getAllFlagNames } = require('../config/feature-flags.config');
const { queryAuditLogs, getSecuritySummary, AUDIT_CATEGORIES, SEVERITY } = require('../services/security-audit.service');

/**
 * Check if user has admin access
 * In production: requires 'admin' role
 * In development: allows any authenticated user (for testing)
 */
function requireAdminAccess(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      error: 'Authentication required',
      code: 'NO_AUTH',
    });
  }

  const isDev = process.env.NODE_ENV === 'development';
  const isAdmin = req.user.role === 'admin';

  if (!isDev && !isAdmin) {
    // Log unauthorized access attempt
    logger.warn('Unauthorized admin access attempt', {
      level: 'SECURITY',
      userId: req.user.id,
      email: req.user.email,
      role: req.user.role,
      path: req.path,
      method: req.method,
      ip: req.ip,
    });

    return res.status(403).json({
      error: 'Admin access required',
      code: 'ADMIN_REQUIRED',
    });
  }

  next();
}

/**
 * GET /api/admin/feature-flags
 * Get all feature flags and their current states
 *
 * Query params:
 *   - companyId: optional, get flags resolved for specific company
 */
router.get('/feature-flags', requireAdminAccess, async (req, res) => {
  try {
    const { companyId } = req.query;

    const flags = await featureFlags.getAllFlags(companyId || null);

    logger.info('Feature flags retrieved', {
      userId: req.user.id,
      companyId: companyId || 'global',
      flagCount: Object.keys(flags).length,
    });

    res.json({
      success: true,
      companyId: companyId || null,
      flags,
      redisConnected: featureFlags.isRedisConnected(),
    });
  } catch (error) {
    logger.error('Failed to get feature flags', {
      error: error.message,
      userId: req.user.id,
    });

    res.status(500).json({
      error: 'Failed to retrieve feature flags',
      code: 'FEATURE_FLAGS_ERROR',
    });
  }
});

/**
 * POST /api/admin/feature-flags
 * Set feature flag override
 *
 * Body:
 *   - flagName: string (required)
 *   - value: boolean (required)
 *   - companyId: string (optional, null for global)
 */
router.post('/feature-flags', requireAdminAccess, async (req, res) => {
  try {
    const { flagName, value, companyId } = req.body;

    // Validate input
    if (!flagName || typeof flagName !== 'string') {
      return res.status(400).json({
        error: 'flagName is required and must be a string',
        code: 'INVALID_INPUT',
      });
    }

    if (typeof value !== 'boolean') {
      return res.status(400).json({
        error: 'value is required and must be a boolean',
        code: 'INVALID_INPUT',
      });
    }

    // Validate flag exists
    if (!isValidFlag(flagName)) {
      return res.status(400).json({
        error: `Unknown feature flag: ${flagName}`,
        code: 'UNKNOWN_FLAG',
        validFlags: getAllFlagNames(),
      });
    }

    // Get old value for audit
    const oldOverride = await featureFlags.getOverride(flagName, companyId || null);
    const oldEnabled = await featureFlags.isEnabled(flagName, { companyId: companyId || null });

    // Set new override
    const success = await featureFlags.setOverride(flagName, value, companyId || null);

    if (!success) {
      return res.status(500).json({
        error: 'Failed to set feature flag (Redis unavailable?)',
        code: 'SET_FAILED',
      });
    }

    // Audit log - detailed
    logger.info('Feature flag override changed', {
      level: 'SECURITY',
      action: 'FEATURE_FLAG_CHANGE',
      userId: req.user.id,
      userEmail: req.user.email,
      userRole: req.user.role,
      flagName,
      companyId: companyId || 'global',
      oldValue: {
        hadOverride: oldOverride.hasOverride,
        overrideValue: oldOverride.value,
        resolvedValue: oldEnabled,
      },
      newValue: value,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString(),
    });

    res.json({
      success: true,
      flagName,
      companyId: companyId || null,
      newValue: value,
      previousValue: oldEnabled,
    });
  } catch (error) {
    logger.error('Failed to set feature flag', {
      error: error.message,
      userId: req.user.id,
      body: req.body,
    });

    res.status(500).json({
      error: 'Failed to set feature flag',
      code: 'SET_FAILED',
    });
  }
});

/**
 * DELETE /api/admin/feature-flags
 * Remove feature flag override (revert to default/rollout)
 *
 * Body:
 *   - flagName: string (required)
 *   - companyId: string (optional, null for global)
 */
router.delete('/feature-flags', requireAdminAccess, async (req, res) => {
  try {
    const { flagName, companyId } = req.body;

    // Validate input
    if (!flagName || typeof flagName !== 'string') {
      return res.status(400).json({
        error: 'flagName is required and must be a string',
        code: 'INVALID_INPUT',
      });
    }

    if (!isValidFlag(flagName)) {
      return res.status(400).json({
        error: `Unknown feature flag: ${flagName}`,
        code: 'UNKNOWN_FLAG',
      });
    }

    // Get old value for audit
    const oldOverride = await featureFlags.getOverride(flagName, companyId || null);

    if (!oldOverride.hasOverride) {
      return res.status(404).json({
        error: 'No override exists for this flag',
        code: 'NO_OVERRIDE',
      });
    }

    // Remove override
    const success = await featureFlags.removeOverride(flagName, companyId || null);

    if (!success) {
      return res.status(500).json({
        error: 'Failed to remove feature flag override',
        code: 'REMOVE_FAILED',
      });
    }

    // Get new resolved value
    const newEnabled = await featureFlags.isEnabled(flagName, { companyId: companyId || null });

    // Audit log
    logger.info('Feature flag override removed', {
      level: 'SECURITY',
      action: 'FEATURE_FLAG_REMOVE',
      userId: req.user.id,
      userEmail: req.user.email,
      flagName,
      companyId: companyId || 'global',
      oldOverrideValue: oldOverride.value,
      newResolvedValue: newEnabled,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    res.json({
      success: true,
      flagName,
      companyId: companyId || null,
      overrideRemoved: true,
      newResolvedValue: newEnabled,
    });
  } catch (error) {
    logger.error('Failed to remove feature flag', {
      error: error.message,
      userId: req.user.id,
      body: req.body,
    });

    res.status(500).json({
      error: 'Failed to remove feature flag override',
      code: 'REMOVE_FAILED',
    });
  }
});

/**
 * GET /api/admin/feature-flags/:flagName/check
 * Check specific flag value for a company (quick check)
 */
router.get('/feature-flags/:flagName/check', requireAdminAccess, async (req, res) => {
  try {
    const { flagName } = req.params;
    const { companyId } = req.query;

    if (!isValidFlag(flagName)) {
      return res.status(404).json({
        error: `Unknown feature flag: ${flagName}`,
        code: 'UNKNOWN_FLAG',
      });
    }

    const enabled = await featureFlags.isEnabled(flagName, { companyId: companyId || null });

    res.json({
      flagName,
      companyId: companyId || null,
      enabled,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to check feature flag',
      code: 'CHECK_FAILED',
    });
  }
});

// ============================================
// AUDIT LOGS ENDPOINTS
// ============================================

/**
 * GET /api/admin/audit-logs
 * Get audit logs for the company
 *
 * SECURITY:
 * - Admin sees logs from their own company only (req.company.id)
 * - Super-admin (role=admin + isDev) can see all companies
 * - companyId is NOT a free parameter for normal admins
 *
 * Query params:
 *   - category: AUTH, ACCESS, DATA, BILLING, SECURITY, ADMIN
 *   - action: specific action name
 *   - severity: LOW, MEDIUM, HIGH, CRITICAL
 *   - startDate: ISO date string
 *   - endDate: ISO date string
 *   - limit: number (default 100, max 500)
 *   - offset: number (default 0)
 */
router.get('/audit-logs', requireAdminAccess, async (req, res) => {
  try {
    const {
      category,
      action,
      severity,
      startDate,
      endDate,
      limit = '100',
      offset = '0',
    } = req.query;

    const isDev = process.env.NODE_ENV === 'development';
    const isSuperAdmin = req.user.role === 'admin' && isDev;

    // SECURITY: Admin sees only their company's logs
    // Super-admin can see all (only in dev environment)
    let companyId = null;
    if (req.company && req.company.id) {
      companyId = req.company.id;
    } else if (!isSuperAdmin) {
      // Non-super-admin without company context cannot view logs
      return res.status(403).json({
        error: 'Company context required to view audit logs',
        code: 'NO_COMPANY_CONTEXT',
      });
    }

    // Parse and validate parameters
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
    const parsedOffset = Math.max(parseInt(offset, 10) || 0, 0);

    // Validate category if provided
    if (category && !Object.values(AUDIT_CATEGORIES).includes(category)) {
      return res.status(400).json({
        error: `Invalid category. Valid values: ${Object.values(AUDIT_CATEGORIES).join(', ')}`,
        code: 'INVALID_CATEGORY',
      });
    }

    // Validate severity if provided
    if (severity && !Object.values(SEVERITY).includes(severity)) {
      return res.status(400).json({
        error: `Invalid severity. Valid values: ${Object.values(SEVERITY).join(', ')}`,
        code: 'INVALID_SEVERITY',
      });
    }

    // Parse dates
    const parsedStartDate = startDate ? new Date(startDate) : null;
    const parsedEndDate = endDate ? new Date(endDate) : null;

    if (parsedStartDate && isNaN(parsedStartDate.getTime())) {
      return res.status(400).json({
        error: 'Invalid startDate format',
        code: 'INVALID_DATE',
      });
    }

    if (parsedEndDate && isNaN(parsedEndDate.getTime())) {
      return res.status(400).json({
        error: 'Invalid endDate format',
        code: 'INVALID_DATE',
      });
    }

    // Query audit logs
    const result = await queryAuditLogs({
      category: category || undefined,
      action: action || undefined,
      companyId: companyId, // null for super-admin means all companies
      severity: severity || undefined,
      startDate: parsedStartDate,
      endDate: parsedEndDate,
      limit: parsedLimit,
      offset: parsedOffset,
    });

    logger.info('Audit logs retrieved', {
      userId: req.user.id,
      companyId: companyId || 'all',
      filters: { category, action, severity, startDate, endDate },
      resultCount: result.logs.length,
      total: result.total,
    });

    res.json({
      success: true,
      data: result.logs,
      pagination: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        hasMore: result.offset + result.logs.length < result.total,
      },
    });
  } catch (error) {
    logger.error('Failed to get audit logs', {
      error: error.message,
      userId: req.user.id,
    });

    res.status(500).json({
      error: 'Failed to retrieve audit logs',
      code: 'AUDIT_LOGS_ERROR',
    });
  }
});

/**
 * GET /api/admin/audit-logs/summary
 * Get security summary for dashboard (last 7 days)
 *
 * Returns counts of:
 * - Total events
 * - High severity events
 * - Login failures
 * - Access denials
 */
router.get('/audit-logs/summary', requireAdminAccess, async (req, res) => {
  try {
    const isDev = process.env.NODE_ENV === 'development';
    const isSuperAdmin = req.user.role === 'admin' && isDev;

    let companyId = null;
    if (req.company && req.company.id) {
      companyId = req.company.id;
    } else if (!isSuperAdmin) {
      return res.status(403).json({
        error: 'Company context required',
        code: 'NO_COMPANY_CONTEXT',
      });
    }

    const summary = await getSecuritySummary(companyId, 7);

    res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    logger.error('Failed to get security summary', {
      error: error.message,
      userId: req.user.id,
    });

    res.status(500).json({
      error: 'Failed to retrieve security summary',
      code: 'SUMMARY_ERROR',
    });
  }
});

/**
 * GET /api/admin/audit-logs/export
 * Export audit logs as CSV
 *
 * Same filters as GET /audit-logs but returns CSV file
 */
router.get('/audit-logs/export', requireAdminAccess, async (req, res) => {
  try {
    const {
      category,
      action,
      severity,
      startDate,
      endDate,
    } = req.query;

    const isDev = process.env.NODE_ENV === 'development';
    const isSuperAdmin = req.user.role === 'admin' && isDev;

    let companyId = null;
    if (req.company && req.company.id) {
      companyId = req.company.id;
    } else if (!isSuperAdmin) {
      return res.status(403).json({
        error: 'Company context required',
        code: 'NO_COMPANY_CONTEXT',
      });
    }

    // Parse dates
    const parsedStartDate = startDate ? new Date(startDate) : null;
    const parsedEndDate = endDate ? new Date(endDate) : null;

    // Query all matching logs (with higher limit for export)
    const result = await queryAuditLogs({
      category: category || undefined,
      action: action || undefined,
      companyId: companyId,
      severity: severity || undefined,
      startDate: parsedStartDate,
      endDate: parsedEndDate,
      limit: 10000, // Max export limit
      offset: 0,
    });

    // Generate CSV
    const csvHeader = 'Data,Akcja,Kategoria,Poziom,Uzytkownik,IP,Szczegoly\n';
    const csvRows = result.logs.map((log) => {
      const date = new Date(log.createdAt).toISOString();
      const details = log.metadata ? JSON.stringify(log.metadata).replace(/"/g, '""') : '';
      return `"${date}","${log.action}","${log.category || ''}","${log.severity || ''}","${log.userId || 'System'}","${log.ip || ''}","${details}"`;
    });

    const csv = csvHeader + csvRows.join('\n');

    logger.info('Audit logs exported', {
      userId: req.user.id,
      companyId: companyId || 'all',
      exportCount: result.logs.length,
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
  } catch (error) {
    logger.error('Failed to export audit logs', {
      error: error.message,
      userId: req.user.id,
    });

    res.status(500).json({
      error: 'Failed to export audit logs',
      code: 'EXPORT_ERROR',
    });
  }
});

module.exports = router;
