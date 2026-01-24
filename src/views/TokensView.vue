<template>
  <RequireAuth>
    <div class="tokens-view">
      <!-- Header -->
      <header class="page-header">
        <div class="header-content">
          <h1>Tokeny</h1>
          <p>Zarządzaj tokenami API i integracjami</p>
        </div>
        <div class="header-actions">
          <button class="btn btn-primary" @click="showAddModal = true">
            <svg class="btn-icon" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
            </svg>
            Dodaj token
          </button>
        </div>
      </header>

      <!-- Content -->
      <main class="page-content">
        <!-- Loading state -->
        <div v-if="isLoading" class="loading-state">
          <div class="loading-spinner"></div>
          <p>Wczytywanie tokenów...</p>
        </div>

        <!-- Empty state -->
        <EmptyState
          v-else-if="tokens.length === 0"
          type="tokens"
          title="Brak tokenów"
          description="Dodaj token API BaseLinker lub Google Sheets, aby rozpocząć synchronizację danych."
          actionLabel="Dodaj token"
          @action="showAddModal = true"
        />

        <!-- Tokens list -->
        <div v-else class="tokens-grid">
          <!-- BaseLinker section -->
          <div class="token-section">
            <h2 class="section-title">
              <svg class="section-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
              </svg>
              BaseLinker
            </h2>

            <div v-for="token in baselinkerTokens" :key="token.id" class="token-card">
              <div class="token-header">
                <div class="token-info">
                  <span class="token-name">{{ token.name }}</span>
                  <span class="token-meta">Dodano {{ formatDate(token.createdAt) }}</span>
                </div>
                <div class="token-status" :class="token.connected ? 'connected' : 'disconnected'">
                  {{ token.connected ? 'Połączony' : 'Niepołączony' }}
                </div>
              </div>

              <div class="token-details">
                <div class="detail-row">
                  <span class="detail-label">Ostatnie użycie</span>
                  <span class="detail-value">{{ formatDate(token.lastUsedAt) || 'Nigdy' }}</span>
                </div>
              </div>

              <div class="token-actions">
                <button class="btn btn-sm" @click="testToken(token)" :disabled="testingToken === token.id">
                  {{ testingToken === token.id ? 'Testowanie...' : 'Testuj połączenie' }}
                </button>
                <button class="btn btn-sm btn-danger" @click="confirmDelete(token)">
                  Usuń
                </button>
              </div>
            </div>

            <div v-if="baselinkerTokens.length === 0" class="no-tokens">
              <p>Brak tokenów BaseLinker</p>
              <button class="btn btn-sm" @click="openAddModal('baselinker')">Dodaj token</button>
            </div>
          </div>

          <!-- Google Sheets section -->
          <div class="token-section">
            <h2 class="section-title">
              <svg class="section-icon" viewBox="0 0 24 24" fill="currentColor">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <line x1="3" y1="9" x2="21" y2="9"/>
                <line x1="3" y1="15" x2="21" y2="15"/>
                <line x1="9" y1="3" x2="9" y2="21"/>
              </svg>
              Google Sheets
            </h2>

            <div class="sheets-status">
              <div v-if="sheetsConnected" class="status-card connected">
                <div class="status-icon">
                  <svg viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                  </svg>
                </div>
                <div class="status-info">
                  <span class="status-title">Połączono</span>
                  <span class="status-desc">Konto usługi Google skonfigurowane</span>
                </div>
              </div>
              <div v-else class="status-card not-configured">
                <div class="status-icon">
                  <svg viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
                  </svg>
                </div>
                <div class="status-info">
                  <span class="status-title">Konfiguracja serwera</span>
                  <span class="status-desc">Google Sheets jest skonfigurowany po stronie serwera</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <!-- Add token modal -->
      <Teleport to="body">
        <div v-if="showAddModal" class="modal-overlay" @click.self="showAddModal = false">
          <div class="modal-content">
            <div class="modal-header">
              <h2>Dodaj token API</h2>
              <button class="close-btn" @click="showAddModal = false">&times;</button>
            </div>
            <div class="modal-body">
              <form @submit.prevent="saveToken">
                <div class="form-group">
                  <label>Typ tokenu</label>
                  <select v-model="newToken.type" class="input">
                    <option value="baselinker">BaseLinker</option>
                  </select>
                </div>

                <div class="form-group">
                  <label>Nazwa (opcjonalna)</label>
                  <input
                    type="text"
                    v-model="newToken.name"
                    class="input"
                    placeholder="np. Sklep główny"
                  />
                </div>

                <div class="form-group">
                  <label>Token API</label>
                  <div class="token-input-wrapper">
                    <input
                      :type="showTokenInput ? 'text' : 'password'"
                      v-model="newToken.value"
                      class="input token-input"
                      required
                      placeholder="Wklej token API"
                    />
                    <button
                      type="button"
                      class="toggle-visibility"
                      @click="showTokenInput = !showTokenInput"
                    >
                      <svg v-if="showTokenInput" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clip-rule="evenodd" />
                        <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
                      </svg>
                      <svg v-else viewBox="0 0 20 20" fill="currentColor">
                        <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                        <path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd" />
                      </svg>
                    </button>
                  </div>
                  <span class="hint">Token znajdziesz w BaseLinker: Ustawienia → API</span>
                </div>

                <div class="modal-actions">
                  <button type="button" class="btn btn-sm" @click="showAddModal = false">
                    Anuluj
                  </button>
                  <button type="submit" class="btn btn-primary" :disabled="isSaving">
                    {{ isSaving ? 'Zapisuję...' : 'Zapisz token' }}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </Teleport>

      <!-- Delete confirmation modal -->
      <Teleport to="body">
        <div v-if="deleteConfirm" class="modal-overlay" @click.self="deleteConfirm = null">
          <div class="modal-content confirm-modal">
            <div class="modal-header">
              <h2>Potwierdź usunięcie</h2>
            </div>
            <div class="modal-body">
              <p>Czy na pewno chcesz usunąć token <strong>{{ deleteConfirm.name || 'Bez nazwy' }}</strong>?</p>
              <p class="warning-text">Po usunięciu eksporty korzystające z tego tokenu przestaną działać.</p>
            </div>
            <div class="modal-actions">
              <button class="btn btn-sm" @click="deleteConfirm = null">Anuluj</button>
              <button class="btn btn-sm btn-danger" @click="deleteToken" :disabled="isDeleting">
                {{ isDeleting ? 'Usuwanie...' : 'Usuń' }}
              </button>
            </div>
          </div>
        </div>
      </Teleport>
    </div>
  </RequireAuth>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { API } from '../api.js'
