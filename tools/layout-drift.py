#!/usr/bin/env python3
"""
Catch the home-layout vocabulary drifting between its copies.

WHY THIS EXISTS
---------------
Which shape each home-page section can wear, which shape it wears by default,
and what order the sections come in are written down in several places, on
purpose:

  1. modules/theme/backend/Models/HomeLayout.php   the server, and the authority
  2. modules/home/home-layout.js                   the client, for a shop that
                                                   is deployed with no backend
  3. the inline bootstrap in index.html            the pre-paint stamp, which
                                                   cannot import a module

The ORDER is written down in those three and two more: the admin screen authors
one <li> per section, and layout-page.js holds the order a shop with no backend
falls back to. Five copies of one list.

Each has a note saying the others exist. Notes do not fail a build.

The failure this prevents is quiet and expensive. If the bootstrap's default
disagrees with the module's, the home page paints one arrangement and swaps to
another a frame later — on the single most visited URL in the shop, and only on
a first visit, which is exactly the visit nobody tests. If either disagrees with
PHP, a merchant sees one thing in the panel and their customers see another.

WHAT IT CHECKS
--------------
That all three agree on the section list, on each section's default for each
device, and — where both sides state it — on the set of allowed styles. It does
not compare prose: the words a merchant reads live only in
modules/theme/_fragments/layout.main.html. It does check that the screen offers
an <option> for every allowed style and no others, because an option the server
would refuse is a control that silently does nothing.

For the order it checks that all five copies are the same list in the same
sequence, and — because an order is a list of things that have to EXIST — that
every movable name is a data-sec in index.html, and that the hero is named
there but movable nowhere. A section a merchant can move to position one but
that the page cannot find is a control that does nothing; a hero that can be
moved is a hero that can stop being one.

Usage:  python tools/layout-drift.py
        exit 1 on any disagreement
"""
import pathlib
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")

ROOT = pathlib.Path(__file__).resolve().parent.parent


def read(rel):
    return (ROOT / rel).read_text(encoding="utf-8")


def from_php():
    """HomeLayout::SECTIONS -> {section: (styles, desktop, mobile)}."""
    src = read("modules/theme/backend/Models/HomeLayout.php")
    body = src[src.index("public const SECTIONS = ["):]
    body = body[:body.index("\n    ];")]

    out = {}
    for block in re.finditer(
        r"'(?P<key>\w+)' => \[(?P<body>.*?)\n        \]", body, re.S
    ):
        inner = block.group("body")
        styles = re.search(r"'styles' => \[(.*?)\]", inner, re.S)
        desktop = re.search(r"'desktop' => '(\w+)'", inner)
        mobile = re.search(r"'mobile' => '(\w+)'", inner)
        if not (styles and desktop and mobile):
            continue
        out[block.group("key")] = (
            tuple(re.findall(r"'(\w+)'", styles.group(1))),
            desktop.group(1),
            mobile.group(1),
        )
    return out


def from_module():
    """The SECTIONS table in home-layout.js -> the same shape."""
    src = read("modules/home/home-layout.js")
    body = src[src.index("export const SECTIONS = {"):]
    body = body[:body.index("\n};")]

    out = {}
    for line in re.finditer(
        r"(?P<key>\w+):\s*\{\s*styles:\s*\[(?P<styles>[^\]]*)\],"
        r"\s*desktop:\s*'(?P<d>\w+)',\s*mobile:\s*'(?P<m>\w+)'",
        body,
    ):
        out[line.group("key")] = (
            tuple(re.findall(r"'(\w+)'", line.group("styles"))),
            line.group("d"),
            line.group("m"),
        )
    return out


def from_bootstrap():
    """The two token strings in index.html -> {section: (desktop, mobile)}."""
    src = read("index.html")
    got = {}
    for var, device in (("LAY_D", "desktop"), ("LAY_M", "mobile")):
        line = re.search(rf"var {var} = '([^']*)';", src)
        if not line:
            return None, f"index.html has no {var} — the pre-paint stamp is gone"
        for token in line.group(1).split():
            section, _, style = token.partition(":")
            got.setdefault(section, {})[device] = style
    return {k: (v.get("desktop"), v.get("mobile")) for k, v in got.items()}, None


def from_screen():
    """The admin form -> {section: {device: [option values]}}."""
    src = read("modules/theme/_fragments/layout.main.html")
    out = {}
    for select in re.finditer(
        r'<select[^>]*name="(?P<key>\w+)\.(?P<device>desktop|mobile)"(?P<body>.*?)</select>',
        src,
        re.S,
    ):
        values = re.findall(r'<option value="(\w+)"', select.group("body"))
        out.setdefault(select.group("key"), {})[select.group("device")] = values
    return out


