/**
 * BaseLinker Routes
 *
 * API endpoints for BaseLinker integration.
 * All routes require authentication and company context.
 *
 * P0 FIX: Now properly retrieves token from CompanySecret
 * and uses BaseLinkerClientFactory for client creation.
 */

const express = require('express');
const router = express.Router();

const logger = require('../utils/logger');
const { companyContextMiddleware, requireCompany } = require('../middleware/companyContext');
const { featureFlagMiddleware } = require('../middleware/featureFlag');
const { getClient } = require('../services/baselinker');

// ============================================
// Middleware Stack
// ============================================

// All routes require company context
router.use(companyContextMiddleware);
router.use(requireCompany);

// ============================================
// Helper: Get BaseLinker client for company
// ============================================

async function getBaseLinkerClient(req, res) {
  try {
    const client = await getClient(req.company.id);
    return client;
  } catch (error) {
    if (error.code === 'TOKEN_NOT_CONFIGURED') {
      res.status(400).json({
        success: false,
        error: 'BaseLinker API token not configured',
        code: 'BASELINKER_NOT_CONFIGURED',
        message: 'Please configure your BaseLinker API token in Settings → Integrations',
      });
      return null;
    }
    throw error;
  }
}

// ============================================
// Routes
// ============================================

/**
 * GET /api/baselinker/orders
 * Get orders from Baselinker
 */
router.get('/orders', featureFlagMiddleware('baselinker.orders'), async (req, res) => {
  try {
    const client = await getBaseLinkerClient(req, res);
    if (!client) return;

    const filters = {
      status: req.query.status,
      date_from: req.query.date_from,
      date_to: req.query.date_to,
      filter_id: req.query.filter_id,
      get_unconfirmed: req.query.get_unconfirmed === 'true',
    };

    const orders = await client.getOrders(filters);

    res.json({
      success: true,
      count: orders.length,
      data: orders,
    });
  } catch (error) {
    if (error.code === 'AUTH_ERROR') {
      return res.status(401).json({
        success: false,
        error: 'BaseLinker authentication failed',
        code: 'BASELINKER_AUTH_ERROR',
        message: 'Please check your BaseLinker API token',
      });
    }

    logger.error('Failed to fetch orders', {
      error: error.message,
      companyId: req.company?.id,
    });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/baselinker/order/:id
 * Get single order details
 */
router.get('/order/:id', featureFlagMiddleware('baselinker.orders'), async (req, res) => {
  try {
    const client = await getBaseLinkerClient(req, res);
    if (!client) return;

    const orderId = parseInt(req.params.id, 10);
    if (isNaN(orderId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid order ID',
      });
    }

    const order = await client.getOrderDetails(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
      });
    }

    res.json({
      success: true,
      data: order,
    });
  } catch (error) {
    logger.error('Failed to fetch order details', {
      error: error.message,
      orderId: req.params.id,
      companyId: req.company?.id,
    });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/baselinker/products
 * Get products from Baselinker inventory
 */
router.get('/products', featureFlagMiddleware('baselinker.products'), async (req, res) => {
  try {
    const client = await getBaseLinkerClient(req, res);
    if (!client) return;

    const inventoryId = parseInt(req.query.inventory_id, 10);
    if (!inventoryId || isNaN(inventoryId)) {
      return res.status(400).json({
        success: false,
        error: 'inventory_id is required',
      });
    }

    const filters = {
      category_id: req.query.category_id,
      ean: req.query.ean,
      sku: req.query.sku,
      name: req.query.name,
      price_from: req.query.price_from,
      price_to: req.query.price_to,
      quantity_from: req.query.quantity_from,
      quantity_to: req.query.quantity_to,
      page: parseInt(req.query.page, 10) || 1,
    };

    const products = await client.getInventoryProductsList(inventoryId, filters);

    res.json({
      success: true,
      count: products.length,
      page: filters.page,
      data: products,
    });
  } catch (error) {
    logger.error('Failed to fetch products', {
      error: error.message,
      companyId: req.company?.id,
    });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/baselinker/products/:inventoryId/data
 * Get detailed product data
 */
router.get(
  '/products/:inventoryId/data',
  featureFlagMiddleware('baselinker.products'),
  async (req, res) => {
    try {
      const client = await getBaseLinkerClient(req, res);
      if (!client) return;

      const inventoryId = parseInt(req.params.inventoryId, 10);
      const productIds = req.query.ids?.split(',').map((id) => parseInt(id, 10));

      if (!inventoryId || isNaN(inventoryId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid inventory ID',
        });
      }

      if (!productIds || productIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Product IDs required (comma-separated)',
        });
      }

      const products = await client.getInventoryProductsData(productIds, inventoryId);

      res.json({
        success: true,
        count: Object.keys(products).length,
        data: products,
      });
    } catch (error) {
      logger.error('Failed to fetch product data', {
        error: error.message,
        companyId: req.company?.id,
      });
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

/**
 * GET /api/baselinker/products/:inventoryId/stock
 * Get product stock levels
 */
router.get(
  '/products/:inventoryId/stock',
  featureFlagMiddleware('baselinker.products'),
  async (req, res) => {
    try {
      const client = await getBaseLinkerClient(req, res);
      if (!client) return;

      const inventoryId = parseInt(req.params.inventoryId, 10);
      const page = parseInt(req.query.page, 10) || 1;

      if (!inventoryId || isNaN(inventoryId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid inventory ID',
        });
      }

      const stock = await client.getInventoryProductsStock(inventoryId, page);

      res.json({
        success: true,
        page,
        data: stock,
      });
    } catch (error) {
      logger.error('Failed to fetch product stock', {
        error: error.message,
        companyId: req.company?.id,
      });
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

/**
 * GET /api/baselinker/order-statuses
 * Get available order statuses
 */
router.get('/order-statuses', async (req, res) => {
  try {
    const client = await getBaseLinkerClient(req, res);
    if (!client) return;

    const statuses = await client.getOrderStatusList();

    res.json({
      success: true,
      data: statuses,
    });
  } catch (error) {
    logger.error('Failed to fetch order statuses', {
      error: error.message,
      companyId: req.company?.id,
    });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/baselinker/inventories
 * Get available inventories
 */
router.get('/inventories', async (req, res) => {
  try {
    const client = await getBaseLinkerClient(req, res);
    if (!client) return;

    const inventories = await client.getInventories();

    res.json({
      success: true,
      data: inventories,
    });
  } catch (error) {
    logger.error('Failed to fetch inventories', {
      error: error.message,
      companyId: req.company?.id,
    });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/baselinker/status
 * Get integration status (is token configured?)
 */
router.get('/status', async (req, res) => {
  try {
    const companySecretService = require('../services/companySecret.service');

    const hasToken = await companySecretService.hasSecret(
      req.company.id,
      companySecretService.SECRET_TYPES.BASELINKER_TOKEN
    );

    res.json({
      success: true,
      data: {
        configured: hasToken,
        companyId: req.company.id,
      },
    });
  } catch (error) {
    logger.error('Failed to get integration status', {
      error: error.message,
      companyId: req.company?.id,
    });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