import RequireAuth from '../components/RequireAuth.vue'
import EmptyState from '../components/EmptyState.vue'

// State
const isLoading = ref(false)
const tokens = ref([])
const sheetsConnected = ref(false)

// Modal states
const showAddModal = ref(false)
const showTokenInput = ref(false)
const newToken = ref({
  type: 'baselinker',
  name: '',
  value: ''
})
const isSaving = ref(false)

// Delete state
const deleteConfirm = ref(null)
const isDeleting = ref(false)

// Test state
const testingToken = ref(null)

// Computed
const baselinkerTokens = computed(() => {
  return tokens.value.filter(t => t.type === 'baselinker')
})

function formatDate(date) {
  if (!date) return null
  return new Date(date).toLocaleDateString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
}

function openAddModal(type = 'baselinker') {
  newToken.value = { type, name: '', value: '' }
  showAddModal.value = true
}

async function loadTokens() {
  isLoading.value = true
  try {
    // TODO: Replace with actual API call when endpoint is ready
    // const response = await API.request('/api/integrations')
    // tokens.value = response.data || []

    // Placeholder: check if we have any integration configured
    tokens.value = []
    sheetsConnected.value = true // Sheets is server-side configured
  } catch (error) {
    console.error('Failed to load tokens:', error)
  } finally {
    isLoading.value = false
  }
}

async function saveToken() {
  if (!newToken.value.value) return

  isSaving.value = true
  try {
    // TODO: Replace with actual API call
    // await API.request(`/api/integrations/${newToken.value.type}`, {
    //   method: 'POST',
    //   body: JSON.stringify({
    //     name: newToken.value.name,
    //     value: newToken.value.value
    //   })
    // })

    console.log('Save token:', newToken.value.type, newToken.value.name)

    // Add to local list (placeholder)
    tokens.value.push({
      id: Date.now().toString(),
      type: newToken.value.type,
      name: newToken.value.name || `Token ${tokens.value.length + 1}`,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      connected: false
    })

    showAddModal.value = false
    newToken.value = { type: 'baselinker', name: '', value: '' }
    showTokenInput.value = false
  } catch (error) {
    console.error('Failed to save token:', error)
    alert('Nie udało się zapisać tokenu')
  } finally {
    isSaving.value = false
  }
}

async function testToken(token) {
  testingToken.value = token.id
  try {
    // TODO: Replace with actual API call
    // const response = await API.request(`/api/integrations/${token.type}/${token.id}/test`, {
    //   method: 'POST'
    // })

    // Placeholder: simulate test
    await new Promise(resolve => setTimeout(resolve, 1500))

    // Update token status
    const idx = tokens.value.findIndex(t => t.id === token.id)
    if (idx !== -1) {
      tokens.value[idx].connected = true
      tokens.value[idx].lastUsedAt = new Date().toISOString()
    }

    alert('Połączenie udane!')
  } catch (error) {
    console.error('Failed to test token:', error)
    alert('Nie udało się połączyć z API')
  } finally {
    testingToken.value = null
  }
}

function confirmDelete(token) {
  deleteConfirm.value = token
}

async function deleteToken() {
  if (!deleteConfirm.value) return

  isDeleting.value = true
  try {
    // TODO: Replace with actual API call
    // await API.request(`/api/integrations/${deleteConfirm.value.type}/${deleteConfirm.value.id}`, {
    //   method: 'DELETE'
    // })

    // Remove from local list
    tokens.value = tokens.value.filter(t => t.id !== deleteConfirm.value.id)
    deleteConfirm.value = null
  } catch (error) {
    console.error('Failed to delete token:', error)
    alert('Nie udało się usunąć tokenu')
  } finally {
    isDeleting.value = false
  }
}

