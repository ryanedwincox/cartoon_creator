<!-- [Component]: Interactive SVG drawing canvas. Responsible for mouse/keyboard event handling, viewport pan/zoom, and rendering editor state. NOT concerned with data persistence or editor business logic. -->
<script setup lang="ts">
import { ref, inject, computed, onMounted, onUnmounted } from 'vue'
import type { Point } from '../../composables/useSvgEditor'

const editor = inject('svgEditor') as ReturnType<typeof import('../../composables/useSvgEditor').useSvgEditor>

const canvasRef = ref<SVGSVGElement | null>(null)
const isDrawing = ref(false)
const currentPath = ref<Point[]>([])
const isPanning = ref(false)
const lastPanPoint = ref<Point>({ x: 0, y: 0 })
const isSpacePressed = ref(false)

// Touch state for pinch zoom and touch pan
const activeTouchCount = ref(0)
const initialPinchDistance = ref(0)
const initialPinchZoom = ref(1)
const lastTouchMidpoint = ref<Point>({ x: 0, y: 0 })

const viewBox = computed(() => {
  const x = -editor.panX.value / editor.zoom.value
  const y = -editor.panY.value / editor.zoom.value
  const size = editor.CANVAS_SIZE / editor.zoom.value
  return `${x} ${y} ${size} ${size}`
})

const getCanvasPoint = (e: MouseEvent | Touch): Point => {
  if (!canvasRef.value) return { x: 0, y: 0 }

  const rect = canvasRef.value.getBoundingClientRect()
  const x = (e.clientX - rect.left) / rect.width * editor.CANVAS_SIZE / editor.zoom.value - editor.panX.value / editor.zoom.value
  const y = (e.clientY - rect.top) / rect.height * editor.CANVAS_SIZE / editor.zoom.value - editor.panY.value / editor.zoom.value

  return { x, y }
}

/** Apply zoom change anchored at a screen-space point so that point stays visually fixed. */
const applyZoomAtScreenPoint = (newZoom: number, screenX: number, screenY: number) => {
  const rect = canvasRef.value?.getBoundingClientRect()
  if (rect) {
    const cx = (screenX - rect.left) / rect.width * editor.CANVAS_SIZE
    const cy = (screenY - rect.top) / rect.height * editor.CANVAS_SIZE

    const scale = newZoom / editor.zoom.value
    editor.panX.value = cx - (cx - editor.panX.value) * scale
    editor.panY.value = cy - (cy - editor.panY.value) * scale
  }
  editor.zoom.value = newZoom
}

/** Begin tool action at a canvas point. Shared by mouse and touch start handlers. */
const startToolAction = (point: Point) => {
  switch (editor.currentTool.value) {
    case 'draw':
      isDrawing.value = true
      currentPath.value = [point]
      break
    case 'bubble':
      editor.addBubble()
      break
  }
}

const handleMouseDown = (e: MouseEvent) => {
  if (e.button === 1 || isSpacePressed.value) {
    // Middle click or space - start pan
    isPanning.value = true
    lastPanPoint.value = { x: e.clientX, y: e.clientY }
    return
  }

  startToolAction(getCanvasPoint(e))
}

const handleMouseMove = (e: MouseEvent) => {
  if (isPanning.value) {
    const dx = e.clientX - lastPanPoint.value.x
    const dy = e.clientY - lastPanPoint.value.y
    editor.panX.value += dx
    editor.panY.value += dy
    lastPanPoint.value = { x: e.clientX, y: e.clientY }
    return
  }

  if (isDrawing.value && editor.currentTool.value === 'draw') {
    const point = getCanvasPoint(e)
    currentPath.value.push(point)
  }
}

const handleMouseUp = () => {
  if (isPanning.value) {
    isPanning.value = false
    return
  }

  if (isDrawing.value && currentPath.value.length > 1) {
    const d = pointsToPath(currentPath.value)
    editor.addPath(d)
  }

  isDrawing.value = false
  currentPath.value = []
}

const handleWheel = (e: WheelEvent) => {
  e.preventDefault()
  const delta = e.deltaY > 0 ? 0.9 : 1.1
  const newZoom = Math.min(Math.max(editor.MIN_ZOOM, editor.zoom.value * delta), editor.MAX_ZOOM)
  applyZoomAtScreenPoint(newZoom, e.clientX, e.clientY)
}

