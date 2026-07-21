#!/usr/bin/env python3
"""
GulfRabit page assembler (author-time helper — NOT shipped, NOT a runtime dep).

Composes final static HTML pages from:
  - the canonical header/footer partials (shared/components/*.html)
  - a per-page <main> content fragment (modules/<x>/_fragments/<page>.main.html)
  - a small head/scripts config passed in `PAGES`.

Output is plain static HTML with the header/footer INLINED — so the shipped site
is content-first and needs no JS to render its chrome. Re-run this whenever a
fragment or the shared partials change.

Usage:  python assemble.py
"""
import os, re

import pathlib
ROOT = str(pathlib.Path(__file__).resolve().parent.parent)

def read(p):
    with open(os.path.join(ROOT, p), encoding="utf-8") as f:
        return f.read()

def write(p, s):
    full = os.path.join(ROOT, p)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8", newline="\n") as f:
        f.write(s)

HEADER = read("shared/components/header.html")
FOOTER = read("shared/components/footer.html")

# Canonical site origin (placeholder domain — update when the domain is live).
SITE = "https://gulfrabit.com"

def head(title, desc, css_links, theme="#0A0A0A"):
    extra = "\n  ".join(f'<link rel="stylesheet" href="{c}">' for c in css_links)
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title}</title>
  <meta name="description" content="{desc}">
  <meta name="theme-color" content="{theme}">
  <meta name="author" content="GulfRabit">
  <meta name="robots" content="index, follow">
  <meta name="color-scheme" content="dark">
  <!-- Social / Open Graph -->
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="GulfRabit">
  <meta property="og:title" content="{title}">
  <meta property="og:description" content="{desc}">
  <meta property="og:image" content="{SITE}/assets/images/hero/hero-food.svg">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{title}">
  <meta name="twitter:description" content="{desc}">
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="icon" type="image/png" href="/assets/logo/favicon-32.png">
  <link rel="apple-touch-icon" href="/assets/logo/apple-touch-icon.png">
  <link rel="manifest" href="/site.webmanifest">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Kufi+Arabic:wght@400;600&display=swap" rel="stylesheet">
  <link href="https://api.fontshare.com/v2/css?f[]=clash-display@600,700&display=swap" rel="stylesheet">
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="/shared/css/tailwind.config.js"></script>
  <link rel="stylesheet" href="/shared/css/style.css">
  {extra}
  <script type="application/ld+json">
  {{"@context":"https://schema.org","@type":"Organization","name":"GulfRabit","url":"{SITE}","logo":"{SITE}/assets/logo/gulfrabit-logo-dark-bg.jpeg","description":"Premium import marketplace for Bangladesh.","slogan":"Shop Smart. Hop Fast.","areaServed":"BD"}}
  </script>
</head>
<body>"""

def scripts(module_js):
    js = f'\n  <script type="module" src="{module_js}"></script>' if module_js else ""
    return f"""
  <script type="module" src="/shared/js/main.js"></script>{js}
