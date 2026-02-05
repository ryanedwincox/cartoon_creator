<script setup lang="ts">
import { inject } from 'vue'
import type { Tool } from '../../composables/useSvgEditor'

const editor = inject('svgEditor') as ReturnType<typeof import('../../composables/useSvgEditor').useSvgEditor>

const tools: { id: Tool; label: string; shortcut: string }[] = [
  { id: 'select', label: 'V', shortcut: 'Select' },
  { id: 'node', label: 'N', shortcut: 'Node' },
  { id: 'draw', label: 'D', shortcut: 'Draw' },
  { id: 'erase', label: 'E', shortcut: 'Erase' },
  { id: 'bubble', label: 'B', shortcut: 'Bubble' },
  { id: 'thought', label: 'T', shortcut: 'Thought' },
]
</script>

<template>
  <div class="toolbar">
    <button
      v-for="tool in tools"
      :key="tool.id"
      :class="['tool-btn', { active: editor.currentTool.value === tool.id }]"
      :data-tool="tool.id"
      :title="`${tool.shortcut} (${tool.label})`"
      @click="editor.currentTool.value = tool.id"
    >
      {{ tool.label }}
    </button>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem;
  background: var(--card-bg);
  border-top: 1px solid var(--border);
}

.tool-btn {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 0.5rem;
  background: var(--border);
  color: var(--text);
  font-weight: 600;
  font-size: 0.875rem;
  transition: all 0.15s;
}

.tool-btn:hover {
  background: #d1d5db;
}

.tool-btn.active {
  background: var(--primary);
  color: white;
}
</style>
