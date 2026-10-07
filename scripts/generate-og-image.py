#!/usr/bin/env python3
"""Compose the Open Graph card for corez.pro.

The old og:image was corez-black.png: a 1024x1024 PNG whose mark is black on a
fully transparent background (85% of its pixels are alpha=0). Social platforms
composite transparency onto a background of their choosing -- frequently black,
which makes a black logo invisible -- and a 1:1 square in a 1.91:1
summary_large_image slot gets centre-cropped. This produces an opaque 1200x630
card instead, typeset in the same Outfit face the interface uses.

Run: python3 scripts/generate-og-image.py
"""
from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W, H = 1200, 630
BG = (10, 10, 10)
FG = (255, 255, 255)
MUTED = (161, 161, 170)
OUT = os.path.join(ROOT, "public", "og-image.png")


def outfit(weight: int, size: int) -> ImageFont.FreeTypeFont:
    """Outfit as a static instance at `weight`, from the vendored woff2."""
    src = os.path.join(ROOT, "src", "assets", "fonts", "outfit-latin-var.woff2")
    tmp = "/tmp/outfit-static.ttf"
    font = TTFont(src)
    font.flavor = None  # decompress woff2 -> plain ttf
    font["name"].setName(f"Outfit {weight}", 1, 3, 1, 0x409)
    font["name"].setName("Regular", 2, 3, 1, 0x409)
    font.save(tmp)
    f = ImageFont.truetype(tmp, size)
    try:
        f.set_variation_by_axes([weight])
    except Exception:
        pass  # already static, or the instance is not variable
    return f


def tracked(draw, xy, text, font, fill, tracking):
    """Draw `text` with letter-spacing, returning the advance width."""
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=font, fill=fill)
        x += draw.textlength(ch, font=font) + tracking
    return x - xy[0]


img = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(img)

# A soft radial lift so the card is not a flat rectangle of #0a0a0a.
glow = Image.new("L", (W, H), 0)
gd = ImageDraw.Draw(glow)
gd.ellipse([W * 0.42, -H * 0.55, W * 1.25, H * 0.85], fill=48)
img = Image.composite(Image.new("RGB", (W, H), (28, 28, 34)), img, glow.filter(__import__("PIL.ImageFilter", fromlist=["ImageFilter"]).GaussianBlur(140)))
d = ImageDraw.Draw(img)

# Logo: the white mark, which is opaque over the dark card.
logo = Image.open(os.path.join(ROOT, "public", "corez-white.png")).convert("RGBA")
logo.thumbnail((190, 190), Image.LANCZOS)

wordmark = outfit(700, 104)
tagline = outfit(400, 40)
WM = "COREZ"
TG = "Turn ideas into websites, apps & games"
TRACKING = 6

# Measure the lockup so the whole group is centred rather than pinned left.
probe = ImageDraw.Draw(Image.new("RGB", (10, 10)))
wm_w = sum(probe.textlength(c, font=wordmark) + TRACKING for c in WM) - TRACKING
tg_w = probe.textlength(TG, font=tagline)
gap_x = 56
total_w = logo.width + gap_x + max(wm_w, tg_w)

wm_h, tg_h, gap_y = 104, 40, 22
block_h = wm_h + gap_y + tg_h
logo_x = int((W - total_w) / 2)
logo_y = (H - logo.height) // 2
text_x = logo_x + logo.width + gap_x
top = (H - block_h) // 2

img.paste(logo, (logo_x, logo_y), logo)
d = ImageDraw.Draw(img)
tracked(d, (text_x, top - 12), WM, wordmark, FG, TRACKING)
d.text((text_x, top + wm_h + gap_y), TG, font=tagline, fill=MUTED)

img.save(OUT, "PNG", optimize=True)
print(f"wrote {OUT}  {img.size}  {os.path.getsize(OUT) / 1024:.1f} kB")
