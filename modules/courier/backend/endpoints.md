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
- the order is not `confirmed` or `packed` — an unpacked parcel cannot be handed to anyone
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
