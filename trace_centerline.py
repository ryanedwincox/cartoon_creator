#!/usr/bin/env python3
"""Centerline-trace a black-and-white PNG into a single-stroke SVG."""

import sys
from collections import defaultdict
from collections.abc import Generator
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt, label as ndimage_label
from skimage.morphology import erosion, thin

# Dot detection thresholds (for filled circles like eyes, punctuation)
DOT_MIN_AREA = 10
DOT_MAX_AREA = 500
DOT_MIN_CIRCULARITY = 0.6
DOT_MAX_CIRCULARITY = 1.5
DOT_MIN_ASPECT = 0.6


def neighbors(y: int, x: int, shape: tuple[int, ...]) -> Generator[tuple[int, int], None, None]:
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dy == 0 and dx == 0:
                continue
            ny, nx = y + dy, x + dx
            if 0 <= ny < shape[0] and 0 <= nx < shape[1]:
                yield ny, nx


def trace_paths(skeleton: np.ndarray) -> list[list[tuple[int, int]]]:
    adj = defaultdict(list)
    points = set()
    ys, xs = np.where(skeleton)
    for y, x in zip(ys, xs):
        points.add((y, x))

    for (y, x) in points:
        for ny, nx in neighbors(y, x, skeleton.shape):
            if (ny, nx) in points:
                adj[(y, x)].append((ny, nx))

    visited = set()
    paths = []

    def walk(start, prev):
        path = [start]
        visited.add(start)
        current = start
        while True:
            nexts = [n for n in adj[current] if n != prev and n not in visited]
            if not nexts:
                break
            prev = current
            current = nexts[0]
            visited.add(current)
            path.append(current)
            if len(adj[current]) != 2:
                break
        return path

    endpoints = [p for p in points if len(adj[p]) == 1]
    junctions = [p for p in points if len(adj[p]) >= 3]
    starters = endpoints + junctions + list(points)

    for start in starters:
        if start in visited:
            continue
        if len(adj[start]) == 0:
            visited.add(start)
            continue

        visited.add(start)
        for nb in adj[start]:
            if nb not in visited:
                path = walk(nb, start)
                paths.append([start] + path)

        if len(adj[start]) == 1 and not any(start == p[0] for p in paths):
            nb = adj[start][0]
            if nb not in visited:
                path = walk(nb, start)
                paths.append([start] + path)

    # Closed loops
    for start in points:
        if start in visited:
            continue
        visited.add(start)
        if len(adj[start]) != 2:
            continue
        path = [start]
        prev = start
        current = adj[start][0]
        while current != start and current not in visited:
            visited.add(current)
            path.append(current)
            nexts = [n for n in adj[current] if n != prev]
            if not nexts:
                break
            prev = current
            current = nexts[0]
        if current == start:
            path.append(start)
        paths.append(path)

    return paths


def simplify_path(path: list[tuple[int, int]], tolerance: float = 1.0) -> list[tuple[int, int]]:
    # Ramer-Douglas-Peucker
    if len(path) <= 2:
        return path

    start = np.array(path[0], dtype=float)
    end = np.array(path[-1], dtype=float)
    line_vec = end - start
    line_len = np.linalg.norm(line_vec)

    if line_len < 1e-10:
        dists = [np.linalg.norm(np.array(p, dtype=float) - start) for p in path]
    else:
        line_unit = line_vec / line_len
        dists = []
        for p in path:
            v = np.array(p, dtype=float) - start
            proj = np.dot(v, line_unit)
            perp = v - proj * line_unit
            dists.append(np.linalg.norm(perp))

    max_idx = np.argmax(dists)
    max_dist = dists[max_idx]

    if max_dist <= tolerance:
        return [path[0], path[-1]]

    left = simplify_path(path[:max_idx + 1], tolerance)
    right = simplify_path(path[max_idx:], tolerance)
    return left[:-1] + right


def chaikin_smooth(pts: list[tuple[float, float]], iterations: int = 2) -> list[tuple[float, float]]:
    # Chaikin's corner-cutting (25%/75% split, preserves endpoints)
    if len(pts) < 3:
        return pts

    is_closed = pts[0] == pts[-1]

    for _ in range(iterations):
        new = []
        if not is_closed:
            new.append(pts[0])
        for i in range(len(pts) - 1):
            p0 = pts[i]
            p1 = pts[i + 1]
            q = (0.75 * p0[0] + 0.25 * p1[0], 0.75 * p0[1] + 0.25 * p1[1])
            r = (0.25 * p0[0] + 0.75 * p1[0], 0.25 * p0[1] + 0.75 * p1[1])
            new.append(q)
            new.append(r)
        if is_closed:
            new.append(new[0])
        else:
            new.append(pts[-1])
        pts = new

    return pts


