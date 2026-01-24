<template>
  <header class="skeleton-header">
    <!-- Page title -->
    <div class="skeleton-title">
      <div class="skeleton-box title-text"></div>
      <div class="skeleton-box title-subtitle"></div>
    </div>

    <!-- Header actions -->
    <div class="skeleton-actions">
      <div class="skeleton-box action-btn"></div>
      <div class="skeleton-box action-btn-primary"></div>
    </div>
  </header>
</template>

<script setup>
// SkeletonHeader - Premium loading state for header
</script>

<style scoped>
.skeleton-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem 2rem;
  background: #ffffff;
  border-bottom: 1px solid #e5e7eb;
}

.skeleton-box {
  background: linear-gradient(
    90deg,
    #f3f4f6 0%,
    #e5e7eb 50%,
    #f3f4f6 100%
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

/* Title area */
.skeleton-title {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.title-text {
  width: 200px;
  height: 28px;
}

.title-subtitle {
  width: 300px;
  height: 16px;
  opacity: 0.6;
}

/* Actions area */
.skeleton-actions {
  display: flex;
  gap: 0.75rem;
}

.action-btn {
  width: 100px;
  height: 40px;
  border-radius: 8px;
}

.action-btn-primary {
  width: 140px;
  height: 40px;
  border-radius: 8px;
  background: linear-gradient(
    90deg,
    rgba(37, 99, 235, 0.2) 0%,
    rgba(37, 99, 235, 0.3) 50%,
    rgba(37, 99, 235, 0.2) 100%
  );
  background-size: 200% 100%;
}
</style>
