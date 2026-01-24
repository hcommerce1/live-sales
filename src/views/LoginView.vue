<template>
  <div class="login-page">
    <div class="auth-container">
      <!-- Logo -->
      <div class="logo">
        <svg class="logo-icon" viewBox="0 0 64 64" fill="none">
          <rect width="64" height="64" rx="16" fill="url(#gradient)" />
          <path d="M20 32L28 40L44 24" stroke="white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
          <defs>
            <linearGradient id="gradient" x1="0" y1="0" x2="64" y2="64">
              <stop stop-color="#667eea" />
              <stop offset="1" stop-color="#764ba2" />
            </linearGradient>
          </defs>
        </svg>
        <h1>Live Sales</h1>
        <p>Automatyzacja eksportu danych</p>
      </div>

      <!-- Tabs -->
      <div class="tabs">
        <button
          class="tab"
          :class="{ active: activeTab === 'login' }"
          @click="activeTab = 'login'"
          :disabled="isLoading"
        >
          Logowanie
        </button>
        <button
          class="tab"
          :class="{ active: activeTab === 'register' }"
          @click="activeTab = 'register'"
          :disabled="isLoading"
        >
          Rejestracja
        </button>
      </div>

      <!-- Error Alert -->
      <div v-if="error" class="alert alert-error">
        {{ error }}
      </div>

      <!-- Login Form -->
      <form v-if="activeTab === 'login'" @submit.prevent="handleLogin">
        <div class="form-group">
          <label for="login-email">Email</label>
          <input
            id="login-email"
            type="email"
            v-model="loginForm.email"
            placeholder="twoj@email.pl"
            required
            :disabled="isLoading"
          />
        </div>

        <div class="form-group">
          <label for="login-password">Hasło</label>
          <input
            id="login-password"
            type="password"
            v-model="loginForm.password"
            placeholder="••••••••"
            required
            :disabled="isLoading"
          />
        </div>

        <button type="submit" class="btn btn-primary" :disabled="isLoading">
          <span v-if="isLoading" class="spinner"></span>
          {{ isLoading ? 'Logowanie...' : 'Zaloguj się' }}
        </button>
      </form>

      <!-- Register Form -->
      <form v-else @submit.prevent="handleRegister">
        <div class="form-group">
          <label for="register-email">Email</label>
          <input
            id="register-email"
            type="email"
            v-model="registerForm.email"
            placeholder="twoj@email.pl"
            required
            :disabled="isLoading"
          />
        </div>

        <div class="form-group">
          <label for="register-password">Hasło</label>
          <input
            id="register-password"
            type="password"
            v-model="registerForm.password"
            placeholder="Min. 12 znaków"
            minlength="12"
            required
            :disabled="isLoading"
          />
        </div>

        <div class="form-group">
          <label for="register-confirm">Potwierdź hasło</label>
          <input
            id="register-confirm"
            type="password"
            v-model="registerForm.confirmPassword"
            placeholder="Powtórz hasło"
            required
            :disabled="isLoading"
          />
        </div>

        <button type="submit" class="btn btn-primary" :disabled="isLoading">
          <span v-if="isLoading" class="spinner"></span>
          {{ isLoading ? 'Rejestracja...' : 'Zarejestruj się' }}
        </button>
      </form>

      <!-- 2FA Form -->
      <div v-if="requires2FA" class="two-factor-form">
        <h3>Weryfikacja dwuetapowa</h3>
        <p>Wprowadź kod wysłany na Twój email</p>

        <form @submit.prevent="handle2FA">
          <div class="form-group">
            <input
              type="text"
              v-model="twoFactorCode"
              placeholder="000000"
              maxlength="6"
              pattern="[0-9]{6}"
              required
              :disabled="isLoading"
              class="code-input"
            />
          </div>

          <button type="submit" class="btn btn-primary" :disabled="isLoading">
            {{ isLoading ? 'Weryfikacja...' : 'Zweryfikuj' }}
          </button>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

// Form state
const activeTab = ref('login')
const isLoading = ref(false)
const error = ref('')
const requires2FA = ref(false)
const twoFactorCode = ref('')

const loginForm = ref({
  email: '',
  password: ''
})

const registerForm = ref({
  email: '',
  password: '',
  confirmPassword: ''
})

