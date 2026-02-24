# CLI tool: Generates cartoon images via Gemini API from text descriptions. I/O: (description, refs) -> PNG file
from __future__ import annotations

import urllib.request
import urllib.error
import io
import json
import base64
import sys
import os
import re
import mimetypes
import datetime
import shutil
from pathlib import Path
from PIL import Image

REF_SIZE = (300, 300)

API_KEY = os.environ.get("GEMINI_API_KEY", "")
MODEL = "gemini-3-pro-image-preview"
URL = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent?key={API_KEY}"


def backup_image(
    output_file: str | Path, output_dir: Path, timestamp: datetime.datetime,
) -> str | None:
    try:
        backup_dir = output_dir / ".backups"
        backup_dir.mkdir(parents=True, exist_ok=True)

        p = Path(output_file)
        backup_name = f"{p.stem}_{timestamp.strftime('%Y%m%dT%H%M%S')}{p.suffix}"
        backup_path = backup_dir / backup_name

        shutil.copy2(output_file, backup_path)
        return str(Path(".backups") / backup_name)
    except OSError as e:
        print(f"Warning: failed to create backup: {e}", file=sys.stderr)
        return None


def log_generation(
    output_file: str | Path,
    output_dir: Path,
    timestamp: datetime.datetime,
    description: str,
    ref_files: list[str],
    status: str,
    backup_path: str | None = None,
) -> None:
    try:
        log_path = output_dir / ".generation-log.md"
        ts_iso = timestamp.isoformat(timespec="seconds")

        lines = [
            "---",
            f"### {ts_iso}",
            "",
            f"- **Output:** {Path(output_file).name}",
            f"- **Status:** {status}",
        ]
        if backup_path:
            lines.append(f"- **Backup:** {backup_path}")
        lines.append(f"- **Prompt:** {description}")
        if ref_files:
            lines.append("- **References:**")
            for ref in ref_files:
                lines.append(f"  - {ref}")
        else:
            lines.append("- **References:** (none)")
        lines.append("")

        with open(log_path, "a", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")
    except OSError as e:
        print(f"Warning: failed to write generation log: {e}", file=sys.stderr)


if len(sys.argv) < 2:
    print(f"Usage: {sys.argv[0]} <description> [output.png] [--ref image1.png image2.png ...]", file=sys.stderr)
    sys.exit(1)

# Split args at --ref
args = sys.argv[1:]
extra_refs = []
if "--ref" in args:
    ref_idx = args.index("--ref")
    extra_refs = args[ref_idx + 1:]
    args = args[:ref_idx]

description = args[0]
output_file = args[1] if len(args) > 1 else re.sub(r'\W+', '_', description.lower()).strip('_') + ".png"

script_dir = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(script_dir, "style.md")) as f:
    style = f.read().strip()

prompt = f"{style}\n\n{description}"

ref_files = []
for er in extra_refs:
    path = er if os.path.isabs(er) else os.path.join(os.getcwd(), er)
    if os.path.isfile(path):
        ref_files.append(path)

parts = []
for ref in ref_files:
    img = Image.open(ref)
    img.thumbnail(REF_SIZE, Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    data = base64.b64encode(buf.getvalue()).decode("utf-8")
    parts.append({"inlineData": {"mimeType": "image/png", "data": data}})
    print(f"Reference: {os.path.basename(ref)} ({img.size[0]}x{img.size[1]})")

parts.append({"text": prompt})

payload = json.dumps({
    "contents": [
        {"parts": parts}
    ],
    "generationConfig": {
        "responseModalities": ["image", "text"],
        "maxOutputTokens": 8192
    }
}).encode("utf-8")

req = urllib.request.Request(URL, data=payload, headers={"Content-Type": "application/json"})

try:
    with urllib.request.urlopen(req) as resp:
        result = json.loads(resp.read().decode("utf-8"))

    parts = result["candidates"][0]["content"]["parts"]
    image_data = None
    for part in parts:
        if "inlineData" in part:
            image_data = part["inlineData"]["data"]
            break

    if not image_data:
        print("No image returned in response", file=sys.stderr)
        print(json.dumps(result, indent=2), file=sys.stderr)
        out_dir = Path(output_file).resolve().parent
        ts = datetime.datetime.now(datetime.UTC)
        log_generation(output_file, out_dir, ts, description, extra_refs, "failed — No image in API response")
        sys.exit(1)

    image_bytes = base64.b64decode(image_data)

    with open(output_file, "wb") as f:
        f.write(image_bytes)

    print(f"Saved {output_file} ({len(image_bytes)} bytes)")
    out_dir = Path(output_file).resolve().parent
    ts = datetime.datetime.now(datetime.UTC)
    backup_path = backup_image(output_file, out_dir, ts)
    log_generation(output_file, out_dir, ts, description, extra_refs, "success", backup_path)
except urllib.error.HTTPError as e:
    body = e.read().decode("utf-8")
    print(f"HTTP {e.code}: {body}", file=sys.stderr)
    out_dir = Path(output_file).resolve().parent
    ts = datetime.datetime.now(datetime.UTC)
    log_generation(output_file, out_dir, ts, description, extra_refs, f"failed — HTTP {e.code}")
    sys.exit(1)
