<script setup lang="ts">
import { inject } from 'vue'
import type { Layer } from '../../composables/useSvgEditor'

const editor = inject('svgEditor') as ReturnType<typeof import('../../composables/useSvgEditor').useSvgEditor>

const layers: { id: Layer; label: string }[] = [
  { id: 'art', label: 'Art' },
  { id: 'bubbles', label: 'Bubbles' },
  { id: 'text', label: 'Text' },
]
</script>

<template>
  <div class="layers-panel">
    <button
      v-for="layer in layers"
      :key="layer.id"
      :class="['layer-pill', { hidden: !editor.layerVisibility[layer.id] }]"
      @click="editor.toggleLayer(layer.id)"
    >
      <svg
        v-if="editor.layerVisibility[layer.id]"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
      <svg
        v-else
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </svg>
      {{ layer.label }}
    </button>
  </div>
</template>

<style scoped>
.layers-panel {
  display: flex;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: var(--card-bg);
  border-bottom: 1px solid var(--border);
}

.layer-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  border-radius: 9999px;
  background: #dbeafe;
  color: #1e40af;
  font-size: 0.75rem;
  font-weight: 500;
  transition: all 0.15s;
}

.layer-pill svg {
  width: 0.875rem;
  height: 0.875rem;
}

.layer-pill.hidden {
  background: var(--border);
  color: var(--text-muted);
}

.layer-pill:hover {
  opacity: 0.8;
}
</style>
