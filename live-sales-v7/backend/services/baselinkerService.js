const axios = require('axios');
const config = require('../config/baselinker');
const logger = require('../utils/logger');

class BaselinkerService {
  constructor() {
    this.apiUrl = config.apiUrl;
    this.apiToken = config.apiToken;
    this.timeout = config.timeout;
  }

  /**
   * Make API request to Baselinker
   * @param {string} method - API method name
   * @param {object} parameters - Request parameters
   * @returns {Promise<object>} - API response
   */
  async makeRequest(method, parameters = {}) {
    try {
      logger.info(`Baselinker API Request: ${method}`, { parameters });

      const response = await axios.post(
        this.apiUrl,
        new URLSearchParams({
          token: this.apiToken,
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
   * @param {object} filters - Order filters
   * @returns {Promise<Array>} - List of orders
   */
  async getOrders(filters = {}) {
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

    const response = await this.makeRequest('getOrders', parameters);
    return response.orders || [];
  }

  /**
   * Get products from inventory
   * @param {number} inventoryId - Inventory ID
   * @param {object} filters - Product filters
   * @returns {Promise<Array>} - List of products
   */
  async getInventoryProductsList(inventoryId = config.inventories.main, filters = {}) {
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

    const response = await this.makeRequest('getInventoryProductsList', parameters);
    return response.products || [];
  }

  /**
   * Get detailed product data
   * @param {Array<number>} productIds - Array of product IDs
   * @param {number} inventoryId - Inventory ID
   * @returns {Promise<object>} - Product details
   */
  async getInventoryProductsData(productIds, inventoryId = config.inventories.main) {
    const parameters = {
      inventory_id: inventoryId,
      products: productIds
    };

    const response = await this.makeRequest('getInventoryProductsData', parameters);
    return response.products || {};
  }

  /**
   * Get inventory products stock
   * @param {number} inventoryId - Inventory ID
   * @param {number} page - Page number
   * @returns {Promise<object>} - Products stock data
   */
  async getInventoryProductsStock(inventoryId = config.inventories.main, page = 1) {
    const parameters = {
      inventory_id: inventoryId,
      page: page
    };

    const response = await this.makeRequest('getInventoryProductsStock', parameters);
    return response.products || {};
  }

  /**
   * Get order details
   * @param {number} orderId - Order ID
   * @returns {Promise<object>} - Order details
   */
  async getOrderDetails(orderId) {
    const parameters = {
      order_id: orderId
    };

    const response = await this.makeRequest('getOrderDetails', parameters);
    return response.order || null;
  }

  /**
   * Get available order statuses
   * @returns {Promise<Array>} - List of order statuses
   */
  async getOrderStatusList() {
    const response = await this.makeRequest('getOrderStatusList', {});
    return response.statuses || [];
  }

  /**
   * Get inventories list
   * @returns {Promise<Array>} - List of inventories
   */
  async getInventories() {
    const response = await this.makeRequest('getInventories', {});
    return response.inventories || [];
  }
}

module.exports = new BaselinkerService();
