<template>
  <!-- Auth checking state: SKELETON UI (not blank loader!) -->
  <div v-if="authStore.state === AuthState.CHECKING" class="app-shell">
    <SkeletonSidebar />
    <div class="main-area">
      <SkeletonHeader />
      <SkeletonContent />
    </div>
  </div>

  <!-- Auth resolved: show router content with transitions -->
  <template v-else>
    <router-view v-slot="{ Component, route }">
      <Transition name="fade" mode="out-in">
        <component :is="Component" :key="route.path" />
      </Transition>
    </router-view>
  </template>
</template>

<script setup>
import { onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore, AuthState } from './stores/auth.js'
import SkeletonSidebar from './components/skeleton/SkeletonSidebar.vue'
import SkeletonHeader from './components/skeleton/SkeletonHeader.vue'
import SkeletonContent from './components/skeleton/SkeletonContent.vue'

const router = useRouter()
const authStore = useAuthStore()

// Initial auth check on mount
onMounted(async () => {
  // Remove the initial loading indicator from index.html
  const loader = document.getElementById('initial-loader')
  if (loader) {
    loader.classList.add('fade-out')
    setTimeout(() => loader.remove(), 300) // Wait for fade animation
  }

  // Check auth status if still in CHECKING state
  if (authStore.state === AuthState.CHECKING) {
    await authStore.checkAuth()
  }
})

// Watch for auth state changes to handle redirects
watch(
  () => authStore.state,
  (newState) => {
    if (newState === AuthState.UNAUTHENTICATED) {
      // Don't redirect if already on login page
      if (router.currentRoute.value.path !== '/login') {
        router.push('/login')
      }
    }
  }
)
</script>

<style>
/* Global styles */
*,
*::before,
*::after {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  padding: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
  font-size: 16px;
  line-height: 1.5;
  color: #111827;
  background: #f9fafb;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

#app {
  min-height: 100vh;
}

/* App shell layout for skeleton */
.app-shell {
  display: flex;
  min-height: 100vh;
}

.main-area {
  flex: 1;
  display: flex;
  flex-direction: column;
}

/* Fade transitions */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Button reset */
button {
  font-family: inherit;
}

/* Link reset */
a {
  color: inherit;
  text-decoration: none;
}

/* Focus styles */
:focus-visible {
  outline: 2px solid #2563eb;
  outline-offset: 2px;
}

/* Scrollbar styles */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: #f1f5f9;
}

::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}
</style>
