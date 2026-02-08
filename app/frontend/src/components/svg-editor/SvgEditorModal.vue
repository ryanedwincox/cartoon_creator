<!-- [Component]: SVG editor modal shell. Responsible for loading SVG files, autosaving periodically and on close, providing editor instance via inject, and keyboard shortcut routing. NOT concerned with canvas rendering or drawing logic. -->
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, provide } from 'vue'
import { useSvgEditor } from '../../composables/useSvgEditor'
import SvgCanvas from './SvgCanvas.vue'
import Toolbar from './Toolbar.vue'
import LayersPanel from './LayersPanel.vue'
import NavButton from '../NavButton.vue'

const props = defineProps<{
  projectId: string
  filename: string
  hasPrev: boolean
  hasNext: boolean
}>()

const emit = defineEmits<{
  close: []
  navigate: [direction: -1 | 1]
}>()

const API_BASE = '/api'
const DATA_BASE = '/data'
const AUTOSAVE_INTERVAL_MS = 30_000

const editor = useSvgEditor()
provide('svgEditor', editor)

const hasSelection = computed(() => editor.selectedIds.value.size > 0)

const saveStatus = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
let saveStatusTimer: ReturnType<typeof setTimeout> | undefined
let autosaveTimer: ReturnType<typeof setInterval> | undefined
let saving = false

const persistSvg = async (): Promise<boolean> => {
  if (!editor.isDirty.value || saving) return true
  saving = true

  saveStatus.value = 'saving'
  try {
    const svgContent = editor.exportSvg()
    const res = await fetch(`${API_BASE}/files/${props.projectId}/${props.filename}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: svgContent }),
    })
    if (!res.ok) throw new Error('Failed to save')
    editor.markSaved()
    saveStatus.value = 'saved'
    clearTimeout(saveStatusTimer)
    saveStatusTimer = setTimeout(() => { saveStatus.value = 'idle' }, 2000)
    return true
  } catch (e) {
    console.error('Failed to save SVG:', e)
    saveStatus.value = 'error'
    return false
  } finally {
    saving = false
  }
}

const handleClose = async () => {
  const saved = await persistSvg()
  if (!saved && editor.isDirty.value) {
    // Save failed — still close since autosave will have captured recent state
    // and blocking the user on transient network errors is worse UX
    saveStatus.value = 'error'
  }
  emit('close')
}

const handleNavigate = async (direction: -1 | 1) => {
  await persistSvg()
  emit('navigate', direction)
}

// beforeunload uses fire-and-forget fetch because the browser does not allow
// async work in this handler; keepalive ensures the request outlives the page.
const handleBeforeUnload = () => {
  if (!editor.isDirty.value) return
  const svgContent = editor.exportSvg()
  fetch(`${API_BASE}/files/${props.projectId}/${props.filename}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: svgContent }),
    keepalive: true,
  }).catch(() => { /* best-effort — browser lifecycle constraint */ })
}

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
        editor.currentTool.value = 'text'
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

onMounted(async () => {
  // Load SVG content
  try {
    const res = await fetch(`${DATA_BASE}/${props.projectId}/${props.filename}`)
    if (res.ok) {
      const svgContent = await res.text()
      editor.importSvg(svgContent)
      editor.markSaved()
    }
  } catch (e) {
    console.error('Failed to load SVG:', e)
  }

  // Periodic autosave — guarded by `saving` flag inside persistSvg to prevent overlap
  autosaveTimer = setInterval(async () => { await persistSvg() }, AUTOSAVE_INTERVAL_MS)

  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('beforeunload', handleBeforeUnload)
})

onUnmounted(() => {
  clearInterval(autosaveTimer)
  clearTimeout(saveStatusTimer)
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('beforeunload', handleBeforeUnload)
})
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
        <span v-if="saveStatus === 'saving'" class="save-indicator saving">Saving…</span>
        <span v-else-if="saveStatus === 'saved'" class="save-indicator saved">Saved</span>
        <span v-else-if="saveStatus === 'error'" class="save-indicator error">Save failed</span>
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
        <button class="btn btn-secondary close-btn" @click="handleClose">
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

    <div class="nav-overlay">
      <NavButton :direction="-1" :disabled="!hasPrev" @click="handleNavigate(-1)" />
      <div class="nav-right-group">
        <button
          v-if="hasSelection"
          type="button"
          class="delete-selection-btn"
          title="Delete selection"
          @click="editor.deleteSelected()"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
        <NavButton :direction="1" :disabled="!hasNext" @click="handleNavigate(1)" />
      </div>
    </div>
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

.save-indicator {
  font-size: 0.75rem;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  white-space: nowrap;
}

.save-indicator.saving {
  color: var(--text-muted);
}

.save-indicator.saved {
  color: #16a34a;
}

.save-indicator.error {
  color: var(--error);
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

.nav-overlay {
  position: absolute;
  bottom: 5rem;
  left: 1rem;
  right: 1rem;
  display: flex;
  justify-content: space-between;
  pointer-events: none;
}

.nav-overlay > *,
.nav-right-group > * {
  pointer-events: auto;
}

.nav-right-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.delete-selection-btn {
  width: 2.75rem;
  height: 2.75rem;
  border: none;
  border-radius: 50%;
  background: var(--error);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  transition: opacity 0.15s;
  opacity: 0.9;
}

.delete-selection-btn:hover {
  opacity: 1;
}

.delete-selection-btn:active {
  opacity: 1;
  filter: brightness(0.85);
}

.delete-selection-btn svg {
  width: 1.25rem;
  height: 1.25rem;
}
</style>
