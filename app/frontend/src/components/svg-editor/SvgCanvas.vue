<!-- [Component]: Interactive SVG drawing canvas. Responsible for mouse/keyboard event handling, viewport pan/zoom, and rendering editor state. NOT concerned with data persistence or editor business logic. -->
<script setup lang="ts">
import { ref, inject, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import type { Point } from '../../composables/useSvgEditor'

const editor = inject('svgEditor') as ReturnType<typeof import('../../composables/useSvgEditor').useSvgEditor>

const canvasRef = ref<SVGSVGElement | null>(null)
const textInputRef = ref<HTMLInputElement | null>(null)
const isDrawing = ref(false)
const currentPath = ref<Point[]>([])
const isPanning = ref(false)
const lastPanPoint = ref<Point>({ x: 0, y: 0 })
const isSpacePressed = ref(false)

// Drag state for moving selected elements
const isDragging = ref(false)
const dragStartSvg = ref<Point>({ x: 0, y: 0 })
const lastDragSvg = ref<Point>({ x: 0, y: 0 })
const dragStartedOnId = ref<string | null>(null)
const dragDidMove = ref(false)
const DRAG_THRESHOLD = 3 // px in screen-space before drag activates

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

/** Convert screen-space coordinates to SVG viewBox coordinates via the current CTM. */
const screenToSvg = (screenX: number, screenY: number): Point | null => {
  const ctm = canvasRef.value?.getScreenCTM()
  if (!ctm) return null

  const inverse = ctm.inverse()
  return {
    x: inverse.a * screenX + inverse.c * screenY + inverse.e,
    y: inverse.b * screenX + inverse.d * screenY + inverse.f,
  }
}

const getCanvasPoint = (e: MouseEvent | Touch): Point | null => {
  return screenToSvg(e.clientX, e.clientY)
}

/** Apply zoom change anchored at a screen-space point so that point stays visually fixed. */
const applyZoomAtScreenPoint = (newZoom: number, screenX: number, screenY: number) => {
  const svgPoint = screenToSvg(screenX, screenY)
  if (svgPoint) {
    // Convert SVG viewBox coords to viewport-unit coords (pan-zoom space)
    const cx = svgPoint.x * editor.zoom.value + editor.panX.value
    const cy = svgPoint.y * editor.zoom.value + editor.panY.value

    const scale = newZoom / editor.zoom.value
    editor.panX.value = cx - (cx - editor.panX.value) * scale
    editor.panY.value = cy - (cy - editor.panY.value) * scale
  }
  editor.zoom.value = newZoom
}

/** Begin tool action at a canvas point. Shared by mouse and touch start handlers. */
const startToolAction = (point: Point | null) => {
  if (!point) return

  switch (editor.currentTool.value) {
    case 'select':
      editor.clearSelection()
      break
    case 'draw':
      isDrawing.value = true
      currentPath.value = [point]
      break
    case 'bubble':
      editor.addBubble()
      break
    case 'text':
      editor.commitTextEdit()
      editor.addText(point.x, point.y)
      nextTick(() => textInputRef.value?.focus())
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

  if (isDragging.value && editor.selectedIds.value.size > 0) {
    const svgPt = getCanvasPoint(e)
    if (!svgPt) return
    applyDragMove(svgPt)
    return
  }

  if (isDrawing.value && editor.currentTool.value === 'draw') {
    const point = getCanvasPoint(e)
    if (point) currentPath.value.push(point)
  }
}

const handleMouseUp = (e: MouseEvent) => {
  if (isPanning.value) {
    isPanning.value = false
    return
  }

  if (isDragging.value) {
    const id = dragStartedOnId.value
    if (!dragDidMove.value && id) {
      // No drag occurred — treat as a click for selection toggle
      if (e.shiftKey && editor.selectedIds.value.has(id)) {
        editor.selectedIds.value.delete(id)
      }
      // Non-shift click on already-selected: keep selection (allows re-clicking without deselect)
    }
    isDragging.value = false
    dragStartedOnId.value = null
    dragDidMove.value = false
    return
  }

  if (isDrawing.value && currentPath.value.length >= 1) {
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

  if (e.touches.length === 1 && isDragging.value && editor.selectedIds.value.size > 0) {
    const svgPt = getCanvasPoint(e.touches[0]!)
    if (!svgPt) return
    applyDragMove(svgPt)
    return
  }

  if (e.touches.length === 1 && isDrawing.value && editor.currentTool.value === 'draw') {
    const point = getCanvasPoint(e.touches[0]!)
    if (point) currentPath.value.push(point)
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

  if (isDragging.value) {
    isDragging.value = false
    dragStartedOnId.value = null
    dragDidMove.value = false
    isPanning.value = false
    activeTouchCount.value = e.touches.length
    return
  }

  if (isDrawing.value && currentPath.value.length >= 1) {
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

/** Apply drag movement from a new SVG point. Shared by mouse and touch move handlers. */
const applyDragMove = (svgPt: Point) => {
  if (!dragDidMove.value) {
    const svgDist = Math.sqrt(
      (svgPt.x - dragStartSvg.value.x) ** 2 + (svgPt.y - dragStartSvg.value.y) ** 2,
    )
    if (svgDist * editor.zoom.value < DRAG_THRESHOLD) return

    editor.saveState()
    dragDidMove.value = true
  }

  const dx = svgPt.x - lastDragSvg.value.x
  const dy = svgPt.y - lastDragSvg.value.y
  editor.moveElements(editor.selectedIds.value, dx, dy)
  lastDragSvg.value = { ...svgPt }
}

/** Begin a potential drag on an element. Called from element mousedown/touchstart in select tool. */
const startElementDrag = (id: string, e: MouseEvent | Touch, shiftKey = false) => {
  const svgPt = getCanvasPoint(e)
  if (!svgPt) return

  // If clicking an unselected element without shift, select only this one
  if (!editor.selectedIds.value.has(id) && !shiftKey) {
    editor.selectedIds.value.clear()
    editor.selectedIds.value.add(id)
  } else if (!editor.selectedIds.value.has(id) && shiftKey) {
    editor.selectedIds.value.add(id)
  }
  // If clicking an already-selected element, we handle deselect on mouseup (if no drag)

  dragStartedOnId.value = id
  dragStartSvg.value = { ...svgPt }
  lastDragSvg.value = { ...svgPt }
  dragDidMove.value = false
  isDragging.value = true
}

/** Shared mousedown for any element — initiates drag in select tool. */
const handleElementMouseDown = (id: string, e: MouseEvent) => {
  if (editor.currentTool.value === 'select') {
    e.stopPropagation()
    startElementDrag(id, e, e.shiftKey)
  }
}

/** Shared touchstart for any element — initiates drag in select tool. */
const handleElementTouchStart = (id: string, e: TouchEvent) => {
  if (editor.currentTool.value === 'select' && e.touches.length === 1) {
    e.stopPropagation()
    activeTouchCount.value = 1
    startElementDrag(id, e.touches[0]!)
  }
}

const handlePathClick = (id: string, _e: MouseEvent) => {
  if (editor.currentTool.value === 'select') return
  if (editor.currentTool.value === 'erase') editor.deletePath(id)
  else if (editor.currentTool.value === 'node') editor.editingNodePath.value = id
}

const handleBubbleClick = (id: string, e: MouseEvent) => {
  if (editor.currentTool.value === 'bubble') editor.selectItem(id, e.shiftKey)
}

const handleTextClick = (id: string, e: MouseEvent) => {
  if (editor.currentTool.value === 'text') editor.selectItem(id, e.shiftKey)
  else if (editor.currentTool.value === 'erase') editor.deleteText(id)
}

const handleTextDblClick = (id: string) => {
  editor.editingTextId.value = id
  nextTick(() => textInputRef.value?.focus())
}

const handleTextInput = (e: Event) => {
  const id = editor.editingTextId.value
  if (!id) return
  editor.updateText(id, { content: (e.target as HTMLInputElement).value })
}

const handleTextInputKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === 'Escape') {
    e.preventDefault()
    editor.commitTextEdit()
  }
  // Stop propagation so editor keyboard shortcuts don't fire while typing
  e.stopPropagation()
}

// Commit text edit when switching tools
watch(editor.currentTool, () => {
  editor.commitTextEdit()
})

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('keyup', handleKeyUp)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('keyup', handleKeyUp)
})

function pointsToPath(points: Point[]): string {
  if (points.length === 0) return ''

  // Single point → zero-length line (renders as dot with stroke-linecap="round")
  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y} L ${points[0].x} ${points[0].y}`
  }

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

/** Compute a reasonable foreignObject width in SVG coordinates for text editing. */
const TEXT_INPUT_MIN_WIDTH = 120
const TEXT_INPUT_CHAR_WIDTH_FACTOR = 0.65
const TEXT_INPUT_PADDING = 20

const textInputWidth = (textItem: { content: string; fontSize: number }): number => {
  const contentWidth = Math.max(textItem.content.length, 8) * textItem.fontSize * TEXT_INPUT_CHAR_WIDTH_FACTOR + TEXT_INPUT_PADDING
  return Math.max(TEXT_INPUT_MIN_WIDTH, contentWidth)
}

const cursorStyle = computed(() => {
  if (isPanning.value || isSpacePressed.value) return 'grabbing'
  if (isDragging.value && dragDidMove.value) return 'grabbing'
  switch (editor.currentTool.value) {
    case 'draw': return 'crosshair'
    case 'erase': return 'pointer'
    case 'text': return 'text'
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
        @mousedown="handleElementMouseDown(path.id, $event)"
        @touchstart="handleElementTouchStart(path.id, $event)"
      />
    </g>

    <!-- Bubbles layer -->
    <g v-show="editor.layerVisibility.bubbles" id="bubbles-layer">
      <g
        v-for="bubble in editor.bubbles.value"
        :key="bubble.id"
        :class="{ selected: editor.selectedIds.value.has(bubble.id) }"
        @click.stop="handleBubbleClick(bubble.id, $event)"
        @mousedown="handleElementMouseDown(bubble.id, $event)"
        @touchstart="handleElementTouchStart(bubble.id, $event)"
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
      <!-- Bubble text -->
      <text
        v-for="bubble in editor.bubbles.value"
        :key="'text-' + bubble.id"
        :x="bubble.x + bubble.width / 2"
        :y="bubble.y + bubble.height / 2"
        text-anchor="middle"
        dominant-baseline="middle"
        :font-family="editor.DEFAULT_FONT_FAMILY"
        :font-size="editor.DEFAULT_FONT_SIZE"
        fill="black"
      >
        {{ bubble.text }}
      </text>

      <!-- Standalone text elements -->
      <g
        v-for="textItem in editor.texts.value"
        :key="textItem.id"
        :class="{ selected: editor.selectedIds.value.has(textItem.id) }"
      >
        <text
          v-if="editor.editingTextId.value !== textItem.id"
          :x="textItem.x"
          :y="textItem.y"
          :font-family="editor.DEFAULT_FONT_FAMILY"
          :font-size="textItem.fontSize"
          fill="black"
          @click.stop="handleTextClick(textItem.id, $event)"
          @mousedown="handleElementMouseDown(textItem.id, $event)"
          @touchstart="handleElementTouchStart(textItem.id, $event)"
          @dblclick.stop="handleTextDblClick(textItem.id)"
        >
          {{ textItem.content }}
        </text>

        <!-- Inline editing via foreignObject -->
        <foreignObject
          v-if="editor.editingTextId.value === textItem.id"
          :x="textItem.x"
          :y="textItem.y - textItem.fontSize"
          :width="textInputWidth(textItem)"
          :height="textItem.fontSize + 8"
        >
          <input
            ref="textInputRef"
            :value="textItem.content"
            class="text-inline-input"
            :style="{
              fontSize: textItem.fontSize + 'px',
              fontFamily: editor.DEFAULT_FONT_FAMILY,
            }"
            @input="handleTextInput"
            @keydown="handleTextInputKeydown"
            @blur="editor.commitTextEdit()"
            @mousedown.stop
          />
        </foreignObject>
      </g>
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
g.selected rect,
g.selected text {
  stroke: #4f46e5;
  stroke-width: 3;
  cursor: move;
}

g.selected > text {
  stroke: none;
  fill: #4f46e5;
}

path:hover,
g:hover rect {
  stroke: #6366f1;
}

.text-inline-input {
  width: 100%;
  height: 100%;
  border: 1px solid #4f46e5;
  background: white;
  outline: none;
  padding: 0 2px;
  box-sizing: border-box;
}
</style>
