#!/usr/bin/env python3
"""
Catch the product-card vocabulary drifting between its five copies.

WHY THIS EXISTS
---------------
Which parts of a product card can be switched off is written down five times,
and four of those are unavoidable:

  1. Modules\\Theme\\Models\\CardParts::PARTS   the server, and the authority
  2. modules/theme/card-parts.js              the storefront, which must work
                                              on a deployment with no backend
  3. CARD_PARTS in tools/assemble.py          the pre-paint stamp, which runs
                                              before any module can be imported
  4. modules/theme/card-page.js               the panel's fallback list
  5. the checkbox names in card.main.html     the controls themselves

A name that exists in some of these and not others fails in a way nobody sees.
A part missing from the bootstrap is a part that flashes on every first page
load and then disappears. A checkbox the server does not know about is a
control that silently does nothing — the merchant switches it off, publishes,
and the shop is unchanged. Neither produces an error anywhere.

This is the sibling of tools/layout-drift.py, kept separate because it guards a
different list; between them they cover every duplicated vocabulary in the
appearance settings.

WHAT IT CHECKS
--------------
That all five hold the same set of names, in the same order where an order
exists, and that the admin screen offers exactly one checkbox per part per
device — no more, no fewer. It does not compare prose: the words a merchant
reads live only in the fragment.

It also refuses to let a stock badge become hideable. Sold out, Pre-order and
Coming soon are the difference between a product a shopper can buy and one they
cannot, and a stylesheet rule that hides one on a merchant's say-so is not a
style choice.

Usage:  python tools/card-drift.py
        exit 1 on any disagreement
"""
import pathlib
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")

ROOT = pathlib.Path(__file__).resolve().parent.parent

# Never hideable. See CardParts for why.
STOCK_BADGES = ("badge-out", "badge-preorder", "badge-soon")


def read(rel):
    return (ROOT / rel).read_text(encoding="utf-8")


def from_php():
    src = read("modules/theme/backend/Models/CardParts.php")
    body = src[src.index("public const PARTS = ["):]
    return re.findall(r"'(\w+)'", body[:body.index("];")])


def from_storefront():
    src = read("modules/theme/card-parts.js")
    line = re.search(r"export const PARTS = \[([^\]]*)\]", src)
    return re.findall(r"'(\w+)'", line.group(1)) if line else None


def from_bootstrap():
    src = read("tools/assemble.py")
    line = re.search(r"CARD_PARTS = \[([^\]]*)\]", src)
    return re.findall(r'"(\w+)"', line.group(1)) if line else None


def from_panel():
    src = read("modules/theme/card-page.js")
    line = re.search(r"const PARTS = \[([^\]]*)\]", src)
    return re.findall(r"'(\w+)'", line.group(1)) if line else None


def from_screen():
    """The fragment's checkboxes -> {part: [devices]}, in document order."""
    src = read("modules/theme/_fragments/card.main.html")
    out = {}
    for part, device in re.findall(
        r'<input type="checkbox" name="(\w+)\.(desktop|mobile)"', src
    ):
        out.setdefault(part, []).append(device)
    return out


def hidden_selectors():
    """Everything the card stylesheet hides on this setting's say-so."""
    css = read("shared/css/partials/_cards.css")
    block = css[css.index("Parts of a card the shop can switch off"):]
    # Every occurrence, not every rule: two selectors sharing one declaration
    # block is the normal way to write these, and a pattern that ran on to the
    # brace swallowed the second one and reported it as unhandled.
    return re.findall(r'data-card~="(\w+):off"', block)


def main():
    php = from_php()
    problems = []
    if not php:
        print("  could not read CardParts::PARTS — has it moved?")
        return 1

    copies = {
        "modules/theme/card-parts.js": from_storefront(),
        "CARD_PARTS in tools/assemble.py": from_bootstrap(),
        "modules/theme/card-page.js": from_panel(),
    }
    for where, got in copies.items():
        if got is None:
            problems.append(f"the parts list is missing from {where}")
        elif got != php:
            problems.append(f"{where} lists {got}, PHP lists {php}")

    screen = from_screen()
    for part in php:
        devices = sorted(screen.get(part, []))
        if devices != ["desktop", "mobile"]:
            problems.append(
                f"{part}: the admin screen has checkboxes for {devices or 'nothing'}, "
                "and needs one for each device")
    for part in screen:
        if part not in php:
            problems.append(f"{part}: the admin screen offers a part the server would refuse")

    # Every part the server allows must be something the stylesheet can act on,
    # or the switch is a control that does nothing.
    acted_on = {m for m in hidden_selectors()}
    for part in php:
        if part not in acted_on:
            problems.append(f"{part}: nothing in _cards.css hides it — the switch does nothing")

    # And nothing may reach for a stock badge.
    css = read("shared/css/partials/_cards.css")
    block = css[css.index("Parts of a card the shop can switch off"):]
    for rule in re.findall(r'html\[data-card~="\w+:off"\][^{]*\{[^}]*\}', block):
        for badge in STOCK_BADGES:
            if badge in rule:
                problems.append(
                    f"a data-card rule hides .{badge} — a stock badge is not decoration")

    if problems:
        print("  the product-card vocabulary has drifted:")
        for line in problems:
            print(f"    {line}")
        print()
        print("  All five must agree — see modules/theme/README.md.")
        return 1

    print(f"  {len(php)} card parts agree across PHP, the storefront, the pre-paint "
          f"stamp, the panel and its screen")
    return 0


if __name__ == "__main__":
    sys.exit(main())
