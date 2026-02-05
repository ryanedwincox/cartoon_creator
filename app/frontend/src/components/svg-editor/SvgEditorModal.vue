<script setup lang="ts">
import { ref, onMounted, onUnmounted, provide } from 'vue'
import { useSvgEditor } from '../../composables/useSvgEditor'
import SvgCanvas from './SvgCanvas.vue'
import Toolbar from './Toolbar.vue'
import LayersPanel from './LayersPanel.vue'

const props = defineProps<{
  projectId: string
  filename: string
}>()

const emit = defineEmits<{
  close: []
}>()

const API_BASE = 'http://localhost:8000/api'
const DATA_BASE = 'http://localhost:8000/data'

const editor = useSvgEditor()
provide('svgEditor', editor)

const saving = ref(false)

onMounted(async () => {
  // Load SVG content
  try {
    const res = await fetch(`${DATA_BASE}/${props.projectId}/${props.filename}`)
    if (res.ok) {
      const svgContent = await res.text()
      editor.importSvg(svgContent)
    }
  } catch (e) {
    console.error('Failed to load SVG:', e)
  }

  // Setup keyboard shortcuts
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})

const handleKeyDown = (e: KeyboardEvent) => {
  // Don't handle if typing in input
  if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') {
    return
  }

  if (e.ctrlKey || e.metaKey) {
    if (e.key === 'z') {
      e.preventDefault()
      if (e.shiftKey) {
        editor.redo()
      } else {
        editor.undo()
      }
    }
  } else {
    switch (e.key.toLowerCase()) {
      case 'v':
        editor.currentTool.value = 'select'
        break
      case 'n':
        editor.currentTool.value = 'node'
        break
      case 'd':
        editor.currentTool.value = 'draw'
        break
      case 'e':
        editor.currentTool.value = 'erase'
        break
      case 'b':
        editor.currentTool.value = 'bubble'
        break
      case 't':
        editor.currentTool.value = 'thought'
        break
      case 'delete':
      case 'backspace':
        e.preventDefault()
        editor.deleteSelected()
        break
      case 'escape':
        editor.clearSelection()
        break
    }
  }
}

const handleSave = async () => {
  saving.value = true
  try {
    const svgContent = editor.exportSvg()
    const res = await fetch(`${API_BASE}/files/${props.projectId}/${props.filename}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: svgContent }),
    })
    if (!res.ok) throw new Error('Failed to save')
  } catch (e) {
    console.error('Failed to save SVG:', e)
    alert('Failed to save SVG')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="svg-editor-modal">
    <!-- Header -->
    <header class="editor-header">
      <div class="header-left">
        <h2>SVG Editor</h2>
        <span class="filename">{{ filename }}</span>
      </div>
      <div class="header-right">
        <button class="btn btn-secondary" @click="editor.undo()" :disabled="!editor.canUndo.value">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 10h10a5 5 0 0 1 5 5v2M3 10l4-4M3 10l4 4" />
          </svg>
        </button>
        <button class="btn btn-secondary" @click="editor.redo()" :disabled="!editor.canRedo.value">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 10H11a5 5 0 0 0-5 5v2M21 10l-4-4M21 10l-4 4" />
          </svg>
        </button>
        <button id="save-btn" class="btn btn-primary" @click="handleSave" :disabled="saving">
          {{ saving ? 'Saving...' : 'Save' }}
        </button>
        <button class="btn btn-secondary close-btn" @click="emit('close')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </header>

    <!-- Layers panel -->
    <LayersPanel />

    <!-- Canvas -->
    <div class="canvas-container">
      <SvgCanvas />
    </div>

    <!-- Toolbar -->
    <Toolbar />
  </div>
</template>

<style scoped>
.svg-editor-modal {
  position: fixed;
  inset: 0;
  background: var(--bg);
  z-index: 300;
  display: flex;
  flex-direction: column;
}

.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background: var(--card-bg);
  border-bottom: 1px solid var(--border);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.header-left h2 {
  font-size: 1.125rem;
  font-weight: 600;
  margin: 0;
}

.filename {
  color: var(--text-muted);
  font-size: 0.875rem;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.header-right .btn {
  padding: 0.5rem;
}

.header-right .btn svg {
  width: 1.25rem;
  height: 1.25rem;
}

.header-right .btn-primary {
  padding: 0.5rem 1rem;
}

.close-btn svg {
  width: 1.5rem;
  height: 1.5rem;
}

.canvas-container {
  flex: 1;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #e5e7eb;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
