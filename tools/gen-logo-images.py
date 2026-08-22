#!/usr/bin/env python3
"""
Web-sized copies of the two logo masters.

WHY THIS EXISTS
---------------
The masters are 520px and 720px PNGs with alpha — 216 KB and 315 KB. They were
being served, untouched, into boxes 38 and 80 CSS pixels wide, on every page of
the storefront:

    assets/logo/gulfrabit-mark.png   216 KB -> a 38px header mark
    assets/logo/gulfrabit-logo.png   315 KB -> an 80px drawer logo

That is half a megabyte of PNG before a phone has painted anything, for two
pictures whose largest honest rendering is 240px. On the connection most of
this shop's customers are on, it is the single most expensive thing on the
page — more than the CSS, more than the hero.

The masters stay where they are. They are the source, they are what a designer
edits, and they are what a print asset or a social card is cut from. This
writes the web tiers beside them.

WHAT IT WRITES

    gulfrabit-mark-120.webp/.png    header at 38px on a 3x phone,
                                    footer at 60px on a 2x screen
    gulfrabit-mark-240.webp/.png    footer at 60px on a 3x phone
    gulfrabit-logo-240.webp/.png    drawer at 80px on a 3x phone

WebP with a PNG beside it, the same shape as the category tiles: WebP is a
third of the size and the PNG is what a browser too old for it gets. Both keep
the alpha channel — these sit on a white header and a tinted drawer, and a
flattened logo shows its box against one of them.

Usage:  python tools/gen-logo-images.py
Re-run after replacing a master.
"""
import pathlib
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is not installed.  pip install Pillow")

ROOT = pathlib.Path(__file__).resolve().parent.parent
LOGOS = ROOT / "assets" / "logo"

# master filename -> the widths the markup actually asks for.
#
# Nothing here is a round number for its own sake: each one is a CSS box from
# shared/css/gulfrabit.css multiplied by a device pixel ratio that exists.
# Adding a tier nobody references is bytes in the repo and a choice the browser
# has to make for no benefit.
TIERS = {
    "gulfrabit-mark.png": (120, 240),
    "gulfrabit-logo.png": (240,),
}

# 88, not 82. A logo is flat colour with hard edges, which is where WebP's
# lossy mode shows its artefacts first — a halo along the wordmark. The file is
# a few KB either way at these sizes, so the quality is worth more than the
# saving.
QUALITY = 88


def main() -> int:
    if not LOGOS.is_dir():
        sys.exit(f"missing {LOGOS}")

    written = 0

    for name, widths in TIERS.items():
        master = LOGOS / name

        if not master.exists():
            print(f"  SKIP {name} — no master")
            continue

        with Image.open(master) as im:
            im = im.convert("RGBA")

            for width in widths:
                if width > im.width:
                    # Upscaling produces a bigger file that looks worse. If a
                    # master is ever replaced with something small, say so
                    # rather than quietly shipping a blurry mark.
                    print(f"  SKIP {name} @{width} — master is only {im.width}px")
                    continue

                stem = master.stem
                out = im.resize((width, width), Image.LANCZOS)

                webp = LOGOS / f"{stem}-{width}.webp"
                png = LOGOS / f"{stem}-{width}.png"

                out.save(webp, "WEBP", quality=QUALITY, method=6)
                out.save(png, "PNG", optimize=True)

                written += 2
                print(f"  {webp.name:30} {webp.stat().st_size // 1024:4} KB"
                      f"   {png.name:30} {png.stat().st_size // 1024:4} KB")

    master_bytes = sum((LOGOS / n).stat().st_size for n in TIERS if (LOGOS / n).exists())
    print(f"\n  {written} files written. Masters left alone ({master_bytes // 1024} KB, not served).")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
