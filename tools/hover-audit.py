#!/usr/bin/env python3
r"""
Find :hover rules that misbehave on a touch screen.

WHY THIS EXISTS
---------------
A phone applies :hover on tap and KEEPS it until you tap somewhere else. Five
separate bugs in one afternoon came from that:

  - product card actions were `opacity: 0` until hover, so wishlist, quick view
    and compare did not exist on the device most of this shop is browsed from
  - a tapped product card stayed lifted and outlined, reading as "selected"
  - the PDP photo stuck at 1.6x zoom with no way back
  - a delivery option the customer scrolled past stayed outlined exactly like
    the one they had chosen — on the payment step
  - a category tile kept a brighter glow than its neighbours

WHAT IT FLAGS, AND WHAT IT DOES NOT
-----------------------------------
Only `transform` and `opacity` inside an unguarded :hover. Those are the two
that latch VISIBLY: a shifted or revealed element looks like state, and state
that is wrong is worse than no feedback at all. A hover that changes `color` or
`background` also latches, but it reads as "I touched this", which is honest.
Guarding all of them would be noise around a real signal.

The admin panel is excluded. It is staff work on a laptop, and the same latch
there is a cosmetic annoyance rather than a customer misreading their basket.

Usage:  python tools/hover-audit.py
        exit 1 if any storefront :hover moves or reveals something unguarded
"""
import pathlib
import sys

sys.stdout.reconfigure(encoding="utf-8")

ROOT = pathlib.Path(__file__).resolve().parent.parent

# Staff surfaces — see the docstring.
SKIP_DIRS = ("admin", "inventory", "accounting", "courier", "media", "highlights", "b2b")
SKIP_PARTS = ("node_modules", "_BACKUPS", "vendor")

# Properties that latch visibly.
RISKY = ("transform", "opacity")


def audit(path: pathlib.Path) -> list[tuple[int, str]]:
    """Unguarded :hover lines in one file that move or reveal something."""
    found = []
    depth = 0
    guard_depth = None

    for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        stripped = line.strip()

        if "@media" in line and "hover: hover" in line:
            guard_depth = depth

        if (
            ":hover" in line
            and "@media" not in line
            and not stripped.startswith(("*", "/*", "//"))
            and guard_depth is None
            and any(prop in line for prop in RISKY)
        ):
            found.append((n, stripped[:96]))

        depth += line.count("{") - line.count("}")

        # Left the guarded block.
        if guard_depth is not None and depth <= guard_depth:
            guard_depth = None

    return found


def main() -> int:
    problems = []

    for path in sorted(ROOT.rglob("*.css")):
        rel = path.relative_to(ROOT).as_posix()

        if any(part in rel for part in SKIP_PARTS):
            continue
        if any(f"/{d}/" in f"/{rel}" or rel.startswith(f"modules/{d}/") for d in SKIP_DIRS):
            continue

        for line_no, text in audit(path):
            problems.append(f"  {rel}:{line_no}\n      {text}")

    if problems:
        print("  :hover rules that move or reveal something, unguarded:")
        print()
        print("\n".join(problems))
        print()
        print("  On touch these latch after a tap and read as state. Wrap them in")
        print("  @media (hover: hover) and give touch a :active press instead.")
        return 1

    print("  no unguarded :hover transforms or reveals on storefront surfaces")
    return 0


if __name__ == "__main__":
    sys.exit(main())
