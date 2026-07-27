# How code is written in this project

Two parts: **the rules you set** (non-negotiable), and **the conventions applied
on top of them** — the habits that make the output consistent.

If you hand this repo to another developer, hand them this file.

---

## Part 1 — Your locked rules

Recorded in `context.md` §2. These are standing instructions, not per-task
preferences, and they are never re-litigated.

1. **Frontend = plain, structured HTML.** Semantic + ARIA. No client-side
   templating engine, no framework.
2. **Styling = CSS + Tailwind.**
3. **Effects, animation, motion and special styling behaviour = JS.**
4. **Backend = Laravel (PHP).**
5. **Module-wise vertical slices.** Every feature is ONE folder holding
   everything it needs — markup, styles, JS, controllers, routes, models,
   migrations, docs.
6. **Ultra-professional standard.** Clear structure, easy to understand, easy to
   edit and extend, **easy to hand over without explanation.**

### The module test

> Deleting a module folder must cleanly remove that feature and break nothing
> else.

In practice that means a module is named from **exactly two** places outside its
own folder — `composer.json` (PSR-4) and `bootstrap/providers.php`. Verified by
grep; if a third appears, something leaked.

### The three styling layers — use all three

| Layer | Owns |
|---|---|
| **CSS partials** | design tokens, and any *named, reused component* |
| **Tailwind** | one-off layout and spacing on a single element |
| **JS** | motion, reveals, transitions, state-driven visuals |

Reach for a utility before an inline `style=""`. Promote to a CSS partial on the
third repeat.

---

## Part 2 — The conventions applied on top

### Money

- **Stored as integer poisha, never float.** `price_poisha`, not `price`.
  Taka is presentation only, produced by a `priceTaka()` method.
- A rounding drift of a fraction of a taka across a cart is an accounting
  problem, not a cosmetic one.
- **`original_price` is NULL when there is no discount**, never equal to price —
  otherwise the UI cannot tell "no discount" from "0% off".

### The client never sets a price

The single most repeated rule in the backend.

- Request classes have **no field** for a price, subtotal, discount or total.
  Not validated-and-ignored — *absent*, so one cannot be smuggled in by accident.
- Every figure is recomputed server-side at capture time.
- A cart that trusts a posted price is a cart that can be bought for one taka.

### Snapshot vs read-through — decide deliberately

| | Behaviour | Why |
|---|---|---|
| **Order lines** | full snapshot | an order is a historical record; a rename or reprice must never rewrite what was bought |
| **Cart lines** | read-through to live price | you are charged today's price |
| **Wishlist** | read-through | a pointer to something you still intend to buy |
| **Addresses on orders** | flat snapshot | editing a saved address must not rewrite where a past parcel went |

Cart lines *also* store `added_price_poisha` — not to charge from, but so the
cart can **say** "this changed since you added it" rather than quietly charging
a different number.

### Rules live in data, not in PHP

Promo codes, delivery zones, gift thresholds, district→zone mapping — all
database tables with a seeder, never a constant in code.

Marketing changes a discount far more often than engineering deploys.
Hardcoding is how you ship a hotfix for a coupon.

### Security defaults

- **Public keys are slugs or SKUs**, never auto-increment ids, in URLs and
  payloads.
- **Order numbers are random**, not sequential — a guessable number lets someone
  walk the tracking page through other people's orders.
- **404, not 403**, for someone else's resource. Confirming an id exists is
  itself information.
- **Generic auth failures.** Never distinguish "no such account" from "wrong
  password", or "wrong code" from "expired code". When the account is missing,
  still run a hash comparison so response *time* does not leak existence either.
- **Resolve through the owner** — `where('user_id', …)->findOrFail()` — never
  fetch by id then compare. One forgotten check in the second style and any
  customer reads another's data.
- **Stable keys are immutable** once an order references them. Deactivate with
  `is_active`; never rename or delete.
- Rate-limit anything that **costs money** (SMS) or is **guessable** (OTP,
  promo codes) far below the app default.

