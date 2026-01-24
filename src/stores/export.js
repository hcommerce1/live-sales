// src/stores/export.js
// Pinia Export Store - Export configurations management

import { defineStore } from 'pinia'

export const useExportStore = defineStore('export', {
  state: () => ({
    // List of exports
    exports: [],

    // Field definitions for wizard
    fieldDefinitions: null,

    // Loading states
    loading: false,
    error: null
  }),

  getters: {
    // Active exports count
    activeExportsCount: (state) => state.exports.filter(e => e.isActive).length,

    // Get export by ID
    getExportById: (state) => (id) => state.exports.find(e => e.id === id),

    // Has exports
    hasExports: (state) => state.exports.length > 0
  },

  actions: {
    /**
     * Load all exports for current company
     */
    async loadExports() {
      this.loading = true
      this.error = null

      try {
        const { API } = await import('../api.js')
        this.exports = await API.exports.getAll()
        return this.exports
      } catch (error) {
        console.error('[ExportStore] loadExports failed:', error)
        this.error = error.message
        throw error
      } finally {
        this.loading = false
      }
    },

    /**
     * Load field definitions for wizard
     */
    async loadFieldDefinitions() {
      if (this.fieldDefinitions) return this.fieldDefinitions

      try {
        const { API } = await import('../api.js')
        this.fieldDefinitions = await API.exports.getFieldDefinitions()
        return this.fieldDefinitions
      } catch (error) {
        console.error('[ExportStore] loadFieldDefinitions failed:', error)
        throw error
      }
    },

    /**
     * Save export configuration
     */
    async saveExport(config) {
      try {
        const { API } = await import('../api.js')
        const saved = await API.exports.save(config)

        // Update local list
        const index = this.exports.findIndex(e => e.id === saved.id)
        if (index >= 0) {
          this.exports[index] = saved
        } else {
          this.exports.push(saved)
        }

        return saved
      } catch (error) {
        console.error('[ExportStore] saveExport failed:', error)
        throw error
      }
    },

    /**
     * Delete export
     */
    async deleteExport(id) {
      try {
        const { API } = await import('../api.js')
        await API.exports.delete(id)

        // Remove from local list
        this.exports = this.exports.filter(e => e.id !== id)
      } catch (error) {
        console.error('[ExportStore] deleteExport failed:', error)
        throw error
      }
    },

    /**
     * Run export manually
     */
    async runExport(id) {
      try {
        const { API } = await import('../api.js')
        return await API.exports.run(id)
      } catch (error) {
        console.error('[ExportStore] runExport failed:', error)
        throw error
      }
    },

    /**
     * Toggle export active state
     */
    async toggleExport(id) {
      try {
        const { API } = await import('../api.js')
        const updated = await API.exports.toggle(id)

        // Update local list
        const index = this.exports.findIndex(e => e.id === id)
        if (index >= 0) {
          this.exports[index] = updated
        }

        return updated
      } catch (error) {
        console.error('[ExportStore] toggleExport failed:', error)
        throw error
      }
    },

    /**
     * Reset store state (on logout)
     */
    $reset() {
      this.exports = []
      this.fieldDefinitions = null
      this.loading = false
      this.error = null
    }
  }
})
