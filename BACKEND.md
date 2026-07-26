# GulfRabit — backend setup

The Laravel layer, and how the module architecture fits together.

> **Status, stated plainly:** `php`, `composer`, `node` and `npm` are **not
> installed** on the machine this was authored on. Every PHP file in this repo is
> written and reviewed by eye but has **never been executed** — no migration has
> run, no route has been hit, no test has passed. Treat the first `composer
> install` as the real first run, and expect to fix things.
>
> The **frontend is fully working and verified** — it runs today on mock JSON via
> each module's `backend/api.js`.

---

## The idea in one paragraph

The storefront is a static, content-first HTML site. Laravel sits behind it as a
JSON API. Neither is a monolith: **every feature is one folder** under `modules/`
containing its markup, styles, JS *and* its Laravel controllers, models,
migrations and routes. A module registers itself through its own service
provider, so adding or deleting a feature touches three lines outside its folder
— never a shared routes file, never a shared migrations directory.

See `context.md` §2 for the rule, and `modules/delivery/` for the reference
implementation.

---

## Install

Nothing here has been run. This is the intended sequence.

```bash
# 1. Toolchain (Windows: use the PHP 8.4 x64 thread-safe build, add to PATH)
php -v          # expect 8.4+
composer -V

# 2. Scaffold the Laravel host INTO this repo.
#    Do NOT create-project over the top — it would clobber the storefront.
#    Pull the framework skeleton into a temp dir and copy the app plumbing in:
composer create-project laravel/laravel _laravel-skeleton "^12.0"
#    then copy across: app/ config/ database/ routes/ storage/ tests/
#    artisan, phpunit.xml, .env.example
#    KEEP this repo's composer.json and bootstrap/providers.php — they carry the
#    module wiring and the skeleton's versions do not.
rm -rf _laravel-skeleton

# 3. Wire the modules up
composer install
composer dump-autoload

# 4. Environment
cp .env.example .env
php artisan key:generate
#    set DB_DATABASE=gulfrabit and the MySQL credentials in .env

# 5. Schema + reference data
php artisan migrate                              # picks up modules/*/backend/Migrations
php artisan db:seed --class="Modules\\Delivery\\Seeders\\DeliveryZoneSeeder"

# 6. Run
php artisan serve
```

Verify the delivery module is live:

```bash
curl http://127.0.0.1:8000/api/delivery/options
curl http://127.0.0.1:8000/api/delivery/districts
curl -X POST http://127.0.0.1:8000/api/delivery/quote \
     -H 'Content-Type: application/json' -d '{"district":"coxs-bazar"}'
# expect: {"data":{"id":"nationwide","label":"Rest of Bangladesh","eta":"4 working days","cost":130}}
```

---

## Adding a module

Copy the shape of `modules/delivery/backend/`, then three lines outside the folder:

1. **`composer.json`** → add `"Modules\\Yourfeature\\": "modules/yourfeature/backend/"`
2. **`bootstrap/providers.php`** → add `Modules\Yourfeature\YourfeatureServiceProvider::class`
3. `composer dump-autoload`

The provider does the rest:

```php
public function boot(): void
{
    $this->loadMigrationsFrom(__DIR__ . '/Migrations');
    $this->app->booted(fn () => $this->loadRoutes());   // guard routesAreCached()
}
```

**Removing** a module is the same three lines in reverse, plus `rm -rf` the
folder. If removal requires touching anything else, the module was built wrong.

---

## Conventions

| Concern | Rule |
|---|---|
| Money | Stored as **integer poisha**, never float. Taka is presentation only. |
| Controllers | Thin — HTTP shaping only. Rules live in `Services/`. |
| Validation | `Requests/` form requests. Never validate in a controller. |
| Pricing | **The client never sets a price.** Re-resolve server-side at capture. |
| Public keys | Slugs (`coxs-bazar`), never auto-increment ids, in URLs and payloads. |
| Stable keys | Once an order references a key, it is immutable — deactivate, never rename. |
| Contracts | `endpoints.md` is written **before** the controller, and the mock `api.js` returns the identical shape. |

---

## Frontend seam

Each module's `backend/api.js` is the **only** door between the storefront and
its data. Today the bodies read mock JSON; when an endpoint goes live only those
bodies change to `fetch()`, because the shapes already match `endpoints.md`.

No page-level JS may call an endpoint directly. If it does, the seam has leaked
and swapping mock for real stops being a one-file change.

---

## Module status

| Module | Frontend | Laravel |
|---|---|---|
| `delivery` | live (mock) | **authored** — provider, routes, controller, request, service, 2 models, 2 migrations, seeder |
| `catalog` | live (mock) | **authored** — provider, routes, 2 controllers, request, query service, 2 models, 2 migrations, seeder |
| `cart` | live (mock) | not started |
| `checkout` | live (mock) | not started |
| `auth` | live (mock) | not started |
| `account` | live (mock) | not started |
| `b2b` | live (mock) | not started |
| `deals` | live (mock) | not started |
| `content` | static | not started |
