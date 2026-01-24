<template>
  <RequireAuth>
    <div class="exports-view">
      <!-- Header -->
      <header class="page-header">
        <div class="header-content">
          <h1>Eksporty</h1>
          <p>Zarządzaj automatycznymi eksportami danych</p>
        </div>
        <div class="header-actions">
          <button class="btn btn-primary" @click="showWizard = true">
            <svg class="btn-icon" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
            </svg>
            Nowy eksport
          </button>
        </div>
      </header>

      <!-- Content -->
      <main class="page-content">
        <!-- Loading state -->
        <div v-if="isLoading" class="loading-state">
          <div class="loading-spinner"></div>
          <p>Wczytywanie eksportów...</p>
        </div>

        <!-- Empty state -->
        <EmptyState
          v-else-if="!exportStore.hasExports"
          type="exports"
          title="Brak eksportów"
          description="Utwórz swój pierwszy eksport, aby automatycznie synchronizować dane z BaseLinker do Google Sheets."
          actionLabel="Utwórz eksport"
          @action="showWizard = true"
        />

        <!-- Exports list -->
        <div v-else class="exports-list">
          <div
            v-for="exp in exportStore.exports"
            :key="exp.id"
            class="export-card"
          >
            <div class="export-header">
              <div class="export-info">
                <h3 class="export-name">{{ exp.name }}</h3>
                <span class="export-type">{{ getDataTypeLabel(exp.dataType) }}</span>
              </div>
              <div class="export-status" :class="exp.isActive ? 'active' : 'inactive'">
                {{ exp.isActive ? 'Aktywny' : 'Nieaktywny' }}
              </div>
            </div>

            <div class="export-details">
              <div class="detail-item">
                <span class="detail-label">Harmonogram</span>
                <span class="detail-value">Co {{ exp.scheduleMinutes }} min</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Ostatnie uruchomienie</span>
                <span class="detail-value">{{ formatLastRun(exp.lastRunAt) }}</span>
              </div>
            </div>

            <div class="export-actions">
              <button class="btn btn-sm" @click="runExport(exp.id)" :disabled="runningExport === exp.id">
                {{ runningExport === exp.id ? 'Uruchamianie...' : 'Uruchom' }}
              </button>
              <button class="btn btn-sm" @click="editExport(exp.id)">
                Edytuj
              </button>
              <button class="btn btn-sm btn-danger" @click="confirmDelete(exp)">
                Usuń
              </button>
            </div>
          </div>
        </div>
      </main>

      <!-- Export Wizard Modal -->
      <Teleport to="body">
        <div v-if="showWizard" class="modal-overlay" @click.self="showWizard = false">
          <div class="modal-content wizard-modal">
            <div class="modal-header">
              <h2>{{ editingExportId ? 'Edytuj eksport' : 'Nowy eksport' }}</h2>
              <button class="close-btn" @click="showWizard = false">&times;</button>
            </div>
            <div class="modal-body">
              <!-- Wizard component will be integrated here -->
              <p class="placeholder-text">Kreator eksportów (do zintegrowania)</p>
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
              <p>Czy na pewno chcesz usunąć eksport <strong>{{ deleteConfirm.name }}</strong>?</p>
              <p class="warning-text">Ta operacja jest nieodwracalna.</p>
            </div>
            <div class="modal-actions">
              <button class="btn btn-sm" @click="deleteConfirm = null">Anuluj</button>
              <button class="btn btn-sm btn-danger" @click="deleteExport" :disabled="isDeleting">
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
import { ref, onMounted, defineProps } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useExportStore } from '../stores/export.js'
import RequireAuth from '../components/RequireAuth.vue'
import EmptyState from '../components/EmptyState.vue'

// Props from router
const props = defineProps({
  showWizard: Boolean,
  id: String
})

const route = useRoute()
const router = useRouter()
const exportStore = useExportStore()

// Local state
const isLoading = ref(false)
const showWizard = ref(props.showWizard || false)
const editingExportId = ref(props.id || null)
const runningExport = ref(null)
const deleteConfirm = ref(null)
const isDeleting = ref(false)

// Data type labels
const dataTypeLabels = {
  orders: 'Zamówienia',
  products: 'Produkty',
  order_items: 'Pozycje zamówień',
  returns: 'Zwroty',
  return_items: 'Pozycje zwrotów'
}

function getDataTypeLabel(type) {
  return dataTypeLabels[type] || type
}

function formatLastRun(date) {
  if (!date) return 'Nigdy'
  const d = new Date(date)
  return d.toLocaleString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

async function runExport(id) {
  runningExport.value = id
  try {
    await exportStore.runExport(id)
  } catch (error) {
    console.error('Failed to run export:', error)
  } finally {
    runningExport.value = null
  }
}

function editExport(id) {
  editingExportId.value = id
  showWizard.value = true
}

function confirmDelete(exp) {
  deleteConfirm.value = exp
}

async function deleteExport() {
  if (!deleteConfirm.value) return

  isDeleting.value = true
  try {
    await exportStore.deleteExport(deleteConfirm.value.id)
    deleteConfirm.value = null
  } catch (error) {
    console.error('Failed to delete export:', error)
  } finally {
    isDeleting.value = false
  }
}

// Load data on mount
onMounted(async () => {
  isLoading.value = true
  try {
    await exportStore.loadExports()

    // Check if we should open wizard for specific export
    if (route.params.id) {
      editingExportId.value = route.params.id
      showWizard.value = true
    } else if (route.name === 'export-new') {
      showWizard.value = true
    }
  } catch (error) {
    console.error('Failed to load exports:', error)
  } finally {
    isLoading.value = false
  }
})
</script>

<style scoped>
.exports-view {
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
  max-width: 1200px;
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

.exports-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.export-card {
  background: #ffffff;
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.export-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1rem;
}

.export-name {
  font-size: 1.125rem;
  font-weight: 600;
  color: #111827;
  margin: 0 0 0.25rem 0;
}

.export-type {
  font-size: 0.8125rem;
  color: #6b7280;
}

.export-status {
  font-size: 0.75rem;
  font-weight: 500;
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
}

.export-status.active {
  background: #dcfce7;
  color: #16a34a;
}

.export-status.inactive {
  background: #f3f4f6;
  color: #6b7280;
}

.export-details {
  display: flex;
  gap: 2rem;
  padding: 1rem 0;
  border-top: 1px solid #f3f4f6;
  border-bottom: 1px solid #f3f4f6;
  margin-bottom: 1rem;
}

.detail-item {
  display: flex;
  flex-direction: column;
}

.detail-label {
  font-size: 0.75rem;
  color: #9ca3af;
  margin-bottom: 0.25rem;
}

.detail-value {
  font-size: 0.875rem;
  color: #374151;
  font-weight: 500;
}

.export-actions {
  display: flex;
  gap: 0.5rem;
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
  max-height: 90vh;
  overflow-y: auto;
}

.wizard-modal {
  width: 90%;
  max-width: 800px;
}

.confirm-modal {
  width: 90%;
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
  padding: 1rem 1.5rem;
  border-top: 1px solid #e5e7eb;
}

.placeholder-text {
  text-align: center;
  color: #9ca3af;
  padding: 2rem;
}

.warning-text {
  color: #dc2626;
  font-size: 0.875rem;
  margin-top: 0.5rem;
}
</style>
