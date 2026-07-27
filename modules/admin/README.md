# modules/admin

The staff panel: sign-in, roles, layout, navigation and the dashboard.

Delete this folder, remove its `ADMIN_PAGES` entries from `tools/assemble.py`,
its line from `composer.json` and its line from `bootstrap/providers.php`, and
the entire admin panel is gone — schema, endpoints, guard and all. The
storefront does not import a single thing from here.

## The security model, stated plainly

**The admin HTML is public.** These pages are served as static files like the
rest of the site, so anyone who guesses the URL can open them. That is
acceptable *only* because they contain no data: every figure on every screen
arrives from an endpoint behind the `admin` middleware.

| Layer | What it is | What it is not |
|---|---|---|
| `RequireAdmin` middleware | The authority. Rejects unauthenticated calls 401, wrong-role calls 403. | — |
| `admin-shell.js` guard | A redirect so signed-out staff see a login form instead of empty boxes. | **Not a control.** Never move an access decision into it. |
| `robots.txt` + `noindex` | Keeps the panel out of search results. | Not access control. |

The host should also put HTTP auth in front of `/modules/admin/` as defence in
depth. That is a deployment step, not a code one.

### Staff are not customers

`admin_users` is a separate table from `users` on purpose. The storefront
authenticates by SMS OTP and anyone can create an account; if admin were a flag
on that table, every weakness in customer auth would become an admin
compromise. With two tables, a customer account cannot become an admin account
by any code path — there is no column to set.

### The fixture session

With no PHP running, `backend/api.js` can issue a local development identity so
the panel can be built. It is fenced in three ways, and all three must hold:

1. Only when the endpoint is **absent** — a network failure, a 404, or a 501.
   A **401 or 403 is a real answer from a real backend**, and the fixture stays
   out of it. A mock that steps in on 401 is an authentication bypass.
2. Only on a local origin (`localhost`, `127.0.0.1`, `*.local`).
3. Only after `localStorage['gr:admin-dev-session'] = 'on'`, which the
   fixture sign-in sets.

When it is active, an unmissable banner sits at the top of every screen saying
nothing is secured, and the console says the same. A console warning alone
would be invisible to the person actually using the panel.

## Roles

One role per account, not a permission matrix — a matrix nobody maintains ends
up with everyone as owner. `AdminUser::CAPABILITIES` is the whole truth:

| Role | Areas |
|---|---|
| `owner` | everything, including staff and settings |
| `manager` | orders, customers, products, inventory, accounting, content |
| `warehouse` | orders, inventory — **no money** |
| `accounts` | accounting, orders — cannot edit customers or the catalogue |
| `editor` | content only — never sees an order or a customer |

Every role has `dashboard`, so nobody signs in and finds nothing they may open.
The dashboard controller still decides which *cards* each role receives, so
warehouse lands somewhere real without being handed the day's revenue. Roles
filter data at the server, not in the browser — data the client hides is still
data the client received.

## Navigation is contributed, not hardcoded

`admin-shell.js` exports `registerScreen()`. Each module's admin script calls
it; `tools/assemble.py` decides which scripts load. This file imports nothing
from courier, inventory, accounting or cms — it cannot, or deleting one of them
would break the shell.

```js
import { registerScreen } from '/modules/admin/admin-shell.js';

registerScreen({
  id: 'inventory',
  label: 'Stock',
  href: '/modules/inventory/stock.html',
  area: 'inventory',      // must match a capability in AdminUser::CAPABILITIES
  group: 'Warehouse',
  order: 10,
  icon: '<svg …></svg>',
});
```

A screen whose `area` the signed-in role lacks is not rendered — and its
endpoints would refuse the call anyway.

## Where things live

```
modules/admin/
  admin-shell.js         layout, nav registry, session guard
  login-page.js          the one page that must work signed-out
  dashboard-page.js      landing screen; registers itself like any module
  admin.css              owns .admin*, .anav*, .acard*, .alogin*
  _fragments/            _shell.html, _shell-end.html, page fragments
  backend/
    api.js               frontend seam — and the fixture, with its three fences
    endpoints.md         the HTTP contract
    routes.php           /api/admin/*
    AdminServiceProvider.php   also registers the `admin` guard
    Middleware/RequireAdmin.php
    Controllers/ Models/ Services/ Requests/ Migrations/ Seeders/
```

## Dependencies

`admin` reads from checkout (orders), auth (customers) and catalog (products)
for its screens. One-way: nothing depends on `admin` except the modules that
choose to register a screen with it.

## First run

There is **no default password**. `AdminUserSeeder` reads `ADMIN_EMAIL` from
`.env`, and if `ADMIN_PASSWORD` is unset it generates a strong one and prints
it once. Seeders that ship `admin/admin123` are how storefronts get taken over
in week one.
