<template>
  <RequireAuth>
    <div class="dashboard-view">
      <!-- Header -->
      <header class="page-header">
        <div class="header-content">
          <h1>Dashboard</h1>
          <p>Przegląd integracji i synchronizacji</p>
        </div>
        <div class="header-actions">
          <button class="btn btn-primary" @click="$router.push('/exports/new')">
            <svg class="btn-icon" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
            </svg>
            Nowy eksport
          </button>
        </div>
      </header>

      <!-- Content -->
      <main class="page-content">
        <!-- Quick stats -->
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-icon baselinker">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
              </svg>
            </div>
            <div class="stat-info">
              <span class="stat-value">{{ integrationStatus.baselinker ? 'Połączone' : 'Nie połączone' }}</span>
              <span class="stat-label">BaseLinker</span>
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-icon sheets">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <line x1="3" y1="9" x2="21" y2="9"/>
                <line x1="3" y1="15" x2="21" y2="15"/>
                <line x1="9" y1="3" x2="9" y2="21"/>
              </svg>
            </div>
            <div class="stat-info">
              <span class="stat-value">{{ integrationStatus.sheets ? 'Gotowe' : 'Nie skonfigurowane' }}</span>
              <span class="stat-label">Google Sheets</span>
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-icon exports">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
                <polyline points="13 2 13 9 20 9"/>
              </svg>
            </div>
            <div class="stat-info">
              <span class="stat-value">{{ exportStore.activeExportsCount }}</span>
              <span class="stat-label">Aktywne eksporty</span>
            </div>
          </div>
        </div>

        <!-- Recent exports -->
        <div class="card">
          <div class="card-header">
            <h2>Ostatnie eksporty</h2>
            <router-link to="/exports" class="link">Zobacz wszystkie</router-link>
          </div>

          <div class="card-content">
            <EmptyState
              v-if="!exportStore.hasExports"
              type="exports"
              title="Brak eksportów"
              description="Utwórz swój pierwszy eksport, aby automatycznie synchronizować dane z BaseLinker do Google Sheets."
              actionLabel="Utwórz eksport"
              @action="$router.push('/exports/new')"
            />

            <div v-else class="export-list">
              <div
                v-for="exp in recentExports"
                :key="exp.id"
                class="export-item"
                @click="$router.push(`/exports/${exp.id}`)"
              >
                <div class="export-info">
                  <span class="export-name">{{ exp.name }}</span>
                  <span class="export-type">{{ exp.dataType }}</span>
                </div>
                <div class="export-status" :class="exp.isActive ? 'active' : 'inactive'">
                  {{ exp.isActive ? 'Aktywny' : 'Nieaktywny' }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Onboarding (placeholder for future widget) -->
        <div v-if="!onboardingComplete" class="card onboarding-card">
          <div class="card-header">
            <h2>Pierwsze kroki</h2>
            <button class="dismiss-btn" @click="dismissOnboarding">Zamknij</button>
          </div>
          <div class="card-content">
            <div class="onboarding-steps">
              <div class="step" :class="{ completed: integrationStatus.baselinker }">
                <div class="step-indicator">
                  <span v-if="integrationStatus.baselinker">✓</span>
                  <span v-else>1</span>
                </div>
                <div class="step-info">
                  <span class="step-title">Połącz BaseLinker</span>
                  <span class="step-desc">Dodaj token API z BaseLinker</span>
                </div>
                <button v-if="!integrationStatus.baselinker" class="btn btn-sm" @click="$router.push('/tokens')">
                  Połącz
                </button>
              </div>

              <div class="step" :class="{ completed: exportStore.hasExports }">
                <div class="step-indicator">
                  <span v-if="exportStore.hasExports">✓</span>
                  <span v-else>2</span>
                </div>
                <div class="step-info">
                  <span class="step-title">Utwórz eksport</span>
                  <span class="step-desc">Skonfiguruj automatyczny eksport danych</span>
                </div>
                <button v-if="!exportStore.hasExports" class="btn btn-sm" @click="$router.push('/exports/new')">
                  Utwórz
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  </RequireAuth>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useExportStore } from '../stores/export.js'
import { useCompanyStore } from '../stores/company.js'
import RequireAuth from '../components/RequireAuth.vue'
import EmptyState from '../components/EmptyState.vue'

