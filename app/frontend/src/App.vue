<script setup lang="ts">
import ServerDisconnectBanner from './components/ServerDisconnectBanner.vue'
</script>

<template>
  <ServerDisconnectBanner />
  <RouterView />
</template>

<style>
:root {
  --primary: #4f46e5;
  --primary-dark: #4338ca;
  --bg: #f9fafb;
  --card-bg: #ffffff;
  --text: #111827;
  --text-muted: #6b7280;
  --border: #e5e7eb;
  --tag-in-progress: #fbbf24;
  --tag-completed: #34d399;
  --tag-discarded: #f87171;
  --tag-refs: #60a5fa;
  --error: #dc2626;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
  -webkit-font-smoothing: antialiased;
}

button {
  cursor: pointer;
  border: none;
  font-family: inherit;
}

input {
  font-family: inherit;
}
</style>