// Check if already logged in
onMounted(async () => {
  if (authStore.isAuthenticated) {
    const redirect = route.query.redirect || '/'
    router.push(redirect)
  }
})

// Handle login
async function handleLogin() {
  error.value = ''
  isLoading.value = true

  try {
    const result = await authStore.login(loginForm.value.email, loginForm.value.password)

    if (result.requires2FA) {
      requires2FA.value = true
    } else if (result.success) {
      const redirect = route.query.redirect || '/'
      router.push(redirect)
    } else {
      error.value = result.error || 'Logowanie nie powiodło się'
    }
  } catch (e) {
    error.value = e.message || 'Wystąpił błąd podczas logowania'
  } finally {
    isLoading.value = false
  }
}

// Handle register
async function handleRegister() {
  error.value = ''

  // Validate passwords match
  if (registerForm.value.password !== registerForm.value.confirmPassword) {
    error.value = 'Hasła nie są identyczne'
    return
  }

  // Validate password length
  if (registerForm.value.password.length < 12) {
    error.value = 'Hasło musi mieć minimum 12 znaków'
    return
  }

  isLoading.value = true

  try {
    const result = await authStore.register(registerForm.value.email, registerForm.value.password)

    if (result.success) {
      router.push('/')
    } else {
      error.value = result.error || 'Rejestracja nie powiodła się'
    }
  } catch (e) {
    error.value = e.message || 'Wystąpił błąd podczas rejestracji'
  } finally {
    isLoading.value = false
  }
}

// Handle 2FA verification
async function handle2FA() {
  error.value = ''
  isLoading.value = true

  try {
    const result = await authStore.verify2FA(twoFactorCode.value)

    if (result.success) {
      const redirect = route.query.redirect || '/'
      router.push(redirect)
    } else {
      error.value = result.error || 'Weryfikacja nie powiodła się'
    }
  } catch (e) {
    error.value = e.message || 'Wystąpił błąd podczas weryfikacji'
  } finally {
    isLoading.value = false
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 20px;
}

.auth-container {
  width: 100%;
  max-width: 420px;
  background: #ffffff;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  padding: 40px;
}

.logo {
  text-align: center;
  margin-bottom: 30px;
}

.logo-icon {
  width: 64px;
  height: 64px;
  margin-bottom: 16px;
}

.logo h1 {
  color: #667eea;
  font-size: 28px;
  font-weight: 700;
  margin: 0 0 8px 0;
}

.logo p {
  color: #6b7280;
  font-size: 14px;
  margin: 0;
}

.tabs {
  display: flex;
  gap: 10px;
  margin-bottom: 30px;
  border-bottom: 2px solid #e5e7eb;
}

.tab {
  flex: 1;
  padding: 12px;
  background: none;
  border: none;
  border-bottom: 3px solid transparent;
  color: #6b7280;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  margin-bottom: -2px;
}

.tab:hover:not(:disabled) {
  color: #667eea;
}

.tab.active {
  color: #667eea;
  border-bottom-color: #667eea;
}

.tab:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.alert {
  padding: 12px 16px;
  border-radius: 8px;
  margin-bottom: 20px;
  font-size: 14px;
}

.alert-error {
  background: #fef2f2;
  color: #dc2626;
  border: 1px solid #fecaca;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  color: #374151;
  font-size: 14px;
  font-weight: 500;
}

.form-group input {
  width: 100%;
  padding: 12px 16px;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  font-size: 15px;
  transition: border-color 0.3s;
}

.form-group input:focus {
  outline: none;
  border-color: #667eea;
}

.form-group input:disabled {
  background: #f9fafb;
  cursor: not-allowed;
}

.btn {
  width: 100%;
  padding: 14px 20px;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.3s;
}

.btn-primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #ffffff;
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
  transform: none;
}

.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.two-factor-form {
  text-align: center;
}

.two-factor-form h3 {
  color: #111827;
  font-size: 18px;
  margin-bottom: 8px;
}

.two-factor-form p {
  color: #6b7280;
  font-size: 14px;
  margin-bottom: 20px;
}

.code-input {
  text-align: center;
  font-size: 24px !important;
  letter-spacing: 8px;
  font-family: monospace;
}
</style>
