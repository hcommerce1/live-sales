const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const authMiddleware = require('../middleware/auth');
const { companyContextMiddleware } = require('../middleware/companyContext');
const crypto = require('../utils/crypto');
const logger = require('../utils/logger');
const { logDataEvent, AUDIT_ACTIONS } = require('../services/security-audit.service');
const onboardingService = require('../services/onboarding.service');

const prisma = new PrismaClient();

// Token management constants
const MAX_TOKENS_PER_PROVIDER = 5;
const VALID_PROVIDERS = ['baselinker']; // Extensible for future providers

// ============================================
// MULTIPLE TOKENS API
// ============================================

/**
 * GET /api/user/tokens
 * List all tokens for the company (without values!)
 *
 * Returns: Array of { id, name, provider, isDefault, createdAt, lastUsedAt }
 */
router.get('/tokens', authMiddleware.authenticate(), companyContextMiddleware, async (req, res) => {
  try {
    const companyId = req.company?.id;

    if (!companyId) {
      return res.status(400).json({
        error: 'Company context required',
        code: 'NO_COMPANY_CONTEXT'
      });
    }

    const secrets = await prisma.companySecret.findMany({
      where: { companyId },
      select: {
        id: true,
        name: true,
        secretType: true,
        isDefault: true,
        createdAt: true,
        lastUsedAt: true,
      },
      orderBy: [
        { secretType: 'asc' },
        { isDefault: 'desc' },
        { name: 'asc' }
      ]
    });

    // Map secretType to provider name
    const tokens = secrets.map(secret => ({
      id: secret.id,
      name: secret.name,
      provider: secret.secretType.replace('_token', ''), // 'baselinker_token' -> 'baselinker'
      isDefault: secret.isDefault,
      createdAt: secret.createdAt,
      lastUsedAt: secret.lastUsedAt,
    }));

    res.json({
      success: true,
      tokens,
    });
  } catch (error) {
    logger.error('Error listing tokens', {
      error: error.message,
      userId: req.user?.id,
      companyId: req.company?.id
    });

    res.status(500).json({
      error: 'Failed to list tokens',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * POST /api/user/tokens
 * Add a new token
 *
 * Body: { name, token, provider }
 * Max 5 tokens per provider
 */
router.post('/tokens', authMiddleware.authenticate(), companyContextMiddleware, async (req, res) => {
  try {
    const { name, token, provider = 'baselinker' } = req.body;
    const userId = req.user.id;
    const companyId = req.company?.id;

    if (!companyId) {
      return res.status(400).json({
        error: 'Company context required',
        code: 'NO_COMPANY_CONTEXT'
      });
    }

    // Validate provider
    if (!VALID_PROVIDERS.includes(provider)) {
      return res.status(400).json({
        error: `Invalid provider. Valid providers: ${VALID_PROVIDERS.join(', ')}`,
        code: 'INVALID_PROVIDER'
      });
    }

    // Validate name
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({
        error: 'Token name is required',
        code: 'INVALID_NAME'
      });
    }

    if (name.length > 100) {
      return res.status(400).json({
        error: 'Token name too long (max 100 characters)',
        code: 'NAME_TOO_LONG'
      });
    }

    // Validate token value
    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      return res.status(400).json({
        error: 'Token value is required',
        code: 'INVALID_TOKEN'
      });
    }

    const secretType = `${provider}_token`;

    // Check limit per provider
    const count = await prisma.companySecret.count({
      where: { companyId, secretType }
    });

    if (count >= MAX_TOKENS_PER_PROVIDER) {
      return res.status(400).json({
        error: `Maximum ${MAX_TOKENS_PER_PROVIDER} tokens per provider reached`,
        code: 'TOKEN_LIMIT_REACHED'
      });
    }

    // Check if name already exists for this provider
    const existingWithName = await prisma.companySecret.findUnique({
      where: {
        companyId_secretType_name: {
          companyId,
          secretType,
          name: name.trim()
        }
      }
    });

    if (existingWithName) {
      return res.status(400).json({
        error: 'A token with this name already exists',
        code: 'NAME_EXISTS'
      });
    }

    // Encrypt token
    const encryptedValue = crypto.encrypt(token.trim());

    // If this is the first token, make it default
    const isDefault = count === 0;

    const newSecret = await prisma.companySecret.create({
      data: {
        companyId,
        secretType,
        name: name.trim(),
        encryptedValue,
        isDefault,
        createdBy: userId,
      },
      select: {
        id: true,
        name: true,
        isDefault: true,
        createdAt: true,
      }
    });

    // Audit log
    await logDataEvent(AUDIT_ACTIONS.SECRET_MODIFIED, {
      userId,
      companyId,
      resourceType: 'token',
      resourceId: newSecret.id,
      changes: { action: 'created', provider, name: name.trim() }
    });

    logger.info('Token created', {
      userId,
      companyId,
      tokenId: newSecret.id,
      provider,
      name: name.trim()
    });

    // Auto-update onboarding: tokenConfigured
    onboardingService.markTokenConfigured(userId).catch(() => {});

    res.status(201).json({
      success: true,
      token: {
        id: newSecret.id,
        name: newSecret.name,
        provider,
        isDefault: newSecret.isDefault,
        createdAt: newSecret.createdAt,
      },
      message: 'Token created successfully'
    });
  } catch (error) {
    logger.error('Error creating token', {
      error: error.message,
      userId: req.user?.id,
      companyId: req.company?.id
    });

    res.status(500).json({
      error: 'Failed to create token',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * PUT /api/user/tokens/:id
 * Update token name
 *
 * Body: { name }
 */
router.put('/tokens/:id', authMiddleware.authenticate(), companyContextMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const userId = req.user.id;
    const companyId = req.company?.id;

    if (!companyId) {
      return res.status(400).json({
        error: 'Company context required',
        code: 'NO_COMPANY_CONTEXT'
      });
    }

    // Validate name
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({
        error: 'Token name is required',
        code: 'INVALID_NAME'
      });
    }

    if (name.length > 100) {
      return res.status(400).json({
        error: 'Token name too long (max 100 characters)',
        code: 'NAME_TOO_LONG'
      });
    }

    // Find the token
    const secret = await prisma.companySecret.findFirst({
      where: { id, companyId }
    });

    if (!secret) {
      return res.status(404).json({
        error: 'Token not found',
        code: 'TOKEN_NOT_FOUND'
      });
    }

    // Check if new name conflicts with existing token
    const existingWithName = await prisma.companySecret.findUnique({
      where: {
        companyId_secretType_name: {
          companyId,
          secretType: secret.secretType,
          name: name.trim()
        }
      }
    });

    if (existingWithName && existingWithName.id !== id) {
      return res.status(400).json({
        error: 'A token with this name already exists',
        code: 'NAME_EXISTS'
      });
    }

    const updatedSecret = await prisma.companySecret.update({
      where: { id },
      data: { name: name.trim() },
      select: {
        id: true,
        name: true,
        isDefault: true,
      }
    });

    // Audit log
    await logDataEvent(AUDIT_ACTIONS.SECRET_MODIFIED, {
      userId,
      companyId,
      resourceType: 'token',
      resourceId: id,
      changes: { action: 'renamed', oldName: secret.name, newName: name.trim() }
    });

    logger.info('Token renamed', {
      userId,
      companyId,
      tokenId: id,
      oldName: secret.name,
      newName: name.trim()
    });

    res.json({
      success: true,
      token: updatedSecret,
      message: 'Token updated successfully'
    });
  } catch (error) {
    logger.error('Error updating token', {
      error: error.message,
      tokenId: req.params.id,
      userId: req.user?.id,
      companyId: req.company?.id
    });

    res.status(500).json({
      error: 'Failed to update token',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * DELETE /api/user/tokens/:id
 * Delete a token
 */
router.delete('/tokens/:id', authMiddleware.authenticate(), companyContextMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const companyId = req.company?.id;

    if (!companyId) {
      return res.status(400).json({
        error: 'Company context required',
        code: 'NO_COMPANY_CONTEXT'
      });
    }

    // Find the token
    const secret = await prisma.companySecret.findFirst({
      where: { id, companyId },
      include: {
        exports: { select: { id: true, name: true } }
      }
    });

    if (!secret) {
      return res.status(404).json({
        error: 'Token not found',
        code: 'TOKEN_NOT_FOUND'
      });
    }

    // Check if token is used by any exports
    if (secret.exports.length > 0) {
      return res.status(400).json({
        error: 'Cannot delete token that is used by exports',
        code: 'TOKEN_IN_USE',
        exports: secret.exports.map(e => ({ id: e.id, name: e.name }))
      });
    }

    const wasDefault = secret.isDefault;
    const secretType = secret.secretType;

    // Delete the token
    await prisma.companySecret.delete({
      where: { id }
    });

    // If deleted token was default, make another one default
    if (wasDefault) {
      const nextToken = await prisma.companySecret.findFirst({
        where: { companyId, secretType },
        orderBy: { createdAt: 'asc' }
      });

      if (nextToken) {
        await prisma.companySecret.update({
          where: { id: nextToken.id },
          data: { isDefault: true }
        });
      }
    }

    // Audit log
    await logDataEvent(AUDIT_ACTIONS.SECRET_MODIFIED, {
      userId,
      companyId,
      resourceType: 'token',
      resourceId: id,
      changes: { action: 'deleted', name: secret.name }
    });

    logger.info('Token deleted', {
      userId,
      companyId,
      tokenId: id,
      name: secret.name
    });

    res.json({
      success: true,
      message: 'Token deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting token', {
      error: error.message,
      tokenId: req.params.id,
      userId: req.user?.id,
      companyId: req.company?.id
    });

    res.status(500).json({
      error: 'Failed to delete token',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * POST /api/user/tokens/:id/default
 * Set token as default for its provider
 *
 * Only one token can be default per provider
 */
router.post('/tokens/:id/default', authMiddleware.authenticate(), companyContextMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const companyId = req.company?.id;

    if (!companyId) {
      return res.status(400).json({
        error: 'Company context required',
        code: 'NO_COMPANY_CONTEXT'
      });
    }

    // Find the token
    const secret = await prisma.companySecret.findFirst({
      where: { id, companyId }
    });

    if (!secret) {
      return res.status(404).json({
        error: 'Token not found',
        code: 'TOKEN_NOT_FOUND'
      });
    }

    if (secret.isDefault) {
      return res.json({
        success: true,
        message: 'Token is already the default'
      });
    }

    // Transaction: unset default from other tokens of same type, set this one
    await prisma.$transaction([
      prisma.companySecret.updateMany({
        where: {
          companyId,
          secretType: secret.secretType,
          isDefault: true
        },
        data: { isDefault: false }
      }),
      prisma.companySecret.update({
        where: { id },
        data: { isDefault: true }
      })
    ]);

    // Audit log
    await logDataEvent(AUDIT_ACTIONS.SECRET_MODIFIED, {
      userId,
      companyId,
      resourceType: 'token',
      resourceId: id,
      changes: { action: 'set_default', name: secret.name }
    });

    logger.info('Token set as default', {
      userId,
      companyId,
      tokenId: id,
      name: secret.name,
      provider: secret.secretType
    });

    res.json({
      success: true,
      message: 'Token set as default'
    });
  } catch (error) {
    logger.error('Error setting default token', {
      error: error.message,
      tokenId: req.params.id,
      userId: req.user?.id,
      companyId: req.company?.id
    });

    res.status(500).json({
      error: 'Failed to set default token',
      code: 'INTERNAL_ERROR'
    });
  }
});

// ============================================
// LEGACY BASELINKER TOKEN API (backward compatibility)
// ============================================

/**
 * POST /api/user/baselinker-token
 * Save user's BaseLinker API token (encrypted)
 *
 * Saves to:
 * - CompanySecret (for multi-company support) - primary
 * - User.baselinkerToken (legacy compatibility) - secondary
 */
router.post('/baselinker-token', authMiddleware.authenticate(), companyContextMiddleware, async (req, res) => {
  try {
    logger.info('BaseLinker token save request received', {
      userId: req.user?.id,
      companyId: req.company?.id,
      hasToken: !!req.body.token
    });

    const { token } = req.body;
    const userId = req.user.id;
    const companyId = req.company?.id;

    if (!token || typeof token !== 'string' || token.trim() === '') {
      logger.warn('Invalid token provided', { userId });
      return res.status(400).json({
        error: 'Invalid token',
        code: 'INVALID_TOKEN'
      });
    }

    logger.info('Encrypting BaseLinker token', { userId, companyId });
    // Encrypt the token with AES-256-GCM
    const encryptedToken = crypto.encrypt(token);

    // Save to CompanySecret if company context available (primary storage)
    if (companyId) {
      await prisma.companySecret.upsert({
        where: {
          companyId_secretType: {
            companyId,
            secretType: 'baselinker_token'
          }
        },
        create: {
          companyId,
          secretType: 'baselinker_token',
          encryptedValue: encryptedToken,
          createdBy: userId
        },
        update: {
          encryptedValue: encryptedToken,
          createdBy: userId,
          updatedAt: new Date()
        }
      });

      logger.info('BaseLinker token saved to CompanySecret', {
        userId,
        companyId,
        action: 'SAVE_BASELINKER_TOKEN_COMPANY'
      });
    }

    // Also save to User record for backward compatibility
    await prisma.user.update({
      where: { id: userId },
      data: {
        baselinkerToken: encryptedToken,
        updatedAt: new Date()
      }
    });

    logger.info('BaseLinker token saved successfully', {
      userId,
      companyId,
      action: 'SAVE_BASELINKER_TOKEN'
    });

    res.json({
      success: true,
      message: 'Token saved successfully'
    });
  } catch (error) {
    logger.error('Error saving BaseLinker token', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
      companyId: req.company?.id,
      errorName: error.name,
      errorCode: error.code
    });

    res.status(500).json({
      error: `Failed to save token: ${error.message}`,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * GET /api/user/baselinker-token
 * Get user's BaseLinker API token (decrypted)
 *
 * Priority:
 * 1. CompanySecret (if company context available)
 * 2. User.baselinkerToken (legacy fallback)
 */
router.get('/baselinker-token', authMiddleware.authenticate(), companyContextMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const companyId = req.company?.id;

    // Try CompanySecret first (if company context available)
    if (companyId) {
      const companySecret = await prisma.companySecret.findUnique({
        where: {
          companyId_secretType: {
            companyId,
            secretType: 'baselinker_token'
          }
        }
      });

      if (companySecret) {
        const decryptedToken = crypto.decrypt(companySecret.encryptedValue);
        return res.json({
          token: decryptedToken,
          source: 'company'
        });
      }
    }

    // Fallback to User.baselinkerToken
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { baselinkerToken: true }
    });

    if (!user || !user.baselinkerToken) {
      return res.json({
        token: null
      });
    }

    // Decrypt the token
    const decryptedToken = crypto.decrypt(user.baselinkerToken);

    res.json({
      token: decryptedToken,
      source: 'user'
    });
  } catch (error) {
    logger.error('Error loading BaseLinker token', {
      error: error.message,
      userId: req.user?.id,
      companyId: req.company?.id
    });

    res.status(500).json({
      error: 'Failed to load token',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * DELETE /api/user/baselinker-token
 * Delete user's BaseLinker API token
 */
router.delete('/baselinker-token', authMiddleware.authenticate(), companyContextMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const companyId = req.company?.id;

    // Delete from CompanySecret if company context available
    if (companyId) {
      await prisma.companySecret.deleteMany({
        where: {
          companyId,
          secretType: 'baselinker_token'
        }
      });

      logger.info('BaseLinker token deleted from CompanySecret', {
        userId,
        companyId,
        action: 'DELETE_BASELINKER_TOKEN_COMPANY'
      });
    }

    // Also delete from User record
    await prisma.user.update({
      where: { id: userId },
      data: {
        baselinkerToken: null,
        updatedAt: new Date()
      }
    });

    logger.info('BaseLinker token deleted', {
      userId,
      companyId,
      action: 'DELETE_BASELINKER_TOKEN'
    });

    res.json({
      success: true,
      message: 'Token deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting BaseLinker token', {
      error: error.message,
      userId: req.user?.id,
      companyId: req.company?.id
    });

    res.status(500).json({
      error: 'Failed to delete token',
      code: 'INTERNAL_ERROR'
    });
  }
});

// ============================================
// ONBOARDING API
// ============================================

// Whitelist of valid onboarding steps - CRITICAL for security
const VALID_ONBOARDING_STEPS = [
  'tokenConfigured',
  'firstExportCreated',
  'sheetsConnected',
  'firstExportRun'
];

/**
 * GET /api/user/onboarding
 * Get onboarding checklist status
 */
router.get('/onboarding', authMiddleware.authenticate(), async (req, res) => {
  try {
    const userId = req.user.id;

    // Get or create onboarding record
    let onboarding = await prisma.userOnboarding.findUnique({
      where: { userId }
    });

    if (!onboarding) {
      // Create default onboarding record
      onboarding = await prisma.userOnboarding.create({
        data: {
          userId,
          tokenConfigured: false,
          firstExportCreated: false,
          sheetsConnected: false,
          firstExportRun: false,
          dismissed: false,
        }
      });
    }

    // Calculate progress
    const steps = [
      { key: 'tokenConfigured', label: 'Skonfiguruj token API', completed: onboarding.tokenConfigured },
      { key: 'firstExportCreated', label: 'Utwórz pierwszy eksport', completed: onboarding.firstExportCreated },
      { key: 'sheetsConnected', label: 'Połącz arkusz Google', completed: onboarding.sheetsConnected },
      { key: 'firstExportRun', label: 'Uruchom pierwszy eksport', completed: onboarding.firstExportRun },
    ];

    const completedCount = steps.filter(s => s.completed).length;
    const totalSteps = steps.length;
    const progress = Math.round((completedCount / totalSteps) * 100);
    const allCompleted = completedCount === totalSteps;

    res.json({
      success: true,
      data: {
        steps,
        progress,
        completedCount,
        totalSteps,
        allCompleted,
        dismissed: onboarding.dismissed,
        completedAt: onboarding.completedAt,
      }
    });
  } catch (error) {
    logger.error('Error getting onboarding status', {
      error: error.message,
      userId: req.user?.id
    });

    res.status(500).json({
      error: 'Failed to get onboarding status',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * POST /api/user/onboarding/complete/:step
 * Mark an onboarding step as completed
 *
 * Step must be in VALID_ONBOARDING_STEPS whitelist
 */
router.post('/onboarding/complete/:step', authMiddleware.authenticate(), async (req, res) => {
  try {
    const { step } = req.params;
    const userId = req.user.id;

    // SECURITY: Validate step against whitelist
    if (!VALID_ONBOARDING_STEPS.includes(step)) {
      return res.status(400).json({
        error: 'Invalid onboarding step',
        code: 'INVALID_STEP',
        validSteps: VALID_ONBOARDING_STEPS
      });
    }

    // Get or create onboarding record
    let onboarding = await prisma.userOnboarding.findUnique({
      where: { userId }
    });

    if (!onboarding) {
      onboarding = await prisma.userOnboarding.create({
        data: {
          userId,
          tokenConfigured: false,
          firstExportCreated: false,
          sheetsConnected: false,
          firstExportRun: false,
          dismissed: false,
        }
      });
    }

    // Check if step is already completed
    if (onboarding[step]) {
      return res.json({
        success: true,
        message: 'Step already completed',
        alreadyCompleted: true
      });
    }

    // Update the step
    const updateData = { [step]: true };

    // Check if all steps will be completed
    const allSteps = VALID_ONBOARDING_STEPS.map(s => s === step ? true : onboarding[s]);
    if (allSteps.every(Boolean)) {
      updateData.completedAt = new Date();
    }

    await prisma.userOnboarding.update({
      where: { userId },
      data: updateData
    });

    logger.info('Onboarding step completed', {
      userId,
      step,
      allCompleted: allSteps.every(Boolean)
    });

    res.json({
      success: true,
      message: `Step '${step}' marked as completed`,
      allCompleted: allSteps.every(Boolean)
    });
  } catch (error) {
    logger.error('Error completing onboarding step', {
      error: error.message,
      step: req.params.step,
      userId: req.user?.id
    });

    res.status(500).json({
      error: 'Failed to complete onboarding step',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * POST /api/user/onboarding/dismiss
 * Dismiss the onboarding checklist
 */
router.post('/onboarding/dismiss', authMiddleware.authenticate(), async (req, res) => {
  try {
    const userId = req.user.id;

    // Upsert onboarding with dismissed = true
    await prisma.userOnboarding.upsert({
      where: { userId },
      create: {
        userId,
        tokenConfigured: false,
        firstExportCreated: false,
        sheetsConnected: false,
        firstExportRun: false,
        dismissed: true,
      },
      update: {
        dismissed: true
      }
    });

    logger.info('Onboarding dismissed', { userId });

    res.json({
      success: true,
      message: 'Onboarding checklist dismissed'
    });
  } catch (error) {
    logger.error('Error dismissing onboarding', {
      error: error.message,
      userId: req.user?.id
    });

    res.status(500).json({
      error: 'Failed to dismiss onboarding',
      code: 'INTERNAL_ERROR'
    });
  }
});

module.exports = router;
