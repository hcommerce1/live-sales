const baselinkerService = require('./baselinkerService');
const googleSheetsService = require('./googleSheetsService');
const logger = require('../utils/logger');
const { PrismaClient } = require('@prisma/client');
const crypto = require('../utils/crypto');

const prisma = new PrismaClient();

// In-memory storage for export configurations
// In production, this should be replaced with a database
let exportConfigs = {};

class ExportService {
  /**
   * Get all export configurations
   * @returns {Array} - List of exports
   */
  getAllExports() {
    return Object.values(exportConfigs);
  }

  /**
   * Get export configuration by ID
   * @param {string} exportId - Export ID
   * @returns {object|null} - Export configuration
   */
  getExport(exportId) {
    return exportConfigs[exportId] || null;
  }

  /**
   * Save export configuration
   * @param {string} exportId - Export ID
   * @param {object} config - Export configuration
   * @param {string} userId - User ID (owner of the export)
   * @returns {object} - Saved export configuration
   */
  saveExport(exportId, config, userId = null) {
    exportConfigs[exportId] = {
      ...config,
      id: exportId,
      userId: userId || config.userId, // Store userId with export
      updatedAt: new Date().toISOString(),
    };
    logger.info(`Export configuration saved`, { exportId, userId });
    return exportConfigs[exportId];
  }

  /**
   * Delete export configuration
   * @param {string} exportId - Export ID
   * @returns {boolean} - True if deleted
   */
  deleteExport(exportId) {
    if (exportConfigs[exportId]) {
      delete exportConfigs[exportId];
      logger.info(`Export configuration deleted`, { exportId });
      return true;
    }
    return false;
  }

  /**
   * Run export - fetch data from Baselinker and write to Google Sheets
   * @param {string} exportId - Export ID
   * @param {string} userId - User ID (to fetch BaseLinker token) - optional if stored in config
   * @returns {Promise<object>} - Export result
   */
  async runExport(exportId, userId = null) {
    const config = this.getExport(exportId);
    if (!config) {
      throw new Error(`Export configuration not found: ${exportId}`);
    }

    // Use userId from parameter or from config (for scheduled exports)
    const effectiveUserId = userId || config.userId;
    if (!effectiveUserId) {
      throw new Error('User ID not available for this export');
    }

    logger.info(`Running export`, { exportId, userId: effectiveUserId, dataset: config.dataset });

    try {
      // Fetch user's BaseLinker token from database
      const user = await prisma.user.findUnique({
        where: { id: effectiveUserId },
        select: { baselinkerToken: true }
      });

      if (!user || !user.baselinkerToken) {
        throw new Error('BaseLinker token not configured. Please add your token in the Configuration page.');
      }

      // Decrypt the token
      const userToken = crypto.decrypt(user.baselinkerToken);

      // Fetch data from Baselinker
      let rawData = [];
      if (config.dataset === 'orders') {
        rawData = await this.fetchOrders(userToken, config.filters || {});
      } else if (config.dataset === 'products') {
        rawData = await this.fetchProducts(userToken, config.filters || {});
      } else {
        throw new Error(`Unknown dataset type: ${config.dataset}`);
      }

      logger.info(`Fetched ${rawData.length} records from Baselinker`, { exportId });

      // Transform data according to selected fields
      const { headers, data } = this.transformData(rawData, config.selected_fields || []);

      if (data.length === 0) {
        logger.warn(`No data to export`, { exportId });
        return {
          success: true,
          recordCount: 0,
          message: 'No data matched the filters'
        };
      }

      // Write to Google Sheets
      const writeResult = await googleSheetsService.writeData(
        config.sheets.sheet_url,
        headers,
        data,
        config.sheets.write_mode || 'append'
      );

      // Update last run timestamp
      exportConfigs[exportId].last_run = new Date().toISOString();
      exportConfigs[exportId].status = 'active';

      logger.info(`Export completed successfully`, {
        exportId,
        recordCount: data.length
      });

      return {
        success: true,
        recordCount: data.length,
        writeResult
      };
    } catch (error) {
      logger.error(`Export failed`, {
        exportId,
        error: error.message
      });

      // Update export status
      if (exportConfigs[exportId]) {
        exportConfigs[exportId].status = 'error';
        exportConfigs[exportId].lastError = error.message;
      }

      throw error;
    }
  }

  /**
   * Fetch orders from Baselinker
   * @param {string} userToken - User's BaseLinker API token
   * @param {object} filters - Order filters
   * @returns {Promise<Array>} - List of orders
   */
  async fetchOrders(userToken, filters) {
    try {
      const orders = await baselinkerService.getOrders(userToken, filters);

      // Transform orders to flat structure
      const flatOrders = orders.map(order => ({
        order_id: order.order_id,
        date_add: order.date_add,
        order_status_id: order.order_status_id,
        total_price: order.price,
        currency: order.currency,
        payment_method: order.payment_method,
        delivery_method: order.delivery_method,
        email: order.email,
        phone: order.phone,
        delivery_fullname: order.delivery_fullname,
        delivery_company: order.delivery_company,
        delivery_address: order.delivery_address,
        delivery_city: order.delivery_city,
        delivery_postcode: order.delivery_postcode,
        delivery_country: order.delivery_country,
        invoice_fullname: order.invoice_fullname,
        invoice_nip: order.invoice_nip,
        invoice_address: order.invoice_address,
        invoice_city: order.invoice_city,
        invoice_postcode: order.invoice_postcode,
        user_comments: order.user_comments,
        admin_comments: order.admin_comments,
      }));

      return flatOrders;
    } catch (error) {
      logger.error('Failed to fetch orders', { error: error.message });
      throw error;
    }
  }

