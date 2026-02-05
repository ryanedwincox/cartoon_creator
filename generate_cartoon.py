import urllib.request
import urllib.error
import glob
import io
import json
import base64
import sys
import os
import re
import mimetypes
from PIL import Image

REF_SIZE = (300, 300)

API_KEY = "AIzaSyCZ18z_XTeIDgpQ5jYNpDVpU-us7CIGF7k"
MODEL = "gemini-3-pro-image-preview"
URL = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent?key={API_KEY}"

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

# Find _ref_* images in the working directory, plus any --ref args
ref_files = sorted(glob.glob(os.path.join(script_dir, "_ref_*")))
ref_files = [f for f in ref_files if os.path.isfile(f)]
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
        sys.exit(1)

    image_bytes = base64.b64decode(image_data)

    with open(output_file, "wb") as f:
        f.write(image_bytes)

    print(f"Saved {output_file} ({len(image_bytes)} bytes)")
except urllib.error.HTTPError as e:
    body = e.read().decode("utf-8")
    print(f"HTTP {e.code}: {body}", file=sys.stderr)
    sys.exit(1)
