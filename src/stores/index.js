// src/stores/index.js
// Pinia stores barrel export

export { useAuthStore, AuthState } from './auth.js'
export { useCompanyStore } from './company.js'
export { useExportStore } from './export.js'
export { useSubscriptionStore } from './subscription.js'
export { useTeamStore } from './team.js'

/**
 * Reset all stores (used on logout)
 */
export function resetAllStores() {
  const { useAuthStore, useCompanyStore, useExportStore, useSubscriptionStore, useTeamStore } = {
    useAuthStore: () => import('./auth.js').then(m => m.useAuthStore()),
    useCompanyStore: () => import('./company.js').then(m => m.useCompanyStore()),
    useExportStore: () => import('./export.js').then(m => m.useExportStore()),
    useSubscriptionStore: () => import('./subscription.js').then(m => m.useSubscriptionStore()),
    useTeamStore: () => import('./team.js').then(m => m.useTeamStore())
  }

  // This will be called by the auth store logout action
  // Each store's $reset() method handles its own cleanup
}
