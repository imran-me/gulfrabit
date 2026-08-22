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
import hashlib
import os, posixpath, re

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

# The storefront theme baked into this build; --theme overrides it in __main__.
# Declared here, not only there, so importing this module (a test, another
# tool) cannot hit a NameError inside head().
BUILD_THEME = "classic"

# Every theme layer, in cascade order. THE ONE LIST.
#
# This was two lists: head() built the links for the 44 generated pages, and
# index.html — the only page this tool does not assemble — carried its own
# hand-typed copy. Adding a theme meant remembering both, and the failure mode
# was silent and landed on the page most visitors actually see: the home page
# would set data-theme="nakshi" on <html>, the conductor would build its whole
# scene, and none of it had a stylesheet, so the home page rendered as Classic
# while every other page in the shop wore the new theme.
#
# So there is one list now, head() reads it, and sync_index_theme() rewrites
# index.html's block from it on every build. A theme added here cannot be
# missing from the home page.
THEME_SHEETS = {
    "classic": [],                                    # classic IS the base sheet
    "luxe":    ["/modules/theme/theme-luxe.css"],
    "trio":    ["/modules/theme/theme-trio.css"],
    "noor":    ["/modules/theme/theme-noor.css",
                "/modules/theme/theme-noor-sky.css"],
    "nakshi":  ["/modules/theme/theme-nakshi.css",
                "/modules/theme/theme-nakshi-scene.css"],
    "utsab":   ["/modules/theme/theme-utsab.css"],
}

# ONE THEME'S SHEETS, NOT ALL OF THEM.
#
# This was a flat list and every page linked the whole thing: seven
# stylesheets, 230 KB raw and about 64 KB gzipped, render-blocking, on every
# page of the shop. Six of the seven were inert — a theme sheet does nothing
# without its [data-theme] on <html> — so a shop published as Trio was making
# every visitor download 62 KB of CSS for five themes they would never see,
# before the first pixel. On the connections most of this shop's customers are
# on, that was the better part of a second of blank screen, on every page.
#
# It was linked that way for a real reason: the HTML is static and built once,
# so the build cannot know which theme the merchant will publish next week. The
# answer is not to guess but to LAYER the two things that do know:
#
#   1. The build bakes its own theme's sheets as normal blocking <link>s.
#   2. The pre-paint bootstrap knows better whenever a returning visitor has a
#      mirror of the server's last answer, and injects that theme's sheets
#      before the first paint. Appending a stylesheet <link> into <head> blocks
#      rendering exactly as an authored one does, so there is no flash.
#   3. theme.js covers the rest — the first-ever visit, and a live switch.
#
# The cost is one extra blocking request, and only for visitors who arrive
# between the merchant publishing a new theme and the next deploy re-baking it.
# The saving is 62 KB of dead CSS for everybody, always.


# The comment that ships in every page's <head>, above the theme link.
# Kept here rather than inline in head() so the string is one piece of prose
# instead of six concatenated fragments.
THEME_LINK_NOTE = (
    "<!-- The theme layer for this build. ONE theme, not seven: a theme sheet\n"
    "       is inert without its [data-theme] on <html>, so linking them all\n"
    "       meant every visitor downloading five themes they would never see,\n"
    "       render-blocking, on every page. The bootstrap above adds a\n"
    "       different one before the first paint when the server has already\n"
    "       told this visitor which theme is published. -->\n"
)


def _theme_bootstrap_js():
    """The pre-paint theme block, shared by head() and sync_index_theme().

    It lives in one function for the same reason THEME_SHEETS is one map: this
    code exists in two places on disk — every generated page, and the
    hand-authored index.html — and the last time those two drifted, the home
    page painted Classic while the rest of the shop wore the published theme.
    A copy that has to be kept in step by hand is a copy that goes stale, and
    the home page is the page most visitors land on.

    Indented to sit inside the <script> in head().
    """
    return """try {
      var t = localStorage.getItem('gr:theme');
      if (t) {
        var el = document.documentElement;
        var v = JSON.parse(t);
        if (%(list)s.indexOf(v) > -1) el.setAttribute('data-theme', v);
        else el.removeAttribute('data-theme');

        /* AND ITS STYLESHEET, if this build did not bake it.
           The attribute alone paints nothing. A theme is an attribute plus the
           sheet scoped to it, and the build links only the theme it was built
           with — see THEME_SHEETS for why it stopped linking all seven.

           Injecting the <link> HERE, rather than in theme.js, is the whole
           point of doing it in this block: a stylesheet appended to <head>
           before the body exists blocks the first paint exactly as an authored
           one does, so the visitor sees the right theme immediately instead of
           a frame of Classic and then a flip. theme.js runs after the paint
           this is here to get right.

           Skipped when the mirror agrees with the build, which is the normal
           case and already has its sheet linked. */
        var baked = '%(baked)s';
        var sheets = %(sheets)s;
        if (v !== baked && sheets[v]) {
          for (var i = 0; i < sheets[v].length; i++) {
            var link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = sheets[v][i];
            document.head.appendChild(link);
          }
        }
      }
    } catch (e) { /* private mode, or nothing stored — the built-in theme stands. */ }""" % {
        "list": _theme_js_list(),
        "baked": BUILD_THEME,
        "sheets": _theme_sheet_map_js(),
    }


