"""File operations for projects."""
import asyncio
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from pydantic import BaseModel

from config import DATA_DIR

router = APIRouter()

FileType = Literal["png", "svg", "json", "txt", "other"]


class FileInfo(BaseModel):
    name: str
    type: FileType
    size: int
    mtime: float
    is_hidden: bool


TEXT_EXTENSIONS = frozenset({".txt", ".md", ".log", ".csv", ".xml", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".conf"})

MAX_TEXT_FILE_SIZE = 1_000_000  # 1 MB


class TextContent(BaseModel):
    content: str


def _resolve_project_file(project_id: str, filename: str) -> Path:
    project_dir = (DATA_DIR / project_id).resolve()
    file_path = (project_dir / filename).resolve()
    if not file_path.is_relative_to(project_dir):
        raise HTTPException(status_code=400, detail="Invalid filename")
    return file_path


def get_file_type(name: str) -> FileType:
    """Determine file type from extension."""
    ext = Path(name).suffix.lower()
    if ext == ".png":
        return "png"
    elif ext == ".svg":
        return "svg"
    elif ext == ".json":
        return "json"
    elif ext in TEXT_EXTENSIONS:
        return "txt"
    return "other"


@router.get("/{project_id}")
async def list_files(project_id: str) -> list[FileInfo]:
    """List all files in a project."""
    project_dir = DATA_DIR / project_id
    if not project_dir.exists():
        raise HTTPException(status_code=404, detail="Project not found")

    def _collect_files() -> list[FileInfo]:
        result = []
        for f in sorted(project_dir.iterdir()):
            if not f.is_file():
                continue
            stat = f.stat()
            result.append(FileInfo(
                name=f.name,
                type=get_file_type(f.name),
                size=stat.st_size,
                mtime=stat.st_mtime,
                is_hidden=f.name.startswith("."),
            ))
        return result

    return await asyncio.to_thread(_collect_files)


@router.get("/{project_id}/{filename}/text")
async def get_file_text(project_id: str, filename: str) -> TextContent:
    """Read a text file and return its content as JSON."""
    file_path = _resolve_project_file(project_id, filename)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    file_size = await asyncio.to_thread(lambda: file_path.stat().st_size)
    if file_size > MAX_TEXT_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large ({file_size} bytes). Maximum is {MAX_TEXT_FILE_SIZE} bytes.",
        )
    try:
        content = await asyncio.to_thread(file_path.read_text, encoding="utf-8")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=400, detail="File is not valid text") from exc
    return TextContent(content=content)


@router.get("/{project_id}/{filename}")
async def get_file(project_id: str, filename: str):
    """Get a file from a project."""
    file_path = _resolve_project_file(project_id, filename)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(file_path)


@router.post("/{project_id}/{filename}")
async def upload_file(project_id: str, filename: str, file: UploadFile = File(...)):
    """Upload a file to a project."""
    file_path = _resolve_project_file(project_id, filename)
    if not file_path.parent.exists():
        raise HTTPException(status_code=404, detail="Project not found")

    content = await file.read()
    await asyncio.to_thread(file_path.write_bytes, content)

    return {"status": "uploaded", "filename": filename}


class SaveFileRequest(BaseModel):
    content: str


@router.put("/{project_id}/{filename}")
async def save_file(project_id: str, filename: str, request: SaveFileRequest):
    """Save text content to a file."""
    file_path = _resolve_project_file(project_id, filename)
    if not file_path.parent.exists():
        raise HTTPException(status_code=404, detail="Project not found")

    await asyncio.to_thread(file_path.write_text, request.content)

    return {"status": "saved", "filename": filename}


@router.delete("/{project_id}/{filename}")
async def delete_file(project_id: str, filename: str):
    """Delete a file from a project."""
    file_path = _resolve_project_file(project_id, filename)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    await asyncio.to_thread(file_path.unlink)
    return {"status": "deleted", "filename": filename}
