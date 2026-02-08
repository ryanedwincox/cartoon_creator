<!-- NavButton: Directional navigation chevron button for viewer headers. NOT concerned with: navigation logic, file ordering. -->
<script setup lang="ts">
defineProps<{
  direction: -1 | 1
  disabled: boolean
}>()

defineEmits<{
  click: []
}>()
</script>

<template>
  <button class="nav-btn" :disabled="disabled" @click="$emit('click')">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path v-if="direction === -1" d="M15 18l-6-6 6-6" />
      <path v-else d="M9 18l6-6-6-6" />
    </svg>
  </button>
</template>

<style scoped>
.nav-btn {
  background: none;
  color: inherit;
  padding: 0.5rem;
  transition: opacity 0.15s;
}

.nav-btn:disabled {
  opacity: 0.2;
  pointer-events: none;
}

.nav-btn svg {
  width: 1.5rem;
  height: 1.5rem;
}
</style>