def theme_links(theme, *, relative=False):
    """The <link> tags for one theme, in cascade order."""
    sheets = THEME_SHEETS.get(theme, [])
    return [
        f'<link rel="stylesheet" href="{asset(s).lstrip("/") if relative else asset(s)}">'
        for s in sheets
    ]


def _theme_sheet_map_js():
    """THEME_SHEETS as a JS object literal, for the pre-paint bootstrap.

    Hashed exactly as the authored links are, so a sheet injected by the
    bootstrap hits the same cache entry as one the build wrote — otherwise a
    visitor would download the same file twice under two URLs.
    """
    parts = []

    for name, sheets in THEME_SHEETS.items():
        if not sheets:
            continue
        urls = ",".join(f"'{asset(s)}'" for s in sheets)
        parts.append(f"{name}:[{urls}]")

    return "{" + ",".join(parts) + "}"

# Every theme a visitor may be shown, EXCLUDING classic — classic is the
# absence of the attribute, not a value of it.
#
# This must stay in step with THEMES in modules/theme/theme.js and with
# SiteSetting::THEMES on the server. It exists because the pre-paint bootstrap
# below has to decide, before any JavaScript module has loaded, whether the
# mirrored value is a theme it should paint or junk it should ignore.
STOREFRONT_THEMES = ["luxe", "trio", "noor", "nakshi", "utsab"]


def _theme_js_list():
    """STOREFRONT_THEMES as a JS array literal for the inline bootstrap."""
    return "[" + ",".join(f"'{t}'" for t in STOREFRONT_THEMES) + "]"


def asset(path):
    """Append a content hash to a local asset URL, so browsers refetch it when
    it changes and cache it forever when it does not.

    Without this every deploy left people looking at yesterday's JavaScript.
    The admin panel is the worst case: a new screen lands in the nav file, the
    browser serves the copy it already has, and the screen appears to be
    missing. That happened, and it reads as a failed deploy rather than a cache.

    Hash of the file's own bytes, not a build timestamp — an unchanged file
    keeps its URL, so a deploy that touches one script does not force every
    visitor to redownload all of them.
    """
    if not path.startswith("/"):
        return path
    full = os.path.join(ROOT, path.lstrip("/"))
    if not os.path.exists(full):
        return path
    with open(full, "rb") as f:
        digest = hashlib.md5(f.read()).hexdigest()[:8]
    return f"{path}?v={digest}"


def _routes():
    """target file -> readable route, read out of .htaccess.

    The rewrite rules are the only place a route is declared, so the canonical
    tags are derived from them rather than restated here. A rule that is
    removed stops being published in the same build.
    """
    try:
        conf = read(".htaccess")
    except OSError:
        return {}
    table = {}
    for pat, target in re.findall(
            r"^\s*RewriteRule\s+\^([a-z0-9/-]+)/\?\$\s+(modules/\S+?\.html)\s+\[", conf, re.M):
        table[target] = "/" + pat
    return table


ROUTES = _routes()


def canonical_for(out):
    """The one address a page should be indexed under.

    Publishing the FILE path would compete with the route the whole site now
    links to — the same page offered to a search engine twice, which is how a
    shop's own pages end up ranking against each other.
    """
    return ROUTES.get(out, "/" + out.lstrip("/"))


