<template>
  <div v-if="!dismissed && !allCompleted" class="onboarding-checklist bg-white rounded-lg border border-gray-200 p-4 mb-6">
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-lg font-semibold text-gray-800">Rozpocznij z Live Sales</h3>
      <button
        @click="dismiss"
        class="text-gray-400 hover:text-gray-600"
        title="Ukryj"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
    </div>

    <!-- Progress bar -->
    <div class="mb-4">
      <div class="flex items-center justify-between text-sm text-gray-600 mb-1">
        <span>Postęp</span>
        <span>{{ completedCount }}/{{ totalSteps }}</span>
      </div>
      <div class="w-full bg-gray-200 rounded-full h-2">
        <div
          class="bg-blue-600 h-2 rounded-full transition-all duration-300"
          :style="{ width: progress + '%' }"
        ></div>
      </div>
    </div>

    <!-- Checklist -->
    <div class="space-y-3">
      <div
        v-for="step in steps"
        :key="step.key"
        class="flex items-center gap-3"
      >
        <div
          :class="[
            'w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0',
            step.completed ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'
          ]"
        >
          <svg v-if="step.completed" class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
          </svg>
          <span v-else class="text-xs font-medium">{{ step.number }}</span>
        </div>
        <span :class="['text-sm', step.completed ? 'text-gray-500 line-through' : 'text-gray-700']">
          {{ step.label }}
        </span>
        <button
          v-if="!step.completed && step.action"
          @click="step.action"
          class="ml-auto text-sm text-blue-600 hover:text-blue-700"
        >
          {{ step.actionLabel }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

const props = defineProps({
  api: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['goToConfig', 'goToExports', 'dismiss'])

const loading = ref(false)
const dismissed = ref(false)
const allCompleted = ref(false)
const completedAt = ref(null)

const stepsData = ref([
  { key: 'tokenConfigured', label: 'Skonfiguruj token API', completed: false },
  { key: 'firstExportCreated', label: 'Utwórz pierwszy eksport', completed: false },
  { key: 'sheetsConnected', label: 'Połącz arkusz Google', completed: false },
  { key: 'firstExportRun', label: 'Uruchom pierwszy eksport', completed: false },
])

const steps = computed(() => {
  return stepsData.value.map((step, index) => ({
    ...step,
    number: index + 1,
    action: getStepAction(step.key, step.completed),
    actionLabel: getStepActionLabel(step.key)
  }))
})

const completedCount = computed(() => {
  return stepsData.value.filter(s => s.completed).length
})

const totalSteps = computed(() => stepsData.value.length)

const progress = computed(() => {
  return Math.round((completedCount.value / totalSteps.value) * 100)
})

const getStepAction = (key, completed) => {
  if (completed) return null

  switch (key) {
    case 'tokenConfigured':
      return () => emit('goToConfig')
    case 'firstExportCreated':
    case 'sheetsConnected':
    case 'firstExportRun':
      return () => emit('goToExports')
    default:
      return null
  }
}

const getStepActionLabel = (key) => {
  switch (key) {
    case 'tokenConfigured':
      return 'Konfiguracja'
    case 'firstExportCreated':
    case 'sheetsConnected':
    case 'firstExportRun':
      return 'Eksporty'
    default:
      return 'Przejdź'
  }
}

const loadOnboarding = async () => {
  loading.value = true

  try {
    const response = await props.api.get('/api/user/onboarding')
    if (response.success) {
      const data = response.data
      dismissed.value = data.dismissed
      allCompleted.value = data.allCompleted
      completedAt.value = data.completedAt

      stepsData.value.forEach(step => {
        const serverStep = data.steps.find(s => s.key === step.key)
        if (serverStep) {
          step.completed = serverStep.completed
        }
      })
    }
  } catch (err) {
    console.error('Failed to load onboarding:', err)
  } finally {
    loading.value = false
  }
}

const dismiss = async () => {
  try {
    await props.api.post('/api/user/onboarding/dismiss')
    dismissed.value = true
    emit('dismiss')
  } catch (err) {
    console.error('Failed to dismiss onboarding:', err)
  }
}

// Expose method to refresh from parent
const refresh = () => {
  loadOnboarding()
}

defineExpose({ refresh })

onMounted(() => {
  loadOnboarding()
})
</script>
