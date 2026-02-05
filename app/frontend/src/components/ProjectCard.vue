<script setup lang="ts">
import { ref } from 'vue'
import type { Project } from '../composables/useProjects'

const props = defineProps<{
  project: Project
}>()

const emit = defineEmits<{
  click: []
  longpress: [project: Project]
}>()

const longPressTimer = ref<number | null>(null)
const isLongPress = ref(false)

const DATA_BASE = 'http://localhost:8000/data'

const thumbnailUrl = props.project.thumbnail
  ? `${DATA_BASE}/${props.project.id}/${props.project.thumbnail}`
  : null

const handlePointerDown = () => {
  isLongPress.value = false
  longPressTimer.value = window.setTimeout(() => {
    isLongPress.value = true
    emit('longpress', props.project)
  }, 500)
}

const handlePointerUp = () => {
  if (longPressTimer.value) {
    clearTimeout(longPressTimer.value)
    longPressTimer.value = null
  }
  if (!isLongPress.value) {
    emit('click')
  }
}

const handlePointerLeave = () => {
  if (longPressTimer.value) {
    clearTimeout(longPressTimer.value)
    longPressTimer.value = null
  }
}
</script>

<template>
  <div
    class="project-card"
    :data-project="project.id"
    @pointerdown="handlePointerDown"
    @pointerup="handlePointerUp"
    @pointerleave="handlePointerLeave"
  >
    <div class="card-thumbnail">
      <img v-if="thumbnailUrl" :src="thumbnailUrl" :alt="project.name" />
      <div v-else class="placeholder">
        <span>📄</span>
      </div>
    </div>
    <div class="card-content">
      <div class="card-name">{{ project.name }}</div>
      <span :class="['tag', `tag-${project.tag}`]">
        {{ project.tag.replace('_', ' ') }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.project-card {
  background: var(--card-bg);
  border-radius: 0.75rem;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
  user-select: none;
}

.project-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.project-card:active {
  transform: scale(0.98);
}

.card-thumbnail {
  aspect-ratio: 1;
  background: var(--border);
  overflow: hidden;
}

.card-thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
  background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);
}

.card-content {
  padding: 0.75rem;
}

.card-name {
  font-weight: 500;
  font-size: 0.875rem;
  margin-bottom: 0.5rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
