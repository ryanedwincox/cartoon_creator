// [Composable]: SVG editor state and operations. Responsible for canvas state, path/bubble/text CRUD, undo/redo, import/export, zoom/pan. NOT concerned with DOM event handling or rendering.
import { ref, reactive, computed } from 'vue'
import { translatePathD, parseTailFromPolygon, parseTailFromPath, getPathBoundsFromD, scalePathD } from '../utils/svgPathUtils'

export type Tool = 'select' | 'node' | 'draw' | 'erase' | 'bubble' | 'text'
export type Layer = 'art' | 'bubbles' | 'text'

export interface Point {
  x: number
  y: number
}

export type FillRule = 'nonzero' | 'evenodd'

export interface PathStyle {
  fill: string
  fillRule: FillRule
  stroke: string
  strokeWidth: number
}

export interface PathData extends PathStyle {
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
  strokeWidth?: number
  rx?: number
  ry?: number
  fontSize?: number
  fontFamily?: string
  fontWeight?: string
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
const DEFAULT_FONT_SIZE = 48
const DEFAULT_FONT_FAMILY = "'Anime Ace 2 BB', sans-serif"
const DEFAULT_FONT_WEIGHT = 'bold'
const DEFAULT_STROKE_WIDTH = 12
const DEFAULT_BUBBLE_RX = 30
const DEFAULT_BUBBLE_RY = 30
const DEFAULT_BUBBLE_WIDTH = 200
const DEFAULT_BUBBLE_HEIGHT = 100
const DEFAULT_TAIL_OFFSET = 40
const TAIL_BASE_WIDTH = 25
const TAIL_BASE_NEAR_RATIO = 0.3
const TAIL_BASE_FAR_RATIO = 0.7
const SEAM_COVER_RATIO = 1.17 // seam cover size relative to stroke width (~14/12)
const TEXT_BOUNDS_WIDTH_PER_CHAR = 0.6
const TEXT_BOUNDS_MIN_WIDTH_CHARS = 2
// 1.2em is the standard CSS/SVG default line-height for readable multi-line text.
const LINE_HEIGHT_FACTOR = 1.2
// 0.35em approximates the distance from the vertical center of a text line to its
// alphabetic baseline. Derived empirically to visually center tspan blocks within
// bubble rects (midpoint between ascender top ~0.7em and baseline 0em → ~0.35em).
const BASELINE_MIDDLE_OFFSET = 0.35

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

