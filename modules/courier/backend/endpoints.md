# Courier — HTTP contract

All routes sit under `/api/admin` behind `admin` + `admin:orders`: whoever may
work an order may hand it to a courier. Session-cookie auth, `web` middleware,
matching the admin module.

---

## `GET /api/admin/couriers`

```json
{ "data": [ { "key":"pathao", "name":"Pathao Courier", "driver":"manual",
             "isActive":true, "isConfigured":false,
             "hasDriver":true, "manualOnly":true, "supportPhone":"…" } ] }
```

Three separate booleans, deliberately:

| Field | Question it answers |
|---|---|
| `isActive` | Are we using this carrier at all right now? |
| `isConfigured` | Do credentials exist? |
| `hasDriver` | Has an adapter been written for its `driver` key? |

Collapsing these into one "available" flag would hide *why* a courier cannot be
booked, which is the only useful thing to tell the person looking at it.

---

## `GET /api/admin/consignments?stage=…&q=…`

The parcel board. One stage's rows, plus how many sit in every other stage so
the tab bar is drawn without eight more requests.

```json
{ "data": [ … ],
  "meta": { "stage":"handover", "total":4, "currentPage":1, "lastPage":1,
            "counts": { "handover":4, "booked":7, "picked_up":0, "in_transit":3,
                        "delivered":21, "failed":1, "returned":2, "cancelled":0 } } }
```

`stage` defaults to `handover` and is whitelisted. Every row carries `kind`, so
the client renders it without guessing:

| `stage` | `kind` | What a row is |
|---|---|---|
| `handover` | `order` | a packed order with no live consignment — the parcel does not exist yet |
| everything else | `consignment` | a real parcel in that status |

`counts` ignores the `stage` filter and honours `q`, because a tab bar has to
know about the tabs you are *not* standing on. Every known stage appears even at
zero: a tab that vanishes when empty moves the others under the cursor, and "no
parcels are waiting" is worth saying.

The handover queue sorts **oldest first** and excludes any order that already
has a consignment in a non-final status — without that exclusion a parcel would
appear both as waiting and as with-a-courier.

---

## `GET /api/admin/orders/{order}/consignments`
Newest first, each with its events. Multiple rows are normal: a failed delivery
that goes out again is two handovers, and both matter.

## `POST /api/admin/orders/{order}/consignments`

```json
{ "courierKey":"steadfast", "trackingNumber":"ABC123", "costTaka":60, "note":null }
```

`trackingNumber` and `costTaka` are optional — an API driver returns them, a
manual one needs them typed, and sometimes the slip arrives after the rider.
Forcing them at handover would push staff into inventing values.

**201** → the consignment.
**422** → a rule said no. All of these are 422, not 500, because a staff member
can respond by picking another courier:

- the courier is switched off
- the courier has no credentials and its driver cannot book
- the order is not `confirmed`, `packed` or `ready_for_courier` — an unpacked parcel cannot be handed to anyone
- the order already has an open consignment (two riders, one parcel)
- the courier refused the booking

## `POST /api/admin/consignments/{consignment}/status`

```json
{ "status":"in_transit", "location":"Dhaka hub", "description":null }
```

Always recorded with `source = "staff"`. Only a real courier integration may
write `source = "courier"` — the difference between what a carrier scanned and
what one of us typed is the whole value of the trail.

`draft` is not accepted: a consignment starts there and nothing may move it
back, because "not yet handed over" stops being true the moment it is.

### Effect on the order

Some statuses imply an order status, and the service applies it **through**
`OrderFulfilmentService::transition()` — same whitelist, same audit row,
`actor_type = 'system'`.

| Consignment status | Order becomes |
|---|---|
| `picked_up`, `in_transit` | `shipped` |
| `delivered` | `delivered` |
| `returned` | `returned` |
| `booked`, `failed`, `cancelled` | *unchanged* |

`failed` deliberately changes nothing: the parcel is still out there and the
courier will try again. A late scan on a cancelled order is refused by the
transition whitelist, the consignment event is still written, and the request
still succeeds — a courier's webhook must not fail because our order moved on.
