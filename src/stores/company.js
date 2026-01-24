// src/stores/company.js
// Pinia Company Store - Multi-tenant state management

import { defineStore } from 'pinia'

export const useCompanyStore = defineStore('company', {
  state: () => ({
    // List of companies user belongs to
    companies: [],

    // Currently active company
    activeCompany: null,

    // User's role in active company
    memberRole: null,

    // Loading states
    loading: false,
    error: null
  }),

  getters: {
    // Get active company ID
    activeCompanyId: (state) => state.activeCompany?.id || localStorage.getItem('activeCompanyId'),

    // Check if user has companies
    hasCompanies: (state) => state.companies.length > 0,

    // Check if user is owner of active company
    isOwner: (state) => state.memberRole === 'owner',

    // Check if user is admin or owner
    isAdminOrOwner: (state) => ['owner', 'admin'].includes(state.memberRole),

    // Get company name
    companyName: (state) => state.activeCompany?.name || 'Brak firmy'
  },

  actions: {
    /**
     * Set active company ID (persisted to localStorage for UI convenience)
     */
    setActiveCompanyId(companyId) {
      if (companyId) {
        localStorage.setItem('activeCompanyId', companyId)
      } else {
        localStorage.removeItem('activeCompanyId')
      }
    },

    /**
     * Load all companies user belongs to
     */
    async loadCompanies() {
      this.loading = true
      this.error = null

      try {
        const { API } = await import('../api.js')
        const response = await API.company.getMyCompanies()

        this.companies = response.companies || []

        // Auto-select first company if none selected
        if (this.companies.length > 0 && !this.activeCompanyId) {
          await this.selectCompany(this.companies[0].id)
        } else if (this.activeCompanyId) {
          // Reload active company details
          await this.loadActiveCompany()
        }

        return this.companies
      } catch (error) {
        console.error('[CompanyStore] loadCompanies failed:', error)
        this.error = error.message
        throw error
      } finally {
        this.loading = false
      }
    },

    /**
     * Load active company details
     */
    async loadActiveCompany() {
      const companyId = this.activeCompanyId
      if (!companyId) return null

      try {
        const { API } = await import('../api.js')
        const response = await API.company.get(companyId)

        this.activeCompany = response.company
        this.memberRole = response.memberRole || null

        return this.activeCompany
      } catch (error) {
        console.error('[CompanyStore] loadActiveCompany failed:', error)
        // Clear active company if failed to load
        this.activeCompany = null
        this.memberRole = null
        this.setActiveCompanyId(null)
        throw error
      }
    },

    /**
     * Select a company (switch context)
     */
    async selectCompany(companyId) {
      this.setActiveCompanyId(companyId)

      // Update API client
      const { API } = await import('../api.js')
      API.setActiveCompanyId(companyId)

      // Load company details
      await this.loadActiveCompany()
    },

    /**
     * Update company info
     */
    async updateCompany(data) {
      if (!this.activeCompanyId) {
        throw new Error('No active company')
      }

      try {
        const { API } = await import('../api.js')
        const response = await API.company.update(this.activeCompanyId, data)

        this.activeCompany = response.company
        return this.activeCompany
      } catch (error) {
        console.error('[CompanyStore] updateCompany failed:', error)
        throw error
      }
    },

    /**
     * Reset store state (on logout)
     */
    $reset() {
      this.companies = []
      this.activeCompany = null
      this.memberRole = null
      this.loading = false
      this.error = null
      localStorage.removeItem('activeCompanyId')
    }
  }
})
