<!-- [Component]: Interactive SVG drawing canvas. Responsible for mouse/keyboard event handling, viewport pan/zoom, and rendering editor state. NOT concerned with data persistence or editor business logic. -->
<script setup lang="ts">
import { ref, inject, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import type { Point, UndoState } from '../../composables/useSvgEditor'

const editor = inject('svgEditor') as ReturnType<typeof import('../../composables/useSvgEditor').useSvgEditor>

const canvasRef = ref<SVGSVGElement | null>(null)
const textInputRef = ref<HTMLTextAreaElement | null>(null)
const bubbleTextInputRef = ref<HTMLTextAreaElement | null>(null)
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

// Marquee selection state
const isMarqueeActive = ref(false)
const marqueeStartSvg = ref<Point>({ x: 0, y: 0 })
const marqueeCurrentSvg = ref<Point>({ x: 0, y: 0 })

const marqueeRect = computed(() => {
  const x1 = marqueeStartSvg.value.x
  const y1 = marqueeStartSvg.value.y
  const x2 = marqueeCurrentSvg.value.x
  const y2 = marqueeCurrentSvg.value.y
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  }
})

// Resize state for bounding box corner handles
const isResizing = ref(false)
const resizeHandleId = ref<string | null>(null)
const resizeAnchor = ref<Point>({ x: 0, y: 0 })
const resizeStartCorner = ref<Point>({ x: 0, y: 0 })
const resizeInitialDist = ref(0)
const resizeDidMove = ref(false)
const resizeSnapshot = ref<UndoState | null>(null)

// Bubble-specific resize state
const isBubbleResizing = ref(false)
const bubbleResizeHandleId = ref<string | null>(null)
const bubbleResizeAnchor = ref<Point>({ x: 0, y: 0 })
const bubbleResizeInitialDistX = ref(0)
const bubbleResizeInitialDistY = ref(0)
const bubbleResizeDidMove = ref(false)
const bubbleResizeSnapshot = ref<UndoState | null>(null)
const bubbleResizeConstraint = ref<'free' | 'x' | 'y'>('free')

// Tail drag state
const isDraggingTail = ref(false)
const draggingTailBubbleId = ref<string | null>(null)
const tailDragDidMove = ref(false)

// Touch state for pinch zoom and touch pan
const activeTouchCount = ref(0)
const initialPinchDistance = ref(0)
const initialPinchZoom = ref(1)
const lastTouchMidpoint = ref<Point>({ x: 0, y: 0 })

/** Pre-computed text lines and resolved fontSize keyed by bubble id — avoids redundant split/nullish in template. */
const bubbleTextLines = computed(() => {
  const map = new Map<string, { lines: string[]; fontSize: number }>()
  for (const bubble of editor.bubbles.value) {
    map.set(bubble.id, {
      lines: bubble.text.split('\n'),
      fontSize: bubble.fontSize ?? editor.DEFAULT_FONT_SIZE,
    })
  }
  return map
})

/** Compute tspan dy for a bubble text line, encapsulating the centering formula. */
const bubbleTspanDy = (bubbleId: string, lineIndex: number): number => {
  const data = bubbleTextLines.value.get(bubbleId)
  if (!data) return 0
  const { lines, fontSize } = data
  const lineHeight = fontSize * editor.LINE_HEIGHT_FACTOR
  if (lineIndex === 0) {
    return -(lines.length - 1) * lineHeight / 2 + fontSize * editor.BASELINE_MIDDLE_OFFSET
  }
  return lineHeight
}

/** Pre-computed text lines keyed by text item id. */
const textItemLines = computed(() => {
  const map = new Map<string, string[]>()
  for (const textItem of editor.texts.value) {
    map.set(textItem.id, textItem.content.split('\n'))
  }
  return map
})

const viewBox = computed(() => {
  const x = -editor.panX.value / editor.zoom.value
  const y = -editor.panY.value / editor.zoom.value
  const size = editor.CANVAS_SIZE / editor.zoom.value
  return `${x} ${y} ${size} ${size}`
})

/** Size of resize corner handles in SVG units (constant screen-pixel size regardless of zoom). */
const handleSizeSvg = computed(() => 8 / editor.zoom.value)

