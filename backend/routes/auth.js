const express = require('express');
const { PrismaClient } = require('@prisma/client');
const passwordService = require('../utils/password');
const authMiddleware = require('../middleware/auth');
const { validate, registerSchema, loginSchema, refreshTokenSchema, changePasswordSchema, twoFactorVerifySetupSchema, twoFactorDisableSchema, twoFactorVerifyLoginSchema } = require('../validators/schemas');
const { logAuthEvent, AUDIT_ACTIONS } = require('../services/security-audit.service');
const twoFactorService = require('../services/twoFactor.service');

// Initialize 2FA service
twoFactorService.init();
const logger = require('../utils/logger');

const router = express.Router();
const prisma = new PrismaClient();

/**
 * @route POST /api/auth/register
 * @desc Register new user
 * @access Public
 */
router.post('/register', validate(registerSchema), async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return res.status(409).json({
        error: 'User already exists',
        code: 'USER_EXISTS'
      });
    }

    // Hash password
    const passwordHash = await passwordService.hash(password);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        password: passwordHash,
        role: 'user',
        isActive: true,
        emailVerified: false, // Should be verified via email
      },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
      }
    });

    // Log registration
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'REGISTER',
        resource: 'user',
        resourceId: user.id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        success: true,
      }
    });

    logger.info('User registered', { userId: user.id, email: user.email });

    // Generate tokens
    const accessToken = authMiddleware.generateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    const refreshToken = authMiddleware.generateRefreshToken({
      userId: user.id,
    });

    // Store refresh token in database
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt,
      }
    });

    // Return tokens
    res.status(201).json({
      message: 'Registration successful',
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    logger.error('Registration failed', {
      error: error.message,
      email: req.body.email
    });

    res.status(500).json({
      error: 'Registration failed',
      code: 'REGISTRATION_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route POST /api/auth/login
 * @desc Login user
 * @access Public
 */
router.post('/login', validate(loginSchema), async (req, res) => {
  try {
    const { email, password, twoFactorCode } = req.body;

    // Find user (email is stored lowercase)
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: {
        id: true,
        email: true,
        password: true,
        role: true,
        isActive: true,
        twoFactorEnabled: true,
        twoFactorSecret: true,
      }
    });

    if (!user) {
      // Generic error to prevent email enumeration
      return res.status(401).json({
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Check if account is active
    if (!user.isActive) {
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'LOGIN_FAILED',
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          success: false,
          errorMessage: 'Account deactivated',
        }
      });

      return res.status(403).json({
        error: 'Account deactivated',
        code: 'ACCOUNT_DEACTIVATED'
      });
    }

    // Verify password
    const isValidPassword = await passwordService.verify(password, user.password);

    if (!isValidPassword) {
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'LOGIN_FAILED',
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          success: false,
          errorMessage: 'Invalid password',
        }
      });

      return res.status(401).json({
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Check 2FA if enabled
    if (user.twoFactorEnabled) {
      // Create temporary token for 2FA verification step
      const tempToken = await twoFactorService.createTempToken(user.id);

      logger.info('2FA required for login', { userId: user.id, email: user.email });

      return res.json({
        requiresTwoFactor: true,
        tempToken,
        message: 'Two-factor authentication required',
      });
    }

    // Update last login and activity timestamp
    const now = new Date();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: now,
        lastActivityAt: now  // Reset session timeout on login
      }
    });

    // Log successful login
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'LOGIN',
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        success: true,
      }
    });

    logger.info('User logged in', { userId: user.id, email: user.email });

    // Generate tokens
    const accessToken = authMiddleware.generateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    const refreshToken = authMiddleware.generateRefreshToken({
      userId: user.id,
    });

    // Store refresh token in database
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt,
      }
    });

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    logger.error('Login failed', {
      error: error.message,
      email: req.body.email
    });

    res.status(500).json({
      error: 'Login failed',
      code: 'LOGIN_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route POST /api/auth/change-password
 * @desc Change user password
 * @access Private
 */
router.post('/change-password', authMiddleware.authenticate(), validate(changePasswordSchema), async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    // Get user with password
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        password: true,
      }
    });

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Verify current password
    const isValidPassword = await passwordService.verify(currentPassword, user.password);

    if (!isValidPassword) {
      await logAuthEvent(AUDIT_ACTIONS.PASSWORD_CHANGE, {
        userId,
        email: user.email,
        ip: req.ip,
        userAgent: req.get('user-agent'),
        success: false,
        reason: 'Invalid current password',
      });

      return res.status(401).json({
        error: 'Current password is incorrect',
        code: 'INVALID_CURRENT_PASSWORD'
      });
    }

    // Hash new password
    const newPasswordHash = await passwordService.hash(newPassword);

    // Update password
    await prisma.user.update({
      where: { id: userId },
      data: { password: newPasswordHash }
    });

    // Revoke all refresh tokens (force re-login on other devices)
    await prisma.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true }
    });

    // Audit log
    await logAuthEvent(AUDIT_ACTIONS.PASSWORD_CHANGE, {
      userId,
      email: user.email,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      success: true,
    });

    logger.info('Password changed', { userId, email: user.email });

    res.json({
      success: true,
      message: 'Password changed successfully. Please log in again on other devices.',
    });
  } catch (error) {
    logger.error('Password change failed', {
      error: error.message,
      userId: req.user.id
    });

    res.status(500).json({
      error: 'Failed to change password',
      code: 'PASSWORD_CHANGE_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ============================================
// TWO-FACTOR AUTHENTICATION ENDPOINTS
// ============================================

/**
 * @route POST /api/auth/2fa/enable
 * @desc Generate 2FA secret and QR code
 * @access Private
 *
 * Returns secret, QR code, and backup codes.
 * User must call verify-setup to activate 2FA.
 */
router.post('/2fa/enable', authMiddleware.authenticate(), async (req, res) => {
  try {
    const userId = req.user.id;

    // Check if 2FA already enabled
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, twoFactorEnabled: true }
    });

    if (user.twoFactorEnabled) {
      return res.status(400).json({
        error: 'Two-factor authentication is already enabled',
        code: '2FA_ALREADY_ENABLED'
      });
    }

    // Generate secret
    const { secret, otpauthUrl } = twoFactorService.generateSecret(user.email);

    // Generate QR code
    const qrCode = await twoFactorService.generateQRCode(otpauthUrl);

    // Generate backup codes (plaintext, show to user ONCE)
    const backupCodes = twoFactorService.generateBackupCodes();

    logger.info('2FA setup initiated', { userId, email: user.email });

    res.json({
      success: true,
      secret,
      qrCode,
      backupCodes,
      message: 'Save these backup codes securely. They will not be shown again.',
    });
  } catch (error) {
    logger.error('2FA enable failed', {
      error: error.message,
      userId: req.user.id
    });

    res.status(500).json({
      error: 'Failed to generate 2FA secret',
      code: '2FA_ENABLE_ERROR'
    });
  }
});

