# Shared configuration constants. Single source of truth for paths. NOT concerned with: app setup, routing. | I/O: () → DATA_DIR, CARTOONS_DIR
from pathlib import Path

DATA_DIR = Path.home() / "ryan_ws" / "cartoon_creator" / "data"
CARTOONS_DIR = Path.home() / "ryan_ws" / "cartoon_creator"
