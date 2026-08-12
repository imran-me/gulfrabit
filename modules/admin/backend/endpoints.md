# Admin — HTTP contract

All routes are under `/api/admin` and run through the **`web`** middleware
group, not `api`: the panel authenticates with an httpOnly session cookie,
which needs the session and CSRF stack that `api` deliberately omits. A bearer
token in `localStorage` would be readable by any XSS in any admin screen; a
session cookie cannot be read by script at all.

Everything except `login` sits behind `admin` middleware.

---

## `POST /api/admin/login`

**Throttle:** 10/min per IP. There are five staff accounts; nobody legitimately
needs more.

```json
{ "email": "owner@gulfrabit.com", "password": "…" }
```

**200** → `{ "data": { id, name, email, role, capabilities[] } }`
Session is regenerated on success (kills session fixation).

**422** → `{ "message": "Those details did not match an active staff account." }`

One message for **every** failure: wrong email, wrong password, disabled
account, locked account. "No such account" confirms which addresses are staff.
"Account locked" confirms both that the address exists and that someone is
already attacking it. A miss also burns a bcrypt compare so the response time
does not leak what the message hides.

**Account lockout:** 5 consecutive failures locks the account for 15 minutes.
Counted per account, not per IP — the attacker picks the IP, we pick the
account.

---

## `POST /api/admin/logout`
**200** → `{ "message": "Signed out." }` Session invalidated and token rotated.

---

## `GET /api/admin/me`
**200** → `{ "data": { id, name, email, role, capabilities[] } }`
**401** when the session is gone.

The shell calls this on load. Because it is behind the middleware, a signed-out
visitor gets a 401 and is redirected — which is the only reason the client-side
guard can honestly be described as a convenience rather than a control.

---

## `GET /api/admin/dashboard`

**200** → `{ "data": { "cards": { … }, "generatedAt": "…" } }`

Two rules, both server-side:

1. **Cards are filtered by capability.** A `warehouse` account never receives
   `todayRevenueTaka` in the response body. Hiding it in the client would still
   have sent it.
2. **Cards are filtered by what exists.** Each block checks `Schema::hasTable`
   first, so deleting `modules/inventory` costs the dashboard its stock card
   and nothing else. This is the one endpoint that reaches across every module,
   which makes it the one most able to break the module rule.

Revenue counts **paid** orders only. Counting placed orders inflates the day
and then quietly deflates it when cash-on-delivery attempts fail.

---

## Orders

### `GET /api/admin/orders`

Filters: `status`, `paymentStatus`, `q`, `from`, `to`, `perPage`. All optional,
all whitelisted — `status` reaches a WHERE and is validated against the keys of
`OrderFulfilmentService::TRANSITIONS`, so it can never drift from the pipeline
the server actually enforces.

`meta.counts` carries how many orders sit in **every** stage under the current
search, plus `all`:

```json
"counts": { "all": 42, "placed": 4, "confirmed": 6, "packed": 3,
            "ready_for_courier": 2, "shipped": 7, "delivered": 18,
            "returned": 1, "cancelled": 1, "spam": 0 }
```

It deliberately ignores the `status` filter and honours the others — a stage tab
bar has to know about the tabs you are not standing on. One `GROUP BY`, not nine
round trips. `q` searches order number, phone and name only; a wildcard across
every column would turn the box into a way to trawl customer records.

### `POST /api/admin/orders/{order}/transition`

```json
{ "to": "ready_for_courier", "note": null }
```

The request validates *shape* only. Whether this particular move is legal for
this particular order is `OrderFulfilmentService`'s decision — a validator that
only knew the list of statuses would happily accept `delivered → placed`.

**422** → the move is not permitted, or someone else changed the order first.

### `POST /api/admin/orders/{order}/notes`

```json
{ "body": "Called at 6pm, asked us to deliver after Friday prayers." }
```

**Internal only.** Nothing here is ever sent to the customer — telling them
something is a different act with a different record
(`POST /orders/{order}/messages`, modules/sms). The split is deliberate: a note
like *"customer sounded evasive, verify the address"* must be impossible to
deliver by accident.

Append-only and attributed. There is no edit route and no delete route, for the
same reason the status trail has none: a record that can be tidied up after an
argument settles nothing. 2000 characters, against 500 for a transition note —
that one annotates a click, this one holds a whole phone call.

**201** → the saved note.

---

## Errors

| Code | Meaning |
|---|---|
| 401 | Not signed in. The client redirects to the login page. |
| 403 | Signed in, wrong role. The screen says so rather than rendering an empty table. |
| 422 | Validation, or a failed sign-in. |

403 is correct here, unlike the storefront's 404-for-other-people's-resources
rule: the staff member is authenticated and known, and hiding the accounting
area's existence from the warehouse team buys nothing while making a
permissions problem look like a broken link.
