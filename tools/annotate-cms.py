#!/usr/bin/env python3
"""
Mark editable content in page fragments with `data-cms` keys.

WHY A GENERATOR
---------------
"Every text and image on every page is editable" means hundreds of attributes.
Typed by hand they would be inconsistent, half-finished, and stale the first
time a fragment changed. Generated, they are derived from the markup itself and
can be re-derived after any edit.

WHAT GETS A KEY
---------------
Headings, paragraphs and standalone images inside `<main>` — the words a
merchant would want to change. Deliberately NOT:

  * anything already carrying `data-*` bound to JS (product titles, prices,
    counts) — those come from the database and an override would be overwritten
    on the next render, which looks like the edit silently failed
  * `<script>`, `<style>`, `<svg>`
  * nodes with element children, because the key must own the WHOLE text it
    replaces; a paragraph containing a link would lose the link the moment an
    editor changed the sentence around it

That last exclusion is the important one. It is why this is safe: a key is only
ever attached to a node whose entire content is a single run of text.

KEYS ARE STABLE OR THEY ARE USELESS
-----------------------------------
`page.section.n` is derived from position, so inserting a paragraph above
another would renumber it and its override would jump to the wrong sentence. To
stop that, the key includes a short hash of the ORIGINAL text: content that
moves keeps its override, and content that is genuinely rewritten in the source
gets a new key and correctly falls back to the new authored wording.

Usage:  python tools/annotate-cms.py [--check]
"""
import hashlib
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

# Fragments whose copy is editorial. Catalogue, cart and checkout pages are
# rendered from data, so their text is not a merchant's to edit here.
TARGETS = {
    "modules/content/_fragments/about.main.html": "about",
    "modules/content/_fragments/sourcing.main.html": "sourcing",
    "modules/content/_fragments/faq.main.html": "faq",
    "modules/content/_fragments/contact.main.html": "contact",
    "modules/content/_fragments/shipping.main.html": "shipping",
}

# Elements whose text is editable copy.
TEXT_TAGS = ("h1", "h2", "h3", "h4", "h5", "p", "li")

# Attributes that mean "this node is filled by JavaScript". A CMS override on
# one of these would be replaced on the next render and look like a failed save.
JS_BOUND = re.compile(r'data-(?!cms)[a-z-]+')


def key_for(page: str, tag: str, text: str) -> str:
    digest = hashlib.sha1(text.strip().encode("utf-8")).hexdigest()[:6]
    return f"{page}.{tag}-{digest}"


def annotate(html: str, page: str) -> tuple[str, int]:
    added = 0

    def repl(match: re.Match) -> str:
        nonlocal added
        opening, attrs, inner, closing = match.group(1), match.group(2), match.group(3), match.group(4)

        if "data-cms" in attrs:
            return match.group(0)          # already annotated
        if JS_BOUND.search(attrs):
            return match.group(0)          # JS owns this node
        if "<" in inner:
            return match.group(0)          # has element children — see the docstring
        if not inner.strip():
            return match.group(0)

        added += 1
        key = key_for(page, opening, inner)
        return f"<{opening}{attrs} data-cms=\"{key}\">{inner}</{closing}>"

    pattern = re.compile(
        r"<(" + "|".join(TEXT_TAGS) + r")([^>]*)>(.*?)</(" + "|".join(TEXT_TAGS) + r")>",
        re.S,
    )
    return pattern.sub(repl, html), added


def main() -> int:
    check_only = "--check" in sys.argv
    stale = []
    total = 0

    for rel, page in TARGETS.items():
        path = ROOT / rel
        if not path.exists():
            print(f"  MISSING  {rel}")
            return 1

        before = path.read_text(encoding="utf-8")
        after, added = annotate(before, page)
        total += added

        if before == after:
            print(f"  up to date   {rel}")
            continue

        stale.append(rel)
        if check_only:
            print(f"  STALE        {rel} ({added} unannotated)")
        else:
            path.write_text(after, encoding="utf-8", newline="\n")
            print(f"  annotated    {rel} (+{added})")

    if check_only and stale:
        print(f"\n  {len(stale)} fragment(s) have unannotated copy — run without --check")
        return 1

    if stale:
        print(f"\n  {total} node(s) annotated — now run: python tools/assemble.py")

    return 0


if __name__ == "__main__":
    sys.exit(main())
