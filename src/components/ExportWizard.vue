<template>
  <div class="export-wizard">
    <!-- Progress steps -->
    <div class="wizard-progress">
      <div
        v-for="(step, index) in steps"
        :key="index"
        class="step"
        :class="{
          active: currentStep === index,
          completed: currentStep > index
        }"
      >
        <div class="step-number">
          <span v-if="currentStep > index">✓</span>
          <span v-else>{{ index + 1 }}</span>
        </div>
        <span class="step-label">{{ step.label }}</span>
      </div>
    </div>

    <!-- Step content -->
    <div class="wizard-content">
      <!-- Step 1: Dataset & Fields -->
      <div v-if="currentStep === 0" class="step-content">
        <h2>Wybierz dane i pola</h2>
        <p class="step-description">Wybierz źródło danych oraz pola, które chcesz eksportować.</p>

        <!-- Dataset selector -->
        <div class="dataset-selector">
          <div
            v-for="dataset in availableDatasets"
            :key="dataset.key"
            class="dataset-option"
            :class="{
              selected: config.dataset === dataset.key,
              locked: !dataset.available
            }"
            @click="selectDataset(dataset)"
          >
            <div class="dataset-icon">{{ dataset.icon }}</div>
            <div class="dataset-info">
              <strong>{{ dataset.label }}</strong>
              <span class="dataset-desc">{{ dataset.description }}</span>
            </div>
            <span v-if="!dataset.available" class="dataset-lock">
              🔒 {{ dataset.requiredPlan.toUpperCase() }}
            </span>
          </div>
        </div>

        <!-- Field selector -->
        <div v-if="config.dataset" class="fields-section">
          <h3>Wybierz pola do eksportu</h3>
          <FieldSelector
            v-model="config.selected_fields"
            :fields="currentDatasetFields"
            :locked-fields="currentDatasetLockedFields"
          />
        </div>
      </div>

      <!-- Step 2: Field Order -->
      <div v-if="currentStep === 1" class="step-content">
        <h2>Kolejność pól</h2>
        <p class="step-description">Przeciągnij pola, aby ustalić kolejność kolumn w arkuszu.</p>

        <div class="field-order-preview">
          <h4>Nagłówki kolumn:</h4>
          <div class="headers-preview">
            <span
              v-for="(fieldKey, index) in config.selected_fields"
              :key="fieldKey"
              class="header-cell"
            >
              {{ getFieldLabel(fieldKey) }}
            </span>
          </div>
        </div>

        <FieldSelector
          v-model="config.selected_fields"
          :fields="currentDatasetFields"
          :locked-fields="[]"
        />
      </div>

      <!-- Step 3: Filters -->
      <div v-if="currentStep === 2" class="step-content">
        <h2>Filtry</h2>
        <p class="step-description">Ustaw warunki filtrowania danych. Możesz łączyć wiele warunków za pomocą ORAZ/LUB.</p>

        <FilterBuilder
          v-model="config.filters"
          :fields="currentDatasetFields"
          :operators="fieldDefinitions.operators || []"
          :order-statuses="orderStatuses"
          :order-sources="orderSources"
        />
      </div>

      <!-- Step 4: Target Sheets -->
      <div v-if="currentStep === 3" class="step-content">
        <h2>Arkusze docelowe</h2>
        <p class="step-description">Skonfiguruj arkusze Google Sheets, do których będą eksportowane dane.</p>

        <SheetConfig
          v-model="config.sheets_config"
          :service-account-email="serviceAccountEmail"
          :max-sheets="maxSheets"
        />
      </div>

      <!-- Step 5: Schedule & Summary -->
      <div v-if="currentStep === 4" class="step-content">
        <h2>Harmonogram i podsumowanie</h2>
        <p class="step-description">Nazwij eksport, ustaw harmonogram i sprawdź podsumowanie.</p>

        <!-- Export name -->
        <div class="form-group">
          <label>Nazwa eksportu</label>
          <input
            v-model="config.name"
            type="text"
            placeholder="np. Zamówienia dzienne"
            class="name-input"
          />
        </div>

        <!-- Schedule -->
        <div class="form-group">
          <label>Częstotliwość eksportu</label>
          <div class="schedule-options">
            <label
              v-for="option in scheduleOptions"
              :key="option.value"
              class="schedule-option"
              :class="{ selected: config.schedule_minutes === option.value }"
            >
              <input
                type="radio"
                v-model="config.schedule_minutes"
                :value="option.value"
              />
              <span>{{ option.label }}</span>
            </label>
          </div>
        </div>

        <!-- Summary -->
        <div class="summary-section">
          <h3>Podsumowanie konfiguracji</h3>
          <div class="summary-grid">
            <div class="summary-item">
              <span class="summary-label">Źródło danych:</span>
              <span class="summary-value">{{ getDatasetLabel(config.dataset) }}</span>
            </div>
            <div class="summary-item">
              <span class="summary-label">Liczba pól:</span>
              <span class="summary-value">{{ config.selected_fields.length }}</span>
            </div>
            <div class="summary-item">
              <span class="summary-label">Filtry:</span>
              <span class="summary-value">{{ getFilterSummary() }}</span>
            </div>
            <div class="summary-item">
              <span class="summary-label">Arkusze docelowe:</span>
              <span class="summary-value">{{ config.sheets_config?.length || 1 }}</span>
            </div>
            <div class="summary-item">
              <span class="summary-label">Harmonogram:</span>
              <span class="summary-value">{{ getScheduleLabel(config.schedule_minutes) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Navigation buttons -->
    <div class="wizard-navigation">
      <button
        class="btn-cancel"
        @click="cancelWizard"
      >
        Anuluj
      </button>
      <button
        v-if="currentStep > 0"
        class="btn-secondary"
        @click="prevStep"
      >
        ← Wstecz
      </button>
      <div class="nav-spacer"></div>
      <button
        v-if="currentStep < steps.length - 1"
        class="btn-primary"
        :disabled="!canProceed"
        @click="nextStep"
      >
        Dalej →
      </button>
      <button
        v-else
        class="btn-success"
        :disabled="!canSave || isSaving"
        @click="saveExport"
      >
        {{ isSaving ? 'Zapisuję...' : 'Zapisz eksport' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { API } from '../api.js'
import FieldSelector from './FieldSelector.vue'
import FilterBuilder from './FilterBuilder.vue'
import SheetConfig from './SheetConfig.vue'

const props = defineProps({
  exportId: {
    type: String,
    default: null
  }
})

const emit = defineEmits(['save', 'cancel'])

// State
const currentStep = ref(0)
const isSaving = ref(false)
const isLoading = ref(true)

// Field definitions from backend
const fieldDefinitions = ref({
  operators: [],
  datasets: {}
})

// Dynamic data from BaseLinker
const orderStatuses = ref([])
const orderSources = ref({})

// Configuration
const config = ref({
  id: null,
  name: 'Nowy eksport',
  dataset: 'orders',
  selected_fields: [],
  filters: {
    logic: 'AND',
    groups: [{ logic: 'AND', conditions: [{ field: '', operator: '', value: '' }] }]
  },
  sheets_config: [{
    sheet_url: '',
    sheet_name: '',
    write_mode: 'append'
  }],
  schedule_minutes: 15,
  status: 'active'
})

// Constants
const steps = [
  { label: 'Dane i pola' },
  { label: 'Kolejność' },
  { label: 'Filtry' },
  { label: 'Arkusze' },
  { label: 'Podsumowanie' }
]

const scheduleOptions = [
  { value: 15, label: 'Co 15 minut' },
  { value: 30, label: 'Co 30 minut' },
  { value: 60, label: 'Co godzinę' },
  { value: 360, label: 'Co 6 godzin' },
  { value: 1440, label: 'Raz dziennie' }
]

const datasetIcons = {
  orders: '📦',
  products: '🏷️',
  invoices: '📄',
  order_products: '📋'
}

const datasetDescriptions = {
  orders: 'Eksportuj dane zamówień z BaseLinker',
  products: 'Eksportuj produkty z magazynu',
  invoices: 'Eksportuj faktury z BaseLinker',
  order_products: 'Eksportuj produkty z zamówień (jeden wiersz = jeden produkt)'
}

const serviceAccountEmail = 'live-sales@live-sales-app.iam.gserviceaccount.com'
const maxSheets = 3

// Computed
const availableDatasets = computed(() => {
  const datasets = []
  for (const [key, dataset] of Object.entries(fieldDefinitions.value.datasets || {})) {
    datasets.push({
      key,
      label: dataset.label,
      available: dataset.available,
      requiredPlan: dataset.requiredPlan,
      icon: datasetIcons[key] || '📊',
      description: datasetDescriptions[key] || ''
    })
  }
  return datasets
})

const currentDatasetFields = computed(() => {
  const dataset = fieldDefinitions.value.datasets?.[config.value.dataset]
  return dataset?.fields || []
})

const currentDatasetLockedFields = computed(() => {
  const dataset = fieldDefinitions.value.datasets?.[config.value.dataset]
  return dataset?.lockedFields || []
})

const canProceed = computed(() => {
  switch (currentStep.value) {
    case 0: // Dataset & Fields
      return config.value.dataset && config.value.selected_fields.length > 0
    case 1: // Field Order
      return config.value.selected_fields.length > 0
    case 2: // Filters
      return true // Filters are optional
    case 3: // Sheets
      return config.value.sheets_config?.every(s => s.sheet_url && s.urlStatus === 'valid')
    case 4: // Summary
      return config.value.name.trim().length > 0
    default:
      return true
  }
})

const canSave = computed(() => {
  return config.value.name.trim().length > 0 &&
         config.value.dataset &&
         config.value.selected_fields.length > 0 &&
         config.value.sheets_config?.length > 0 &&
         config.value.sheets_config.every(s => s.sheet_url)
})

// Methods
function selectDataset(dataset) {
  if (!dataset.available) return

  config.value.dataset = dataset.key
  config.value.selected_fields = []
  config.value.filters = {
    logic: 'AND',
    groups: [{ logic: 'AND', conditions: [{ field: '', operator: '', value: '' }] }]
  }
}

function getFieldLabel(fieldKey) {
  const field = currentDatasetFields.value.find(f => f.key === fieldKey)
  return field?.label || fieldKey
}

function getDatasetLabel(datasetKey) {
  const dataset = availableDatasets.value.find(d => d.key === datasetKey)
  return dataset?.label || datasetKey
}

function getFilterSummary() {
  const groups = config.value.filters?.groups || []
  const conditions = groups.reduce((sum, g) => sum + (g.conditions?.length || 0), 0)
  if (conditions === 0 || (conditions === 1 && !groups[0]?.conditions?.[0]?.field)) {
    return 'Brak filtrów'
  }
  return `${conditions} warunków w ${groups.length} grupach`
}

function getScheduleLabel(minutes) {
  const option = scheduleOptions.find(o => o.value === minutes)
  return option?.label || `Co ${minutes} minut`
}

function nextStep() {
  if (currentStep.value < steps.length - 1 && canProceed.value) {
    currentStep.value++
  }
}

function prevStep() {
  if (currentStep.value > 0) {
    currentStep.value--
  }
}

function cancelWizard() {
  emit('cancel')
}

async function saveExport() {
  if (!canSave.value || isSaving.value) return

  isSaving.value = true
  try {
    // Format config for API
    const exportData = {
      id: config.value.id,
      name: config.value.name,
      dataset: config.value.dataset,
      selectedFields: config.value.selected_fields,
      filters: config.value.filters,
      sheets: config.value.sheets_config?.map(sheet => ({
        sheet_url: sheet.sheet_url,
        sheet_name: sheet.sheet_name || null,
        write_mode: sheet.write_mode || 'append'
      })) || [],
      scheduleMinutes: config.value.schedule_minutes,
      status: config.value.status || 'active'
    }

    emit('save', exportData)
  } finally {
    isSaving.value = false
  }
}

// Load field definitions from backend
async function loadFieldDefinitions() {
  try {
    const data = await API.exports.getFieldDefinitions()
    if (data) {
      fieldDefinitions.value = data
    }
  } catch (error) {
    console.error('Failed to load field definitions:', error)
  }
}

// Load order statuses
async function loadOrderStatuses() {
  try {
    const data = await API.baselinker.getOrderStatuses()
    if (data) {
      orderStatuses.value = data
    }
  } catch (error) {
    console.error('Failed to load order statuses:', error)
  }
}

// Load order sources
async function loadOrderSources() {
  try {
    const data = await API.baselinker.getOrderSources()
    if (data) {
      orderSources.value = data
    }
  } catch (error) {
    console.error('Failed to load order sources:', error)
  }
}

// Load existing export for editing
async function loadExportForEditing(exportId) {
  try {
    const exportData = await API.exports.get(exportId)
    if (exportData) {
      config.value = {
        id: exportData.id,
        name: exportData.name,
        dataset: exportData.dataset,
        selected_fields: exportData.selected_fields || [],
        filters: exportData.filters || {
          logic: 'AND',
          groups: [{ logic: 'AND', conditions: [{ field: '', operator: '', value: '' }] }]
        },
        sheets_config: exportData.sheets?.length > 0 ? exportData.sheets : [{
          sheet_url: exportData.sheets?.sheet_url || '',
          sheet_name: '',
          write_mode: exportData.sheets?.write_mode || 'append'
        }],
        schedule_minutes: exportData.schedule_minutes || 15,
        status: exportData.status || 'active'
      }
    }
  } catch (error) {
    console.error('Failed to load export for editing:', error)
  }
}

// Initialize
onMounted(async () => {
  await Promise.all([
    loadFieldDefinitions(),
    loadOrderStatuses(),
    loadOrderSources()
  ])

  // If editing existing export, load its config
  if (props.exportId) {
    await loadExportForEditing(props.exportId)
  }

  isLoading.value = false
})
</script>

<style scoped>
.export-wizard {
  display: flex;
  flex-direction: column;
  gap: 2rem;
  max-width: 900px;
  margin: 0 auto;
}

/* Progress Steps */
.wizard-progress {
  display: flex;
  justify-content: space-between;
  padding: 0 1rem;
}

.step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  position: relative;
}

.step:not(:last-child)::after {
  content: '';
  position: absolute;
  top: 15px;
  left: calc(50% + 20px);
  width: calc(100% - 40px);
  height: 2px;
  background: #e5e7eb;
}

.step.completed:not(:last-child)::after {
  background: #6366f1;
}

.step-number {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #e5e7eb;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.9rem;
  font-weight: 600;
  color: #6b7280;
  position: relative;
  z-index: 1;
}

.step.active .step-number {
  background: #6366f1;
  color: white;
}

.step.completed .step-number {
  background: #10b981;
  color: white;
}

.step-label {
  font-size: 0.8rem;
  color: #6b7280;
  text-align: center;
}

.step.active .step-label {
  color: #374151;
  font-weight: 500;
}

/* Content */
.wizard-content {
  background: white;
  border-radius: 16px;
  padding: 2rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.step-content h2 {
  margin: 0 0 0.5rem 0;
  font-size: 1.5rem;
  color: #111827;
}

.step-description {
  color: #6b7280;
  margin: 0 0 1.5rem 0;
}

/* Dataset Selector */
.dataset-selector {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
  margin-bottom: 2rem;
}

.dataset-option {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.25rem;
  background: #f9fafb;
  border: 2px solid #e5e7eb;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.dataset-option:hover {
  border-color: #6366f1;
}

.dataset-option.selected {
  background: #eef2ff;
  border-color: #6366f1;
}

.dataset-option.locked {
  opacity: 0.6;
  cursor: not-allowed;
}

.dataset-icon {
  font-size: 2rem;
}

.dataset-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.dataset-info strong {
  font-size: 1rem;
}

.dataset-desc {
  font-size: 0.8rem;
  color: #6b7280;
}

.dataset-lock {
  font-size: 0.75rem;
  padding: 0.25rem 0.5rem;
  background: #fef3c7;
  color: #92400e;
  border-radius: 4px;
}

/* Fields section */
.fields-section h3 {
  margin: 0 0 1rem 0;
  font-size: 1.1rem;
  color: #374151;
}

/* Field order preview */
.field-order-preview {
  margin-bottom: 1.5rem;
}

.field-order-preview h4 {
  margin: 0 0 0.75rem 0;
  font-size: 0.9rem;
  color: #6b7280;
}

.headers-preview {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  padding: 1rem;
  background: #f3f4f6;
  border-radius: 8px;
}

.header-cell {
  padding: 0.375rem 0.75rem;
  background: white;
  border-radius: 4px;
  font-size: 0.85rem;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

/* Form groups */
.form-group {
  margin-bottom: 1.5rem;
}

.form-group label {
  display: block;
  font-size: 0.9rem;
  font-weight: 500;
  color: #374151;
  margin-bottom: 0.5rem;
}

.name-input {
  width: 100%;
  padding: 0.75rem 1rem;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 1rem;
}

.name-input:focus {
  outline: none;
  border-color: #6366f1;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
}

/* Schedule options */
.schedule-options {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.schedule-option {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1rem;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.schedule-option:hover {
  border-color: #6366f1;
}

.schedule-option.selected {
  background: #eef2ff;
  border-color: #6366f1;
}

.schedule-option input {
  display: none;
}

/* Summary */
.summary-section {
  margin-top: 2rem;
  padding-top: 1.5rem;
  border-top: 1px solid #e5e7eb;
}

.summary-section h3 {
  margin: 0 0 1rem 0;
  font-size: 1.1rem;
  color: #374151;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
}

.summary-item {
  display: flex;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background: #f9fafb;
  border-radius: 8px;
}

.summary-label {
  color: #6b7280;
  font-size: 0.9rem;
}

.summary-value {
  font-weight: 500;
  color: #374151;
}

/* Navigation */
.wizard-navigation {
  display: flex;
  align-items: center;
  padding-top: 1rem;
  border-top: 1px solid #e5e7eb;
}

.nav-spacer {
  flex: 1;
}

.btn-primary,
.btn-secondary,
.btn-success,
.btn-cancel {
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-cancel {
  background: white;
  color: #ef4444;
  border: 1px solid #fecaca;
}

.btn-cancel:hover {
  background: #fef2f2;
  border-color: #ef4444;
}

.btn-primary {
  background: #6366f1;
  color: white;
  border: none;
}

.btn-primary:hover:not(:disabled) {
  background: #4f46e5;
}

.btn-primary:disabled {
  background: #c7d2fe;
  cursor: not-allowed;
}

.btn-secondary {
  background: white;
  color: #374151;
  border: 1px solid #e5e7eb;
}

.btn-secondary:hover {
  background: #f3f4f6;
}

.btn-success {
  background: #10b981;
  color: white;
  border: none;
}

.btn-success:hover:not(:disabled) {
  background: #059669;
}

.btn-success:disabled {
  background: #6ee7b7;
  cursor: not-allowed;
}
</style>
