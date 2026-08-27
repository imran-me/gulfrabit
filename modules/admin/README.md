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

## Roles and permissions

A role is a **preset**, not a cage. Picking one fills in a set of permissions;
an owner may then tick individual boxes for that person on `/admin/staff` →
**Access**. An account nobody has customised stores `null` and follows its role
exactly — which is why nothing changed for anybody the day permissions shipped.

Permissions are `area.action` strings. `AdminUser::PERMISSIONS` is the whole
truth about which actions each area has, and there is deliberately no blanket
area × action grid — no `dashboard.delete`, no `inventory.refund`, because
those acts do not exist.

| Area | Actions |
|---|---|
| `dashboard` | view |
| `orders` | view · edit · cancel · refund · delete |
| `customers` | view · edit · erase · delete |
| `products` | view · edit · archive · delete |
| `inventory` | view · edit |
| `accounting` | view · edit |
| `content` | view · edit · delete |
| `staff` | view · manage |
| `settings` | view · edit |

`AdminUser::ROLE_PERMISSIONS` holds the five presets. They reproduce exactly
what the roles could do before permissions existed:

| Role | Shown as | Preset |
|---|---|---|
| `owner` | Owner | `*` — everything, now and anything added later |
| `manager` | Manager | orders, customers, catalogue, stock, books; refunds; **no deletes** |
| `warehouse` | **Employee** | orders (view + edit) and stock. No money, no customers, cannot end an order |
| `accounts` | Accounts | books, and orders including refunds |
| `editor` | Editor | website content only |

`warehouse` is labelled **Employee** everywhere a human sees it
(`AdminUser::ROLE_META`). It was named for the job it was invented for, but it
is the general shop-floor account, and "Warehouse" reads as a place this shop
does not have. The stored enum value is untouched: renaming a member that every
row and a dozen checks refer to buys one nicer word and costs a migration
nobody needed.

### On a route

```php
->middleware('admin')                  // any signed-in staff member
->middleware('admin:orders')           // shorthand for orders.view
->middleware('admin:orders.delete')    // checked literally
```

The bare-area shorthand is not sugar — it is what keeps thirty route groups
across nine modules working unchanged now that permissions are finer than the
areas those routes were written against.

**There is no `admin.owner` any more.** "Deleting is an owner's call,
everywhere" was a deliberate rule, argued at length in the middleware that
enforced it — and it was precisely the rule that made *"may work orders, may
not delete them"* impossible to say. Deletes are `<area>.delete` now, and
`RequireOwner` is deleted rather than left registered and unused.

### The one invariant

At least one **active account able to manage staff** must always exist.
`AdminUser::isLastStaffManager()` guards it, and one check covers all three
ways to break it: demoting that person, un-ticking their `staff.manage` box, or
disabling them. It counts the *ability*, not the owner role — the two came
apart the moment permissions became per-account.

Every role has `dashboard.view`, so nobody signs in and finds nothing they may
open. The dashboard controller still decides which *cards* each account
receives, so an Employee lands somewhere real without being handed the day's
revenue. Permissions filter data at the server, not in the browser — data the
client hides is still data the client received.

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
  staff-page.js          who works here — owner only; the screen that grants access
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

That seeder creates the **first owner only**. Everybody after them is created
from `/admin/staff` — the seeder is the bootstrap, not the hiring process.

## Staff accounts

`/admin/staff`, owner only (`admin:staff`, and `owner` is the only role holding
that capability).

**Nobody is deleted.** There is no `DELETE` on the staff resource and none is
coming: an ex-employee's name is on stock movements, order transitions, refunds
and journal entries, and an audit trail whose actor ids point at nothing has
stopped answering the one question it exists for. Accounts are **disabled**
instead — they cannot sign in, they keep their history, and they can be
switched back on. `admin_users` carries no `deleted_at` column at all.
Disabling lands on the account's *next click*, not their next sign-in, because
`RequireAdmin` re-reads `is_active` on every request.

**Passwords are generated and shown once.** There is no field on any form where
a staff password can be typed, so a weak one cannot be introduced. Nothing
stores the plaintext, so a forgotten password is a *reset*, not a lookup. Staff
change their own from the **Change password** link under their name in the
sidebar — that link is what stops a generated password being permanent.

**Every change is recorded.** `admin_user_events` logs all eight actions —
created, role changed, details changed, disabled, enabled, password reset,
unlocked, password changed — with who did it, to whom, and when. Granting access
is the most consequential thing anybody does in this panel and was the only
consequential thing leaving no trace: prices are logged, order stages are logged
with the name of whoever moved them, but *"who made Rahim an owner?"* had no
answer. Append-only, shown on the Staff screen, and neither id is a foreign key
so the trail cannot be cascaded away by the act it exists to record.

**Two moves are refused**, both of which would lock the panel: demoting or
disabling yourself, and demoting or disabling the only active owner. A panel
with no active owner cannot appoint one, because appointing is itself an
owner-only act — recovery would be SSH, `.env` and the seeder.