def save_debug_image(debug_dir: Path, step: int, name: str, array: np.ndarray, *, normalize: bool = False) -> None:
    if normalize and array.dtype in (np.float32, np.float64, float):
        vmin, vmax = array.min(), array.max()
        if vmax > vmin:
            scaled = ((array - vmin) / (vmax - vmin) * 255).astype(np.uint8)
        else:
            scaled = np.zeros_like(array, dtype=np.uint8)
        img = Image.fromarray(scaled, mode="L")
    elif array.dtype == bool:
        img = Image.fromarray((~array).astype(np.uint8) * 255, mode="L")
    elif array.ndim == 3:
        img = Image.fromarray(array.astype(np.uint8), mode="RGB")
    else:
        img = Image.fromarray(array.astype(np.uint8), mode="L")

    filename = f"{step:02d}_{name}.png"
    img.save(debug_dir / filename)
    print(f"  Debug: saved {filename}")


def detect_filled_dots(
    binary: np.ndarray, dist: np.ndarray, labeled: np.ndarray, num_components: int,
) -> tuple[list[tuple[float, float, float]], np.ndarray]:
    """Detect filled dot-like regions that collapse to a single pixel under thinning."""
    dots: list[tuple[float, float, float]] = []
    dot_mask = np.zeros_like(binary)

    for comp_id in range(1, num_components + 1):
        comp_mask = labeled == comp_id
        comp_area = int(np.sum(comp_mask))

        if comp_area < DOT_MIN_AREA or comp_area > DOT_MAX_AREA:
            continue

        comp_max_dist = float(dist[comp_mask].max())
        ideal_circle_area = np.pi * comp_max_dist ** 2

        # Circularity: area / ideal circle area. Filled dots ≈ 1.0,
        # elongated strokes >> 1, thin rings << 1.
        circularity = comp_area / ideal_circle_area if ideal_circle_area > 0 else 0

        ys, xs = np.where(comp_mask)
        height = ys.max() - ys.min() + 1
        width = xs.max() - xs.min() + 1
        aspect = min(width, height) / max(width, height) if max(width, height) > 0 else 0

        if DOT_MIN_CIRCULARITY < circularity < DOT_MAX_CIRCULARITY and aspect > DOT_MIN_ASPECT:
            cy = float(ys.mean())
            cx = float(xs.mean())
            dots.append((cx, cy, comp_max_dist))
            dot_mask |= comp_mask

    return dots, dot_mask


