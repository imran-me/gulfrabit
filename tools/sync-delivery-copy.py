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
  6. modules/catalog/_fragments/product.main.html    TWO blocks — the PDP trust
     strip and the Shipping tab prose
  7. modules/checkout/_fragments/checkout.main.html  the summary's pre-JS default
  8. modules/content/_fragments/faq.main.html        the site FAQ's delivery answer

Nine blocks across seven files. It was five when this script was written; the
last four were found by find_strays() below, not by anybody remembering they
existed. Two of them were running prose, which is the point — prose does not
look like data, so it is the copy that goes stale first.

A file can carry more than one generated block, so markers take an optional
name: `<!-- GENERATED-DELIVERY-BEGIN pdp-prose -->`. Unnamed markers still work
and mean "the only block in this file".

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


def replace_block(text: str, body: str, comment_open: str, comment_close: str, name: str = "") -> str:
    """Swap whatever sits between the markers for `body`.

    `name` distinguishes multiple blocks in one file. The unnamed pattern
    asserts that no name follows on the SAME line, so an unnamed lookup can
    never straddle a named block. It has to be same-line and letter-initial:
    matching any whitespace would treat api.js's `const` on the next line as a
    block name, and allowing a leading dash would read HTML's own `-->` as one."""
    tag = rf"\s+{re.escape(name)}\b" if name else r"(?![ \t]+[A-Za-z]\w*)"
    pattern = re.compile(
        re.escape(comment_open) + r"\s*" + BEGIN + tag + r".*?" + END + tag + r"\s*" + re.escape(comment_close),
        re.S,
    )
    label = f"{BEGIN} {name}".strip()
    end_label = f"{END} {name}".strip()
    if not pattern.search(text):
        raise SystemExit(
            f"markers not found — expected {comment_open} {label} ... {end_label} {comment_close}"
        )

    def sub(m: re.Match) -> str:
        # Reuse the BEGIN marker's own indentation for the END marker. Emitting
        # it at column 0 works but leaves generated files looking mangled next
        # to hand-written ones, which is how people start distrusting the tool.
        indent = text[text.rfind("\n", 0, m.start()) + 1:m.start()]
        indent = indent if not indent.strip() else ""
        return (
            f"{comment_open} {label} {comment_close}\n"
            f"{body}\n"
            f"{indent}{comment_open} {end_label} {comment_close}"
        )

    return pattern.sub(sub, text)


# ---- the four targets ----------------------------------------------------

def js_constant(zones: list[dict], payload: dict) -> str:
    lines = []
    for z in zones:
        lines.append(
            f"  {{ id: '{z['key']}', label: '{z['label']}', "
            f"eta: '{z['eta']}', cost: {z['costTaka']} }},"
        )
    return "const ZONES = [\n" + "\n".join(lines) + "\n];"


def policy_table(zones: list[dict], payload: dict) -> str:
    rows = []
    for z in zones:
        rows.append(
            f'            <tr><th scope="row">{esc(z["label"])}</th>'
            f'<td data-label="Arrives">{z["eta"]}</td>'
            f'<td data-label="Charge">৳ {z["costTaka"]}</td></tr>'
        )
    return "\n".join(rows)


def checkout_radios(zones: list[dict], payload: dict) -> str:
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


def pdp_trust_strip(zones: list[dict], payload: dict) -> str:
    """The two-line trust tile on the PDP. It has ~24 characters to work with,
    so it names the two zones a shopper is actually choosing between and leaves
    express to the Shipping tab."""
    by_key = {z["key"]: z for z in zones}
    return (
        f'            <div class="trust-item__title">Flat Delivery</div>\n'
        f'            <div class="trust-item__sub">৳ {by_key["metro"]["costTaka"]} Dhaka · '
        f'৳ {by_key["nationwide"]["costTaka"]} outside</div>'
    )


def pdp_shipping_prose(zones: list[dict], payload: dict) -> str:
    """The Shipping & Returns tab on the PDP, in running prose.

    Built from the zone list rather than hardcoded so an added or retired zone
    appears here too — the old copy silently omitted express, which had existed
    at checkout for weeks."""
    # Price first, then the zone label verbatim, with no preposition between
    # them. A preposition would have to be chosen per label — "to Dhaka &
    # Chattogram" reads fine but "to Express — Dhaka only" does not — and that
    # choice cannot be made generically, so the phrasing avoids needing one.
    parts = [
        f'<strong>৳ {z["costTaka"]}</strong> {esc(z["label"])} ({z["eta"].lower()})'
        for z in zones
    ]
    listed = ", ".join(parts[:-1]) + ", or " + parts[-1] if len(parts) > 2 else " or ".join(parts)

    # freeDeliveryThreshold is null today; if it is ever set, this lead has to
    # change with it rather than keep promising a flat rate at every basket size.
    lead = (
        f'Delivery is free over ৳ {payload["freeDeliveryThreshold"]}, otherwise'
        if payload.get("freeDeliveryThreshold")
        else "Flat delivery, whatever your order is worth:"
    )
    cold = " Perishables ship cold-chain at no extra charge." if payload.get("coldChainIncluded") else ""
    return f"          <p>{lead} {listed}.{cold}</p>"


def checkout_summary_default(zones: list[dict], payload: dict) -> str:
    """The Delivery figure in the checkout summary before JS runs.

    checkout.js overwrites this the moment a zone is chosen, but the first
    radio is pre-checked, so the static value has to agree with it — otherwise
    the summary briefly shows a charge the customer is not being asked to pay."""
    return (
        f'        <div class="summary-row"><span>Delivery</span>'
        f'<span class="tabular" data-sum-delivery>৳ {zones[0]["costTaka"]}</span></div>'
    )


