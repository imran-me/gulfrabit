#!/usr/bin/env python3
"""
Propagate delivery rates from their single source into every place that quotes
them.

WHY THIS EXISTS
---------------
The same three numbers were written in five places: the frontend ZONES
constant, the PHP seeder, the Shipping & Returns table, the checkout radios,
and the announcement bar on all 24 pages. Changing a rate meant finding all
five, and the first one missed becomes a promise the site does not keep — which
is exactly the bug this project already had once, when the banner advertised
free delivery over BDT 3,000 while checkout charged BDT 60 regardless.

modules/delivery/data/zones.json is now the source. This script writes it into:

  1. modules/delivery/backend/api.js        the ZONES constant
  2. modules/content/_fragments/shipping.main.html   the policy table
  3. modules/checkout/_fragments/checkout.main.html  the delivery radios
  4. shared/components/header.html          the announcement bar
  5. index.html                             ditto (hand-authored, not assembled)

The PHP seeder reads zones.json directly at runtime, so it needs no generation.

Generated regions are marked with BEGIN/END markers. Edit zones.json, then run:

    python tools/sync-delivery-copy.py
    python tools/assemble.py        # rebuild the pages

Usage:  python tools/sync-delivery-copy.py [--check]
        --check exits non-zero if anything is out of date, without writing.
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
ZONES_FILE = ROOT / "modules" / "delivery" / "data" / "zones.json"

def esc(text: str) -> str:
    """HTML-escape a label. The source data holds a literal '&' and the markup
    needs '&amp;' — writing the raw character produced an invalid entity."""
    return text.replace("&", "&amp;")


BEGIN = "GENERATED-DELIVERY-BEGIN"
END = "GENERATED-DELIVERY-END"


def load_zones() -> tuple[list[dict], dict]:
    payload = json.loads(ZONES_FILE.read_text(encoding="utf-8"))
    zones = [z for z in payload["zones"] if z.get("isActive", True)]
    zones.sort(key=lambda z: z.get("sortOrder", 0))
    return zones, payload


def replace_block(text: str, body: str, comment_open: str, comment_close: str) -> str:
    """Swap whatever sits between the markers for `body`."""
    pattern = re.compile(
        re.escape(comment_open) + r"\s*" + BEGIN + r".*?" + END + r"\s*" + re.escape(comment_close),
        re.S,
    )
    replacement = f"{comment_open} {BEGIN} {comment_close}\n{body}\n{comment_open} {END} {comment_close}"
    if not pattern.search(text):
        raise SystemExit(
            f"markers not found — expected {comment_open} {BEGIN} ... {END} {comment_close}"
        )
    return pattern.sub(replacement, text)


# ---- the four targets ----------------------------------------------------

def js_constant(zones: list[dict]) -> str:
    lines = []
    for z in zones:
        lines.append(
            f"  {{ id: '{z['key']}', label: '{z['label']}', "
            f"eta: '{z['eta']}', cost: {z['costTaka']} }},"
        )
    return "const ZONES = [\n" + "\n".join(lines) + "\n];"


def policy_table(zones: list[dict]) -> str:
    rows = []
    for z in zones:
        rows.append(
            f'            <tr><th scope="row">{esc(z["label"])}</th>'
            f'<td data-label="Arrives">{z["eta"]}</td>'
            f'<td data-label="Charge">৳ {z["costTaka"]}</td></tr>'
        )
    return "\n".join(rows)


def checkout_radios(zones: list[dict]) -> str:
    out = []
    for i, z in enumerate(zones):
        selected = " is-selected" if i == 0 else ""
        checked = " checked" if i == 0 else ""
        out.append(
            f'          <label class="option-card{selected}" data-delivery-card="{z["key"]}">'
            f'<input type="radio" name="delivery" value="{z["key"]}" data-delivery '
            f'data-cost="{z["costTaka"]}"{checked}>'
            f'<span><span class="option-card__title">{esc(z["label"])}</span>'
            f'<span class="option-card__sub">{z["eta"]}</span></span>'
            f'<span class="option-card__price">৳ {z["costTaka"]}</span></label>'
        )
    return "\n".join(out)


def announcement(zones: list[dict], payload: dict) -> str:
    by_key = {z["key"]: z for z in zones}
    metro = by_key.get("metro")
    nationwide = by_key.get("nationwide")
    cold = " · Cold-chain on all perishables" if payload.get("coldChainIncluded") else ""
    return (
        f'    <span>Flat ৳ {metro["costTaka"]} delivery in Dhaka &amp; Chattogram · '
        f'৳ {nationwide["costTaka"]} nationwide{cold}</span>'
    )


TARGETS = [
    ("modules/delivery/backend/api.js", js_constant, "//", ""),
    ("modules/content/_fragments/shipping.main.html", policy_table, "<!--", "-->"),
    ("modules/checkout/_fragments/checkout.main.html", checkout_radios, "<!--", "-->"),
    ("shared/components/header.html", announcement, "<!--", "-->"),
    # index.html is hand-authored, NOT produced by tools/assemble.py, so it
    # carries its own copy of the header and has to be written separately.
    # Without this entry the home page kept quoting the old rate while all 23
    # assembled pages showed the new one — found by changing a rate and
    # checking every location rather than assuming propagation worked.
    ("index.html", announcement, "<!--", "-->"),
]


def main() -> int:
    check_only = "--check" in sys.argv
    zones, payload = load_zones()

    stale = []
    for rel, builder, copen, cclose in TARGETS:
        path = ROOT / rel
        before = path.read_text(encoding="utf-8")
        body = builder(zones, payload) if builder is announcement else builder(zones)
        after = replace_block(before, body, copen, cclose)

        if before == after:
            print(f"  up to date   {rel}")
            continue

        stale.append(rel)
        if check_only:
            print(f"  STALE        {rel}")
        else:
            path.write_text(after, encoding="utf-8", newline="\n")
            print(f"  written      {rel}")

    if check_only and stale:
        print(f"\n  {len(stale)} file(s) out of date — run without --check, then tools/assemble.py")
        return 1

    if not check_only and stale:
        print("\n  now run: python tools/assemble.py")

    return 0


if __name__ == "__main__":
    sys.exit(main())
