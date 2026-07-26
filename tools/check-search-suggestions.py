#!/usr/bin/env python3
"""
Assert every curated search suggestion actually returns products.

A suggestion that leads to an empty results page is worse than no suggestion —
it teaches the customer the search is broken. This mirrors matchesQuery() in
modules/catalog/backend/api.js.

Usage:  python tools/check-search-suggestions.py
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
PRODUCTS = ROOT / "modules" / "catalog" / "data" / "products.json"
SUGGESTIONS = ROOT / "modules" / "catalog" / "data" / "search-suggestions.json"


def matches(product: dict, q: str) -> bool:
    """Same two rules as backend/api.js: substring on free text, whole word on synonyms."""
    free = " ".join(filter(None, [
        product.get("title"), product.get("brand"), product.get("origin"),
        product.get("categoryName"), *(product.get("tags") or []),
    ])).lower()
    if q in free:
        return True
    return any(
        t == q or q in t.split(" ") or t.startswith(q + " ")
        for t in product.get("searchTerms", [])
    )


def main() -> int:
    products = json.loads(PRODUCTS.read_text(encoding="utf-8"))["products"]
    popular = json.loads(SUGGESTIONS.read_text(encoding="utf-8"))["popular"]

    failures = 0
    for entry in popular:
        q = entry["q"].lower()
        hits = [p["title"] for p in products if matches(p, q)]
        status = "ok " if hits else "EMPTY"
        if not hits:
            failures += 1
        example = hits[0][:44] if hits else "-- no product answers this query --"
        print(f"  {status}  {q:<14} {len(hits):>2} hit(s)  {example}")

    print()
    print(f"  suggestions with no results: {failures}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
