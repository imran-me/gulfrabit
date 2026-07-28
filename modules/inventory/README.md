# modules/inventory

Warehouses, stock levels and the movement ledger.

Delete this folder, its `ADMIN_NAV`/`ADMIN_PAGES` entries in
`tools/assemble.py`, its `composer.json` line and its `bootstrap/providers.php`
line, and stock tracking is gone. Products keep their `in_stock` flag, so the
storefront carries on selling — it simply stops knowing how many are left.

## Stock is a ledger, not a counter

`stock_movements` is the truth: every change, with a reason, append-only.
`stock_levels` is a running total kept in step inside the same transaction, so
the common question ("how many do we have") does not mean summing a ledger that
grows forever. The level can be rebuilt from the movements at any time, and a
disagreement between them is a bug with an audit trail rather than a mystery.

**There is no endpoint that sets a quantity.** Not in the API, not in the UI. A
ledger that can be overwritten stops being able to explain its own balance — and
shrinkage is a number you can only produce if damage and theft were never
recorded as generic corrections.

A stocktake is `recount()`, which records the **difference** with reason
`count`. "The shelf says 38, the system said 41" is the useful fact; a silent
correction to 38 destroys it, and repeated small corrections in the same
direction are how theft gets noticed.

## Reserved vs on hand

`qty_reserved` is stock promised to orders that have not shipped. Available =
on hand − reserved. Without that distinction two customers can buy the last jar
between the order being placed and the parcel leaving. Reserving does not move
stock, because the stock has not moved — it is still on the shelf.

`shipReserved()` releases and moves in one call, so the two can never drift.

## Negative stock is allowed, and reported

On-hand is a signed column. Negative is wrong, but it *happens* — a sale
recorded before the delivery was booked in. Forbidding it in the schema would
push the error somewhere invisible; allowing it and showing it makes the mistake
findable.

## Cost, and why margin is still unavailable

`stock_movements.unit_cost_poisha` is captured on **receipts**, so cost of goods
can be a weighted average of what was actually paid. A single "current cost"
field would silently rewrite the past every time a supplier raised a price.

`products.cost_poisha` (added by the catalog module) is a **standard** cost — a
reference for pricing decisions, not the figure used for COGS. It is nullable
and must never default to zero: a zero cost makes every sale look like 100%
margin, which is a lie that reads as good news and therefore never gets
questioned.

`averageCostPoisha()` returns **null** when no receipt has ever carried a cost,
which is the state today (context.md §8b/B5). Callers must report "cost not
recorded" rather than substituting the selling price. This is the blocker for a
real P&L in 7.6.

## Reasons are a closed list

`receipt · sale · return · damage · theft · count · transfer_in · transfer_out`

Closed so they can be summed. The service also checks the sign against the
reason — a negative receipt or a positive sale is a flipped sign upstream, and
catching it keeps the reason totals worth reading.

## Where things live

```
modules/inventory/
  inventory-nav.js       sidebar entry (every admin page)
  stock-page.js          levels + the movement form
  movements-page.js      the ledger for one product
  _fragments/            stock.main.html, movements.main.html
  backend/
    Services/StockService.php   THE only write path to stock_levels
    Controllers/ Models/ Requests/ Migrations/ Seeders/
```

## Dependencies

`inventory` → `catalog` (products). Nothing depends on `inventory`; the
dashboard asks whether its tables exist before showing a stock card.
