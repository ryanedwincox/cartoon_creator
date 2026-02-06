<!-- [Component]: SVG editor tool selection bar. Responsible for rendering tool buttons with icons and managing active tool state. NOT concerned with tool behavior or canvas interaction. -->
<script setup lang="ts">
import { inject } from 'vue'
import type { Tool } from '../../composables/useSvgEditor'

const editor = inject('svgEditor') as ReturnType<typeof import('../../composables/useSvgEditor').useSvgEditor>

interface SvgElement {
  tag: 'path' | 'circle'
  attrs: Record<string, string | number>
}

const tools: { id: Tool; label: string; shortcutKey: string; icon: SvgElement[] }[] = [
  { id: 'select', label: 'Select', shortcutKey: 'V', icon: [
    { tag: 'path', attrs: { d: 'M4 4l7 17 2.5-6.5L20 12z' } },
  ] },
  { id: 'node', label: 'Node', shortcutKey: 'N', icon: [
    { tag: 'path', attrs: { d: 'M12 3v18M3 12h18' } },
    { tag: 'circle', attrs: { cx: 12, cy: 12, r: 3, fill: 'currentColor' } },
  ] },
  { id: 'draw', label: 'Draw', shortcutKey: 'D', icon: [
    { tag: 'path', attrs: { d: 'M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z' } },
    { tag: 'path', attrs: { d: 'm15 5 4 4' } },
  ] },
  { id: 'erase', label: 'Erase', shortcutKey: 'E', icon: [
    { tag: 'path', attrs: { d: 'm7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21' } },
    { tag: 'path', attrs: { d: 'M22 21H7' } },
    { tag: 'path', attrs: { d: 'm5 11 9 9' } },
  ] },
  { id: 'bubble', label: 'Bubble', shortcutKey: 'B', icon: [
    { tag: 'path', attrs: { d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' } },
  ] },
]
</script>

<template>
  <div class="toolbar">
    <button
      v-for="tool in tools"
      :key="tool.id"
      :class="['tool-btn', { active: editor.currentTool.value === tool.id }]"
      :data-tool="tool.id"
      :title="`${tool.label} (${tool.shortcutKey})`"
      @click="editor.currentTool.value = tool.id"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <template v-for="(el, i) in tool.icon" :key="i">
          <path v-if="el.tag === 'path'" v-bind="el.attrs" />
          <circle v-else-if="el.tag === 'circle'" v-bind="el.attrs" />
        </template>
      </svg>
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
  transition: all 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.375rem;
}

.tool-btn svg {
  width: 1.25rem;
  height: 1.25rem;
}

.tool-btn:hover {
  background: #d1d5db;
}

.tool-btn.active {
  background: var(--primary);
  color: white;
}
</style>
