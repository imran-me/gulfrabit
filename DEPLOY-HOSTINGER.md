# Deploying to Hostinger

Purpose: get **PHP running** so the Laravel modules can actually be developed
and tested. GitHub Pages serves static files only, which is why nothing under
`modules/*/backend/*.php` has ever executed.

> **Read this first.** No PHP in this repo has been run — not one migration, not
> one route. Treat the first deploy as the real first run and expect to fix
> things. Nothing below is verified; it is the correct *shape*, carefully
> written, and the failure modes worth knowing are called out as you go.

---

## What you need

- A Hostinger plan with **SSH access** (Premium/Business — Single usually lacks it).
  Without SSH there is no Composer, and Laravel cannot be installed properly.
- **PHP 8.4** — set it in hPanel → *Advanced* → *PHP Configuration*.
- A **MySQL database** — hPanel → *Databases* → *Management*. Note the generated
  name, user and password; Hostinger prefixes them with `uXXXXXXXX_`.

---

## 1. Get the code onto the server

```bash
ssh -p 65002 uXXXXXXXX@your-server-ip     # port + host are shown in hPanel

cd ~/domains/yourdomain.com
rm -rf public_html                        # empty by default; skip if you have files
git clone https://github.com/imran-me/gulfrabit.git public_html
cd public_html
```

---

## 2. Install the Laravel framework

This repo carries the **application** (`app/`, `bootstrap/`, `routes/`,
`database/`, `public/index.php`, `artisan`, `composer.json`) but **not** the
framework itself — `vendor/` is gitignored, as it should be.

```bash
composer --version                        # if missing: see "Composer" below
composer install --no-dev --optimize-autoloader
```

> **This is the step most likely to fail**, because `composer.json` pins
> `php ^8.4`. If Composer reports a platform mismatch, the CLI PHP version is
> not the one you set in hPanel. Check with `php -v`, and if it differs use
> Hostinger's versioned binary, e.g. `/usr/bin/php8.4 /usr/local/bin/composer install`.

### Composer, if it is not installed

```bash
curl -sS https://getcomposer.org/installer | php
mkdir -p ~/bin && mv composer.phar ~/bin/composer
echo 'export PATH="$HOME/bin:$PATH"' >> ~/.bashrc && source ~/.bashrc
```

---

## 3. Environment

```bash
cp .env.example .env
php artisan key:generate
nano .env
```

Set at minimum:

```
APP_ENV=production
APP_DEBUG=false          # true leaks stack traces publicly — never leave it on
APP_URL=https://yourdomain.com

DB_HOST=localhost        # Hostinger, not 127.0.0.1
DB_DATABASE=uXXXXXXXX_gulfrabit
DB_USERNAME=uXXXXXXXX_gulfrabit
DB_PASSWORD=...
```

While you are still *developing* rather than serving customers, `APP_DEBUG=true`
is far more useful — just do not forget it is on.

---

## 4. Schema and reference data

```bash
php artisan migrate
php artisan db:seed
```

`migrate` picks up **every module's migrations** automatically — each module's
service provider registers its own `Migrations/` folder, so there is no central
migrations list to maintain.

Order matters and is handled by filename: `0001_01_01_000000_create_users_table`
runs first because `carts` and `orders` both have a foreign key to `users`.

`db:seed` runs `DatabaseSeeder`, which calls the module seeders in dependency
order: delivery zones + 64 districts → categories + 44 products → promo codes.
Each reads the same JSON the storefront reads, so the seeded database and the
mock frontend cannot drift.

---

## 5. Permissions

```bash
chmod -R 775 storage bootstrap/cache
```

Skipping this produces a blank white page and a permission error in
`storage/logs/laravel.log` — the single most common Laravel deploy failure.

---

## 6. Document root — read this, it is not the usual Laravel setup

**Point the document root at the repo root** (i.e. clone the repo *as*
`public_html`, which step 1 does). Do **not** point it at `public/`.