// Load data on mount
onMounted(loadTokens)
</script>

<style scoped>
.tokens-view {
  min-height: 100vh;
  background: #f9fafb;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem 2rem;
  background: #ffffff;
  border-bottom: 1px solid #e5e7eb;
}

.header-content h1 {
  font-size: 1.5rem;
  font-weight: 700;
  color: #111827;
  margin: 0 0 0.25rem 0;
}

.header-content p {
  font-size: 0.875rem;
  color: #6b7280;
  margin: 0;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1rem;
  border: none;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background: linear-gradient(135deg, #2563eb 0%, #4f46e5 100%);
  color: #ffffff;
}

.btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.btn-sm {
  padding: 0.375rem 0.75rem;
  font-size: 0.8125rem;
  background: #f3f4f6;
  color: #374151;
}

.btn-sm:hover {
  background: #e5e7eb;
}

.btn-sm:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-danger {
  background: #fee2e2;
  color: #dc2626;
}

.btn-danger:hover {
  background: #fecaca;
}

.btn-icon {
  width: 18px;
  height: 18px;
}

.page-content {
  padding: 1.5rem 2rem;
  max-width: 1000px;
  margin: 0 auto;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem;
  color: #6b7280;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #e5e7eb;
  border-top-color: #2563eb;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 1rem;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.tokens-grid {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.token-section {
  background: #ffffff;
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.section-title {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 1.125rem;
  font-weight: 600;
  color: #111827;
  margin: 0 0 1.5rem 0;
}

.section-icon {
  width: 24px;
  height: 24px;
  color: #2563eb;
}

.token-card {
  background: #f9fafb;
  border-radius: 8px;
  padding: 1rem 1.25rem;
  margin-bottom: 1rem;
}

.token-card:last-child {
  margin-bottom: 0;
}

.token-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0.75rem;
}

.token-name {
  font-weight: 600;
  color: #111827;
  display: block;
}

.token-meta {
  font-size: 0.75rem;
  color: #9ca3af;
}

.token-status {
  font-size: 0.75rem;
  font-weight: 500;
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
}

.token-status.connected {
  background: #dcfce7;
  color: #16a34a;
}

.token-status.disconnected {
  background: #f3f4f6;
  color: #6b7280;
}

.token-details {
  padding: 0.75rem 0;
  border-top: 1px solid #e5e7eb;
  border-bottom: 1px solid #e5e7eb;
  margin-bottom: 0.75rem;
}

.detail-row {
  display: flex;
  justify-content: space-between;
}

.detail-label {
  font-size: 0.8125rem;
  color: #6b7280;
}

.detail-value {
  font-size: 0.8125rem;
  color: #374151;
  font-weight: 500;
}

.token-actions {
  display: flex;
  gap: 0.5rem;
}

.no-tokens {
  text-align: center;
  padding: 2rem;
  color: #6b7280;
}

.no-tokens p {
  margin-bottom: 1rem;
}

.sheets-status {
  padding: 0.5rem 0;
}

.status-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  border-radius: 8px;
}

.status-card.connected {
  background: #dcfce7;
}

.status-card.not-configured {
  background: #fef3c7;
}

.status-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-card.connected .status-icon {
  background: #16a34a;
  color: #ffffff;
}

.status-card.connected .status-icon svg {
  width: 20px;
  height: 20px;
}

.status-card.not-configured .status-icon {
  background: #d97706;
  color: #ffffff;
}

.status-card.not-configured .status-icon svg {
  width: 20px;
  height: 20px;
}

.status-title {
  font-weight: 600;
  color: #111827;
  display: block;
}

.status-desc {
  font-size: 0.8125rem;
  color: #6b7280;
}

/* Modal styles */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal-content {
  background: #ffffff;
  border-radius: 16px;
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.25);
  width: 90%;
  max-width: 450px;
}

.confirm-modal {
  max-width: 400px;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid #e5e7eb;
}

.modal-header h2 {
  font-size: 1.125rem;
  font-weight: 600;
  color: #111827;
  margin: 0;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  color: #9ca3af;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.close-btn:hover {
  color: #6b7280;
}

.modal-body {
  padding: 1.5rem;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 1.5rem;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
  margin-bottom: 0.375rem;
}

.input {
  width: 100%;
  padding: 0.625rem 0.875rem;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 0.875rem;
  transition: border-color 0.2s;
}

.input:focus {
  outline: none;
  border-color: #2563eb;
}

.token-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.token-input {
  padding-right: 2.5rem;
}

.toggle-visibility {
  position: absolute;
  right: 0.5rem;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0.25rem;
  color: #9ca3af;
}

.toggle-visibility:hover {
  color: #6b7280;
}

.toggle-visibility svg {
  width: 20px;
  height: 20px;
}

.hint {
  display: block;
  font-size: 0.75rem;
  color: #9ca3af;
  margin-top: 0.25rem;
}

.warning-text {
  color: #dc2626;
  font-size: 0.875rem;
  margin-top: 0.5rem;
}
</style>
