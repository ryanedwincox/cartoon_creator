<script setup lang="ts">
import { ref } from 'vue'
import type { Tag } from '../composables/useProjects'

const emit = defineEmits<{
  close: []
  create: [name: string, tag: Tag]
}>()

const name = ref('')
const tag = ref<Tag>('in_progress')

const handleSubmit = () => {
  if (name.value.trim()) {
    emit('create', name.value.trim(), tag.value)
  }
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal">
      <div class="modal-header">
        <h2 class="modal-title">New Project</h2>
        <button class="modal-close" @click="emit('close')">×</button>
      </div>
      <form @submit.prevent="handleSubmit">
        <div class="form-group">
          <label for="project-name">Name</label>
          <input
            id="project-name"
            v-model="name"
            class="input"
            placeholder="My awesome comic"
            autofocus
          />
        </div>
        <div class="form-group">
          <label>Tag</label>
          <div class="tag-options">
            <button
              v-for="t in ['in_progress', 'completed', 'refs'] as Tag[]"
              :key="t"
              type="button"
              :class="['tag', `tag-${t}`, { active: tag === t }]"
              @click="tag = t"
            >
              {{ t.replace('_', ' ') }}
            </button>
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" @click="emit('close')">
            Cancel
          </button>
          <button type="submit" class="btn btn-primary" :disabled="!name.trim()">
            Create
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  font-weight: 500;
  margin-bottom: 0.5rem;
}

.tag-options {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.tag-options .tag {
  cursor: pointer;
  opacity: 0.5;
  transition: opacity 0.15s;
}

.tag-options .tag.active {
  opacity: 1;
}

.modal-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
  margin-top: 1.5rem;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
