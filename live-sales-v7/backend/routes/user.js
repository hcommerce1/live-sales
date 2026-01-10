const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { authenticateToken } = require('../middleware/auth');
const { encrypt, decrypt } = require('../utils/encryption');
const logger = require('../utils/logger');

const prisma = new PrismaClient();

/**
 * POST /api/user/baselinker-token
 * Save user's BaseLinker API token (encrypted)
 */
router.post('/baselinker-token', authenticateToken, async (req, res) => {
  try {
    const { token } = req.body;
    const userId = req.user.id;

    if (!token || typeof token !== 'string' || token.trim() === '') {
      return res.status(400).json({
        error: 'Invalid token',
        code: 'INVALID_TOKEN'
      });
    }

    // Encrypt the token with AES-256-GCM
    const encryptedToken = encrypt(token);

    // Update user record
    await prisma.user.update({
      where: { id: userId },
      data: {
        baselinkerToken: encryptedToken,
        updatedAt: new Date()
      }
    });

    logger.info('BaseLinker token saved', {
      userId,
      action: 'SAVE_BASELINKER_TOKEN'
    });

    res.json({
      success: true,
      message: 'Token saved successfully'
    });
  } catch (error) {
    logger.error('Error saving BaseLinker token', {
      error: error.message,
      userId: req.user?.id
    });

    res.status(500).json({
      error: 'Failed to save token',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * GET /api/user/baselinker-token
 * Get user's BaseLinker API token (decrypted)
 */
router.get('/baselinker-token', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

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
    const decryptedToken = decrypt(user.baselinkerToken);

    res.json({
      token: decryptedToken
    });
  } catch (error) {
    logger.error('Error loading BaseLinker token', {
      error: error.message,
      userId: req.user?.id
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
router.delete('/baselinker-token', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    await prisma.user.update({
      where: { id: userId },
      data: {
        baselinkerToken: null,
        updatedAt: new Date()
      }
    });

    logger.info('BaseLinker token deleted', {
      userId,
      action: 'DELETE_BASELINKER_TOKEN'
    });

    res.json({
      success: true,
      message: 'Token deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting BaseLinker token', {
      error: error.message,
      userId: req.user?.id
    });

    res.status(500).json({
      error: 'Failed to delete token',
      code: 'INTERNAL_ERROR'
    });
  }
});

module.exports = router;
