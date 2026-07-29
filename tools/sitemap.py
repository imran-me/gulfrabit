#!/usr/bin/env python3
"""
GulfRabit sitemap generator (author-time helper).
Emits /sitemap.xml covering static pages + every category and product URL from
the mock data. Re-run after adding pages/products.

WHERE THE PAGE LIST COMES FROM
------------------------------
It is read from `assemble.py`'s PAGES, not typed here. A hand-kept copy of the
page list is the same trap the delivery rates were: the Sourcing page was built,
registered and linked, and the sitemap still did not know it existed — because
nothing failed when it was forgotten.

So the default is now INCLUSION, and leaving a page out is a deliberate entry in
NOINDEX below with a reason. Adding a page to the site adds it to the sitemap;
you cannot forget your way into an unlisted page.

Usage:  python tools/sitemap.py [--check]
"""
import importlib.util
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = "https://gulfrabit.com"

# Pages that exist but must NOT be in a sitemap, each with the reason.
NOINDEX = {
    "modules/account/dashboard.html":       "personal — behind sign-in",
    "modules/account/orders.html":          "personal — behind sign-in",
    "modules/account/addresses.html":       "personal — behind sign-in",
    "modules/account/wishlist.html":        "personal — behind sign-in",
    "modules/account/track.html":           "personal — order-specific",
    "modules/auth/forgot-password.html":    "no indexable content; invites scraping",
    "modules/checkout/order-confirmation.html": "personal — order-specific",
    "modules/admin/index.html":             "staff panel — noindex, and disallowed in robots.txt",
    "modules/admin/login.html":             "staff sign-in — never a search result",
    "modules/admin/orders.html":            "staff panel",
    "modules/admin/order.html":             "staff panel",
    "modules/admin/customers.html":         "staff panel — customer PII",
    "modules/admin/customer.html":          "staff panel — customer PII",
    "modules/courier/couriers.html":        "staff panel",
    "modules/admin/products.html":          "staff panel",
    "modules/admin/product-edit.html":      "staff panel",
    "modules/b2b/quotes.html":              "staff panel",
    "modules/accounting/pnl.html":          "staff panel",
    "modules/accounting/journal.html":      "staff panel",
    "modules/inventory/stock.html":         "staff panel",
    "modules/inventory/movements.html":     "staff panel",
    "modules/content/404.html":             "an error page must never be a search result",
    "404.html":                             "ditto, at the host root",

    # Templates that need a query parameter to mean anything. Their real URLs
    # are enumerated below, one per category and per product. The bare paths
    # render an empty state — product.html with no ?id= is literally the
    # "product not found" screen, which is the last thing to hand a crawler.
    "modules/catalog/product.html":         "template — indexed per ?id=",
    "modules/catalog/category.html":        "template — indexed per ?slug=",
    "modules/catalog/search-results.html":  "template — results depend on ?q=",
}

# index.html is hand-authored, so it is not in assemble.py's PAGES.
ALWAYS = ["/index.html"]


def assemble_pages() -> list[str]:
    """Every output path assemble.py builds — storefront AND admin.

    Both registries, because both produce real files a crawler could reach. If
    only PAGES were read, the admin pages would look "unknown" to the stale-
    exclusion check below and their NOINDEX entries would be rejected as
    obsolete — which would then leave the staff panel in the sitemap. The rule
    is the same for both lists: everything built is indexed unless deliberately
    excluded here.
    """
    spec = importlib.util.spec_from_file_location("gr_assemble", ROOT / "tools" / "assemble.py")
    module = importlib.util.module_from_spec(spec)
    # assemble.py reads its partials at import time and defines its registries
    # as data; importing it runs no build, so this is safe and always current.
    spec.loader.exec_module(module)
    return [entry[0] for entry in (*module.PAGES, *module.ADMIN_PAGES)]


def load(name):
    # Datasets live with the module that owns them (context.md §2): catalog
    # owns products + categories; orders/users still sit in /data until the
    # account and auth modules take them over.
    owner = {"products": "modules/catalog/data", "categories": "modules/catalog/data"}
    base = ROOT / owner.get(name, "data")
    return json.loads((base / f"{name}.json").read_text(encoding="utf-8"))


def main() -> int:
    check_only = "--check" in sys.argv

    built = assemble_pages()
    unknown = [p for p in NOINDEX if p not in built and p != "404.html"]
    if unknown:
        # A stale exclusion silently stops excluding anything, and nobody
        # notices until the page it named is back in the sitemap.
        print("  NOINDEX names pages that assemble.py no longer builds: " + ", ".join(unknown))
        return 1

    urls = list(ALWAYS) + [f"/{p}" for p in built if p not in NOINDEX]

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

    target = ROOT / "sitemap.xml"
    if check_only:
        current = target.read_text(encoding="utf-8") if target.exists() else ""
        if current != xml:
            print("  STALE  sitemap.xml — run python tools/sitemap.py")
            return 1
        print(f"  up to date   sitemap.xml — {len(urls)} URLs")
        return 0

    target.write_text(xml, encoding="utf-8", newline="\n")
    print(f"wrote sitemap.xml — {len(urls)} URLs ({len(NOINDEX)} pages deliberately excluded)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