def main() -> None:
    if len(sys.argv) < 2:
        print(
            f"Usage: {sys.argv[0]} <input.png> [output.svg]"
            f" [--stroke-width N] [--tolerance N] [--smooth N] [--debug]",
            file=sys.stderr,
        )
        sys.exit(1)

    args = sys.argv[1:]
    input_file = args[0]
    output_file = None
    stroke_width = 3.0
    tolerance = 1.5
    smooth_iterations = 0  # Smoothing disabled — was causing artifacts
    debug = False

    i = 1
    while i < len(args):
        if args[i] == "--stroke-width" and i + 1 < len(args):
            stroke_width = float(args[i + 1])
            i += 2
        elif args[i] == "--tolerance" and i + 1 < len(args):
            tolerance = float(args[i + 1])
            i += 2
        elif args[i] == "--smooth" and i + 1 < len(args):
            smooth_iterations = int(args[i + 1])
            i += 2
        elif args[i] == "--debug":
            debug = True
            i += 1
        elif output_file is None:
            output_file = args[i]
            i += 1
        else:
            i += 1

    if output_file is None:
        output_file = input_file.rsplit(".", 1)[0] + "_centerline.svg"

    debug_dir: Path | None = None
    if debug:
        debug_dir = Path(input_file.rsplit(".", 1)[0] + "_debug")
        debug_dir.mkdir(parents=True, exist_ok=True)
        print(f"Debug images → {debug_dir}/")

    # --- Step 1: Load and threshold ---
    img = Image.open(input_file).convert("L")
    arr = np.array(img, dtype=float)
    print(f"Input: {img.size[0]}x{img.size[1]}")

    binary = arr < 128
    print(f"Dark pixels: {np.sum(binary)}")

    if debug_dir:
        save_debug_image(debug_dir, 1, "input_binary", binary)

    # --- Step 2: Measure stroke width via distance transform ---
    dist = distance_transform_edt(binary)
    interior_dists = dist[dist > 0]
    if len(interior_dists) > 0:
        half_width = np.median(interior_dists)
        stroke_auto = half_width * 2
        print(f"Detected stroke width: ~{stroke_auto:.1f}px (half={half_width:.1f})")
    else:
        half_width = 4
        stroke_auto = 8

    if debug_dir:
        save_debug_image(debug_dir, 2, "distance_transform", dist, normalize=True)

    # --- Step 3: Detect filled dots (eyes, punctuation, etc.) ---
    # Filled circles have no meaningful centerline — thinning collapses them
    # to a single pixel. Detect them and emit as SVG circles instead.
    labeled, num_components = ndimage_label(binary)
    dots, dot_mask = detect_filled_dots(binary, dist, labeled, num_components)
    print(f"Found {num_components} connected components, {len(dots)} filled dots")

    # Build the stroke mask: everything that isn't a filled dot
    stroke_mask = binary & ~dot_mask

    if debug_dir:
        comp_vis = np.zeros((*binary.shape, 3), dtype=np.uint8)
        comp_vis[stroke_mask] = [255, 255, 255]
        comp_vis[dot_mask] = [255, 80, 80]
        save_debug_image(debug_dir, 3, "components", comp_vis)

    # --- Step 4: Erode stroke regions ---
    erode_radius = max(1, int(half_width) - 1)
    print(f"Eroding stroke regions by {erode_radius}px")
    eroded = stroke_mask.copy()
    for _ in range(erode_radius):
        eroded = erosion(eroded)

    if debug_dir:
        save_debug_image(debug_dir, 4, "eroded", eroded)

    # --- Step 5: Thin (morphological thinning) ---
    # thin() produces cleaner junctions than skeletonize() — fewer spur
    # branches where thick lines meet at corners.
    skel = thin(eroded)
    print(f"Skeleton: {np.sum(skel)} pixels")

    if debug_dir:
        save_debug_image(debug_dir, 5, "skeleton", skel)

    # --- Step 6: Trace paths ---
    paths = trace_paths(skel)
    print(f"Traced {len(paths)} paths")

    # --- Step 7: Simplify ---
    simplified = []
    for path in paths:
        sp = simplify_path(path, tolerance=tolerance)
        if len(sp) >= 2:
            simplified.append(sp)
    print(f"After simplification: {len(simplified)} paths, {sum(len(p) for p in simplified)} points")

    # --- Step 8: Smooth (optional) ---
    if smooth_iterations > 0:
        smoothed = []
        for path in simplified:
            pts = [(float(p[1]), float(p[0])) for p in path]  # (y,x) -> (x,y)
            pts = chaikin_smooth(pts, iterations=smooth_iterations)
            smoothed.append(pts)
        print(f"After Chaikin smoothing ({smooth_iterations} iterations): {sum(len(p) for p in smoothed)} points")
    else:
        smoothed = [[(float(p[1]), float(p[0])) for p in path] for path in simplified]

    if debug_dir:
        overlay = np.stack([arr.astype(np.uint8)] * 3, axis=-1)
        sy, sx = np.where(skel)
        overlay[sy, sx] = [255, 0, 0]
        # Mark dots in blue
        dy, dx = np.where(dot_mask)
        overlay[dy, dx] = [0, 100, 255]
        save_debug_image(debug_dir, 6, "overlay", overlay)

    # --- Step 9: Write SVG ---
    w, h = img.size
    with open(output_file, "w") as f:
        f.write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">\n')
        f.write(f'  <rect width="{w}" height="{h}" fill="white"/>\n')

        # Emit centerline paths
        for pts in smoothed:
            d = f"M {pts[0][0]:.1f},{pts[0][1]:.1f}"
            for pt in pts[1:]:
                d += f" L {pt[0]:.1f},{pt[1]:.1f}"
            f.write(f'  <path d="{d}" fill="none" stroke="black" '
                    f'stroke-width="{stroke_width}" stroke-linecap="round" stroke-linejoin="round"/>\n')

        # Emit filled dots as circles
        for cx, cy, radius in dots:
            f.write(f'  <circle cx="{cx:.1f}" cy="{cy:.1f}" r="{radius:.1f}" fill="black"/>\n')

        f.write("</svg>\n")

    print(f"Saved {output_file} ({len(smoothed)} paths, {len(dots)} dots)")


if __name__ == "__main__":
    main()
