<!-- Home page: project cards grid with multi-select tag filtering. -->
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useProjects, ALL_TAGS, DEFAULT_SELECTED_TAGS, type Tag } from '../composables/useProjects'
import ProjectCard from '../components/ProjectCard.vue'
import TagFilter from '../components/TagFilter.vue'
import CreateProjectModal from '../components/CreateProjectModal.vue'

const router = useRouter()
const { loading, fetchProjects, createProject, updateProject, tagCounts, filterByTags } = useProjects()

const selectedTags = ref<Tag[]>([...DEFAULT_SELECTED_TAGS])
const showCreateModal = ref(false)
const editingProject = ref<{ id: string; name: string; tag: Tag } | null>(null)

const filteredProjects = computed(() => filterByTags(selectedTags.value))

onMounted(async () => {
  await fetchProjects()
})

const handleTagToggle = (tag: Tag) => {
  const idx = selectedTags.value.indexOf(tag)
  if (idx >= 0) {
    selectedTags.value = selectedTags.value.filter(t => t !== tag)
  } else {
    selectedTags.value = [...selectedTags.value, tag]
  }
}

const handleProjectClick = (id: string) => {
  router.push(`/project/${id}`)
}

const handleProjectLongPress = (project: { id: string; name: string; tag: Tag }) => {
  editingProject.value = { ...project }
}

const handleCreateProject = async (name: string, tag: Tag) => {
  await createProject(name, tag)
  showCreateModal.value = false
}

const handleUpdateProject = async () => {
  if (editingProject.value) {
    await updateProject(editingProject.value.id, {
      name: editingProject.value.name,
      tag: editingProject.value.tag,
    })
    editingProject.value = null
  }
}
</script>

<template>
  <div class="home">
    <!-- Header -->
    <header class="home-header">
      <h1>incatpacitated</h1>
    </header>

    <!-- Tag filters -->
    <TagFilter
      :counts="tagCounts"
      :selected-tags="selectedTags"
      @toggle="handleTagToggle"
    />

    <!-- Projects grid -->
    <div class="container content-with-nav">
      <div v-if="loading" class="loading">Loading...</div>
      <div v-else-if="filteredProjects.length === 0" class="empty">
        No projects found. Create one!
      </div>
      <div v-else class="cards-grid">
        <ProjectCard
          v-for="project in filteredProjects"
          :key="project.id"
          :project="project"
          @click="handleProjectClick(project.id)"
          @longpress="handleProjectLongPress(project)"
        />
      </div>
    </div>

    <!-- FAB -->
    <button class="fab" @click="showCreateModal = true" id="new-project-btn">
      +
    </button>

    <!-- Create Modal -->
    <CreateProjectModal
      v-if="showCreateModal"
      @close="showCreateModal = false"
      @create="handleCreateProject"
    />

    <!-- Edit Modal -->
    <div v-if="editingProject" class="modal-overlay" @click.self="editingProject = null">
      <div class="modal">
        <div class="modal-header">
          <h2 class="modal-title">Edit Project</h2>
          <button class="modal-close" @click="editingProject = null">×</button>
        </div>
        <div class="form-group">
          <label>Name</label>
          <input
            v-model="editingProject.name"
            class="input"
            placeholder="Project name"
          />
        </div>
        <div class="form-group">
          <label>Tag</label>
          <div class="tag-options">
            <button
              v-for="tag in ALL_TAGS"
              :key="tag"
              :class="['tag', `tag-${tag}`, { active: editingProject.tag === tag }]"
              @click="editingProject.tag = tag"
            >
              {{ tag.replace('_', ' ') }}
            </button>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="editingProject = null">Cancel</button>
          <button class="btn btn-primary" @click="handleUpdateProject">Save</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.home-header {
  background: var(--card-bg);
  padding: 1rem;
  border-bottom: 1px solid var(--border);
}

.home-header h1 {
  font-size: 1.5rem;
  font-weight: 700;
  margin: 0;
}

.loading,
.empty {
  text-align: center;
  padding: 3rem 1rem;
  color: var(--text-muted);
}

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
</style>
