<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useProjects, type Project } from '../composables/useProjects'
import ChatPanel from '../components/ChatPanel.vue'
import FilesPanel from '../components/FilesPanel.vue'
import ImageViewer from '../components/ImageViewer.vue'
import SvgEditorModal from '../components/svg-editor/SvgEditorModal.vue'

const props = defineProps<{
  id: string
}>()

const router = useRouter()
const { getProject } = useProjects()

const project = ref<Project | null>(null)
const activeTab = ref<'chat' | 'files'>('chat')
const viewingImage = ref<string | null>(null)
const editingSvg = ref<string | null>(null)

onMounted(async () => {
  try {
    project.value = await getProject(props.id)
  } catch {
    router.replace('/')
  }
})

const handleBack = () => {
  router.push('/')
}

const handleFileClick = (filename: string, type: string) => {
  if (type === 'png') {
    viewingImage.value = filename
  } else if (type === 'svg') {
    editingSvg.value = filename
  }
}
</script>

<template>
  <div class="project-view" v-if="project">
    <!-- Header -->
    <header class="header">
      <button class="header-back" @click="handleBack">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <h1 class="header-title">{{ project.name }}</h1>
    </header>

    <!-- Content -->
    <div class="content-with-nav">
      <ChatPanel
        v-if="activeTab === 'chat'"
        :project-id="id"
      />
      <FilesPanel
        v-else
        :project-id="id"
        @file-click="handleFileClick"
      />
    </div>

    <!-- Bottom Nav -->
    <nav class="bottom-nav">
      <button
        :class="{ active: activeTab === 'chat' }"
        @click="activeTab = 'chat'"
        data-tab="chat"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        Chat
      </button>
      <button
        :class="{ active: activeTab === 'files' }"
        @click="activeTab = 'files'"
        data-tab="files"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
        Files
      </button>
    </nav>

    <!-- Image Viewer -->
    <ImageViewer
      v-if="viewingImage"
      :project-id="id"
      :filename="viewingImage"
      @close="viewingImage = null"
    />

    <!-- SVG Editor -->
    <SvgEditorModal
      v-if="editingSvg"
      :project-id="id"
      :filename="editingSvg"
      @close="editingSvg = null"
    />
  </div>
</template>

<style scoped>
.project-view {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.header svg {
  width: 1.5rem;
  height: 1.5rem;
}
</style>