</body>
</html>
"""

def relativize(html, out):
    """Rewrite site-root-absolute paths (/shared, /assets, /modules, /index.html,
    /favicon…, /site.webmanifest, url(/…)) into paths RELATIVE to this output
    page's depth, so the build works at a domain root OR a project subpath
    (e.g. user.github.io/repo/). External URLs (https://…) and #anchors are
    untouched because they don't begin with `="/` or `url(/`."""
    depth = out.count("/")            # e.g. modules/x/y.html -> 2, index.html -> 0
    prefix = "../" * depth            # "" for root pages
    if not prefix:
        # Root page: strip the leading slash so paths become same-dir relative.
        html = html.replace('="/', '="').replace("url('/", "url('").replace('url("/', 'url("').replace("url(/", "url(")
    else:
        html = html.replace('="/', f'="{prefix}').replace("url('/", f"url('{prefix}").replace('url("/', f'url("{prefix}').replace("url(/", f"url({prefix}")
    return html

def assemble(out, title, desc, main_html, css_links=None, module_js=None):
    page = head(title, desc, css_links or []) + "\n"
    page += "  <!-- HEADER (inlined from shared/components/header.html) -->\n"
    page += HEADER + "\n\n"
    page += main_html.strip() + "\n\n"
    page += "  <!-- FOOTER (inlined from shared/components/footer.html) -->\n"
    page += FOOTER
    page += scripts(module_js)
    page = relativize(page, out)
    write(out, page)
    print("wrote", out)

# ---- Page registry ------------------------------------------------------
# Each entry: (output path, title, description, fragment path, [css], module_js)
PAGES = [
    ("modules/catalog/category.html",
     "Shop — GulfRabit",
     "Browse GulfRabit's imported catalog with filters and sorting.",
     "modules/catalog/_fragments/category.main.html",
     ["/modules/catalog/catalog.css"], "/modules/catalog/category-page.js"),

    ("modules/catalog/product.html",
     "Product — GulfRabit",
     "Product details, specifications and shipping for a GulfRabit import.",
     "modules/catalog/_fragments/product.main.html",
     ["/modules/catalog/catalog.css"], "/modules/catalog/product-page.js"),

    ("modules/catalog/search-results.html",
     "Search — GulfRabit",
     "Search results across GulfRabit's imported catalog.",
     "modules/catalog/_fragments/search.main.html",
     ["/modules/catalog/catalog.css"], "/modules/catalog/search-page.js"),

    ("modules/catalog/compare.html",
     "Compare — GulfRabit",
     "Compare GulfRabit products side by side.",
     "modules/catalog/_fragments/compare.main.html",
     ["/modules/catalog/catalog.css"], "/modules/catalog/compare-page.js"),

    ("modules/cart/cart.html",
     "Your Cart — GulfRabit",
     "Review and edit the items in your GulfRabit cart.",
     "modules/cart/_fragments/cart.main.html",
     ["/modules/cart/cart.css"], "/modules/cart/cart-page.js"),

    ("modules/checkout/checkout.html",
     "Checkout — GulfRabit",
     "Complete your GulfRabit order — address, delivery and payment.",
     "modules/checkout/_fragments/checkout.main.html",
     ["/modules/checkout/checkout.css"], "/modules/checkout/checkout-page.js"),

    ("modules/checkout/order-confirmation.html",
     "Order Confirmed — GulfRabit",
     "Your GulfRabit order is confirmed.",
     "modules/checkout/_fragments/confirmation.main.html",
     ["/modules/checkout/checkout.css"], "/modules/checkout/confirmation-page.js"),

    ("modules/account/dashboard.html",
     "My Account — GulfRabit",
     "Your GulfRabit account overview.",
     "modules/account/_fragments/dashboard.main.html",
     ["/modules/account/account.css"], "/modules/account/account-page.js"),

    ("modules/account/orders.html",
     "My Orders — GulfRabit",
     "Your GulfRabit order history.",
     "modules/account/_fragments/orders.main.html",
     ["/modules/account/account.css"], "/modules/account/orders-page.js"),

    ("modules/account/addresses.html",
     "My Addresses — GulfRabit",
     "Manage your saved delivery addresses.",
     "modules/account/_fragments/addresses.main.html",
     ["/modules/account/account.css"], "/modules/account/addresses-page.js"),

    ("modules/account/wishlist.html",
     "My Wishlist — GulfRabit",
     "Products you've saved on GulfRabit.",
     "modules/account/_fragments/wishlist.main.html",
     ["/modules/account/account.css"], "/modules/account/wishlist-page.js"),

    ("modules/account/track.html",
     "Track Order — GulfRabit",
     "Track the status of your GulfRabit order.",
     "modules/account/_fragments/track.main.html",
     ["/modules/account/account.css"], "/modules/account/track-page.js"),

    ("modules/auth/login.html",
     "Sign In — GulfRabit",
     "Sign in to your GulfRabit account.",
     "modules/auth/_fragments/login.main.html",
     ["/modules/auth/auth.css"], "/modules/auth/auth-page.js"),

    ("modules/auth/register.html",
     "Create Account — GulfRabit",
     "Create your GulfRabit account.",
     "modules/auth/_fragments/register.main.html",
     ["/modules/auth/auth.css"], "/modules/auth/auth-page.js"),

    ("modules/auth/forgot-password.html",
     "Reset Password — GulfRabit",
     "Reset your GulfRabit password.",
     "modules/auth/_fragments/forgot.main.html",
     ["/modules/auth/auth.css"], "/modules/auth/auth-page.js"),

    ("modules/content/about.html",
     "About — GulfRabit",
     "The GulfRabit story: sourcing, authenticity and craft.",
     "modules/content/_fragments/about.main.html",
     ["/modules/content/content.css"], None),

    ("modules/content/contact.html",
     "Contact — GulfRabit",
     "Get in touch with GulfRabit support.",
     "modules/content/_fragments/contact.main.html",
     ["/modules/content/content.css"], "/modules/content/contact-page.js"),

    ("modules/content/faq.html",
     "FAQ — GulfRabit",
     "Answers to common questions about GulfRabit.",
     "modules/content/_fragments/faq.main.html",
     ["/modules/content/content.css"], "/modules/content/faq-page.js"),

    ("modules/content/shipping-returns.html",
     "Shipping & Returns — GulfRabit",
     "GulfRabit shipping, delivery and returns policy.",
     "modules/content/_fragments/shipping.main.html",
     ["/modules/content/content.css"], None),

    ("modules/content/404.html",
     "Page Not Found — GulfRabit",
     "The page you were looking for has hopped away.",
     "modules/content/_fragments/404.main.html",
     ["/modules/content/content.css"], None),

    # Root-level copy so hosts that serve /404.html on a miss (GitHub Pages,
    # Netlify, most static hosts) get the on-brand page.
    ("404.html",
     "Page Not Found — GulfRabit",
     "The page you were looking for has hopped away.",
     "modules/content/_fragments/404.main.html",
     ["/modules/content/content.css"], None),

    ("modules/b2b/b2b-industrial.html",
     "Industrial & B2B — GulfRabit",
     "Raw materials for the electronics industry: PCBs, switches, relays, sensors, polymers. Bulk pricing and RFQ.",
     "modules/b2b/_fragments/b2b.main.html",
     ["/modules/b2b/b2b.css"], "/modules/b2b/b2b-page.js"),
]

if __name__ == "__main__":
    built = 0
    for out, title, desc, frag, css, mjs in PAGES:
        fp = os.path.join(ROOT, frag)
        if not os.path.exists(fp):
            print("SKIP (no fragment yet):", frag)
            continue
        assemble(out, title, desc, read(frag), css, mjs)
        built += 1
    print(f"done — {built} page(s) assembled")