  const version = ref(0)
  const lastSavedVersion = ref(0)
  const isDirty = computed(() => version.value !== lastSavedVersion.value)

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
    version.value++
  }

  /** Deep-clone the current element arrays into a snapshot for absolute-from-snapshot transforms. */
  const createSnapshot = (): UndoState => ({
    paths: JSON.parse(JSON.stringify(paths.value)),
    bubbles: JSON.parse(JSON.stringify(bubbles.value)),
    texts: JSON.parse(JSON.stringify(texts.value)),
  })

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
    version.value++
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
    version.value++
  }

  const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  const addPath = (d: string, attrs?: Partial<PathStyle>) => {
    saveState()
    paths.value.push({
      id: generateId(),
      d,
      layer: 'art',
      fill: attrs?.fill ?? 'none',
      fillRule: attrs?.fillRule ?? 'nonzero',
      stroke: attrs?.stroke ?? 'black',
      strokeWidth: attrs?.strokeWidth ?? 2,
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
      x: centerX - DEFAULT_BUBBLE_WIDTH / 2,
      y: centerY - DEFAULT_BUBBLE_HEIGHT / 2,
      width: DEFAULT_BUBBLE_WIDTH,
      height: DEFAULT_BUBBLE_HEIGHT,
      tailX: centerX + DEFAULT_BUBBLE_WIDTH / 2 + DEFAULT_TAIL_OFFSET,
      tailY: centerY,
      text: '',
      layer: 'bubbles',
      strokeWidth: DEFAULT_STROKE_WIDTH,
      rx: DEFAULT_BUBBLE_RX,
      ry: DEFAULT_BUBBLE_RY,
      fontSize: DEFAULT_FONT_SIZE,
      fontFamily: DEFAULT_FONT_FAMILY,
      fontWeight: DEFAULT_FONT_WEIGHT,
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
    // Mutually exclusive: at most one of editingTextId / editingTextBubble is set at a time.
    // Both branches are checked defensively but only one will fire per call.

    // Commit standalone text edit
    const id = editingTextId.value
    if (id) {
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

    // Commit bubble text edit
    const bubbleId = editingTextBubble.value
    if (bubbleId) {
      const bubble = bubbles.value.find(b => b.id === bubbleId)
      if (bubble) {
        saveState()
      }
      editingTextBubble.value = null
    }
  }

  interface TailGeometry { base1X: number; base1Y: number; base2X: number; base2Y: number }

  /** Compute which edge of the bubble the tail should attach to and return base point pairs. */
  const computeTailGeometry = (bubble: BubbleData): TailGeometry => {
    const hw = TAIL_BASE_WIDTH / 2
    const bx = bubble.x
    const by = bubble.y
    const bw = bubble.width
    const bh = bubble.height

    // Center of bubble
    const cx = bx + bw / 2
    const cy = by + bh / 2

    // Direction from center to tail tip
    const dx = bubble.tailX - cx
    const dy = bubble.tailY - cy

    // Determine which edge the tail attaches to based on aspect-normalized distance
    const absDx = Math.abs(dx)
    const absDy = Math.abs(dy)

    let base1X: number, base1Y: number, base2X: number, base2Y: number

    if (absDx / bw > absDy / bh) {
      // Attach to left or right edge
      const edgeX = dx > 0 ? bx + bw : bx
      // Position base midpoint toward the tail tip side (30%/70% split)
      const midY = Math.max(by + hw, Math.min(by + bh - hw, bubble.tailY < cy ? by + bh * TAIL_BASE_NEAR_RATIO : by + bh * TAIL_BASE_FAR_RATIO))
      base1X = edgeX; base1Y = midY - hw
      base2X = edgeX; base2Y = midY + hw
    } else {
      // Attach to top or bottom edge
      const edgeY = dy > 0 ? by + bh : by
      const midX = Math.max(bx + hw, Math.min(bx + bw - hw, bubble.tailX < cx ? bx + bw * TAIL_BASE_NEAR_RATIO : bx + bw * TAIL_BASE_FAR_RATIO))
      base1X = midX - hw; base1Y = edgeY
      base2X = midX + hw; base2Y = edgeY
    }

    return { base1X, base1Y, base2X, base2Y }
  }

  interface BubbleTailRender { d: string; seamX: number; seamY: number; seamSize: number }

  /** Compute the tail path `d` string and seam cover rect in a single geometry pass. */
  const bubbleTailRender = (bubble: BubbleData): BubbleTailRender => {
    const { base1X, base1Y, base2X, base2Y } = computeTailGeometry(bubble)
    const d = `M ${base1X} ${base1Y} L ${bubble.tailX} ${bubble.tailY} L ${base2X} ${base2Y}`
    const sw = bubble.strokeWidth ?? DEFAULT_STROKE_WIDTH
    const seamSize = Math.round(sw * SEAM_COVER_RATIO)
    const seamX = (base1X + base2X) / 2 - seamSize / 2
    const seamY = (base1Y + base2Y) / 2 - seamSize / 2
    return { d, seamX, seamY, seamSize }
  }

  /** SVG path `d` attribute string for a bubble's tail triangle. */
  const bubbleTailPath = (bubble: BubbleData): string => {
    return bubbleTailRender(bubble).d
  }

  /** Seam cover rect geometry to hide stroke overlap where tail meets bubble. Size scales with stroke width. */
  const bubbleTailSeamRect = (bubble: BubbleData): { x: number; y: number; width: number; height: number } => {
    const r = bubbleTailRender(bubble)
    return { x: r.seamX, y: r.seamY, width: r.seamSize, height: r.seamSize }
  }

  /**
   * Translate a set of elements by (dx, dy) in SVG coordinates.
   * Callers must call saveState() before the first move in a drag sequence.
   */
  const moveElements = (ids: Set<string>, dx: number, dy: number) => {
    for (const path of paths.value) {
      if (!ids.has(path.id)) continue
      path.d = translatePathD(path.d, dx, dy)
    }
    for (const bubble of bubbles.value) {
      if (!ids.has(bubble.id)) continue
      bubble.x += dx
      bubble.y += dy
      bubble.tailX += dx
      bubble.tailY += dy
    }
    for (const text of texts.value) {
      if (!ids.has(text.id)) continue
      text.x += dx
      text.y += dy
    }
  }

  /** Compute the bounding box of an element from its reactive data model (no DOM access). */
  const getElementBoundsFromData = (id: string): { x: number; y: number; width: number; height: number } | null => {
    const path = paths.value.find(p => p.id === id)
    if (path) return getPathBoundsFromD(path.d)

    const bubble = bubbles.value.find(b => b.id === id)
    if (bubble) {
      // Envelope encompassing the bubble rect and its tail tip
      const minX = Math.min(bubble.x, bubble.tailX)
      const minY = Math.min(bubble.y, bubble.tailY)
      const maxX = Math.max(bubble.x + bubble.width, bubble.tailX)
      const maxY = Math.max(bubble.y + bubble.height, bubble.tailY)
      return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
    }

    const textItem = texts.value.find(t => t.id === id)
    if (textItem) {
      // Multiline-aware bounds: use longest line for width, line count for height
      const lines = textItem.content.split('\n')
      const longestLineLen = Math.max(...lines.map(l => l.length), 0)
      const estimatedWidth = Math.max(
        longestLineLen * textItem.fontSize * TEXT_BOUNDS_WIDTH_PER_CHAR,
        textItem.fontSize * TEXT_BOUNDS_MIN_WIDTH_CHARS,
      )
      const totalHeight = lines.length * textItem.fontSize * LINE_HEIGHT_FACTOR
      return { x: textItem.x, y: textItem.y - textItem.fontSize, width: estimatedWidth, height: totalHeight }
    }

    return null
  }

  /** Union bounding box of all selected elements. Fully reactive — reads from reactive arrays. */
  const selectionBounds = computed<{ x: number; y: number; width: number; height: number } | null>(() => {
    if (selectedIds.value.size === 0 || currentTool.value !== 'select') return null

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    let hasAny = false

    for (const id of selectedIds.value) {
      const bounds = getElementBoundsFromData(id)
      if (!bounds) continue
      hasAny = true
      if (bounds.x < minX) minX = bounds.x
      if (bounds.y < minY) minY = bounds.y
      if (bounds.x + bounds.width > maxX) maxX = bounds.x + bounds.width
      if (bounds.y + bounds.height > maxY) maxY = bounds.y + bounds.height
    }

    if (!hasAny) return null
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
  })

  /**
   * Scale selected elements about an origin point, reading from a snapshot to avoid drift.
   *
   * Writes `snapshot * totalScale` into the live arrays — absolute-from-snapshot approach.
   */
  const scaleElements = (
    ids: Set<string>,
    originX: number,
    originY: number,
    sx: number,
    sy: number,
    snapshot: UndoState,
  ) => {
    for (const snapPath of snapshot.paths) {
      if (!ids.has(snapPath.id)) continue
      const liveIdx = paths.value.findIndex(p => p.id === snapPath.id)
      if (liveIdx < 0) continue
      paths.value[liveIdx]!.d = scalePathD(snapPath.d, originX, originY, sx, sy)
      paths.value[liveIdx]!.strokeWidth = snapPath.strokeWidth * Math.abs(sx)
    }

    for (const snapBubble of snapshot.bubbles) {
      if (!ids.has(snapBubble.id)) continue
      const liveIdx = bubbles.value.findIndex(b => b.id === snapBubble.id)
      if (liveIdx < 0) continue
      const b = bubbles.value[liveIdx]!
      const absSx = Math.abs(sx)
      b.x = originX + (snapBubble.x - originX) * sx
      b.y = originY + (snapBubble.y - originY) * sy
      b.width = snapBubble.width * Math.abs(sx)
      b.height = snapBubble.height * Math.abs(sy)
      b.tailX = originX + (snapBubble.tailX - originX) * sx
      b.tailY = originY + (snapBubble.tailY - originY) * sy
      // Scale per-bubble style properties proportionally
      const absSy = Math.abs(sy)
      if (snapBubble.strokeWidth != null) b.strokeWidth = snapBubble.strokeWidth * absSx
      if (snapBubble.rx != null) b.rx = snapBubble.rx * absSx
      if (snapBubble.ry != null) b.ry = snapBubble.ry * absSy
      if (snapBubble.fontSize != null) b.fontSize = snapBubble.fontSize * absSx
    }

    for (const snapText of snapshot.texts) {
      if (!ids.has(snapText.id)) continue
      const liveIdx = texts.value.findIndex(t => t.id === snapText.id)
      if (liveIdx < 0) continue
      const t = texts.value[liveIdx]!
      t.x = originX + (snapText.x - originX) * sx
      t.y = originY + (snapText.y - originY) * sy
      t.fontSize = snapText.fontSize * Math.abs(sx)
    }
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

  /** Replace the current selection with the given set of IDs. */
  const setSelection = (ids: string[]) => {
    selectedIds.value.clear()
    for (const id of ids) selectedIds.value.add(id)
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
      const attrs = [
        `d="${escapeXml(path.d)}"`,
        `fill="${escapeXml(path.fill)}"`,
        `fill-rule="${escapeXml(path.fillRule)}"`,
        `stroke="${escapeXml(path.stroke)}"`,
        `stroke-width="${path.strokeWidth}"`,
        `stroke-linecap="round"`,
        `stroke-linejoin="round"`,
      ]
      svg += `    <path ${attrs.join(' ')}/>\n`
    }
    svg += `  </g>\n`

    // Bubbles layer — style.md order: rect, tail path, seam cover
    svg += `  <g id="bubbles-layer">\n`
    for (const bubble of bubbleElements) {
      const sw = bubble.strokeWidth ?? DEFAULT_STROKE_WIDTH
      const brx = bubble.rx ?? DEFAULT_BUBBLE_RX
      const bry = bubble.ry ?? DEFAULT_BUBBLE_RY
      svg += `    <rect x="${bubble.x}" y="${bubble.y}" width="${bubble.width}" height="${bubble.height}" rx="${brx}" ry="${bry}" stroke="black" stroke-width="${sw}" fill="white"/>\n`
      svg += `    <path d="${bubbleTailPath(bubble)}" fill="white" stroke="black" stroke-width="${sw}" stroke-linejoin="round"/>\n`
      const seam = bubbleTailSeamRect(bubble)
      svg += `    <rect x="${seam.x}" y="${seam.y}" width="${seam.width}" height="${seam.height}" fill="white"/>\n`
    }
    svg += `  </g>\n`

    // Text layer
    svg += `  <g id="text-layer">\n`
    for (const bubble of bubbleElements) {
      if (bubble.text) {
        const cx = bubble.x + bubble.width / 2
        const cy = bubble.y + bubble.height / 2
        const ff = bubble.fontFamily ?? DEFAULT_FONT_FAMILY
        const fs = bubble.fontSize ?? DEFAULT_FONT_SIZE
        const fw = bubble.fontWeight ?? DEFAULT_FONT_WEIGHT
        const lines = bubble.text.split('\n')
        const lineHeight = fs * LINE_HEIGHT_FACTOR
        // First tspan dy: shift up by half the text block then down by baseline offset
        const firstDy = -(lines.length - 1) * lineHeight / 2 + fs * BASELINE_MIDDLE_OFFSET
        svg += `    <text x="${cx}" y="${cy}" text-anchor="middle" font-family="${escapeXml(ff)}" font-size="${fs}" font-weight="${fw}" fill="black">`
        for (let i = 0; i < lines.length; i++) {
          const dy = i === 0 ? firstDy : lineHeight
          const content = escapeXml(lines[i] || '\u00A0')
          svg += `<tspan x="${cx}" dy="${dy}">${content}</tspan>`
        }
        svg += `</text>\n`
      }
    }
    for (const textItem of texts.value) {
      if (textItem.content) {
        const lines = textItem.content.split('\n')
        const lineHeight = textItem.fontSize * LINE_HEIGHT_FACTOR
        svg += `    <text x="${textItem.x}" y="${textItem.y}" font-family="${DEFAULT_FONT_FAMILY}" font-size="${textItem.fontSize}" data-standalone="true">`
        for (let i = 0; i < lines.length; i++) {
          const dy = i === 0 ? 0 : lineHeight
          const content = escapeXml(lines[i] || '\u00A0')
          svg += `<tspan x="${textItem.x}" dy="${dy}">${content}</tspan>`
        }
        svg += `</text>\n`
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
        const fill = pathEl.getAttribute('fill') || 'none'
        const fillRuleAttr = pathEl.getAttribute('fill-rule')
        const fillRule: FillRule = fillRuleAttr === 'evenodd' ? 'evenodd' : 'nonzero'
        const strokeAttr = pathEl.getAttribute('stroke')
        const stroke = strokeAttr ?? (fill !== 'none' ? 'none' : 'black')
        const rawStrokeWidth = parseFloat(pathEl.getAttribute('stroke-width') || '')
        const strokeWidth = Number.isNaN(rawStrokeWidth) ? 2 : rawStrokeWidth

        paths.value.push({
          id: generateId(),
          d,
          layer: 'art',
          fill,
          fillRule,
          stroke,
          strokeWidth,
        })
      }
    }

    // Import bubbles from bubbles-layer
    const bubblesLayer = doc.getElementById('bubbles-layer')
    if (bubblesLayer) {
      // Find rounded rects (bubble bodies) — identified by having rx or ry attributes
      const rectEls = bubblesLayer.querySelectorAll('rect[rx], rect[ry]')
      const polygonEls = bubblesLayer.querySelectorAll('polygon')
      // Also collect <path> elements that could be tails (exclude non-tail paths by checking for simple M/L structure)
      const pathEls = bubblesLayer.querySelectorAll('path')

      for (const rectEl of rectEls) {
        const bx = parseFloat(rectEl.getAttribute('x') || '0')
        const by = parseFloat(rectEl.getAttribute('y') || '0')
        const bw = parseFloat(rectEl.getAttribute('width') || '0')
        const bh = parseFloat(rectEl.getAttribute('height') || '0')
        if (bw <= 0 || bh <= 0) continue
        const centerX = bx + bw / 2
        const centerY = by + bh / 2

        // Read style attributes from the rect
        const rawSw = parseFloat(rectEl.getAttribute('stroke-width') || '')
        const rawRx = parseFloat(rectEl.getAttribute('rx') || '')
        const rawRy = parseFloat(rectEl.getAttribute('ry') || '')
        const sw = Number.isNaN(rawSw) ? DEFAULT_STROKE_WIDTH : rawSw
        const brx = Number.isNaN(rawRx) ? DEFAULT_BUBBLE_RX : rawRx
        const bry = Number.isNaN(rawRy) ? DEFAULT_BUBBLE_RY : rawRy

        // Find the closest tail for this bubble rect — check both <polygon> and <path> elements
        let tailX = centerX + bw / 2 + DEFAULT_TAIL_OFFSET
        let tailY = centerY
        let bestDist = Infinity

        for (const polyEl of polygonEls) {
          const tailPt = parseTailFromPolygon(polyEl.getAttribute('points') || '', bx, by, bw, bh)
          if (!tailPt) continue
          const dist = Math.sqrt((tailPt.baseX - centerX) ** 2 + (tailPt.baseY - centerY) ** 2)
          if (dist < bestDist) {
            bestDist = dist
            tailX = tailPt.tipX
            tailY = tailPt.tipY
          }
        }

        for (const pathEl of pathEls) {
          const d = pathEl.getAttribute('d') || ''
          const tailPt = parseTailFromPath(d, bx, by, bw, bh)
          if (!tailPt) continue
          const dist = Math.sqrt((tailPt.baseX - centerX) ** 2 + (tailPt.baseY - centerY) ** 2)
          if (dist < bestDist) {
            bestDist = dist
            tailX = tailPt.tipX
            tailY = tailPt.tipY
          }
        }

        bubbles.value.push({
          id: generateId(),
          x: bx,
          y: by,
          width: bw,
          height: bh,
          tailX,
          tailY,
          text: '',
          layer: 'bubbles',
          strokeWidth: sw,
          rx: brx,
          ry: bry,
        })
      }
    }

    // Import text elements from text-layer, associating centered text with bubbles
    const textLayer = doc.getElementById('text-layer')
    if (textLayer) {
      const textElements = textLayer.querySelectorAll('text')
      for (const textEl of textElements) {
        const isCenteredText = textEl.getAttribute('text-anchor') === 'middle'
        const x = parseFloat(textEl.getAttribute('x') || '0')
        const y = parseFloat(textEl.getAttribute('y') || '0')

        // Extract text content: prefer tspan children, fall back to textContent
        const tspans = textEl.querySelectorAll('tspan')
        let content: string
        if (tspans.length > 0) {
          content = Array.from(tspans)
            .map(ts => {
              const t = ts.textContent ?? ''
              // Convert NBSP placeholders back to empty lines
              return t === '\u00A0' ? '' : t
            })
            .join('\n')
        } else {
          content = textEl.textContent?.trim() || ''
        }
        if (!content) continue

        // Try to match centered text to the closest bubble by proximity to bubble center
        if (isCenteredText && bubbles.value.length > 0) {
          let bestBubble: BubbleData | null = null
          let bestDist = Infinity
          for (const bubble of bubbles.value) {
            const cx = bubble.x + bubble.width / 2
            const cy = bubble.y + bubble.height / 2
            const dx = Math.abs(x - cx)
            const dy = Math.abs(y - cy)
            // Only consider if text is within the bubble bounds
            if (dx < bubble.width / 2 && dy < bubble.height / 2) {
              const dist = dx * dx + dy * dy
              if (dist < bestDist) {
                bestDist = dist
                bestBubble = bubble
              }
            }
          }
          if (bestBubble) {
            bestBubble.text = content
            // Read font attributes from the text element and store on bubble
            const fs = parseFloat(textEl.getAttribute('font-size') || '')
            if (!Number.isNaN(fs)) bestBubble.fontSize = fs
            const ff = textEl.getAttribute('font-family')
            if (ff) bestBubble.fontFamily = ff
            const fw = textEl.getAttribute('font-weight')
            if (fw) bestBubble.fontWeight = fw
            continue
          }
        }

        const fontSize = parseFloat(textEl.getAttribute('font-size') || String(DEFAULT_FONT_SIZE))
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

  const markSaved = () => {
    lastSavedVersion.value = version.value
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

    // Dirty tracking
    isDirty,
    markSaved,

    // Actions
    saveState,
    createSnapshot,
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
    bubbleTailPath,
    bubbleTailSeamRect,
    bubbleTailRender,
    moveElements,
    scaleElements,
    getElementBoundsFromData,
    deleteSelected,
    clearSelection,
    selectItem,
    setSelection,
    toggleLayer,
    exportSvg,
    importSvg,
    fitToContent,

    // Computed
    canUndo,
    canRedo,
    selectionBounds,

    // Constants
    CANVAS_SIZE,
    MIN_ZOOM,
    MAX_ZOOM,
    DEFAULT_FONT_SIZE,
    DEFAULT_FONT_FAMILY,
    DEFAULT_FONT_WEIGHT,
    DEFAULT_STROKE_WIDTH,
    DEFAULT_BUBBLE_RX,
    DEFAULT_BUBBLE_RY,
    LINE_HEIGHT_FACTOR,
    BASELINE_MIDDLE_OFFSET,
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
