<template>
  <!-- Defense in depth: Even if router guard fails, components are protected -->
  <slot v-if="isAuthenticated" />

  <!-- Show skeleton while checking (should be rare - router guard handles this) -->
  <div v-else-if="isChecking" class="require-auth-loading">
    <div class="loading-spinner"></div>
  </div>

  <!-- Fallback: redirect to login (should rarely happen) -->
  <div v-else class="require-auth-redirect">
    <p>Przekierowywanie do logowania...</p>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore, AuthState } from '../stores/auth.js'

const authStore = useAuthStore()
const router = useRouter()

const isAuthenticated = computed(() => authStore.state === AuthState.AUTHENTICATED)
const isChecking = computed(() => authStore.state === AuthState.CHECKING)

// Fallback redirect (defense in depth)
onMounted(() => {
  if (authStore.state === AuthState.UNAUTHENTICATED) {
    console.warn('[RequireAuth] Component mounted but user is unauthenticated - redirecting')
    router.push('/login')
  }
})
</script>

<style scoped>
.require-auth-loading,
.require-auth-redirect {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  color: #6b7280;
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #e5e7eb;
  border-top-color: #2563eb;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