  /**
   * Fetch products from Baselinker
   * @param {string} userToken - User's BaseLinker API token
   * @param {object} filters - Product filters
   * @returns {Promise<Array>} - List of products
   */
  async fetchProducts(userToken, filters) {
    try {
      const products = await baselinkerService.getInventoryProductsList(
        userToken,
        filters.inventory_id || 35072,
        filters
      );

      // Get detailed product data if needed
      if (products.length > 0) {
        const productIds = products.map(p => p.product_id);
        const detailedData = await baselinkerService.getInventoryProductsData(userToken, productIds);

        // Merge list and detailed data
        return products.map(product => {
          const details = detailedData[product.product_id] || {};
          return {
            product_id: product.product_id,
            name: details.name || product.name,
            ean: details.ean || product.ean,
            sku: details.sku || product.sku,
            quantity: product.quantity || 0,
            price_brutto: details.prices ? details.prices[0]?.price_brutto : null,
            stock: product.stock || 0,
            location: details.location || '',
            weight: details.weight || 0,
            manufacturer: details.manufacturer || '',
            category: details.category || '',
            description: details.description || '',
            tax_rate: details.tax_rate || 23,
            purchase_price: details.purchase_price || 0,
            profit_margin: details.profit_margin || 0,
          };
        });
      }

      return [];
    } catch (error) {
      logger.error('Failed to fetch products', { error: error.message });
      throw error;
    }
  }

  /**
   * Transform raw data to match selected fields
   * @param {Array} rawData - Raw data from Baselinker
   * @param {Array<string>} selectedFields - Selected field keys
   * @returns {object} - { headers, data }
   */
  transformData(rawData, selectedFields) {
    if (selectedFields.length === 0) {
      return { headers: [], data: [] };
    }

    // Get field labels from data.js
    const fieldLabels = this.getFieldLabels();

    // Create headers
    const headers = selectedFields.map(fieldKey => {
      return fieldLabels[fieldKey] || fieldKey;
    });

    // Create data rows
    const data = rawData.map(record => {
      return selectedFields.map(fieldKey => {
        const value = record[fieldKey];
        return value !== undefined && value !== null ? String(value) : '';
      });
    });

    return { headers, data };
  }

  /**
   * Get field labels mapping
   * @returns {object} - Field key to label mapping
   */
  getFieldLabels() {
    // This should match the fields from data.js
    return {
      // Orders
      'order_id': 'ID zamówienia',
      'date_add': 'Data dodania',
      'order_status_id': 'Status',
      'total_price': 'Suma brutto',
      'currency': 'Waluta',
      'payment_method': 'Metoda płatności',
      'delivery_method': 'Metoda dostawy',
      'email': 'Email',
      'phone': 'Telefon',
      'delivery_fullname': 'Imię i nazwisko (dostawa)',
      'delivery_company': 'Firma (dostawa)',
      'delivery_address': 'Adres (dostawa)',
      'delivery_city': 'Miasto (dostawa)',
      'delivery_postcode': 'Kod pocztowy (dostawa)',
      'delivery_country': 'Kraj (dostawa)',
      'invoice_fullname': 'Dane do faktury - Nazwa',
      'invoice_nip': 'NIP',
      'invoice_address': 'Adres (faktura)',
      'invoice_city': 'Miasto (faktura)',
      'invoice_postcode': 'Kod pocztowy (faktura)',
      'user_comments': 'Komentarz klienta',
      'admin_comments': 'Komentarz wewnętrzny',

      // Products
      'product_id': 'ID produktu',
      'name': 'Nazwa produktu',
      'ean': 'EAN',
      'sku': 'SKU',
      'quantity': 'Ilość',
      'price_brutto': 'Cena brutto',
      'stock': 'Stan magazynowy',
      'location': 'Lokalizacja',
      'weight': 'Waga (kg)',
      'manufacturer': 'Producent',
      'category': 'Kategoria',
      'description': 'Opis',
      'tax_rate': 'Stawka VAT',
      'purchase_price': 'Cena zakupu',
      'profit_margin': 'Marża (%)',
    };
  }

  /**
   * Get export statistics
   * @param {string} exportId - Export ID
   * @returns {object} - Export statistics
   */
  getExportStats(exportId) {
    const config = exportConfigs[exportId];
    if (!config) {
      return null;
    }

    return {
      id: exportId,
      name: config.name,
      status: config.status || 'active',
      last_run: config.last_run,
      dataset: config.dataset,
      field_count: (config.selected_fields || []).length,
      schedule_minutes: config.schedule_minutes,
    };
  }
}

module.exports = new ExportService();