/**
 * @route POST /api/auth/2fa/verify-setup
 * @desc Verify TOTP code and activate 2FA
 * @access Private
 *
 * Body: { code, secret }
 * Stores encrypted secret and hashed backup codes in DB.
 */
router.post('/2fa/verify-setup', authMiddleware.authenticate(), validate(twoFactorVerifySetupSchema), async (req, res) => {
  try {
    const { code, secret } = req.body;
    const userId = req.user.id;

    // Check if 2FA already enabled
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, twoFactorEnabled: true }
    });

    if (user.twoFactorEnabled) {
      return res.status(400).json({
        error: 'Two-factor authentication is already enabled',
        code: '2FA_ALREADY_ENABLED'
      });
    }

    // Verify the code
    const isValid = twoFactorService.verifyCode(secret, code);

    if (!isValid) {
      await logAuthEvent(AUDIT_ACTIONS.TWO_FACTOR_ENABLED, {
        userId,
        email: user.email,
        ip: req.ip,
        userAgent: req.get('user-agent'),
        success: false,
        reason: 'Invalid verification code',
      });

      return res.status(400).json({
        error: 'Invalid verification code',
        code: 'INVALID_2FA_CODE'
      });
    }

    // Encrypt secret for storage
    const encryptedSecret = twoFactorService.encryptSecret(secret);

    // Generate backup codes and hash them
    const backupCodes = twoFactorService.generateBackupCodes();
    const hashedBackupCodes = await Promise.all(
      backupCodes.map(async (code) => ({
        codeHash: await twoFactorService.hashBackupCode(code),
      }))
    );

    // Update user and create backup codes in transaction
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          twoFactorEnabled: true,
          twoFactorSecret: encryptedSecret,
        }
      });

      // Delete any existing backup codes
      await tx.twoFactorBackupCode.deleteMany({
        where: { userId }
      });

      // Create new backup codes
      await tx.twoFactorBackupCode.createMany({
        data: hashedBackupCodes.map((bc) => ({
          userId,
          codeHash: bc.codeHash,
        }))
      });
    });

    // Audit log
    await logAuthEvent(AUDIT_ACTIONS.TWO_FACTOR_ENABLED, {
      userId,
      email: user.email,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      success: true,
    });

    logger.info('2FA enabled', { userId, email: user.email });

    res.json({
      success: true,
      message: 'Two-factor authentication enabled successfully',
      backupCodes, // Show backup codes ONE LAST TIME
    });
  } catch (error) {
    logger.error('2FA verify-setup failed', {
      error: error.message,
      userId: req.user.id
    });

    res.status(500).json({
      error: 'Failed to enable 2FA',
      code: '2FA_SETUP_ERROR'
    });
  }
});

