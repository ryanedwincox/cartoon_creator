<!-- TextViewer: Full-screen modal for viewing text file contents with arrow-button navigation. -->
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useInjectedFiles } from '../composables/useFiles'
import { useKeyboardNavigation } from '../composables/useKeyboardNavigation'
import NavButton from './NavButton.vue'

const props = defineProps<{
  filename: string
  hasPrev: boolean
  hasNext: boolean
}>()

const emit = defineEmits<{
  close: []
  navigate: [direction: -1 | 1]
}>()

const { getFileText } = useInjectedFiles()

const content = ref('')
const loading = ref(true)
const error = ref<string>()

useKeyboardNavigation((dir) => emit('navigate', dir))

onMounted(async () => {
  try {
    content.value = await getFileText(props.filename)
  } catch (e) {
    console.error(`TextViewer: failed to load "${props.filename}"`, e)
    error.value = e instanceof Error ? e.message : 'Failed to load file'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="text-viewer">
    <header class="text-viewer-header">
      <button class="close-btn" @click="emit('close')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
      <span class="filename">{{ filename }}</span>
      <span />
    </header>

    <div class="text-viewer-content">
      <div v-if="loading" class="status">Loading...</div>
      <div v-else-if="error" class="status error">{{ error }}</div>
      <pre v-else class="text-content">{{ content }}</pre>
    </div>

    <div class="nav-overlay">
      <NavButton :direction="-1" :disabled="!hasPrev" @click="emit('navigate', -1)" />
      <NavButton :direction="1" :disabled="!hasNext" @click="emit('navigate', 1)" />
    </div>
  </div>
</template>

<style scoped>
.text-viewer {
  position: fixed;
  inset: 0;
  background: var(--bg, #111);
  z-index: 200;
  display: flex;
  flex-direction: column;
}

.text-viewer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem;
  background: rgba(0, 0, 0, 0.5);
  color: white;
  flex-shrink: 0;
}

.close-btn {
  background: none;
  color: white;
  padding: 0.5rem;
}

.close-btn svg {
  width: 1.5rem;
  height: 1.5rem;
}

.filename {
  font-size: 0.875rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.text-viewer-content {
  flex: 1;
  overflow: auto;
  padding: 1rem;
}

.status {
  text-align: center;
  color: var(--text-muted, #888);
  padding: 3rem 1rem;
}

.status.error {
  color: #e55;
}

.text-content {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: 0.875rem;
  line-height: 1.6;
  color: var(--text, #e0e0e0);
}

.nav-overlay {
  position: absolute;
  bottom: 2rem;
  left: 1rem;
  right: 1rem;
  display: flex;
  justify-content: space-between;
  pointer-events: none;
  color: white;
}

.nav-overlay > * {
  pointer-events: auto;
}
</style>
