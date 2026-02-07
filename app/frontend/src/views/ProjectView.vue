<!-- ProjectView: Agent chat and files interface for a single project. -->
<script setup lang="ts">
import { ref, provide, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useProjects, type Project } from '../composables/useProjects'
import { useFiles, FilesKey, VIEWABLE_TYPES, type FileType, type FileInfo } from '../composables/useFiles'
import ChatPanel from '../components/ChatPanel.vue'
import FilesPanel from '../components/FilesPanel.vue'
import ImageViewer from '../components/ImageViewer.vue'
import TextViewer from '../components/TextViewer.vue'
import SvgEditorModal from '../components/svg-editor/SvgEditorModal.vue'

const props = defineProps<{
  id: string
}>()

const router = useRouter()
const { getProject } = useProjects()
const filesContext = useFiles(props.id)
provide(FilesKey, filesContext)
const { files, loadFiles } = filesContext

const project = ref<Project | null>(null)
const activeTab = ref<'chat' | 'files'>('chat')
const viewingImage = ref<string | null>(null)
const viewingImageMtime = ref<number | null>(null)
const viewingText = ref<string | null>(null)
const editingSvg = ref<string | null>(null)

/** Viewable (non-hidden) files in display order, used for swipe navigation. */
const viewableFiles = computed<FileInfo[]>(() =>
  files.value.filter((f) => !f.is_hidden && VIEWABLE_TYPES.includes(f.type)),
)

onMounted(async () => {
  try {
    project.value = await getProject(props.id)
    await loadFiles()
  } catch (e) {
    console.error('Failed to load project', e)
    router.replace('/')
  }
})

const handleBack = () => {
  router.push('/')
}

const handleFileClick = (filename: string, type: FileType, mtime: number) => {
  if (type === 'png') {
    viewingImage.value = filename
    viewingImageMtime.value = mtime
  } else if (type === 'svg') {
    editingSvg.value = filename
  } else if (type === 'txt' || type === 'json') {
    viewingText.value = filename
  }
}

/** Open the file at the given offset relative to the currently-viewed file. */
const navigateFile = (direction: -1 | 1) => {
  const currentName = viewingImage.value ?? viewingText.value ?? editingSvg.value
  if (!currentName) return

  const list = viewableFiles.value
  const idx = list.findIndex((f) => f.name === currentName)
  if (idx === -1) return

  const nextIdx = idx + direction
  if (nextIdx < 0 || nextIdx >= list.length) return

  const next = list[nextIdx]
  if (!next) return

  // Clear all viewers
  viewingImage.value = null
  viewingImageMtime.value = null
  viewingText.value = null
  editingSvg.value = null

  // Open next directly
  if (next.type === 'png') {
    viewingImage.value = next.name
    viewingImageMtime.value = next.mtime
  } else if (next.type === 'svg') {
    editingSvg.value = next.name
  } else if (next.type === 'txt' || next.type === 'json') {
    viewingText.value = next.name
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
      :mtime="viewingImageMtime"
      @close="viewingImage = null"
      @navigate="navigateFile"
    />

    <!-- Text Viewer -->
    <TextViewer
      v-if="viewingText"
      :filename="viewingText"
      @close="viewingText = null"
      @navigate="navigateFile"
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
  /* dvh for mobile viewport, vh as fallback */
  height: 100vh;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.content-with-nav {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.header {
  position: static; /* flex layout handles pinning; override global sticky */
  flex-shrink: 0;
}

.header svg {
  width: 1.5rem;
  height: 1.5rem;
}
</style>
