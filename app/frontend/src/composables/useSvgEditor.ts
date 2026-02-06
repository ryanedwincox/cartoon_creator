// [Composable]: SVG editor state and operations. Responsible for canvas state, path/bubble/text CRUD, undo/redo, import/export, zoom/pan. NOT concerned with DOM event handling or rendering.
import { ref, reactive, computed } from 'vue'

export type Tool = 'select' | 'node' | 'draw' | 'erase' | 'bubble' | 'text'
export type Layer = 'art' | 'bubbles' | 'text'

export interface Point {
  x: number
  y: number
}

export interface PathData {
  id: string
  d: string
  layer: Layer
}

export interface BubbleData {
  id: string
  x: number
  y: number
  width: number
  height: number
  tailX: number
  tailY: number
  text: string
  layer: 'bubbles'
}

export interface TextData {
  id: string
  x: number
  y: number
  content: string
  fontSize: number
  layer: 'text'
}

export interface UndoState {
  paths: PathData[]
  bubbles: BubbleData[]
  texts: TextData[]
}

const CANVAS_SIZE = 500
const MIN_ZOOM = 0.25
const MAX_ZOOM = 4
const FIT_VIEW_FILL_RATIO = 0.9
const DEFAULT_FONT_SIZE = 14
const DEFAULT_FONT_FAMILY = 'Comic Sans MS, cursive'

