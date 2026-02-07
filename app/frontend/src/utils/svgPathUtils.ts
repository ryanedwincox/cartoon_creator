// SVG path string utilities. Responsible for parsing and transforming SVG path `d` attribute strings and polygon geometry. NOT concerned with rendering, DOM, or editor state.

/** Re-usable tokenizer regex for SVG path `d` strings. Matches commands and numeric values. */
const PATH_TOKEN_RE = /[a-zA-Z]|[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g

/** Return true when `token` is a single ASCII letter (SVG path command). */
function isCommand(token: string): boolean {
  return token.length === 1 && /[a-zA-Z]/.test(token)
}

/**
 * Translate all absolute coordinate values in an SVG path `d` string by (dx, dy).
 *
 * Absolute commands (M, L, C, S, Q, T, A, H, V) have their coordinates shifted.
 * Relative commands (m, l, c, s, q, t, a, h, v) pass through unchanged.
 */
export function translatePathD(d: string, dx: number, dy: number): string {
  const tokens = d.match(PATH_TOKEN_RE)
  if (!tokens) return d

  const result: string[] = []
  let i = 0

  while (i < tokens.length) {
    const token = tokens[i]!
    const cmd = isCommand(token) ? token : null

    if (!cmd) {
      result.push(token)
      i++
      continue
    }

    result.push(cmd)
    i++

    switch (cmd) {
      case 'M': case 'L': case 'T':
        while (i < tokens.length && !isCommand(tokens[i]!)) {
          result.push(String(parseFloat(tokens[i]!) + dx))
          i++
          if (i < tokens.length && !isCommand(tokens[i]!)) {
            result.push(String(parseFloat(tokens[i]!) + dy))
            i++
          }
        }
        break
      case 'H':
        while (i < tokens.length && !isCommand(tokens[i]!)) {
          result.push(String(parseFloat(tokens[i]!) + dx))
          i++
        }
        break
      case 'V':
        while (i < tokens.length && !isCommand(tokens[i]!)) {
          result.push(String(parseFloat(tokens[i]!) + dy))
          i++
        }
        break
      case 'C':
        // 6 values per segment: (x1,y1, x2,y2, x,y)
        while (i < tokens.length && !isCommand(tokens[i]!)) {
          for (let j = 0; j < 3 && i < tokens.length && !isCommand(tokens[i]!); j++) {
            result.push(String(parseFloat(tokens[i]!) + dx))
            i++
            if (i < tokens.length && !isCommand(tokens[i]!)) {
              result.push(String(parseFloat(tokens[i]!) + dy))
              i++
            }
          }
        }
        break
      case 'S': case 'Q':
        // 4 values per segment: (x1,y1, x,y)
        while (i < tokens.length && !isCommand(tokens[i]!)) {
          for (let j = 0; j < 2 && i < tokens.length && !isCommand(tokens[i]!); j++) {
            result.push(String(parseFloat(tokens[i]!) + dx))
            i++
            if (i < tokens.length && !isCommand(tokens[i]!)) {
              result.push(String(parseFloat(tokens[i]!) + dy))
              i++
            }
          }
        }
        break
      case 'A':
        // 7 values: rx ry x-rotation large-arc sweep x y
        while (i < tokens.length && !isCommand(tokens[i]!)) {
          // rx, ry, x-rotation — pass through
          for (let j = 0; j < 3 && i < tokens.length && !isCommand(tokens[i]!); j++) {
            result.push(tokens[i]!)
            i++
          }
          // large-arc-flag, sweep-flag — pass through
          for (let j = 0; j < 2 && i < tokens.length && !isCommand(tokens[i]!); j++) {
            result.push(tokens[i]!)
            i++
          }
          // x, y — translate
          if (i < tokens.length && !isCommand(tokens[i]!)) {
            result.push(String(parseFloat(tokens[i]!) + dx))
            i++
          }
          if (i < tokens.length && !isCommand(tokens[i]!)) {
            result.push(String(parseFloat(tokens[i]!) + dy))
            i++
          }
        }
        break
      case 'Z': case 'z':
        break
      default:
        // Relative commands — pass through unchanged
        while (i < tokens.length && !isCommand(tokens[i]!)) {
          result.push(tokens[i]!)
          i++
        }
        break
    }
  }

  return result.join(' ')
}

/**
 * Compute the axis-aligned bounding box of an SVG path from its `d` string.
 *
 * Uses control-point hull (intentional overestimate for curves) — sufficient for
 * selection bounds without the cost of exact Bézier root-finding.
 * Returns `null` when the path contains no coordinate data.
 */
export function getPathBoundsFromD(d: string): { x: number; y: number; width: number; height: number } | null {
  const tokens = d.match(PATH_TOKEN_RE)
  if (!tokens) return null

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let curX = 0
  let curY = 0
  let hasCoords = false

  const expand = (x: number, y: number) => {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
    hasCoords = true
  }

  /** Read the next numeric token at position `i`, advancing past it. Returns NaN when unavailable. */
  const readNum = (tokens: string[], pos: { i: number }): number => {
    if (pos.i >= tokens.length || isCommand(tokens[pos.i]!)) return NaN
    return parseFloat(tokens[pos.i++]!)
  }

  const hasMore = (tokens: string[], pos: { i: number }): boolean =>
    pos.i < tokens.length && !isCommand(tokens[pos.i]!)

  let i = 0
  while (i < tokens.length) {
    const token = tokens[i]!
    if (!isCommand(token)) { i++; continue }
    const cmd = token
    i++
    const pos = { i }

    switch (cmd) {
      // --- Absolute (x,y) pairs ---
      case 'M': case 'L': case 'T':
        while (hasMore(tokens, pos)) {
          const x = readNum(tokens, pos); const y = readNum(tokens, pos)
          if (!isNaN(x) && !isNaN(y)) { curX = x; curY = y; expand(curX, curY) }
        }
        break
      // --- Relative (dx,dy) pairs ---
      case 'm': case 'l': case 't':
        while (hasMore(tokens, pos)) {
          const dx = readNum(tokens, pos); const dy = readNum(tokens, pos)
          if (!isNaN(dx) && !isNaN(dy)) { curX += dx; curY += dy; expand(curX, curY) }
        }
        break
      case 'H':
        while (hasMore(tokens, pos)) { const x = readNum(tokens, pos); if (!isNaN(x)) { curX = x; expand(curX, curY) } }
        break
      case 'h':
        while (hasMore(tokens, pos)) { const dx = readNum(tokens, pos); if (!isNaN(dx)) { curX += dx; expand(curX, curY) } }
        break
      case 'V':
        while (hasMore(tokens, pos)) { const y = readNum(tokens, pos); if (!isNaN(y)) { curY = y; expand(curX, curY) } }
        break
      case 'v':
        while (hasMore(tokens, pos)) { const dy = readNum(tokens, pos); if (!isNaN(dy)) { curY += dy; expand(curX, curY) } }
        break
      case 'C':
        // 3 (x,y) pairs per segment — expand all (control-point hull)
        while (hasMore(tokens, pos)) {
          for (let j = 0; j < 3; j++) {
            const x = readNum(tokens, pos); const y = readNum(tokens, pos)
            if (!isNaN(x) && !isNaN(y)) { expand(x, y); if (j === 2) { curX = x; curY = y } }
          }
        }
        break
      case 'c':
        while (hasMore(tokens, pos)) {
          const baseX = curX; const baseY = curY
          for (let j = 0; j < 3; j++) {
            const dx = readNum(tokens, pos); const dy = readNum(tokens, pos)
            if (!isNaN(dx) && !isNaN(dy)) {
              expand(baseX + dx, baseY + dy)
              if (j === 2) { curX = baseX + dx; curY = baseY + dy }
            }
          }
        }
        break
      case 'S': case 'Q':
        // 2 (x,y) pairs per segment
        while (hasMore(tokens, pos)) {
          for (let j = 0; j < 2; j++) {
            const x = readNum(tokens, pos); const y = readNum(tokens, pos)
            if (!isNaN(x) && !isNaN(y)) { expand(x, y); if (j === 1) { curX = x; curY = y } }
          }
        }
        break
      case 's': case 'q':
        while (hasMore(tokens, pos)) {
          const baseX = curX; const baseY = curY
          for (let j = 0; j < 2; j++) {
            const dx = readNum(tokens, pos); const dy = readNum(tokens, pos)
            if (!isNaN(dx) && !isNaN(dy)) {
              expand(baseX + dx, baseY + dy)
              if (j === 1) { curX = baseX + dx; curY = baseY + dy }
            }
          }
        }
        break
      case 'A':
        // 7 values: rx ry rotation large-arc sweep x y — only expand endpoint
        while (hasMore(tokens, pos)) {
          readNum(tokens, pos); readNum(tokens, pos); readNum(tokens, pos) // rx, ry, rotation
          readNum(tokens, pos); readNum(tokens, pos) // flags
          const x = readNum(tokens, pos); const y = readNum(tokens, pos)
          if (!isNaN(x) && !isNaN(y)) { curX = x; curY = y; expand(curX, curY) }
        }
        break
      case 'a':
        while (hasMore(tokens, pos)) {
          readNum(tokens, pos); readNum(tokens, pos); readNum(tokens, pos)
          readNum(tokens, pos); readNum(tokens, pos)
          const dx = readNum(tokens, pos); const dy = readNum(tokens, pos)
          if (!isNaN(dx) && !isNaN(dy)) { curX += dx; curY += dy; expand(curX, curY) }
        }
        break
      case 'Z': case 'z':
        break
      default:
        // Unknown command — skip numeric values
        while (hasMore(tokens, pos)) readNum(tokens, pos)
        break
    }
    i = pos.i
  }

  if (!hasCoords) return null
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/**
 * Scale all coordinates in an SVG path `d` string about an origin point.
 *
 * Absolute commands: `newVal = origin + (oldVal - origin) * scale`
 * Relative commands: `delta *= scale`
 * Arc radii: `rx *= |sx|`, `ry *= |sy|`; rotation and flags unchanged.
 */
export function scalePathD(d: string, originX: number, originY: number, sx: number, sy: number): string {
  const tokens = d.match(PATH_TOKEN_RE)
  if (!tokens) return d

  const result: string[] = []
  let i = 0

  const scaleAbsX = (v: number) => originX + (v - originX) * sx
  const scaleAbsY = (v: number) => originY + (v - originY) * sy

  while (i < tokens.length) {
    const token = tokens[i]!
    if (!isCommand(token)) { result.push(token); i++; continue }

    const cmd = token
    result.push(cmd)
    i++

    switch (cmd) {
      case 'M': case 'L': case 'T':
        while (i < tokens.length && !isCommand(tokens[i]!)) {
          result.push(String(scaleAbsX(parseFloat(tokens[i]!)))); i++
          if (i < tokens.length && !isCommand(tokens[i]!)) { result.push(String(scaleAbsY(parseFloat(tokens[i]!)))); i++ }
        }
        break
      case 'm': case 'l': case 't':
        while (i < tokens.length && !isCommand(tokens[i]!)) {
          result.push(String(parseFloat(tokens[i]!) * sx)); i++
          if (i < tokens.length && !isCommand(tokens[i]!)) { result.push(String(parseFloat(tokens[i]!) * sy)); i++ }
        }
        break
      case 'H':
        while (i < tokens.length && !isCommand(tokens[i]!)) { result.push(String(scaleAbsX(parseFloat(tokens[i]!)))); i++ }
        break
      case 'h':
        while (i < tokens.length && !isCommand(tokens[i]!)) { result.push(String(parseFloat(tokens[i]!) * sx)); i++ }
        break
      case 'V':
        while (i < tokens.length && !isCommand(tokens[i]!)) { result.push(String(scaleAbsY(parseFloat(tokens[i]!)))); i++ }
        break
      case 'v':
        while (i < tokens.length && !isCommand(tokens[i]!)) { result.push(String(parseFloat(tokens[i]!) * sy)); i++ }
        break
      case 'C':
        while (i < tokens.length && !isCommand(tokens[i]!)) {
          for (let j = 0; j < 3 && i < tokens.length && !isCommand(tokens[i]!); j++) {
            result.push(String(scaleAbsX(parseFloat(tokens[i]!)))); i++
            if (i < tokens.length && !isCommand(tokens[i]!)) { result.push(String(scaleAbsY(parseFloat(tokens[i]!)))); i++ }
          }
        }
        break
      case 'c':
        while (i < tokens.length && !isCommand(tokens[i]!)) {
          for (let j = 0; j < 3 && i < tokens.length && !isCommand(tokens[i]!); j++) {
            result.push(String(parseFloat(tokens[i]!) * sx)); i++
            if (i < tokens.length && !isCommand(tokens[i]!)) { result.push(String(parseFloat(tokens[i]!) * sy)); i++ }
          }
        }
        break
      case 'S': case 'Q':
        while (i < tokens.length && !isCommand(tokens[i]!)) {
          for (let j = 0; j < 2 && i < tokens.length && !isCommand(tokens[i]!); j++) {
            result.push(String(scaleAbsX(parseFloat(tokens[i]!)))); i++
            if (i < tokens.length && !isCommand(tokens[i]!)) { result.push(String(scaleAbsY(parseFloat(tokens[i]!)))); i++ }
          }
        }
        break
      case 's': case 'q':
        while (i < tokens.length && !isCommand(tokens[i]!)) {
          for (let j = 0; j < 2 && i < tokens.length && !isCommand(tokens[i]!); j++) {
            result.push(String(parseFloat(tokens[i]!) * sx)); i++
            if (i < tokens.length && !isCommand(tokens[i]!)) { result.push(String(parseFloat(tokens[i]!) * sy)); i++ }
          }
        }
        break
      case 'A':
        while (i < tokens.length && !isCommand(tokens[i]!)) {
          // rx, ry — scale by absolute values
          result.push(String(parseFloat(tokens[i]!) * Math.abs(sx))); i++
          if (i < tokens.length && !isCommand(tokens[i]!)) { result.push(String(parseFloat(tokens[i]!) * Math.abs(sy))); i++ }
          // rotation — pass through
          if (i < tokens.length && !isCommand(tokens[i]!)) { result.push(tokens[i]!); i++ }
          // large-arc, sweep — pass through
          for (let j = 0; j < 2 && i < tokens.length && !isCommand(tokens[i]!); j++) { result.push(tokens[i]!); i++ }
          // endpoint x, y — scale
          if (i < tokens.length && !isCommand(tokens[i]!)) { result.push(String(scaleAbsX(parseFloat(tokens[i]!)))); i++ }
          if (i < tokens.length && !isCommand(tokens[i]!)) { result.push(String(scaleAbsY(parseFloat(tokens[i]!)))); i++ }
        }
        break
      case 'a':
        while (i < tokens.length && !isCommand(tokens[i]!)) {
          result.push(String(parseFloat(tokens[i]!) * Math.abs(sx))); i++
          if (i < tokens.length && !isCommand(tokens[i]!)) { result.push(String(parseFloat(tokens[i]!) * Math.abs(sy))); i++ }
          if (i < tokens.length && !isCommand(tokens[i]!)) { result.push(tokens[i]!); i++ }
          for (let j = 0; j < 2 && i < tokens.length && !isCommand(tokens[i]!); j++) { result.push(tokens[i]!); i++ }
          if (i < tokens.length && !isCommand(tokens[i]!)) { result.push(String(parseFloat(tokens[i]!) * sx)); i++ }
          if (i < tokens.length && !isCommand(tokens[i]!)) { result.push(String(parseFloat(tokens[i]!) * sy)); i++ }
        }
        break
      case 'Z': case 'z':
        break
      default:
        while (i < tokens.length && !isCommand(tokens[i]!)) { result.push(tokens[i]!); i++ }
        break
    }
  }

  return result.join(' ')
}

export interface TailPoint {
  tipX: number
  tipY: number
  baseX: number
  baseY: number
}

export function parseTailFromPolygon(
  pointsStr: string,
  rectX: number,
  rectY: number,
  rectW: number,
  rectH: number,
): TailPoint | null {
  const pairs = pointsStr.trim().split(/\s+/)
  if (pairs.length !== 3) return null

  const coords: Array<{ x: number; y: number }> = []
  for (const pair of pairs) {
    const parts = pair.split(',')
    const x = Number(parts[0])
    const y = Number(parts[1])
    if (isNaN(x) || isNaN(y)) return null
    coords.push({ x, y })
  }

  const cx = rectX + rectW / 2
  const cy = rectY + rectH / 2

  // The tip is the point farthest from the bubble center
  let maxDist = -1
  let tipIdx = 0
  for (let i = 0; i < coords.length; i++) {
    const pt = coords[i]!
    const dist = (pt.x - cx) ** 2 + (pt.y - cy) ** 2
    if (dist > maxDist) {
      maxDist = dist
      tipIdx = i
    }
  }

  const tip = coords[tipIdx]!
  const bases = coords.filter((_, i) => i !== tipIdx)
  const baseMidX = bases.reduce((s, p) => s + p.x, 0) / bases.length
  const baseMidY = bases.reduce((s, p) => s + p.y, 0) / bases.length

  return { tipX: tip.x, tipY: tip.y, baseX: baseMidX, baseY: baseMidY }
}
