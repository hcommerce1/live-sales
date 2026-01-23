<template>
  <!-- Variant C: Accordion Groups with Search -->
  <div class="h-full flex gap-6">
    <!-- Left: Dataset + Search -->
    <div class="w-80 flex-shrink-0 flex flex-col gap-4">
      <!-- Dataset as radio cards -->
      <div>
        <label class="text-sm font-medium text-gray-700 mb-2 block">Typ danych</label>
        <div class="space-y-2">
          <label
            v-for="dataset in availableDatasets"
            :key="dataset.key"
            class="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all"
            :class="{
              'border-blue-500 bg-blue-50': selectedDataset === dataset.key,
              'border-gray-200 hover:border-gray-300': selectedDataset !== dataset.key && dataset.available,
              'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed': !dataset.available
            }"
          >
            <input
              type="radio"
              :value="dataset.key"
              :checked="selectedDataset === dataset.key"
              :disabled="!dataset.available"
              class="w-4 h-4 text-blue-600"
              @change="selectDataset(dataset)"
            />
            <div class="flex-1">
              <div class="font-medium text-gray-900 text-sm">{{ dataset.label }}</div>
              <div class="text-xs text-gray-500">{{ dataset.description }}</div>
            </div>
            <span v-if="!dataset.available" class="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded">
              {{ dataset.requiredPlan.toUpperCase() }}
            </span>
          </label>
        </div>
      </div>

      <!-- Search -->
      <div v-if="selectedDataset">
        <label class="text-sm font-medium text-gray-700 mb-2 block">Szukaj pola</label>
        <div class="relative">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Wpisz nazwe pola..."
            class="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
          />
          <svg class="w-5 h-5 absolute left-3 top-2.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
          <button v-if="searchQuery" type="button" class="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600" @click="searchQuery = ''">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Quick stats -->
      <div v-if="selectedDataset" class="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-100">
        <div class="text-center">
          <div class="text-3xl font-bold text-blue-600">{{ selectedFields.length }}</div>
          <div class="text-sm text-gray-600">pol wybranych</div>
          <div class="text-xs text-gray-500 mt-1">z {{ fields.length }} dostepnych</div>
        </div>
        <div class="flex gap-2 mt-3">
          <button type="button" class="flex-1 text-xs py-1.5 bg-white border border-gray-200 rounded-lg hover:bg-gray-50" @click="selectAll">Wszystkie</button>
          <button type="button" class="flex-1 text-xs py-1.5 bg-white border border-gray-200 rounded-lg hover:bg-gray-50" @click="clearAll">Wyczysc</button>
        </div>
      </div>
    </div>

    <!-- Right: Accordion fields -->
    <div v-if="selectedDataset" class="flex-1 flex flex-col min-w-0">
      <!-- Accordion groups -->
      <div class="flex-1 overflow-y-auto space-y-2 pr-2">
        <div v-for="group in filteredFieldGroups" :key="group.name" class="border border-gray-200 rounded-lg overflow-hidden bg-white">
          <!-- Group header -->
          <button
            type="button"
            class="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 transition-colors"
            @click="toggleGroup(group.name)"
          >
            <div class="flex items-center gap-3">
              <svg
                class="w-5 h-5 text-gray-400 transition-transform"
                :class="{ 'rotate-90': openGroups.includes(group.name) }"
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
              </svg>
              <span class="font-medium text-gray-900">{{ group.name }}</span>
              <span class="text-xs px-2 py-0.5 bg-gray-200 text-gray-600 rounded-full">{{ group.fields.length }}</span>
            </div>
            <span class="text-sm text-blue-600 font-medium">
              {{ getSelectedCountInGroup(group) }} wybrano
            </span>
          </button>

          <!-- Group content -->
          <div v-if="openGroups.includes(group.name)" class="border-t border-gray-200">
            <label
              v-for="field in group.fields"
              :key="field.key"
              class="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
              :class="{
                'opacity-50 cursor-not-allowed': field.locked,
                'bg-blue-50': selectedFields.includes(field.key)
              }"
            >
              <input
                type="checkbox"
                :checked="selectedFields.includes(field.key)"
                :disabled="field.locked"
                class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                @change="toggleField(field)"
              />
              <span class="text-sm text-gray-700 flex-1" v-html="highlightMatch(field.label)"></span>
              <span v-if="field.locked" class="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">PRO</span>
            </label>
          </div>
        </div>
      </div>

      <!-- Selected fields reorder -->
      <div v-if="selectedFields.length > 0" class="mt-4 flex-shrink-0 pt-4 border-t border-gray-200">
        <label class="text-xs font-medium text-gray-500 mb-2 block">Przeciagnij aby zmienic kolejnosc</label>
        <div class="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
          <div
            v-for="(fieldKey, index) in selectedFields"
            :key="fieldKey"
            class="flex items-center gap-1 pl-2 pr-1 py-1 bg-blue-50 border border-blue-200 rounded text-xs cursor-move hover:bg-blue-100 transition-colors"
            draggable="true"
            @dragstart="dragStart(index, $event)"
            @dragend="dragEnd"
            @dragover.prevent
            @drop.stop="drop(index)"
          >
            <span class="text-blue-700">{{ getFieldLabel(fieldKey) }}</span>
            <button type="button" class="p-0.5 text-blue-400 hover:text-red-500" @click="removeField(fieldKey)">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  availableDatasets: { type: Array, required: true },
  fields: { type: Array, required: true },
  selectedDataset: { type: String, default: '' },
  selectedFields: { type: Array, default: () => [] }
})

