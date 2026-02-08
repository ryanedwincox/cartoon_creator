# References

Reference images are provided at low resolution. Use them for character design and style only. Output should be full resolution with crisp, clean lines.

# Style

Ultra-minimal cartoon strip style. Black and white only. Single uniform-width pen outlines with rounded end caps. Every stroke must be exactly the same width, no tapering, no thick-to-thin variation. No sharp points or triangular stroke ends. Eyes are simple dots. Ears are simple rounded outlines only. Noses are a small dot or tiny circle. No cross-hatching, no hatching, no shading lines, no fill patterns. Clean black ink lines on white background. No color, no gray tones. As few lines as possible to convey the subject. Maximum simplicity. Speech bubbles are simple rounded rectangles. No border around the image — artwork extends to the edges with no outline, frame, or border enclosing the image.

# Speech Bubble Implementation

Speech bubbles are built from 2 SVG elements layered in a `bubbles-layer` group, with text in a separate `text-layer` group on top.

## Structure

```xml
<g id="bubbles-layer">
  <!-- 1. Main bubble: rounded rectangle -->
  <rect x="{X}" y="{Y}" width="{W}" height="{H}" rx="30" ry="30"
        stroke="black" stroke-width="12" fill="white"/>

  <!-- 2. Tail: triangular pointer toward the speaker -->
  <path d="M {base1X},{base1Y} L {tipX},{tipY} L {base2X},{base2Y}"
        fill="white" stroke="black" stroke-width="12" stroke-linejoin="round"/>
</g>
<g id="text-layer">
  <text x="{center}" y="{textY}" font-family="'Anime Ace 2 BB', sans-serif"
        font-size="48" font-weight="bold" text-anchor="middle" fill="black">
    Dialog text here
  </text>
</g>
```

## Key details

- **Stroke width**: 12px on both the rect and the tail path. Must match.
- **Corner radius**: rx/ry="30" for the rounded rectangle.
- **Tail**: A triangular `<path>` with `stroke-linejoin="round"` for smooth corners. The tail base is inset by half the stroke width from the bubble rect edge, so the white fill covers the stroke junction cleanly.
- **Tail direction**: The tail can point in any direction. Attach its base to the appropriate edge of the bubble rect. For off-screen speakers, point the tail toward the edge of the panel.
- **Text**: Centered (`text-anchor="middle"`) at the horizontal midpoint of the bubble rect. Vertically positioned near the bottom third of the bubble.
- **Layer order**: bubbles-layer renders first (behind), text-layer on top.

# Characters

## Turtle

A cat. Round, chunky body. Dot eyes, tiny dot nose. Simple rounded ear outlines. Tail up when walking.

## Ryan

A man in his 30s. Wears pants, a sweater, and a baseball hat. Same ultra-minimal style as all other characters.

## Helen 

Woman in 30s pants and simple shirt with curl black hair down to neck