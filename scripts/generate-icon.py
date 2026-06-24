#!/usr/bin/env python3
"""
generate-icon.py

Generates a 1024x1024 flame PNG for George Foreman using Python stdlib only
(struct + zlib + math — no Pillow, no canvas).

Then uses macOS sips + iconutil to produce resources/icon.icns.

Usage:
    python3 scripts/generate-icon.py
"""

import math
import os
import shutil
import struct
import subprocess
import zlib

# ── Brand palette ─────────────────────────────────────────────────────────────
BG_COLOR = (0x14, 0x14, 0x14, 0xFF)  # #141414 — app background
FLAME_DARK = (0xC0, 0x3A, 0x0A, 0xFF)  # deep ember red-orange
FLAME_MID = (0xE8, 0x62, 0x1A, 0xFF)  # #e8621a — primary accent
FLAME_WARM = (0xF0, 0x83, 0x2A, 0xFF)  # #f0832a — warm orange
FLAME_AMBER = (0xF5, 0xB0, 0x40, 0xFF)  # amber
FLAME_YELLOW = (0xFA, 0xE0, 0x70, 0xFF)  # yellow
CORE_COLOR = (0xFF, 0xFF, 0xE8, 0xFF)  # near-white hot core

SIZE = 1024


# ── PNG helpers ───────────────────────────────────────────────────────────────


def _png_chunk(tag: bytes, data: bytes) -> bytes:
    c = zlib.crc32(tag + data) & 0xFFFFFFFF
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", c)


def write_png(path: str, pixels: list) -> None:
    h = len(pixels)
    w = len(pixels[0])
    raw = b""
    for row in pixels:
        raw += b"\x00"  # filter type None
        for r, g, b, a in row:
            raw += bytes([r, g, b, a])
    compressed = zlib.compress(raw, 9)
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n")
        f.write(_png_chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)))
        f.write(_png_chunk(b"IDAT", compressed))
        f.write(_png_chunk(b"IEND", b""))


# ── Rounded rect mask ─────────────────────────────────────────────────────────


def rounded_rect_alpha(x: int, y: int, size: int, radius: int) -> float:
    """Returns 1.0 inside rounded rect, 0.0 outside, with a 2px smooth edge."""
    cx, cy = size / 2, size / 2
    dx = abs(x - cx) - (size / 2 - radius)
    dy = abs(y - cy) - (size / 2 - radius)
    if dx <= 0 and dy <= 0:
        return 1.0
    dist = math.sqrt(max(dx, 0) ** 2 + max(dy, 0) ** 2)
    return max(0.0, 1.0 - dist / 2)


# ── Flame shape ───────────────────────────────────────────────────────────────


def flame_intensity(nx: float, ny: float) -> float:
    """
    nx, ny in [-1, 1] relative to icon centre.
    Returns flame intensity [0, 1] — 0 = outside flame, 1 = hottest core.

    The flame is:
    - Widest at the bottom (~60% of icon width)
    - Narrows and curves toward the top
    - Has three sub-peaks (classic 3-tongue flame silhouette)
    - Rounded base
    """
    # fy: 0 = top, 1 = bottom
    fy = (ny + 1) / 2

    # Flame only in lower 88% of icon
    if fy < 0.06:
        return 0.0

    # Base width expands toward bottom
    base_half_w = 0.44 * (fy ** 0.55)

    # Three-tongue silhouette: modulate width with a gentle 3-wave at the top
    tongue_amp = 0.08 * (1.0 - fy)
    half_w = base_half_w + tongue_amp * math.cos(nx * 3.0 * math.pi)

    # How far inside the flame edge are we?
    edge_dist = half_w - abs(nx)
    if edge_dist <= 0:
        return 0.0

    # Soft edge
    softness = 0.07
    edge_alpha = min(1.0, edge_dist / softness)

    # Core: narrow vertical channel, hotter toward the base
    core_w = 0.13 * (fy ** 0.4)
    core_ratio = max(0.0, core_w - abs(nx)) / max(core_w, 1e-9)
    core_heat = (core_ratio ** 1.5) * (0.3 + 0.7 * fy)

    intensity = edge_alpha * (0.4 + 0.35 * fy + 0.25 * core_heat)
    return min(1.0, intensity)


def lerp_color(a: tuple, b: tuple, t: float) -> tuple:
    t = max(0.0, min(1.0, t))
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(4))


