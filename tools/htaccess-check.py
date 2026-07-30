"""Simulate the root .htaccess RedirectMatch rules against real repo paths.

Apache is not available here, so this only checks the regexes — but the whole
point is that a wrong pattern silently 404s files the browser needs, and that
would not be discovered until the site was live.
"""
import re, pathlib, sys

sys.stdout.reconfigure(encoding='utf-8')

RULES = [
    r'^/(app|bootstrap|config|database|storage|vendor|tools|research)/',
    r'^/modules/[^/]+/backend/(?!api\.js$).*$',
    r'^/modules/[^/]+/_fragments/',
    r'^/(composer\.(json|lock)|artisan|phpunit\.xml|context\.md|BACKEND\.md)$',
]
COMPILED = [re.compile(r) for r in RULES]

def blocked(path: str) -> bool:
    return any(c.search('/' + path) for c in COMPILED)

# Paths the BROWSER must be able to fetch. Any block here is a live-site outage.
must_allow = [
    'index.html',
    'modules/catalog/product.html',
    'modules/catalog/backend/api.js',
    'modules/delivery/backend/api.js',
    'modules/cart/backend/api.js',
    'modules/catalog/data/products.json',
    'modules/catalog/data/categories.json',
    'modules/delivery/data/districts.json',
    'modules/account/data/orders.json',
    'modules/auth/data/users.json',
    'shared/css/gulfrabit.css',   # the built bundle every page links
    'shared/css/partials/_variables.css',  # still fetched by tools/font-test.html
    'shared/js/core/json-cache.js',
    'assets/images/products/gr-1001.svg',
    'sitemap.xml',
    'robots.txt',
]

# Paths that must NOT be publicly fetchable.
must_block = [
    'modules/catalog/backend/Models/Product.php',
    'modules/cart/backend/Controllers/CartController.php',
    'modules/delivery/backend/endpoints.md',
    'modules/delivery/backend/routes.php',
    'modules/catalog/_fragments/product.main.html',
    'app/Models/User.php',
    'bootstrap/providers.php',
    'database/migrations/0001_01_01_000000_create_users_table.php',
    'vendor/autoload.php',
    'storage/logs/laravel.log',
    'composer.json',
    'artisan',
    'context.md',
    'BACKEND.md',
    'tools/qa-viewport.html',
]

# Headers the file must still be setting. Not a test of Apache's behaviour —
# it is a test that nobody edited them away. Each one was added for a reason
# and their absence is silent: the site works perfectly without a CSP, right
# up until it does not.
REQUIRED_HEADERS = {
    'X-Content-Type-Options':        'MIME sniffing turns a .webp holding HTML into stored XSS',
    'X-Frame-Options':               'clickjacking on the admin panel',
    'Referrer-Policy':               'leaks order URLs to third parties',
    'Permissions-Policy':            'camera/mic/geolocation on a shop that needs none',
    'Strict-Transport-Security':     'first request of a session in cleartext',
    'Content-Security-Policy':       'restricts where scripts may be loaded from',
    'Cross-Origin-Opener-Policy':    'cross-window attacks from popups',
    'X-Permitted-Cross-Domain-Policies': 'a crossdomain.xml in the media library',
}

# Directives the CSP must keep. These are the ones doing real work — see the
# note in .htaccess about what the policy does and does not buy.
REQUIRED_CSP = ['form-action', 'base-uri', 'object-src', 'frame-ancestors', 'default-src']

htaccess = (pathlib.Path(__file__).resolve().parent.parent / '.htaccess').read_text(encoding='utf-8')

fails = 0

print('  SECURITY HEADERS:')
for header, why in REQUIRED_HEADERS.items():
    # Must be set, and not commented out.
    present = any(
        header in line and line.strip().startswith('Header')
        for line in htaccess.splitlines()
    )
    if not present:
        fails += 1
    print(f'   {"MISSING - " + why if not present else "ok           "}  {header}')

print()
print('  CSP DIRECTIVES:')
csp_line = next((l for l in htaccess.splitlines()
                 if 'Content-Security-Policy' in l and l.strip().startswith('Header')), '')
for directive in REQUIRED_CSP:
    present = directive in csp_line
    if not present:
        fails += 1
    print(f'   {"MISSING - BUG" if not present else "ok           "}  {directive}')

print()
print('  MUST BE REACHABLE:')
for p in must_allow:
    bad = blocked(p)
    if bad:
        fails += 1
    print(f'   {"BLOCKED - BUG" if bad else "ok           "}  {p}')

print()
print('  MUST BE BLOCKED:')
for p in must_block:
    bad = not blocked(p)
    if bad:
        fails += 1
    print(f'   {"REACHABLE - BUG" if bad else "blocked        "}  {p}')

print()
print(f'  failures: {fails}')
sys.exit(1 if fails else 0)