def head(title, desc, css_links, theme="#0A0A0A", cms_page=None, luxe=True, canonical=None):
    """`luxe=False` for the admin panel — see scripts() for why the panel does
    not follow the storefront's theme. With no theme.js there to set the
    attribute, the Luxe sheet could only ever be dead weight on those pages.

    `canonical` is the page's own absolute URL. It matters here specifically
    because this shop advertises: every ad link arrives carrying
    ?utm_source=...&utm_campaign=..., and to a search engine each of those is a
    separate URL showing the same page. Without this tag one campaign can split
    a page's ranking across a dozen copies of itself, and the copy that wins
    the search result is the one with a Facebook tracking string in it."""
    extra = "\n  ".join(f'<link rel="stylesheet" href="{asset(c)}">' for c in css_links)
    # Absolute, because a relative canonical resolves against the URL currently
    # being crawled — which is the very thing (?utm_source=…) it exists to
    # point away from.
    canonical_tag = f'  <link rel="canonical" href="{SITE}/{canonical.lstrip("/")}">\n' if canonical else ""
    # Only the BAKED theme's sheets. The other five are not linked at all —
    # see the note by THEME_SHEETS for why, and for what covers a visitor whose
    # published theme is not the one this build baked.
    baked = theme_links(BUILD_THEME) if luxe else []
    luxe_link = (
        THEME_LINK_NOTE
        + "\n  ".join(f"  {tag}" for tag in baked)
        + "\n  "
    ) if baked else ""
    # data-cms-page is what modules/cms keys its overrides on. Absent means the
    # page is not editable, which is the correct default for anything rendered
    # entirely from data — an override there would be overwritten on the next
    # render and look like the edit silently failed.
    cms_attr = f' data-cms-page="{cms_page}"' if cms_page else ""
    # The theme baked into the build. On a deployment WITH a backend this is
    # only the first paint — modules/theme/theme.js corrects it from the API.
    # On a static deployment there is nothing to correct it, so this attribute
    # IS the universal theme: every visitor gets it, identically, and changing
    # it means `python tools/assemble.py --theme luxe` and a deploy. Never set
    # on admin pages (luxe=False), which do not follow the storefront.
    theme_attr = (f' data-theme="{BUILD_THEME}"'
                  if (luxe and BUILD_THEME in STOREFRONT_THEMES) else "")
    return f"""<!DOCTYPE html>
<html lang="en" class="no-js"{cms_attr}{theme_attr}>
<head>
  <meta charset="UTF-8">
  <script>
    /* Removes .no-js before first paint. Everything with [data-reveal] is
       hidden by CSS until IntersectionObserver reveals it — which means with
       JavaScript off it stayed hidden forever, taking the whole Sourcing
       process, the About values and most of the home page with it. Scoping the
       hide to html:not(.no-js) makes the animation an enhancement again
       instead of a precondition for reading the site.
       Inline and first on purpose: a deferred file would let the page paint
       blank before it ran. */
    document.documentElement.classList.remove('no-js');

    /* THEME, BEFORE THE FIRST PAINT.
       The theme is universal — one setting for the whole shop — and the server
       is its authority. But this HTML is static, so a page has to decide what
       to paint before it can ask anything, or a Luxe shop shows a frame of
       Classic on every single navigation.

       `gr:theme` is a MIRROR of the last answer the server gave, written only
       by modules/theme/theme.js after a successful read. So:
         - a mirror exists  -> the visitor has been told the published theme
                               before; paint that, and let theme.js confirm.
         - no mirror        -> leave whatever was baked in at build time, which
                               on a static deployment is the universal theme.

       Both directions matter. A page built as Luxe whose mirror says Classic
       must REMOVE the attribute, not ignore the mirror — otherwise switching
       the shop back would never reach anyone who had already visited.

       THE LIST IS GENERATED, NOT TYPED. This used to read `=== 'luxe'` and
       remove the attribute for everything else, which was correct while Luxe
       was the only non-Classic theme and silently wrong the moment it was not:
       a shop published as Noor, Nakshi or Utsab painted Classic white on every
       single navigation and then flipped once /api/theme resolved. The theme
       still arrived — it just arrived after the flash this block exists to
       prevent, on every page, forever. Interpolating STOREFRONT_THEMES means a
       theme cannot be added without this knowing about it.

       Inline and above the stylesheet on purpose: a deferred script runs after
       the first paint, which is the flash it exists to prevent. */
{_theme_bootstrap_js()}
  </script>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title}</title>
  <meta name="description" content="{desc}">
  <meta name="theme-color" content="{theme}">
  <meta name="author" content="GulfRabit">
  <meta name="robots" content="index, follow">
  <meta name="color-scheme" content="light">
  <!-- Social / Open Graph -->
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="GulfRabit">
  <meta property="og:title" content="{title}">
  <meta property="og:description" content="{desc}">
  <meta property="og:image" content="{SITE}/assets/images/hero/hero-food.svg">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{title}">
  <meta name="twitter:description" content="{desc}">
{canonical_tag}  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="icon" type="image/png" href="/assets/logo/favicon-32.png">
  <link rel="apple-touch-icon" href="/assets/logo/apple-touch-icon.png">
  <link rel="manifest" href="/site.webmanifest">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <!-- Fontshare serves its @font-face CSS from api. and the font FILES from
       cdn. Only the CSS host was preconnected, so the display face waited on a
       fresh DNS + TLS handshake discovered halfway through the render — the
       most expensive moment to find a new origin. -->
  <link rel="preconnect" href="https://api.fontshare.com">
  <link rel="preconnect" href="https://cdn.fontshare.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@500;600;700&family=Cinzel:wght@600;700&family=Noto+Kufi+Arabic:wght@400;600&display=swap" rel="stylesheet">
  <link href="https://api.fontshare.com/v2/css?f[]=clash-display@600,700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="{asset('/shared/css/gulfrabit.css')}">
  {luxe_link}{extra}
  <script type="application/ld+json">
  {{"@context":"https://schema.org","@type":"Organization","name":"GulfRabit","url":"{SITE}","logo":"{SITE}/assets/logo/gulfrabit-logo-dark-bg.jpeg","description":"Premium import marketplace for Bangladesh.","slogan":"Shop Smart. Hop Fast.","areaServed":"BD"}}
  </script>
</head>
<body>"""

