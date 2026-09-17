# Shared configuration constants. Single source of truth for paths. NOT concerned with: app setup, routing. | I/O: () → DATA_DIR, CARTOONS_DIR
import os
from pathlib import Path

# Repo root (this file lives at <root>/app/backend/config.py).
CARTOONS_DIR = Path(__file__).resolve().parents[2]

# Project data lives in <root>/data by default; override with CARTOON_DATA_DIR.
DATA_DIR = Path(os.environ.get("CARTOON_DATA_DIR", CARTOONS_DIR / "data"))