/** Stroke width for bounding box and handles in SVG units. */
const boundingBoxStroke = computed(() => 1.5 / editor.zoom.value)

/** Dash array for bounding box in SVG units. */
const boundingBoxDash = computed(() => `${4 / editor.zoom.value} ${3 / editor.zoom.value}`)

/** 4 corner handle descriptors derived from selectionBounds. Empty when no selection or wrong tool. */
const cornerHandles = computed(() => {
  const bounds = editor.selectionBounds.value
  if (!bounds) return []

  const { x, y, width, height } = bounds
  return [
    { id: 'nw', cx: x, cy: y, cursor: 'nwse-resize' },
    { id: 'ne', cx: x + width, cy: y, cursor: 'nesw-resize' },
    { id: 'sw', cx: x, cy: y + height, cursor: 'nesw-resize' },
    { id: 'se', cx: x + width, cy: y + height, cursor: 'nwse-resize' },
  ]
})

/** Detect when exactly one bubble is selected — enables bubble-specific handles. */
const singleSelectedBubble = computed(() => {
  if (editor.selectedIds.value.size !== 1) return null
  const id = editor.selectedIds.value.values().next().value as string
  return editor.bubbles.value.find(b => b.id === id) ?? null
})

/** Bounding box of the bubble rect only (excludes tail tip). */
const bubbleRectBounds = computed(() => {
  const b = singleSelectedBubble.value
  if (!b) return null
  return { x: b.x, y: b.y, width: b.width, height: b.height }
})

/** Active bounding box: bubble rect when single bubble selected, else generic selection bounds. */
const activeBounds = computed(() => bubbleRectBounds.value ?? editor.selectionBounds.value)

/** 8 handles (4 corners + 4 edge midpoints) on the single selected bubble's rect. */
const bubbleHandles = computed(() => {
  const b = singleSelectedBubble.value
  if (!b) return []
  const { x, y, width: w, height: h } = b
  return [
    { id: 'b-nw', cx: x,         cy: y,         cursor: 'nwse-resize', type: 'corner' as const },
    { id: 'b-ne', cx: x + w,     cy: y,         cursor: 'nesw-resize', type: 'corner' as const },
    { id: 'b-sw', cx: x,         cy: y + h,     cursor: 'nesw-resize', type: 'corner' as const },
    { id: 'b-se', cx: x + w,     cy: y + h,     cursor: 'nwse-resize', type: 'corner' as const },
    { id: 'b-n',  cx: x + w / 2, cy: y,         cursor: 'ns-resize',   type: 'edge' as const },
    { id: 'b-s',  cx: x + w / 2, cy: y + h,     cursor: 'ns-resize',   type: 'edge' as const },
    { id: 'b-e',  cx: x + w,     cy: y + h / 2, cursor: 'ew-resize',   type: 'edge' as const },
    { id: 'b-w',  cx: x,         cy: y + h / 2, cursor: 'ew-resize',   type: 'edge' as const },
  ]
})

