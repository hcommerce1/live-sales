<template>
  <div class="security-settings">
    <!-- Password Change -->
    <div class="bg-white rounded-lg border border-gray-200 p-6 mb-6">
      <h3 class="text-lg font-semibold text-gray-800 mb-4">Zmiana hasła</h3>

      <form @submit.prevent="changePassword" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Aktualne hasło</label>
          <input
            type="password"
            v-model="passwordForm.currentPassword"
            required
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Nowe hasło</label>
          <input
            type="password"
            v-model="passwordForm.newPassword"
            required
            minlength="12"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <p class="mt-1 text-xs text-gray-500">
            Min. 12 znaków, wielkie i małe litery, cyfry, znaki specjalne
          </p>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Potwierdź nowe hasło</label>
          <input
            type="password"
            v-model="passwordForm.confirmPassword"
            required
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>

        <div v-if="passwordError" class="text-red-600 text-sm">{{ passwordError }}</div>
        <div v-if="passwordSuccess" class="text-green-600 text-sm">{{ passwordSuccess }}</div>

        <button
          type="submit"
          :disabled="passwordLoading"
          class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm disabled:opacity-50"
        >
          {{ passwordLoading ? 'Zapisywanie...' : 'Zmień hasło' }}
        </button>
      </form>
    </div>

    <!-- Two-Factor Authentication -->
    <div class="bg-white rounded-lg border border-gray-200 p-6">
      <h3 class="text-lg font-semibold text-gray-800 mb-4">Uwierzytelnianie dwuskładnikowe (2FA)</h3>

      <div v-if="twoFactorEnabled">
        <div class="flex items-center gap-2 text-green-600 mb-4">
          <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
          </svg>
          <span>2FA jest włączone</span>
        </div>
        <button
          @click="showDisable2FAModal = true"
          class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm"
        >
          Wyłącz 2FA
        </button>
      </div>

      <div v-else>
        <p class="text-gray-600 mb-4">
          Dodaj dodatkową warstwę bezpieczeństwa do swojego konta.
        </p>
        <button
          @click="enable2FA"
          :disabled="twoFactorLoading"
          class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm disabled:opacity-50"
        >
          {{ twoFactorLoading ? 'Ładowanie...' : 'Włącz 2FA' }}
        </button>
      </div>

      <div v-if="twoFactorError" class="mt-4 text-red-600 text-sm">{{ twoFactorError }}</div>
    </div>

    <!-- 2FA Setup Modal -->
    <div v-if="showSetup2FAModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h3 class="text-lg font-semibold mb-4">Konfiguracja 2FA</h3>

        <div v-if="setupStep === 1">
          <p class="text-sm text-gray-600 mb-4">
            Zeskanuj kod QR aplikacją Google Authenticator lub Authy:
          </p>
          <div class="flex justify-center mb-4">
            <img :src="qrCode" alt="QR Code" class="w-48 h-48" />
          </div>
          <p class="text-xs text-gray-500 mb-4 font-mono break-all">
            Secret: {{ secret }}
          </p>

          <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
            <p class="text-sm font-semibold text-yellow-800 mb-2">Kody zapasowe</p>
            <p class="text-xs text-yellow-700 mb-2">Zapisz te kody w bezpiecznym miejscu:</p>
            <div class="font-mono text-sm space-y-1">
              <div v-for="code in backupCodes" :key="code" class="bg-white px-2 py-1 rounded">
                {{ code }}
              </div>
            </div>
          </div>

          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-1">Kod weryfikacyjny</label>
            <input
              type="text"
              v-model="verifyCode"
              placeholder="000000"
              maxlength="6"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>

          <div class="flex gap-2">
            <button
              @click="showSetup2FAModal = false"
              class="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm"
            >
              Anuluj
            </button>
            <button
              @click="verifySetup"
              :disabled="twoFactorLoading || !verifyCode"
              class="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm disabled:opacity-50"
            >
              Aktywuj
            </button>
          </div>
        </div>

        <div v-if="setupStep === 2">
          <div class="text-center">
            <svg class="w-16 h-16 mx-auto text-green-500 mb-4" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
            </svg>
            <p class="text-lg font-semibold mb-2">2FA włączone!</p>
            <p class="text-sm text-gray-600 mb-4">
              Twoje konto jest teraz lepiej chronione.
            </p>
            <button
              @click="closeSetupModal"
              class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
            >
              Zamknij
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Disable 2FA Modal -->
    <div v-if="showDisable2FAModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h3 class="text-lg font-semibold mb-4">Wyłącz 2FA</h3>

        <p class="text-sm text-gray-600 mb-4">
          Aby wyłączyć 2FA, wprowadź hasło i kod z aplikacji:
        </p>

        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Hasło</label>
            <input
              type="password"
              v-model="disableForm.password"
              required
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Kod 2FA</label>
            <input
              type="text"
              v-model="disableForm.code"
              placeholder="000000"
              maxlength="6"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
        </div>

        <div v-if="disableError" class="mt-4 text-red-600 text-sm">{{ disableError }}</div>

        <div class="flex gap-2 mt-6">
          <button
            @click="showDisable2FAModal = false"
            class="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm"
          >
            Anuluj
          </button>
          <button
            @click="disable2FA"
            :disabled="twoFactorLoading"
            class="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm disabled:opacity-50"
          >
            Wyłącz
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'

