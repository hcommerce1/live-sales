const express = require('express');
const router = express.Router();
const exportService = require('../services/exportService');
const scheduler = require('../scheduler');
const logger = require('../utils/logger');

/**
 * GET /api/exports
 * Get all export configurations
 */
router.get('/', (req, res) => {
  try {
    const exports = exportService.getAllExports();
    res.json({
      success: true,
      count: exports.length,
      data: exports
    });
  } catch (error) {
    logger.error('Failed to get exports', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/exports/:id
 * Get export configuration by ID
 */
router.get('/:id', (req, res) => {
  try {
    const exportConfig = exportService.getExport(req.params.id);

    if (!exportConfig) {
      return res.status(404).json({
        success: false,
        error: 'Export not found'
      });
    }

    res.json({
      success: true,
      data: exportConfig
    });
  } catch (error) {
    logger.error('Failed to get export', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/exports
 * Create or update export configuration
 */
router.post('/', (req, res) => {
  try {
    const config = req.body;

    if (!config.id) {
      return res.status(400).json({
        success: false,
        error: 'Export ID is required'
      });
    }

    const savedConfig = exportService.saveExport(config.id, config);

    // Update scheduler if export is active
    if (savedConfig.status === 'active' && savedConfig.schedule_minutes) {
      scheduler.rescheduleExport(savedConfig.id, savedConfig.schedule_minutes);
    } else {
      scheduler.stopExport(savedConfig.id);
    }

    res.json({
      success: true,
      data: savedConfig
    });
  } catch (error) {
    logger.error('Failed to save export', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/exports/:id
 * Delete export configuration
 */
router.delete('/:id', (req, res) => {
  try {
    const deleted = exportService.deleteExport(req.params.id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Export not found'
      });
    }

    // Stop scheduled job
    scheduler.stopExport(req.params.id);

    res.json({
      success: true,
      message: 'Export deleted successfully'
    });
  } catch (error) {
    logger.error('Failed to delete export', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/exports/:id/run
 * Run export immediately
 */
router.post('/:id/run', async (req, res) => {
  try {
    const result = await exportService.runExport(req.params.id);

    res.json({
      success: true,
      result
    });
  } catch (error) {
    logger.error('Failed to run export', {
      exportId: req.params.id,
      error: error.message
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/exports/:id/stats
 * Get export statistics
 */
router.get('/:id/stats', (req, res) => {
  try {
    const stats = exportService.getExportStats(req.params.id);

    if (!stats) {
      return res.status(404).json({
        success: false,
        error: 'Export not found'
      });
    }

    // Add scheduler info
    stats.isScheduled = scheduler.isScheduled(req.params.id);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Failed to get export stats', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/exports/:id/toggle
 * Toggle export status (active/paused)
 */
router.post('/:id/toggle', (req, res) => {
  try {
    const exportConfig = exportService.getExport(req.params.id);

    if (!exportConfig) {
      return res.status(404).json({
        success: false,
        error: 'Export not found'
      });
    }

    // Toggle status
    const newStatus = exportConfig.status === 'active' ? 'paused' : 'active';
    exportConfig.status = newStatus;

    const savedConfig = exportService.saveExport(exportConfig.id, exportConfig);

    // Update scheduler
    if (newStatus === 'active' && savedConfig.schedule_minutes) {
      scheduler.rescheduleExport(savedConfig.id, savedConfig.schedule_minutes);
    } else {
      scheduler.stopExport(savedConfig.id);
    }

    res.json({
      success: true,
      data: savedConfig
    });
  } catch (error) {
    logger.error('Failed to toggle export status', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