/** Tail drag handle position — only visible when a single bubble is selected. */
const tailHandle = computed(() => {
  const b = singleSelectedBubble.value
  if (!b) return null
  return { cx: b.tailX, cy: b.tailY }
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

interface Rect { x: number; y: number; width: number; height: number }

/** Get bounding box of a rendered SVG element by its data-element-id. */
const getElementBounds = (id: string): Rect | null => {
  const el = canvasRef.value?.querySelector(
    `[data-element-id="${id}"]`,
  ) as SVGGraphicsElement | null
  if (!el) return null
  const bbox = el.getBBox()
  return { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height }
}

/** Test whether two axis-aligned rectangles intersect. */
const rectsIntersect = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width && a.x + a.width > b.x
  && a.y < b.y + b.height && a.y + a.height > b.y

/** Collect IDs of elements whose bounding box intersects the given rectangle. */
const collectHits = (elements: { id: string }[], rect: Rect): string[] =>
  elements.filter(el => {
    const b = getElementBounds(el.id)
    return b && rectsIntersect(rect, b)
  }).map(el => el.id)

/** Find all element IDs whose bounding box intersects the given rectangle. */
const findElementsInRect = (rect: Rect): string[] => [
  ...(editor.layerVisibility.art ? collectHits(editor.paths.value, rect) : []),
  ...(editor.layerVisibility.bubbles ? collectHits(editor.bubbles.value, rect) : []),
  ...(editor.layerVisibility.text ? collectHits(editor.texts.value, rect) : []),
]

/** Finalize a marquee drag: select intersecting elements or clear selection on small drag. */
const finalizeMarquee = () => {
  isMarqueeActive.value = false
  const dx = marqueeCurrentSvg.value.x - marqueeStartSvg.value.x
  const dy = marqueeCurrentSvg.value.y - marqueeStartSvg.value.y
  const svgDist = Math.sqrt(dx * dx + dy * dy)

  // Small drag = click on empty canvas → clear; real drag → select intersecting elements
  if (svgDist * editor.zoom.value < DRAG_THRESHOLD) {
    editor.clearSelection()
  } else {
    editor.setSelection(findElementsInRect(marqueeRect.value))
  }
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
      isMarqueeActive.value = true
      marqueeStartSvg.value = { ...point }
      marqueeCurrentSvg.value = { ...point }
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

  if (isBubbleResizing.value) {
    const svgPt = getCanvasPoint(e)
    if (svgPt) applyBubbleResize(svgPt)
    return
  }

  if (isDraggingTail.value) {
    const svgPt = getCanvasPoint(e)
    if (svgPt) applyTailDrag(svgPt)
    return
  }

  if (isResizing.value) {
    const svgPt = getCanvasPoint(e)
    if (svgPt) applyResize(svgPt)
    return
  }

  if (isDragging.value && editor.selectedIds.value.size > 0) {
    const svgPt = getCanvasPoint(e)
    if (!svgPt) return
    applyDragMove(svgPt)
    return
  }

  if (isMarqueeActive.value) {
    const svgPt = getCanvasPoint(e)
    if (svgPt) marqueeCurrentSvg.value = { ...svgPt }
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

  if (isBubbleResizing.value) {
    resetBubbleResizeState()
    return
  }

  if (isDraggingTail.value) {
    resetTailDragState()
    return
  }

  if (isResizing.value) {
    resetResizeState()
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

  if (isMarqueeActive.value) {
    finalizeMarquee()
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

    // Two-finger gesture: pinch zoom + pan — cancel any in-progress drawing/marquee/resize
    isDrawing.value = false
    currentPath.value = []
    isMarqueeActive.value = false
    resetResizeState()
    resetBubbleResizeState()
    resetTailDragState()
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

  if (e.touches.length === 1 && isBubbleResizing.value) {
    const svgPt = getCanvasPoint(e.touches[0]!)
    if (svgPt) applyBubbleResize(svgPt)
    return
  }

  if (e.touches.length === 1 && isDraggingTail.value) {
    const svgPt = getCanvasPoint(e.touches[0]!)
    if (svgPt) applyTailDrag(svgPt)
    return
  }

  if (e.touches.length === 1 && isResizing.value) {
    const svgPt = getCanvasPoint(e.touches[0]!)
    if (svgPt) applyResize(svgPt)
    return
  }

  if (e.touches.length === 1 && isDragging.value && editor.selectedIds.value.size > 0) {
    const svgPt = getCanvasPoint(e.touches[0]!)
    if (!svgPt) return
    applyDragMove(svgPt)
    return
  }

  if (e.touches.length === 1 && isMarqueeActive.value) {
    const svgPt = getCanvasPoint(e.touches[0]!)
    if (svgPt) marqueeCurrentSvg.value = { ...svgPt }
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

  if (isBubbleResizing.value) {
    resetBubbleResizeState()
    isPanning.value = false
    activeTouchCount.value = e.touches.length
    return
  }

  if (isDraggingTail.value) {
    resetTailDragState()
    isPanning.value = false
    activeTouchCount.value = e.touches.length
    return
  }

  if (isResizing.value) {
    resetResizeState()
    isPanning.value = false
    activeTouchCount.value = e.touches.length
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

  if (isMarqueeActive.value) {
    finalizeMarquee()
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

/** Begin a resize drag from a corner handle. */
const startResize = (handleId: string) => {
  const bounds = editor.selectionBounds.value
  if (!bounds) return

  const { x, y, width, height } = bounds

  // Anchor is the opposite corner from the grabbed handle
  const anchorMap: Record<string, Point> = {
    nw: { x: x + width, y: y + height },
    ne: { x, y: y + height },
    sw: { x: x + width, y },
    se: { x, y },
  }
  const cornerMap: Record<string, Point> = {
    nw: { x, y },
    ne: { x: x + width, y },
    sw: { x, y: y + height },
    se: { x: x + width, y: y + height },
  }

  const anchor = anchorMap[handleId]!
  const corner = cornerMap[handleId]!

  const dx = corner.x - anchor.x
  const dy = corner.y - anchor.y
  const initialDist = Math.sqrt(dx * dx + dy * dy)

  // Guard: zero-area selection — abort resize
  if (initialDist < 0.001) return

  resizeHandleId.value = handleId
  resizeAnchor.value = { ...anchor }
  resizeStartCorner.value = { ...corner }
  resizeInitialDist.value = initialDist
  resizeDidMove.value = false
  resizeSnapshot.value = null
  isResizing.value = true
}

/** Apply resize movement from a new SVG point. */
const applyResize = (svgPt: Point) => {
  const anchor = resizeAnchor.value
  const startCorner = resizeStartCorner.value

  // Direction vector from anchor to original corner
  const dirX = startCorner.x - anchor.x
  const dirY = startCorner.y - anchor.y

  // Project current mouse vector onto anchor→corner direction
  const mouseX = svgPt.x - anchor.x
  const mouseY = svgPt.y - anchor.y
  const projectedDist = (mouseX * dirX + mouseY * dirY) / resizeInitialDist.value

  if (!resizeDidMove.value) {
    const svgDist = Math.sqrt(
      (svgPt.x - startCorner.x) ** 2 + (svgPt.y - startCorner.y) ** 2,
    )
    if (svgDist * editor.zoom.value < DRAG_THRESHOLD) return

    editor.saveState()
    resizeSnapshot.value = editor.createSnapshot()
    resizeDidMove.value = true
  }

  // Uniform scale factor — clamp to prevent inversion and extreme values
  const scale = Math.min(Math.max(projectedDist / resizeInitialDist.value, 0.05), 20)

  editor.scaleElements(
    editor.selectedIds.value,
    anchor.x,
    anchor.y,
    scale,
    scale,
    resizeSnapshot.value!,
  )
}

/** Reset all resize-related refs to idle state. */
const resetResizeState = () => {
  isResizing.value = false
  resizeHandleId.value = null
  resizeDidMove.value = false
  resizeSnapshot.value = null
}

/** Mousedown on a corner handle — start resize. */
const handleResizeMouseDown = (handleId: string, e: MouseEvent) => {
  e.stopPropagation()
  startResize(handleId)
}

/** Touchstart on a corner handle — start resize. */
const handleResizeTouchStart = (handleId: string, e: TouchEvent) => {
  if (e.touches.length === 1) {
    e.stopPropagation()
    activeTouchCount.value = 1
    startResize(handleId)
  }
}

/** Begin a bubble-specific resize from one of the 8 rect handles. */
const startBubbleResize = (handleId: string) => {
  const b = singleSelectedBubble.value
  if (!b) return
  const { x, y, width: w, height: h } = b
  let anchor: Point, grab: Point, constraint: 'free' | 'x' | 'y'
  switch (handleId) {
    case 'b-nw': anchor = { x: x + w, y: y + h }; grab = { x, y };               constraint = 'free'; break
    case 'b-ne': anchor = { x, y: y + h };         grab = { x: x + w, y };        constraint = 'free'; break
    case 'b-sw': anchor = { x: x + w, y };         grab = { x, y: y + h };        constraint = 'free'; break
    case 'b-se': anchor = { x, y };                 grab = { x: x + w, y: y + h }; constraint = 'free'; break
    case 'b-n':  anchor = { x, y: y + h };         grab = { x, y };               constraint = 'y'; break
    case 'b-s':  anchor = { x, y };                 grab = { x, y: y + h };        constraint = 'y'; break
    case 'b-e':  anchor = { x, y };                 grab = { x: x + w, y };        constraint = 'x'; break
    case 'b-w':  anchor = { x: x + w, y };         grab = { x, y };               constraint = 'x'; break
    default: return
  }
  const distX = grab.x - anchor.x
  const distY = grab.y - anchor.y
  if (constraint === 'free' && Math.abs(distX) < 0.001 && Math.abs(distY) < 0.001) return
  if (constraint === 'x' && Math.abs(distX) < 0.001) return
  if (constraint === 'y' && Math.abs(distY) < 0.001) return
  bubbleResizeHandleId.value = handleId
  bubbleResizeAnchor.value = { ...anchor }
  bubbleResizeInitialDistX.value = distX
  bubbleResizeInitialDistY.value = distY
  bubbleResizeDidMove.value = false
  bubbleResizeSnapshot.value = null
  bubbleResizeConstraint.value = constraint
  isBubbleResizing.value = true
}

/** Apply bubble-specific resize from a new SVG point. */
const applyBubbleResize = (svgPt: Point) => {
  const anchor = bubbleResizeAnchor.value
  const constraint = bubbleResizeConstraint.value
  if (!bubbleResizeDidMove.value) {
    const grabX = anchor.x + bubbleResizeInitialDistX.value
    const grabY = anchor.y + bubbleResizeInitialDistY.value
    const svgDist = Math.sqrt((svgPt.x - grabX) ** 2 + (svgPt.y - grabY) ** 2)
    if (svgDist * editor.zoom.value < DRAG_THRESHOLD) return
    editor.saveState()
    bubbleResizeSnapshot.value = editor.createSnapshot()
    bubbleResizeDidMove.value = true
  }
  let sx: number, sy: number
  if (constraint === 'free') {
    sx = (svgPt.x - anchor.x) / bubbleResizeInitialDistX.value
    sy = (svgPt.y - anchor.y) / bubbleResizeInitialDistY.value
  } else if (constraint === 'x') {
    sx = (svgPt.x - anchor.x) / bubbleResizeInitialDistX.value
    sy = 1.0
  } else {
    sx = 1.0
    sy = (svgPt.y - anchor.y) / bubbleResizeInitialDistY.value
  }
  sx = Math.min(Math.max(sx, 0.05), 20)
  sy = Math.min(Math.max(sy, 0.05), 20)
  editor.scaleElements(editor.selectedIds.value, anchor.x, anchor.y, sx, sy, bubbleResizeSnapshot.value!)
}

/** Reset bubble resize state to idle. */
const resetBubbleResizeState = () => {
  isBubbleResizing.value = false
  bubbleResizeHandleId.value = null
  bubbleResizeDidMove.value = false
  bubbleResizeSnapshot.value = null
}

/** Mousedown on a bubble rect handle — start bubble resize. */
const handleBubbleResizeMouseDown = (handleId: string, e: MouseEvent) => {
  e.stopPropagation()
  startBubbleResize(handleId)
}

/** Touchstart on a bubble rect handle — start bubble resize. */
const handleBubbleResizeTouchStart = (handleId: string, e: TouchEvent) => {
  if (e.touches.length === 1) {
    e.stopPropagation()
    activeTouchCount.value = 1
    startBubbleResize(handleId)
  }
}

/** Begin tail drag on a bubble. */
const startTailDrag = () => {
  const b = singleSelectedBubble.value
  if (!b) return
  draggingTailBubbleId.value = b.id
  isDraggingTail.value = true
  tailDragDidMove.value = false
}

/** Apply tail drag movement from a new SVG point. */
const applyTailDrag = (svgPt: Point) => {
  if (!tailDragDidMove.value) {
    const b = singleSelectedBubble.value
    if (!b) return
    const svgDist = Math.sqrt((svgPt.x - b.tailX) ** 2 + (svgPt.y - b.tailY) ** 2)
    if (svgDist * editor.zoom.value < DRAG_THRESHOLD) return
    editor.saveState()
    tailDragDidMove.value = true
  }
  const id = draggingTailBubbleId.value
  if (id) editor.updateBubble(id, { tailX: svgPt.x, tailY: svgPt.y })
}

/** Reset tail drag state to idle. */
const resetTailDragState = () => {
  isDraggingTail.value = false
  draggingTailBubbleId.value = null
  tailDragDidMove.value = false
}

/** Mousedown on the tail handle — start tail drag. */
const handleTailMouseDown = (e: MouseEvent) => {
  e.stopPropagation()
  startTailDrag()
}

/** Touchstart on the tail handle — start tail drag. */
const handleTailTouchStart = (e: TouchEvent) => {
  if (e.touches.length === 1) {
    e.stopPropagation()
    activeTouchCount.value = 1
    startTailDrag()
  }
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

const handleBubbleDblClick = (bubbleId: string) => {
  editor.editingTextBubble.value = bubbleId
  nextTick(() => bubbleTextInputRef.value?.focus())
}

const handleBubbleTextInput = (e: Event) => {
  const id = editor.editingTextBubble.value
  if (!id) return
  editor.updateBubble(id, { text: (e.target as HTMLTextAreaElement).value })
}

const handleBubbleTextKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    e.preventDefault()
    editor.commitTextEdit()
  }
  // Enter inserts newline (default textarea behavior) — don't prevent
  // Stop propagation so editor keyboard shortcuts don't fire while typing
  e.stopPropagation()
}

const handleTextInput = (e: Event) => {
  const id = editor.editingTextId.value
  if (!id) return
  editor.updateText(id, { content: (e.target as HTMLTextAreaElement).value })
}

const handleTextInputKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    e.preventDefault()
    editor.commitTextEdit()
  }
  // Enter inserts newline (default textarea behavior) — don't prevent
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
  const lines = textItem.content.split('\n')
  const longestLen = Math.max(...lines.map(l => l.length), 8)
  const contentWidth = longestLen * textItem.fontSize * TEXT_INPUT_CHAR_WIDTH_FACTOR + TEXT_INPUT_PADDING
  return Math.max(TEXT_INPUT_MIN_WIDTH, contentWidth)
}

const TEXT_INPUT_VERTICAL_PADDING = 8
const textInputHeight = (textItem: { content: string; fontSize: number }): number => {
  const lines = textItem.content.split('\n')
  return Math.max(1, lines.length) * textItem.fontSize * editor.LINE_HEIGHT_FACTOR + TEXT_INPUT_VERTICAL_PADDING
}

const cursorStyle = computed(() => {
  if (isPanning.value || isSpacePressed.value) return 'grabbing'
  if (isBubbleResizing.value) {
    const h = bubbleHandles.value.find(h => h.id === bubbleResizeHandleId.value)
    return h?.cursor ?? 'default'
  }
  if (isDraggingTail.value) return 'move'
  if (isResizing.value) {
    const handleId = resizeHandleId.value
    if (handleId === 'nw' || handleId === 'se') return 'nwse-resize'
    return 'nesw-resize'
  }
  if (isDragging.value && dragDidMove.value) return 'grabbing'
  if (isMarqueeActive.value) return 'crosshair'
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
    <!-- Viewport background (fills entire visible area with editor gray) -->
    <rect
      :x="-editor.panX.value / editor.zoom.value"
      :y="-editor.panY.value / editor.zoom.value"
      :width="editor.CANVAS_SIZE / editor.zoom.value"
      :height="editor.CANVAS_SIZE / editor.zoom.value"
      fill="#e5e7eb"
    />

    <!-- Canvas (white drawing area with subtle border) -->
    <rect
      x="0"
      y="0"
      :width="editor.sourceWidth.value"
      :height="editor.sourceHeight.value"
      fill="white"
      stroke="#d1d5db"
      stroke-width="1"
    />

    <!-- Art layer -->
    <g v-show="editor.layerVisibility.art" id="art-layer">
      <path
        v-for="path in editor.paths.value"
        :key="path.id"
        :data-element-id="path.id"
        :d="path.d"
        :fill="path.fill"
        :fill-rule="path.fillRule !== 'nonzero' ? path.fillRule : undefined"
        :stroke="path.stroke"
        :stroke-width="path.stroke !== 'none' ? path.strokeWidth : undefined"
        :stroke-linecap="path.stroke !== 'none' ? 'round' : undefined"
        :stroke-linejoin="path.stroke !== 'none' ? 'round' : undefined"
        :class="{ selected: editor.selectedIds.value.has(path.id) }"
        @click.stop="handlePathClick(path.id, $event)"
        @mousedown="handleElementMouseDown(path.id, $event)"
        @touchstart="handleElementTouchStart(path.id, $event)"
      />
    </g>

    <!-- Bubbles layer — rect, tail path -->
    <g v-show="editor.layerVisibility.bubbles" id="bubbles-layer">
      <g
        v-for="bubble in editor.bubbles.value"
        :key="bubble.id"
        :data-element-id="bubble.id"
        :class="{ selected: editor.selectedIds.value.has(bubble.id) }"
        @click.stop="handleBubbleClick(bubble.id, $event)"
        @mousedown="handleElementMouseDown(bubble.id, $event)"
        @touchstart="handleElementTouchStart(bubble.id, $event)"
      >
        <!-- Rounded rectangle -->
        <rect
          :x="bubble.x"
          :y="bubble.y"
          :width="bubble.width"
          :height="bubble.height"
          :rx="bubble.rx ?? editor.DEFAULT_BUBBLE_RX"
          :ry="bubble.ry ?? editor.DEFAULT_BUBBLE_RY"
          stroke="black"
          :stroke-width="bubble.strokeWidth ?? editor.DEFAULT_STROKE_WIDTH"
          fill="white"
        />
        <!-- Tail path -->
        <path
          :d="editor.bubbleTailPath(bubble)"
          fill="white"
          stroke="black"
          :stroke-width="bubble.strokeWidth ?? editor.DEFAULT_STROKE_WIDTH"
          stroke-linejoin="round"
        />
      </g>
    </g>

    <!-- Text layer -->
    <g v-show="editor.layerVisibility.text" id="text-layer">
      <!-- Bubble text -->
      <g v-for="bubble in editor.bubbles.value" :key="'text-' + bubble.id">
        <text
          v-if="editor.editingTextBubble.value !== bubble.id"
          :x="bubble.x + bubble.width / 2"
          :y="bubble.y + bubble.height / 2"
          text-anchor="middle"
          :font-family="bubble.fontFamily ?? editor.DEFAULT_FONT_FAMILY"
          :font-size="bubbleTextLines.get(bubble.id)?.fontSize ?? editor.DEFAULT_FONT_SIZE"
          :font-weight="bubble.fontWeight ?? editor.DEFAULT_FONT_WEIGHT"
          fill="black"
          @dblclick.stop="handleBubbleDblClick(bubble.id)"
        >
          <tspan
            v-for="(line, idx) in bubbleTextLines.get(bubble.id)?.lines"
            :key="idx"
            :x="bubble.x + bubble.width / 2"
            :dy="bubbleTspanDy(bubble.id, idx)"
          >{{ line || '\u00A0' }}</tspan>
        </text>

        <!-- Inline editing via foreignObject for bubble text -->
        <foreignObject
          v-if="editor.editingTextBubble.value === bubble.id"
          :x="bubble.x"
          :y="bubble.y"
          :width="bubble.width"
          :height="bubble.height"
        >
          <textarea
            ref="bubbleTextInputRef"
            :value="bubble.text"
            class="bubble-text-input"
            :style="{
              fontSize: (bubbleTextLines.get(bubble.id)?.fontSize ?? editor.DEFAULT_FONT_SIZE) + 'px',
              fontFamily: bubble.fontFamily ?? editor.DEFAULT_FONT_FAMILY,
              fontWeight: bubble.fontWeight ?? editor.DEFAULT_FONT_WEIGHT,
            }"
            @input="handleBubbleTextInput"
            @keydown="handleBubbleTextKeydown"
            @blur="editor.commitTextEdit()"
            @mousedown.stop
          />
        </foreignObject>
      </g>

      <!-- Standalone text elements -->
      <g
        v-for="textItem in editor.texts.value"
        :key="textItem.id"
        :data-element-id="textItem.id"
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
          <tspan
            v-for="(line, idx) in textItemLines.get(textItem.id)"
            :key="idx"
            :x="textItem.x"
            :dy="idx === 0 ? 0 : textItem.fontSize * editor.LINE_HEIGHT_FACTOR"
          >{{ line || '\u00A0' }}</tspan>
        </text>

        <!-- Inline editing via foreignObject -->
        <foreignObject
          v-if="editor.editingTextId.value === textItem.id"
          :x="textItem.x"
          :y="textItem.y - textItem.fontSize"
          :width="textInputWidth(textItem)"
          :height="textInputHeight(textItem)"
        >
          <textarea
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

    <!-- Marquee selection rectangle -->
    <rect
      v-if="isMarqueeActive && marqueeRect.width > 0 && marqueeRect.height > 0"
      :x="marqueeRect.x"
      :y="marqueeRect.y"
      :width="marqueeRect.width"
      :height="marqueeRect.height"
      class="marquee-rect"
      pointer-events="none"
    />

    <!-- Selection bounding box (uses bubble rect bounds when single bubble selected) -->
    <rect
      v-if="activeBounds"
      :x="activeBounds.x"
      :y="activeBounds.y"
      :width="activeBounds.width"
      :height="activeBounds.height"
      fill="none"
      stroke="#4f46e5"
      :stroke-width="boundingBoxStroke"
      :stroke-dasharray="boundingBoxDash"
      pointer-events="none"
    />

    <!-- Generic corner resize handles (hidden when single bubble selected) -->
    <template v-if="!singleSelectedBubble">
      <rect
        v-for="handle in cornerHandles"
        :key="handle.id"
        :x="handle.cx - handleSizeSvg / 2"
        :y="handle.cy - handleSizeSvg / 2"
        :width="handleSizeSvg"
        :height="handleSizeSvg"
        fill="white"
        stroke="#4f46e5"
        :stroke-width="boundingBoxStroke"
        :style="{ cursor: handle.cursor }"
        pointer-events="all"
        @mousedown.stop="handleResizeMouseDown(handle.id, $event)"
        @touchstart.stop="handleResizeTouchStart(handle.id, $event)"
      />
    </template>

    <!-- Bubble rect resize handles (8 handles: 4 corners + 4 edge midpoints) -->
    <rect
      v-for="handle in bubbleHandles"
      :key="handle.id"
      :x="handle.cx - handleSizeSvg / 2"
      :y="handle.cy - handleSizeSvg / 2"
      :width="handleSizeSvg"
      :height="handleSizeSvg"
      fill="white"
      stroke="#4f46e5"
      :stroke-width="boundingBoxStroke"
      :style="{ cursor: handle.cursor }"
      pointer-events="all"
      @mousedown.stop="handleBubbleResizeMouseDown(handle.id, $event)"
      @touchstart.stop="handleBubbleResizeTouchStart(handle.id, $event)"
    />

    <!-- Tail drag handle (yellow circle at tail tip) -->
    <circle
      v-if="tailHandle"
      :cx="tailHandle.cx"
      :cy="tailHandle.cy"
      :r="handleSizeSvg / 2"
      fill="#fbbf24"
      stroke="#4f46e5"
      :stroke-width="boundingBoxStroke"
      style="cursor: move"
      pointer-events="all"
      @mousedown.stop="handleTailMouseDown($event)"
      @touchstart.stop="handleTailTouchStart($event)"
    />
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

.marquee-rect {
  fill: rgba(79, 70, 229, 0.1);
  stroke: #4f46e5;
  stroke-width: 1;
  stroke-dasharray: 4 2;
}

.text-inline-input {
  width: 100%;
  height: 100%;
  border: 1px solid #4f46e5;
  background: white;
  outline: none;
  padding: 0 2px;
  box-sizing: border-box;
  resize: none;
  white-space: pre;
  overflow: hidden;
}

.bubble-text-input {
  width: 100%;
  height: 100%;
  border: 1px solid #4f46e5;
  background: rgba(255, 255, 255, 0.9);
  outline: none;
  padding: 4px;
  box-sizing: border-box;
  resize: none;
  text-align: center;
  overflow-y: auto;
}
</style>
