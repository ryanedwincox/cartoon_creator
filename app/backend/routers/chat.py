"""Chat with AI agent via SSE streaming."""
import asyncio
import json
import logging
from pathlib import Path
from typing import AsyncGenerator

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from config import DATA_DIR, CARTOONS_DIR

logger = logging.getLogger(__name__)
router = APIRouter()

# Track active agent processes
active_agents: dict[str, asyncio.subprocess.Process] = {}


class ChatMessage(BaseModel):
    """Chat message."""
    role: str  # "user" or "assistant"
    content: str
    images: list[str] = []


class SendMessageRequest(BaseModel):
    """Send message request."""
    message: str


def get_conversation_path(project_id: str) -> Path:
    """Get path to conversation file."""
    return DATA_DIR / project_id / ".conversation.json"


def load_conversation(project_id: str) -> list[ChatMessage]:
    """Load conversation history."""
    conv_path = get_conversation_path(project_id)
    if not conv_path.exists():
        return []
    try:
        with open(conv_path) as f:
            data = json.load(f)
            return [ChatMessage(**m) for m in data]
    except (json.JSONDecodeError, ValueError):
        return []


def save_conversation(project_id: str, messages: list[ChatMessage]) -> None:
    """Save conversation history."""
    conv_path = get_conversation_path(project_id)
    with open(conv_path, "w") as f:
        json.dump([m.model_dump() for m in messages], f, indent=2)


def _load_reference_doc(path: Path) -> str:
    try:
        return path.read_text()
    except OSError:
        logger.warning("Reference doc not found: %s", path)
        return ""


# Static reference docs — read once at import, not per request
_STYLE_GUIDE = _load_reference_doc(CARTOONS_DIR / "style.md")
_WORKFLOW_GUIDE = _load_reference_doc(CARTOONS_DIR / "comic-creation-workflow.md")


def build_agent_prompt(project_id: str, messages: list[ChatMessage], new_message: str) -> str:
    project_dir = DATA_DIR / project_id

    # System context
    prompt = f"""You are a cartoon creation assistant. You help create comic strip panels.

Working directory: {project_dir}

Available tools:
- python {CARTOONS_DIR}/generate_cartoon.py "description" panel1.png
  Generates a cartoon image using Gemini API. Do not include text in the prompt unless explicitly asked.

- python {CARTOONS_DIR}/trace_contour.py input.png output.svg
  Converts PNG to SVG using contour tracing

## Reference Images

Character reference images are available to improve visual consistency across panels. Use them when generating panel images.

### Discovery
Reference images live in character directories that are siblings to your working directory:
- Your working dir: {project_dir}
- Character refs follow the pattern: ../<character>/_ref_*.png

To discover available refs:
  ls ../*/_ref_*.png

### Selection Rules
1. Only include refs for characters who APPEAR in the panel being generated.
2. Pick the most relevant pose/variant based on the filename:
   - Filenames encode pose/context: _ref_ryan_couch.png = Ryan on couch, _ref_turtle_loaf.png = Turtle in loaf position
   - Match to panel content: if the panel shows Ryan on the couch, prefer _ref_ryan_couch.png
   - If the panel shows characters together, prefer combined refs (e.g., _ref_ryan_and_turtle.png) over solo refs
   - When no pose specifically matches, use the highest version number ref (e.g., _ref_ryan_v3.png over _ref_ryan_v2.png)
3. Use 1-3 refs per generate_cartoon.py call. Pick the most relevant — more is not better.
4. When multiple characters appear, include at least one ref per character when available.
5. If no _ref_*.png files exist for a character, omit refs for that character. Do NOT use non-reference images as refs.
6. If no reference images are found for any character in the panel, omit the --ref flag entirely.

### Usage
Append --ref with space-separated paths after the output filename:

  python {CARTOONS_DIR}/generate_cartoon.py "Ryan sits on the couch with Turtle on his lap" panel1.png --ref ../ryan/_ref_ryan_couch.png ../turtle/_ref_turtle_loaf.png

All ref paths are relative to your working directory.

## Style Guide

{_STYLE_GUIDE}

## Comic Creation Workflow

{_WORKFLOW_GUIDE}

Follow the comic creation workflow above when the user asks you to create a comic.

Current conversation:
"""

    # Add conversation history
    for msg in messages:
        prompt += f"\n{msg.role.upper()}: {msg.content}"

    # Add new message
    prompt += f"\n\nUSER: {new_message}\n\nASSISTANT:"

    return prompt


