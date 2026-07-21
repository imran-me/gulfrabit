#!/usr/bin/env python3
"""
Generate a DISTINCT premium placeholder image per product (so category grids
don't show identical tiles) and point the catalog at them. Each image is a
self-contained SVG: a brand-tinted studio gradient, a category-appropriate
geometric motif with facets (echoing the logo), a dot texture, a vignette, and
the brand + title. Swap any file for a real photo later — same path.

Usage:  python tools/gen-product-images.py
Re-run after adding products.
"""
import json, pathlib, hashlib, html

ROOT = pathlib.Path(__file__).resolve().parent.parent
PDIR = ROOT / "assets" / "images" / "products"

# Category -> (colorA, colorB, motif)
CAT = {
    "imported-food-grocery": ("#1BB4D4", "#0E7C99", "bag"),
    "dairy-milk-powder":     ("#9ACD3C", "#1BB4D4", "carton"),
    "nuts-dry-fruits":       ("#C9A24B", "#9ACD3C", "circle"),
    "gadgets-electronics":   ("#1BB4D4", "#4a4a4a", "device"),
    "kitchen-home":          ("#0E7C99", "#9ACD3C", "circle"),
    "fashion":               ("#8A8F8C", "#1BB4D4", "tag"),
    "beauty-personal-care":  ("#C3E86B", "#1BB4D4", "bottle"),
    "office-supplies":       ("#0E7C99", "#8A8F8C", "card"),
    "industrial-raw-materials": ("#2A2A2A", "#1BB4D4", "chip"),
}

def seeded(s, mod):
    return int(hashlib.md5(s.encode()).hexdigest(), 16) % mod

def motif(kind, cx, cy):
    """Return SVG for a category motif centred at (cx, cy), filled url(#accent)."""
    a = 'fill="url(#accent)" stroke="rgba(255,255,255,.18)" stroke-width="1.5"'
    facet = 'stroke="rgba(255,255,255,.16)" fill="none" stroke-width="1.2"'
    if kind == "bag":
        return f'''<path {a} d="M{cx-70} {cy-40} q0 -26 26 -30 l88 0 q26 4 26 30 l0 130 q0 20 -20 20 l-80 0 q-20 0 -20 -20 z"/>
        <path {facet} d="M{cx-70} {cy} l140 0 M{cx} {cy-70} l0 160"/>'''
    if kind == "carton":
        return f'''<path {a} d="M{cx-58} {cy-58} l116 0 l0 130 l-116 0 z"/>
        <path {a} d="M{cx-58} {cy-58} l30 -34 l116 0 l-30 34 z"/>
        <path {facet} d="M{cx} {cy-58} l0 130 M{cx-58} {cy} l116 0"/>'''
    if kind == "circle":
        return f'''<circle {a} cx="{cx}" cy="{cy}" r="78"/>
        <circle {facet} cx="{cx}" cy="{cy}" r="50"/>
        <path {facet} d="M{cx-78} {cy} l156 0 M{cx} {cy-78} l0 156"/>'''
    if kind == "device":
        return f'''<rect {a} x="{cx-60}" y="{cy-78}" rx="16" width="120" height="156"/>
        <rect {facet} x="{cx-42}" y="{cy-58}" rx="8" width="84" height="96"/>
        <circle {facet} cx="{cx}" cy="{cy+56}" r="10"/>'''
    if kind == "tag":
        return f'''<path {a} d="M{cx-64} {cy-30} l60 -46 l86 0 l0 86 l-46 60 z"/>
        <circle {facet} cx="{cx+40}" cy="{cy-32}" r="10"/>
        <path {facet} d="M{cx-40} {cy+40} l70 -70"/>'''
    if kind == "bottle":
        return f'''<path {a} d="M{cx-14} {cy-80} l28 0 l0 26 q26 10 26 40 l0 74 q0 18 -18 18 l-44 0 q-18 0 -18 -18 l0 -74 q0 -30 26 -40 z"/>
        <path {facet} d="M{cx-40} {cy-6} l80 0"/>'''
    if kind == "card":
        return f'''<rect {a} x="{cx-72}" y="{cy-50}" rx="10" width="144" height="100"/>
        <path {facet} d="M{cx-72} {cy-20} l144 0 M{cx-40} {cy+16} l60 0"/>'''
    # chip
    pins = "".join(f'<rect fill="url(#accent)" x="{cx-70}" y="{cy-40+ i*20}" width="-12" height="8"/>' for i in range(0))
    return f'''<rect {a} x="{cx-56}" y="{cy-56}" rx="6" width="112" height="112"/>
    <rect {facet} x="{cx-34}" y="{cy-34}" width="68" height="68"/>
    {''.join(f'<rect fill="url(#accent)" x="{cx-70}" y="{cy-44+i*22}" width="14" height="8"/><rect fill="url(#accent)" x="{cx+56}" y="{cy-44+i*22}" width="14" height="8"/>' for i in range(5))}'''

def svg(p):
    cat = p["categorySlug"]
    ca, cb, kind = CAT.get(cat, ("#1BB4D4", "#0E7C99", "circle"))
    # vary the angle + glow position per product so tiles differ
    ang = seeded(p["id"], 90)
    gx = 30 + seeded(p["id"] + "x", 40)
    gy = 24 + seeded(p["id"] + "y", 30)
    title = html.escape(p["title"])
    brand = html.escape((p.get("brand") or "").upper())
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500" width="400" height="500" role="img" aria-label="{title}">
  <defs>
    <linearGradient id="accent" gradientTransform="rotate({ang} .5 .5)"><stop offset="0" stop-color="{ca}"/><stop offset="1" stop-color="{cb}"/></linearGradient>
    <radialGradient id="glow" cx="{gx}%" cy="{gy}%" r="75%"><stop offset="0" stop-color="{ca}" stop-opacity=".22"/><stop offset="60%" stop-color="{ca}" stop-opacity="0"/></radialGradient>
    <radialGradient id="vig" cx="50%" cy="44%" r="75%"><stop offset="55%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity=".42"/></radialGradient>
    <pattern id="dots" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r="1.2" fill="#ffffff" fill-opacity=".05"/></pattern>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="10" stdDeviation="16" flood-color="#000" flood-opacity=".45"/></filter>
  </defs>
  <rect width="400" height="500" fill="#141414"/>
  <rect width="400" height="500" fill="url(#dots)"/>
  <rect width="400" height="500" fill="url(#glow)"/>
  <g filter="url(#soft)">{motif(kind, 200, 232)}</g>
  <rect width="400" height="500" fill="url(#vig)"/>
  <text x="28" y="46" font-family="Inter, sans-serif" font-size="12" letter-spacing="2.5" fill="#8A8F8C">{brand}</text>
  <text x="28" y="452" font-family="Inter, sans-serif" font-size="18" font-weight="600" fill="#F7F8F7">{title[:30]}</text>
  <text x="28" y="476" font-family="Inter, sans-serif" font-size="11" letter-spacing="2" fill="#8A8F8C">GULFRABIT</text>
</svg>
'''

def main():
    data = json.loads((ROOT / "data" / "products.json").read_text(encoding="utf-8"))
    for p in data["products"]:
        path = f"/assets/images/products/{p['id']}.svg"
        (PDIR / f"{p['id']}.svg").write_text(svg(p), encoding="utf-8", newline="\n")
        p["image"] = path
        p["images"] = [path]
    (ROOT / "data" / "products.json").write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n")
    print(f"generated {len(data['products'])} product images + updated products.json")

if __name__ == "__main__":
    main()
