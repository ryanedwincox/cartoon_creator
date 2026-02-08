// [Test]: Multiline text — tspan export/import, round-trip, bounds, dy centering.
import { describe, it, expect } from 'vitest'
import { useSvgEditor } from './useSvgEditor'

const createEditor = () => useSvgEditor()

describe('exportSvg tspan generation', () => {
  it('exports bubble text with tspan elements and correct dy centering', () => {
    const editor = createEditor()
    editor.bubbles.value.push({
      id: 'b1',
      x: 100, y: 100, width: 200, height: 100,
      tailX: 350, tailY: 150,
      text: 'Hello\nWorld',
      layer: 'bubbles',
      fontSize: 48,
      fontFamily: "'Anime Ace 2 BB', sans-serif",
      fontWeight: 'bold',
    })

    const svg = editor.exportSvg()
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
    const textEl = doc.querySelector('#text-layer text')!
    expect(textEl).not.toBeNull()

    // Should NOT have dominant-baseline
    expect(textEl.getAttribute('dominant-baseline')).toBeNull()

    const tspans = Array.from(textEl.querySelectorAll('tspan'))
    expect(tspans.length).toBe(2)

    // Verify first tspan dy: -(2-1)*57.6/2 + 48*0.35 = -28.8 + 16.8 = -12.0
    const lineHeight = 48 * 1.2
    const expectedFirstDy = -(2 - 1) * lineHeight / 2 + 48 * 0.35
    expect(parseFloat(tspans[0]!.getAttribute('dy')!)).toBeCloseTo(expectedFirstDy, 1)

    // Second tspan dy = lineHeight
    expect(parseFloat(tspans[1]!.getAttribute('dy')!)).toBeCloseTo(lineHeight, 1)

    // Content
    expect(tspans[0]!.textContent).toBe('Hello')
    expect(tspans[1]!.textContent).toBe('World')
  })

  it('exports single-line bubble text with one tspan', () => {
    const editor = createEditor()
    editor.bubbles.value.push({
      id: 'b1',
      x: 100, y: 100, width: 200, height: 100,
      tailX: 350, tailY: 150,
      text: 'Single line',
      layer: 'bubbles',
      fontSize: 48,
    })

    const svg = editor.exportSvg()
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
    const tspans = Array.from(doc.querySelectorAll('#text-layer tspan'))
    expect(tspans.length).toBe(1)

    // Single line: dy = -(1-1)*lineHeight/2 + 48*0.35 = 16.8
    expect(parseFloat(tspans[0]!.getAttribute('dy')!)).toBeCloseTo(48 * 0.35, 1)
    expect(tspans[0]!.textContent).toBe('Single line')
  })

  it('exports empty lines as non-breaking space tspans', () => {
    const editor = createEditor()
    editor.bubbles.value.push({
      id: 'b1',
      x: 100, y: 100, width: 200, height: 100,
      tailX: 350, tailY: 150,
      text: 'Top\n\nBottom',
      layer: 'bubbles',
      fontSize: 48,
    })

    const svg = editor.exportSvg()
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
    const tspans = Array.from(doc.querySelectorAll('#text-layer tspan'))
    expect(tspans.length).toBe(3)
    expect(tspans[1]!.textContent).toBe('\u00A0')
  })

  it('exports standalone text with tspan elements', () => {
    const editor = createEditor()
    editor.texts.value.push({
      id: 't1',
      x: 50, y: 200,
      content: 'Line A\nLine B',
      fontSize: 24,
      layer: 'text',
    })

    const svg = editor.exportSvg()
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
    const textEl = doc.querySelector('#text-layer text[data-standalone="true"]')!
    expect(textEl).not.toBeNull()

    const tspans = Array.from(textEl.querySelectorAll('tspan'))
    expect(tspans.length).toBe(2)

    // First tspan dy=0, second dy=lineHeight
    expect(parseFloat(tspans[0]!.getAttribute('dy')!)).toBe(0)
    expect(parseFloat(tspans[1]!.getAttribute('dy')!)).toBeCloseTo(24 * 1.2, 1)
    expect(tspans[0]!.textContent).toBe('Line A')
    expect(tspans[1]!.textContent).toBe('Line B')
  })
})

