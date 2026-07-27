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
