<template>
  <main class="skeleton-content">
    <!-- Stats cards row -->
    <div class="skeleton-stats">
      <div class="skeleton-stat-card" v-for="i in 3" :key="i">
        <div class="skeleton-box stat-icon"></div>
        <div class="stat-info">
          <div class="skeleton-box stat-value"></div>
          <div class="skeleton-box stat-label"></div>
        </div>
      </div>
    </div>

    <!-- Main content area -->
    <div class="skeleton-main-grid">
      <!-- Left column - larger -->
      <div class="skeleton-card large">
        <div class="skeleton-box card-title"></div>
        <div class="skeleton-table">
          <div class="skeleton-table-header">
            <div class="skeleton-box th" v-for="i in 4" :key="i"></div>
          </div>
          <div class="skeleton-table-row" v-for="i in 4" :key="i">
            <div class="skeleton-box td" v-for="j in 4" :key="j"></div>
          </div>
        </div>
      </div>

      <!-- Right column - smaller -->
      <div class="skeleton-right-column">
        <div class="skeleton-card">
          <div class="skeleton-box card-title"></div>
          <div class="skeleton-list">
            <div class="skeleton-list-item" v-for="i in 3" :key="i">
              <div class="skeleton-box list-icon"></div>
              <div class="skeleton-box list-text"></div>
            </div>
          </div>
        </div>

        <div class="skeleton-card">
          <div class="skeleton-box card-title"></div>
          <div class="skeleton-box chart-placeholder"></div>
        </div>
      </div>
    </div>
  </main>
</template>

<script setup>
// SkeletonContent - Premium loading state for main content area
</script>

<style scoped>
.skeleton-content {
  flex: 1;
  padding: 1.5rem 2rem;
  background: #f9fafb;
  overflow-y: auto;
}

.skeleton-box {
  background: linear-gradient(
    90deg,
    #e5e7eb 0%,
    #d1d5db 50%,
    #e5e7eb 100%
  );
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.5s infinite;
  border-radius: 6px;
}

@keyframes skeleton-shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

/* Stats cards */
.skeleton-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1.5rem;
  margin-bottom: 1.5rem;
}

.skeleton-stat-card {
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
  border-radius: 10px;
}

.stat-info {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.stat-value {
  width: 80px;
  height: 28px;
}

.stat-label {
  width: 100px;
  height: 14px;
  opacity: 0.6;
}

/* Main content grid */
.skeleton-main-grid {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 1.5rem;
}

/* Cards */
.skeleton-card {
  background: #ffffff;
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.skeleton-card.large {
  grid-row: span 2;
}

.card-title {
  width: 160px;
  height: 20px;
  margin-bottom: 1.5rem;
}

/* Table skeleton */
.skeleton-table {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.skeleton-table-header {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 80px;
  gap: 1rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid #e5e7eb;
}

.skeleton-table-row {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 80px;
  gap: 1rem;
  padding: 0.75rem 0;
}

.th {
  height: 14px;
}

.td {
  height: 16px;
}

/* List skeleton */
.skeleton-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.skeleton-list-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.list-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
}

.list-text {
  flex: 1;
  height: 16px;
}

/* Chart placeholder */
.chart-placeholder {
  width: 100%;
  height: 180px;
  margin-top: 0.5rem;
}

/* Right column */
.skeleton-right-column {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

/* Responsive */
@media (max-width: 1024px) {
  .skeleton-stats {
    grid-template-columns: 1fr;
  }

  .skeleton-main-grid {
    grid-template-columns: 1fr;
  }

  .skeleton-card.large {
    grid-row: auto;
  }
}
</style>
