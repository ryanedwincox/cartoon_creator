"""Project CRUD operations."""
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from config import DATA_DIR

router = APIRouter()

Tag = Literal["in_progress", "completed", "discarded", "refs"]


class ProjectMeta(BaseModel):
    """Project metadata stored in .meta.json."""
    name: str
    tag: Tag = "in_progress"
    created: str
    modified: str


class ProjectResponse(BaseModel):
    """Project response with folder info."""
    id: str  # folder name
    name: str
    tag: Tag
    created: str
    modified: str
    thumbnail: Optional[str] = None


class CreateProjectRequest(BaseModel):
    """Create project request."""
    name: str
    tag: Tag = "in_progress"


class UpdateProjectRequest(BaseModel):
    """Update project request."""
    name: Optional[str] = None
    tag: Optional[Tag] = None


def slugify(name: str) -> str:
    """Convert name to folder-safe slug."""
    slug = name.lower()
    slug = re.sub(r'[^a-z0-9]+', '-', slug)
    slug = slug.strip('-')
    return slug or "project"


def get_meta_path(project_id: str) -> Path:
    """Get path to project's .meta.json."""
    return DATA_DIR / project_id / ".meta.json"


def read_meta(project_id: str) -> Optional[ProjectMeta]:
    """Read project metadata."""
    meta_path = get_meta_path(project_id)
    if not meta_path.exists():
        return None
    try:
        with open(meta_path) as f:
            return ProjectMeta(**json.load(f))
    except (json.JSONDecodeError, ValueError):
        return None


def write_meta(project_id: str, meta: ProjectMeta) -> None:
    """Write project metadata."""
    meta_path = get_meta_path(project_id)
    meta_path.parent.mkdir(parents=True, exist_ok=True)
    with open(meta_path, "w") as f:
        json.dump(meta.model_dump(), f, indent=2)


def find_thumbnail(project_dir: Path) -> Optional[str]:
    """Find first PNG file as thumbnail."""
    for f in sorted(project_dir.iterdir()):
        if f.suffix.lower() == ".png" and not f.name.startswith("."):
            return f.name
    return None


def project_to_response(project_id: str, meta: ProjectMeta) -> ProjectResponse:
    """Convert project to response."""
    project_dir = DATA_DIR / project_id
    thumbnail = find_thumbnail(project_dir)
    return ProjectResponse(
        id=project_id,
        name=meta.name,
        tag=meta.tag,
        created=meta.created,
        modified=meta.modified,
        thumbnail=thumbnail,
    )


@router.get("")
async def list_projects() -> list[ProjectResponse]:
    """List all projects."""
    projects = []
    if not DATA_DIR.exists():
        return projects

    for folder in sorted(DATA_DIR.iterdir()):
        if not folder.is_dir() or folder.name.startswith("."):
            continue
        meta = read_meta(folder.name)
        if meta:
            projects.append(project_to_response(folder.name, meta))
        else:
            # Auto-create meta for folders without it
            now = datetime.now().isoformat()
            meta = ProjectMeta(
                name=folder.name.replace("-", " ").title(),
                tag="in_progress",
                created=now,
                modified=now,
            )
            write_meta(folder.name, meta)
            projects.append(project_to_response(folder.name, meta))

    return projects


@router.post("")
async def create_project(request: CreateProjectRequest) -> ProjectResponse:
    """Create a new project."""
    project_id = slugify(request.name)

    # Ensure unique ID
    base_id = project_id
    counter = 1
    while (DATA_DIR / project_id).exists():
        project_id = f"{base_id}-{counter}"
        counter += 1

    now = datetime.now().isoformat()
    meta = ProjectMeta(
        name=request.name,
        tag=request.tag,
        created=now,
        modified=now,
    )

    (DATA_DIR / project_id).mkdir(parents=True, exist_ok=True)
    write_meta(project_id, meta)

    return project_to_response(project_id, meta)


@router.get("/{project_id}")
async def get_project(project_id: str) -> ProjectResponse:
    """Get a project by ID."""
    meta = read_meta(project_id)
    if not meta:
        raise HTTPException(status_code=404, detail="Project not found")
    return project_to_response(project_id, meta)


@router.patch("/{project_id}")
async def update_project(project_id: str, request: UpdateProjectRequest) -> ProjectResponse:
    """Update a project."""
    meta = read_meta(project_id)
    if not meta:
        raise HTTPException(status_code=404, detail="Project not found")

    if request.name is not None:
        meta.name = request.name
    if request.tag is not None:
        meta.tag = request.tag

    meta.modified = datetime.now().isoformat()
    write_meta(project_id, meta)

    return project_to_response(project_id, meta)


@router.delete("/{project_id}")
async def delete_project(project_id: str) -> dict:
    """Delete a project (moves to trash by changing tag to discarded)."""
    meta = read_meta(project_id)
    if not meta:
        raise HTTPException(status_code=404, detail="Project not found")

    meta.tag = "discarded"
    meta.modified = datetime.now().isoformat()
    write_meta(project_id, meta)

    return {"status": "deleted", "id": project_id}