def site_faq_answer(zones: list[dict], payload: dict) -> str:
    """The delivery answer on the site-wide FAQ page.

    Longer-form than the PDP prose because this page is where someone lands
    from a search for "gulfrabit delivery charge", so it names every zone."""
    by_key = {z["key"]: z for z in zones}
    metro, nationwide = by_key["metro"], by_key["nationwide"]
    express = by_key.get("express")
    text = (
        f'Delivery is a flat ৳ {metro["costTaka"]} to {esc(metro["label"])} '
        f'({metro["eta"].lower()}) or ৳ {nationwide["costTaka"]} to the rest of '
        f'Bangladesh ({nationwide["eta"]}) — the same charge whatever the order is worth.'
    )
    if express:
        text += f' Express next-day within Dhaka is ৳ {express["costTaka"]}.'
    if payload.get("coldChainIncluded"):
        text += " Perishables ship cold-chain at no extra charge."
    return f'        <div class="faq-a"><div class="faq-a__inner">{text}</div></div>'


TARGETS = [
    ("modules/delivery/backend/api.js", "", js_constant, "//", ""),
    ("modules/content/_fragments/shipping.main.html", "", policy_table, "<!--", "-->"),
    ("modules/checkout/_fragments/checkout.main.html", "", checkout_radios, "<!--", "-->"),
    ("shared/components/header.html", "", announcement, "<!--", "-->"),
    # index.html is hand-authored, NOT produced by tools/assemble.py, so it
    # carries its own copy of the header and has to be written separately.
    # Without this entry the home page kept quoting the old rate while all 23
    # assembled pages showed the new one — found by changing a rate and
    # checking every location rather than assuming propagation worked.
    ("index.html", "", announcement, "<!--", "-->"),
    # Two blocks in one file, hence the names.
    ("modules/catalog/_fragments/product.main.html", "pdp-trust", pdp_trust_strip, "<!--", "-->"),
    ("modules/catalog/_fragments/product.main.html", "pdp-prose", pdp_shipping_prose, "<!--", "-->"),
    # Both found by find_strays() rather than by remembering they existed.
    ("modules/checkout/_fragments/checkout.main.html", "checkout-summary", checkout_summary_default, "<!--", "-->"),
    ("modules/content/_fragments/faq.main.html", "faq-delivery", site_faq_answer, "<!--", "-->"),
]


# Files that legitimately quote the numbers outside a generated block, with the
# reason. Anything NOT on this list that mentions a rate is a new hardcoded copy.
STRAY_ALLOWED = {
    "modules/delivery/data/zones.json",       # the source itself
    "tools/sync-delivery-copy.py",            # this file, in its own docstring
    "context.md", "CONVENTIONS.md", "BACKEND.md", "README.md",
    "research/competitor-analysis.md", "research/implementation-plan.md",
}


def find_strays(zones: list[dict]) -> list[str]:
    """Grep the source tree for delivery rates written outside a generated block.

    The PDP quoted the rates in running prose for weeks after the other five
    copies were centralised, because prose does not look like data. A generator
    only helps if something also *notices* the next copy someone types by hand,
    so this is the half that catches what the generator cannot reach."""
    amounts = {str(z["costTaka"]) for z in zones}
    money = re.compile(r"৳\s*(" + "|".join(sorted(amounts, key=len, reverse=True)) + r")\b")
    block = re.compile(re.escape(BEGIN) + r".*?" + re.escape(END), re.S)

    hits = []
    for path in ROOT.rglob("*"):
        if not path.is_file() or path.suffix not in {".html", ".js", ".php", ".css"}:
            continue
        rel = path.relative_to(ROOT).as_posix()
        if rel in STRAY_ALLOWED or "/vendor/" in rel or "/node_modules/" in rel:
            continue
        # Assembled pages are built from fragments; a stray there is a symptom
        # of one in the fragment, and reporting both is noise.
        if rel.endswith(".html") and "_fragments" not in rel and rel != "index.html":
            continue
        text = block.sub("", path.read_text(encoding="utf-8", errors="replace"))
        for i, line in enumerate(text.splitlines(), 1):
            if money.search(line):
                hits.append(f"{rel}:{i}  {line.strip()[:90]}")
    return hits


def main() -> int:
    check_only = "--check" in sys.argv
    zones, payload = load_zones()

    stale = []
    for rel, name, builder, copen, cclose in TARGETS:
        path = ROOT / rel
        before = path.read_text(encoding="utf-8")
        after = replace_block(before, builder(zones, payload), copen, cclose, name)
        where = f"{rel}:{name}" if name else rel

        if before == after:
            print(f"  up to date   {where}")
            continue

        stale.append(where)
        if check_only:
            print(f"  STALE        {where}")
        else:
            path.write_text(after, encoding="utf-8", newline="\n")
            print(f"  written      {where}")

    strays = find_strays(zones)
    if strays:
        print(f"\n  {len(strays)} hardcoded rate(s) outside a generated block:")
        for s in strays:
            print(f"    {s}")
        print("  Wrap each in GENERATED-DELIVERY markers and add it to TARGETS,")
        print("  or list the file in STRAY_ALLOWED with a reason.")

    if check_only and (stale or strays):
        if stale:
            print(f"\n  {len(stale)} file(s) out of date — run without --check, then tools/assemble.py")
        return 1

    if not check_only and stale:
        print("\n  now run: python tools/assemble.py")

    return 0


if __name__ == "__main__":
    sys.exit(main())