const getTouchDistance = (t1: Touch, t2: Touch): number => {
  const dx = t1.clientX - t2.clientX
  const dy = t1.clientY - t2.clientY
  return Math.sqrt(dx * dx + dy * dy)
}

const getTouchMidpoint = (t1: Touch, t2: Touch): Point => ({
  x: (t1.clientX + t2.clientX) / 2,
  y: (t1.clientY + t2.clientY) / 2,
})

const handleTouchStart = (e: TouchEvent) => {
  activeTouchCount.value = e.touches.length

  if (e.touches.length === 2) {
    const t0 = e.touches[0]!
    const t1 = e.touches[1]!

    // Two-finger gesture: pinch zoom + pan — cancel any in-progress drawing
    isDrawing.value = false
    currentPath.value = []
    isPanning.value = true

    initialPinchDistance.value = getTouchDistance(t0, t1)
    initialPinchZoom.value = editor.zoom.value
    lastTouchMidpoint.value = getTouchMidpoint(t0, t1)
    return
  }

  if (e.touches.length === 1) {
    startToolAction(getCanvasPoint(e.touches[0]!))
  }
}

const handleTouchMove = (e: TouchEvent) => {
  if (e.touches.length === 2) {
    if (initialPinchDistance.value === 0) return

    const t0 = e.touches[0]!
    const t1 = e.touches[1]!
    const midpoint = getTouchMidpoint(t0, t1)

    // Two-finger pan: apply screen-space delta before zoom changes
    const dx = midpoint.x - lastTouchMidpoint.value.x
    const dy = midpoint.y - lastTouchMidpoint.value.y
    editor.panX.value += dx
    editor.panY.value += dy
    lastTouchMidpoint.value = midpoint

    // Pinch zoom toward midpoint
    const distance = getTouchDistance(t0, t1)
    const scaleFactor = distance / initialPinchDistance.value
    const newZoom = Math.min(
      Math.max(editor.MIN_ZOOM, initialPinchZoom.value * scaleFactor),
      editor.MAX_ZOOM,
    )
    applyZoomAtScreenPoint(newZoom, midpoint.x, midpoint.y)
    return
  }

  if (e.touches.length === 1 && isDrawing.value && editor.currentTool.value === 'draw') {
    const point = getCanvasPoint(e.touches[0]!)
    currentPath.value.push(point)
  }
}

const handleTouchEnd = (e: TouchEvent) => {
  // When lifting fingers from a two-finger gesture, don't trigger single-finger actions
  if (activeTouchCount.value >= 2) {
    if (e.touches.length === 0) {
      isPanning.value = false
      activeTouchCount.value = 0
    } else {
      activeTouchCount.value = e.touches.length
    }
    return
  }

  if (isDrawing.value && currentPath.value.length > 1) {
    const d = pointsToPath(currentPath.value)
    editor.addPath(d)
  }

  isDrawing.value = false
  currentPath.value = []
  isPanning.value = false
  activeTouchCount.value = e.touches.length
}

const handleKeyDown = (e: KeyboardEvent) => {
  if (e.code === 'Space') {
    isSpacePressed.value = true
  }
}

const handleKeyUp = (e: KeyboardEvent) => {
  if (e.code === 'Space') {
    isSpacePressed.value = false
  }
}

const handlePathClick = (id: string, e: MouseEvent) => {
  if (editor.currentTool.value === 'select') {
    editor.selectItem(id, e.shiftKey)
  } else if (editor.currentTool.value === 'erase') {
    editor.deletePath(id)
  } else if (editor.currentTool.value === 'node') {
    editor.editingNodePath.value = id
  }
}

const handleBubbleClick = (id: string, e: MouseEvent) => {
  if (editor.currentTool.value === 'select' || editor.currentTool.value === 'bubble') {
    editor.selectItem(id, e.shiftKey)
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('keyup', handleKeyUp)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('keyup', handleKeyUp)
})

