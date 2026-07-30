#!/usr/bin/env python3
"""
Every internal link and asset reference in the built site, resolved to a file.

WHY
---
Nothing has ever checked this. The site is 42 static pages that reference each
other by hand-written path, plus an assembler that rewrites those paths per
page depth (`relativize`). A wrong path produces no error anywhere: the page
builds, deploys, and serves a 404 to whoever clicks it. The first report comes
from a customer, if it comes at all.

That risk is not theoretical here — `relativize` rewrites `="/…"` into
`="../../…"` based on how deep the output file sits, so a link that is correct
in a fragment can be wrong in the page built from it, and only for pages at
some depths.

WHAT IT CHECKS
--------------
href and src on every element, plus url() inside inline styles. Resolved
relative to the page's own directory, exactly as a browser would.

WHAT IT SKIPS, and why each is not a hole:
  - external URLs        — checking those is a network test, not a build test
  - mailto:, tel:, wa.me — not files
  - #anchors             — checked for the target id on the same page instead
  - query strings        — stripped; ?v= hashes and ?id= are not part of the path

Usage:  python tools/link-check.py
        exit 1 if any internal reference points at nothing
"""
import pathlib
import re
import sys
import urllib.parse

sys.stdout.reconfigure(encoding="utf-8")

ROOT = pathlib.Path(__file__).resolve().parent.parent
# Partials and fragments are not standalone documents — they are inlined into
# pages. Checking them on their own reports false positives: header.html's skip
# link points at <main id="main">, which lives in the page, not the partial.
SKIP_DIRS = ("node_modules", "_BACKUPS", "vendor", "tools",
             "shared/components", "_fragments")

REF = re.compile(r'(?:href|src)="([^"]+)"')
CSS_URL = re.compile(r'url\(([^)]+)\)')
ID = re.compile(r'id="([^"]+)"')

EXTERNAL = ("http://", "https://", "mailto:", "tel:", "javascript:", "//")


def main() -> int:
    pages = [
        p for p in ROOT.rglob("*.html")
        if not any(s in p.relative_to(ROOT).as_posix() for s in SKIP_DIRS)
    ]

    broken = []
    anchors = []
    checked = 0

    for page in pages:
        rel = page.relative_to(ROOT).as_posix()
        html = page.read_text(encoding="utf-8")
        ids = set(ID.findall(html))

        refs = list(REF.findall(html))
        refs += [u.strip("'\" ") for u in CSS_URL.findall(html)]

        for raw in refs:
            target = raw.strip()

            if not target or target.startswith(EXTERNAL) or target.startswith("data:"):
                continue

            # Same-page anchor: the target must be an id on this page.
            if target.startswith("#"):
                name = target[1:]
                if name and name not in ids:
                    anchors.append(f"{rel}  ->  {target}")
                continue

            # Strip the query and any fragment; neither is part of the path.
            path = urllib.parse.urlparse(target).path
            if not path:
                continue

            checked += 1

            if path.startswith("/"):
                resolved = ROOT / path.lstrip("/")
            else:
                resolved = (page.parent / path).resolve()

            if not resolved.exists():
                broken.append(f"{rel}\n      -> {target}")

    print(f"  {len(pages)} pages, {checked} internal references resolved\n")

    if broken:
        print(f"  {len(broken)} BROKEN — these point at no file:")
        for b in broken:
            print(f"    {b}")
        print()

    if anchors:
        print(f"  {len(anchors)} anchors with no matching id on the page:")
        for a in anchors:
            print(f"    {a}")
        print()

    if broken or anchors:
        return 1

    print("  every internal link and asset resolves")
    return 0


if __name__ == "__main__":
    sys.exit(main())
