<!-- ImageViewer: Full-screen zoomable image viewer with pinch/scroll zoom, pan, and arrow-button navigation. -->
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useKeyboardNavigation } from '../composables/useKeyboardNavigation'
import NavButton from './NavButton.vue'

const props = defineProps<{
  projectId: string
  filename: string
  mtime?: number | null
  hasPrev: boolean
  hasNext: boolean
}>()

const emit = defineEmits<{
  close: []
  navigate: [direction: -1 | 1]
}>()

const DATA_BASE = '/data'
const imageUrl = computed(() => {
  const basePath = `${DATA_BASE}/${props.projectId}/${props.filename}`
  return props.mtime ? `${basePath}?v=${props.mtime}` : basePath
})

const scale = ref(1)
const translateX = ref(0)
const translateY = ref(0)

const initialDistance = ref(0)
const initialScale = ref(1)
const isDragging = ref(false)
const lastX = ref(0)
const lastY = ref(0)

const containerRef = ref<HTMLElement | null>(null)

useKeyboardNavigation((dir) => emit('navigate', dir), {
  enabledWhen: () => scale.value <= 1,
})

const handleTouchStart = (e: TouchEvent) => {
  if (e.touches.length === 2) {
    // Pinch start
    const dx = e.touches[0].clientX - e.touches[1].clientX
    const dy = e.touches[0].clientY - e.touches[1].clientY
    initialDistance.value = Math.sqrt(dx * dx + dy * dy)
    initialScale.value = scale.value
  } else if (e.touches.length === 1 && scale.value > 1) {
    // Pan start (zoomed in)
    isDragging.value = true
    lastX.value = e.touches[0].clientX
    lastY.value = e.touches[0].clientY
  }
}

const handleTouchMove = (e: TouchEvent) => {
  if (e.touches.length === 2) {
    // Pinch zoom
    const dx = e.touches[0].clientX - e.touches[1].clientX
    const dy = e.touches[0].clientY - e.touches[1].clientY
    const distance = Math.sqrt(dx * dx + dy * dy)
    const newScale = initialScale.value * (distance / initialDistance.value)
    scale.value = Math.min(Math.max(0.5, newScale), 5)
  } else if (e.touches.length === 1 && isDragging.value && scale.value > 1) {
    // Pan
    const dx = e.touches[0].clientX - lastX.value
    const dy = e.touches[0].clientY - lastY.value
    translateX.value += dx
    translateY.value += dy
    lastX.value = e.touches[0].clientX
    lastY.value = e.touches[0].clientY
  }
}

const handleTouchEnd = () => {
  isDragging.value = false
}

const handleWheel = (e: WheelEvent) => {
  e.preventDefault()
  const delta = e.deltaY > 0 ? 0.9 : 1.1
  scale.value = Math.min(Math.max(0.5, scale.value * delta), 5)
}

const resetZoom = () => {
  scale.value = 1
  translateX.value = 0
  translateY.value = 0
}

onMounted(() => {
  containerRef.value?.addEventListener('wheel', handleWheel, { passive: false })
})

onUnmounted(() => {
  containerRef.value?.removeEventListener('wheel', handleWheel)
})
</script>

<template>
  <div class="image-viewer">
    <header class="image-viewer-header">
      <button class="close-btn" @click="emit('close')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
      <span class="filename">{{ filename }}</span>
      <button class="reset-btn" @click="resetZoom" v-if="scale !== 1">
        Reset
      </button>
      <span v-else />
    </header>

    <div
      ref="containerRef"
      class="image-viewer-content"
      @touchstart="handleTouchStart"
      @touchmove="handleTouchMove"
      @touchend="handleTouchEnd"
    >
      <img
        :src="imageUrl"
        :alt="filename"
        :style="{
          transform: `scale(${scale}) translate(${translateX / scale}px, ${translateY / scale}px)`,
        }"
      />
    </div>

    <div class="nav-overlay">
      <NavButton :direction="-1" :disabled="!hasPrev" @click="emit('navigate', -1)" />
      <NavButton :direction="1" :disabled="!hasNext" @click="emit('navigate', 1)" />
    </div>
  </div>
</template>

<style scoped>
.image-viewer {
  position: fixed;
  inset: 0;
  background: black;
  z-index: 200;
  display: flex;
  flex-direction: column;
}

.image-viewer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem;
  background: rgba(0, 0, 0, 0.5);
  color: white;
}

.close-btn,
.reset-btn {
  background: none;
  color: white;
  padding: 0.5rem;
}

.close-btn svg {
  width: 1.5rem;
  height: 1.5rem;
}

.reset-btn {
  font-size: 0.875rem;
}

.filename {
  font-size: 0.875rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.image-viewer-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  touch-action: none;
}

.image-viewer-content img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  transition: transform 0.1s ease-out;
}

.nav-overlay {
  position: absolute;
  bottom: 2rem;
  left: 1rem;
  right: 1rem;
  display: flex;
  justify-content: space-between;
  pointer-events: none;
  color: white;
}

.nav-overlay > * {
  pointer-events: auto;
}
</style>