def movable_php():
    """HomeLayout::MOVABLE -> [section]."""
    src = read("modules/theme/backend/Models/HomeLayout.php")
    body = src[src.index("public const MOVABLE = ["):]
    return re.findall(r"'(\w+)'", body[:body.index("];")])


def movable_module():
    """MOVABLE in home-layout.js -> [section]."""
    src = read("modules/home/home-layout.js")
    body = src[src.index("export const MOVABLE = ["):]
    return re.findall(r"'(\w+)'", body[:body.index("];")])


def movable_bootstrap():
    """The ORD list in the index.html reorder bootstrap -> [section]."""
    line = re.search(r"var ORD = \[([^\]]*)\];", read("index.html"))
    return re.findall(r"'(\w+)'", line.group(1)) if line else None


def movable_fallback():
    """layout-page.js DEFAULTS.order.desktop -> [section]."""
    src = read("modules/theme/layout-page.js")
    line = re.search(r"desktop: \[([^\]]*)\]", src)
    return re.findall(r"'(\w+)'", line.group(1)) if line else None


def movable_screen():
    """The admin screen's two lists -> {device: [section]}."""
    src = read("modules/theme/_fragments/layout.main.html")
    out = {}
    for block in re.finditer(
        r'data-order-list="(?P<device>desktop|mobile)"(?P<body>.*?)</ol>', src, re.S
    ):
        out[block.group("device")] = re.findall(
            r'data-order-item="(\w+)"', block.group("body"))
    return out


def named_in_markup():
    """Every data-sec in index.html, in the order the page authors them."""
    return re.findall(r'data-sec="(\w+)"', read("index.html"))


def check_order(problems):
    """The five copies of the movable list, and the markup they point at."""
    php = movable_php()
    if not php:
        problems.append("could not read HomeLayout::MOVABLE — has it moved?")
        return 0

    copies = {
        "home-layout.js": movable_module(),
        "the index.html bootstrap": movable_bootstrap(),
        "layout-page.js": movable_fallback(),
    }
    for device, names in movable_screen().items():
        copies[f"the admin screen ({device})"] = names

    for where, got in copies.items():
        if got is None:
            problems.append(f"the movable list is missing from {where}")
        elif got != php:
            problems.append(f"{where} orders {got}, PHP orders {php}")

    named = named_in_markup()
    for section in php:
        if section not in named:
            problems.append(
                f"{section}: movable, but nothing in index.html carries data-sec=\"{section}\"")

    # The hero is the one section named so it can be found and pinned.
    if "hero" not in named:
        problems.append("index.html no longer names the hero — it can no longer be pinned")
    if "hero" in php:
        problems.append("the hero is in MOVABLE — it is meant to be pinned first")

    return len(php)


def main():
    php = from_php()
    module = from_module()
    boot, err = from_bootstrap()
    screen = from_screen()

    problems = []
    if err:
        problems.append(err)
    if not php:
        problems.append("could not read HomeLayout::SECTIONS — has it moved?")
    if not module:
        problems.append("could not read SECTIONS in home-layout.js — has it moved?")

    if not problems:
        for section in sorted(set(php) | set(module) | set(boot or {}) | set(screen)):
            want = php.get(section)
            if want is None:
                problems.append(f"{section}: known to the client but not to the server")
                continue
            styles, d, m = want

            if section not in module:
                problems.append(f"{section}: missing from home-layout.js")
            elif module[section] != want:
                problems.append(
                    f"{section}: home-layout.js says {module[section]}, PHP says {want}")

            if section not in (boot or {}):
                problems.append(f"{section}: missing from the index.html bootstrap")
            elif boot[section] != (d, m):
                problems.append(
                    f"{section}: the bootstrap defaults to {boot[section]}, PHP to {(d, m)}")

            offered = screen.get(section)
            if offered is None:
                problems.append(f"{section}: has no controls on the admin screen")
            else:
                for device in ("desktop", "mobile"):
                    values = offered.get(device)
                    if values is None:
                        problems.append(f"{section}.{device}: no dropdown on the admin screen")
                    elif sorted(values) != sorted(styles):
                        problems.append(
                            f"{section}.{device}: the screen offers {values}, "
                            f"the server allows {list(styles)}")

    movable = check_order(problems)

    if problems:
        print("  the home-layout vocabulary has drifted:")
        for line in problems:
            print(f"    {line}")
        print()
        print("  Every copy must agree — see modules/theme/README.md.")
        return 1

    print(f"  {len(php)} section shapes agree across PHP, home-layout.js, "
          f"the index.html bootstrap and the admin screen")
    print(f"  {movable} movable sections agree across all five copies, "
          f"and every one of them is named in index.html")
    return 0


if __name__ == "__main__":
    sys.exit(main())