### Structure

- **Thin controllers.** HTTP shaping only. Every rule lives in a `Service`.
- **Validation in FormRequests**, never in a controller.
- **`endpoints.md` is written before the controller**, and the mock `api.js`
  returns the identical shape — so swapping mock for real changes no consumer.
- **One door per module.** `backend/api.js` is the only path between the
  storefront and a module's data. No page-level JS calls an endpoint directly.
- **One source of truth per rule.** If a figure is computed in two places, one
  of them is wrong already or will be soon.
- Dependencies are **one-way** and cycle-free — verified by
  `tools/module-deps.py`.

### Comments explain *why*, never *what*

The code already says what it does. Comments carry the reasoning that would
otherwise be lost:

```php
// minmax(0, 1fr), not 1fr: a grid track defaults to min-width:auto, so it
// cannot shrink below its content. A long product title was forcing the row
// 23px past the viewport at 375px.
```

Anything surprising gets a sentence. Anything obvious gets none.

### Verify by running, not by reading

This is the habit that catches the most.

- **Render the page and look at it.** Three real bugs this session were
  invisible to every file search: `color-scheme: dark` painting checkboxes
  black, a 23px grid overflow, and unstyled inline spans reading
  "Dhaka & ChattogramWithin 72 hours".
- **Run the tool after a change.** Moving the catalog data broke
  `tools/sitemap.py`; grep missed it because that file builds its path from
  parts. Running it found it immediately.
- **Measure, don't eyeball.** Headless Chrome clamps its viewport to ~526px, so
  a `--window-size=375` screenshot is a 526px render cropped to 375 — it *looks*
  broken when nothing is wrong. `tools/qa-viewport.html` frames pages in
  exact-width iframes and measures `scrollWidth` vs `clientWidth`.
- **Prove the thing itself.** A font can be declared, requested, and still not
  be painting. `tools/font-test.html` measures the same string in the real
  family versus a fallback.
- **Check the assumption before acting on it.** The gift reward first pointed at
  a SKU I had invented; generating it *from* the catalog and asserting against
  it caught that the "olive oil" was actually milk powder.

### Honesty in reporting

- **Say what has not been executed.** No PHP in this repo has ever run —
  stated in `BACKEND.md`, `DEPLOY-HOSTINGER.md`, `context.md` and every commit
  touching it. Authored ≠ verified.
- **Record what is NOT built** in `endpoints.md` under a "Not built" heading —
  stock reservation, the SMS gateway, guest wishlist merge — rather than letting
  a gap look like an oversight later.
- **Say when a bug was pre-existing**, and prove it (stash, re-measure) rather
  than implying you caused or avoided it.
- **Fix what you find on the way**, then say so separately from the feature.

### The workflow per item

1. Read the surrounding code first.
2. Write the contract (`endpoints.md`) before the implementation.
3. Build it.
4. Verify: render it, measure overflow at 375/414/768/1280, check the console,
   sweep all pages for 200s, run the validators.
5. Update `context.md` — decision log, change log, checkbox.
6. Commit that item **alone**, with a message explaining the *why*.
7. Only then start the next one.

---

## The tools this produced

None of these replace a real toolchain — run `php -l`, PHPStan and Pint the
moment PHP exists. They stand in because it does not.

| Tool | Catches |
|---|---|
| `tools/qa-viewport.html` | real overflow at exact widths; seeds carts, focuses inputs, fills forms |
| `tools/php-check.py` | opener, balanced delimiters, namespace vs PSR-4 path, unused imports |
| `tools/module-deps.py` | dependency **cycles** — the thing that silently breaks module deletion |
| `tools/htaccess-check.py` | frontend files still reachable, internals still blocked |
| `tools/font-test.html` | the Bengali face actually painting, not falling back |
| `tools/check-search-suggestions.py` | every suggested query returns ≥1 product |

---

## One-line summary

**Build it as a vertical slice, put the rules in one place, never trust the
client with a number, comment the reasoning, and prove it by running it.**
