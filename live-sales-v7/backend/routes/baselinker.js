const express = require('express');
const router = express.Router();
const baselinkerService = require('../services/baselinkerService');
const logger = require('../utils/logger');

/**
 * GET /api/baselinker/orders
 * Get orders from Baselinker
 */
router.get('/orders', async (req, res) => {
  try {
    const filters = {
      status: req.query.status,
      date_from: req.query.date_from,
      date_to: req.query.date_to,
    };

    const orders = await baselinkerService.getOrders(filters);

    res.json({
      success: true,
      count: orders.length,
      data: orders
    });
  } catch (error) {
    logger.error('Failed to fetch orders', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/baselinker/products
 * Get products from Baselinker inventory
 */
router.get('/products', async (req, res) => {
  try {
    const inventoryId = parseInt(req.query.inventory_id) || 35072;
    const filters = {
      category_id: req.query.category_id,
      ean: req.query.ean,
      sku: req.query.sku,
      name: req.query.name,
      page: parseInt(req.query.page) || 1,
    };

    const products = await baselinkerService.getInventoryProductsList(inventoryId, filters);

    res.json({
      success: true,
      count: products.length,
      data: products
    });
  } catch (error) {
    logger.error('Failed to fetch products', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/baselinker/order-statuses
 * Get available order statuses
 */
router.get('/order-statuses', async (req, res) => {
  try {
    const statuses = await baselinkerService.getOrderStatusList();

    res.json({
      success: true,
      data: statuses
    });
  } catch (error) {
    logger.error('Failed to fetch order statuses', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/baselinker/inventories
 * Get available inventories
 */
router.get('/inventories', async (req, res) => {
  try {
    const inventories = await baselinkerService.getInventories();

    res.json({
      success: true,
      data: inventories
    });
  } catch (error) {
    logger.error('Failed to fetch inventories', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