/**
 * @route POST /api/auth/2fa/disable
 * @desc Disable 2FA
 * @access Private
 *
 * Body: { password, code }
 * Requires both password and valid TOTP code.
 */
router.post('/2fa/disable', authMiddleware.authenticate(), validate(twoFactorDisableSchema), async (req, res) => {
  try {
    const { password, code } = req.body;
    const userId = req.user.id;

    // Get user
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        password: true,
        twoFactorEnabled: true,
        twoFactorSecret: true,
      }
    });

    if (!user.twoFactorEnabled) {
      return res.status(400).json({
        error: 'Two-factor authentication is not enabled',
        code: '2FA_NOT_ENABLED'
      });
    }

    // Verify password
    const isValidPassword = await passwordService.verify(password, user.password);

    if (!isValidPassword) {
      await logAuthEvent(AUDIT_ACTIONS.TWO_FACTOR_DISABLED, {
        userId,
        email: user.email,
        ip: req.ip,
        userAgent: req.get('user-agent'),
        success: false,
        reason: 'Invalid password',
      });

      return res.status(401).json({
        error: 'Invalid password',
        code: 'INVALID_PASSWORD'
      });
    }

    // Verify TOTP code
    const decryptedSecret = twoFactorService.decryptSecret(user.twoFactorSecret);
    const isValidCode = twoFactorService.verifyCode(decryptedSecret, code);

    if (!isValidCode) {
      await logAuthEvent(AUDIT_ACTIONS.TWO_FACTOR_DISABLED, {
        userId,
        email: user.email,
        ip: req.ip,
        userAgent: req.get('user-agent'),
        success: false,
        reason: 'Invalid 2FA code',
      });

      return res.status(400).json({
        error: 'Invalid verification code',
        code: 'INVALID_2FA_CODE'
      });
    }

    // Disable 2FA in transaction
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          twoFactorEnabled: false,
          twoFactorSecret: null,
        }
      });

      // Delete backup codes
      await tx.twoFactorBackupCode.deleteMany({
        where: { userId }
      });
    });

    // Audit log
    await logAuthEvent(AUDIT_ACTIONS.TWO_FACTOR_DISABLED, {
      userId,
      email: user.email,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      success: true,
    });

    logger.info('2FA disabled', { userId, email: user.email });

    res.json({
      success: true,
      message: 'Two-factor authentication disabled',
    });
  } catch (error) {
    logger.error('2FA disable failed', {
      error: error.message,
      userId: req.user.id
    });

    res.status(500).json({
      error: 'Failed to disable 2FA',
      code: '2FA_DISABLE_ERROR'
    });
  }
});

/**
 * @route POST /api/auth/2fa/verify-login
 * @desc Verify 2FA code during login
 * @access Public (uses tempToken)
 *
 * Body: { tempToken, code }
 * Code can be TOTP code or backup code.
 */