def flame_color(intensity: float, ny: float) -> tuple:
    """Map intensity + vertical position to RGBA."""
    fy = (ny + 1) / 2  # 0 = top, 1 = bottom
    heat = intensity * 0.55 + fy * 0.45

    if heat > 0.92:
        return lerp_color(FLAME_YELLOW, CORE_COLOR, (heat - 0.92) / 0.08)
    elif heat > 0.75:
        return lerp_color(FLAME_AMBER, FLAME_YELLOW, (heat - 0.75) / 0.17)
    elif heat > 0.55:
        return lerp_color(FLAME_WARM, FLAME_AMBER, (heat - 0.55) / 0.20)
    elif heat > 0.35:
        return lerp_color(FLAME_MID, FLAME_WARM, (heat - 0.35) / 0.20)
    elif heat > 0.15:
        return lerp_color(FLAME_DARK, FLAME_MID, (heat - 0.15) / 0.20)
    else:
        return lerp_color((0x80, 0x20, 0x05, 0xFF), FLAME_DARK, heat / 0.15)


# ── Render ────────────────────────────────────────────────────────────────────


def render(size: int) -> list:
    pixels = []
    padding = int(size * 0.07)
    area = size - padding * 2

    for y in range(size):
        row = []
        for x in range(size):
            bg_alpha = rounded_rect_alpha(x, y, size, radius=int(size * 0.18))
            if bg_alpha <= 0:
                row.append((0, 0, 0, 0))
                continue

            # Normalized coords within the flame drawing area
            nx = (x - padding - area / 2) / (area / 2)
            ny = (y - padding - area / 2) / (area / 2)

            intensity = flame_intensity(nx, ny)

            if intensity <= 0:
                br, bg, bb, _ = BG_COLOR
                a = int(bg_alpha * 255)
                row.append((br, bg, bb, a))
            else:
                fr, fg, fb, _ = flame_color(intensity, ny)
                br, bg, bb, _ = BG_COLOR
                flame_a = intensity
                r = int(fr * flame_a + br * (1 - flame_a))
                g = int(fg * flame_a + bg * (1 - flame_a))
                b = int(fb * flame_a + bb * (1 - flame_a))
                a = int(bg_alpha * 255)
                row.append((r, g, b, a))
        pixels.append(row)
    return pixels


# ── iconset sizes required by macOS ──────────────────────────────────────────

ICONSET_SIZES = [
    (16, "icon_16x16.png"),
    (32, "icon_16x16@2x.png"),
    (32, "icon_32x32.png"),
    (64, "icon_32x32@2x.png"),
    (128, "icon_128x128.png"),
    (256, "icon_128x128@2x.png"),
    (256, "icon_256x256.png"),
    (512, "icon_256x256@2x.png"),
    (512, "icon_512x512.png"),
    (1024, "icon_512x512@2x.png"),
]


# ── Main ──────────────────────────────────────────────────────────────────────


def main() -> None:
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    resources = os.path.join(repo_root, "resources")
    iconset_dir = os.path.join(resources, "icon.iconset")
    icns_path = os.path.join(resources, "icon.icns")
    source_png = os.path.join(resources, "icon-1024.png")

    os.makedirs(iconset_dir, exist_ok=True)

    # 1. Render 1024x1024 source PNG
    print(f"Rendering {SIZE}x{SIZE} flame PNG...")
    pixels = render(SIZE)
    write_png(source_png, pixels)
    print(f"  -> {source_png}")

    # 2. Generate all iconset sizes using sips
    print("Generating iconset sizes...")
    for px_size, filename in ICONSET_SIZES:
        dst = os.path.join(iconset_dir, filename)
        subprocess.run(
            ["sips", "-z", str(px_size), str(px_size), source_png, "--out", dst],
            check=True,
            capture_output=True,
        )
        print(f"  {px_size:>4}px -> {filename}")

    # 3. Convert iconset -> .icns
    print("Converting iconset -> icon.icns...")
    if os.path.exists(icns_path):
        os.remove(icns_path)
    subprocess.run(
        ["iconutil", "-c", "icns", iconset_dir, "-o", icns_path],
        check=True,
        capture_output=True,
    )
    print(f"  -> {icns_path}")

    # 4. Clean up iconset dir (keep source PNG for reference)
    shutil.rmtree(iconset_dir)
    print("Done.")
    print(f"\nIcon written to:  {icns_path}")
    print(f"Source PNG kept:  {source_png}")


if __name__ == "__main__":
    main()
