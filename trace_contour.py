#!/usr/bin/env python3
"""Contour tracer: black-and-white PNG to filled SVG. NOT concerned with centerline/skeleton tracing."""

import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage
from skimage.measure import approximate_polygon, find_contours

DEFAULT_TOLERANCE: float = 0.5
MIN_CONTOUR_POINTS: int = 4
BINARY_THRESHOLD: int = 128
CONTOUR_LEVEL: float = 0.5
DEFAULT_FILL_COLOR: str = "#d0d0d0"


@dataclass
class Args:
    input_path: Path
    output_path: Path
    tolerance: float
    fill_color: str | None


def parse_args(argv: list[str]) -> Args:
    if len(argv) < 2:
        print(
            f"Usage: {argv[0]} <input.png> [output.svg]"
            f" [--tolerance N] [--fill [COLOR]]",
            file=sys.stderr,
        )
        sys.exit(2)

    args = argv[1:]
    input_path = Path(args[0])
    output_path: Path | None = None
    tolerance = DEFAULT_TOLERANCE
    fill_color: str | None = None

    i = 1
    while i < len(args):
        if args[i] == "--tolerance" and i + 1 < len(args):
            tolerance = float(args[i + 1])
            i += 2
        elif args[i] == "--fill":
            if i + 1 < len(args) and not args[i + 1].startswith("--"):
                fill_color = args[i + 1]
                i += 2
            else:
                fill_color = DEFAULT_FILL_COLOR
                i += 1
        elif args[i].startswith("--"):
            print(f"Unknown flag: {args[i]}", file=sys.stderr)
            sys.exit(2)
        elif output_path is None:
            output_path = Path(args[i])
            i += 1
        else:
            print(f"Unknown argument: {args[i]}", file=sys.stderr)
            sys.exit(2)

    if output_path is None:
        output_path = input_path.with_name(input_path.stem + "_contour.svg")

    return Args(
        input_path=input_path,
        output_path=output_path,
        tolerance=tolerance,
        fill_color=fill_color,
    )


def simplify_contours(binary: np.ndarray, tolerance: float) -> list[np.ndarray]:
    raw = find_contours(binary.astype(float), CONTOUR_LEVEL)
    result: list[np.ndarray] = []
    for c in raw:
        s = approximate_polygon(c, tolerance=tolerance)
        if len(s) >= MIN_CONTOUR_POINTS:
            result.append(s)
    return result


# contour is (N, 2) array of (row, col) — convert to SVG (x=col, y=row)
def contour_to_svg_subpath(contour: np.ndarray) -> str:
    x0, y0 = contour[0, 1], contour[0, 0]
    parts = [f"M {x0:.1f},{y0:.1f}"]
    for row, col in contour[1:]:
        parts.append(f"L {col:.1f},{row:.1f}")
    parts.append("Z")
    return " ".join(parts)


def find_enclosed_regions(binary: np.ndarray) -> list[np.ndarray]:
    white = ~binary
    labeled, num_features = ndimage.label(white)

    regions: list[np.ndarray] = []
    for label_id in range(1, num_features + 1):
        region_mask = labeled == label_id
        touches_border = (
            region_mask[0, :].any()
            or region_mask[-1, :].any()
            or region_mask[:, 0].any()
            or region_mask[:, -1].any()
        )
        if not touches_border:
            regions.append(region_mask)

    return regions


def write_svg(
    output_path: Path,
    w: int,
    h: int,
    ink_contours: list[np.ndarray],
    fill_paths: list[str],
    fill_color: str | None,
) -> None:
    ink_subpaths = [contour_to_svg_subpath(c) for c in ink_contours]
    ink_d = " ".join(ink_subpaths)

    with open(output_path, "w") as f:
        f.write(
            f'<svg xmlns="http://www.w3.org/2000/svg"'
            f' viewBox="0 0 {w} {h}" width="{w}" height="{h}">\n'
        )
        f.write(f'  <rect width="{w}" height="{h}" fill="white"/>\n')

        f.write(
            f'  <path d="{ink_d}" fill="black" fill-rule="evenodd"/>\n'
        )

        if fill_paths and fill_color:
            fill_d = " ".join(fill_paths)
            f.write(
                f'  <path d="{fill_d}" fill="{fill_color}"'
                f' fill-rule="evenodd"/>\n'
            )
        f.write("</svg>\n")


def main() -> None:
    cfg = parse_args(sys.argv)

    # --- Step 1: Load and threshold ---
    img = Image.open(cfg.input_path).convert("L")
    arr = np.array(img, dtype=float)
    w, h = img.size
    print(f"Input: {w}x{h}")

    binary = arr < BINARY_THRESHOLD
    print(f"Dark pixels: {np.sum(binary)}")

    # --- Step 2: Find and simplify ink contours ---
    contours_raw = find_contours(binary.astype(float), CONTOUR_LEVEL)
    print(f"Found {len(contours_raw)} raw contours ({sum(len(c) for c in contours_raw)} points)")

    contours = simplify_contours(binary, cfg.tolerance)
    total_simp_pts = sum(len(c) for c in contours)
    print(f"After simplification: {len(contours)} contours ({total_simp_pts} points)")

    # --- Step 3: Find enclosed regions (optional fill) ---
    fill_paths: list[str] = []
    if cfg.fill_color is not None:
        regions = find_enclosed_regions(binary)
        print(f"Found {len(regions)} enclosed regions")

        for region_mask in regions:
            region_contours = simplify_contours(region_mask, cfg.tolerance)
            for rc in region_contours:
                fill_paths.append(contour_to_svg_subpath(rc))

        print(f"Fill paths: {len(fill_paths)}")

    # --- Step 4: Write SVG ---
    if not contours:
        print("Warning: no contours found", file=sys.stderr)

    write_svg(cfg.output_path, w, h, contours, fill_paths, cfg.fill_color)

    size_kb = cfg.output_path.stat().st_size / 1024
    print(
        f"Saved {cfg.output_path}"
        f" ({len(contours)} ink contours, {total_simp_pts} points,"
        f" {len(fill_paths)} fill paths, {size_kb:.1f}KB)"
    )


if __name__ == "__main__":
    main()
