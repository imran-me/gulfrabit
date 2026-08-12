# modules/courier

Who carries the parcel: carriers, consignments, tracking events, and the driver
framework that real courier APIs will slot into.

Delete this folder, its two `ADMIN_NAV`/`ADMIN_PAGES` entries in
`tools/assemble.py`, its `composer.json` line and its `bootstrap/providers.php`
line, and the feature is gone. Orders keep working — they simply have nobody
assigned to carry them.

## The honest state today

**No courier API is connected.** There are no credentials (see context.md
§8b/B2), so every carrier runs on the `manual` driver: staff hand over the
parcel, type the tracking number, and record each status themselves.

That is not a stub. It is how most Bangladeshi merchants already operate, and
making it a first-class driver means the whole consignment → event → cost
pipeline is real and in daily use from day one. When a Pathao adapter is
written, it drops into a system that has been working rather than being
switched on for the first time.

The panel says so in three places rather than hiding it:

- the Couriers screen leads with it,
- each courier row is labelled *Manual* or *API connected*,
- the assign form states that nothing is booked automatically.

## The Couriers screen is a board, not a settings page

Tabs across the top are the stages a parcel passes through, with live counts:

**Ready to hand over** · With courier · Picked up · In transit · Delivered ·
Attempt failed · Returned · Cancelled · *Courier accounts*

The first tab is **not** a consignment status. It lists *orders* that are packed
and have no live consignment — the parcel does not exist yet, which is the whole
point of the tab. It answers the first question of the morning: what goes out
today? It sorts **oldest first**, against the habit of every other list in this
panel, because it is a queue and the parcel that has waited longest is the one
most likely to be forgotten.

`draft` gets no tab. It exists for a few milliseconds inside `assign()` between
creating the row and the driver answering; a parcel genuinely stuck there is a
bug, and giving it a tab would dress it up as a normal place to be.

The last tab is the old courier-company list — settings, kept, and pushed to the
end where settings belong.

### Every row can be acted on

The queue hands a parcel over from the row — pick the courier, type the tracking
number if you have it, done. Every other stage carries the one button that moves
that parcel forward (`booked → picked up → in transit → delivered`).

Both post to the same endpoints the order screen uses, so there is one set of
rules and one audit trail; what is duplicated is the button, not the logic.

**Handing over moves the order to `shipped`.** The parcel has left the building,
so an order still reading *Ready for courier* would be a screen lying about
where its parcel is — and once two screens disagree, staff stop trusting both.
That also means `assign()` now requires the order to be `packed` or
`ready_for_courier`; `confirmed` is no longer accepted, which makes the code
match the sentence that was always above it — a confirmed order has not been
packed, so there is no parcel to hand anyone.

> For the first real API adapter: with a carrier that **books in advance** and
> collects later, booking is not handover, and the honest moment becomes its
> pick-up scan. Every driver today is manual, where `assign()` happens with the
> parcel physically in someone's hands.

The order screen keeps the fuller form — courier cost, notes, and the statuses
that need explaining (`failed`, `returned`). The board carries the moves you
make twenty times a morning.

`is_active` ("we are not using RedX this month") and `is_configured` ("no
credentials, so the driver cannot call anything") are **separate columns**.
Collapsing them would hide *why* a courier is unavailable.

## Writing a real adapter

Implement `Contracts/CourierDriver` — four methods — and register it in
`DriverRegistry`. Nothing else changes: not the orders screen, not the
consignment table, not the UI.

```php
final class PathaoDriver implements CourierDriver
{
    public function key(): string { return 'pathao'; }
    public function isReady(Courier $c): bool { return $c->is_configured; }
    public function book(Consignment $c): array { /* … */ }
    public function track(Consignment $c): array { /* … */ }
    public function cancel(Consignment $c): bool { /* … */ }
}
```

Then flip the courier row's `driver` to `pathao` and add credentials. Unknown
driver names fall back to `manual` rather than throwing — a data row must never
be able to take the orders screen down.

## Rules worth knowing

**The order status is never written directly from here.** When a courier reports
"delivered", `ConsignmentService` calls `OrderFulfilmentService::transition()`
like any other caller, so the same whitelist applies and the same audit row is
written — with `actor_type = 'system'` so the trail says a courier caused it,
not a person. A delivery scan arriving after the order was cancelled is refused
by the same rule that would refuse a staff member doing it, and the consignment
event is still recorded because it happened.

**Only some courier statuses imply an order status.** `picked_up` and
`in_transit` both mean shipped; `failed` changes nothing, because the parcel is
still out there and the courier will try again. Mapping all eight would make the
customer's tracking page flap.

**One open consignment per order.** A second handover while the first is live
means two riders looking for the same parcel. Closed ones stay as history — a
failed delivery that goes out again with a different carrier is two records, and
a `courier_id` column on `orders` would have overwritten the first.

**Courier cost is not the delivery charge.** `cost_poisha` is what the carrier
charges *us*; the customer's fee lives on the order. Keeping both is the only
way to know whether delivery makes or loses money, and it is what the accounting
module will post as a cost of sale.

**COD is tracked separately** and starts un-remitted. Until the courier hands
the cash over it is a receivable, not money in the bank.

**Credentials are `encrypted:array` and `$hidden`.** A courier API key can
create shipments billed to this account, so it is treated as a secret — a
database dump, which is the usual way these leak, carries ciphertext.

**Duplicate scans are absorbed.** `consignment_events` is unique on
`(consignment_id, external_id)`; couriers resend webhooks, and a tracking list
showing "Picked up" four times reads as broken even when nothing is wrong.

## Where things live

```
modules/courier/
  courier-nav.js             sidebar entry (loaded on every admin page)
  courier-order-panel.js     self-mounting block on admin's order screen
  couriers-page.js           the Couriers settings screen
  data/couriers.json         the seeded carriers — never sets isConfigured
  _fragments/couriers.main.html
  backend/
    Contracts/CourierDriver.php     four methods, all an adapter needs
    Drivers/ManualDriver.php        the one that works today
    Services/DriverRegistry.php     driver key → implementation
    Services/ConsignmentService.php assignment, status, order sync
    Controllers/ Models/ Requests/ Migrations/ Seeders/
```

## Dependencies

`courier` → `checkout` (orders and the fulfilment service), and it borrows
admin's shell helpers for its screens. Nothing depends on `courier`.