async def stream_agent_response(project_id: str, prompt: str) -> AsyncGenerator[str, None]:
    """Stream agent response via subagent CLI using async subprocess."""
    project_dir = DATA_DIR / project_id

    cmd = [
        "claude",
        "--print",
        "-p", prompt,
    ]

    try:
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(project_dir),
        )

        active_agents[project_id] = process

        response_parts: list[str] = []

        # Stream stdout line-by-line without blocking the event loop
        if process.stdout:
            async for raw_line in process.stdout:
                line = raw_line.decode()
                if not line:
                    break
                response_parts.append(line)
                yield f"data: {json.dumps({'type': 'text', 'content': line})}\n\n"

        await process.wait()

        full_response = "".join(response_parts)

        # Check for new images
        images = await asyncio.to_thread(
            lambda: [
                f.name
                for f in project_dir.iterdir()
                if f.suffix.lower() == ".png" and not f.name.startswith(".")
            ]
        )

        yield f"data: {json.dumps({'type': 'done', 'content': full_response, 'images': images})}\n\n"

    except Exception as e:
        logger.exception("Agent streaming failed for project %s", project_id)
        yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"
    finally:
        if project_id in active_agents:
            del active_agents[project_id]


@router.get("/{project_id}/history")
async def get_history(project_id: str) -> list[ChatMessage]:
    """Get conversation history."""
    if not (DATA_DIR / project_id).exists():
        raise HTTPException(status_code=404, detail="Project not found")
    return load_conversation(project_id)


@router.post("/{project_id}/send")
async def send_message(project_id: str, request: SendMessageRequest) -> StreamingResponse:
    """Send a message and stream the response."""
    project_dir = DATA_DIR / project_id
    if not project_dir.exists():
        raise HTTPException(status_code=404, detail="Project not found")

    # Load existing conversation
    messages = load_conversation(project_id)

    # Add user message
    user_msg = ChatMessage(role="user", content=request.message)
    messages.append(user_msg)
    save_conversation(project_id, messages)

    # Build prompt and stream response
    prompt = build_agent_prompt(project_id, messages[:-1], request.message)

    async def event_stream():
        full_response = ""
        images = []

        async for chunk in stream_agent_response(project_id, prompt):
            yield chunk

            # Parse chunk to accumulate response
            try:
                data = json.loads(chunk.replace("data: ", "").strip())
                if data["type"] == "text":
                    full_response += data["content"]
                elif data["type"] == "done":
                    full_response = data["content"]
                    images = data.get("images", [])
            except (json.JSONDecodeError, KeyError, ValueError):
                pass

        # Save assistant response
        assistant_msg = ChatMessage(role="assistant", content=full_response, images=images)
        messages.append(assistant_msg)
        save_conversation(project_id, messages)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )


@router.post("/{project_id}/interrupt")
async def interrupt(project_id: str) -> dict[str, str]:
    """Interrupt an ongoing agent response."""
    if project_id in active_agents:
        process = active_agents[project_id]
        process.terminate()
        del active_agents[project_id]
        return {"status": "interrupted"}
    return {"status": "no_active_agent"}


@router.delete("/{project_id}/history")
async def clear_history(project_id: str) -> dict[str, str]:
    """Clear conversation history."""
    conv_path = get_conversation_path(project_id)
    if conv_path.exists():
        conv_path.unlink()
    return {"status": "cleared"}