const exportStore = useExportStore()
const companyStore = useCompanyStore()

// Integration status (will be loaded from API)
const integrationStatus = ref({
  baselinker: false,
  sheets: false
})

// Onboarding state
const onboardingComplete = ref(false)

// Recent exports (last 3)
const recentExports = computed(() => {
  return exportStore.exports.slice(0, 3)
})

// Load data on mount
onMounted(async () => {
  try {
    await Promise.all([
      exportStore.loadExports(),
      companyStore.loadCompanies()
    ])

    // Check onboarding status from localStorage
    onboardingComplete.value = localStorage.getItem('onboardingDismissed') === 'true'

    // TODO: Load real integration status from API
  } catch (error) {
    console.error('Failed to load dashboard data:', error)
  }
})

function dismissOnboarding() {
  onboardingComplete.value = true
  localStorage.setItem('onboardingDismissed', 'true')
}
</script>

<style scoped>
.dashboard-view {
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

.btn-icon {
  width: 18px;
  height: 18px;
}

.page-content {
  padding: 1.5rem 2rem;
  max-width: 1200px;
  margin: 0 auto;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.5rem;
  margin-bottom: 1.5rem;
}

.stat-card {
  background: #ffffff;
  border-radius: 12px;
  padding: 1.5rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.stat-icon svg {
  width: 24px;
  height: 24px;
}

.stat-icon.baselinker {
  background: #dbeafe;
  color: #2563eb;
}

.stat-icon.sheets {
  background: #dcfce7;
  color: #16a34a;
}

.stat-icon.exports {
  background: #fef3c7;
  color: #d97706;
}

.stat-info {
  display: flex;
  flex-direction: column;
}

.stat-value {
  font-size: 1.25rem;
  font-weight: 700;
  color: #111827;
}

.stat-label {
  font-size: 0.875rem;
  color: #6b7280;
}

.card {
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  margin-bottom: 1.5rem;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid #e5e7eb;
}

.card-header h2 {
  font-size: 1rem;
  font-weight: 600;
  color: #111827;
  margin: 0;
}

.link {
  font-size: 0.875rem;
  color: #2563eb;
  text-decoration: none;
}

.link:hover {
  text-decoration: underline;
}

.card-content {
  padding: 1.5rem;
}

.export-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.export-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  background: #f9fafb;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
}

.export-item:hover {
  background: #f3f4f6;
}

.export-info {
  display: flex;
  flex-direction: column;
}

.export-name {
  font-weight: 500;
  color: #111827;
}

.export-type {
  font-size: 0.8125rem;
  color: #6b7280;
}

.export-status {
  font-size: 0.75rem;
  font-weight: 500;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
}

.export-status.active {
  background: #dcfce7;
  color: #16a34a;
}

.export-status.inactive {
  background: #f3f4f6;
  color: #6b7280;
}

.onboarding-card {
  border: 2px dashed #e5e7eb;
}

.dismiss-btn {
  background: none;
  border: none;
  color: #6b7280;
  font-size: 0.875rem;
  cursor: pointer;
}

.dismiss-btn:hover {
  color: #374151;
}

.onboarding-steps {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.step {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: #f9fafb;
  border-radius: 8px;
}

.step.completed {
  background: #dcfce7;
}

.step-indicator {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #e5e7eb;
  color: #6b7280;
  font-weight: 600;
}

.step.completed .step-indicator {
  background: #16a34a;
  color: #ffffff;
}

.step-info {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.step-title {
  font-weight: 500;
  color: #111827;
}

.step-desc {
  font-size: 0.8125rem;
  color: #6b7280;
}
</style>
