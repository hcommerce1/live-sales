// Frontend API Client for Live Sales Backend
// SECURITY HARDENED: accessToken in memory only, refreshToken in HttpOnly cookie
// CSRF: Double-submit cookie pattern for cookie-based auth endpoints

const API_BASE_URL = window.location.origin;

// In-memory token storage (XSS protection - never persisted)
let _accessToken = null;

/**
 * Get CSRF token from cookie
 * Used for double-submit cookie CSRF protection
 */
function getCsrfToken() {
  const match = document.cookie.match(/csrf_token=([^;]+)/);
  return match ? match[1] : null;
}

export const API = {
  /**
   * Get access token from memory (NOT localStorage)
   * XSS protection: scripts cannot steal what's not in storage
   */
  getAccessToken() {
    return _accessToken;
  },

  /**
   * Set access token in memory (NOT localStorage)
   * refreshToken is in HttpOnly cookie - we don't touch it in JS!
   */
  setAccessToken(accessToken) {
    _accessToken = accessToken;
  },

  /**
   * Clear auth state (access token from memory)
   * refreshToken cookie is cleared by backend on logout
   */
  clearAuth() {
    _accessToken = null;
    localStorage.removeItem('user');
    localStorage.removeItem('activeCompanyId');
  },

  /**
   * Clear all auth state (called on logout)
   */
  clearAuthState() {
    _accessToken = null;
  },

  /**
   * Get active company ID
   */
  getActiveCompanyId() {
    return localStorage.getItem('activeCompanyId');
  },

  /**
   * Set active company ID
   */
  setActiveCompanyId(companyId) {
    if (companyId) {
      localStorage.setItem('activeCompanyId', companyId);
    } else {
      localStorage.removeItem('activeCompanyId');
    }
  },

  /**
   * Refresh access token
   * Uses HttpOnly cookie (sent automatically by browser)
   */
  async refreshAccessToken() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Include HttpOnly cookies
      });

      if (!response.ok) {
        throw new Error('Token refresh failed');
      }

      const data = await response.json();
      // Only accessToken comes in response - refreshToken is in HttpOnly cookie
      this.setAccessToken(data.accessToken);
      return data.accessToken;
    } catch (error) {
      this.clearAuth();
      // Use router navigation instead of direct URL change (will be handled by Vue)
      throw error;
    }
  },

  /**
   * Make API request with automatic token refresh
   * @param {string} endpoint - API endpoint
   * @param {object} options - Fetch options
   * @returns {Promise<object>} - Response data
   */
  async request(endpoint, options = {}) {
    console.log('[API.request]', options.method || 'GET', endpoint);
    const url = `${API_BASE_URL}${endpoint}`;

    // Add authorization header if token exists (from memory)
    const token = this.getAccessToken();
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token && !endpoint.startsWith('/api/auth/')) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Add X-Company-Id header for multi-company support
    const companyId = this.getActiveCompanyId();
    if (companyId && !endpoint.startsWith('/api/auth/') && !endpoint.startsWith('/api/company/register') && !endpoint.startsWith('/api/company/lookup')) {
      headers['X-Company-Id'] = companyId;
    }

    const config = {
      headers,
      credentials: 'include', // Always include cookies for HttpOnly refresh token
      ...options,
    };

    try {
      const response = await fetch(url, config);
      const data = await response.json();

      // If 401, try to refresh using HttpOnly cookie
      if (response.status === 401) {
        try {
          // Refresh token (uses HttpOnly cookie automatically)
          const newToken = await this.refreshAccessToken();

          // Retry original request with new token
          config.headers['Authorization'] = `Bearer ${newToken}`;
          const retryResponse = await fetch(url, config);
          const retryData = await retryResponse.json();

          if (!retryResponse.ok) {
            throw new Error(retryData.error || `HTTP error! status: ${retryResponse.status}`);
          }

          return retryData;
        } catch (refreshError) {
          // Refresh failed - clear auth state
          this.clearAuth();
          // Dispatch event for Vue to handle redirect
          window.dispatchEvent(new CustomEvent('auth:logout'));
          throw refreshError;
        }
      }

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
   * Authentication
   * SECURITY: accessToken in memory, refreshToken in HttpOnly cookie
   */
  auth: {
    // Login
    async login(email, password) {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Important: receive HttpOnly cookie
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      // Only accessToken in response - refreshToken is in HttpOnly cookie
      API.setAccessToken(data.accessToken);
      localStorage.setItem('user', JSON.stringify(data.user));

      return data;
    },

    // Register
    async register(email, password) {
      const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Important: receive HttpOnly cookie
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Registration failed');
      }

      // Only accessToken in response - refreshToken is in HttpOnly cookie
      API.setAccessToken(data.accessToken);
      localStorage.setItem('user', JSON.stringify(data.user));

      return data;
    },

    // Logout (clears HttpOnly cookie on backend)
    // CSRF: Must send X-CSRF-Token header
    async logout() {
      try {
        const csrfToken = getCsrfToken();
        const headers = { 'Content-Type': 'application/json' };

        if (csrfToken) {
          headers['X-CSRF-Token'] = csrfToken;
        }

        await fetch(`${API_BASE_URL}/api/auth/logout`, {
          method: 'POST',
          headers,
          credentials: 'include', // Important: send HttpOnly cookie to be cleared
        });
      } catch (error) {
        console.error('Logout error:', error);
      } finally {
        API.clearAuth();
      }
    },

    // Refresh token (uses HttpOnly cookie)
    // CSRF: Must send X-CSRF-Token header
    async refresh() {
      const csrfToken = getCsrfToken();
      const headers = { 'Content-Type': 'application/json' };

      if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken;
      }

      const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        headers,
        credentials: 'include', // Important: send HttpOnly cookie
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Token refresh failed');
      }

      // New accessToken in response - new refreshToken set as HttpOnly cookie
      API.setAccessToken(data.accessToken);

      return data;
    },

    // Get current user data
    // REQUIRES valid accessToken - use refresh() first if token expired
    // SECURITY: This endpoint NEVER returns tokens - only user data
    async getMe() {
      const token = API.getAccessToken();

      // REQUIRE accessToken - don't try to work without it
      if (!token) {
        throw new Error('Access token required - call refresh() first');
      }

      const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        credentials: 'include',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get user');
      }

      // Store user metadata (non-sensitive)
      if (data.user) {
        localStorage.setItem('user', JSON.stringify(data.user));
      }

      // NOTE: No accessToken in response - that comes from /refresh only
      return data;
    },

    // Get current user (alias for backward compatibility)
    async getCurrentUser() {
      const data = await this.getMe();
      return data.user;
    },

    // Verify 2FA code during login
    async verify2FA(code, tempToken) {
      const response = await fetch(`${API_BASE_URL}/api/auth/2fa/verify-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ code, tempToken }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '2FA verification failed');
      }

      // After successful 2FA, we get real tokens
      API.setAccessToken(data.accessToken);
      localStorage.setItem('user', JSON.stringify(data.user));

      return data;
    },

    // Check if user is logged in (has access token in memory)
    isLoggedIn() {
      return !!API.getAccessToken();
    },

    // Get stored user data (non-sensitive metadata from localStorage)
    getUser() {
      const userStr = localStorage.getItem('user');
      return userStr ? JSON.parse(userStr) : null;
    },
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
      console.log('[API.exports.run] Starting request for export ID:', id);
      const response = await API.request(`/api/exports/${id}/run`, {
        method: 'POST',
      });
      console.log('[API.exports.run] Response received:', response);
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

    // Get field definitions for export wizard (NEW)
    async getFieldDefinitions() {
      const response = await API.request('/api/exports/field-definitions');
      return response.data;
    },

    // Get export run history (NEW)
    async getRunHistory(id, limit = 10) {
      const response = await API.request(`/api/exports/${id}/runs?limit=${limit}`);
      return response.data || [];
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

    // Get order sources (NEW)
    async getOrderSources() {
      const response = await API.request('/api/baselinker/order-sources');
      return response.data || {};
    },

    // Get inventories
    async getInventories() {
      const response = await API.request('/api/baselinker/inventories');
      return response.data || [];
    },

    // Get invoices (NEW)
    async getInvoices(filters = {}) {
      const params = new URLSearchParams(filters);
      const response = await API.request(`/api/baselinker/invoices?${params}`);
      return response.data || [];
    },

    // Get invoice file (NEW)
    async getInvoiceFile(invoiceId) {
      const response = await API.request(`/api/baselinker/invoice/${invoiceId}/file`);
      return response.data;
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

  // ============================================
  // COMPANY MODULE
  // ============================================
  company: {
    /**
     * Lookup NIP (public - no auth required)
     * POST /api/company/lookup-nip
     */
    async lookupNip(nip) {
      return API.request('/api/company/lookup-nip', {
        method: 'POST',
        body: JSON.stringify({ nip }),
      });
    },

    /**
     * Register company with owner account (public)
     * POST /api/company/register
     */
    async register(data) {
      return API.request('/api/company/register', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    /**
     * Check if NIP exists (public)
     * GET /api/company/check-nip/:nip
     */
    async checkNip(nip) {
      return API.request(`/api/company/check-nip/${nip}`);
    },

    /**
     * Get all companies user belongs to
     * GET /api/company/my-companies
     */
    async getMyCompanies() {
      return API.request('/api/company/my-companies');
    },

    /**
     * Get company details
     * GET /api/company/:id
     */
    async get(companyId) {
      return API.request(`/api/company/${companyId}`);
    },

    /**
     * Update company
     * PATCH /api/company/:id
     */
    async update(companyId, data) {
      return API.request(`/api/company/${companyId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },

    /**
     * Delete company (soft delete)
     * DELETE /api/company/:id
     */
    async delete(companyId) {
      return API.request(`/api/company/${companyId}`, {
        method: 'DELETE',
      });
    },
  },

  // ============================================
  // TEAM MODULE
  // ============================================
  team: {
    /**
     * Get team members
     * GET /api/team
     */
    async getMembers() {
      return API.request('/api/team');
    },

    /**
     * Get pending invitations
     * GET /api/team/pending
     */
    async getPending() {
      return API.request('/api/team/pending');
    },

    /**
     * Invite member
     * POST /api/team/invite
     */
    async invite(email, role = 'member') {
      return API.request('/api/team/invite', {
        method: 'POST',
        body: JSON.stringify({ email, role }),
      });
    },

    /**
     * Accept invitation
     * POST /api/team/invitations/:token/accept
     */
    async acceptInvitation(token) {
      return API.request(`/api/team/invitations/${token}/accept`, {
        method: 'POST',
      });
    },

    /**
     * Cancel invitation
     * DELETE /api/team/invitations/:token
     */
    async cancelInvitation(token) {
      return API.request(`/api/team/invitations/${token}`, {
        method: 'DELETE',
      });
    },

    /**
     * Resend invitation
     * POST /api/team/invitations/:token/resend
     */
    async resendInvitation(token) {
      return API.request(`/api/team/invitations/${token}/resend`, {
        method: 'POST',
      });
    },

    /**
     * Remove member
     * DELETE /api/team/:memberId
     */
    async remove(memberId) {
      return API.request(`/api/team/${memberId}`, {
        method: 'DELETE',
      });
    },

    /**
     * Change member role
     * PATCH /api/team/:memberId/role
     * WARUNEK 2 (P0): Backend expects { newRole: 'admin'|'member' }
     */
    async changeRole(memberId, newRole) {
      return API.request(`/api/team/${memberId}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ newRole }),
      });
    },

    /**
     * Transfer ownership
     * POST /api/team/transfer-ownership
     */
    async transferOwnership(newOwnerId) {
      return API.request('/api/team/transfer-ownership', {
        method: 'POST',
        body: JSON.stringify({ newOwnerId }),
      });
    },

    /**
     * Leave company
     * POST /api/team/leave
     */
    async leave() {
      return API.request('/api/team/leave', {
        method: 'POST',
      });
    },

    /**
     * Get my role in current company
     * GET /api/team/my-role
     */
    async getMyRole() {
      return API.request('/api/team/my-role');
    },
  },

  // ============================================
  // BILLING MODULE
  // ============================================
  billing: {
    /**
     * Get available plans (public)
     * GET /api/billing/plans
     */
    async getPlans() {
      return API.request('/api/billing/plans');
    },

    /**
     * Get current subscription
     * GET /api/billing/subscription
     */
    async getSubscription() {
      return API.request('/api/billing/subscription');
    },

    /**
     * Get trial status
     * GET /api/billing/trial-status
     */
    async getTrialStatus() {
      return API.request('/api/billing/trial-status');
    },

    /**
     * Start trial (if eligible)
     * POST /api/billing/start-trial
     */
    async startTrial() {
      return API.request('/api/billing/start-trial', {
        method: 'POST',
      });
    },

    /**
     * Create Stripe checkout session
     * POST /api/billing/checkout
     */
    async checkout(planId, interval = 'monthly') {
      return API.request('/api/billing/checkout', {
        method: 'POST',
        body: JSON.stringify({ planId, interval }),
      });
    },

    /**
     * Get Stripe customer portal URL
     * POST /api/billing/portal
     */
    async getPortal() {
      return API.request('/api/billing/portal', {
        method: 'POST',
      });
    },

    /**
     * Cancel subscription at period end
     * POST /api/billing/cancel
     */
    async cancel() {
      return API.request('/api/billing/cancel', {
        method: 'POST',
      });
    },

    /**
     * Reactivate canceled subscription
     * POST /api/billing/reactivate
     */
    async reactivate() {
      return API.request('/api/billing/reactivate', {
        method: 'POST',
      });
    },
  },

  // ============================================
  // FEATURES MODULE
  // ============================================
  features: {
    /**
     * Get capabilities (limits, permissions) for current company
     * GET /api/features/capabilities
     */
    async getCapabilities() {
      return API.request('/api/features/capabilities');
    },

    /**
     * Get plans with features
     * GET /api/features/plans
     */
    async getPlans() {
      return API.request('/api/features/plans');
    },

    /**
     * Get usage summary
     * GET /api/features/usage
     */
    async getUsage() {
      return API.request('/api/features/usage');
    },

    /**
     * Check specific feature access
     * GET /api/features/check/:featureId
     */
    async check(featureId) {
      return API.request(`/api/features/check/${featureId}`);
    },

    /**
     * Get feature definitions
     * GET /api/features/definitions
     */
    async getDefinitions() {
      return API.request('/api/features/definitions');
    },

    /**
     * Validate selected fields for plan
     * POST /api/features/validate-fields
     */
    async validateFields(selectedFields, fieldDefinitions) {
      return API.request('/api/features/validate-fields', {
        method: 'POST',
        body: JSON.stringify({ selectedFields, fieldDefinitions }),
      });
    },
  },
};

// Make API available globally for compatibility
window.LiveSalesAPI = API;
