// src/stores/auth.js
// Pinia Auth Store - HARDENED SECURITY
// accessToken: IN MEMORY ONLY (XSS protection)
// refreshToken: HttpOnly cookie (managed by backend)
//
// BOOT FLOW:
// 1. Call POST /api/auth/refresh (uses HttpOnly cookie) → get accessToken
// 2. Call GET /api/auth/me with accessToken → get user data
//
// CRITICAL: /api/auth/me NEVER returns tokens - only user data

import { defineStore } from 'pinia'

// Auth states
export const AuthState = {
  CHECKING: 'CHECKING',
  AUTHENTICATED: 'AUTHENTICATED',
  UNAUTHENTICATED: 'UNAUTHENTICATED'
}

// Single-flight promise for checkAuth to prevent race conditions
let checkAuthPromise = null

export const useAuthStore = defineStore('auth', {
  state: () => ({
    // Auth state machine
    state: AuthState.CHECKING,

    // User data (non-sensitive metadata)
    user: null,

    // Access token - IN MEMORY ONLY, never persisted!
    // This is the key XSS protection - scripts cannot steal what's not in storage
    accessToken: null,

    // 2FA state for login flow
    requires2FA: false,
    tempToken: null
  }),

  getters: {
    isAuthenticated: (state) => state.state === AuthState.AUTHENTICATED,
    isChecking: (state) => state.state === AuthState.CHECKING,
    isUnauthenticated: (state) => state.state === AuthState.UNAUTHENTICATED,

    // Get user email safely
    userEmail: (state) => state.user?.email || null,

    // Get user role
    userRole: (state) => state.user?.role || 'user',

    // Check if user is admin
    isAdmin: (state) => state.user?.role === 'admin'
  },

  actions: {
    /**
     * Set access token (memory only)
     * refreshToken is in HttpOnly cookie - we don't touch it in JS!
     */
    setAccessToken(accessToken) {
      this.accessToken = accessToken
    },

    /**
     * Set user data
     */
    setUser(user) {
      this.user = user
      // Store non-sensitive user metadata in localStorage for UI convenience only
      if (user) {
        localStorage.setItem('user', JSON.stringify({
          id: user.id,
          email: user.email,
          role: user.role,
          createdAt: user.createdAt
        }))
      }
    },

    /**
     * Set auth state
     */
    setState(newState) {
      this.state = newState
    },

    /**
     * Set 2FA state (for login flow)
     */
    set2FAState(requires2FA, tempToken = null) {
      this.requires2FA = requires2FA
      this.tempToken = tempToken
    },

    /**
     * Clear user and tokens
     * Called on logout or auth failure
     */
    clearUser() {
      this.accessToken = null
      this.user = null
      this.state = AuthState.UNAUTHENTICATED
      this.requires2FA = false
      this.tempToken = null

      // Clear localStorage - ONLY non-sensitive data
      localStorage.removeItem('user')
      localStorage.removeItem('activeCompanyId')
    },

    /**
     * Check authentication status
     * FLOW: refresh (cookie) → get accessToken → me (with accessToken) → get user
     *
     * SINGLE-FLIGHT: If checkAuth is already in progress, return the same promise
     * This prevents race conditions when multiple components/guards call checkAuth
     */
    async checkAuth() {
      // Single-flight pattern: return existing promise if check is in progress
      if (checkAuthPromise) {
        console.log('[AuthStore] checkAuth already in progress, waiting...')
        return checkAuthPromise
      }

      this.state = AuthState.CHECKING

      // Create the promise and store it
      checkAuthPromise = this._doCheckAuth()

      try {
        return await checkAuthPromise
      } finally {
        // Clear the promise when done (success or failure)
        checkAuthPromise = null
      }
    },

    /**
     * Internal: actual checkAuth implementation
     * Separated to enable single-flight pattern
     */
    async _doCheckAuth() {
      try {
        const { API } = await import('../api.js')

        // STEP 1: Try to refresh token using HttpOnly cookie
        // This is the ONLY way to get accessToken after page refresh
        let accessToken = null
        try {
          const refreshResponse = await API.auth.refresh()
          accessToken = refreshResponse.accessToken

          if (!accessToken) {
            throw new Error('No accessToken in refresh response')
          }

          // Store accessToken in memory
          this.accessToken = accessToken
          API.setAccessToken(accessToken)
        } catch (refreshError) {
          // Refresh failed - user is not authenticated
          console.log('[AuthStore] Refresh failed, user not authenticated')
          this.clearUser()
          return false
        }

        // STEP 2: Get user data with accessToken
        try {
          const meResponse = await API.auth.getMe()

          if (meResponse.user) {
            this.setUser(meResponse.user)
            this.state = AuthState.AUTHENTICATED
            console.log('[AuthStore] Auth check successful')
            return true
          } else {
            throw new Error('No user in /me response')
          }
        } catch (meError) {
          console.error('[AuthStore] Failed to get user:', meError)
          this.clearUser()
          return false
        }
      } catch (error) {
        console.error('[AuthStore] checkAuth failed:', error)
        this.clearUser()
        return false
      }
    },

    /**
     * Login with email and password
     * Returns { success, requires2FA, error }
     */
    async login(email, password) {
      try {
        const { API } = await import('../api.js')
        const response = await API.auth.login(email, password)

        // Check if 2FA is required
        if (response.requires2FA) {
          this.set2FAState(true, response.tempToken)
          return { success: false, requires2FA: true }
        }

        // Login successful - accessToken is returned in response
        this.accessToken = response.accessToken
        API.setAccessToken(response.accessToken)
        this.setUser(response.user)
        this.state = AuthState.AUTHENTICATED

        return { success: true }
      } catch (error) {
        console.error('[AuthStore] login failed:', error)
        return { success: false, error: error.message }
      }
    },

    /**
     * Verify 2FA code during login
     */
    async verify2FA(code) {
      if (!this.tempToken) {
        return { success: false, error: 'No pending 2FA verification' }
      }

      try {
        const { API } = await import('../api.js')
        const response = await API.auth.verify2FA(code, this.tempToken)

        // 2FA successful - now we get the real tokens
        this.accessToken = response.accessToken
        API.setAccessToken(response.accessToken)
        this.setUser(response.user)
        this.state = AuthState.AUTHENTICATED
        this.set2FAState(false, null)

        return { success: true }
      } catch (error) {
        console.error('[AuthStore] 2FA verification failed:', error)
        return { success: false, error: error.message }
      }
    },

    /**
     * Register new user
     */
    async register(email, password) {
      try {
        const { API } = await import('../api.js')
        const response = await API.auth.register(email, password)

        this.accessToken = response.accessToken
        API.setAccessToken(response.accessToken)
        this.setUser(response.user)
        this.state = AuthState.AUTHENTICATED

        return { success: true }
      } catch (error) {
        console.error('[AuthStore] register failed:', error)
        return { success: false, error: error.message }
      }
    },

    /**
     * Logout - clears all state
     * CRITICAL: Set state to CHECKING immediately to hide content
     */
    async logout() {
      // Immediately hide content by setting state to CHECKING
      this.state = AuthState.CHECKING

      try {
        const { API } = await import('../api.js')
        // Backend will revoke refresh token and clear HttpOnly cookie
        await API.auth.logout()
      } catch (error) {
        // Ignore logout errors - we're logging out anyway
        console.error('[AuthStore] logout error (ignored):', error)
      }

      // Clear all auth state
      this.clearUser()

      // Clear API token
      try {
        const { API } = await import('../api.js')
        API.clearAuthState()
      } catch (e) { /* ignore */ }
    },

    /**
     * Refresh access token
     * Called by API client when accessToken expires
     */
    async refreshToken() {
      try {
        const { API } = await import('../api.js')
        const response = await API.auth.refresh()

        if (response.accessToken) {
          this.accessToken = response.accessToken
          API.setAccessToken(response.accessToken)
          return response.accessToken
        }

        throw new Error('No access token in refresh response')
      } catch (error) {
        console.error('[AuthStore] refreshToken failed:', error)
        this.clearUser()
        throw error
      }
    },

    /**
     * Get access token for API requests
     * Returns null if not authenticated
     */
    getAccessToken() {
      return this.accessToken
    }
  }
})
