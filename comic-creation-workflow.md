<!-- Agent prompt reference: Step-by-step comic creation workflow injected into agent system prompt. NOT concerned with: style rules (see style.md), tool implementation. -->
# Comic Creation Workflow

Follow these steps in order when creating a comic.

## Step 1: Comic Concept

Create a file called `comic-concept.txt` in the project directory. This file is the blueprint for the entire comic. For each panel, include:

1. **Panel number** (Panel 1, Panel 2, etc.)
2. **Image description** - Detailed visual description of the scene, characters, poses, expressions, and background elements. Describe everything the image should contain.
3. **Dialog/text** - The speech bubble text or captions for the panel.
4. **ASCII sketch** - A rough ASCII art layout showing character placement, speech bubble positions, and composition.

Example format:

```
Panel 1
-------
Image: Ryan standing at a kitchen counter, looking confused at a recipe book. Turtle sits on the counter next to the book, looking smug.
Dialog: Ryan: "This recipe says 'add a pinch of salt'..." / Turtle: "I ate the salt."
ASCII sketch:
+---------------------------+
|  [recipe book]   [Turtle] |
|      |          /--\      |
|   [Ryan]       | :3 |     |
|   confused     \--/       |
|                  on       |
|                counter    |
+---------------------------+
```

Present this file to the user for review before proceeding. Wait for approval.

## Step 2: Generate Panel Images

After the user approves the concept, generate PNG images one panel at a time:

- Use `python generate_cartoon.py "<description>" panel1.png` for each panel.
- Pass the **image description** from the concept file as the prompt. Include the ASCII sketch for composition guidance.
- Do **not** include text or dialog in the image generation prompt unless the user explicitly asks for rendered text. The image should be artwork only.
- Name files sequentially: `panel1.png`, `panel2.png`, etc.

## Step 3: Convert PNG to SVG

Convert each generated PNG to SVG:

- Use `python trace_contour.py panel1.png panel1.svg` for each panel.
- This produces clean vector line art from the raster image.
- Result: `panel1.svg`, `panel2.svg`, etc.

## Step 4: Add Speech Bubbles

Edit each SVG to add speech bubbles in a dedicated `<g id="bubbles-layer">` group. Do not add text yet — just the empty bubble shapes. Every bubble must use this exact structure:

```xml
<g id="bubbles-layer">
  <!-- 1. Main bubble: rounded rectangle -->
  <rect x="{X}" y="{Y}" width="{W}" height="{H}" rx="30" ry="30"
        stroke="black" stroke-width="12" fill="white"/>

  <!-- 2. Tail: triangular pointer toward the speaker -->
  <path d="M {bx},{ty} L {tx},{tm} L {bx},{by}"
        fill="white" stroke="black" stroke-width="12" stroke-linejoin="round"/>

  <!-- 3. Seam cover: small white rect hiding the stroke where tail meets bubble -->
  <rect x="{cx}" y="{cy}" width="14" height="14" fill="white"/>
</g>
```

Rules:
- **Stroke width**: 12px on both the rect and the tail path. Must match.
- **Corner radius**: rx/ry="30" for the rounded rectangle.
- **Tail**: A triangular `<path>` with `stroke-linejoin="round"`. Base edge sits flush against the bubble rect edge. Point toward the speaker.
- **Seam cover**: A small white `<rect>` (no stroke) over the joint where tail meets bubble. ~14x14 at stroke-width 12.
- **Tail direction**: Point toward the speaking character. For off-screen speakers, point toward the panel edge.

## Step 5: Add Text

Add dialog text in a separate `<g id="text-layer">` group **after** the bubbles layer (so text renders on top). Text is always rendered using `<tspan>` child elements — even for single-line text. Every text element must use this exact structure:

```xml
<g id="text-layer">
  <!-- Bubble text: x,y = bubble center. Each line is a <tspan>. -->
  <!-- For a bubble at y=200 height=100 (center y=250), font-size=48: -->
  <!--   lineHeight = 48 * 1.2 = 57.6 -->
  <!--   For 2 lines: firstDy = -(1 * 57.6) / 2 + 48 * 0.35 = -28.8 + 16.8 = -12.0 -->
  <text x="250" y="250" text-anchor="middle" font-family="'Anime Ace 2 BB', sans-serif"
        font-size="48" font-weight="bold" fill="black">
    <tspan x="250" dy="-12.0">First line</tspan>
    <tspan x="250" dy="57.6">Second line</tspan>
  </text>

  <!-- Single-line example (1 line): firstDy = -(0 * 57.6) / 2 + 48 * 0.35 = 16.8 -->
  <text x="250" y="250" text-anchor="middle" font-family="'Anime Ace 2 BB', sans-serif"
        font-size="48" font-weight="bold" fill="black">
    <tspan x="250" dy="16.8">Single line</tspan>
  </text>
</g>
```

Centering formula:
- `lineHeight = fontSize * 1.2`
- First tspan `dy = -(lineCount - 1) * lineHeight / 2 + fontSize * 0.35`
- Subsequent tspans `dy = lineHeight`
- Empty lines use `\u00A0` (non-breaking space) to preserve spacing.

Rules:
- **Font**: `'Anime Ace 2 BB', sans-serif` — always use this font family.
- **Font size**: 48px.
- **Font weight**: bold.
- **Alignment**: `text-anchor="middle"`, centered horizontally at the midpoint of the bubble rect.
- **Vertical centering**: Use the `<tspan>` dy formula above. Do **not** use `dominant-baseline`.
- **Fill**: black.
- **Layer order**: `bubbles-layer` renders first (behind), `text-layer` on top.

## Result

After completing all steps, the project directory should contain for each panel:
- `panel1.png` - Generated raster artwork
- `panel1.svg` - Final vector comic panel with artwork, speech bubbles, and text
