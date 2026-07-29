#!/usr/bin/env python3
"""
Check that no migration runs before a table it has a foreign key to.

WHY THIS EXISTS
---------------
Laravel runs migrations in FILENAME order, and this project numbers each
module's migrations from 000001 inside its own folder. That is right for
modularity and wrong for ordering: `cart` and `catalog` both had a `..._000002_`
migration, the filenames tie-broke alphabetically, and `cart_items` tried to add
a foreign key to `products` before `products` existed.

It failed on the first real deployment and not once before, because every check
in this project ran without a database. A migration that references a table
created later is not a syntax error and not a lint error — it is only ever an
error at the moment somebody runs it on an empty database, which is the one
moment you least want a surprise.

So this reads the whole set, sorts it the way Laravel will, and walks it
forwards asking whether each table already exists by the time it is referenced.

Usage:  python tools/migration-order.py
        exit 1 if any migration would fail
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

# Laravel's own irregular plurals that matter here. `foreignId('journal_entry_id')
# ->constrained()` infers `journal_entries`, not `journal_entrys` — getting this
# wrong produces a false alarm that trains people to ignore the check.
IRREGULAR = {
    "entry": "entries",
    "category": "categories",
    "address": "addresses",
    "person": "people",
}


def table_for(column_stem: str) -> str:
    """`journal_entry` -> `journal_entries`, `product` -> `products`."""
    for singular, plural in IRREGULAR.items():
        if column_stem.endswith(singular):
            return column_stem[: -len(singular)] + plural
    return column_stem + "s"


def scan():
    seen = {}
    for path in ROOT.rglob("*.php"):
        parts = {p.lower() for p in path.parts}
        if "migrations" not in parts:
            continue
        # Windows globs are case-insensitive, so the same file can match twice.
        seen[path.name] = path
    return [seen[name] for name in sorted(seen)]


def main() -> int:
    created = set()
    problems = []

    for path in scan():
        text = path.read_text(encoding="utf-8")

        made = re.search(r"Schema::create\('([a-z_]+)'", text)
        creates = made.group(1) if made else None

        deps = set(re.findall(r"constrained\('([a-z_]+)'\)", text))
        for stem in re.findall(
            r"foreignId\('([a-z_]+)_id'\)(?:->[a-zA-Z]+\([^)]*\))*?->constrained\(\)", text
        ):
            deps.add(table_for(stem))

        # A table may reference itself (journal_entries.reverses_id), which is
        # fine: the row exists by the time the constraint is added.
        deps.discard(creates)

        missing = sorted(d for d in deps if d not in created)
        if missing:
            problems.append((path.name, missing))

        if creates:
            created.add(creates)

    if problems:
        print(f"  {len(problems)} migration(s) run BEFORE a table they reference:\n")
        for name, missing in problems:
            print(f"    {name}")
            print(f"      needs: {', '.join(missing)}\n")
        print("  Laravel orders migrations by filename. Rename the dependency to an")
        print("  earlier timestamp so it runs first — see modules/catalog, which is")
        print("  dated a day earlier than everything that references its tables.")
        return 1

    print(f"  {len(created)} tables, migration order is consistent")
    return 0


if __name__ == "__main__":
    sys.exit(main())
