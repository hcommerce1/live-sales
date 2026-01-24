/**
 * CSRF Protection Middleware
 *
 * Implements CSRF protection for state-changing requests.
 * Required when using httpOnly cookies for refresh tokens.
 *
 * TWO MODES:
 *
 * 1. Session-based (for authenticated users with Redis):
 *    - Login response includes csrfToken in body
 *    - Frontend stores csrfToken in memory/sessionStorage
 *    - Every state-changing request includes X-CSRF-Token header
 *    - Backend validates token matches Redis session
 *
 * 2. Double-submit cookie (for auth endpoints):
 *    - Server sets csrf_token as non-HttpOnly cookie
 *    - Client reads cookie and sends in X-CSRF-Token header
 *    - Server verifies header matches cookie
 *    - Works without Redis/session
 *
 * Feature flag: security.csrf.enabled
 */

const crypto = require('crypto');
const logger = require('../utils/logger');
const featureFlags = require('../utils/feature-flags');

// ============================================
// DOUBLE-SUBMIT COOKIE MODE (for auth endpoints)
// ============================================

const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'x-csrf-token';
const TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

/**
 * Check if secure context (HTTPS)
 */
function isSecureContext(req) {
  if (process.env.NODE_ENV === 'production') return true;
  if (process.env.FORCE_HTTPS === 'true') return true;
  if (req?.headers?.['x-forwarded-proto'] === 'https') return true;
  if (process.env.SECURE_DOMAIN) return true;
  return false;
}

/**
 * Get CSRF cookie options
 * NOTE: NOT HttpOnly - client needs to read this to send in header
 */
function getCsrfCookieOptions(req) {
  return {
    httpOnly: false,           // Client needs to read this
    secure: isSecureContext(req),
    sameSite: 'strict',
    path: '/',
    maxAge: TOKEN_EXPIRY_MS,
  };
}

/**
 * Middleware: Double-submit cookie CSRF protection
 * Use this for auth endpoints (refresh, logout, etc.)
 *
 * Sets csrf_token cookie if not present, verifies header on POST/PUT/DELETE
 */
function doubleSubmitCsrf(req, res, next) {
  // Generate/read CSRF token
  let csrfToken = req.cookies[CSRF_COOKIE_NAME];

  if (!csrfToken) {
    csrfToken = crypto.randomBytes(32).toString('hex');
    res.cookie(CSRF_COOKIE_NAME, csrfToken, getCsrfCookieOptions(req));
  }

  // Add to request for convenience
  req.csrfToken = csrfToken;
  res.setHeader('X-CSRF-Token', csrfToken);

  // Skip verification for safe methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Verify header matches cookie
  const headerToken = req.headers[CSRF_HEADER_NAME];

  if (!headerToken) {
    logger.warn('CSRF header missing (double-submit)', {
      path: req.path,
      method: req.method,
      ip: req.ip,
    });

    return res.status(403).json({
      error: 'CSRF token required in X-CSRF-Token header',
      code: 'CSRF_TOKEN_REQUIRED',
    });
  }

  // Timing-safe comparison
  try {
    const cookieBuffer = Buffer.from(csrfToken, 'utf8');
    const headerBuffer = Buffer.from(headerToken, 'utf8');

    if (cookieBuffer.length !== headerBuffer.length ||
        !crypto.timingSafeEqual(cookieBuffer, headerBuffer)) {
      throw new Error('Mismatch');
    }
  } catch (e) {
    logger.warn('CSRF token mismatch (double-submit)', {
      path: req.path,
      method: req.method,
      ip: req.ip,
    });

    return res.status(403).json({
      error: 'CSRF token invalid',
      code: 'CSRF_TOKEN_INVALID',
    });
  }

  next();
}

/**
 * Clear CSRF cookie (call on logout)
 */
function clearCsrfCookie(req, res) {
  res.clearCookie(CSRF_COOKIE_NAME, {
    httpOnly: false,
    secure: isSecureContext(req),
    sameSite: 'strict',
    path: '/',
  });
}

// ============================================
// SESSION-BASED MODE (for authenticated users)
// ============================================

// Redis client for session storage (lazy load)
let redis = null;
function getRedis() {
  if (!redis) {
    const Redis = require('ioredis');
    redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  }
  return redis;
}

/**
 * Generate a new CSRF token
 * @returns {string} 256-bit random token (hex)
 */
function generateCsrfToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Store CSRF token for session
 * @param {string} sessionId - User session ID
 * @param {string} token - CSRF token
 * @param {number} [ttl=3600] - TTL in seconds (default 1 hour)
 */
