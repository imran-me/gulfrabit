#!/usr/bin/env python3
"""
Generate `searchTerms` for every product and write them back into
modules/catalog/data/products.json.

WHY THIS EXISTS
---------------
Shajgoj carries an AI-generated synonym field on every document
(`search_suggestions_exact`) — "combo pack of matte lipsticks", "lipstick for
dry lips" — and it is what turns their keyword index into something that
answers how people actually type. It is the single highest-leverage search
upgrade available, and at 44 products it is nearly free.

THE PART THAT MATTERS FOR BANGLADESH
------------------------------------
A shopper in Dhaka types **khejur**, not "dates". **Modhu**, not "honey".
**Cha**, not "tea". Romanised Bangla is how a large share of search traffic
arrives, and matching only English titles silently misses it. That is the
transliteration map below, and it is the reason this file is hand-curated
rather than purely mechanical.

Also covers the everyday synonym ("headphones" ~ "headset") and the common
misspelling ("pistachio" ~ "pista").

Usage:  python tools/gen-search-terms.py
Re-run after adding products. Idempotent — it rewrites the field wholesale.

NOTE: these are DERIVED, not LLM-written. They are deliberately conservative:
a wrong synonym surfaces the wrong product, which is worse than no synonym.
Replace with richer generated terms when there is a model in the pipeline.
"""
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
PRODUCTS = ROOT / "modules" / "catalog" / "data" / "products.json"

# keyword found in the title  ->  extra terms a customer might type instead.
# Romanised Bangla first, then English synonyms, then common misspellings.
KEYWORD_TERMS = {
    # --- food -----------------------------------------------------------
    "dates":       ["khejur", "khajur", "medjool", "dry dates", "iftar dates"],
    "honey":       ["modhu", "modu", "raw honey", "sidr", "natural honey"],
    "coffee":      ["kofi", "coffee beans", "arabica", "ground coffee"],
    "chocolate":   ["chocolet", "cocolate", "dark chocolate", "gift chocolate"],
    "tea":         ["cha", "sha", "black tea", "green tea", "loose leaf"],
    "green tea":   ["sobuj cha", "sencha", "matcha alternative"],
    # --- dairy ----------------------------------------------------------
    "milk powder": ["gurer dudh", "dudh", "powdered milk", "formula", "full cream"],
    "butter":      ["makhon", "unsalted butter", "grass fed butter"],
    "gouda":       ["cheese", "panir", "hard cheese"],
    # --- nuts -----------------------------------------------------------
    "pistachios":  ["pesta", "pista", "pistachio", "badam"],
    "almonds":     ["kath badam", "badam", "almond", "raw almonds"],
    "cashews":     ["kaju", "kaju badam", "cashew nuts"],
    "walnut":      ["akhrot", "walnuts"],
    "apricots":    ["khubani", "dried apricot"],
    # --- electronics ----------------------------------------------------
    "headphones":  ["headphone", "headset", "hedphone", "over ear", "anc"],
    "earbuds":     ["earbud", "airpods alternative", "tws", "wireless earphone"],
    "smartwatch":  ["smart watch", "watch", "ghori", "fitness watch"],
    "speaker":     ["bluetooth speaker", "sound box", "portable speaker"],
    "smart home":  ["home automation", "smart hub", "matter hub"],
    # --- kitchen --------------------------------------------------------
    "dutch oven":  ["casserole", "cast iron pot", "handi"],
    "knife":       ["chef knife", "chaku", "kitchen knife", "damascus"],
    "frying pan":  ["pan", "korai", "nonstick pan", "tawa"],
    "mugs":        ["mug", "cup", "glass cup"],
    "pour-over":   ["coffee dripper", "v60", "filter coffee"],
    # --- fashion --------------------------------------------------------
    "sweater":     ["sweter", "pullover", "jumper", "winter wear"],
    "leather":     ["chamra", "genuine leather"],
    "sunglasses":  ["sunglass", "shades", "chosma", "goggles"],
    "scarf":       ["muffler", "shawl", "chador"],
    "belt":        ["leather belt", "waist belt"],
    # --- beauty ---------------------------------------------------------
    "serum":       ["face serum", "vitamin c serum", "brightening"],
    "moisturiser": ["moisturizer", "cream", "face cream", "hydrating"],
    "sunscreen":   ["sun cream", "spf", "sunblock"],
    "grooming":    ["shaving set", "beard care"],
    # --- office ---------------------------------------------------------
    "notebook":    ["khata", "diary", "journal", "dotted notebook"],
    "rollerball":  ["pen", "kolom", "gel pen"],
    "pencil":      ["mechanical pencil", "drafting pencil"],
    "organiser":   ["organizer", "desk tidy"],
    # --- industrial -----------------------------------------------------
    "pcb":         ["circuit board", "printed circuit board", "fr4", "fr-4"],
    "switch":      ["push button", "tactile switch", "smd switch"],
    "relay":       ["power relay", "spdt relay", "5v relay"],
    "sensor":      ["temperature sensor", "humidity sensor", "i2c sensor", "dht"],
    "polymer":     ["abs pellets", "plastic granules", "raw plastic"],
    "capacitor":   ["electrolytic capacitor", "cap", "1000uf"],
}

