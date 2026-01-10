const axios = require('axios');
const config = require('../config/baselinker');
const logger = require('../utils/logger');

class BaselinkerService {
  constructor() {
    this.apiUrl = config.apiUrl;
    this.timeout = config.timeout;
  }

  /**
   * Make API request to Baselinker
   * @param {string} userToken - User's BaseLinker API token
   * @param {string} method - API method name
   * @param {object} parameters - Request parameters
   * @returns {Promise<object>} - API response
   */
  async makeRequest(userToken, method, parameters = {}) {
    try {
      if (!userToken) {
        throw new Error('BaseLinker token is required. Please configure your token in Settings.');
      }

      logger.info(`Baselinker API Request: ${method}`, { parameters });

      const response = await axios.post(
        this.apiUrl,
        new URLSearchParams({
          token: userToken,
          method: method,
          parameters: JSON.stringify(parameters)
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          timeout: this.timeout
        }
      );

      if (response.data.status === 'ERROR') {
        throw new Error(`Baselinker API Error: ${response.data.error_message || 'Unknown error'}`);
      }

      logger.info(`Baselinker API Response: ${method}`, {
        status: response.data.status
      });

      return response.data;
    } catch (error) {
      logger.error(`Baselinker API Request Failed: ${method}`, {
        error: error.message,
        parameters
      });
      throw error;
    }
  }

  /**
   * Get orders from Baselinker
   * @param {string} userToken - User's BaseLinker API token
   * @param {object} filters - Order filters
   * @returns {Promise<Array>} - List of orders
   */
  async getOrders(userToken, filters = {}) {
    const parameters = {
      date_confirmed_from: filters.date_from ? Math.floor(new Date(filters.date_from).getTime() / 1000) : null,
      date_confirmed_to: filters.date_to ? Math.floor(new Date(filters.date_to).getTime() / 1000) : null,
      order_status_id: filters.status || null,
      get_unconfirmed_orders: filters.get_unconfirmed || false,
      filter_id: filters.filter_id || null,
    };

    // Remove null values
    Object.keys(parameters).forEach(key => {
      if (parameters[key] === null) {
        delete parameters[key];
      }
    });

    const response = await this.makeRequest(userToken, 'getOrders', parameters);
    return response.orders || [];
  }

  /**
   * Get products from inventory
   * @param {string} userToken - User's BaseLinker API token
   * @param {number} inventoryId - Inventory ID
   * @param {object} filters - Product filters
   * @returns {Promise<Array>} - List of products
   */
  async getInventoryProductsList(userToken, inventoryId = config.inventories.main, filters = {}) {
    const parameters = {
      inventory_id: inventoryId,
      filter_id: filters.filter_id || null,
      filter_category_id: filters.category_id || null,
      filter_ean: filters.ean || null,
      filter_sku: filters.sku || null,
      filter_name: filters.name || null,
      filter_price_from: filters.price_from || null,
      filter_price_to: filters.price_to || null,
      filter_quantity_from: filters.quantity_from || null,
      filter_quantity_to: filters.quantity_to || null,
      page: filters.page || 1,
    };

    // Remove null values
    Object.keys(parameters).forEach(key => {
      if (parameters[key] === null) {
        delete parameters[key];
      }
    });

    const response = await this.makeRequest(userToken, 'getInventoryProductsList', parameters);
    return response.products || [];
  }

  /**
   * Get detailed product data
   * @param {string} userToken - User's BaseLinker API token
   * @param {Array<number>} productIds - Array of product IDs
   * @param {number} inventoryId - Inventory ID
   * @returns {Promise<object>} - Product details
   */
  async getInventoryProductsData(userToken, productIds, inventoryId = config.inventories.main) {
    const parameters = {
      inventory_id: inventoryId,
      products: productIds
    };

    const response = await this.makeRequest(userToken, 'getInventoryProductsData', parameters);
    return response.products || {};
  }

  /**
   * Get inventory products stock
   * @param {string} userToken - User's BaseLinker API token
   * @param {number} inventoryId - Inventory ID
   * @param {number} page - Page number
   * @returns {Promise<object>} - Products stock data
   */
  async getInventoryProductsStock(userToken, inventoryId = config.inventories.main, page = 1) {
    const parameters = {
      inventory_id: inventoryId,
      page: page
    };

    const response = await this.makeRequest(userToken, 'getInventoryProductsStock', parameters);
    return response.products || {};
  }

  /**
   * Get order details
   * @param {string} userToken - User's BaseLinker API token
   * @param {number} orderId - Order ID
   * @returns {Promise<object>} - Order details
   */
  async getOrderDetails(userToken, orderId) {
    const parameters = {
      order_id: orderId
    };

    const response = await this.makeRequest(userToken, 'getOrderDetails', parameters);
    return response.order || null;
  }

  /**
   * Get available order statuses
   * @param {string} userToken - User's BaseLinker API token
   * @returns {Promise<Array>} - List of order statuses
   */
  async getOrderStatusList(userToken) {
    const response = await this.makeRequest(userToken, 'getOrderStatusList', {});
    return response.statuses || [];
  }

  /**
   * Get inventories list
   * @param {string} userToken - User's BaseLinker API token
   * @returns {Promise<Array>} - List of inventories
   */
  async getInventories(userToken) {
    const response = await this.makeRequest(userToken, 'getInventories', {});
    return response.inventories || [];
  }
}

module.exports = new BaselinkerService();
