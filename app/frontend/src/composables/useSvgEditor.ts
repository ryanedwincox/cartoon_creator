import { ref, reactive, computed } from 'vue'

export type Tool = 'select' | 'node' | 'draw' | 'erase' | 'bubble' | 'thought'
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
  type: 'oval' | 'thought'
  x: number
  y: number
  width: number
  height: number
  tailX: number
  tailY: number
  text: string
  layer: 'bubbles'
}

export interface UndoState {
  paths: PathData[]
  bubbles: BubbleData[]
}

const CANVAS_SIZE = 500

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

  const selectedIds = ref<Set<string>>(new Set())
  const editingNodePath = ref<string | null>(null)
  const editingTextBubble = ref<string | null>(null)

  const undoStack = ref<UndoState[]>([])
  const redoStack = ref<UndoState[]>([])

  const zoom = ref(1)
  const panX = ref(0)
  const panY = ref(0)

  const saveState = () => {
    undoStack.value.push({
      paths: JSON.parse(JSON.stringify(paths.value)),
      bubbles: JSON.parse(JSON.stringify(bubbles.value)),
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
    })

    const state = undoStack.value.pop()!
    paths.value = state.paths
    bubbles.value = state.bubbles
    selectedIds.value.clear()
  }

  const redo = () => {
    if (redoStack.value.length === 0) return

    undoStack.value.push({
      paths: JSON.parse(JSON.stringify(paths.value)),
      bubbles: JSON.parse(JSON.stringify(bubbles.value)),
    })

    const state = redoStack.value.pop()!
    paths.value = state.paths
    bubbles.value = state.bubbles
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

  const addBubble = (type: 'oval' | 'thought') => {
    saveState()
    const centerX = CANVAS_SIZE / 2 - panX.value / zoom.value
    const centerY = CANVAS_SIZE / 2 - panY.value / zoom.value

    bubbles.value.push({
      id: generateId(),
      type,
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

  const deleteSelected = () => {
    if (selectedIds.value.size === 0) return

    saveState()
    paths.value = paths.value.filter(p => !selectedIds.value.has(p.id))
    bubbles.value = bubbles.value.filter(b => !selectedIds.value.has(b.id))
    selectedIds.value.clear()
  }

  const clearSelection = () => {
    selectedIds.value.clear()
    editingNodePath.value = null
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

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}">\n`

    // Art layer
    svg += `  <g id="art-layer">\n`
    for (const path of artPaths) {
      svg += `    <path d="${path.d}" stroke="black" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>\n`
    }
    svg += `  </g>\n`

    // Bubbles layer
    svg += `  <g id="bubbles-layer">\n`
    for (const bubble of bubbleElements) {
      if (bubble.type === 'oval') {
        const cx = bubble.x + bubble.width / 2
        const cy = bubble.y + bubble.height / 2
        const rx = bubble.width / 2
        const ry = bubble.height / 2
        svg += `    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" stroke="black" stroke-width="2" fill="white"/>\n`
        // Tail
        const tailBase1X = cx - 10
        const tailBase2X = cx + 10
        const tailBaseY = cy + ry * 0.8
        svg += `    <polygon points="${tailBase1X},${tailBaseY} ${tailBase2X},${tailBaseY} ${bubble.tailX},${bubble.tailY}" stroke="black" stroke-width="2" fill="white"/>\n`
      } else {
        // Thought bubble - rounded rect with circles
        svg += `    <rect x="${bubble.x}" y="${bubble.y}" width="${bubble.width}" height="${bubble.height}" rx="20" ry="20" stroke="black" stroke-width="2" fill="white"/>\n`
        // Thought circles
        const cx = bubble.x + bubble.width / 2
        const cy = bubble.y + bubble.height
        svg += `    <circle cx="${cx}" cy="${cy + 15}" r="8" stroke="black" stroke-width="2" fill="white"/>\n`
        svg += `    <circle cx="${bubble.tailX}" cy="${bubble.tailY - 10}" r="5" stroke="black" stroke-width="2" fill="white"/>\n`
      }
    }
    svg += `  </g>\n`

    // Text layer
    svg += `  <g id="text-layer">\n`
    for (const bubble of bubbleElements) {
      if (bubble.text) {
        const cx = bubble.x + bubble.width / 2
        const cy = bubble.y + bubble.height / 2
        svg += `    <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" font-family="Comic Sans MS, cursive" font-size="14">${escapeXml(bubble.text)}</text>\n`
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
    selectedIds,
    editingNodePath,
    editingTextBubble,
    zoom,
    panX,
    panY,

    // Actions
    saveState,
    undo,
    redo,
    addPath,
    deletePath,
    addBubble,
    updateBubble,
    deleteBubble,
    deleteSelected,
    clearSelection,
    selectItem,
    toggleLayer,
    exportSvg,
    importSvg,

    // Computed
    canUndo,
    canRedo,

    // Constants
    CANVAS_SIZE,
  }
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
