#!/usr/bin/env python3
"""Contour-trace a black-and-white PNG into a filled SVG."""

import sys
from pathlib import Path

import numpy as np
from PIL import Image
from skimage.measure import approximate_polygon, find_contours

DEFAULT_TOLERANCE: float = 1.0
MIN_CONTOUR_POINTS: int = 4


def save_debug_image(debug_dir: Path, step: int, name: str, array: np.ndarray) -> None:
    if array.dtype == bool:
        img = Image.fromarray((~array).astype(np.uint8) * 255, mode="L")
    elif array.ndim == 3:
        img = Image.fromarray(array.astype(np.uint8), mode="RGB")
    else:
        img = Image.fromarray(array.astype(np.uint8), mode="L")

    filename = f"{step:02d}_{name}.png"
    img.save(debug_dir / filename)
    print(f"  Debug: saved {filename}")


def contour_to_svg_subpath(contour: np.ndarray) -> str:
    # contour is (N, 2) array of (row, col) — convert to SVG (x=col, y=row)
    x0, y0 = contour[0, 1], contour[0, 0]
    parts = [f"M {x0:.1f},{y0:.1f}"]
    for row, col in contour[1:]:
        parts.append(f"L {col:.1f},{row:.1f}")
    parts.append("Z")
    return " ".join(parts)


def main() -> None:
    if len(sys.argv) < 2:
        print(
            f"Usage: {sys.argv[0]} <input.png> [output.svg]"
            f" [--tolerance N] [--debug]",
            file=sys.stderr,
        )
        sys.exit(1)

    args = sys.argv[1:]
    input_path = Path(args[0])
    output_path: Path | None = None
    tolerance = DEFAULT_TOLERANCE
    debug = False

    i = 1
    while i < len(args):
        if args[i] == "--tolerance" and i + 1 < len(args):
            tolerance = float(args[i + 1])
            i += 2
        elif args[i] == "--debug":
            debug = True
            i += 1
        elif output_path is None:
            output_path = Path(args[i])
            i += 1
        else:
            print(f"Unknown argument: {args[i]}", file=sys.stderr)
            sys.exit(1)

    if output_path is None:
        output_path = input_path.with_name(input_path.stem + "_contour.svg")

    debug_dir: Path | None = None
    if debug:
        debug_dir = input_path.with_name(input_path.stem + "_debug")
        debug_dir.mkdir(parents=True, exist_ok=True)
        print(f"Debug images → {debug_dir}/")

    # --- Step 1: Load and threshold ---
    img = Image.open(input_path).convert("L")
    arr = np.array(img, dtype=float)
    w, h = img.size
    print(f"Input: {w}x{h}")

    binary = arr < 128
    print(f"Dark pixels: {np.sum(binary)}")

    if debug_dir:
        save_debug_image(debug_dir, 1, "binary", binary)

    # --- Step 2: Find contours ---
    contours_raw = find_contours(binary.astype(float), 0.5)
    total_raw_pts = sum(len(c) for c in contours_raw)
    print(f"Found {len(contours_raw)} contours ({total_raw_pts} points)")

    # --- Step 3: Simplify contours (Ramer-Douglas-Peucker) ---
    contours: list[np.ndarray] = []
    for c in contours_raw:
        simplified = approximate_polygon(c, tolerance=tolerance)
        if len(simplified) >= MIN_CONTOUR_POINTS:
            contours.append(simplified)

    total_simp_pts = sum(len(c) for c in contours)
    print(f"After simplification: {len(contours)} contours ({total_simp_pts} points)")

    if debug_dir:
        overlay = np.stack([arr.astype(np.uint8)] * 3, axis=-1)
        for c in contours:
            rows = np.clip(c[:, 0].astype(int), 0, h - 1)
            cols = np.clip(c[:, 1].astype(int), 0, w - 1)
            overlay[rows, cols] = [255, 0, 0]
        save_debug_image(debug_dir, 2, "contours", overlay)

    # --- Step 4: Write SVG ---
    # All contours combined into one <path> with fill-rule="evenodd".
    # This automatically handles holes: outer contours fill black,
    # inner contours (opposite winding) cut out white holes.
    subpaths = [contour_to_svg_subpath(c) for c in contours]
    combined_d = " ".join(subpaths)

    if not contours:
        print("Warning: no contours found", file=sys.stderr)

    with open(output_path, "w") as f:
        f.write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">\n')
        f.write(f'  <rect width="{w}" height="{h}" fill="white"/>\n')
        f.write(f'  <path d="{combined_d}" fill="black" fill-rule="evenodd"/>\n')
        f.write("</svg>\n")

    print(f"Saved {output_path} ({len(contours)} contours, {total_simp_pts} points)")


if __name__ == "__main__":
    main()