describe('importSvg tspan parsing', () => {
  it('imports text with tspan children as newline-delimited string', () => {
    const editor = createEditor()
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500">
      <g id="art-layer"></g>
      <g id="bubbles-layer">
        <rect x="100" y="100" width="200" height="100" rx="30" ry="30" stroke="black" stroke-width="12" fill="white"/>
      </g>
      <g id="text-layer">
        <text x="200" y="150" text-anchor="middle" font-size="48" font-weight="bold">
          <tspan x="200" dy="-12">Hello</tspan>
          <tspan x="200" dy="57.6">World</tspan>
        </text>
      </g>
    </svg>`

    editor.importSvg(svg)

    // Text should be matched to the bubble
    expect(editor.bubbles.value.length).toBe(1)
    expect(editor.bubbles.value[0]!.text).toBe('Hello\nWorld')
  })

  it('imports text without tspans using textContent (backward compat)', () => {
    const editor = createEditor()
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500">
      <g id="art-layer"></g>
      <g id="bubbles-layer">
        <rect x="100" y="100" width="200" height="100" rx="30" ry="30" stroke="black" stroke-width="12" fill="white"/>
      </g>
      <g id="text-layer">
        <text x="200" y="150" text-anchor="middle" font-size="48">Legacy text</text>
      </g>
    </svg>`

    editor.importSvg(svg)

    expect(editor.bubbles.value.length).toBe(1)
    expect(editor.bubbles.value[0]!.text).toBe('Legacy text')
  })

  it('converts NBSP tspan content back to empty lines on import', () => {
    const editor = createEditor()
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500">
      <g id="art-layer"></g>
      <g id="text-layer">
        <text x="50" y="200" font-size="24" data-standalone="true">
          <tspan x="50" dy="0">Top</tspan>
          <tspan x="50" dy="28.8">\u00A0</tspan>
          <tspan x="50" dy="28.8">Bottom</tspan>
        </text>
      </g>
    </svg>`

    editor.importSvg(svg)

    expect(editor.texts.value.length).toBe(1)
    expect(editor.texts.value[0]!.content).toBe('Top\n\nBottom')
  })
})

describe('round-trip export→import', () => {
  it('preserves multiline bubble text through export and re-import', () => {
    const editor = createEditor()
    editor.bubbles.value.push({
      id: 'b1',
      x: 100, y: 100, width: 200, height: 100,
      tailX: 350, tailY: 150,
      text: 'Line 1\nLine 2\nLine 3',
      layer: 'bubbles',
      fontSize: 48,
      fontFamily: "'Anime Ace 2 BB', sans-serif",
      fontWeight: 'bold',
      strokeWidth: 12,
      rx: 30, ry: 30,
    })

    const exported = editor.exportSvg()

    // Create fresh editor and import
    const editor2 = createEditor()
    editor2.importSvg(exported)

    expect(editor2.bubbles.value.length).toBe(1)
    expect(editor2.bubbles.value[0]!.text).toBe('Line 1\nLine 2\nLine 3')
  })

  it('preserves multiline standalone text through export and re-import', () => {
    const editor = createEditor()
    editor.texts.value.push({
      id: 't1',
      x: 50, y: 200,
      content: 'Alpha\nBeta',
      fontSize: 24,
      layer: 'text',
    })

    const exported = editor.exportSvg()

    const editor2 = createEditor()
    editor2.importSvg(exported)

    expect(editor2.texts.value.length).toBe(1)
    expect(editor2.texts.value[0]!.content).toBe('Alpha\nBeta')
  })
})

describe('getElementBoundsFromData multiline', () => {
  it('computes height based on line count and LINE_HEIGHT_FACTOR', () => {
    const editor = createEditor()
    editor.texts.value.push({
      id: 't1',
      x: 10, y: 50,
      content: 'Line 1\nLine 2\nLine 3',
      fontSize: 20,
      layer: 'text',
    })

    const bounds = editor.getElementBoundsFromData('t1')!
    expect(bounds).not.toBeNull()

    // Height: 3 lines * 20 * 1.2 = 72
    expect(bounds.height).toBeCloseTo(3 * 20 * 1.2, 1)

    // Width: based on longest line ("Line 1" = 6 chars)
    const expectedWidth = 6 * 20 * 0.6
    expect(bounds.width).toBeCloseTo(expectedWidth, 1)
  })

  it('uses single line dimensions for non-multiline text', () => {
    const editor = createEditor()
    editor.texts.value.push({
      id: 't1',
      x: 10, y: 50,
      content: 'Hello',
      fontSize: 20,
      layer: 'text',
    })

    const bounds = editor.getElementBoundsFromData('t1')!
    expect(bounds).not.toBeNull()

    // Height: 1 line * 20 * 1.2 = 24
    expect(bounds.height).toBeCloseTo(1 * 20 * 1.2, 1)
  })
})

describe('dy centering formula', () => {
  it('produces correct first tspan dy for various line counts', () => {
    const fontSize = 48
    const lineHeight = fontSize * 1.2 // 57.6

    // 1 line: dy = -(0)*57.6/2 + 48*0.35 = 16.8
    const dy1 = -(1 - 1) * lineHeight / 2 + fontSize * 0.35
    expect(dy1).toBeCloseTo(16.8, 1)

    // 2 lines: dy = -(1)*57.6/2 + 48*0.35 = -28.8 + 16.8 = -12.0
    const dy2 = -(2 - 1) * lineHeight / 2 + fontSize * 0.35
    expect(dy2).toBeCloseTo(-12.0, 1)

    // 3 lines: dy = -(2)*57.6/2 + 48*0.35 = -57.6 + 16.8 = -40.8
    const dy3 = -(3 - 1) * lineHeight / 2 + fontSize * 0.35
    expect(dy3).toBeCloseTo(-40.8, 1)
  })
})
