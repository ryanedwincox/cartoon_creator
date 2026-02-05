<script setup lang="ts">
import { onMounted } from 'vue'
import { useFiles, type FileType } from '../composables/useFiles'

const props = defineProps<{
  projectId: string
}>()

const emit = defineEmits<{
  'file-click': [filename: string, type: FileType]
}>()

const { files, loading, loadFiles } = useFiles(props.projectId)

onMounted(() => {
  loadFiles()
})

const getIcon = (type: FileType): string => {
  switch (type) {
    case 'png': return '🖼️'
    case 'svg': return '🎨'
    case 'json': return '📄'
    default: return '📁'
  }
}

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
</script>

<template>
  <div class="files-panel">
    <div v-if="loading" class="loading">Loading files...</div>

    <div v-else-if="files.length === 0" class="empty">
      No files yet. Start chatting to generate images!
    </div>

    <div v-else class="file-list">
      <div
        v-for="file in files"
        :key="file.name"
        :class="['file-item', { hidden: file.is_hidden }]"
        :data-file="file.name"
        @click="emit('file-click', file.name, file.type)"
      >
        <span class="file-icon">{{ getIcon(file.type) }}</span>
        <div class="file-info">
          <div class="file-name">{{ file.name }}</div>
          <div class="file-size">{{ formatSize(file.size) }}</div>
        </div>
        <svg class="file-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 18l6-6-6-6" />
        </svg>
      </div>
    </div>
  </div>
</template>

<style scoped>
.files-panel {
  padding: 1rem;
}

.loading,
.empty {
  text-align: center;
  color: var(--text-muted);
  padding: 3rem 1rem;
}

.file-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: var(--card-bg);
  border-radius: 0.75rem;
  cursor: pointer;
  transition: background 0.15s;
}

.file-item:hover {
  background: var(--border);
}

.file-item.hidden {
  opacity: 0.5;
}

.file-icon {
  font-size: 1.5rem;
}

.file-info {
  flex: 1;
  min-width: 0;
}

.file-name {
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-size {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.file-chevron {
  width: 1.25rem;
  height: 1.25rem;
  color: var(--text-muted);
}
</style>
