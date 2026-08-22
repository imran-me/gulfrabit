#!/usr/bin/env python3
"""
Web variants for every product photograph.

NOT gen-product-images.py. That one draws placeholder SVGs for products with
no photograph yet. This one takes the real photographs and cuts the sizes the
storefront actually asks for.

WHY
---
The masters are 1024-1254px squares, 50-400 KB each. The storefront shows them
in four boxes and only one of those is anywhere near that big:

    product card       160px on a phone, ~280px on a desktop grid
    PDP main image     up to ~560px
    cart line thumb    64px
    search suggestion  40px

A 40px suggestion list rendering six raw masters is most of a megabyte to
decorate a dropdown. That is the whole reason this file exists.

WHAT IT WRITES, beside each master:

    <stem>.webp         the master, re-encoded — a third off for nothing
    <stem>-card.webp    640px, for the card grid and the PDP
    <stem>-thumb.webp   128px, for the cart line and the search dropdown

WHY THOSE THREE AND NOT A LADDER OF SEVEN. Every tier is a file in the repo
and a choice the browser has to make; a tier nothing references is pure cost.
640 covers a 320px card on a 2x screen, which is the largest card any layout
here produces. 128 covers a 64px thumb at 2x and a 40px one at 3x — both of
the small boxes, with one file.

THE MASTERS ARE NOT TOUCHED. They stay the source a photographer replaces, and
the JPEG stays the <img> src so a browser without WebP renders exactly what it
did before. Nothing here is load-bearing: delete every generated file and the
shop still works, just heavier.

Usage:  python tools/gen-product-tiers.py
        python tools/gen-product-tiers.py --check    # CI: fail if any is missing
        python tools/gen-product-tiers.py --force    # rebuild all
"""
import argparse
import pathlib
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is not installed.  pip install Pillow")

ROOT = pathlib.Path(__file__).resolve().parent.parent
PRODUCTS = ROOT / "assets" / "images" / "products"

# suffix -> longest edge, or None for "the master's own size".
VARIANTS = {
    "": None,
    "-card": 640,
    "-thumb": 128,
}

# 82 for photographs, matching ImageStore. Product shots are continuous-tone,
# where WebP's lossy mode is at its best; the logo generator uses 88 because
# flat colour with hard edges is where it is at its worst.
QUALITY = 82

# The masters. PNG is included because a supplier occasionally sends one, and
# a PNG photograph is the most oversized thing that can land in this folder.
MASTER_SUFFIXES = (".jpg", ".jpeg", ".png")


def masters():
    if not PRODUCTS.is_dir():
        sys.exit(f"missing {PRODUCTS}")

    return sorted(
        p for p in PRODUCTS.iterdir()
        if p.suffix.lower() in MASTER_SUFFIXES
    )


def outputs_for(master):
    """(path, longest_edge) for each variant this master should have."""
    return [
        (PRODUCTS / f"{master.stem}{suffix}.webp", edge)
        for suffix, edge in VARIANTS.items()
    ]


def stale(master, out):
    """Missing, or older than the master it came from."""
    return not out.exists() or out.stat().st_mtime < master.stat().st_mtime


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true",
                    help="report what is missing and exit 1; writes nothing")
    ap.add_argument("--force", action="store_true",
                    help="rebuild every variant, even the up-to-date ones")
    args = ap.parse_args()

    found = masters()

    if not found:
        print("  no product masters found — nothing to do")
        return 0

    missing = []
    written = 0
    saved = 0

    for master in found:
        for out, edge in outputs_for(master):
            if not (args.force or stale(master, out)):
                continue

            if args.check:
                missing.append(out.relative_to(ROOT))
                continue

            with Image.open(master) as im:
                # RGB, not RGBA: a product photograph has no transparency, and
                # an alpha channel WebP is bigger for nothing.
                im = im.convert("RGB")

                if edge and max(im.size) > edge:
                    ratio = edge / max(im.size)
                    im = im.resize(
                        (round(im.width * ratio), round(im.height * ratio)),
                        Image.LANCZOS,
                    )

                im.save(out, "WEBP", quality=QUALITY, method=6)

            written += 1
            saved += master.stat().st_size - out.stat().st_size

    if args.check:
        if missing:
            print(f"  {len(missing)} product image variant(s) missing:")
            for m in missing[:12]:
                print(f"    {m}")
            if len(missing) > 12:
                print(f"    … and {len(missing) - 12} more")
            print("\n  Run: python tools/gen-product-tiers.py")
            return 1

        print(f"  {len(found)} masters, every variant present")
        return 0

    if not written:
        print(f"  {len(found)} masters, all variants up to date")
        return 0

    print(f"  {len(found)} masters -> {written} variant(s) written")

    total = sum(p.stat().st_size for p in PRODUCTS.iterdir() if p.suffix == ".webp")
    print(f"  generated webp on disk: {total // 1024} KB")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
