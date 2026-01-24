// src/stores/subscription.js
// Pinia Subscription Store - Billing and subscription management

import { defineStore } from 'pinia'

export const useSubscriptionStore = defineStore('subscription', {
  state: () => ({
    // Current subscription
    subscription: null,

    // Available plans
    plans: [],

    // Capabilities (limits, permissions)
    capabilities: null,

    // Trial status
    trialStatus: null,

    // Loading states
    loading: false,
    error: null
  }),

  getters: {
    // Current plan ID
    currentPlanId: (state) => state.subscription?.planId || 'free',

    // Check if on trial
    isOnTrial: (state) => state.subscription?.status === 'trialing',

    // Check if subscription is active
    isActive: (state) => ['active', 'trialing'].includes(state.subscription?.status),

    // Days remaining in trial
    trialDaysRemaining: (state) => {
      if (!state.subscription?.trialEnd) return 0
      const now = new Date()
      const end = new Date(state.subscription.trialEnd)
      const diff = Math.ceil((end - now) / (1000 * 60 * 60 * 24))
      return Math.max(0, diff)
    },

    // Get plan by ID
    getPlanById: (state) => (planId) => state.plans.find(p => p.id === planId),

    // Get current plan
    currentPlan: (state) => {
      const planId = state.subscription?.planId || 'free'
      return state.plans.find(p => p.id === planId)
    },

    // Can start trial
    canStartTrial: (state) => state.trialStatus?.eligible === true,

    // Export limit
    exportLimit: (state) => state.capabilities?.exports?.max_count || 1,

    // Team member limit
    teamMemberLimit: (state) => state.capabilities?.team?.max_members || 1
  },

  actions: {
    /**
     * Load subscription for current company
     */
    async loadSubscription() {
      this.loading = true
      this.error = null

      try {
        const { API } = await import('../api.js')
        const response = await API.billing.getSubscription()

        this.subscription = response.subscription
        return this.subscription
      } catch (error) {
        console.error('[SubscriptionStore] loadSubscription failed:', error)
        this.error = error.message
        throw error
      } finally {
        this.loading = false
      }
    },

    /**
     * Load available plans
     */
    async loadPlans() {
      try {
        const { API } = await import('../api.js')
        const response = await API.billing.getPlans()

        this.plans = response.plans || []
        return this.plans
      } catch (error) {
        console.error('[SubscriptionStore] loadPlans failed:', error)
        throw error
      }
    },

    /**
     * Load capabilities for current company
     */
    async loadCapabilities() {
      try {
        const { API } = await import('../api.js')
        const response = await API.features.getCapabilities()

        this.capabilities = response.capabilities
        return this.capabilities
      } catch (error) {
        console.error('[SubscriptionStore] loadCapabilities failed:', error)
        throw error
      }
    },

    /**
     * Load trial status
     */
    async loadTrialStatus() {
      try {
        const { API } = await import('../api.js')
        const response = await API.billing.getTrialStatus()

        this.trialStatus = response
        return this.trialStatus
      } catch (error) {
        console.error('[SubscriptionStore] loadTrialStatus failed:', error)
        throw error
      }
    },

    /**
     * Start trial
     */
    async startTrial() {
      try {
        const { API } = await import('../api.js')
        const response = await API.billing.startTrial()

        // Reload subscription after starting trial
        await this.loadSubscription()

        return response
      } catch (error) {
        console.error('[SubscriptionStore] startTrial failed:', error)
        throw error
      }
    },

    /**
     * Create checkout session
     */
    async checkout(planId, interval = 'monthly') {
      try {
        const { API } = await import('../api.js')
        const response = await API.billing.checkout(planId, interval)

        // Redirect to Stripe checkout
        if (response.url) {
          window.location.href = response.url
        }

        return response
      } catch (error) {
        console.error('[SubscriptionStore] checkout failed:', error)
        throw error
      }
    },

    /**
     * Open customer portal
     */
    async openPortal() {
      try {
        const { API } = await import('../api.js')
        const response = await API.billing.getPortal()

        // Redirect to Stripe portal
        if (response.url) {
          window.location.href = response.url
        }

        return response
      } catch (error) {
        console.error('[SubscriptionStore] openPortal failed:', error)
        throw error
      }
    },

    /**
     * Cancel subscription
     */
    async cancelSubscription() {
      try {
        const { API } = await import('../api.js')
        const response = await API.billing.cancel()

        // Reload subscription
        await this.loadSubscription()

        return response
      } catch (error) {
        console.error('[SubscriptionStore] cancelSubscription failed:', error)
        throw error
      }
    },

    /**
     * Reactivate subscription
     */
    async reactivateSubscription() {
      try {
        const { API } = await import('../api.js')
        const response = await API.billing.reactivate()

        // Reload subscription
        await this.loadSubscription()

        return response
      } catch (error) {
        console.error('[SubscriptionStore] reactivateSubscription failed:', error)
        throw error
      }
    },

    /**
     * Load all billing data
     */
    async loadAll() {
      await Promise.all([
        this.loadSubscription(),
        this.loadPlans(),
        this.loadCapabilities(),
        this.loadTrialStatus()
      ])
    },

    /**
     * Reset store state (on logout)
     */
    $reset() {
      this.subscription = null
      this.plans = []
      this.capabilities = null
      this.trialStatus = null
      this.loading = false
      this.error = null
    }
  }
})
