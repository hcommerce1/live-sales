<template>
  <aside class="skeleton-sidebar">
    <!-- Logo area -->
    <div class="skeleton-logo">
      <div class="skeleton-box logo-icon"></div>
      <div class="skeleton-box logo-text"></div>
    </div>

    <!-- Navigation items -->
    <nav class="skeleton-nav">
      <div class="skeleton-nav-item" v-for="i in 5" :key="i">
        <div class="skeleton-box nav-icon"></div>
        <div class="skeleton-box nav-text"></div>
      </div>
    </nav>

    <!-- User area at bottom -->
    <div class="skeleton-user">
      <div class="skeleton-box user-avatar"></div>
      <div class="skeleton-user-info">
        <div class="skeleton-box user-name"></div>
        <div class="skeleton-box user-email"></div>
      </div>
    </div>
  </aside>
</template>

<script setup>
// SkeletonSidebar - Premium loading state for sidebar
</script>

<style scoped>
.skeleton-sidebar {
  width: 256px;
  min-height: 100vh;
  background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.skeleton-box {
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0.05) 0%,
    rgba(255, 255, 255, 0.1) 50%,
    rgba(255, 255, 255, 0.05) 100%
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

/* Logo area */
.skeleton-logo {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.logo-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
}

.logo-text {
  width: 120px;
  height: 24px;
}

/* Navigation */
.skeleton-nav {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  flex: 1;
}

.skeleton-nav-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  border-radius: 8px;
}

.nav-icon {
  width: 20px;
  height: 20px;
}

.nav-text {
  width: 80px;
  height: 16px;
}

.skeleton-nav-item:nth-child(1) .nav-text { width: 90px; }
.skeleton-nav-item:nth-child(2) .nav-text { width: 70px; }
.skeleton-nav-item:nth-child(3) .nav-text { width: 100px; }
.skeleton-nav-item:nth-child(4) .nav-text { width: 60px; }
.skeleton-nav-item:nth-child(5) .nav-text { width: 85px; }

/* User area */
.skeleton-user {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding-top: 1.5rem;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  margin-top: auto;
}

.user-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
}

.skeleton-user-info {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.user-name {
  width: 100px;
  height: 14px;
}

.user-email {
  width: 140px;
  height: 12px;
  opacity: 0.7;
}
</style>
