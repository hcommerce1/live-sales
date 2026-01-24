/**
 * Onboarding Service
 *
 * Handles automatic updates to user onboarding checklist steps.
 * Called from various places in the application when relevant actions occur.
 */

const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

const prisma = new PrismaClient();

// Valid onboarding steps (must match schema)
const VALID_STEPS = [
  'tokenConfigured',
  'firstExportCreated',
  'sheetsConnected',
  'firstExportRun'
];

/**
 * Mark an onboarding step as completed
 * @param {string} userId - User ID
 * @param {string} step - Step name (must be in VALID_STEPS)
 * @returns {Promise<boolean>} - Whether the step was updated
 */
async function completeStep(userId, step) {
  if (!VALID_STEPS.includes(step)) {
    logger.warn('Invalid onboarding step', { userId, step });
    return false;
  }

  try {
    // Check if step already completed
    const existing = await prisma.userOnboarding.findUnique({
      where: { userId }
    });

    if (existing && existing[step]) {
      // Already completed
      return false;
    }

    // Upsert with step completed
    const updateData = { [step]: true };

    // If all steps will be completed, set completedAt
    if (existing) {
      const allSteps = VALID_STEPS.map(s => s === step ? true : existing[s]);
      if (allSteps.every(Boolean)) {
        updateData.completedAt = new Date();
      }
    }

    await prisma.userOnboarding.upsert({
      where: { userId },
      create: {
        userId,
        tokenConfigured: step === 'tokenConfigured',
        firstExportCreated: step === 'firstExportCreated',
        sheetsConnected: step === 'sheetsConnected',
        firstExportRun: step === 'firstExportRun',
        dismissed: false,
      },
      update: updateData
    });

    logger.debug('Onboarding step auto-completed', { userId, step });
    return true;
  } catch (error) {
    // Non-critical - don't fail the main operation
    logger.error('Failed to auto-complete onboarding step', {
      error: error.message,
      userId,
      step
    });
    return false;
  }
}

/**
 * Shorthand functions for specific steps
 */
const markTokenConfigured = (userId) => completeStep(userId, 'tokenConfigured');
const markFirstExportCreated = (userId) => completeStep(userId, 'firstExportCreated');
const markSheetsConnected = (userId) => completeStep(userId, 'sheetsConnected');
const markFirstExportRun = (userId) => completeStep(userId, 'firstExportRun');

module.exports = {
  completeStep,
  markTokenConfigured,
  markFirstExportCreated,
  markSheetsConnected,
  markFirstExportRun,
  VALID_STEPS,
};
