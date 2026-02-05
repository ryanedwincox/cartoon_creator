<!-- ServerDisconnectBanner: Fixed red warning bar at top of page when server is unreachable. NOT concerned with: health-check logic (delegated to useServerHealth). -->
<script setup lang="ts">
import { useServerHealth } from '../composables/useServerHealth'

const { disconnected } = useServerHealth()
</script>

<template>
  <Transition name="banner">
    <div v-if="disconnected" class="disconnect-banner" role="alert">
      Server disconnected
    </div>
  </Transition>
</template>

<style scoped>
.disconnect-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 9999;
  background: var(--error);
  color: white;
  text-align: center;
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: 600;
  letter-spacing: 0.025em;
}

.banner-enter-active,
.banner-leave-active {
  transition: transform 0.3s ease, opacity 0.3s ease;
}

.banner-enter-from,
.banner-leave-to {
  transform: translateY(-100%);
  opacity: 0;
}
</style>
