#!/usr/bin/env python3
"""
Catch index.html's header drifting from the shared partial.

WHY THIS EXISTS
---------------
Every page except one is built by assemble.py, which inlines
shared/components/header.html. `index.html` is hand-authored and carries its
own copy of that markup.

That copy is invisible to every change made to the partial. Adding the
`data-mega-grid` hook for the live category menu updated 42 pages and silently
missed the home page — the single most visited page on the site, and the one
where a stale menu is most expensive.

WHAT IT CHECKS
--------------
Not a full diff: the two headers legitimately differ (relative paths, an
`aria-current` on the home link). It checks that every HOOK the partial
carries — the data-attributes JavaScript binds to — is also present in
index.html. Those are the parts whose absence breaks behaviour silently rather
than visibly.

Usage:  python tools/header-drift.py
        exit 1 if index.html is missing a hook the partial has
"""
import pathlib
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")

ROOT = pathlib.Path(__file__).resolve().parent.parent

# data-foo / data-foo="bar" — the attribute name is what matters.
HOOK = re.compile(r'\bdata-([a-z0-9-]+)')

# Hooks that are deliberately absent from one side or the other, with a reason.
IGNORE = {
    # assemble.py puts this on <html>, not in the header partial.
    "cms-page": "set per page by assemble.py",
    # Bootstrap and Tailwind attributes that appear incidentally.
    "bs-theme": "third-party",
}


def hooks(path: pathlib.Path, start: str, end: str) -> set[str]:
    """Hook names inside the header/drawer region of a file."""
    text = path.read_text(encoding="utf-8")

    try:
        a = text.index(start)
        b = text.index(end, a)
    except ValueError:
        print(f"  could not locate the header region in {path.name}")
        sys.exit(1)

    return {m.group(1) for m in HOOK.finditer(text[a:b])} - set(IGNORE)


def main() -> int:
    # The partial is header + drawer + search overlay, closing with a small
    # <style> block. index.html has the same span inlined, ending at <main>.
    partial = hooks(ROOT / "shared/components/header.html", "<header", "<style>")
    home = hooks(ROOT / "index.html", "<header", "<main")

    missing = sorted(partial - home)

    if missing:
        print("  index.html's header is missing hooks the shared partial has:")
        for name in missing:
            print(f"    data-{name}")
        print()
        print("  index.html is hand-authored — apply the same change there by hand.")
        return 1

    print(f"  index.html header carries all {len(partial)} hooks from the partial")
    return 0


if __name__ == "__main__":
    sys.exit(main())
