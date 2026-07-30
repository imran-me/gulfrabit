#!/usr/bin/env python3
"""
Every Tailwind utility class the site actually uses.

WHY
---
The pages load `https://cdn.tailwindcss.com`, which compiles CSS in the browser
on every single page load. Two costs:

  1. It is why the Content-Security-Policy has to allow `'unsafe-eval'`, which
     is the main thing keeping that policy from being a real defence.
  2. It is a JIT compiler running before first paint, on phones, over mobile
     data in Bangladesh.

Replacing it means shipping a static stylesheet containing only the utilities
that are used. This produces that list. It is the input to the swap, and it is
also the honest measure of how big the job is — if the answer is 400 classes,
that is worth knowing before starting.

WHAT COUNTS AS A TAILWIND CLASS
-------------------------------
Anything in a class attribute that is NOT one of ours. Ours are the named
component classes in shared/css/ and modules/**/*.css — read from the
stylesheets rather than guessed, so the split stays right as components are
added.

Classes built at runtime in JavaScript are NOT visible here, and that is the
known hole. They are listed separately so they can be checked by hand.

Usage:  python tools/tailwind-inventory.py
"""
import pathlib
import re
import sys
from collections import Counter

sys.stdout.reconfigure(encoding="utf-8")

ROOT = pathlib.Path(__file__).resolve().parent.parent
SKIP = ("node_modules", "_BACKUPS", "vendor", "tools")

CLASS_ATTR = re.compile(r'class="([^"]*)"')
CSS_CLASS = re.compile(r'\.([a-zA-Z][\w-]*)')

# Tailwind's shape: a known prefix, or a bare utility from a small known set.
# Deliberately loose — a false positive here is a class we look at by hand,
# which is cheap. A false negative is a style that vanishes when the CDN goes.
TW_PREFIX = re.compile(
    r'^(sm:|md:|lg:|xl:|2xl:|hover:|focus:|active:|group-hover:|dark:)*'
    r'(bg|text|border|ring|shadow|font|leading|tracking|p|px|py|pt|pb|pl|pr|'
    r'm|mx|my|mt|mb|ml|mr|w|h|min-w|min-h|max-w|max-h|flex|grid|gap|space|'
    r'items|justify|self|order|col|row|rounded|opacity|z|top|bottom|left|right|'
    r'inset|overflow|object|cursor|select|transition|duration|ease|transform|'
    r'scale|rotate|translate|block|inline|hidden|absolute|relative|fixed|sticky|'
    r'static|uppercase|lowercase|capitalize|truncate|whitespace|break|list|'
    r'divide|backdrop|filter|blur|aspect|basis|grow|shrink|place|content|'
    r'antialiased|sr|not-sr|pointer-events|resize|appearance|outline|underline|'
    r'line-through|no-underline|italic|tabular|align|float|clear|visible|'
    r'invisible|isolate|mix|bg-gradient|from|via|to)(-|$|:)'
)


def our_classes() -> set[str]:
    """Component class names defined in our own stylesheets."""
    names = set()
    for css in ROOT.rglob("*.css"):
        if any(s in css.as_posix() for s in SKIP):
            continue
        names |= set(CSS_CLASS.findall(css.read_text(encoding="utf-8")))
    return names


def main() -> int:
    ours = our_classes()

    used = Counter()
    where = {}

    for html in ROOT.rglob("*.html"):
        rel = html.relative_to(ROOT).as_posix()
        if any(s in rel for s in SKIP):
            continue

        for attr in CLASS_ATTR.findall(html.read_text(encoding="utf-8")):
            for name in attr.split():
                if name in ours or not TW_PREFIX.match(name):
                    continue
                used[name] += 1
                where.setdefault(name, set()).add(rel)

    # Classes assembled in JS — the known blind spot.
    js_dynamic = set()
    for js in ROOT.rglob("*.js"):
        rel = js.relative_to(ROOT).as_posix()
        if any(s in rel for s in SKIP):
            continue
        text = js.read_text(encoding="utf-8")
        # classList.add('x') and className = 'x y'
        for m in re.findall(r"classList\.(?:add|toggle|remove)\(([^)]*)\)", text):
            for lit in re.findall(r"['\"]([^'\"]+)['\"]", m):
                for name in lit.split():
                    if name not in ours and TW_PREFIX.match(name):
                        js_dynamic.add(name)

    print(f"  {len(used)} distinct Tailwind utilities across "
          f"{len({p for s in where.values() for p in s})} pages\n")

    print("  MOST USED")
    for name, n in used.most_common(20):
        print(f"    {n:>4}x  {name}")

    single = [n for n, c in used.items() if c == 1]
    print(f"\n  {len(single)} used exactly once — each is a candidate for deletion")
    print(f"       rather than porting: {', '.join(sorted(single)[:8])}"
          f"{' …' if len(single) > 8 else ''}")

    if js_dynamic:
        print(f"\n  {len(js_dynamic)} added from JavaScript — NOT in the HTML, so any")
        print("  build that scans only markup would drop these silently:")
        for name in sorted(js_dynamic):
            print(f"    {name}")

    out = ROOT / "tools" / "tailwind-classes.txt"
    out.write_text(
        "\n".join(sorted(set(used) | js_dynamic)) + "\n",
        encoding="utf-8", newline="\n",
    )
    print(f"\n  wrote {out.relative_to(ROOT).as_posix()} — "
          f"{len(set(used) | js_dynamic)} classes, the safelist for a real build")

    return 0


if __name__ == "__main__":
    sys.exit(main())
