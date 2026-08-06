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

THE MASTERS, AND WHY THEY ALL NEED THE SAME BACKGROUND
-----------------------------------------------------
The first set was eight subjects each floating in its own dark vignette. Their
border brightness ran from 35 (oil-ghee) to 129 (fashion-clothes) — measured,
not guessed — and eight tiles in a row with backgrounds that far apart read as
unrelated images rather than a set, whatever the CSS does. Nothing in the page
can fix that; two attempts are recorded in modules/home/home.css.

So the masters must agree with each other. Regenerate ALL EIGHT in one sitting
with the same background and lighting clause, never one at a time. The shared
half of the prompt:

  Studio product photograph of <SUBJECT>, centred, on a seamless pure white
  background, soft even diffused lighting, one subtle contact shadow directly
  beneath the subject, no props, no text, no watermark, no border, square 1:1
  composition with generous empty margin on all four sides, sharp commercial
  e-commerce catalogue style.

and the subject for each:

  oil-ghee            a tall bottle of olive oil beside a glass jar of golden ghee
  chocolates-dairy    a stack of chocolate bars beside a milk bottle and a wedge of cheese
  home-decor          a ceramic table lamp beside a vase of dried pampas grass
  kitchen-appliances  a stainless steel blender beside an electric kettle and an air fryer
  dates-nuts          a wooden bowl of Medjool dates beside a bowl of pistachios and almonds
  kids-toys           a wooden stacking-ring toy, a teddy bear and coloured building blocks
  fashion-clothes     a neatly folded stack of pastel clothing beside a pair of shoes
  flash-sale          red and gold gift boxes and shopping bags

Square masters are used as-is; portrait ones get the upward crop below. Save at
1024px or larger — anything smaller is upscaled into the 560w tier and shows.

INPUTS
------
Masters live in assets/images/categories/_src/<slug>.png (or .jpg) when you
have them. They are large and are not committed; without them this falls back
to re-deriving the WebP tiers from the committed <slug>.jpg, which is lossless
enough for a re-run but not a substitute for the original.

Usage:  python tools/gen-category-images.py
"""
import hashlib
import pathlib
import re
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


WHITE_CUT = 244    # below this is subject, at or above is the white ground
MARGIN = 1.20      # the square is 20% wider than the subject's longest side


def content_box(im):
    """The subject's bounding box on a white ground, or None if there is none.

    Only meaningful for the white-background masters. A dark-vignette master
    has no white ground, the mask covers the whole frame, and this returns the
    full image — which is exactly the right answer for it, since square() then
    falls through to the geometric crop below.
    """
    mask = im.convert("L").point(lambda v: 255 if v < WHITE_CUT else 0)
    return mask.getbbox()


def square(im):
    """Crop to 1:1 around the subject, so every tile frames its product alike.

    Framing used to be geometric — centre a landscape, and hold a fixed offset
    down a portrait — which keeps a subject whole but says nothing about how
    BIG it lands. Across eight masters that produced eight different product
    sizes on one row: the thing the tiles are supposed to have in common.

    On a white ground the subject can simply be found. The square is centred on
    it and sized to its longest side plus a fixed margin, so a tall bottle and a
    wide bowl of nuts arrive at the same visual weight. Only the geometric path
    remains for anything without a white ground.
    """
    w, h = im.size
    box = content_box(im)

    # A box covering essentially the whole frame means no white ground was
    # found; do not pretend the numbers mean anything.
    if box and (box[2] - box[0]) < w * .97 and (box[3] - box[1]) < h * .97:
        cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
        side = max(box[2] - box[0], box[3] - box[1]) * MARGIN
        side = int(min(side, w, h))                       # never exceed the master
        x = int(max(0, min(cx - side / 2, w - side)))     # clamp inside the frame
        y = int(max(0, min(cy - side / 2, h - side)))
        return im.crop((x, y, x + side, y + side))

    if w == h:
        return im
    if h < w:                                   # landscape master: plain centre
        x = (w - h) // 2
        return im.crop((x, 0, x + h, h))
    # Portrait: hold TOP_Y's proportion so this works at any master resolution,
    # then clamp — a master shorter than expected must not crop off the bottom.
    top = min(int(h * TOP_Y / 1536), h - w)
    return im.crop((0, top, w, top + w))


ART_URL = re.compile(
    r"(assets/images/categories/[a-z0-9-]+(?:-\d+)?\.(?:webp|jpg))(\?v=[0-9a-f]+)?")


def stamp(version):
    """Put `?v=<version>` on every tile-art URL in the pages that use them.

    WHY THIS EXISTS
    ---------------
    The tiers are written to fixed names, so replacing the art changes the
    bytes and not the URL, and nothing downstream can tell. Caught live: the
    CDN kept serving a 55-minute-old copy of the old art under a URL whose
    bytes had changed, and the response carried `max-age=604800` — every
    visitor who had seen the page would have kept the previous artwork for a
    week, with no way to fix it from here short of renaming files by hand.

    A version derived from the art's own bytes makes the URL change whenever
    the art does, so no cache anywhere — edge or browser — can hold a stale
    copy, and nobody has to remember to bump anything.
    """
    targets = [ROOT / "index.html", ROOT / "modules" / "home" / "home.js"]
    for f in targets:
        if not f.exists():
            print(f"  stamp: {f.name} missing, skipped")
            continue
        txt = f.read_text(encoding="utf-8")
        # `?v=` is stripped and reapplied, so re-running never stacks tokens.
        new = ART_URL.sub(lambda m: f"{m.group(1)}?v={version}", txt)
        new = re.sub(r"(const ART_V = ')[0-9a-f]*(')", rf"\g<1>{version}\g<2>", new)
        if new != txt:
            f.write_text(new, encoding="utf-8")
            print(f"  stamped {f.name}")


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

    # Hash what was written, not the masters: the masters are not committed,
    # and it is the delivered bytes a cache is holding.
    h = hashlib.sha256()
    for f in sorted(CDIR.glob("*.webp")) + sorted(CDIR.glob("*.jpg")):
        h.update(f.read_bytes())
    version = h.hexdigest()[:8]
    stamp(version)
    print(f"generated tile art for {written} categories (v={version})")


if __name__ == "__main__":
    main()
