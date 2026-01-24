<template>
  <div class="token-manager">
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-lg font-semibold text-gray-800">Tokeny API</h3>
      <button
        @click="showAddModal = true"
        :disabled="tokens.length >= 5"
        class="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm disabled:opacity-50"
      >
        Dodaj token
      </button>
    </div>

    <p v-if="tokens.length >= 5" class="text-sm text-gray-500 mb-4">
      Osiągnięto limit 5 tokenów.
    </p>

    <!-- Loading -->
    <div v-if="loading" class="text-center py-4">
      <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
      <p class="text-red-600 text-sm">{{ error }}</p>
    </div>

    <!-- Token list -->
    <div v-else class="space-y-2">
      <div
        v-for="token in tokens"
        :key="token.id"
        class="flex items-center justify-between bg-gray-50 rounded-lg p-3"
      >
        <div class="flex items-center gap-3">
          <div v-if="editingId === token.id" class="flex items-center gap-2">
            <input
              v-model="editName"
              type="text"
              class="px-2 py-1 border border-gray-300 rounded text-sm"
              @keyup.enter="saveEdit(token.id)"
              @keyup.escape="cancelEdit"
            />
            <button @click="saveEdit(token.id)" class="text-green-600 hover:text-green-700">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
              </svg>
            </button>
            <button @click="cancelEdit" class="text-gray-400 hover:text-gray-600">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <template v-else>
            <span class="font-medium text-gray-800">{{ token.name }}</span>
            <button @click="startEdit(token)" class="text-gray-400 hover:text-gray-600">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
              </svg>
            </button>
          </template>
          <span v-if="token.isDefault" class="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
            Domyślny
          </span>
        </div>
        <div class="flex items-center gap-2">
          <button
            v-if="!token.isDefault"
            @click="setDefault(token.id)"
            class="text-sm text-blue-600 hover:text-blue-700"
          >
            Ustaw domyślny
          </button>
          <button
            @click="confirmDelete(token)"
            class="text-red-600 hover:text-red-700"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
            </svg>
          </button>
        </div>
      </div>

      <div v-if="tokens.length === 0" class="text-center py-8 text-gray-500">
        Brak zapisanych tokenów
      </div>
    </div>

    <!-- Add Modal -->
    <div v-if="showAddModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h3 class="text-lg font-semibold mb-4">Dodaj token API</h3>

        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Nazwa</label>
            <input
              v-model="newToken.name"
              type="text"
              placeholder="np. Firma XYZ"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Token API</label>
            <input
              v-model="newToken.token"
              type="password"
              placeholder="Wklej token z BaseLinker"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
        </div>

        <div v-if="addError" class="mt-4 text-red-600 text-sm">{{ addError }}</div>

        <div class="flex gap-2 mt-6">
          <button
            @click="closeAddModal"
            class="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm"
          >
            Anuluj
          </button>
          <button
            @click="addToken"
            :disabled="addLoading || !newToken.name || !newToken.token"
            class="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm disabled:opacity-50"
          >
            {{ addLoading ? 'Dodawanie...' : 'Dodaj' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Delete Confirm Modal -->
    <div v-if="deleteTarget" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h3 class="text-lg font-semibold mb-4">Usuń token</h3>
        <p class="text-gray-600 mb-4">
          Czy na pewno chcesz usunąć token "{{ deleteTarget.name }}"?
        </p>

        <div v-if="deleteError" class="mb-4 text-red-600 text-sm">{{ deleteError }}</div>

        <div class="flex gap-2">
          <button
            @click="deleteTarget = null"
            class="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm"
          >
            Anuluj
          </button>
          <button
            @click="deleteToken"
            :disabled="deleteLoading"
            class="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm disabled:opacity-50"
          >
            {{ deleteLoading ? 'Usuwanie...' : 'Usuń' }}
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
  }
})

const emit = defineEmits(['tokenAdded', 'tokenDeleted'])

const loading = ref(false)
const error = ref(null)
const tokens = ref([])

const showAddModal = ref(false)
const addLoading = ref(false)
const addError = ref(null)
const newToken = reactive({
  name: '',
  token: ''
})

const editingId = ref(null)
const editName = ref('')

const deleteTarget = ref(null)
const deleteLoading = ref(false)
const deleteError = ref(null)

const loadTokens = async () => {
  loading.value = true
  error.value = null

  try {
    const response = await props.api.get('/user/tokens')
    if (response.success) {
      tokens.value = response.tokens
    } else {
      error.value = response.error || 'Nie udało się załadować tokenów'
    }
  } catch (err) {
    error.value = err.message || 'Błąd połączenia'
  } finally {
    loading.value = false
  }
}

const addToken = async () => {
  addLoading.value = true
  addError.value = null

  try {
    const response = await props.api.post('/user/tokens', {
      name: newToken.name,
      token: newToken.token,
      provider: 'baselinker'
    })

    if (response.success) {
      tokens.value.push(response.token)
      closeAddModal()
      emit('tokenAdded', response.token)
    } else {
      addError.value = response.error || 'Nie udało się dodać tokena'
    }
  } catch (err) {
    addError.value = err.message || 'Błąd połączenia'
  } finally {
    addLoading.value = false
  }
}

const closeAddModal = () => {
  showAddModal.value = false
  newToken.name = ''
  newToken.token = ''
  addError.value = null
}

const startEdit = (token) => {
  editingId.value = token.id
  editName.value = token.name
}

const cancelEdit = () => {
  editingId.value = null
  editName.value = ''
}

const saveEdit = async (id) => {
  try {
    const response = await props.api.put(`/user/tokens/${id}`, {
      name: editName.value
    })

    if (response.success) {
      const token = tokens.value.find(t => t.id === id)
      if (token) token.name = editName.value
      cancelEdit()
    }
  } catch (err) {
    console.error('Edit failed:', err)
  }
}

const setDefault = async (id) => {
  try {
    const response = await props.api.post(`/user/tokens/${id}/default`)
    if (response.success) {
      tokens.value.forEach(t => t.isDefault = t.id === id)
    }
  } catch (err) {
    console.error('Set default failed:', err)
  }
}

const confirmDelete = (token) => {
  deleteTarget.value = token
  deleteError.value = null
}

const deleteToken = async () => {
  deleteLoading.value = true
  deleteError.value = null

  try {
    const response = await props.api.delete(`/user/tokens/${deleteTarget.value.id}`)

    if (response.success) {
      tokens.value = tokens.value.filter(t => t.id !== deleteTarget.value.id)
      emit('tokenDeleted', deleteTarget.value)
      deleteTarget.value = null
    } else {
      deleteError.value = response.error || 'Nie udało się usunąć tokena'
    }
  } catch (err) {
    deleteError.value = err.message || 'Błąd połączenia'
  } finally {
    deleteLoading.value = false
  }
}

onMounted(() => {
  loadTokens()
})
</script>
