#!/usr/bin/env python3
"""
Generate the checkable facts on the Sourcing page from the catalogue itself.

WHY
---
A sourcing page is a page of claims. The only thing separating it from
marketing is whether the claims are true of the actual catalogue, and stay true
after the catalogue changes. So the numbers on that page are not typed — they
are counted from modules/catalog/data/products.json, into GENERATED markers,
the same way the delivery rates are.

If a product is ever added without an origin or a barcode, the coverage line
stops saying "all 44" on its own. Nobody has to remember to update it.

WHAT IT ALSO CHECKS
-------------------
Every barcode's EAN-13 check digit. The page tells customers to compare the
barcode on the pack against the one we list — that is the single verifiable
promise on the site — and a barcode that fails its own checksum is one that
will fail in a customer's scanner app. That would discredit the exact claim the
page exists to support, so a bad check digit fails this script rather than
shipping.

It deliberately does NOT check that a barcode's GS1 prefix matches the stated
origin, because that relationship does not exist: a GS1 prefix records where
the company registered its number, not where the goods were made. The page says
so out loud rather than implying otherwise.

Usage:  python tools/gen-sourcing-facts.py [--check]
"""
import collections
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
PRODUCTS = ROOT / "modules" / "catalog" / "data" / "products.json"
TARGET = ROOT / "modules" / "content" / "_fragments" / "sourcing.main.html"

BEGIN = "GENERATED-SOURCING-BEGIN"
END = "GENERATED-SOURCING-END"


def esc(text: str) -> str:
    return str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def ean13_valid(code: str) -> bool:
    digits = [int(c) for c in str(code) if c.isdigit()]
    if len(digits) != 13:
        return False
    check = (10 - sum(d * (1 if i % 2 == 0 else 3) for i, d in enumerate(digits[:12])) % 10) % 10
    return check == digits[12]


def coverage_block(products: list[dict]) -> str:
    total = len(products)
    with_origin = sum(1 for p in products if p.get("origin"))
    with_barcode = sum(1 for p in products if p.get("barcode"))
    with_brand = sum(1 for p in products if p.get("brand"))
    origins = len({p.get("origin") for p in products if p.get("origin")})

    def stat(value: str, label: str) -> str:
        return (
            f'        <div class="fact"><span class="fact__n">{value}</span>'
            f'<span class="fact__l">{label}</span></div>'
        )

    # Say "44 of 44" rather than "every one". The fraction is honest when the
    # numbers diverge; "every" would quietly become a lie.
    return "\n".join([
        stat(f"{with_origin} of {total}", "products list a country of origin"),
        stat(f"{with_barcode} of {total}", "carry the barcode you can check on the pack"),
        stat(f"{with_brand} of {total}", "name the brand or manufacturer"),
        stat(str(origins), "countries we currently import from"),
    ])


def origins_block(products: list[dict]) -> str:
    counts = collections.Counter(p["origin"] for p in products if p.get("origin"))
    cats = collections.defaultdict(set)
    for p in products:
        if p.get("origin") and p.get("categoryName"):
            cats[p["origin"]].add(p["categoryName"])

    rows = []
    # Most-sourced first, then alphabetical, so the list is stable between runs
    # rather than reshuffling on every regeneration.
    for origin, n in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0])):
        what = ", ".join(sorted(cats[origin]))
        rows.append(
            f'            <tr><th scope="row">{esc(origin)}</th>'
            f'<td data-label="Products">{n}</td>'
            f'<td data-label="What we bring in">{esc(what)}</td></tr>'
        )
    return "\n".join(rows)


def replace_block(text: str, name: str, body: str) -> str:
    pattern = re.compile(
        rf"<!--\s*{BEGIN}\s+{re.escape(name)}\b.*?{END}\s+{re.escape(name)}\s*-->",
        re.S,
    )
    if not pattern.search(text):
        raise SystemExit(f"markers not found — expected <!-- {BEGIN} {name} --> … <!-- {END} {name} -->")

    def sub(m: re.Match) -> str:
        indent = text[text.rfind("\n", 0, m.start()) + 1:m.start()]
        indent = indent if not indent.strip() else ""
        return f"<!-- {BEGIN} {name} -->\n{body}\n{indent}<!-- {END} {name} -->"

    return pattern.sub(sub, text)


def main() -> int:
    check_only = "--check" in sys.argv
    products = json.loads(PRODUCTS.read_text(encoding="utf-8"))["products"]

    # Hard failures first — a page of claims must not be generated from data
    # that already contradicts one of them.
    bad_barcodes = [p["id"] for p in products if p.get("barcode") and not ean13_valid(p["barcode"])]
    if bad_barcodes:
        print("  INVALID EAN-13 check digit on: " + ", ".join(bad_barcodes))
        print("  The Sourcing page tells customers to check the barcode against the pack.")
        print("  A code that fails its own checksum will fail in their scanner.")
        return 1

    dupes = [c for c, n in collections.Counter(
        p["barcode"] for p in products if p.get("barcode")).items() if n > 1]
    if dupes:
        # Two products sharing a barcode makes the check meaningless — it would
        # "match" the wrong item.
        print("  DUPLICATE barcodes: " + ", ".join(map(str, dupes)))
        return 1

    before = TARGET.read_text(encoding="utf-8")
    after = replace_block(before, "coverage", coverage_block(products))
    after = replace_block(after, "origins", origins_block(products))

    if before == after:
        print(f"  up to date   {TARGET.relative_to(ROOT).as_posix()}")
        return 0

    if check_only:
        print(f"  STALE        {TARGET.relative_to(ROOT).as_posix()}")
        return 1

    TARGET.write_text(after, encoding="utf-8", newline="\n")
    print(f"  written      {TARGET.relative_to(ROOT).as_posix()}")
    print("  now run: python tools/assemble.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
