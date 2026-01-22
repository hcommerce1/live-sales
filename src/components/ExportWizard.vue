<template>
  <div class="max-w-4xl mx-auto">
    <!-- Header with progress -->
    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">
            {{ props.exportId ? 'Edytuj eksport' : 'Nowy eksport' }}
          </h1>
          <p class="text-gray-500 mt-1">{{ steps[currentStep].description }}</p>
        </div>
        <span class="text-sm text-gray-400">Krok {{ currentStep + 1 }} z {{ steps.length }}</span>
      </div>

      <!-- Progress bar -->
      <div class="flex items-center gap-2">
        <template v-for="(step, index) in steps" :key="index">
          <div
            class="flex items-center gap-2 cursor-pointer"
            @click="goToStep(index)"
          >
            <div
              class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all"
              :class="{
                'bg-blue-600 text-white': currentStep === index,
                'bg-green-500 text-white': currentStep > index,
                'bg-gray-100 text-gray-500': currentStep < index
              }"
            >
              <svg v-if="currentStep > index" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
              </svg>
              <span v-else>{{ index + 1 }}</span>
            </div>
            <span
              class="text-sm font-medium hidden sm:inline"
              :class="{
                'text-blue-600': currentStep === index,
                'text-green-600': currentStep > index,
                'text-gray-400': currentStep < index
              }"
            >{{ step.label }}</span>
          </div>
          <div
            v-if="index < steps.length - 1"
            class="flex-1 h-0.5 mx-2"
            :class="currentStep > index ? 'bg-green-500' : 'bg-gray-200'"
          />
        </template>
      </div>
    </div>

    <!-- Step content -->
    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
      <!-- Loading state -->
      <div v-if="isLoading" class="flex items-center justify-center py-12">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span class="ml-3 text-gray-500">Wczytywanie...</span>
      </div>

      <!-- Step 1: Dataset & Fields -->
      <div v-else-if="currentStep === 0">
        <h2 class="text-lg font-semibold text-gray-900 mb-4">Wybierz dane do eksportu</h2>

        <!-- Dataset cards -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          <button
            v-for="dataset in availableDatasets"
            :key="dataset.key"
            type="button"
            class="flex items-start gap-4 p-4 rounded-xl border-2 text-left transition-all"
            :class="{
              'border-blue-500 bg-blue-50': config.dataset === dataset.key,
              'border-gray-200 hover:border-blue-300 bg-white': config.dataset !== dataset.key && dataset.available,
              'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed': !dataset.available
            }"
            :disabled="!dataset.available"
            @click="selectDataset(dataset)"
          >
            <div class="text-3xl">{{ dataset.icon }}</div>
            <div class="flex-1">
              <div class="font-semibold text-gray-900">{{ dataset.label }}</div>
              <div class="text-sm text-gray-500 mt-0.5">{{ dataset.description }}</div>
            </div>
            <span
              v-if="!dataset.available"
              class="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded-full font-medium"
            >
              {{ dataset.requiredPlan.toUpperCase() }}
            </span>
          </button>
        </div>

        <!-- Fields selection -->
        <div v-if="config.dataset">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-base font-medium text-gray-900">Wybierz pola</h3>
            <span class="text-sm text-gray-500">
              {{ config.selected_fields.length }} wybrano
            </span>
          </div>

          <FieldSelector
            v-model="config.selected_fields"
            :fields="currentDatasetFields"
            :locked-fields="currentDatasetLockedFields"
          />

          <!-- Selected fields preview with drag -->
          <div v-if="config.selected_fields.length > 0" class="mt-6">
            <h4 class="text-sm font-medium text-gray-700 mb-2">
              Kolejność kolumn (przeciągnij aby zmienić)
            </h4>
            <div class="flex flex-wrap gap-2 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div
                v-for="(fieldKey, index) in config.selected_fields"
                :key="fieldKey"
                class="flex items-center gap-1 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm cursor-move hover:border-blue-400 hover:bg-blue-50 transition-colors"
                draggable="true"
                @dragstart="dragStart(index)"
                @dragover.prevent
                @drop="drop(index)"
              >
                <svg class="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8h16M4 16h16"/>
                </svg>
                <span>{{ getFieldLabel(fieldKey) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Step 2: Filters -->
      <div v-else-if="currentStep === 1">
        <h2 class="text-lg font-semibold text-gray-900 mb-2">Filtrowanie danych</h2>
        <p class="text-sm text-gray-500 mb-6">
          Opcjonalne - ustaw warunki, aby eksportować tylko wybrane dane.
        </p>

        <FilterBuilder
          v-model="config.filters"
          :fields="currentDatasetFields"
          :operators="fieldDefinitions.operators || []"
          :order-statuses="orderStatuses"
          :order-sources="orderSources"
        />
      </div>

      <!-- Step 3: Target Sheets -->
      <div v-else-if="currentStep === 2">
        <h2 class="text-lg font-semibold text-gray-900 mb-2">Arkusze Google Sheets</h2>
        <p class="text-sm text-gray-500 mb-6">
          Podaj link do arkusza Google Sheets, do którego mają trafiać dane.
        </p>

        <SheetConfig
          v-model="config.sheets_config"
          :service-account-email="serviceAccountEmail"
          :max-sheets="maxSheets"
        />
      </div>

      <!-- Step 4: Summary -->
      <div v-else-if="currentStep === 3">
        <h2 class="text-lg font-semibold text-gray-900 mb-6">Podsumowanie</h2>

        <!-- Export name -->
        <div class="mb-6">
          <label class="block text-sm font-medium text-gray-700 mb-2">
            Nazwa eksportu
          </label>
          <input
            v-model="config.name"
            type="text"
            placeholder="np. Zamówienia dzienne"
            class="w-full px-4 py-3 border border-gray-200 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
          />
        </div>

        <!-- Schedule -->
        <div class="mb-6">
          <label class="block text-sm font-medium text-gray-700 mb-2">
            Częstotliwość aktualizacji
          </label>
          <div class="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <button
              v-for="option in scheduleOptions"
              :key="option.value"
              type="button"
              class="px-4 py-2.5 rounded-lg border text-sm font-medium transition-all"
              :class="{
                'border-blue-500 bg-blue-50 text-blue-700': config.schedule_minutes === option.value,
                'border-gray-200 bg-white text-gray-700 hover:border-blue-300': config.schedule_minutes !== option.value
              }"
              @click="config.schedule_minutes = option.value"
            >
              {{ option.label }}
            </button>
          </div>
        </div>

        <!-- Summary card -->
        <div class="bg-gray-50 rounded-xl p-6 border border-gray-200">
          <h3 class="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">
            Przegląd konfiguracji
          </h3>
          <div class="grid grid-cols-2 gap-4">
            <div class="flex justify-between py-2 border-b border-gray-200">
              <span class="text-gray-600">Dane:</span>
              <span class="font-medium text-gray-900">{{ getDatasetLabel(config.dataset) }}</span>
            </div>
            <div class="flex justify-between py-2 border-b border-gray-200">
              <span class="text-gray-600">Pola:</span>
              <span class="font-medium text-gray-900">{{ config.selected_fields.length }}</span>
            </div>
            <div class="flex justify-between py-2 border-b border-gray-200">
              <span class="text-gray-600">Filtry:</span>
              <span class="font-medium text-gray-900">{{ getFilterSummary() }}</span>
            </div>
            <div class="flex justify-between py-2 border-b border-gray-200">
              <span class="text-gray-600">Arkusze:</span>
              <span class="font-medium text-gray-900">{{ config.sheets_config?.length || 1 }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Navigation -->
    <div class="flex items-center justify-between">
      <button
        type="button"
        class="px-5 py-2.5 text-red-600 hover:text-red-700 font-medium transition-colors"
        @click="cancelWizard"
      >
        Anuluj
      </button>

      <div class="flex items-center gap-3">
        <button
          v-if="currentStep > 0"
          type="button"
          class="px-5 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
          @click="prevStep"
        >
          Wstecz
        </button>
        <button
          v-if="currentStep < steps.length - 1"
          type="button"
          class="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed transition-colors"
          :disabled="!canProceed"
          @click="nextStep"
        >
          Dalej
        </button>
        <button
          v-else
          type="button"
          class="px-6 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:bg-green-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          :disabled="!canSave || isSaving"
          @click="saveExport"
        >
          <svg v-if="isSaving" class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
          </svg>
          {{ isSaving ? 'Zapisuję...' : 'Zapisz eksport' }}
        </button>
      </div>
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
const draggedIndex = ref(null)

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

// Steps definition (4 steps now)
const steps = [
  { label: 'Dane', description: 'Wybierz dane i pola do eksportu' },
  { label: 'Filtry', description: 'Ustaw warunki filtrowania (opcjonalne)' },
  { label: 'Arkusz', description: 'Skonfiguruj arkusz Google Sheets' },
  { label: 'Zapisz', description: 'Nazwij eksport i zapisz' }
]

const scheduleOptions = [
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 60, label: '1 godz' },
  { value: 360, label: '6 godz' },
  { value: 1440, label: '24 godz' }
]

const datasetIcons = {
  orders: '📦',
  products: '🏷️',
  invoices: '📄',
  order_products: '📋'
}

const datasetDescriptions = {
  orders: 'Eksportuj dane zamówień',
  products: 'Eksportuj produkty z magazynu',
  invoices: 'Eksportuj faktury',
  order_products: 'Produkty z zamówień (wiersz = produkt)'
}

const serviceAccountEmail = 'live-sales@live-sales-app.iam.gserviceaccount.com'
const maxSheets = 3

// Computed
const availableDatasets = computed(() => {
  const datasets = fieldDefinitions.value?.datasets || {}
  return Object.entries(datasets).map(([key, ds]) => ({
    key,
    label: ds.label,
    available: !ds.locked,
    requiredPlan: ds.requiredPlan || 'basic',
    icon: datasetIcons[key] || '📊',
    description: datasetDescriptions[key] || ds.description || ''
  }))
})

const currentDatasetFields = computed(() => {
  const ds = fieldDefinitions.value?.datasets?.[config.value.dataset]
  return ds?.fields || []
})

const currentDatasetLockedFields = computed(() => {
  return currentDatasetFields.value.filter(f => f.locked).map(f => f.key)
})

const canProceed = computed(() => {
  switch (currentStep.value) {
    case 0: // Dataset & Fields
      return config.value.dataset && config.value.selected_fields.length > 0
    case 1: // Filters (always can proceed)
      return true
    case 2: // Sheets
      const sheets = config.value.sheets_config || []
      return sheets.length > 0 && sheets.every(s => s.sheet_url && s.sheet_url.includes('docs.google.com'))
    default:
      return true
  }
})

const canSave = computed(() => {
  return config.value.name && config.value.name.trim() !== '' && canProceed.value
})

// Methods
function selectDataset(dataset) {
  if (!dataset.available) return
  config.value.dataset = dataset.key
  config.value.selected_fields = []
}

function getFieldLabel(fieldKey) {
  const field = currentDatasetFields.value.find(f => f.key === fieldKey)
  return field?.label || fieldKey
}

function getDatasetLabel(datasetKey) {
  const ds = fieldDefinitions.value?.datasets?.[datasetKey]
  return ds?.label || datasetKey
}

function getFilterSummary() {
  const groups = config.value.filters?.groups || []
  const validConditions = groups.flatMap(g => g.conditions || [])
    .filter(c => c.field && c.operator)
  return validConditions.length > 0 ? `${validConditions.length} warunek(ów)` : 'Brak'
}

function getScheduleLabel(minutes) {
  const option = scheduleOptions.find(o => o.value === minutes)
  return option?.label || `${minutes} min`
}

// Drag & Drop for field ordering
function dragStart(index) {
  draggedIndex.value = index
}

function drop(targetIndex) {
  if (draggedIndex.value === null || draggedIndex.value === targetIndex) return

  const fields = [...config.value.selected_fields]
  const [removed] = fields.splice(draggedIndex.value, 1)
  fields.splice(targetIndex, 0, removed)
  config.value.selected_fields = fields
  draggedIndex.value = null
}

// Navigation
function goToStep(index) {
  // Only allow going to completed steps or current+1
  if (index <= currentStep.value || (index === currentStep.value + 1 && canProceed.value)) {
    currentStep.value = index
  }
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

// Load data
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

  if (props.exportId) {
    await loadExportForEditing(props.exportId)
  }

  isLoading.value = false
})
</script>
