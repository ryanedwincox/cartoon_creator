#!/usr/bin/env python3
"""Centerline-trace a black-and-white PNG into a single-stroke SVG."""

import sys
import numpy as np
from PIL import Image
from skimage.morphology import skeletonize, erosion
from scipy.ndimage import distance_transform_edt
from collections import defaultdict

def neighbors(y, x, shape):
    """8-connected neighbors."""
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dy == 0 and dx == 0:
                continue
            ny, nx = y + dy, x + dx
            if 0 <= ny < shape[0] and 0 <= nx < shape[1]:
                yield ny, nx

def trace_paths(skeleton):
    """Walk the skeleton graph and extract polyline paths."""
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

def simplify_path(path, tolerance=1.0):
    """Ramer-Douglas-Peucker simplification."""
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

def chaikin_smooth(pts, iterations=2):
    """Chaikin's corner-cutting: replace each corner with two points at 25%/75%.

    Preserves the first and last points of open paths.
    """
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

def main():
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <input.png> [output.svg] [--stroke-width N] [--tolerance N] [--smooth N]", file=sys.stderr)
        sys.exit(1)

    args = sys.argv[1:]
    input_file = args[0]
    output_file = None
    stroke_width = 3.0
    tolerance = 1.5
    smooth_iterations = 0  # Smoothing disabled — was causing artifacts

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
        elif output_file is None:
            output_file = args[i]
            i += 1
        else:
            i += 1

    if output_file is None:
        output_file = input_file.rsplit(".", 1)[0] + "_centerline.svg"

    # Load and threshold
    img = Image.open(input_file).convert("L")
    arr = np.array(img, dtype=float)
    print(f"Input: {img.size[0]}x{img.size[1]}")

    binary = arr < 128
    print(f"Dark pixels: {np.sum(binary)}")

    # Measure stroke width via distance transform
    dist = distance_transform_edt(binary)
    # Median distance of interior pixels gives half the stroke width
    interior_dists = dist[dist > 0]
    if len(interior_dists) > 0:
        half_width = np.median(interior_dists)
        stroke_auto = half_width * 2
        print(f"Detected stroke width: ~{stroke_auto:.1f}px (half={half_width:.1f})")
    else:
        half_width = 4
        stroke_auto = 8

    # Erode the binary image to thin lines down to ~2px before skeletonizing.
    # This eliminates the thick-line junction artifacts that cause spurs.
    erode_radius = max(1, int(half_width) - 1)
    print(f"Eroding by {erode_radius}px to thin lines before skeletonizing")
    eroded = binary.copy()
    for _ in range(erode_radius):
        eroded = erosion(eroded)

    # Skeletonize the thinned image - much cleaner at junctions
    skel = skeletonize(eroded)
    print(f"Skeleton: {np.sum(skel)} pixels")

    # Trace paths
    paths = trace_paths(skel)
    print(f"Traced {len(paths)} paths")

    # Simplify
    simplified = []
    for path in paths:
        sp = simplify_path(path, tolerance=tolerance)
        if len(sp) >= 2:
            simplified.append(sp)
    print(f"After simplification: {len(simplified)} paths, {sum(len(p) for p in simplified)} points")

    # Smooth corners via Chaikin's corner-cutting
    if smooth_iterations > 0:
        smoothed = []
        for path in simplified:
            pts = [(float(p[1]), float(p[0])) for p in path]  # (y,x) -> (x,y)
            pts = chaikin_smooth(pts, iterations=smooth_iterations)
            smoothed.append(pts)
        print(f"After Chaikin smoothing ({smooth_iterations} iterations): {sum(len(p) for p in smoothed)} points")
    else:
        smoothed = [[(float(p[1]), float(p[0])) for p in path] for path in simplified]

    # Write SVG
    w, h = img.size
    with open(output_file, "w") as f:
        f.write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">\n')
        f.write(f'  <rect width="{w}" height="{h}" fill="white"/>\n')
        for pts in smoothed:
            d = f"M {pts[0][0]:.1f},{pts[0][1]:.1f}"
            for pt in pts[1:]:
                d += f" L {pt[0]:.1f},{pt[1]:.1f}"
            f.write(f'  <path d="{d}" fill="none" stroke="black" '
                    f'stroke-width="{stroke_width}" stroke-linecap="round" stroke-linejoin="round"/>\n')
        f.write("</svg>\n")

    print(f"Saved {output_file}")

if __name__ == "__main__":
    main()