router.post('/2fa/verify-login', validate(twoFactorVerifyLoginSchema), async (req, res) => {
  try {
    const { tempToken, code } = req.body;

    // Verify and consume temp token
    const userId = await twoFactorService.verifyAndConsumeTempToken(tempToken);

    if (!userId) {
      return res.status(401).json({
        error: 'Invalid or expired token. Please login again.',
        code: 'INVALID_TEMP_TOKEN'
      });
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        twoFactorEnabled: true,
        twoFactorSecret: true,
      }
    });

    if (!user || !user.isActive) {
      return res.status(401).json({
        error: 'Account not found or deactivated',
        code: 'ACCOUNT_ERROR'
      });
    }

    if (!user.twoFactorEnabled) {
      return res.status(400).json({
        error: '2FA is not enabled for this account',
        code: '2FA_NOT_ENABLED'
      });
    }

    // Try TOTP verification first
    const decryptedSecret = twoFactorService.decryptSecret(user.twoFactorSecret);
    let isValid = twoFactorService.verifyCode(decryptedSecret, code);
    let usedBackupCode = false;

    // If TOTP fails, try backup codes
    if (!isValid) {
      const backupCodes = await prisma.twoFactorBackupCode.findMany({
        where: { userId, usedAt: null }
      });

      for (const backupCode of backupCodes) {
        const matches = await twoFactorService.verifyBackupCode(code, backupCode.codeHash);
        if (matches) {
          // Mark backup code as used
          await prisma.twoFactorBackupCode.update({
            where: { id: backupCode.id },
            data: { usedAt: new Date() }
          });
          isValid = true;
          usedBackupCode = true;
          break;
        }
      }
    }

    if (!isValid) {
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'LOGIN_FAILED',
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          success: false,
          errorMessage: 'Invalid 2FA code',
        }
      });

      return res.status(401).json({
        error: 'Invalid verification code',
        code: 'INVALID_2FA_CODE'
      });
    }

    // Update last login and activity timestamp
    const now = new Date();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: now,
        lastActivityAt: now
      }
    });

    // Log successful login
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'LOGIN',
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        success: true,
      }
    });

    logger.info('User logged in with 2FA', {
      userId: user.id,
      email: user.email,
      usedBackupCode
    });

    // Generate tokens
    const accessToken = authMiddleware.generateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    const refreshToken = authMiddleware.generateRefreshToken({
      userId: user.id,
    });

    // Store refresh token
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt,
      }
    });

    // Check remaining backup codes
    const remainingBackupCodes = await prisma.twoFactorBackupCode.count({
      where: { userId, usedAt: null }
    });

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      accessToken,
      refreshToken,
      usedBackupCode,
      remainingBackupCodes,
    });
  } catch (error) {
    logger.error('2FA verify-login failed', { error: error.message });

    res.status(500).json({
      error: 'Login verification failed',
      code: '2FA_LOGIN_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route POST /api/auth/refresh
 * @desc Refresh access token
 * @access Public
 */
router.post('/refresh', validate(refreshTokenSchema), async (req, res) => {
  try {
    const { refreshToken } = req.body;

    // Verify refresh token
    const decoded = authMiddleware.verifyRefreshToken(refreshToken);

    // Check if token exists in database and is not revoked
    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            isActive: true,
          }
        }
      }
    });

    if (!storedToken || storedToken.revoked) {
      return res.status(401).json({
        error: 'Invalid refresh token',
        code: 'INVALID_REFRESH_TOKEN'
      });
    }

    if (!storedToken.user.isActive) {
      return res.status(403).json({
        error: 'Account deactivated',
        code: 'ACCOUNT_DEACTIVATED'
      });
    }

    // Revoke old refresh token (token rotation)
    await prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revoked: true }
    });

    // Generate new tokens
    const newAccessToken = authMiddleware.generateAccessToken({
      userId: storedToken.user.id,
      email: storedToken.user.email,
      role: storedToken.user.role,
    });

    const newRefreshToken = authMiddleware.generateRefreshToken({
      userId: storedToken.user.id,
    });

    // Store new refresh token
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.refreshToken.create({
      data: {
        token: newRefreshToken,
        userId: storedToken.user.id,
        expiresAt,
      }
    });

    logger.info('Token refreshed', { userId: storedToken.user.id });

    res.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    logger.error('Token refresh failed', { error: error.message });

    res.status(401).json({
      error: 'Token refresh failed',
      code: 'REFRESH_ERROR'
    });
  }
});

/**
 * @route POST /api/auth/logout
 * @desc Logout user (revoke refresh token)
 * @access Private
 */
router.post('/logout', authMiddleware.authenticate(), async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      // Revoke refresh token
      await prisma.refreshToken.updateMany({
        where: {
          token: refreshToken,
          userId: req.user.id,
        },
        data: { revoked: true }
      });
    }

    // Log logout
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'LOGOUT',
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        success: true,
      }
    });

    logger.info('User logged out', { userId: req.user.id });

    res.json({
      message: 'Logout successful'
    });
  } catch (error) {
    logger.error('Logout failed', {
      error: error.message,
      userId: req.user.id
    });

    res.status(500).json({
      error: 'Logout failed',
      code: 'LOGOUT_ERROR'
    });
  }
});

/**
 * @route GET /api/auth/me
 * @desc Get current user
 * @access Private
 */
router.get('/me', authMiddleware.authenticate(), async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        emailVerified: true,
        twoFactorEnabled: true,
        createdAt: true,
        lastLoginAt: true,
      }
    });

    res.json({ user });
  } catch (error) {
    logger.error('Failed to get user', {
      error: error.message,
      userId: req.user.id
    });

    res.status(500).json({
      error: 'Failed to get user',
      code: 'GET_USER_ERROR'
    });
  }
});

module.exports = router;