That is deliberate, and it is the opposite of standard Laravel advice:

- The **storefront is a static site at the repo root** — `index.html`,
  `modules/`, `shared/`, `assets/`. Apache serves those files directly.
- **Laravel is only the JSON API.** The root `.htaccess` sends `/api/*` (and
  `/up`) to `public/index.php`; everything else is served as a static file.

A normal Laravel deploy blanket-rewrites every request into `public/`. Doing
that here would **404 the entire storefront**, because there is no `index.html`
inside `public/`. Only the API would work, and the site would look completely
broken. I built it that way first and caught it before it shipped.

### The blocking rules are load-bearing — do not "simplify" them

Because the app root is the web root, the `RedirectMatch` rules are what keep
`app/`, `vendor/`, `storage/`, `.env` and the module PHP off the public web.

`modules/` is **not** purely server-side. Each module's `backend/api.js` is the
frontend data seam and is imported by the browser, so the rule uses a negative
lookahead rather than denying the folder:

```apache
RedirectMatch 404 ^/modules/[^/]+/backend/(?!api\.js$).*$
```

`modules/*/data/*.json` must stay reachable too — the storefront fetches those
directly until the API is live.

Both directions are asserted by:

```bash
python tools/htaccess-check.py
```

Run it after any `.htaccess` edit. It fails loudly if a frontend file becomes
unreachable or a PHP file becomes reachable.

---

## 7. Verify

```bash
php artisan about                 # framework + module providers loaded
php artisan route:list --path=api # every module route
```

Expect routes under `/api/catalog`, `/api/cart`, `/api/delivery`, `/api/orders`.
**If `route:list` is empty**, the module providers are not registered — check
`bootstrap/providers.php` and re-run `composer dump-autoload`.

Then, in a browser:

| URL | Expect |
|---|---|
| `https://yourdomain.com/` | the storefront homepage |
| `/api/delivery/options` | three zones at 70 / 130 / 150 |
| `/api/delivery/districts` | 64 districts in 8 divisions |
| `/api/catalog/products?perPage=3` | 3 products + `meta` |
| `/api/catalog/categories` | 9 categories |
| `/api/cart` | an empty cart and a `gr_cart` cookie |

```bash
curl -X POST https://yourdomain.com/api/delivery/quote \
     -H 'Content-Type: application/json' -d '{"district":"coxs-bazar"}'
# {"data":{"id":"nationwide","label":"Rest of Bangladesh","eta":"4 working days","cost":130}}
```

---

## Problems you should expect on the first run

These are the ones I would bet on, given nothing has executed:

| Symptom | Likely cause |
|---|---|
| Blank white page | `storage/` permissions — check `storage/logs/laravel.log` |
| `500` on every `/api/*` route | the `api` middleware group missing. `bootstrap/app.php` enables it via `api: routes/api.php`; if it was edited out, module routes have nothing to attach to |
| `Class Modules\...\X not found` | `composer dump-autoload` not run after adding a module |
| `route:list` empty | provider missing from `bootstrap/providers.php` |
| Migration fails on a foreign key | a module migration ran before `users` — check the `0001_01_01` prefix survived |
| `Target class [...] does not exist` | a service not bound; check the module's `ServiceProvider::register()` |
| The storefront loads but products do not | `modules/catalog/data/*.json` is being 404'd by `.htaccess` |

---

## Updating after the first deploy

```bash
cd ~/domains/yourdomain.com/public_html
git pull
composer install --no-dev --optimize-autoloader
php artisan migrate
php artisan config:cache && php artisan route:cache
```

Run `php artisan config:clear && php artisan route:clear` if a change seems not
to take effect — cached config surviving a deploy is a classic time-waster.

> Note: module routes are skipped when routes are cached (`routesAreCached()`),
> which is correct and intentional — the cache already contains them. If you add
> a module and its routes do not appear, clear the route cache.
