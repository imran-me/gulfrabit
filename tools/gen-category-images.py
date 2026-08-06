#!/usr/bin/env python3
"""
Derive the home-page category tile art from the photographic masters.

The tiles used to be 40px line icons. They are photographs now, and a
2.5MB portrait master dropped straight into a 274px square would be the
`perf(catalog)` mistake again — twenty times the pixels the box can show. So
every master is cropped once, here, and written out at the three widths the
tile is ever asked for:

    <slug>-160.webp   phones at 2x   (the tile's media box is ~68 CSS px)
    <slug>-280.webp   phones at 3x, desktop at 1x
    <slug>-560.webp   desktop at 2x  (the media box is ~274 CSS px)
    <slug>.jpg        the master, and the src= a browser without WebP loads

WHY A SQUARE CROP, AND WHY OFF-CENTRE
------------------------------------
The masters are 1024x1536 portraits: a subject floating in a dark vignette.
The subject occupies roughly y=285..1200 in the tallest case (oil-ghee's
bottle, cap to plate), so a 1024-tall square window fits every one of them —
but only if it sits ABOVE the true vertical centre. Centred (y=256) clips the
oil bottle's cap; TOP_Y below is the highest crop that still keeps every
subject whole, checked against all eight. Re-check it if a master is replaced
with a differently-framed shot.

The tile itself is square (see .category-card__media), so no CSS crop happens
on top of this one — what is written here is what is seen.

INPUTS
------
Masters live in assets/images/categories/_src/<slug>.png (or .jpg) when you
have them. They are large and are not committed; without them this falls back
to re-deriving the WebP tiers from the committed <slug>.jpg, which is lossless
enough for a re-run but not a substitute for the original.

Usage:  python tools/gen-category-images.py
"""
import pathlib
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is required:  pip install Pillow")

ROOT = pathlib.Path(__file__).resolve().parent.parent
CDIR = ROOT / "assets" / "images" / "categories"
SRC = CDIR / "_src"

# The live retail categories, in the order the home grid shows them.
SLUGS = [
    "oil-ghee",
    "chocolates-dairy",
    "home-decor",
    "kitchen-appliances",
    "dates-nuts",
    "kids-toys",
    "fashion-clothes",
    "flash-sale",
]

TOP_Y = 240        # top of the square crop in a 1536-tall master (see docstring)
MASTER = 1024      # the committed .jpg, and the box every tier is resized from
TIERS = (160, 280, 560)
JPG_Q = 86
WEBP_Q = 80


def square(im):
    """Crop to 1:1, biased upward so the subject is not clipped."""
    w, h = im.size
    if w == h:
        return im
    if h < w:                                   # landscape master: plain centre
        x = (w - h) // 2
        return im.crop((x, 0, x + h, h))
    # Portrait: hold TOP_Y's proportion so this works at any master resolution,
    # then clamp — a master shorter than expected must not crop off the bottom.
    top = min(int(h * TOP_Y / 1536), h - w)
    return im.crop((0, top, w, top + w))


def main():
    if not CDIR.exists():
        sys.exit(f"missing {CDIR}")
    written = 0
    for slug in SLUGS:
        master = next((p for p in (SRC / f"{slug}.png", SRC / f"{slug}.jpg") if p.exists()), None)
        if master:
            im = square(Image.open(master).convert("RGB"))
            if im.width != MASTER:
                im = im.resize((MASTER, MASTER), Image.LANCZOS)
            im.save(CDIR / f"{slug}.jpg", quality=JPG_Q, optimize=True, progressive=True)
        else:
            fallback = CDIR / f"{slug}.jpg"
            if not fallback.exists():
                print(f"  skip {slug}: no master in _src/ and no {slug}.jpg")
                continue
            im = Image.open(fallback).convert("RGB")

        for w in TIERS:
            im.resize((w, w), Image.LANCZOS).save(
                CDIR / f"{slug}-{w}.webp", quality=WEBP_Q, method=6)
        written += 1
        print(f"  {slug}: {im.width}px master + {', '.join(str(w) for w in TIERS)}")
    print(f"generated tile art for {written} categories")


if __name__ == "__main__":
    main()