const emit = defineEmits(['update:selectedDataset', 'update:selectedFields'])

const searchQuery = ref('')
const openGroups = ref(['Podstawowe', 'Dane klienta'])
const draggedIndex = ref(null)

// Group fields
const fieldGroups = computed(() => {
  const groups = {
    'Podstawowe': [],
    'Dane klienta': [],
    'Adres dostawy': [],
    'Punkt odbioru': [],
    'Platnosci': [],
    'Faktura': [],
    'Inne': []
  }

  props.fields.forEach(field => {
    const label = field.label.toLowerCase()
    if (label.includes('email') || label.includes('telefon') || label.includes('imie') || label.includes('nazwisko') || label.includes('login')) {
      groups['Dane klienta'].push(field)
    } else if (label.includes('dostaw') && (label.includes('adres') || label.includes('miasto') || label.includes('kod') || label.includes('kraj') || label.includes('wojew'))) {
      groups['Adres dostawy'].push(field)
    } else if (label.includes('punkt') || label.includes('odbioru')) {
      groups['Punkt odbioru'].push(field)
    } else if (label.includes('faktur') || label.includes('nip')) {
      groups['Faktura'].push(field)
    } else if (label.includes('platno') || label.includes('zaplac') || label.includes('walut') || label.includes('pobrani') || label.includes('cena')) {
      groups['Platnosci'].push(field)
    } else if (label.includes('id') || label.includes('status') || label.includes('data') || label.includes('zrodl')) {
      groups['Podstawowe'].push(field)
    } else {
      groups['Inne'].push(field)
    }
  })

  return Object.entries(groups)
    .filter(([_, fields]) => fields.length > 0)
    .map(([name, fields]) => ({ name, fields }))
})

const filteredFieldGroups = computed(() => {
  if (!searchQuery.value.trim()) return fieldGroups.value

  const query = searchQuery.value.toLowerCase()
  return fieldGroups.value
    .map(group => ({
      name: group.name,
      fields: group.fields.filter(f => f.label.toLowerCase().includes(query))
    }))
    .filter(group => group.fields.length > 0)
})

function toggleGroup(name) {
  const index = openGroups.value.indexOf(name)
  if (index === -1) {
    openGroups.value.push(name)
  } else {
    openGroups.value.splice(index, 1)
  }
}

function getSelectedCountInGroup(group) {
  return group.fields.filter(f => props.selectedFields.includes(f.key)).length
}

function highlightMatch(text) {
  if (!searchQuery.value.trim()) return text
  const regex = new RegExp(`(${searchQuery.value})`, 'gi')
  return text.replace(regex, '<mark class="bg-yellow-200 rounded px-0.5">$1</mark>')
}

function selectDataset(dataset) {
  if (!dataset.available) return
  emit('update:selectedDataset', dataset.key)
}

function toggleField(field) {
  if (field.locked) return
  const fields = [...props.selectedFields]
  const index = fields.indexOf(field.key)
  if (index === -1) {
    fields.push(field.key)
  } else {
    fields.splice(index, 1)
  }
  emit('update:selectedFields', fields)
}

function removeField(fieldKey) {
  emit('update:selectedFields', props.selectedFields.filter(f => f !== fieldKey))
}

function selectAll() {
  const allKeys = props.fields.filter(f => !f.locked).map(f => f.key)
  emit('update:selectedFields', allKeys)
}

function clearAll() {
  emit('update:selectedFields', [])
}

function getFieldLabel(fieldKey) {
  const field = props.fields.find(f => f.key === fieldKey)
  return field?.label || fieldKey
}

function dragStart(index, event) {
  draggedIndex.value = index
  event.dataTransfer.effectAllowed = 'move'
}

function dragEnd() {
  draggedIndex.value = null
}

function drop(targetIndex) {
  if (draggedIndex.value === null || draggedIndex.value === targetIndex) return
  const fields = [...props.selectedFields]
  const [moved] = fields.splice(draggedIndex.value, 1)
  fields.splice(targetIndex, 0, moved)
  emit('update:selectedFields', fields)
  draggedIndex.value = null
}
</script>