def scripts(module_js, theme=True):
    """`module_js` is one path or a list of them.

    `theme=False` for the admin panel. The Appearance screen changes how the
    SHOP looks; the panel is the merchant's tool and must not restyle itself
    under them mid-task — if it did, there would be no way to tell what you
    just did to the storefront from what you just did to the screen you are
    standing on. So the storefront gets modules/theme/theme.js and admin pages
    do not, which leaves [data-theme] unset there and theme-luxe.css inert.

    A page can carry more than one module's script — the PDP is catalog's page
    but the bundle module puts its own block on it. Each entry is a separate
    <script type="module">, in order, so a module is attached to a page by
    adding one line here and detached by deleting it. That is the whole
    coupling: no module reaches into another module's fragment."""
    paths = [] if not module_js else ([module_js] if isinstance(module_js, str) else list(module_js))
    if theme:
        paths = ["/modules/theme/theme.js"] + paths
    js = "".join(f'\n  <script type="module" src="{asset(p)}"></script>' for p in paths)
    return f"""
  <script type="module" src="{asset('/shared/js/main.js')}"></script>{js}
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

# Pages whose IDENTITY lives in the query string, so a canonical written at
# build time would be a lie — and an expensive one.
#
# product.html?id=gr-1101 and product.html?id=gr-1102 are one file. Stamping
# both with `canonical: /modules/catalog/product.html` tells Google that every
# product in the shop is the same page and that the real one is the empty
# shell — which is not a missed opportunity but an instruction to drop the
# entire catalogue from the index. A wrong canonical is worse than none.
#
# These pages set their own at runtime instead, to the clean URL with the
# tracking parameters stripped, which is the duplicate that actually needed
# solving. The permanent fix is a real URL per product; until then this is the
# honest half.
DYNAMIC_CANONICAL = {
    "modules/catalog/product.html",       # ?id=
    "modules/catalog/category.html",      # ?slug=
    "modules/catalog/search-results.html",  # ?q= — never canonical to anything
    "modules/checkout/express.html",      # ?sku=
    "modules/account/track.html",         # ?order=
}


def assemble(out, title, desc, main_html, css_links=None, module_js=None, cms_page=None,
             noindex=False):
    """`cms_page` opts a page into live content editing.

    Both additions are enhancements: cms.js only swaps text the server sent for
    keys the developer marked, and cms-editor.js does nothing without ?edit=1
    AND a staff session the server recognises. A page without a cms_page is
    simply not editable, which is the right default for anything rendered
    entirely from data.

    `noindex` is for storefront pages that must stay out of search. Keeping the
    sitemap and the meta tag in agreement matters: tools/sitemap.py already
    omits these, but omission only means "not submitted" — a crawler that finds
    the URL in an ad, a referrer header or a shared link will index it anyway
    unless the page says otherwise."""
    if cms_page:
        css_links = list(css_links or []) + ["/modules/cms/cms.css"]
        existing = list(module_js) if isinstance(module_js, list) else ([module_js] if module_js else [])
        module_js = existing + ["/modules/cms/cms.js", "/modules/cms/cms-editor.js"]

    page = head(title, desc, css_links or [],
                cms_page=cms_page,
                canonical=None if out in DYNAMIC_CANONICAL else canonical_for(out)) + "\n"
    page += "  <!-- HEADER (inlined from shared/components/header.html) -->\n"
    page += HEADER + "\n\n"
    page += main_html.strip() + "\n\n"
    page += "  <!-- FOOTER (inlined from shared/components/footer.html) -->\n"
    page += FOOTER
    page += scripts(module_js)
    if noindex:
        page = page.replace('<meta name="robots" content="index, follow">',
                            '<meta name="robots" content="noindex, follow">')
    page = relativize(page, out)
    write(out, page)
    print("wrote", out)

# Storefront pages that must carry <meta name="robots" content="noindex">.
# Keep this in step with NOINDEX in tools/sitemap.py — that file decides what
# is submitted, this one decides what is indexed if found another way. Admin
# pages are not listed here; assemble_admin() noindexes all of them already.
STOREFRONT_NOINDEX = {
    # A checkout, meaningless without ?sku=, and an indexed copy would compete
    # with the product page it exists to convert.
    "modules/checkout/express.html",
}

# ---- Admin pages --------------------------------------------------------
# The panel gets its own build path because it must NOT carry the storefront
# header and footer: a staff tool with a shop nav in it invites someone to
# click "Deals" mid-task, and the announcement bar is meaningless here. The
# sidebar chrome lives in modules/admin/_fragments/ so it stays inside the
# module that owns it.
# Loaded on EVERY admin page so the sidebar is identical everywhere. Each
# module that contributes screens adds its own nav file here — one line in, one
# line out. Page logic still loads only on its own page.
ADMIN_NAV = [
    "/modules/admin/admin-nav.js",
    "/modules/courier/courier-nav.js",
    "/modules/inventory/inventory-nav.js",
    "/modules/media/media-nav.js",
    "/modules/hero/hero-nav.js",
    "/modules/highlights/highlights-nav.js",
    "/modules/marketing/marketing-nav.js",
    "/modules/accounting/accounting-nav.js",
    "/modules/b2b/b2b-nav.js",
    "/modules/theme/theme-nav.js",
]

ADMIN_SHELL = read("modules/admin/_fragments/_shell.html")
ADMIN_SHELL_END = read("modules/admin/_fragments/_shell-end.html")

def assemble_admin(out, title, main_html, css_links, module_js, chrome=True):
    """`chrome=False` for the login page, which must render without the shell —
    it is the one admin page a signed-out person is supposed to reach."""
    # No canonical on the panel: these pages are noindex and disallowed in
    # robots.txt, and a canonical is an instruction to an indexer that has
    # already been told not to be here.
    page = head(title, "GulfRabit staff panel.", css_links, theme="#0A0A0A", luxe=False) + "\n"
    # noindex on every admin page, belt and braces with robots.txt: these pages
    # carry no data, but they should never turn up in a search result either.
    page = page.replace('<meta name="robots" content="index, follow">',
                        '<meta name="robots" content="noindex, nofollow">')
    if chrome:
        page += ADMIN_SHELL + "\n" + main_html.strip() + "\n" + ADMIN_SHELL_END
    else:
        page += main_html.strip() + "\n"
    page += scripts(module_js, theme=False)
    write(out, relativize(page, out))
    print("wrote", out)


ADMIN_PAGES = [
    ("modules/admin/index.html", "Dashboard — GulfRabit Admin",
     "modules/admin/_fragments/dashboard.main.html",
     ["/modules/admin/admin.css"],
     ["/modules/admin/admin-shell.js", "/modules/admin/dashboard-page.js"], True),

    ("modules/admin/orders.html", "Orders — GulfRabit Admin",
     "modules/admin/_fragments/orders.main.html",
     ["/modules/admin/admin.css"],
     ["/modules/admin/admin-shell.js", "/modules/admin/orders-page.js"], True),

    ("modules/admin/order.html", "Order — GulfRabit Admin",
     "modules/admin/_fragments/order.main.html",
     ["/modules/admin/admin.css"],
     # The courier and SMS modules mount their own sections onto this screen.
     # Delete either module folder and its entry here and the section is gone,
     # with no orphan markup left in admin's fragment.
     ["/modules/admin/admin-shell.js", "/modules/admin/order-detail-page.js",
      "/modules/courier/courier-order-panel.js",
      "/modules/sms/sms-order-panel.js"], True),

    ("modules/admin/customers.html", "Customers — GulfRabit Admin",
     "modules/admin/_fragments/customers.main.html",
     ["/modules/admin/admin.css"],
     ["/modules/admin/admin-shell.js", "/modules/admin/customers-page.js"], True),

    ("modules/admin/customer.html", "Customer — GulfRabit Admin",
     "modules/admin/_fragments/customer.main.html",
     ["/modules/admin/admin.css"],
     ["/modules/admin/admin-shell.js", "/modules/admin/customer-detail-page.js"], True),

    ("modules/courier/couriers.html", "Couriers — GulfRabit Admin",
     "modules/courier/_fragments/couriers.main.html",
     ["/modules/admin/admin.css"],
     ["/modules/admin/admin-shell.js", "/modules/courier/couriers-page.js"], True),

    ("modules/admin/categories.html", "Categories — GulfRabit Admin",
     "modules/admin/_fragments/categories.main.html",
     ["/modules/admin/admin.css", "/modules/media/media.css"],
     ["/modules/admin/admin-shell.js", "/modules/admin/categories-page.js"], True),

    ("modules/admin/coupons.html", "Coupons & offers — GulfRabit Admin",
     "modules/admin/_fragments/coupons.main.html",
     ["/modules/admin/admin.css", "/modules/media/media.css"],
     ["/modules/admin/admin-shell.js", "/modules/admin/coupons-page.js"], True),

    ("modules/theme/appearance.html", "Appearance — GulfRabit Admin",
     "modules/theme/_fragments/theme.main.html",
     ["/modules/admin/admin.css", "/modules/theme/theme-admin.css"],
     ["/modules/admin/admin-shell.js", "/modules/theme/theme-page.js"], True),

    ("modules/hero/hero.html", "Hero banners — GulfRabit Admin",
     "modules/hero/_fragments/hero.main.html",
     ["/modules/admin/admin.css"],
     ["/modules/admin/admin-shell.js", "/modules/hero/hero-page.js"], True),

    ("modules/highlights/highlights.html", "Home page — GulfRabit Admin",
     "modules/highlights/_fragments/highlights.main.html",
     ["/modules/admin/admin.css", "/modules/highlights/highlights.css"],
     ["/modules/admin/admin-shell.js", "/modules/highlights/highlights-page.js"], True),

    ("modules/marketing/campaigns.html", "Campaigns — GulfRabit Admin",
     "modules/marketing/_fragments/campaigns.main.html",
     ["/modules/admin/admin.css"],
     ["/modules/admin/admin-shell.js", "/modules/marketing/campaigns-page.js"], True),

    ("modules/media/library.html", "Images — GulfRabit Admin",
     "modules/media/_fragments/library.main.html",
     ["/modules/admin/admin.css", "/modules/media/media.css"],
     ["/modules/admin/admin-shell.js", "/modules/media/library-page.js"], True),

    ("modules/admin/products.html", "Products — GulfRabit Admin",
     "modules/admin/_fragments/products.main.html",
     ["/modules/admin/admin.css", "/modules/media/media.css"],
     ["/modules/admin/admin-shell.js", "/modules/admin/products-page.js"], True),

    ("modules/admin/product-edit.html", "Edit product — GulfRabit Admin",
     "modules/admin/_fragments/product-edit.main.html",
     ["/modules/admin/admin.css", "/modules/media/media.css"],
     ["/modules/admin/admin-shell.js", "/modules/admin/product-edit-page.js"], True),

    ("modules/inventory/stock.html", "Stock — GulfRabit Admin",
     "modules/inventory/_fragments/stock.main.html",
     ["/modules/admin/admin.css"],
     ["/modules/admin/admin-shell.js", "/modules/inventory/stock-page.js"], True),

    ("modules/inventory/movements.html", "Stock movements — GulfRabit Admin",
     "modules/inventory/_fragments/movements.main.html",
     ["/modules/admin/admin.css"],
     ["/modules/admin/admin-shell.js", "/modules/inventory/movements-page.js"], True),

    ("modules/b2b/quotes.html", "Quote requests — GulfRabit Admin",
     "modules/b2b/_fragments/quotes.main.html",
     ["/modules/admin/admin.css"],
     ["/modules/admin/admin-shell.js", "/modules/b2b/quotes-page.js"], True),

    ("modules/accounting/pnl.html", "Profit & loss — GulfRabit Admin",
     "modules/accounting/_fragments/pnl.main.html",
     ["/modules/admin/admin.css"],
     ["/modules/admin/admin-shell.js", "/modules/accounting/pnl-page.js"], True),

    ("modules/accounting/journal.html", "Journal — GulfRabit Admin",
     "modules/accounting/_fragments/journal.main.html",
     ["/modules/admin/admin.css"],
     ["/modules/admin/admin-shell.js", "/modules/accounting/journal-page.js"], True),

    # chrome=True, even though the sidebar is useless on a sheet of paper.
    #
    # The shell is not decoration: boot() returns early when [data-admin-shell]
    # is absent, so a chrome-less page never dispatches admin:ready and no
    # screen script ever runs. It is also what checks the session and sends a
    # signed-out visitor to the login page. Built without it, this page loaded
    # its toolbar and then sat on "Loading…" forever.
    #
    # The sidebar is removed at PRINT time instead — see the @media print block
    # in slip.css, which is where a paper-only concern belongs.
    ("modules/admin/slip.html", "Packing slip — GulfRabit Admin",
     "modules/admin/_fragments/slip.main.html",
     ["/modules/admin/admin.css", "/modules/admin/slip.css"],
     ["/modules/admin/admin-shell.js", "/modules/admin/slip-page.js"], True),

    ("modules/admin/login.html", "Staff sign-in — GulfRabit Admin",
     "modules/admin/_fragments/login.main.html",
     ["/modules/admin/admin.css"],
     ["/modules/admin/login-page.js"], False),
]

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
     # bundle and cart both ride along on this page and mount their own
     # sections. Delete a module's pair of entries and its folder, and that
     # section is gone with nothing left behind in catalog's fragment.
     ["/modules/catalog/catalog.css", "/modules/bundle/bundle.css", "/modules/cart/pdp-offers.css"],
     ["/modules/catalog/product-page.js", "/modules/bundle/bundle.js", "/modules/cart/pdp-offers.js"]),

    ("modules/catalog/search-results.html",
     "Search — GulfRabit",
     "Search results across GulfRabit's imported catalog.",
     "modules/catalog/_fragments/search.main.html",
     ["/modules/catalog/catalog.css"], "/modules/catalog/search-page.js"),

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

    # Landing page for paid social. checkout.css first — express.css borrows
    # .option-card from it and overrides the layout around it.
    ("modules/checkout/express.html",
     "Complete your order — GulfRabit",
     "Confirm your GulfRabit order in one step — cash on delivery available.",
     "modules/checkout/_fragments/express.main.html",
     ["/modules/checkout/checkout.css", "/modules/checkout/express.css"],
     "/modules/checkout/express-page.js"),

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
     ["/modules/content/content.css"], None, "about"),

    ("modules/content/sourcing.html",
     "Sourcing & Authenticity — GulfRabit",
     "What import-verified means at GulfRabit: how we buy, what you can check yourself, and what we do not claim.",
     "modules/content/_fragments/sourcing.main.html",
     ["/modules/content/content.css"], None, "sourcing"),

    ("modules/content/contact.html",
     "Contact — GulfRabit",
     "Get in touch with GulfRabit support.",
     "modules/content/_fragments/contact.main.html",
     ["/modules/content/content.css"], "/modules/content/contact-page.js", "contact"),

    ("modules/content/faq.html",
     "FAQ — GulfRabit",
     "Answers to common questions about GulfRabit.",
     "modules/content/_fragments/faq.main.html",
     ["/modules/content/content.css"], "/modules/content/faq-page.js", "faq"),

    ("modules/content/shipping-returns.html",
     "Shipping & Returns — GulfRabit",
     "GulfRabit shipping, delivery and returns policy.",
     "modules/content/_fragments/shipping.main.html",
     ["/modules/content/content.css"], None, "shipping"),

    ("modules/content/privacy.html",
     "Privacy Policy — GulfRabit",
     "What GulfRabit collects, why, and who else sees it — including advertising measurement.",
     "modules/content/_fragments/privacy.main.html",
     ["/modules/content/content.css"], None, "privacy"),

    ("modules/content/terms.html",
     "Terms & Conditions — GulfRabit",
     "The terms you buy under: orders, prices, delivery, returns and refunds.",
     "modules/content/_fragments/terms.main.html",
     ["/modules/content/content.css"], None, "terms"),

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

    ("modules/deals/deals.html",
     "Deals & Offers — GulfRabit",
     "Verified imports on offer — GulfRabit deals and markdowns.",
     "modules/deals/_fragments/deals.main.html",
     ["/modules/deals/deals.css"], "/modules/deals/deals-page.js"),

    ("modules/b2b/b2b-industrial.html",
     "Industrial & B2B — GulfRabit",
     "Raw materials for the electronics industry: PCBs, switches, relays, sensors, polymers. Bulk pricing and RFQ.",
     "modules/b2b/_fragments/b2b.main.html",
     ["/modules/b2b/b2b.css"], "/modules/b2b/b2b-page.js"),
]

def rebase_urls(css, from_dir):
    """Fix relative url() when a partial is inlined into a file one level up.

    THIS IS THE ONLY THING THAT MAKES BUNDLING UNSAFE, and it fails silently.
    `_fonts.css` lives in shared/css/partials/ and carries

        url('../../../assets/fonts/noto-sans-bengali-variable.woff2')

    which resolves correctly from there and one directory too high from
    shared/css/gulfrabit.css. The font 404s, Bengali text falls back to a
    system face, and nothing anywhere reports an error — on a Bangladeshi
    shop, that is not a small regression.

    Each relative URL is resolved against the partial's own directory and
    rewritten relative to shared/css/. Absolute, data: and http(s) URLs are
    left alone, as are SVG fragment references like url(#gradient).
    """
    if not from_dir:
        return css

    def fix(match):
        quote, target = match.group(1), match.group(2)

        if target.startswith(("/", "#", "data:", "http:", "https:")):
            return match.group(0)

        # posixpath, not os.path: this is a URL, and a Windows build must not
        # emit backslashes into a stylesheet.
        resolved = posixpath.normpath(posixpath.join(from_dir, target))

        return f"url({quote}{resolved}{quote})"

    return re.sub(r'url\((["\']?)([^"\')]+)\1\)', fix, css)


def bundle_css():
    """Flatten shared/css/style.css and its @imports into one file.

    WHY. `@import` inside a stylesheet is the slowest way to load CSS there is.
    The browser must download style.css, parse it, discover ten imports it did
    not know about, and only then start fetching them — two round trips before
    a single rule from _variables.css exists, with the page blocked on all of
    it. Eleven requests, ~65 KB, serialised. On a 3G connection in Dhaka that
    is most of a second of white screen.

    Concatenating costs nothing at runtime and changes no rule.

    THE CASCADE IS PRESERVED EXACTLY, which is the only thing that could go
    wrong here. `@import` is required to appear before any other rule, so the
    authored order is: every import in sequence, then style.css's own rules.
    The bundle is written in that same order — imports expanded in place, then
    the remainder of the file with the @import lines removed.

    The partials stay the source of truth; authoring stays modular. This is a
    build step, like the pages themselves.
    """
    master = read("shared/css/style.css")

    imports = re.findall(r'@import\s+url\("([^"]+)"\);', master)
    body = re.sub(r'@import\s+url\("[^"]+"\);\n?', "", master)

    parts = [
        "/* GENERATED by tools/assemble.py — do not edit.\n"
        "   Source: shared/css/style.css and the partials it imports.\n"
        "   Edit those; this file is rebuilt on every run. */\n"
    ]

    for rel in imports:
        path = os.path.join("shared/css", rel)
        parts.append(f"\n/* ===== {rel} ===== */\n")
        parts.append(rebase_urls(read(path), os.path.dirname(rel)))

    parts.append("\n/* ===== style.css (own rules) ===== */\n")
    parts.append(body)

    write("shared/css/gulfrabit.css", "".join(parts))

    return len(imports) + 1


def sync_index_theme():
    """Keep the hand-authored home page's theming in step with the build.

    index.html is not built from a fragment, so it is the one page every
    theme-wide change would otherwise miss — and it is the page most visitors
    land on. A shop whose home page is Classic and whose every other page is
    Luxe is not a theme, it is a bug, so this is not optional polish.

    Two things are synced, and the second was the expensive one to learn:

      the ATTRIBUTE  — <html data-theme>, so --theme reaches the home page.

      the STYLESHEET LINKS — rewritten wholesale from THEME_SHEETS. They used
      to be typed by hand here, which meant a new theme could be registered in
      all six of its normal places, ship, and still be invisible on the home
      page: the attribute was set, the conductor built its entire scene, and
      not one rule existed to style any of it. The page rendered as Classic
      and looked, convincingly, like nothing had been built at all.
      Regenerating the block removes the possibility.

    The links also gain the same ?v= content hash every other page's assets
    carry. index.html had none, so the busiest page in the shop was the one
    page that could serve a stale cached theme after a deploy.

    Idempotent: running twice changes nothing.
    """
    path = os.path.join(ROOT, "index.html")
    with open(path, encoding="utf-8") as f:
        html = f.read()

    want = f' data-theme="{BUILD_THEME}"' if BUILD_THEME in STOREFRONT_THEMES else ""
    new = re.sub(r'(<html\b[^>]*?)(?:\s+data-theme="[^"]*")?(\s*>)',
                 lambda m: m.group(1) + want + m.group(2), html, count=1)

    # index.html sits at the root, so its hrefs are relative with no "../".
    #
    # ONE theme's sheets, matching what head() writes for every other page. If
    # the build bakes Classic there is no link at all, so the block is removed
    # rather than left holding six sheets nothing can reach.
    tags = theme_links(BUILD_THEME, relative=True)
    block = ("  " + "\n  ".join(tags) + "\n") if tags else ""

    new, hits = re.subn(
        r'(?:[ \t]*<link rel="stylesheet" href="modules/theme/theme-[^"]*">[ \t]*\r?\n)+',
        lambda _m: block,
        new,
        count=1,
    )

    # NOTHING TO REPLACE IS THE NORMAL CASE NOW, not a failure.
    #
    # A Classic build writes no theme link at all, so the next build — for a
    # theme that does need one — finds no block to swap and has to know where
    # to put it. Anchoring on the base stylesheet works because every theme
    # sheet must come after it in the cascade, which is the same order head()
    # writes for every other page.
    if not hits and tags:
        new, hits = re.subn(
            r'([ \t]*<link rel="stylesheet" href="shared/css/gulfrabit\.css[^"]*">[ \t]*\r?\n)',
            lambda m: m.group(1) + block,
            new,
            count=1,
        )

    if not hits and tags:
        # Loud, because silence here is exactly the failure this function
        # exists to prevent: the home page would keep whatever links it has
        # and quietly diverge from every other page in the shop.
        print("WARNING: index.html has nowhere to put the theme stylesheet — "
              "the home page will not follow new themes")

    # THE PRE-PAINT BOOTSTRAP, from the same function head() uses.
    #
    # This is the half that used to be missed. The links could be regenerated
    # perfectly and the home page would still be wrong, because the block that
    # reads the mirror — and now the block that injects the sheet for a theme
    # this build did not bake — was a hand-typed copy sitting in index.html.
    # A copy kept in step by hand is a copy that goes stale, on the page most
    # visitors land on.
    new, boot_hits = re.subn(
        r"try \{\s*\n\s*var t = localStorage\.getItem\('gr:theme'\);"
        r".*?"
        r"catch \(e\) \{ /\* private mode[^}]*\}",
        lambda _m: _theme_bootstrap_js(),
        new,
        count=1,
        flags=re.S,
    )
    if not boot_hits:
        print("WARNING: index.html has no theme bootstrap to sync — the home "
              "page will flash the wrong theme when one is published")

    if new != html:
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            f.write(new)
        print(f"index.html: theme -> {BUILD_THEME}, {len(tags)} theme sheet(s) linked")


if __name__ == "__main__":
    # --theme bakes the storefront theme into every page. It exists for
    # deployments with no backend, where there is no server to hold a universal
    # setting and the build is therefore the only thing every visitor shares.
    # With a backend running, the API overrides this on load and the flag only
    # decides what the first paint looks like.
    import argparse

    _ap = argparse.ArgumentParser(description="Assemble GulfRabit's static pages.")
    # Derived from STOREFRONT_THEMES rather than typed, for the reason the
    # pre-paint bootstrap was wrong for three themes: a hand-kept copy of a
    # list is a list that goes stale silently. Without this, --theme nakshi was
    # rejected outright and a static deployment could not ship the new themes
    # at all.
    _ap.add_argument("--theme", choices=["classic", *STOREFRONT_THEMES], default="classic",
                     help="storefront theme to build in (default: classic)")
    # --theme-from matters more now than it would have before.
    #
    # A page links only the theme it was BUILT with. So a build that guesses
    # Classic while the shop publishes Trio makes every FIRST-time visitor —
    # the ones with no mirror for the bootstrap to read — paint Classic, wait
    # for /api/theme, then fetch a stylesheet and flip. That is precisely the
    # flash the whole mechanism exists to prevent, aimed at the visitors who
    # have never seen the shop before.
    #
    # The server already knows the answer, so the build asks it rather than
    # relying on someone remembering a flag. Unreachable, slow, or answering
    # something this build has never heard of all fall back to --theme, which
    # is the old behaviour: a deploy must not fail because a decoration
    # endpoint is down.
    _ap.add_argument("--theme-from", metavar="URL",
                     help="read the published theme from a URL returning "
                          '{"data":{"theme":"…"}}; falls back to --theme')

    _args = _ap.parse_args()
    BUILD_THEME = _args.theme                     # noqa: F811 — overrides the module default

    if _args.theme_from:
        import json as _json
        import urllib.request as _url

        try:
            with _url.urlopen(_args.theme_from, timeout=10) as _r:
                _published = (_json.load(_r).get("data") or {}).get("theme")
        except Exception as _e:                    # noqa: BLE001 — any failure is the same failure
            _published = None
            print(f"could not read the published theme ({_e}); building {BUILD_THEME}")

        if _published in ("classic", *STOREFRONT_THEMES):
            BUILD_THEME = _published
            print(f"published theme is {BUILD_THEME}")
        elif _published is not None:
            print(f"ignoring unknown published theme {_published!r}; building {BUILD_THEME}")

    if BUILD_THEME != "classic":
        print(f"building storefront with the {BUILD_THEME} theme")

    sheets = bundle_css()
    print(f"bundled {sheets} stylesheets -> shared/css/gulfrabit.css")

    sync_index_theme()

    for path in STOREFRONT_NOINDEX:
        if not any(p[0] == path for p in PAGES):
            print(f"WARNING: STOREFRONT_NOINDEX lists {path}, which PAGES does not build")

    built = 0
    for out, title, desc, frag, css, mjs, *rest in PAGES:
        fp = os.path.join(ROOT, frag)
        if not os.path.exists(fp):
            print("SKIP (no fragment yet):", frag)
            continue
        assemble(out, title, desc, read(frag), css, mjs,
                 cms_page=(rest[0] if rest else None),
                 noindex=(out in STOREFRONT_NOINDEX))
        built += 1

    for out, title, frag, css, ajs, chrome in ADMIN_PAGES:
        fp = os.path.join(ROOT, frag)
        if not os.path.exists(fp):
            print("SKIP (no fragment yet):", frag)
            continue
        # Shell first, then every module's nav registration, then this page's
        # own logic — registerScreen must have run before the shell paints.
        scripts_for_page = ajs[:1] + ADMIN_NAV + ajs[1:] if chrome else ajs
        assemble_admin(out, title, read(frag), css, scripts_for_page, chrome)
        built += 1

    print(f"done — {built} page(s) assembled")