function pointsToPath(points: Point[]): string {
  if (points.length < 2) return ''

  // Catmull-Rom spline smoothing
  let d = `M ${points[0].x} ${points[0].y}`

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(points.length - 1, i + 2)]

    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6

    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`
  }

  return d
}

const currentPathD = computed(() => pointsToPath(currentPath.value))

const cursorStyle = computed(() => {
  if (isPanning.value || isSpacePressed.value) return 'grabbing'
  switch (editor.currentTool.value) {
    case 'draw': return 'crosshair'
    case 'erase': return 'pointer'
    default: return 'default'
  }
})
</script>

<template>
  <svg
    ref="canvasRef"
    class="svg-canvas"
    :viewBox="viewBox"
    :style="{ cursor: cursorStyle }"
    @mousedown="handleMouseDown"
    @mousemove="handleMouseMove"
    @mouseup="handleMouseUp"
    @mouseleave="handleMouseUp"
    @wheel.prevent="handleWheel"
    @touchstart="handleTouchStart"
    @touchmove.prevent="handleTouchMove"
    @touchend="handleTouchEnd"
    @touchcancel="handleTouchEnd"
  >
    <!-- Canvas background -->
    <rect
      :x="-editor.panX.value / editor.zoom.value"
      :y="-editor.panY.value / editor.zoom.value"
      :width="editor.CANVAS_SIZE / editor.zoom.value"
      :height="editor.CANVAS_SIZE / editor.zoom.value"
      fill="white"
    />

    <!-- Canvas border -->
    <rect
      x="0"
      y="0"
      :width="editor.sourceWidth.value"
      :height="editor.sourceHeight.value"
      fill="white"
      stroke="#ccc"
      stroke-width="1"
    />

    <!-- Art layer -->
    <g v-show="editor.layerVisibility.art" id="art-layer">
      <path
        v-for="path in editor.paths.value"
        :key="path.id"
        :d="path.d"
        stroke="black"
        stroke-width="2"
        fill="none"
        stroke-linecap="round"
        stroke-linejoin="round"
        :class="{ selected: editor.selectedIds.value.has(path.id) }"
        @click.stop="handlePathClick(path.id, $event)"
      />
    </g>

    <!-- Bubbles layer -->
    <g v-show="editor.layerVisibility.bubbles" id="bubbles-layer">
      <g
        v-for="bubble in editor.bubbles.value"
        :key="bubble.id"
        :class="{ selected: editor.selectedIds.value.has(bubble.id) }"
        @click.stop="handleBubbleClick(bubble.id, $event)"
      >
        <!-- Tail (behind rect so rect covers the base) -->
        <polygon
          :points="editor.bubbleTailPoints(bubble)"
          stroke="black"
          stroke-width="2"
          fill="white"
        />
        <!-- Rounded rectangle -->
        <rect
          :x="bubble.x"
          :y="bubble.y"
          :width="bubble.width"
          :height="bubble.height"
          rx="20"
          ry="20"
          stroke="black"
          stroke-width="2"
          fill="white"
        />
      </g>
    </g>

    <!-- Text layer -->
    <g v-show="editor.layerVisibility.text" id="text-layer">
      <text
        v-for="bubble in editor.bubbles.value"
        :key="'text-' + bubble.id"
        :x="bubble.x + bubble.width / 2"
        :y="bubble.y + bubble.height / 2"
        text-anchor="middle"
        dominant-baseline="middle"
        font-family="Comic Sans MS, cursive"
        font-size="14"
        fill="black"
      >
        {{ bubble.text }}
      </text>
    </g>

    <!-- Current drawing path -->
    <path
      v-if="isDrawing && currentPathD"
      :d="currentPathD"
      stroke="black"
      stroke-width="2"
      fill="none"
      stroke-linecap="round"
      stroke-linejoin="round"
      opacity="0.5"
    />

    <!-- Selection indicators -->
    <g class="selection-indicators">
      <rect
        v-for="id in editor.selectedIds.value"
        :key="'sel-' + id"
        class="selection-box"
      />
    </g>
  </svg>
</template>

<style scoped>
.svg-canvas {
  width: 100%;
  height: 100%;
  max-width: 100%;
  max-height: 100%;
  touch-action: none;
}

path.selected,
g.selected rect {
  stroke: #4f46e5;
  stroke-width: 3;
}

path:hover,
g:hover rect {
  stroke: #6366f1;
}
</style>
