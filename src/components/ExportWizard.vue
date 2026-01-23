<template>
  <!-- Full-screen wizard (fills content area next to sidebar) -->
  <div class="flex flex-col min-h-screen bg-gray-50">

    <!-- Sticky Header -->
    <div class="bg-white border-b border-gray-200 sticky top-0 z-10">
      <div class="max-w-4xl mx-auto px-4 md:px-6 py-4">
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-xl font-semibold text-gray-900">
              {{ props.exportId ? 'Edytuj eksport' : 'Nowy eksport' }}
            </h1>
            <p class="text-sm text-gray-500 mt-0.5">{{ steps[currentStep].description }}</p>
          </div>
          <button
            type="button"
            class="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-100 rounded-lg transition-colors"
            @click="cancelWizard"
            title="Zamknij"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <!-- Progress steps -->
        <div class="flex items-center gap-2 mt-4">
          <template v-for="(step, index) in steps" :key="index">
            <button
              type="button"
              class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
              :class="{
                'bg-blue-100 text-blue-700': currentStep === index,
                'text-green-600 hover:bg-green-50': currentStep > index,
                'text-gray-400': currentStep < index
              }"
              :disabled="currentStep < index"
              @click="goToStep(index)"
            >
              <span class="w-6 h-6 rounded-full flex items-center justify-center text-xs border-2"
                :class="{
                  'bg-blue-600 text-white border-blue-600': currentStep === index,
                  'bg-green-500 text-white border-green-500': currentStep > index,
                  'border-gray-300 text-gray-400': currentStep < index
                }"
              >
                <svg v-if="currentStep > index" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                </svg>
                <span v-else>{{ index + 1 }}</span>
              </span>
              <span class="hidden md:inline">{{ step.label }}</span>
            </button>
            <div v-if="index < steps.length - 1" class="w-8 h-0.5 bg-gray-200 hidden sm:block"/>
          </template>
        </div>
      </div>
    </div>

    <!-- Content - scrollable -->
    <div class="flex-1 overflow-y-auto">
      <div class="max-w-4xl mx-auto px-4 md:px-6 py-6">
        <!-- Loading -->
        <div v-if="isLoading" class="flex items-center justify-center py-12">
          <div class="animate-spin rounded-full h-6 w-6 border-2 border-blue-600 border-t-transparent"></div>
          <span class="ml-2 text-sm text-gray-500">Wczytywanie...</span>
        </div>

        <!-- Step 1: Dataset & Fields -->
        <div v-else-if="currentStep === 0" class="space-y-5">
          <!-- Dataset selection -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Typ danych</label>
            <div class="grid grid-cols-2 gap-2">
              <button
                v-for="dataset in availableDatasets"
                :key="dataset.key"
                type="button"
                class="p-3 rounded-lg border text-left transition-all"
                :class="{
                  'border-blue-500 bg-blue-50': config.dataset === dataset.key,
                  'border-gray-200 hover:border-gray-300': config.dataset !== dataset.key && dataset.available,
                  'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed': !dataset.available
                }"
                :disabled="!dataset.available"
                @click="selectDataset(dataset)"
              >
                <div class="font-medium text-gray-900 text-sm">{{ dataset.label }}</div>
                <div class="text-xs text-gray-500 mt-0.5">{{ dataset.description }}</div>
                <span
                  v-if="!dataset.available"
                  class="inline-block mt-1 text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded font-medium"
                >
                  {{ dataset.requiredPlan.toUpperCase() }}
                </span>
              </button>
            </div>
          </div>

          <!-- Fields selection -->
          <div v-if="config.dataset">
            <div class="flex items-center justify-between mb-2">
              <label class="text-sm font-medium text-gray-700">Wybierz pola</label>
              <span class="text-xs text-gray-500">{{ config.selected_fields.length }} wybrano</span>
            </div>

            <!-- Available fields - simple list -->
            <div class="border border-gray-200 rounded-lg max-h-48 overflow-y-auto">
              <label
                v-for="field in currentDatasetFields"
                :key="field.key"
                class="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0"
                :class="{ 'opacity-50': field.locked }"
              >
                <input
                  type="checkbox"
                  :checked="config.selected_fields.includes(field.key)"
                  :disabled="field.locked"
                  class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  @change="toggleField(field)"
                />
                <span class="text-sm text-gray-700 flex-1">{{ field.label }}</span>
                <span v-if="field.locked" class="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">PRO</span>
              </label>
            </div>

            <!-- Selected fields - draggable order -->
            <div v-if="config.selected_fields.length > 0" class="mt-4">
              <label class="text-xs font-medium text-gray-500 mb-2 block">
                Kolejność kolumn (przeciągnij)
              </label>
              <div
                class="flex flex-wrap gap-1.5 p-3 bg-gray-50 rounded-lg border border-dashed border-gray-300 min-h-[60px]"
                @dragover.prevent
                @drop="handleDropOnContainer"
              >
                <div
                  v-for="(fieldKey, index) in config.selected_fields"
                  :key="fieldKey"
                  class="group flex items-center gap-1 pl-2 pr-1 py-1 bg-white border border-gray-200 rounded text-xs cursor-move hover:border-blue-400 transition-colors"
                  draggable="true"
                  @dragstart="dragStart(index, $event)"
                  @dragend="dragEnd"
                  @dragover.prevent
                  @drop.stop="drop(index)"
                >
                  <svg class="w-3 h-3 text-gray-300" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM8 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM8 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM14 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM14 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0z"/>
                  </svg>
                  <span class="text-gray-700">{{ getFieldLabel(fieldKey) }}</span>
                  <button
                    type="button"
                    class="ml-1 p-0.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                    @click="removeField(fieldKey)"
                  >
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                  </button>
                </div>
                <div v-if="config.selected_fields.length === 0" class="text-xs text-gray-400 w-full text-center py-2">
                  Wybierz pola powyżej
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Step 2: Filters -->
        <div v-else-if="currentStep === 1" class="space-y-4">
          <p class="text-sm text-gray-500">
            Opcjonalne - ustaw warunki filtrowania danych.
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
        <div v-else-if="currentStep === 2" class="space-y-4">
          <p class="text-sm text-gray-500">
            Podaj link do arkusza Google Sheets.
          </p>

          <!-- Duplicate URL warning -->
          <div v-if="duplicateSheetWarning" class="p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p class="text-sm text-amber-800">
              Ten arkusz jest już używany w innym eksporcie. Użyj innego arkusza.
            </p>
          </div>

          <SheetConfig
            v-model="config.sheets_config"
            :service-account-email="serviceAccountEmail"
            :max-sheets="maxSheets"
            @url-change="checkDuplicateUrl"
          />
        </div>

        <!-- Step 4: Summary -->
        <div v-else-if="currentStep === 3" class="space-y-4">
          <!-- Export name -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Nazwa eksportu</label>
            <input
              v-model="config.name"
              type="text"
              placeholder="np. Zamówienia dzienne"
              class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            />
          </div>

          <!-- Export description -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Opis (opcjonalny)</label>
            <textarea
              v-model="config.description"
              rows="2"
              placeholder="Krótki opis eksportu..."
              class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none"
            />
          </div>

          <!-- Schedule -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Częstotliwość</label>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="option in scheduleOptions"
                :key="option.value"
                type="button"
                class="px-3 py-1.5 rounded border text-sm font-medium transition-all"
                :class="{
                  'border-blue-500 bg-blue-50 text-blue-700': config.schedule_minutes === option.value,
                  'border-gray-200 text-gray-600 hover:border-gray-300': config.schedule_minutes !== option.value
                }"
                @click="config.schedule_minutes = option.value"
              >
                {{ option.label }}
              </button>
            </div>
          </div>

          <!-- Summary -->
          <div class="bg-gray-50 rounded-lg p-4 text-sm">
            <div class="grid grid-cols-2 gap-2 text-gray-600">
              <div>Typ danych:</div>
              <div class="font-medium text-gray-900">{{ getDatasetLabel(config.dataset) }}</div>
              <div>Pola:</div>
              <div class="font-medium text-gray-900">{{ config.selected_fields.length }}</div>
              <div>Filtry:</div>
              <div class="font-medium text-gray-900">{{ getFilterSummary() }}</div>
              <div>Arkusze:</div>
              <div class="font-medium text-gray-900">{{ config.sheets_config?.length || 1 }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Sticky Footer -->
    <div class="bg-white border-t border-gray-200 sticky bottom-0 z-10">
      <div class="max-w-4xl mx-auto px-4 md:px-6 py-4">
        <div class="flex items-center justify-between">
          <button
            type="button"
            class="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
            @click="cancelWizard"
          >
            Anuluj
          </button>

          <div class="flex items-center gap-3">
            <button
              v-if="currentStep > 0"
              type="button"
              class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              @click="prevStep"
            >
              Wstecz
            </button>
            <button
              v-if="currentStep < steps.length - 1"
              type="button"
              class="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed transition-colors"
              :disabled="!canProceed"
              @click="nextStep"
            >
              Dalej
            </button>
            <button
              v-else
              type="button"
              class="px-5 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:bg-green-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              :disabled="!canSave || isSaving || duplicateSheetWarning"
              @click="saveExport"
            >
              <svg v-if="isSaving" class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
              </svg>
              {{ isSaving ? 'Zapisuję...' : 'Zapisz' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { API } from '../api.js'
import FilterBuilder from './FilterBuilder.vue'
import SheetConfig from './SheetConfig.vue'

const props = defineProps({
  exportId: {
    type: String,
    default: null
  },
  existingExports: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['save', 'cancel'])

// State
const currentStep = ref(0)
const isSaving = ref(false)
const isLoading = ref(true)
const draggedIndex = ref(null)
const duplicateSheetWarning = ref(false)
const fieldsPerDataset = ref({})  // Autozapis pól per dataset: { orders: [...], products: [...] }

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
  description: '',
  dataset: 'orders',
  selected_fields: [],
  filters: {
    logic: 'AND',
    groups: [{ logic: 'AND', conditions: [{ field: '', operator: '', value: '' }] }]
  },
  sheets_config: [{
    sheet_url: '',
    write_mode: 'replace'
  }],
  schedule_minutes: 15,
  status: 'active'
})

// Steps definition
const steps = [
  { label: 'Dane', description: 'Wybierz typ danych i pola' },
  { label: 'Filtry', description: 'Filtrowanie (opcjonalne)' },
  { label: 'Arkusz', description: 'Konfiguracja arkusza' },
  { label: 'Zapisz', description: 'Nazwa i zapis' }
]

const scheduleOptions = [
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 60, label: '1 godz' },
  { value: 360, label: '6 godz' },
  { value: 1440, label: '24 godz' }
]

const datasetDescriptions = {
  orders: 'Zamówienia z BaseLinker',
  products: 'Produkty z magazynu',
  invoices: 'Faktury',
  order_products: 'Produkty w zamówieniach'
}

const serviceAccountEmail = 'live-sales-worker@livesales-483523.iam.gserviceaccount.com'
const maxSheets = 3

// Computed
const availableDatasets = computed(() => {
  const datasets = fieldDefinitions.value?.datasets || {}
  return Object.entries(datasets).map(([key, ds]) => ({
    key,
    label: ds.label,
    available: !ds.locked,
    requiredPlan: ds.requiredPlan || 'basic',
    description: datasetDescriptions[key] || ''
  }))
})

const currentDatasetFields = computed(() => {
  const ds = fieldDefinitions.value?.datasets?.[config.value.dataset]
  return ds?.fields || []
})

const canProceed = computed(() => {
  switch (currentStep.value) {
    case 0:
      return config.value.dataset && config.value.selected_fields.length > 0
    case 1:
      return true // Filters are optional
    case 2:
      return config.value.sheets_config?.some(s => s.sheet_url?.trim()) && !duplicateSheetWarning.value
    default:
      return true
  }
})

const canSave = computed(() => {
  return config.value.name?.trim() &&
         config.value.selected_fields.length > 0 &&
         config.value.sheets_config?.some(s => s.sheet_url?.trim()) &&
         !duplicateSheetWarning.value
})

// Methods
function selectDataset(dataset) {
  if (!dataset.available) return
  if (config.value.dataset !== dataset.key) {
    // Zapisz obecne pola przed zmianą datasetu
    if (config.value.selected_fields.length > 0) {
      fieldsPerDataset.value[config.value.dataset] = [...config.value.selected_fields]
    }

    // Zmień dataset
    config.value.dataset = dataset.key

    // Przywróć zapisane pola dla nowego datasetu lub pusta lista
    config.value.selected_fields = fieldsPerDataset.value[dataset.key] || []
  }
}

function toggleField(field) {
  if (field.locked) return
  const index = config.value.selected_fields.indexOf(field.key)
  if (index === -1) {
    config.value.selected_fields.push(field.key)
  } else {
    config.value.selected_fields.splice(index, 1)
  }
}

function removeField(fieldKey) {
  const index = config.value.selected_fields.indexOf(fieldKey)
  if (index !== -1) {
    config.value.selected_fields.splice(index, 1)
  }
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
  const conditionCount = groups.reduce((acc, g) => {
    const validConditions = g.conditions?.filter(c => c.field && c.operator) || []
    return acc + validConditions.length
  }, 0)
  return conditionCount > 0 ? `${conditionCount} warunków` : 'Brak'
}

// Drag & Drop
function dragStart(index, event) {
  draggedIndex.value = index
  event.dataTransfer.effectAllowed = 'move'
}

function dragEnd() {
  draggedIndex.value = null
}

function drop(targetIndex) {
  if (draggedIndex.value === null || draggedIndex.value === targetIndex) return
  const fields = [...config.value.selected_fields]
  const [moved] = fields.splice(draggedIndex.value, 1)
  fields.splice(targetIndex, 0, moved)
  config.value.selected_fields = fields
  draggedIndex.value = null
}

function handleDropOnContainer() {
  // Drop at end if dropped on container
  if (draggedIndex.value !== null) {
    const fields = [...config.value.selected_fields]
    const [moved] = fields.splice(draggedIndex.value, 1)
    fields.push(moved)
    config.value.selected_fields = fields
    draggedIndex.value = null
  }
}

// URL validation
function checkDuplicateUrl() {
  const currentUrls = config.value.sheets_config
    ?.map(s => s.sheet_url?.trim())
    .filter(Boolean) || []

  // Check against other exports
  const otherUrls = props.existingExports
    .filter(e => e.id !== config.value.id)
    .flatMap(e => e.sheets?.map(s => s.sheet_url) || [])
    .filter(Boolean)

  duplicateSheetWarning.value = currentUrls.some(url => otherUrls.includes(url))
}

// Navigation
function goToStep(index) {
  if (index < currentStep.value) {
    currentStep.value = index
  }
}

function nextStep() {
  if (canProceed.value && currentStep.value < steps.length - 1) {
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
      description: config.value.description,
      dataset: config.value.dataset,
      selectedFields: config.value.selected_fields,
      filters: config.value.filters,
      sheets: config.value.sheets_config?.map(sheet => ({
        sheet_url: sheet.sheet_url,
        write_mode: sheet.write_mode || 'replace'
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
    orderStatuses.value = data || []
  } catch (error) {
    console.error('Failed to load order statuses:', error)
  }
}

async function loadOrderSources() {
  try {
    const data = await API.baselinker.getOrderSources()
    orderSources.value = data || {}
  } catch (error) {
    console.error('Failed to load order sources:', error)
  }
}

async function loadExistingExport() {
  if (!props.exportId) return

  try {
    const exportData = await API.exports.get(props.exportId)
    if (exportData) {
      config.value = {
        id: exportData.id,
        name: exportData.name || 'Nowy eksport',
        description: exportData.description || '',
        dataset: exportData.dataset || 'orders',
        selected_fields: exportData.selected_fields || [],
        filters: exportData.filters || {
          logic: 'AND',
          groups: [{ logic: 'AND', conditions: [{ field: '', operator: '', value: '' }] }]
        },
        sheets_config: exportData.sheets?.map(s => ({
          sheet_url: s.sheet_url || '',
          write_mode: s.write_mode || 'replace'
        })) || [{ sheet_url: '', write_mode: 'replace' }],
        schedule_minutes: exportData.schedule_minutes || 15,
        status: exportData.status || 'active'
      }
    }
  } catch (error) {
    console.error('Failed to load export:', error)
  }
}

// Initialize
onMounted(async () => {
  isLoading.value = true
  try {
    await Promise.all([
      loadFieldDefinitions(),
      loadOrderStatuses(),
      loadOrderSources(),
      loadExistingExport()
    ])
  } finally {
    isLoading.value = false
  }
})
</script>
