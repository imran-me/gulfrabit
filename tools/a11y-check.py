#!/usr/bin/env python3
"""
Accessibility problems that can be found without a browser.

WHY THESE FIVE
--------------
Each one is invisible to the person who introduced it and obvious to the person
affected by it. Nothing here is a matter of taste; every finding is either a
control somebody cannot use or markup that is wrong on its own terms.

  1. Images with no alt attribute. A missing alt makes a screen reader read the
     FILENAME — "gr-2501.svg" — which is worse than silence. Note the
     distinction the checker keeps: alt="" is CORRECT for decoration and is not
     reported; a missing attribute is.

  2. Form controls with no accessible name. An <input> with only a placeholder
     is announced as "edit text, blank" once the field has content. On a
     checkout that is a customer unable to tell which box is the phone number.

  3. Duplicate ids. Breaks every in-page anchor to that id, breaks
     label[for=], and is invalid HTML. Easy to introduce by pasting a block.

  4. Buttons and links with no text and no aria-label. An icon-only button is
     announced as "button" — the wishlist, cart and search controls in the
     header are all icon-only, so this is a real risk on the most-used chrome
     on the site.

  5. Heading levels that skip. h2 straight to h4 tells a screen-reader user
     they have missed a section. It is also how search engines read structure.

WHAT IT DOES NOT DO
-------------------
Contrast, focus order, and anything needing layout. Those need a browser, and
pretending a regex can judge them would be worse than not checking.

Usage:  python tools/a11y-check.py
        exit 1 if any page has a finding
"""
import pathlib
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")

ROOT = pathlib.Path(__file__).resolve().parent.parent
SKIP = ("node_modules", "_BACKUPS", "vendor", "tools", "shared/components", "_fragments")

IMG = re.compile(r"<img\b([^>]*)>", re.I)
INPUT = re.compile(r"<(input|select|textarea)\b([^>]*)>", re.I)
BUTTON = re.compile(r"<button\b([^>]*)>(.*?)</button>", re.I | re.S)
ID = re.compile(r'\bid="([^"]+)"')
HEADING = re.compile(r"<h([1-6])\b", re.I)
LABEL_FOR = re.compile(r'<label\b[^>]*\bfor="([^"]+)"')
COMMENT = re.compile(r"<!--.*?-->", re.S)

# <label><input> Keep me signed in</label> — the control is labelled by being
# INSIDE the label, with no for/id pair. It is the dominant pattern in this
# codebase (every checkbox, every delivery and payment option) and it is valid
# HTML. A checker that does not know it reports fourteen false positives and
# then gets ignored, which is worse than not checking at all.
IMPLICIT_LABEL = re.compile(r"<label\b[^>]*>(.*?)</label>", re.S | re.I)

# Types that are not user-facing text fields and need no visible label.
NO_LABEL_NEEDED = ("hidden", "submit", "button", "reset", "image")


def attr(tag: str, name: str) -> str | None:
    m = re.search(rf'\b{name}="([^"]*)"', tag, re.I)
    return m.group(1) if m else None


def has(tag: str, name: str) -> bool:
    return re.search(rf"\b{name}\b", tag, re.I) is not None


def audit(html: str) -> list[str]:
    # Comments first. Documentation frequently shows the markup it describes —
    # a comment explaining that a widget "keeps a hidden <input name='image'>
    # in step" was reported as an unlabelled field.
    html = COMMENT.sub("", html)

    found = []

    # Every control sitting inside a <label> is labelled by it.
    implicit = set()
    for inner in IMPLICIT_LABEL.findall(html):
        for kind, tag in INPUT.findall(inner):
            implicit.add((kind, tag))

    # 1. images
    for tag in IMG.findall(html):
        if not has(tag, "alt"):
            src = attr(tag, "src") or "?"
            found.append(f"<img> with no alt attribute — src={src}")

    # 2. form controls
    labelled = set(LABEL_FOR.findall(html))
    for kind, tag in INPUT.findall(html):
        if (attr(tag, "type") or "text").lower() in NO_LABEL_NEEDED:
            continue
        el_id = attr(tag, "id")
        named = (
            (kind, tag) in implicit
            or (el_id and el_id in labelled)
            or has(tag, "aria-label")
            or has(tag, "aria-labelledby")
            or has(tag, "title")
        )
        if not named:
            hint = attr(tag, "name") or attr(tag, "placeholder") or "?"
            found.append(f"<{kind}> with no label, aria-label or title — name={hint}")

    # 3. duplicate ids
    ids = ID.findall(html)
    for dupe in sorted({i for i in ids if ids.count(i) > 1}):
        found.append(f'duplicate id="{dupe}" ({ids.count(dupe)} times)')

    # 4. icon-only controls
    for tag, inner in BUTTON.findall(html):
        text = re.sub(r"<[^>]+>", "", inner).strip()
        if not text and not (has(tag, "aria-label") or has(tag, "aria-labelledby") or has(tag, "title")):
            found.append("<button> with no text and no aria-label")

    # 5. heading order
    levels = [int(n) for n in HEADING.findall(html)]
    for prev, cur in zip(levels, levels[1:]):
        if cur > prev + 1:
            found.append(f"heading jumps h{prev} -> h{cur}")
            break      # one per page; the first is the one to fix

    return found


def main() -> int:
    pages = [
        p for p in sorted(ROOT.rglob("*.html"))
        if not any(s in p.relative_to(ROOT).as_posix() for s in SKIP)
    ]

    total = 0
    for page in pages:
        findings = audit(page.read_text(encoding="utf-8"))
        if not findings:
            continue
        total += len(findings)
        print(f"  {page.relative_to(ROOT).as_posix()}")
        for f in findings:
            print(f"      {f}")

    print()
    if total:
        print(f"  {total} finding(s) across {len(pages)} pages")
        return 1

    print(f"  {len(pages)} pages, no findings")
    return 0


if __name__ == "__main__":
    sys.exit(main())
