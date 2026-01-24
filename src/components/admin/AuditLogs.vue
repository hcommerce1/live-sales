<template>
  <div class="audit-logs">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-xl font-semibold text-gray-800">Historia zdarzeń</h2>
      <button
        @click="exportCSV"
        :disabled="loading"
        class="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-sm"
      >
        Eksportuj CSV
      </button>
    </div>

    <!-- Filters -->
    <div class="bg-white rounded-lg border border-gray-200 p-4 mb-4">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Kategoria</label>
          <select v-model="filters.category" @change="loadLogs" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
            <option value="">Wszystkie</option>
            <option value="AUTH">Autoryzacja</option>
            <option value="ACCESS">Dostęp</option>
            <option value="DATA">Dane</option>
            <option value="BILLING">Płatności</option>
            <option value="SECURITY">Bezpieczeństwo</option>
            <option value="ADMIN">Admin</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Poziom</label>
          <select v-model="filters.severity" @change="loadLogs" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
            <option value="">Wszystkie</option>
            <option value="LOW">Niski</option>
            <option value="MEDIUM">Średni</option>
            <option value="HIGH">Wysoki</option>
            <option value="CRITICAL">Krytyczny</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Od daty</label>
          <input
            type="date"
            v-model="filters.startDate"
            @change="loadLogs"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Do daty</label>
          <input
            type="date"
            v-model="filters.endDate"
            @change="loadLogs"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="text-center py-8">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
      <p class="mt-2 text-gray-600">Ładowanie...</p>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
      <p class="text-red-600">{{ error }}</p>
      <button @click="loadLogs" class="mt-2 text-sm text-red-700 underline">Spróbuj ponownie</button>
    </div>

    <!-- Table -->
    <div v-else class="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Akcja</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kategoria</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Poziom</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">IP</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200">
          <tr v-for="log in logs" :key="log.id" class="hover:bg-gray-50">
            <td class="px-4 py-3 text-sm text-gray-600">
              {{ formatDate(log.createdAt) }}
            </td>
            <td class="px-4 py-3 text-sm text-gray-800">
              {{ log.action }}
            </td>
            <td class="px-4 py-3 text-sm text-gray-600">
              {{ log.category || '-' }}
            </td>
            <td class="px-4 py-3">
              <span :class="severityClass(log.severity)" class="px-2 py-1 text-xs rounded-full">
                {{ log.severity || 'LOW' }}
              </span>
            </td>
            <td class="px-4 py-3 text-sm text-gray-500 font-mono">
              {{ log.ip || '-' }}
            </td>
          </tr>
          <tr v-if="logs.length === 0">
            <td colspan="5" class="px-4 py-8 text-center text-gray-500">
              Brak zdarzeń do wyświetlenia
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Pagination -->
      <div v-if="pagination.total > pagination.limit" class="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
        <span class="text-sm text-gray-600">
          {{ pagination.offset + 1 }} - {{ Math.min(pagination.offset + logs.length, pagination.total) }} z {{ pagination.total }}
        </span>
        <div class="flex gap-2">
          <button
            @click="prevPage"
            :disabled="pagination.offset === 0"
            class="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50"
          >
            Poprzednia
          </button>
          <button
            @click="nextPage"
            :disabled="!pagination.hasMore"
            class="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50"
          >
            Następna
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

const loading = ref(false)
const error = ref(null)
const logs = ref([])

const filters = reactive({
  category: '',
  severity: '',
  startDate: '',
  endDate: ''
})

const pagination = reactive({
  total: 0,
  limit: 100,
  offset: 0,
  hasMore: false
})

const loadLogs = async () => {
  loading.value = true
  error.value = null

  try {
    const params = new URLSearchParams()
    if (filters.category) params.append('category', filters.category)
    if (filters.severity) params.append('severity', filters.severity)
    if (filters.startDate) params.append('startDate', new Date(filters.startDate).toISOString())
    if (filters.endDate) params.append('endDate', new Date(filters.endDate).toISOString())
    params.append('limit', pagination.limit.toString())
    params.append('offset', pagination.offset.toString())

    const response = await props.api.get(`/admin/audit-logs?${params.toString()}`)

    if (response.success) {
      logs.value = response.data
      pagination.total = response.pagination.total
      pagination.hasMore = response.pagination.hasMore
    } else {
      error.value = response.error || 'Nie udało się załadować logów'
    }
  } catch (err) {
    error.value = err.message || 'Błąd połączenia'
  } finally {
    loading.value = false
  }
}

const exportCSV = async () => {
  try {
    const params = new URLSearchParams()
    if (filters.category) params.append('category', filters.category)
    if (filters.severity) params.append('severity', filters.severity)
    if (filters.startDate) params.append('startDate', new Date(filters.startDate).toISOString())
    if (filters.endDate) params.append('endDate', new Date(filters.endDate).toISOString())

    const response = await fetch(`/api/admin/audit-logs/export?${params.toString()}`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
      }
    })

    if (response.ok) {
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    }
  } catch (err) {
    console.error('Export failed:', err)
  }
}

const prevPage = () => {
  if (pagination.offset > 0) {
    pagination.offset = Math.max(0, pagination.offset - pagination.limit)
    loadLogs()
  }
}

const nextPage = () => {
  if (pagination.hasMore) {
    pagination.offset += pagination.limit
    loadLogs()
  }
}

const formatDate = (dateStr) => {
  return new Date(dateStr).toLocaleString('pl-PL')
}

const severityClass = (severity) => {
  const classes = {
    LOW: 'bg-gray-100 text-gray-700',
    MEDIUM: 'bg-yellow-100 text-yellow-700',
    HIGH: 'bg-orange-100 text-orange-700',
    CRITICAL: 'bg-red-100 text-red-700'
  }
  return classes[severity] || classes.LOW
}

onMounted(() => {
  loadLogs()
})
</script>
