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

## `POST /api/admin/password`

Change your **own** password. Behind `admin` and nothing narrower — every role
needs it, and it is what stops a generated password being permanent. Throttled
10/min: it takes a guess at the current password, so it is one more place worth
grinding at.

```json
{ "current": "…", "password": "…", "password_confirmation": "…" }
```

The current password is required even though the session already proves who
this is. The threat is not a forged session — it is a signed-in browser left
open on a shop counter, where "change the password, own the account" would
otherwise cost an attacker four seconds.

New password: at least 12 characters, with letters and numbers, and it must
differ from the current one. Deliberately weaker than the 20-character
generated ones and deliberately not `uncompromised()` — that rule would have
this shop's server calling a third-party API on every password change, which is
the merchant's trade to make rather than a default.

**200** → changed. The current session survives (the guard authenticates from
the session payload, not by re-checking the hash), so nobody is signed out
mid-task. Other browsers signed in as the same account also survive; ending
those would need `AuthenticateSession` on the admin stack.

**422** → wrong current password, weak new one, or the two copies disagree.
Deliberately **not 401** for a wrong current password: a 401 would trip the
client's own interceptor and send the browser to the login page, turning a typo
into what looks like an expired session.

---

## Staff — `/api/admin/staff`

**Owner only.** Every route below is behind `admin:staff`, and `owner` is the
only role holding that capability. A manager cannot read this list, let alone
appoint anybody.

**No `DELETE`, anywhere on this resource, and none is coming.** An ex-employee's
name is on stock movements, order transitions, refunds and journal entries; an
audit trail whose actor ids point at nothing has stopped answering the one
question it exists for. Accounts are *disabled* instead — they cannot sign in,
they keep their history, and they can be switched back on. The table carries no
`deleted_at` column at all.

### `GET /api/admin/staff`

Everyone, unpaginated. A shop has five to twenty staff accounts.

```json
{
  "data": [{
    "id": 3, "name": "Rahim Uddin", "email": "rahim@…",
    "role": "warehouse", "roleLabel": "Employee",
    "isActive": true, "isLocked": false, "lockedUntil": null,
    "lastLoginAt": "2026-08-25T09:12:44+06:00", "lastLoginIp": "103.x.x.x",
    "createdAt": "2026-07-30T…",
    "isSelf": false, "lockedRole": null
  }],
  "meta": { "total": 6, "activeCount": 5, "ownerCount": 1, "roles": [ … ] }
}
```

`events` is the **audit trail** — the last 40 changes to staff accounts, newest
first, each as a pre-composed sentence:

```json
{ "id": 12, "subject": "Rahim Uddin", "action": "role_changed",
  "sentence": "changed from Employee to Manager",
  "actor": "Md Imran", "isSelf": false, "at": "2026-08-27T14:02:11+06:00" }
```

It rides along with the list rather than sitting behind its own endpoint: it is
read every time this screen opens and never on its own. The sentence is composed
**server-side** because it depends on the role labels (`warehouse` reads as
"Employee") — a second copy of that mapping in the JavaScript is how a trail
ends up saying somebody was made a Warehouse.

Written on all eight actions: `created`, `role_changed`, `details_changed`,
`disabled`, `enabled`, `password_reset`, `unlocked`, and `password_changed`
(the one a non-owner can cause — see `POST /api/admin/password`). Append-only:
there is no edit route and no delete route, like the order timeline.

`meta.roles` is the **role catalogue** — `{ value, label, blurb, capabilities[] }`
per role, built from `AdminUser::ROLES`, `ROLE_META` and `CAPABILITIES` together.
The create form's dropdown renders from this rather than from a copy in the
JavaScript, so the picker can never offer a role the server would refuse.

`lockedRole` is a *sentence or null*, not a boolean: it says why this row's role
cannot be changed, so the client can disable the control **with its reason
showing** instead of leaving it mysteriously absent. It is not the control —
`update` asks the same questions again, because a reason sent to a browser is a
suggestion.

### `POST /api/admin/staff`

```json
{ "name": "Rahim Uddin", "email": "rahim@gulfrabit.com", "role": "warehouse" }
```

Note what is **not** in the request: a password. The server generates one with
`Str::password(20)` — the same rule `AdminUserSeeder` applies to the first owner
— so a weak staff credential cannot be typed into this shop at all.

**201** → the row, plus `"password"` carrying the plaintext **once**. Nothing
stores it, so no endpoint can read it back; a forgotten password is a reset, not
a lookup. Same-origin, TLS in production, and **never to be logged**.

**422** → `email.unique` says to re-enable the existing account rather than make
a second one, so their history stays attached.

### `PATCH /api/admin/staff/{staff}`

Name, email, role. Not the password (that is a reset — it mints a credential)
and not `is_active` (that is disable/enable, which has its own refusals and must
not ride along in a form that mostly fixes typos).

**422** on either of two moves that would lock the panel:

- changing **your own** role — an owner who demotes themselves by accident has
  no way to undo it;
- changing the role of the **only active owner** — a panel with no active owner
  cannot appoint one, because appointing is itself an owner-only act.

### `POST /api/admin/staff/{staff}/password`

A fresh generated password, shown once, and it clears any lockout on the way —
somebody who tripped the five-failure lock *by* not remembering their password
is precisely who this is for.

**200** → `{ data, password, message }`

### `POST /api/admin/staff/{staff}/unlock`

Clears the lock without touching the password: they do know it, they mistyped it
five times, and they are standing in the middle of a shift.

**422** → the account is not locked.

### `POST /api/admin/staff/{staff}/disable` · `…/enable`

Disable is this panel's version of removing somebody. It takes effect
**immediately, including on a session already open** — `RequireAdmin` checks
`is_active` on every request rather than once at sign-in, so the next click is a
401 and the login screen.

**422** → already in that state; disabling **yourself**; or disabling the **only
active owner**.

Enable also clears any stale lockout, but deliberately does *not* reset the
password — somebody back from two weeks' leave may well remember it.

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
