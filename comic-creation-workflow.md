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

Edit each SVG to add speech bubbles in a dedicated layer:

- Add a `<g id="bubbles-layer">` group to the SVG.
- For each speech bubble, add the bubble rect, tail path, and seam cover as described in `style.md`.
- Position bubbles near the speaking character, with the tail pointing toward them.
- Do not add text yet — just the empty bubble shapes.

See `style.md` for the exact SVG structure of speech bubbles.

## Step 5: Add Text

Add dialog text in a separate layer on top of the bubbles:

- Add a `<g id="text-layer">` group after the bubbles layer.
- For each speech bubble, add a `<text>` element centered inside the bubble rect.
- Use the font and styling specified in `style.md`.
- This is the final step — the SVG files are now complete.

## Result

After completing all steps, the project directory should contain for each panel:
- `panel1.png` - Generated raster artwork
- `panel1.svg` - Final vector comic panel with artwork, speech bubbles, and text
