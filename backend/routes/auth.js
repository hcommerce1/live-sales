const express = require('express');
const { PrismaClient } = require('@prisma/client');
const passwordService = require('../utils/password');
const authMiddleware = require('../middleware/auth');
const { validate, registerSchema, loginSchema, refreshTokenSchema } = require('../validators/schemas');
const logger = require('../utils/logger');
const { doubleSubmitCsrf, clearCsrfCookie } = require('../middleware/csrf');

const router = express.Router();
const prisma = new PrismaClient();

// Determine if we should use secure cookies
// SECURITY: Not just NODE_ENV - also check for HTTPS indicators
function isSecureContext(req) {
  // Explicit production
  if (process.env.NODE_ENV === 'production') return true;
  // Explicit HTTPS enforcement
  if (process.env.FORCE_HTTPS === 'true') return true;
  // Behind reverse proxy with HTTPS (Render, Vercel, etc.)
  if (req?.headers?.['x-forwarded-proto'] === 'https') return true;
  // Explicit secure domain configured
  if (process.env.SECURE_DOMAIN) return true;
  return false;
}

// Cookie options for refresh token (SECURITY HARDENED)
// Note: secure flag is set dynamically per request
const getRefreshTokenCookieOptions = (req) => ({
  httpOnly: true,           // XSS protection - JS cannot access
  secure: isSecureContext(req), // HTTPS - dynamic check
  sameSite: 'strict',       // CSRF protection (strict = not sent on cross-origin)
  path: '/api/auth',        // Only sent to auth endpoints
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
});

/**
 * Helper: Set refresh token as HttpOnly cookie
 * @param {object} req - Express request (for secure context detection)
 * @param {object} res - Express response
 * @param {string} refreshToken - The refresh token to set
 */
function setRefreshTokenCookie(req, res, refreshToken) {
  res.cookie('refreshToken', refreshToken, getRefreshTokenCookieOptions(req));
}

/**
 * Helper: Clear refresh token cookie
 * @param {object} req - Express request (for secure context detection)
 * @param {object} res - Express response
 */
function clearRefreshTokenCookie(req, res) {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: isSecureContext(req),
    sameSite: 'strict',
    path: '/api/auth',
  });
}

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

    // Set refresh token as HttpOnly cookie (XSS protection)
    setRefreshTokenCookie(req, res, refreshToken);

    // Return access token in body (stored in memory by frontend)
    // NOTE: refreshToken is NOT returned in body - it's in the HttpOnly cookie
    res.status(201).json({
      message: 'Registration successful',
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      accessToken,
      // refreshToken NOT included - security hardening
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
    // SECURITY: 2FA verification not yet implemented - block login if 2FA enabled
    if (user.twoFactorEnabled) {
      logger.warn('Login blocked - 2FA enabled but not implemented', { userId: user.id });
      return res.status(403).json({
        error: '2FA is enabled but verification is not yet available. Please contact support.',
        code: '2FA_NOT_IMPLEMENTED'
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

    // Set refresh token as HttpOnly cookie (XSS protection)
    setRefreshTokenCookie(req, res, refreshToken);

    // Return access token in body (stored in memory by frontend)
    // NOTE: refreshToken is NOT returned in body - it's in the HttpOnly cookie
    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      accessToken,
      // refreshToken NOT included - security hardening
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
 * @route POST /api/auth/refresh
 * @desc Refresh access token
 * @access Public (uses HttpOnly cookie)
 */
router.post('/refresh', doubleSubmitCsrf, async (req, res) => {
  try {
    // Read refresh token from HttpOnly cookie (NOT from body)
    const refreshToken = req.cookies?.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({
        error: 'No refresh token provided',
        code: 'NO_REFRESH_TOKEN'
      });
    }

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

    // Set new refresh token as HttpOnly cookie (token rotation)
    setRefreshTokenCookie(req, res, newRefreshToken);

    logger.info('Token refreshed', { userId: storedToken.user.id });

    // Return only access token in body (refresh token is in cookie)
    res.json({
      accessToken: newAccessToken,
      user: {
        id: storedToken.user.id,
        email: storedToken.user.email,
        role: storedToken.user.role,
      },
      // refreshToken NOT included - security hardening
    });
  } catch (error) {
    logger.error('Token refresh failed', { error: error.message });

    // Clear cookie on refresh failure
    clearRefreshTokenCookie(req, res);

    res.status(401).json({
      error: 'Token refresh failed',
      code: 'REFRESH_ERROR'
    });
  }
});

/**
 * @route POST /api/auth/logout
 * @desc Logout user (revoke refresh token and clear cookie)
 * @access Public (can logout even with expired access token)
 */
router.post('/logout', doubleSubmitCsrf, async (req, res) => {
  try {
    // Read refresh token from HttpOnly cookie
    const refreshToken = req.cookies?.refreshToken;

    if (refreshToken) {
      // Find and revoke the refresh token
      const storedToken = await prisma.refreshToken.findUnique({
        where: { token: refreshToken },
        select: { id: true, userId: true }
      });

      if (storedToken) {
        // Revoke refresh token
        await prisma.refreshToken.update({
          where: { id: storedToken.id },
          data: { revoked: true }
        });

        // Log logout
        await prisma.auditLog.create({
          data: {
            userId: storedToken.userId,
            action: 'LOGOUT',
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
            success: true,
          }
        });

        logger.info('User logged out', { userId: storedToken.userId });
      }
    }

    // ALWAYS clear both cookies
    clearRefreshTokenCookie(req, res);
    clearCsrfCookie(req, res);

    res.json({
      message: 'Logout successful'
    });
  } catch (error) {
    logger.error('Logout failed', { error: error.message });

    // Still clear cookies even on error
    clearRefreshTokenCookie(req, res);
    clearCsrfCookie(req, res);

    res.status(500).json({
      error: 'Logout failed',
      code: 'LOGOUT_ERROR'
    });
  }
});

/**
 * @route GET /api/auth/me
 * @desc Get current user data
 * @access Private - REQUIRES valid accessToken in Authorization header
 *
 * SECURITY: This endpoint NEVER returns tokens.
 * Tokens are ONLY returned from /login and /refresh endpoints.
 *
 * FE Boot Flow:
 * 1. Call POST /api/auth/refresh (uses HttpOnly cookie) → get accessToken
 * 2. Call GET /api/auth/me with accessToken → get user data
 */
router.get('/me', async (req, res) => {
  try {
    // REQUIRE valid accessToken - no fallback to refresh token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Access token required',
        code: 'ACCESS_TOKEN_REQUIRED'
      });
    }

    const token = authHeader.split(' ')[1];
    let decoded;

    try {
      decoded = authMiddleware.verifyAccessToken(token);
    } catch (e) {
      return res.status(401).json({
        error: 'Invalid or expired access token',
        code: 'INVALID_ACCESS_TOKEN'
      });
    }

    // Get full user data
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
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

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        error: 'Account deactivated',
        code: 'ACCOUNT_DEACTIVATED'
      });
    }

    // Update last activity timestamp
    await prisma.user.update({
      where: { id: decoded.userId },
      data: { lastActivityAt: new Date() }
    });

    // Return ONLY user data - NEVER tokens
    res.json({ user });
  } catch (error) {
    logger.error('Failed to get user', { error: error.message });

    res.status(500).json({
      error: 'Failed to get user',
      code: 'GET_USER_ERROR'
    });
  }
});

module.exports = router;
