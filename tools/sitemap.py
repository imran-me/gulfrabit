#!/usr/bin/env python3
"""
GulfRabit sitemap generator (author-time helper).
Emits /sitemap.xml covering static pages + every category and product URL from
the mock data. Re-run after adding pages/products.

Usage:  python tools/sitemap.py
"""
import json, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = "https://gulfrabit.com"

STATIC = [
    "/index.html",
    "/modules/cart/cart.html",
    "/modules/checkout/checkout.html",
    "/modules/auth/login.html",
    "/modules/auth/register.html",
    "/modules/content/about.html",
    "/modules/content/contact.html",
    "/modules/content/faq.html",
    "/modules/content/shipping-returns.html",
    "/modules/deals/deals.html",
    "/modules/b2b/b2b-industrial.html",
]

def load(name):
    return json.loads((ROOT / "data" / f"{name}.json").read_text(encoding="utf-8"))

def main():
    urls = list(STATIC)
    for c in load("categories")["categories"]:
        urls.append(f"/modules/catalog/category.html?slug={c['slug']}")
    for p in load("products")["products"]:
        urls.append(f"/modules/catalog/product.html?id={p['id']}")

    body = "\n".join(
        f"  <url><loc>{SITE}{u}</loc><changefreq>weekly</changefreq></url>" for u in urls
    )
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"{body}\n</urlset>\n"
    )
    (ROOT / "sitemap.xml").write_text(xml, encoding="utf-8", newline="\n")
    print(f"wrote sitemap.xml — {len(urls)} URLs")

if __name__ == "__main__":
    main()
