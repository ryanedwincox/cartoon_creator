<script setup lang="ts">
import type { Tag } from '../composables/useProjects'

defineProps<{
  counts: Record<Tag, number>
  selected: Tag | null
}>()

const emit = defineEmits<{
  select: [tag: Tag]
}>()

const tags: Tag[] = ['in_progress', 'completed', 'discarded', 'refs']

const tagLabels: Record<Tag, string> = {
  in_progress: 'in progress',
  completed: 'completed',
  discarded: 'discarded',
  refs: 'refs',
}
</script>

<template>
  <div class="tag-filter">
    <button
      v-for="tag in tags"
      :key="tag"
      :class="['filter-badge', `tag-${tag}`, { active: selected === tag }]"
      @click="emit('select', tag)"
    >
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
  padding: 0.375rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 500;
  opacity: 0.6;
  transition: opacity 0.15s, transform 0.15s;
}

.filter-badge:hover {
  opacity: 0.8;
}

.filter-badge.active {
  opacity: 1;
  transform: scale(1.05);
}
</style>
