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

const handleMouseDown = (e: MouseEvent) => {
  if (e.button === 1 || isSpacePressed.value) {
    // Middle click or space - start pan
    isPanning.value = true
    lastPanPoint.value = { x: e.clientX, y: e.clientY }
    return
  }

  const point = getCanvasPoint(e)

  switch (editor.currentTool.value) {
    case 'draw':
      isDrawing.value = true
      currentPath.value = [point]
      break
    case 'bubble':
      editor.addBubble('oval')
      break
    case 'thought':
      editor.addBubble('thought')
      break
  }
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
  const newZoom = Math.min(Math.max(0.25, editor.zoom.value * delta), 4)

  // Zoom toward cursor
  const rect = canvasRef.value?.getBoundingClientRect()
  if (rect) {
    const cx = (e.clientX - rect.left) / rect.width * editor.CANVAS_SIZE
    const cy = (e.clientY - rect.top) / rect.height * editor.CANVAS_SIZE

    const scale = newZoom / editor.zoom.value
    editor.panX.value = cx - (cx - editor.panX.value) * scale
    editor.panY.value = cy - (cy - editor.panY.value) * scale
  }

  editor.zoom.value = newZoom
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
  if (editor.currentTool.value === 'select' || editor.currentTool.value === 'bubble' || editor.currentTool.value === 'thought') {
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
      :width="editor.CANVAS_SIZE"
      :height="editor.CANVAS_SIZE"
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
        <template v-if="bubble.type === 'oval'">
          <!-- Tail (behind ellipse) -->
          <polygon
            :points="`${bubble.x + bubble.width/2 - 10},${bubble.y + bubble.height * 0.8} ${bubble.x + bubble.width/2 + 10},${bubble.y + bubble.height * 0.8} ${bubble.tailX},${bubble.tailY}`"
            stroke="black"
            stroke-width="2"
            fill="white"
          />
          <!-- Ellipse -->
          <ellipse
            :cx="bubble.x + bubble.width / 2"
            :cy="bubble.y + bubble.height / 2"
            :rx="bubble.width / 2"
            :ry="bubble.height / 2"
            stroke="black"
            stroke-width="2"
            fill="white"
          />
        </template>
        <template v-else>
          <!-- Thought bubble -->
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
          <!-- Thought circles -->
          <circle
            :cx="bubble.x + bubble.width / 2"
            :cy="bubble.y + bubble.height + 15"
            r="8"
            stroke="black"
            stroke-width="2"
            fill="white"
          />
          <circle
            :cx="bubble.tailX"
            :cy="bubble.tailY - 10"
            r="5"
            stroke="black"
            stroke-width="2"
            fill="white"
          />
        </template>
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
g.selected ellipse,
g.selected rect {
  stroke: #4f46e5;
  stroke-width: 3;
}

path:hover,
g:hover ellipse,
g:hover rect:first-child {
  stroke: #6366f1;
}
</style>
