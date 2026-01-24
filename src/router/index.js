// src/router/index.js
// Vue Router with navigation guards for authentication

import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore, AuthState } from '../stores/auth.js'

// Lazy-loaded views
const DashboardView = () => import('../views/DashboardView.vue')
const LoginView = () => import('../views/LoginView.vue')
const ExportsView = () => import('../views/ExportsView.vue')
const SettingsView = () => import('../views/SettingsView.vue')
const TokensView = () => import('../views/TokensView.vue')

// Route definitions
const routes = [
  {
    path: '/',
    name: 'dashboard',
    component: DashboardView,
    meta: { requiresAuth: true }
  },
  {
    path: '/login',
    name: 'login',
    component: LoginView,
    meta: { requiresAuth: false, guestOnly: true }
  },
  {
    path: '/exports',
    name: 'exports',
    component: ExportsView,
    meta: { requiresAuth: true }
  },
  {
    path: '/exports/new',
    name: 'export-new',
    component: ExportsView,
    meta: { requiresAuth: true },
    props: { showWizard: true }
  },
  {
    path: '/exports/:id',
    name: 'export-detail',
    component: ExportsView,
    meta: { requiresAuth: true },
    props: true
  },
  {
    path: '/settings',
    name: 'settings',
    component: SettingsView,
    meta: { requiresAuth: true }
  },
  {
    path: '/tokens',
    name: 'tokens',
    component: TokensView,
    meta: { requiresAuth: true }
  },
  // Catch-all redirect to dashboard
  {
    path: '/:pathMatch(.*)*',
    redirect: '/'
  }
]

// Create router instance
const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition
    } else {
      return { top: 0 }
    }
  }
})

// Navigation guard - CRITICAL for auth protection
router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore()

  // Wait for auth check to complete if still checking
  if (authStore.state === AuthState.CHECKING) {
    await authStore.checkAuth()
  }

  const isAuthenticated = authStore.state === AuthState.AUTHENTICATED
  const requiresAuth = to.meta.requiresAuth
  const guestOnly = to.meta.guestOnly

  // Redirect unauthenticated users to login
  if (requiresAuth && !isAuthenticated) {
    console.log('[Router] Redirecting to login - not authenticated')
    return next({
      path: '/login',
      query: { redirect: to.fullPath } // Save intended destination
    })
  }

  // Redirect authenticated users away from guest-only pages (like login)
  if (guestOnly && isAuthenticated) {
    console.log('[Router] Redirecting to dashboard - already authenticated')
    const redirect = to.query.redirect || '/'
    return next(redirect)
  }

  // Allow navigation
  next()
})

// After each navigation - could be used for analytics, etc.
router.afterEach((to, from) => {
  // Update document title based on route
  const titles = {
    'dashboard': 'Dashboard',
    'login': 'Logowanie',
    'exports': 'Eksporty',
    'export-new': 'Nowy Eksport',
    'export-detail': 'Szczegóły Eksportu',
    'settings': 'Ustawienia',
    'tokens': 'Tokeny'
  }

  document.title = `${titles[to.name] || 'Live Sales'} | Live Sales`
})

export default router
