#!/usr/bin/env python3
"""rebuild-logo.py — Linux port of scripts/rebuild-logo.ps1.

Regenerates the Corez logo assets from the reference image "new logo.jpeg":

  1. Binary mask from the reference (luminance threshold).
  2. Drop tiny connected components (JPEG noise specks).
  3. Erode the mask (L1 diamond, radius 2 at 256px) so strokes render
     thinner — the same treatment the favicon already uses.
  4. Render transparent PNGs (white and black mark) at 1024px.
  5. Trace the mask boundary (Moore-neighbor contour tracing), simplify and
     smooth, and write public/corez.svg (fill="currentColor").

Outputs (overwritten):
  public/corez.svg, corez-white.png, corez-black.png, corez-logo.png,
  corez.png, corez-bw.png. favicon.png is left untouched (already eroded).
"""

import os
import sys

import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(ROOT, "new logo.jpeg")
OUT_DIR = os.path.join(ROOT, "public")
W = H = 256
ERODE_RADIUS = 2
MIN_COMPONENT = 30


def load_mask():
    img = Image.open(SOURCE).convert("L").resize((W, H), Image.Resampling.LANCZOS)
    return np.array(img) < 128


def drop_small_components(mask):
    label = np.zeros((H, W), dtype=np.int32)
    sizes = [0]
    current = 0
    for y in range(H):
        for x in range(W):
            if mask[y, x] and label[y, x] == 0:
                current += 1
                sizes.append(0)
                stack = [(x, y)]
                label[y, x] = current
                while stack:
                    px, py = stack.pop()
                    sizes[current] += 1
                    for dy in (-1, 0, 1):
                        for dx in (-1, 0, 1):
                            nx, ny = px + dx, py + dy
                            if 0 <= nx < W and 0 <= ny < H and mask[ny, nx] and label[ny, nx] == 0:
                                label[ny, nx] = current
                                stack.append((nx, ny))
    out = mask.copy()
    for y in range(H):
        for x in range(W):
            if label[y, x] > 0 and sizes[label[y, x]] < MIN_COMPONENT:
                out[y, x] = False
    return out


def erode_l1(mask, radius):
    out = mask.copy()
    for y in range(radius, H - radius):
        for x in range(radius, W - radius):
            if not mask[y, x]:
                continue
            ok = True
            for dy in range(-radius, radius + 1):
                rem = radius - abs(dy)
                for dx in range(-rem, rem + 1):
                    if not mask[y + dy, x + dx]:
                        ok = False
                        break
                if not ok:
                    break
            if not ok:
                out[y, x] = False
    return out


def save_png(mask, path, size, color):
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    for y in range(H):
        for x in range(W):
            if mask[y, x]:
                draw.rectangle((x, y, x + 1, y + 1), fill=color)
    big = canvas.resize((size, size), Image.Resampling.LANCZOS)
    big.save(path, "PNG")
    print("wrote", os.path.relpath(path, ROOT))


def trace_loops(mask):
    """Moore-neighbor contour tracing, ported from rebuild-logo.ps1."""
    dx8 = [0, 1, 1, 1, 0, -1, -1, -1]
    dy8 = [-1, -1, 0, 1, 1, 1, 0, -1]
    visited = np.zeros((H, W), dtype=bool)
    loops = []

    for sy0 in range(H):
        for sx0 in range(W):
            if not mask[sy0, sx0] or visited[sy0, sx0]:
                continue
            is_boundary = any(
                not (0 <= sx0 + dx8[d] < W and 0 <= sy0 + dy8[d] < H and mask[sy0 + dy8[d], sx0 + dx8[d]])
                for d in (0, 2, 4, 6)
            )
            if not is_boundary:
                continue

            loop = [(sx0, sy0)]
            visited[sy0, sx0] = True
            cur_x, cur_y = sx0, sy0
            entry = 0
            steps = 0
            while True:
                found = False
                for i in range(1, 9):
                    d = (entry + i) % 8
                    nx, ny = cur_x + dx8[d], cur_y + dy8[d]
                    if 0 <= nx < W and 0 <= ny < H and mask[ny, nx]:
                        loop.append((nx, ny))
                        visited[ny, nx] = True
                        cur_x, cur_y = nx, ny
                        entry = (d + 4) % 8
                        found = True
                        break
                if not found:
                    break
                steps += 1
                if (cur_x == sx0 and cur_y == sy0) or steps >= 100000:
                    break

            if len(loop) > 2:
                loops.append(loop)
    return loops


def simplify_and_smooth(loop):
    n = len(loop)
    pts = []
    for i in range(n):
        prev = loop[(i - 1 + n) % n]
        cur = loop[i]
        nxt = loop[(i + 1) % n]
        cross = (cur[0] - prev[0]) * (nxt[1] - cur[1]) - (cur[1] - prev[1]) * (nxt[0] - cur[0])
        if cross != 0 or (cur[0] == prev[0] and cur[1] == prev[1]):
            pts.append([float(cur[0]), float(cur[1])])
    m = len(pts)
    if m < 4:
        return pts
    smooth = 3
    for _ in range(2):
        smoothed = []
        for i in range(m):
            sum_x = sum(pts[(i + w + m) % m][0] for w in range(-smooth, smooth + 1))
            sum_y = sum(pts[(i + w + m) % m][1] for w in range(-smooth, smooth + 1))
            cnt = 2 * smooth + 1
            smoothed.append([sum_x / cnt, sum_y / cnt])
        pts = smoothed
    return pts


def write_svg(loops, path):
    d = ""
    for loop in loops:
        pts = simplify_and_smooth(loop)
        if len(pts) < 3:
            continue
        d += f"M{round(pts[0][0], 2)} {round(pts[0][1], 2)}"
        for x, y in pts[1:]:
            d += f"L{round(x, 2)} {round(y, 2)}"
        d += "Z"
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="100%" height="100%">\n'
        f'  <path fill="currentColor" fill-rule="evenodd" d="{d}" />\n</svg>\n'
    )
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(svg)
    print("wrote", os.path.relpath(path, ROOT), f"({len(loops)} loops, {len(d)} path chars)")


def main():
    if not os.path.exists(SOURCE):
        print(f"Reference image not found: {SOURCE}", file=sys.stderr)
        sys.exit(1)
    os.makedirs(OUT_DIR, exist_ok=True)

    mask = drop_small_components(load_mask())
    thin = erode_l1(mask, ERODE_RADIUS)

    white = (255, 255, 255, 255)
    black = (0, 0, 0, 255)
    save_png(thin, os.path.join(OUT_DIR, "corez-white.png"), 1024, white)
    save_png(thin, os.path.join(OUT_DIR, "corez-black.png"), 1024, black)
    save_png(thin, os.path.join(OUT_DIR, "corez-logo.png"), 1024, white)
    save_png(thin, os.path.join(OUT_DIR, "corez.png"), 1024, black)
    save_png(thin, os.path.join(OUT_DIR, "corez-bw.png"), 1024, black)

    write_svg(trace_loops(thin), os.path.join(OUT_DIR, "corez.svg"))

    print(f"mask fill: {round(mask.mean() * 100, 1)}% -> {round(thin.mean() * 100, 1)}% after erosion")


if __name__ == "__main__":
    main()
