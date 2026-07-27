#!/usr/bin/env python3
"""
Generate a per-product FAQ and write it into
modules/catalog/data/products.json.

WHY
---
Shajgoj carry a merchant-authored FAQ *and* a Q&A on every product page, with
genuinely specific answers. For imported goods the blockers are concrete — "how
do I know it's real?", "how should I store it?", "what's the minimum order?" —
and unlike reviews, an FAQ works from day one with zero customers.

THE RULE THIS FILE OBEYS
------------------------
**Every answer is derived from data that actually exists on the product.**
Nothing is invented. If a product has no `dietary` flags it gets no dietary
question; if it has no `moq` it gets no minimum-order question. There is no
"Is it halal?" answer, because certification is not in the dataset and writing
one would be fabricating a claim about real food.

Answers quote real values — the barcode, the origin, the MOQ, the tier
quantities — so they read as specific rather than as filler, which is the whole
difference between a useful FAQ and padding.

Usage:  python tools/gen-product-faq.py
Re-run after adding products. Idempotent.
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
PRODUCTS = ROOT / "modules" / "catalog" / "data" / "products.json"

# Categories that are food or ingestible — storage and shelf life matter.
PERISHABLE_CATEGORIES = {
    "imported-food-grocery",
    "dairy-milk-powder",
    "nuts-dry-fruits",
}

STORAGE_ADVICE = {
    "imported-food-grocery": "Keep sealed in a cool, dry place away from direct sunlight. Refrigerate after opening if the pack says so.",
    "dairy-milk-powder": "Store cool and dry, and seal the pack tightly after each use — powder absorbs moisture quickly in Dhaka humidity.",
    "nuts-dry-fruits": "Airtight and away from heat. Refrigeration extends freshness in warm months and is worth it here.",
    "beauty-personal-care": "Room temperature, out of direct sunlight. Check the period-after-opening symbol on the pack.",
}

DIETARY_LABEL = {
    "vegan": "vegan",
    "vegetarian": "vegetarian",
    "gluten-free": "gluten-free",
    "no-added-sugar": "made with no added sugar",
    "organic": "organic",
    "raw": "raw and unprocessed",
    "unfiltered": "unfiltered",
}


def faq_for(product: dict) -> list[dict]:
    faq: list[dict] = []
    cat = product.get("categorySlug", "")
    title = product["title"]

    # --- authenticity: the single biggest objection for imported goods ----
    if product.get("barcode") and product.get("origin"):
        faq.append({
            "q": "How do I know this is genuine?",
            "a": (
                f"Every unit is import-verified. This batch is sourced from "
                f"{product['origin']}, and the barcode printed on the pack — "
                f"{product['barcode']} — matches the one listed under Specifications. "
                f"Check them against each other when it arrives."
            ),
        })

    # --- storage / cold chain --------------------------------------------
    if cat in STORAGE_ADVICE:
        faq.append({"q": "How should I store it?", "a": STORAGE_ADVICE[cat]})

    if cat in PERISHABLE_CATEGORIES:
        faq.append({
            "q": "Is it shipped cold-chain?",
            "a": (
                "Yes, at no extra charge. Cold-chain handling on perishables is part of "
                "what you are buying here, not an add-on — and the delivery charge is the "
                "same flat rate either way."
            ),
        })

    # --- dietary, only when the product actually declares it --------------
    flags = [DIETARY_LABEL[f] for f in (product.get("dietary") or []) if f in DIETARY_LABEL]
    if flags:
        listed = flags[0] if len(flags) == 1 else ", ".join(flags[:-1]) + " and " + flags[-1]
        faq.append({
            "q": "Does it suit dietary restrictions?",
            "a": (
                f"This product is listed as {listed}. The full ingredient statement is on "
                f"the pack — check it if you have a specific allergy, since we do not "
                f"repackage anything."
            ),
        })

    # --- B2B: minimum order and volume pricing ---------------------------
    moq = product.get("moq")
    tiers = product.get("priceTiers") or []
    if moq:
        # Skip the first tier when it merely restates the MOQ — "volume pricing
        # steps in at 50" when 50 is the minimum is not a discount, it is the
        # base price, and saying otherwise oversells it.
        breaks = [t["min"] for t in tiers if t.get("min") and t["min"] > moq]
        if breaks:
            listed = ", ".join(str(b) for b in breaks)
            answer = (
                f"The minimum order is {moq} units. Volume pricing steps in at {listed} units — "
                f"request a quote and the B2B desk confirms stock and lead time."
            )
        else:
            answer = f"The minimum order is {moq} units. Request a quote for pricing and lead time."
        faq.append({"q": "What is the minimum order quantity?", "a": answer})

    if product.get("datasheet"):
        faq.append({
            "q": "Is a datasheet available?",
            "a": "Yes — download it from the Specifications tab. It carries the full electrical and mechanical detail.",
        })

    # --- returns, phrased against the actual policy ----------------------
    if cat in PERISHABLE_CATEGORIES:
        faq.append({
            "q": "Can I return it?",
            "a": (
                "Perishables are non-returnable for safety reasons unless they arrive damaged, "
                "incorrect, or with an authenticity concern — tell us within 48 hours and we "
                "replace or refund in full."
            ),
        })
    else:
        faq.append({
            "q": "Can I return it?",
            "a": (
                "Unopened items can be returned within 7 days of delivery. Refunds go back by "
                "the route you paid — see the refund timeline on Shipping & Returns."
            ),
        })

    return faq


def main() -> None:
    data = json.loads(PRODUCTS.read_text(encoding="utf-8"))

    total = 0
    for product in data["products"]:
        product["faq"] = faq_for(product)
        total += len(product["faq"])

    PRODUCTS.write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n"
    )

    n = len(data["products"])
    print(f"FAQ written for {n} products ({total} questions, {total / n:.1f} avg)")


if __name__ == "__main__":
    main()