const props = defineProps({
  api: {
    type: Object,
    required: true
  },
  initialTwoFactorEnabled: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['twoFactorChanged'])

// Password change
const passwordForm = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: ''
})
const passwordLoading = ref(false)
const passwordError = ref(null)
const passwordSuccess = ref(null)

// 2FA
const twoFactorEnabled = ref(props.initialTwoFactorEnabled)
const twoFactorLoading = ref(false)
const twoFactorError = ref(null)

const showSetup2FAModal = ref(false)
const showDisable2FAModal = ref(false)
const setupStep = ref(1)

const qrCode = ref('')
const secret = ref('')
const backupCodes = ref([])
const verifyCode = ref('')

const disableForm = reactive({
  password: '',
  code: ''
})
const disableError = ref(null)

const changePassword = async () => {
  passwordError.value = null
  passwordSuccess.value = null

  if (passwordForm.newPassword !== passwordForm.confirmPassword) {
    passwordError.value = 'Hasła nie są identyczne'
    return
  }

  if (passwordForm.newPassword.length < 12) {
    passwordError.value = 'Hasło musi mieć min. 12 znaków'
    return
  }

  passwordLoading.value = true

  try {
    const response = await props.api.post('/auth/change-password', {
      currentPassword: passwordForm.currentPassword,
      newPassword: passwordForm.newPassword
    })

    if (response.success) {
      passwordSuccess.value = 'Hasło zostało zmienione'
      passwordForm.currentPassword = ''
      passwordForm.newPassword = ''
      passwordForm.confirmPassword = ''
    } else {
      passwordError.value = response.error || 'Nie udało się zmienić hasła'
    }
  } catch (err) {
    passwordError.value = err.message || 'Błąd połączenia'
  } finally {
    passwordLoading.value = false
  }
}

const enable2FA = async () => {
  twoFactorLoading.value = true
  twoFactorError.value = null

  try {
    const response = await props.api.post('/auth/2fa/enable')

    if (response.success) {
      qrCode.value = response.qrCode
      secret.value = response.secret
      backupCodes.value = response.backupCodes
      setupStep.value = 1
      showSetup2FAModal.value = true
    } else {
      twoFactorError.value = response.error || 'Nie udało się włączyć 2FA'
    }
  } catch (err) {
    twoFactorError.value = err.message || 'Błąd połączenia'
  } finally {
    twoFactorLoading.value = false
  }
}

const verifySetup = async () => {
  twoFactorLoading.value = true
  twoFactorError.value = null

  try {
    const response = await props.api.post('/auth/2fa/verify-setup', {
      code: verifyCode.value,
      secret: secret.value
    })

    if (response.success) {
      backupCodes.value = response.backupCodes
      setupStep.value = 2
      twoFactorEnabled.value = true
      emit('twoFactorChanged', true)
    } else {
      twoFactorError.value = response.error || 'Nieprawidłowy kod'
    }
  } catch (err) {
    twoFactorError.value = err.message || 'Błąd połączenia'
  } finally {
    twoFactorLoading.value = false
  }
}

const closeSetupModal = () => {
  showSetup2FAModal.value = false
  verifyCode.value = ''
  setupStep.value = 1
}

const disable2FA = async () => {
  twoFactorLoading.value = true
  disableError.value = null

  try {
    const response = await props.api.post('/auth/2fa/disable', {
      password: disableForm.password,
      code: disableForm.code
    })

    if (response.success) {
      twoFactorEnabled.value = false
      showDisable2FAModal.value = false
      disableForm.password = ''
      disableForm.code = ''
      emit('twoFactorChanged', false)
    } else {
      disableError.value = response.error || 'Nie udało się wyłączyć 2FA'
    }
  } catch (err) {
    disableError.value = err.message || 'Błąd połączenia'
  } finally {
    twoFactorLoading.value = false
  }
}
</script>
