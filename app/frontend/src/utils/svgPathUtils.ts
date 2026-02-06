// SVG path string utilities. Responsible for parsing and transforming SVG path `d` attribute strings. NOT concerned with rendering, DOM, or editor state. | I/O: (d, dx, dy) → translated d string

/**
 * Translate all absolute coordinate values in an SVG path `d` string by (dx, dy).
 *
 * Absolute commands (M, L, C, S, Q, T, A, H, V) have their coordinates shifted.
 * Relative commands (m, l, c, s, q, t, a, h, v) pass through unchanged.
 */
export function translatePathD(d: string, dx: number, dy: number): string {
  const tokens = d.match(/[a-zA-Z]|[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g)
  if (!tokens) return d

  const result: string[] = []
  let i = 0

  while (i < tokens.length) {
    const token = tokens[i]!
    const cmd = token.length === 1 && /[a-zA-Z]/.test(token) ? token : null

    if (!cmd) {
      result.push(token)
      i++
      continue
    }

    result.push(cmd)
    i++

    switch (cmd) {
      case 'M': case 'L': case 'T':
        while (i < tokens.length && !/[a-zA-Z]/.test(tokens[i]!)) {
          result.push(String(parseFloat(tokens[i]!) + dx))
          i++
          if (i < tokens.length && !/[a-zA-Z]/.test(tokens[i]!)) {
            result.push(String(parseFloat(tokens[i]!) + dy))
            i++
          }
        }
        break
      case 'H':
        while (i < tokens.length && !/[a-zA-Z]/.test(tokens[i]!)) {
          result.push(String(parseFloat(tokens[i]!) + dx))
          i++
        }
        break
      case 'V':
        while (i < tokens.length && !/[a-zA-Z]/.test(tokens[i]!)) {
          result.push(String(parseFloat(tokens[i]!) + dy))
          i++
        }
        break
      case 'C':
        // 6 values per segment: (x1,y1, x2,y2, x,y)
        while (i < tokens.length && !/[a-zA-Z]/.test(tokens[i]!)) {
          for (let j = 0; j < 3 && i < tokens.length && !/[a-zA-Z]/.test(tokens[i]!); j++) {
            result.push(String(parseFloat(tokens[i]!) + dx))
            i++
            if (i < tokens.length && !/[a-zA-Z]/.test(tokens[i]!)) {
              result.push(String(parseFloat(tokens[i]!) + dy))
              i++
            }
          }
        }
        break
      case 'S': case 'Q':
        // 4 values per segment: (x1,y1, x,y)
        while (i < tokens.length && !/[a-zA-Z]/.test(tokens[i]!)) {
          for (let j = 0; j < 2 && i < tokens.length && !/[a-zA-Z]/.test(tokens[i]!); j++) {
            result.push(String(parseFloat(tokens[i]!) + dx))
            i++
            if (i < tokens.length && !/[a-zA-Z]/.test(tokens[i]!)) {
              result.push(String(parseFloat(tokens[i]!) + dy))
              i++
            }
          }
        }
        break
      case 'A':
        // 7 values: rx ry x-rotation large-arc sweep x y
        while (i < tokens.length && !/[a-zA-Z]/.test(tokens[i]!)) {
          // rx, ry, x-rotation — pass through
          for (let j = 0; j < 3 && i < tokens.length && !/[a-zA-Z]/.test(tokens[i]!); j++) {
            result.push(tokens[i]!)
            i++
          }
          // large-arc-flag, sweep-flag — pass through
          for (let j = 0; j < 2 && i < tokens.length && !/[a-zA-Z]/.test(tokens[i]!); j++) {
            result.push(tokens[i]!)
            i++
          }
          // x, y — translate
          if (i < tokens.length && !/[a-zA-Z]/.test(tokens[i]!)) {
            result.push(String(parseFloat(tokens[i]!) + dx))
            i++
          }
          if (i < tokens.length && !/[a-zA-Z]/.test(tokens[i]!)) {
            result.push(String(parseFloat(tokens[i]!) + dy))
            i++
          }
        }
        break
      case 'Z': case 'z':
        break
      default:
        // Relative commands — pass through unchanged
        while (i < tokens.length && !/[a-zA-Z]/.test(tokens[i]!)) {
          result.push(tokens[i]!)
          i++
        }
        break
    }
  }

  return result.join(' ')
}