async function storeCsrfToken(sessionId, token, ttl = 3600) {
  const redisClient = getRedis();
  const key = `csrf:${sessionId}`;
  await redisClient.setex(key, ttl, token);
}

/**
 * Get stored CSRF token for session
 * @param {string} sessionId - User session ID
 * @returns {Promise<string|null>}
 */
async function getCsrfToken(sessionId) {
  const redisClient = getRedis();
  const key = `csrf:${sessionId}`;
  return redisClient.get(key);
}

/**
 * Delete CSRF token (on logout)
 * @param {string} sessionId - User session ID
 */
async function deleteCsrfToken(sessionId) {
  const redisClient = getRedis();
  const key = `csrf:${sessionId}`;
  await redisClient.del(key);
}

/**
 * Rotate CSRF token (security best practice)
 * @param {string} sessionId - User session ID
 * @returns {Promise<string>} New token
 */
async function rotateCsrfToken(sessionId) {
  const newToken = generateCsrfToken();
  await storeCsrfToken(sessionId, newToken);
  return newToken;
}

/**
 * CSRF Protection Middleware
 *
 * Validates X-CSRF-Token header against stored session token.
 * Skips safe methods (GET, HEAD, OPTIONS).
 *
 * @returns {Function} Express middleware
 */
function csrfProtection() {
  return async (req, res, next) => {
    try {
      // Check if CSRF is enabled
      const csrfEnabled = await featureFlags.isEnabled('security.csrf.enabled');
      if (!csrfEnabled) {
        return next();
      }

      // Skip safe methods (idempotent, no state change)
      const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
      if (safeMethods.includes(req.method)) {
        return next();
      }

      // Skip if no user session (public endpoints)
      if (!req.user || !req.user.sessionId) {
        return next();
      }

      // Get token from header
      const headerToken = req.headers['x-csrf-token'];
      if (!headerToken) {
        logger.warn('CSRF token missing', {
          userId: req.user?.id,
          path: req.path,
          method: req.method,
          ip: req.ip,
        });

        return res.status(403).json({
          error: 'CSRF token required',
          code: 'CSRF_TOKEN_MISSING',
        });
      }

      // Get stored token
      const storedToken = await getCsrfToken(req.user.sessionId);
      if (!storedToken) {
        logger.warn('CSRF session not found', {
          userId: req.user?.id,
          sessionId: req.user?.sessionId,
          path: req.path,
        });

        return res.status(403).json({
          error: 'CSRF session expired',
          code: 'CSRF_SESSION_EXPIRED',
        });
      }

      // Constant-time comparison to prevent timing attacks
      const isValid = crypto.timingSafeEqual(
        Buffer.from(headerToken),
        Buffer.from(storedToken)
      );

      if (!isValid) {
        logger.warn('CSRF token mismatch', {
          level: 'SECURITY',
          action: 'CSRF_VALIDATION_FAILED',
          userId: req.user?.id,
          path: req.path,
          method: req.method,
          ip: req.ip,
          userAgent: req.headers['user-agent'],
        });

        return res.status(403).json({
          error: 'Invalid CSRF token',
          code: 'CSRF_TOKEN_INVALID',
        });
      }

      next();
    } catch (error) {
      logger.error('CSRF middleware error', {
        error: error.message,
        path: req.path,
      });

      // Fail closed - deny on error
      return res.status(403).json({
        error: 'CSRF validation failed',
        code: 'CSRF_ERROR',
      });
    }
  };
}

/**
 * Generate and attach CSRF token to response
 * Call this after successful login
 *
 * @param {string} sessionId - User session ID
 * @returns {Promise<string>} CSRF token
 */
async function createCsrfTokenForSession(sessionId) {
  const token = generateCsrfToken();
  await storeCsrfToken(sessionId, token, 24 * 60 * 60); // 24 hours
  return token;
}

/**
 * Custom error class for CSRF errors
 */
class CsrfError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'CsrfError';
    this.code = code;
    this.status = 403;
  }
}

module.exports = {
  // Double-submit cookie mode (for auth endpoints)
  doubleSubmitCsrf,
  clearCsrfCookie,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,

  // Session-based mode (for authenticated users)
  csrfProtection,
  generateCsrfToken,
  storeCsrfToken,
  getCsrfToken,
  deleteCsrfToken,
  rotateCsrfToken,
  createCsrfTokenForSession,
  CsrfError,
};
