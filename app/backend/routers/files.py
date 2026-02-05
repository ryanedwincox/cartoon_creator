"""File operations for projects."""
import os
from pathlib import Path
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from pydantic import BaseModel

router = APIRouter()

DATA_DIR = Path(os.path.expanduser("~/ryan_ws/incatpacitated"))

FileType = Literal["png", "svg", "json", "other"]


class FileInfo(BaseModel):
    """File information."""
    name: str
    type: FileType
    size: int
    is_hidden: bool


def get_file_type(name: str) -> FileType:
    """Determine file type from extension."""
    ext = Path(name).suffix.lower()
    if ext == ".png":
        return "png"
    elif ext == ".svg":
        return "svg"
    elif ext == ".json":
        return "json"
    return "other"


@router.get("/{project_id}")
async def list_files(project_id: str) -> list[FileInfo]:
    """List all files in a project."""
    project_dir = DATA_DIR / project_id
    if not project_dir.exists():
        raise HTTPException(status_code=404, detail="Project not found")

    files = []
    for f in sorted(project_dir.iterdir()):
        if not f.is_file():
            continue
        files.append(FileInfo(
            name=f.name,
            type=get_file_type(f.name),
            size=f.stat().st_size,
            is_hidden=f.name.startswith("."),
        ))

    return files


@router.get("/{project_id}/{filename}")
async def get_file(project_id: str, filename: str):
    """Get a file from a project."""
    file_path = DATA_DIR / project_id / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(file_path)


@router.post("/{project_id}/{filename}")
async def upload_file(project_id: str, filename: str, file: UploadFile = File(...)):
    """Upload a file to a project."""
    project_dir = DATA_DIR / project_id
    if not project_dir.exists():
        raise HTTPException(status_code=404, detail="Project not found")

    file_path = project_dir / filename
    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    return {"status": "uploaded", "filename": filename}


class SaveFileRequest(BaseModel):
    """Save file request body."""
    content: str


@router.put("/{project_id}/{filename}")
async def save_file(project_id: str, filename: str, request: SaveFileRequest):
    """Save text content to a file."""
    project_dir = DATA_DIR / project_id
    if not project_dir.exists():
        raise HTTPException(status_code=404, detail="Project not found")

    file_path = project_dir / filename
    with open(file_path, "w") as f:
        f.write(request.content)

    return {"status": "saved", "filename": filename}


@router.delete("/{project_id}/{filename}")
async def delete_file(project_id: str, filename: str):
    """Delete a file from a project."""
    file_path = DATA_DIR / project_id / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    file_path.unlink()
    return {"status": "deleted", "filename": filename}
