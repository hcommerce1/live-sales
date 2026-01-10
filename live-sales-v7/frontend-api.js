// Frontend API Client for Live Sales Backend

const API_BASE_URL = window.location.origin;

const API = {
  /**
   * Make API request
   * @param {string} endpoint - API endpoint
   * @param {object} options - Fetch options
   * @returns {Promise<object>} - Response data
   */
  async request(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(url, config);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP error! status: ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error('API Request failed:', error);
      throw error;
    }
  },

  /**
   * Export Management
   */
  exports: {
    // Get all exports
    async getAll() {
      const response = await API.request('/api/exports');
      return response.data || [];
    },

    // Get single export
    async get(id) {
      const response = await API.request(`/api/exports/${id}`);
      return response.data;
    },

    // Save export configuration
    async save(config) {
      const response = await API.request('/api/exports', {
        method: 'POST',
        body: JSON.stringify(config),
      });
      return response.data;
    },

    // Delete export
    async delete(id) {
      const response = await API.request(`/api/exports/${id}`, {
        method: 'DELETE',
      });
      return response;
    },

    // Run export immediately
    async run(id) {
      const response = await API.request(`/api/exports/${id}/run`, {
        method: 'POST',
      });
      return response.result;
    },

    // Toggle export status
    async toggle(id) {
      const response = await API.request(`/api/exports/${id}/toggle`, {
        method: 'POST',
      });
      return response.data;
    },

    // Get export stats
    async getStats(id) {
      const response = await API.request(`/api/exports/${id}/stats`);
      return response.data;
    },
  },

  /**
   * Baselinker API
   */
  baselinker: {
    // Get orders
    async getOrders(filters = {}) {
      const params = new URLSearchParams(filters);
      const response = await API.request(`/api/baselinker/orders?${params}`);
      return response.data || [];
    },

    // Get products
    async getProducts(filters = {}) {
      const params = new URLSearchParams(filters);
      const response = await API.request(`/api/baselinker/products?${params}`);
      return response.data || [];
    },

    // Get order statuses
    async getOrderStatuses() {
      const response = await API.request('/api/baselinker/order-statuses');
      return response.data || [];
    },

    // Get inventories
    async getInventories() {
      const response = await API.request('/api/baselinker/inventories');
      return response.data || [];
    },
  },

  /**
   * Google Sheets API
   */
  sheets: {
    // Validate sheet URL
    async validate(sheetUrl) {
      const response = await API.request('/api/sheets/validate', {
        method: 'POST',
        body: JSON.stringify({ sheetUrl }),
      });
      return response;
    },

    // Write data to sheets
    async write(sheetUrl, headers, data, writeMode = 'append') {
      const response = await API.request('/api/sheets/write', {
        method: 'POST',
        body: JSON.stringify({ sheetUrl, headers, data, writeMode }),
      });
      return response.result;
    },

    // Read data from sheets
    async read(sheetUrl, range = 'A:Z') {
      const params = new URLSearchParams({ sheetUrl, range });
      const response = await API.request(`/api/sheets/read?${params}`);
      return response.data || [];
    },
  },

  /**
   * Health check
   */
  async health() {
    const response = await API.request('/health');
    return response;
  },
};

// Export for use in app
window.LiveSalesAPI = API;