export function useSvgEditor() {
  const currentTool = ref<Tool>('select')
  const activeLayer = ref<Layer>('art')

  const layerVisibility = reactive({
    art: true,
    bubbles: true,
    text: true,
  })

  const paths = ref<PathData[]>([])
  const bubbles = ref<BubbleData[]>([])
  const texts = ref<TextData[]>([])

  const selectedIds = ref<Set<string>>(new Set())
  const editingNodePath = ref<string | null>(null)
  const editingTextBubble = ref<string | null>(null)
  const editingTextId = ref<string | null>(null)

  const undoStack = ref<UndoState[]>([])
  const redoStack = ref<UndoState[]>([])

  const zoom = ref(1)
  const panX = ref(0)
  const panY = ref(0)

  const sourceWidth = ref(CANVAS_SIZE)
  const sourceHeight = ref(CANVAS_SIZE)

  const saveState = () => {
    undoStack.value.push({
      paths: JSON.parse(JSON.stringify(paths.value)),
      bubbles: JSON.parse(JSON.stringify(bubbles.value)),
      texts: JSON.parse(JSON.stringify(texts.value)),
    })
    redoStack.value = []
    if (undoStack.value.length > 50) {
      undoStack.value.shift()
    }
  }

  const undo = () => {
    if (undoStack.value.length === 0) return

    redoStack.value.push({
      paths: JSON.parse(JSON.stringify(paths.value)),
      bubbles: JSON.parse(JSON.stringify(bubbles.value)),
      texts: JSON.parse(JSON.stringify(texts.value)),
    })

    const state = undoStack.value.pop()!
    paths.value = state.paths
    bubbles.value = state.bubbles
    texts.value = state.texts
    selectedIds.value.clear()
  }

  const redo = () => {
    if (redoStack.value.length === 0) return

    undoStack.value.push({
      paths: JSON.parse(JSON.stringify(paths.value)),
      bubbles: JSON.parse(JSON.stringify(bubbles.value)),
      texts: JSON.parse(JSON.stringify(texts.value)),
    })

    const state = redoStack.value.pop()!
    paths.value = state.paths
    bubbles.value = state.bubbles
    texts.value = state.texts
    selectedIds.value.clear()
  }

  const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  const addPath = (d: string) => {
    saveState()
    paths.value.push({
      id: generateId(),
      d,
      layer: 'art',
    })
  }

  const deletePath = (id: string) => {
    saveState()
    paths.value = paths.value.filter(p => p.id !== id)
  }

  const addBubble = () => {
    saveState()
    const centerX = (CANVAS_SIZE / 2 - panX.value) / zoom.value
    const centerY = (CANVAS_SIZE / 2 - panY.value) / zoom.value

    bubbles.value.push({
      id: generateId(),
      x: centerX - 60,
      y: centerY - 40,
      width: 120,
      height: 80,
      tailX: centerX,
      tailY: centerY + 60,
      text: '',
      layer: 'bubbles',
    })
  }

  const updateBubble = (id: string, updates: Partial<BubbleData>) => {
    const idx = bubbles.value.findIndex(b => b.id === id)
    if (idx >= 0) {
      bubbles.value[idx] = { ...bubbles.value[idx], ...updates }
    }
  }

  const deleteBubble = (id: string) => {
    saveState()
    bubbles.value = bubbles.value.filter(b => b.id !== id)
  }

  const addText = (svgX: number, svgY: number) => {
    saveState()
    const id = generateId()
    texts.value.push({
      id,
      x: svgX,
      y: svgY,
      content: '',
      fontSize: DEFAULT_FONT_SIZE,
      layer: 'text',
    })
    editingTextId.value = id
  }

  const updateText = (id: string, updates: Partial<TextData>) => {
    const idx = texts.value.findIndex(t => t.id === id)
    if (idx >= 0) {
      texts.value[idx] = { ...texts.value[idx]!, ...updates } as TextData
    }
  }

  const deleteText = (id: string) => {
    saveState()
    texts.value = texts.value.filter(t => t.id !== id)
  }

  const commitTextEdit = () => {
    const id = editingTextId.value
    if (!id) return

    const textItem = texts.value.find(t => t.id === id)
    if (textItem && !textItem.content.trim()) {
      // Remove empty text elements without saving extra undo state (addText already saved)
      texts.value = texts.value.filter(t => t.id !== id)
    } else if (textItem) {
      // Save state so typed text is captured in undo history
      saveState()
    }
    editingTextId.value = null
  }

  /** SVG points string for a bubble's tail polygon. */
  const bubbleTailPoints = (bubble: BubbleData): string => {
    const base1X = bubble.x + bubble.width / 2 - 10
    const base2X = bubble.x + bubble.width / 2 + 10
    const baseY = bubble.y + bubble.height * 0.8
    return `${base1X},${baseY} ${base2X},${baseY} ${bubble.tailX},${bubble.tailY}`
  }

  const deleteSelected = () => {
    if (selectedIds.value.size === 0) return

    saveState()
    paths.value = paths.value.filter(p => !selectedIds.value.has(p.id))
    bubbles.value = bubbles.value.filter(b => !selectedIds.value.has(b.id))
    texts.value = texts.value.filter(t => !selectedIds.value.has(t.id))
    selectedIds.value.clear()
  }

  const clearSelection = () => {
    selectedIds.value.clear()
    editingNodePath.value = null
    commitTextEdit()
  }

  const selectItem = (id: string, addToSelection = false) => {
    if (!addToSelection) {
      selectedIds.value.clear()
    }
    if (selectedIds.value.has(id)) {
      selectedIds.value.delete(id)
    } else {
      selectedIds.value.add(id)
    }
  }

  const toggleLayer = (layer: Layer) => {
    layerVisibility[layer] = !layerVisibility[layer]
  }

  const exportSvg = (): string => {
    const artPaths = paths.value.filter(p => p.layer === 'art')
    const bubbleElements = bubbles.value

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sourceWidth.value} ${sourceHeight.value}">\n`

    // Art layer
    svg += `  <g id="art-layer">\n`
    for (const path of artPaths) {
      svg += `    <path d="${path.d}" stroke="black" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>\n`
    }
    svg += `  </g>\n`

    // Bubbles layer
    svg += `  <g id="bubbles-layer">\n`
    for (const bubble of bubbleElements) {
      svg += `    <polygon points="${bubbleTailPoints(bubble)}" stroke="black" stroke-width="2" fill="white"/>\n`
      svg += `    <rect x="${bubble.x}" y="${bubble.y}" width="${bubble.width}" height="${bubble.height}" rx="20" ry="20" stroke="black" stroke-width="2" fill="white"/>\n`
    }
    svg += `  </g>\n`

    // Text layer
    svg += `  <g id="text-layer">\n`
    for (const bubble of bubbleElements) {
      if (bubble.text) {
        const cx = bubble.x + bubble.width / 2
        const cy = bubble.y + bubble.height / 2
        svg += `    <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" font-family="${DEFAULT_FONT_FAMILY}" font-size="${DEFAULT_FONT_SIZE}">${escapeXml(bubble.text)}</text>\n`
      }
    }
    for (const textItem of texts.value) {
      if (textItem.content) {
        svg += `    <text x="${textItem.x}" y="${textItem.y}" font-family="${DEFAULT_FONT_FAMILY}" font-size="${textItem.fontSize}" data-standalone="true">${escapeXml(textItem.content)}</text>\n`
      }
    }
    svg += `  </g>\n`

    svg += `</svg>`
    return svg
  }

  const importSvg = (svgContent: string) => {
    saveState()
    paths.value = []
    bubbles.value = []
    texts.value = []

    const parser = new DOMParser()
    const doc = parser.parseFromString(svgContent, 'image/svg+xml')

    // Import paths from art-layer or root
    const artLayer = doc.getElementById('art-layer') || doc.documentElement
    const pathElements = artLayer.querySelectorAll('path')

    for (const pathEl of pathElements) {
      const d = pathEl.getAttribute('d')
      if (d) {
        paths.value.push({
          id: generateId(),
          d,
          layer: 'art',
        })
      }
    }

    // Import standalone text elements from text-layer (exclude bubble text identified by centered alignment)
    const textLayer = doc.getElementById('text-layer')
    if (textLayer) {
      const textElements = textLayer.querySelectorAll('text')
      for (const textEl of textElements) {
        const isBubbleText = textEl.getAttribute('text-anchor') === 'middle'
          && textEl.getAttribute('dominant-baseline') === 'middle'
        if (isBubbleText) continue

        const x = parseFloat(textEl.getAttribute('x') || '0')
        const y = parseFloat(textEl.getAttribute('y') || '0')
        const fontSize = parseFloat(textEl.getAttribute('font-size') || String(DEFAULT_FONT_SIZE))
        const content = textEl.textContent || ''
        if (content) {
          texts.value.push({
            id: generateId(),
            x,
            y,
            content,
            fontSize,
            layer: 'text',
          })
        }
      }
    }

    fitToContent(doc.documentElement as SVGSVGElement)
  }

  const fitToContent = (svgRoot: SVGSVGElement | null = null) => {
    let originX = 0
    let originY = 0
    let contentWidth = sourceWidth.value
    let contentHeight = sourceHeight.value

    if (svgRoot) {
      const dims = parseSvgDimensions(svgRoot)
      originX = dims.originX
      originY = dims.originY
      contentWidth = dims.width
      contentHeight = dims.height

      sourceWidth.value = contentWidth
      sourceHeight.value = contentHeight
    }

    const maxDimension = Math.max(contentWidth, contentHeight)
    const fitZoom = (CANVAS_SIZE / maxDimension) * FIT_VIEW_FILL_RATIO
    zoom.value = Math.min(Math.max(MIN_ZOOM, fitZoom), MAX_ZOOM)

    const viewSize = CANVAS_SIZE / zoom.value
    const offsetX = (viewSize - contentWidth) / 2 - originX
    const offsetY = (viewSize - contentHeight) / 2 - originY
    panX.value = offsetX * zoom.value
    panY.value = offsetY * zoom.value
  }

  const canUndo = computed(() => undoStack.value.length > 0)
  const canRedo = computed(() => redoStack.value.length > 0)

  return {
    // State
    currentTool,
    activeLayer,
    layerVisibility,
    paths,
    bubbles,
    texts,
    selectedIds,
    editingNodePath,
    editingTextBubble,
    editingTextId,
    zoom,
    panX,
    panY,
    sourceWidth,
    sourceHeight,

    // Actions
    saveState,
    undo,
    redo,
    addPath,
    deletePath,
    addBubble,
    updateBubble,
    deleteBubble,
    addText,
    updateText,
    deleteText,
    commitTextEdit,
    bubbleTailPoints,
    deleteSelected,
    clearSelection,
    selectItem,
    toggleLayer,
    exportSvg,
    importSvg,
    fitToContent,

    // Computed
    canUndo,
    canRedo,

    // Constants
    CANVAS_SIZE,
    MIN_ZOOM,
    MAX_ZOOM,
    DEFAULT_FONT_SIZE,
    DEFAULT_FONT_FAMILY,
  }
}

interface SvgDimensions {
  originX: number
  originY: number
  width: number
  height: number
}

function parseSvgDimensions(svgRoot: SVGSVGElement): SvgDimensions {
  const viewBoxAttr = svgRoot.getAttribute('viewBox')
  if (viewBoxAttr) {
    const parts = viewBoxAttr.split(/[\s,]+/).map(Number)
    if (parts.length === 4 && parts.every(n => !isNaN(n))) {
      return { originX: parts[0], originY: parts[1], width: parts[2], height: parts[3] }
    }
  }

  const w = parseFloat(svgRoot.getAttribute('width') || '0')
  const h = parseFloat(svgRoot.getAttribute('height') || '0')
  if (w > 0 && h > 0) {
    return { originX: 0, originY: 0, width: w, height: h }
  }

  return { originX: 0, originY: 0, width: CANVAS_SIZE, height: CANVAS_SIZE }
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
