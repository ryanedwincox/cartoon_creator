<!-- Tag filter bar: multi-select badges with selection order indicators. -->
<script setup lang="ts">
import { computed } from 'vue'
import { ALL_TAGS, type Tag } from '../composables/useProjects'

const props = defineProps<{
  counts: Record<Tag, number>
  selectedTags: Tag[]
}>()

const emit = defineEmits<{
  toggle: [tag: Tag]
}>()

const tagLabels: Record<Tag, string> = {
  in_progress: 'in progress',
  completed: 'completed',
  discarded: 'discarded',
  refs: 'refs',
}

/** Map of selected tag → 1-based selection order for O(1) lookup. */
const selectionOrder = computed(() => {
  const map = new Map<Tag, number>()
  props.selectedTags.forEach((tag, i) => {
    map.set(tag, i + 1)
  })
  return map
})
</script>

<template>
  <div class="tag-filter">
    <button
      v-for="tag in ALL_TAGS"
      :key="tag"
      :class="['filter-badge', `tag-${tag}`, { active: selectionOrder.has(tag) }]"
      @click="emit('toggle', tag)"
    >
      <span v-if="selectionOrder.has(tag)" class="order-badge">
        {{ selectionOrder.get(tag) }}
      </span>
      {{ tagLabels[tag] }}: {{ counts[tag] }}
    </button>
  </div>
</template>

<style scoped>
.tag-filter {
  display: flex;
  gap: 0.5rem;
  padding: 1rem;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.filter-badge {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 500;
  opacity: 0.45;
  transition: opacity 0.15s, transform 0.15s;
}

.filter-badge:hover {
  opacity: 0.7;
}

.filter-badge.active {
  opacity: 1;
  transform: scale(1.05);
}

.order-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.125rem;
  height: 1.125rem;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.2);
  color: inherit;
  font-size: 0.625rem;
  font-weight: 700;
  line-height: 1;
}
</style>
