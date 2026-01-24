/**
 * Two-Factor Authentication Service
 *
 * Implements TOTP-based 2FA using speakeasy.
 * Backup codes are hashed with Argon2id and stored in DB.
 * Temporary tokens are stored in Redis with 5-min TTL.
 *
 * SECURITY:
 * - Secret is encrypted at rest (AES-256-GCM)
 * - Backup codes are hashed (Argon2id), never stored plaintext
 * - tempToken is UUID, NOT JWT, with short TTL
 */

const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const crypto = require('crypto');
const Redis = require('ioredis');
const logger = require('../utils/logger');
const passwordService = require('../utils/password');
const { encrypt, decrypt } = require('../utils/crypto');

// Redis key prefix for 2FA temp tokens
const TEMP_TOKEN_PREFIX = '2fa:temp:';
const TEMP_TOKEN_TTL = 300; // 5 minutes

// In-memory fallback when Redis is unavailable
const memoryStore = new Map();

/**
 * TwoFactorService class
 */
class TwoFactorService {
  constructor() {
    this.redis = null;
    this.initialized = false;
  }

  /**
   * Initialize Redis connection
   */
  init() {
    if (this.initialized) {
      return;
    }

    if (process.env.REDIS_URL) {
      try {
        this.redis = new Redis(process.env.REDIS_URL, {
          enableOfflineQueue: false,
          maxRetriesPerRequest: 3,
          lazyConnect: true,
        });

        this.redis.on('error', (err) => {
          logger.error('TwoFactorService Redis error', { error: err.message });
        });

        this.redis.on('connect', () => {
          logger.info('TwoFactorService Redis connected');
        });

        this.redis.connect().catch((err) => {
          logger.warn('TwoFactorService Redis connection failed, using memory fallback', {
            error: err.message,
          });
          this.redis = null;
        });
      } catch (error) {
        logger.warn('TwoFactorService Redis init failed, using memory fallback', {
          error: error.message,
        });
        this.redis = null;
      }
    } else {
      logger.warn('REDIS_URL not set, 2FA will use memory store (not recommended for production)');
    }

    this.initialized = true;
  }

  /**
   * Generate new TOTP secret
   * @param {string} email - User email for QR code label
   * @returns {{ secret: string, otpauthUrl: string }}
   */
  generateSecret(email) {
    const secret = speakeasy.generateSecret({
      name: `Live Sales (${email})`,
      issuer: 'Live Sales',
      length: 32,
    });

    return {
      secret: secret.base32,
      otpauthUrl: secret.otpauth_url,
    };
  }

  /**
   * Generate QR code as data URL
   * @param {string} otpauthUrl
   * @returns {Promise<string>} Data URL
   */
  async generateQRCode(otpauthUrl) {
    return QRCode.toDataURL(otpauthUrl, {
      width: 200,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    });
  }

  /**
   * Verify TOTP code
   * @param {string} secret - Base32 encoded secret
   * @param {string} code - 6-digit code
   * @returns {boolean}
   */
  verifyCode(secret, code) {
    return speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token: code,
      window: 1, // Allow 1 step before/after (30 sec tolerance)
    });
  }

  /**
   * Generate backup codes (8 codes, 8 characters each)
   * @returns {string[]} Plaintext codes (show to user ONCE)
   */
  generateBackupCodes() {
    const codes = [];
    for (let i = 0; i < 8; i++) {
      // Generate 8 random hex characters
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      codes.push(code);
    }
    return codes;
  }

  /**
   * Hash backup code for storage
   * @param {string} code
   * @returns {Promise<string>}
   */
  async hashBackupCode(code) {
    return passwordService.hash(code.toUpperCase());
  }

  /**
   * Verify backup code against hash
   * @param {string} code - User input
   * @param {string} hash - Stored hash
   * @returns {Promise<boolean>}
   */
  async verifyBackupCode(code, hash) {
    return passwordService.verify(code.toUpperCase(), hash);
  }

  /**
   * Encrypt TOTP secret for database storage
   * @param {string} secret
   * @returns {string}
   */
  encryptSecret(secret) {
    return encrypt(secret);
  }

  /**
   * Decrypt TOTP secret from database
   * @param {string} encryptedSecret
   * @returns {string}
   */
  decryptSecret(encryptedSecret) {
    return decrypt(encryptedSecret);
  }

  /**
   * Create temporary token for 2FA verification step
   * Used during login when 2FA is required
   *
   * @param {string} userId
   * @returns {Promise<string>} Temporary token (UUID)
   */
  async createTempToken(userId) {
    const token = crypto.randomUUID();
    const key = `${TEMP_TOKEN_PREFIX}${token}`;

    if (this.redis) {
      try {
        await this.redis.setex(key, TEMP_TOKEN_TTL, userId);
        logger.debug('2FA temp token created in Redis', { userId, ttl: TEMP_TOKEN_TTL });
      } catch (error) {
        logger.error('Failed to store temp token in Redis', { error: error.message });
        // Fallback to memory
        memoryStore.set(key, { userId, expiresAt: Date.now() + TEMP_TOKEN_TTL * 1000 });
      }
    } else {
      // Memory fallback
      memoryStore.set(key, { userId, expiresAt: Date.now() + TEMP_TOKEN_TTL * 1000 });
      logger.debug('2FA temp token created in memory', { userId, ttl: TEMP_TOKEN_TTL });
    }

    return token;
  }

  /**
   * Verify and consume temporary token
   * Token is deleted after use (one-time)
   *
   * @param {string} token
   * @returns {Promise<string|null>} userId or null if invalid/expired
   */
  async verifyAndConsumeTempToken(token) {
    const key = `${TEMP_TOKEN_PREFIX}${token}`;

    if (this.redis) {
      try {
        const userId = await this.redis.get(key);
        if (userId) {
          await this.redis.del(key); // One-time use
          return userId;
        }
        return null;
      } catch (error) {
        logger.error('Failed to verify temp token in Redis', { error: error.message });
        // Fallback to memory check
      }
    }

    // Memory fallback
    const stored = memoryStore.get(key);
    if (stored) {
      memoryStore.delete(key); // One-time use
      if (stored.expiresAt > Date.now()) {
        return stored.userId;
      }
    }

    return null;
  }

  /**
   * Clean expired tokens from memory store (called periodically)
   */
  cleanExpiredMemoryTokens() {
    const now = Date.now();
    for (const [key, value] of memoryStore.entries()) {
      if (value.expiresAt <= now) {
        memoryStore.delete(key);
      }
    }
  }
}

// Singleton instance
const twoFactorService = new TwoFactorService();

// Cleanup expired memory tokens every minute
setInterval(() => {
  twoFactorService.cleanExpiredMemoryTokens();
}, 60000);

module.exports = twoFactorService;