# dietary flag -> how a person actually types it
DIETARY_TERMS = {
    "vegan":           ["vegan", "plant based"],
    "gluten-free":     ["gluten free", "glutenfree"],
    "no-added-sugar":  ["no added sugar", "sugar free", "sugarfree", "diabetic friendly"],
    "organic":         ["organic", "jaibo"],
    "raw":             ["raw", "unprocessed"],
    "unfiltered":      ["unfiltered", "natural"],
    "vegetarian":      ["vegetarian", "veg"],
}

STOPWORDS = {
    "the", "and", "for", "with", "set", "of", "pcs", "pc", "premium", "pro",
    "series", "plus", "new", "natural",
}


def title_tokens(title: str) -> list[str]:
    """Meaningful words from the title, minus packaging noise."""
    # drop parentheticals and anything after an em dash — both are packaging
    # detail ("(1kg Pouch)", "— Medium Roast"), not how people search.
    core = re.split(r"[—(]", title)[0]
    words = re.findall(r"[a-zA-Z]{3,}", core.lower())
    return [w for w in words if w not in STOPWORDS]


def terms_for(product: dict) -> list[str]:
    title_l = product["title"].lower()
    terms: list[str] = []

    terms.extend(title_tokens(product["title"]))

    for field in ("brand", "origin", "categoryName"):
        value = product.get(field)
        if value:
            terms.append(value.lower())

    # the curated map — longest keys first so "green tea" wins over "tea"
    for keyword in sorted(KEYWORD_TERMS, key=len, reverse=True):
        if keyword in title_l:
            terms.extend(KEYWORD_TERMS[keyword])

    for flag in product.get("dietary") or []:
        terms.extend(DIETARY_TERMS.get(flag, [flag.replace("-", " ")]))

    if product.get("moq"):
        terms.extend(["bulk", "wholesale", "b2b", "moq"])

    # de-duplicate, keep order, drop anything already implied by the title
    seen, out = set(), []
    for t in terms:
        t = t.strip().lower()
        if t and t not in seen:
            seen.add(t)
            out.append(t)
    return out


def main() -> None:
    data = json.loads(PRODUCTS.read_text(encoding="utf-8"))

    total = 0
    for product in data["products"]:
        product["searchTerms"] = terms_for(product)
        total += len(product["searchTerms"])

    PRODUCTS.write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n"
    )

    count = len(data["products"])
    print(f"searchTerms written for {count} products ({total} terms, "
          f"{total / count:.1f} avg)")


if __name__ == "__main__":
    main()
