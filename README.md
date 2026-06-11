# Cartoon Creator

An AI-assisted studio for making minimalist black-and-white comic strips. Describe a comic in plain language and an AI agent drafts a panel-by-panel concept, generates the artwork, traces it into clean vector line art, and lays in speech bubbles — all from a single chat interface, with a built-in SVG editor for the finishing touches.

<p align="center">
  <img src="docs/comic-strip.png" alt="A four-panel comic strip generated with Cartoon Creator" width="640">
</p>

> Every panel above — the line art, the speech bubbles, the lettering — was produced through the workflow in this repo.

---

## What it does

Cartoon Creator turns a conversation into a finished comic. Each project is a workspace where you chat with an AI agent that has access to two image tools and a shared style guide. The agent follows a repeatable five-step workflow:

1. **Concept** — drafts a panel-by-panel blueprint (scene descriptions, dialog, rough ASCII layout) for you to approve.
2. **Generate** — renders each panel as raster art with Google Gemini, using character reference images for visual consistency.
3. **Trace** — converts each PNG into clean SVG line art via contour tracing.
4. **Bubbles** — adds speech bubbles as structured SVG following the style guide.
5. **Letter** — drops in dialog text, centered and styled.

You stay in control throughout: review files, tweak panels in the SVG editor, and iterate by chatting.

## Screenshots

| Project gallery | AI chat workflow |
| --- | --- |
| ![Project gallery](docs/screenshots/01-gallery.png) | ![AI chat](docs/screenshots/02-project.png) |

| File browser | Built-in SVG editor |
| --- | --- |
| ![File browser](docs/screenshots/03-files.png) | ![SVG editor](docs/screenshots/04-svg-editor.png) |

## Features

- **Conversational comic creation** — an AI agent drives the whole pipeline from a chat panel, streaming its responses live.
- **Reference-guided generation** — character "reference" projects keep faces and outfits consistent across panels.
- **PNG → SVG tracing** — a contour tracer reproduces the raster art as editable vector line work.
- **Full SVG editor** — pan/zoom canvas with select, draw, erase, speech-bubble, and text tools; layer toggles for art / bubbles / text; undo–redo; proportional resize handles; touch and pinch-zoom support.
- **Project organization** — a gallery with tag filters (in progress, completed, discarded, reference sets) and per-project file management with upload.
- **Resilient UX** — server-health monitoring with a disconnect banner, cache-busting for freshly generated images, and keyboard navigation between files.

## Architecture

```
┌─────────────────────────┐         ┌──────────────────────────┐
│  Frontend (Vue 3 + TS)  │  HTTP   │   Backend (FastAPI)      │
│  Vite · Pinia · Router  │ ──────▶ │   projects / files / chat│
│  - gallery / project     │  SSE   │                          │
│  - chat panel            │ ◀────── │   chat → subprocess ─────┼──▶ claude CLI (agent)
│  - SVG editor            │         │                          │        │
└─────────────────────────┘         └──────────────────────────┘        │ runs tools
                                                                         ▼
                                              generate_cartoon.py ──▶ Gemini API (image gen)
                                              trace_contour.py ─────▶ PNG → SVG line art
```

The backend's `chat` router builds a system prompt — embedding `style.md` and `comic-creation-workflow.md` — and spawns the `claude` CLI as a subprocess inside the project directory, streaming its output back to the browser over Server-Sent Events. The agent does its work by invoking the two Python scripts as command-line tools.

Each **project** is just a directory under the data folder containing its images, SVGs, a concept file, and a `.conversation.json` history — no database required.

## Tech stack

| Layer | Tools |
| --- | --- |
| Frontend | Vue 3, TypeScript, Vite, Pinia, Vue Router, Vitest |
| Backend | Python, FastAPI, Uvicorn, Server-Sent Events |
| AI / imaging | Claude (agent via CLI), Google Gemini (image generation), scikit-image + SciPy + NumPy + Pillow (contour tracing) |

## Getting started

### Prerequisites

- Python 3.10+
- Node.js 18+
- The [`claude` CLI](https://docs.claude.com/en/docs/claude-code) on your `PATH` (powers the chat agent)
- A Google Gemini API key ([get one here](https://aistudio.google.com/apikey))

### Setup

```bash
# 1. Configure your API key
cp .env.example .env
# edit .env and set GEMINI_API_KEY

# 2. Launch both servers (creates the venv, installs deps, starts everything)
./run.sh
```

`run.sh` sources `dev_env.sh`, which creates a Python virtualenv, installs backend + imaging dependencies, loads your `.env`, and installs frontend packages on first run.

Then open:

- Frontend — http://localhost:5173
- Backend API docs — http://localhost:8000/docs

By default, projects are stored in `./data`. Override the location with `CARTOON_DATA_DIR`.

### Using the image tools directly

The two scripts the agent uses also work standalone:

```bash
# Generate a panel from a description (optionally with reference images)
python generate_cartoon.py "Ryan sits on the couch whistling" panel1.png --ref refs/_ref_ryan.png

# Trace a PNG into SVG line art
python trace_contour.py panel1.png panel1.svg
```

## Project structure

```
.
├── app/
│   ├── backend/            # FastAPI app
│   │   ├── main.py         # app setup, CORS, static file serving
│   │   ├── config.py       # path configuration
│   │   └── routers/        # projects, files, chat (SSE)
│   └── frontend/           # Vue 3 + Vite SPA
│       └── src/
│           ├── components/  # gallery, chat, files, SVG editor
│           ├── composables/ # state & API hooks
│           └── views/       # home (gallery) and project views
├── generate_cartoon.py     # CLI: text + refs → PNG via Gemini
├── trace_contour.py        # CLI: PNG → SVG contour tracing
├── style.md                # art style guide (injected into the agent prompt)
└── comic-creation-workflow.md  # step-by-step workflow (injected into the agent prompt)
```

## How the style works

The comic aesthetic is defined entirely in `style.md`: ultra-minimal, black ink on white, single uniform-width strokes with rounded caps, dot eyes, no shading. That document — along with the speech-bubble SVG spec and the creation workflow — is fed straight into the agent's prompt, so the visual language stays consistent without hard-coding it into the application.
