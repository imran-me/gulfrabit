# Delivery module

**Owns:** what delivery costs, how long it takes, and which districts we serve.

This is the **reference implementation** of the module rule in `context.md` §2.
Every folder under `modules/` should look like this one.

---

## The deletion test

Deleting `modules/delivery/` removes **every delivery rule in the codebase** —
API routes, schema, pricing logic, the district dataset and the frontend seam.
No global routes file, global migrations folder, or `shared/` file needs editing.

On the backend the only outside reference is one line in `bootstrap/providers.php`:

```php
Modules\Delivery\DeliveryServiceProvider::class,
```

**Being precise about what the test does and does not claim:** four frontend
modules *consume* this one (see the table below), so deleting it breaks their
imports — as it should. That is a consumer losing a capability it depends on,
not delivery logic leaking out. The property that matters is that **no delivery
rule lives anywhere else**: no zone table in checkout, no rate hardcoded in the
cart, no district list in a global data folder. Change a price here and every
surface changes with it.

That was not true before this module existed. Rates were duplicated across
`checkout.html`, `cart-page.js` and a policy page, which is exactly how the site
ended up promising free delivery in the banner while checkout charged ৳ 60.

---

## Layout

```
modules/delivery/
├── README.md                     you are here
├── data/districts.json           the 64 districts + their zone (module-owned)
└── backend/
    ├── DeliveryServiceProvider.php   registers routes + migrations from in here
    ├── routes.php                    this module's entire routing surface
    ├── api.js                        frontend seam (mock today -> HTTP later)
    ├── endpoints.md                  the contract, written before the code
    ├── Controllers/DeliveryQuoteController.php
    ├── Models/{DeliveryZone,District}.php
    ├── Requests/ShippingQuoteRequest.php
    ├── Services/DeliveryQuoteService.php     all pricing rules live here
    ├── Seeders/DeliveryZoneSeeder.php        seeds FROM districts.json
    └── Migrations/                           this module's schema only
```

There is no `delivery.css` or `delivery-page.js`: delivery has **no page of its
own**. It is consumed by checkout, cart, the policy page and order confirmation.
A module owns a capability, not necessarily a URL.

---

## Consumers

Everything imports from `backend/api.js`. Nothing reaches past it.

| Consumer | Uses |
|---|---|
| `modules/checkout/checkout-page.js` | `DEFAULT_OPTION`, `quoteForDistrict()` |
| `modules/cart/cart-page.js` | `DEFAULT_OPTION` — "from ৳ 70" estimate |
| `modules/checkout/confirmation-page.js` | `deliveryOption()` |
| `modules/account/track-page.js` | `deliveryOption()` |
| `modules/content` (Shipping & Returns) | the zone table, kept in sync by hand |

---

## The pricing model, and why

**Flat charge per zone — no weight tiers, no free-delivery threshold.**

| Zone | Charge | Arrives |
|---|---|---|
| Dhaka & Chattogram | ৳ 70 | Within 72 hours |
| Rest of Bangladesh | ৳ 130 | 4 working days |
| Express — Dhaka only | ৳ 150 | Next working day |

- **Flat**, because the catalog runs from a 1kg bag of dates to 5-litre oil and
  boxed PCBs. Weight tiers would force the customer to do arithmetic before they
  know what they owe — the biggest single source of checkout anxiety in this
  market. Ghorer Bazar states its rate "for any amount of products" for the same
  reason.
- **No free-delivery threshold.** It used to say "free over ৳ 3,000" in the
  banner while checkout charged ৳ 60 regardless — a promise the code did not
  keep. Basket-building is handled instead by a gift-with-purchase reward, which
  costs COGS rather than margin.
- **Zones are commercial, not geographic.** Metro is the two cities we can reach
  in 72 hours. Gazipur and Narayanganj border Dhaka and are still priced
  nationwide, because the courier leg — not the map — sets the cost.
- **Cold-chain is included on perishables**, never a line item. The site promises
  it in the announcement bar on every page.

---

## Adding or repricing a zone

1. Update `Seeders/DeliveryZoneSeeder.php` (charges are in **poisha**).
2. Reassign districts in `data/districts.json` if the zone map changed.
3. Re-run the seeder; call `DeliveryQuoteService::forgetCache()`.
4. Update the mirrored `ZONES` constant in `backend/api.js` **until the API is
   live** — this is the one duplication in the module, and it disappears the day
   `getDeliveryOptions()` starts fetching.
5. Update the policy table in `modules/content/_fragments/shipping.main.html`.

**Never rename or delete a zone key** once orders reference it — deactivate with
`is_active` instead, so historical orders keep resolving.

---

## Status

- Frontend seam: **live**, running on mock data.
- Laravel backend: **authored, not executed.** `php`/`composer` are not installed
  on the current machine, so none of the PHP here has been run or tested. Treat
  it as reviewed-by-eye only until a PHP toolchain exists.
