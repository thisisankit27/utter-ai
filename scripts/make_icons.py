#!/usr/bin/env python3
"""Generate the UtterAI icon set from a single vector-ish drawing (Pillow only).

Mark: a rounded-square "iris" gradient tile with a white speech-wave glyph —
five rounded bars whose heights trace a spoken cadence.
"""
from __future__ import annotations

import os
import struct

from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), "..", "src-tauri", "icons")
os.makedirs(OUT, exist_ok=True)

IRIS_TOP = (128, 123, 255)
IRIS_BOTTOM = (99, 91, 240)
WHITE = (255, 255, 255, 255)


def rounded_mask(size: int, radius_ratio: float = 0.235) -> Image.Image:
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    r = int(size * radius_ratio)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=255)
    return m


def gradient(size: int) -> Image.Image:
    base = Image.new("RGB", (1, size))
    for y in range(size):
        t = y / max(size - 1, 1)
        base.putpixel(
            (0, y),
            tuple(int(a + (b - a) * t) for a, b in zip(IRIS_TOP, IRIS_BOTTOM)),
        )
    return base.resize((size, size))


def draw_glyph(img: Image.Image) -> None:
    size = img.width
    d = ImageDraw.Draw(img)
    # Five bars; heights as a fraction of the tile.
    heights = [0.30, 0.56, 0.82, 0.48, 0.24]
    bar_w = size * 0.092
    gap = size * 0.064
    total = len(heights) * bar_w + (len(heights) - 1) * gap
    x = (size - total) / 2
    cy = size / 2
    for h in heights:
        bh = size * h
        d.rounded_rectangle(
            [x, cy - bh / 2, x + bar_w, cy + bh / 2],
            radius=bar_w / 2,
            fill=WHITE,
        )
        x += bar_w + gap


def render(size: int) -> Image.Image:
    tile = gradient(size).convert("RGBA")
    draw_glyph(tile)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(tile, (0, 0), rounded_mask(size))
    return out


def main() -> None:
    master = render(1024)
    master.save(os.path.join(OUT, "icon.png"))

    for name, size in [
        ("32x32.png", 32),
        ("128x128.png", 128),
        ("128x128@2x.png", 256),
        ("Square30x30Logo.png", 30),
        ("Square44x44Logo.png", 44),
        ("Square71x71Logo.png", 71),
        ("Square89x89Logo.png", 89),
        ("Square107x107Logo.png", 107),
        ("Square142x142Logo.png", 142),
        ("Square150x150Logo.png", 150),
        ("Square284x284Logo.png", 284),
        ("Square310x310Logo.png", 310),
        ("StoreLogo.png", 50),
    ]:
        render(size).save(os.path.join(OUT, name))

    ico_sizes = [16, 24, 32, 48, 64, 128, 256]
    master.save(
        os.path.join(OUT, "icon.ico"),
        sizes=[(s, s) for s in ico_sizes],
    )

    write_icns(os.path.join(OUT, "icon.icns"), master)
    print("icons written to", os.path.normpath(OUT))


def write_icns(path: str, master: Image.Image) -> None:
    """Minimal ICNS writer covering the types macOS actually needs."""
    types = [
        (b"ic07", 128),
        (b"ic08", 256),
        (b"ic09", 512),
        (b"ic10", 1024),
        (b"ic11", 32),
        (b"ic12", 64),
        (b"ic13", 256),
        (b"ic14", 512),
    ]
    import io

    chunks = b""
    for ostype, size in types:
        buf = io.BytesIO()
        master.resize((size, size)).save(buf, format="PNG")
        data = buf.getvalue()
        chunks += ostype + struct.pack(">I", len(data) + 8) + data
    total = len(chunks) + 8
    with open(path, "wb") as f:
        f.write(b"icns" + struct.pack(">I", total) + chunks)


if __name__ == "__main__":
    main()
