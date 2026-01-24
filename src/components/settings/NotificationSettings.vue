<template>
  <div class="notification-settings">
    <h3 class="text-lg font-semibold text-gray-800 mb-4">Powiadomienia e-mail</h3>

    <!-- Loading -->
    <div v-if="loading" class="text-center py-4">
      <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="bg-red-50 border border-red-200 rounded-lg p-4">
      <p class="text-red-600 text-sm">{{ error }}</p>
      <button @click="loadSettings" class="mt-2 text-sm text-red-700 underline">Spróbuj ponownie</button>
    </div>

    <!-- Settings form -->
    <div v-else class="space-y-6">
      <!-- Email addresses -->
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-2">
          Adresy e-mail do powiadomień (max. 5)
        </label>
        <div class="space-y-2">
          <div
            v-for="(email, index) in settings.errorEmails"
            :key="index"
            class="flex items-center gap-2"
          >
            <input
              v-model="settings.errorEmails[index]"
              type="email"
              class="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
              placeholder="adres@email.com"
            />
            <button
              @click="removeEmail(index)"
              class="text-red-600 hover:text-red-700 p-2"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>
        <button
          v-if="settings.errorEmails.length < 5"
          @click="addEmail"
          class="mt-2 text-sm text-blue-600 hover:text-blue-700"
        >
          + Dodaj adres e-mail
        </button>
      </div>

      <!-- Notification types -->
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-2">Rodzaje powiadomień</label>
        <div class="space-y-2">
          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              v-model="settings.notifyOnExportError"
              class="rounded border-gray-300 text-blue-600"
            />
            <span class="text-sm text-gray-700">Błędy eksportu</span>
          </label>
          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              v-model="settings.notifyOnPaymentIssue"
              class="rounded border-gray-300 text-blue-600"
            />
            <span class="text-sm text-gray-700">Problemy z płatnościami</span>
          </label>
        </div>
      </div>

      <!-- Success message -->
      <div v-if="successMessage" class="text-green-600 text-sm">
        {{ successMessage }}
      </div>

      <!-- Save button -->
      <button
        @click="saveSettings"
        :disabled="saving"
        class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm disabled:opacity-50"
      >
        {{ saving ? 'Zapisywanie...' : 'Zapisz ustawienia' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'

const props = defineProps({
  api: {
    type: Object,
    required: true
  }
})

const loading = ref(false)
const saving = ref(false)
const error = ref(null)
const successMessage = ref(null)

const settings = reactive({
  errorEmails: [],
  notifyOnExportError: true,
  notifyOnPaymentIssue: true
})

const loadSettings = async () => {
  loading.value = true
  error.value = null

  try {
    const response = await props.api.get('/api/company/notifications')
    if (response.success) {
      settings.errorEmails = response.data.errorEmails || []
      settings.notifyOnExportError = response.data.notifyOnExportError
      settings.notifyOnPaymentIssue = response.data.notifyOnPaymentIssue
    } else {
      error.value = response.error || 'Nie udało się załadować ustawień'
    }
  } catch (err) {
    error.value = err.message || 'Błąd połączenia'
  } finally {
    loading.value = false
  }
}

const saveSettings = async () => {
  saving.value = true
  successMessage.value = null
  error.value = null

  // Filter out empty emails
  const validEmails = settings.errorEmails.filter(e => e && e.trim())

  try {
    const response = await props.api.put('/api/company/notifications', {
      errorEmails: validEmails,
      notifyOnExportError: settings.notifyOnExportError,
      notifyOnPaymentIssue: settings.notifyOnPaymentIssue
    })

    if (response.success) {
      settings.errorEmails = response.data.errorEmails
      successMessage.value = 'Ustawienia zostały zapisane'
      setTimeout(() => successMessage.value = null, 3000)
    } else {
      error.value = response.error || 'Nie udało się zapisać ustawień'
    }
  } catch (err) {
    error.value = err.message || 'Błąd połączenia'
  } finally {
    saving.value = false
  }
}

const addEmail = () => {
  if (settings.errorEmails.length < 5) {
    settings.errorEmails.push('')
  }
}

const removeEmail = (index) => {
  settings.errorEmails.splice(index, 1)
}

onMounted(() => {
  loadSettings()
})
</script>
