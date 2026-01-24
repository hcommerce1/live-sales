<template>
  <div class="empty-state" :class="{ 'compact': compact }">
    <!-- Illustration -->
    <div class="empty-illustration" v-if="!compact">
      <slot name="illustration">
        <!-- Default illustration based on type -->
        <svg v-if="type === 'exports'" viewBox="0 0 200 200" class="illustration">
          <circle cx="100" cy="100" r="80" fill="#f3f4f6"/>
          <rect x="60" y="70" width="80" height="60" rx="4" fill="#e5e7eb"/>
          <rect x="70" y="80" width="30" height="4" rx="2" fill="#9ca3af"/>
          <rect x="70" y="90" width="50" height="4" rx="2" fill="#9ca3af"/>
          <rect x="70" y="100" width="40" height="4" rx="2" fill="#9ca3af"/>
          <rect x="70" y="110" width="45" height="4" rx="2" fill="#9ca3af"/>
          <circle cx="140" cy="140" r="30" fill="#3b82f6"/>
          <path d="M130 140 L140 150 L155 130" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>

        <svg v-else-if="type === 'tokens'" viewBox="0 0 200 200" class="illustration">
          <circle cx="100" cy="100" r="80" fill="#f3f4f6"/>
          <rect x="55" y="75" width="90" height="50" rx="8" fill="#e5e7eb"/>
          <circle cx="80" cy="100" r="12" fill="#9ca3af"/>
          <rect x="100" y="90" width="35" height="6" rx="3" fill="#9ca3af"/>
          <rect x="100" y="102" width="25" height="4" rx="2" fill="#d1d5db"/>
          <circle cx="140" cy="140" r="25" fill="#10b981"/>
          <path d="M130 140 L137 147 L152 132" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>

        <svg v-else-if="type === 'team'" viewBox="0 0 200 200" class="illustration">
          <circle cx="100" cy="100" r="80" fill="#f3f4f6"/>
          <circle cx="100" cy="80" r="25" fill="#e5e7eb"/>
          <ellipse cx="100" cy="130" rx="35" ry="20" fill="#e5e7eb"/>
          <circle cx="60" cy="95" r="15" fill="#d1d5db"/>
          <ellipse cx="60" cy="125" rx="20" ry="12" fill="#d1d5db"/>
          <circle cx="140" cy="95" r="15" fill="#d1d5db"/>
          <ellipse cx="140" cy="125" rx="20" ry="12" fill="#d1d5db"/>
          <circle cx="150" cy="150" r="20" fill="#8b5cf6"/>
          <path d="M143 150 H157 M150 143 V157" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>
        </svg>

        <svg v-else viewBox="0 0 200 200" class="illustration">
          <circle cx="100" cy="100" r="80" fill="#f3f4f6"/>
          <rect x="60" y="60" width="80" height="80" rx="8" fill="#e5e7eb"/>
          <circle cx="100" cy="100" r="20" fill="#9ca3af"/>
          <path d="M100 85 V100 L110 110" stroke="#6b7280" stroke-width="4" fill="none" stroke-linecap="round"/>
        </svg>
      </slot>
    </div>

    <!-- Icon for compact mode -->
    <div class="empty-icon" v-if="compact && icon">
      <component :is="icon" />
    </div>

    <!-- Title -->
    <h3 class="empty-title">{{ title }}</h3>

    <!-- Description -->
    <p class="empty-description" v-if="description">{{ description }}</p>

    <!-- Action button -->
    <button
      v-if="actionLabel"
      class="empty-action"
      @click="$emit('action')"
    >
      <svg v-if="actionIcon === 'plus'" class="action-icon" viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
      </svg>
      {{ actionLabel }}
    </button>

    <!-- Additional content slot -->
    <slot></slot>
  </div>
</template>

<script setup>
defineProps({
  // Type of empty state (exports, tokens, team, default)
  type: {
    type: String,
    default: 'default'
  },
  // Title text
  title: {
    type: String,
    required: true
  },
  // Description text
  description: {
    type: String,
    default: ''
  },
  // Action button label
  actionLabel: {
    type: String,
    default: ''
  },
  // Action button icon
  actionIcon: {
    type: String,
    default: 'plus'
  },
  // Compact mode (smaller, for inline use)
  compact: {
    type: Boolean,
    default: false
  },
  // Icon component for compact mode
  icon: {
    type: Object,
    default: null
  }
})

defineEmits(['action'])
</script>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 2rem;
  text-align: center;
  min-height: 300px;
}

.empty-state.compact {
  padding: 1.5rem 1rem;
  min-height: auto;
}

.empty-illustration {
  margin-bottom: 1.5rem;
}

.illustration {
  width: 160px;
  height: 160px;
}

.compact .illustration {
  width: 80px;
  height: 80px;
}

.empty-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f3f4f6;
  border-radius: 12px;
  margin-bottom: 1rem;
  color: #6b7280;
}

.empty-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: #111827;
  margin: 0 0 0.5rem 0;
}

.compact .empty-title {
  font-size: 1rem;
}

.empty-description {
  font-size: 0.9375rem;
  color: #6b7280;
  margin: 0 0 1.5rem 0;
  max-width: 400px;
  line-height: 1.5;
}

.compact .empty-description {
  font-size: 0.875rem;
  margin-bottom: 1rem;
}

.empty-action {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  background: linear-gradient(135deg, #2563eb 0%, #4f46e5 100%);
  color: #ffffff;
  font-size: 0.9375rem;
  font-weight: 500;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 2px 4px rgba(37, 99, 235, 0.2);
}

.empty-action:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(37, 99, 235, 0.3);
}

.empty-action:active {
  transform: translateY(0);
}

.action-icon {
  width: 18px;
  height: 18px;
}

.compact .empty-action {
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
}
</style>
