# Auth · API contract

Owned by `modules/auth`. Base path `/api/auth`, mounted by `AuthServiceProvider`.

Depends on `cart` (to merge the guest basket at sign-in). One-way — cart knows
nothing about auth.

| Status | Endpoint |
|---|---|
| **authored** | `POST /otp/request` · `POST /otp/verify` · `POST /login` · `POST /register` · `POST /logout` · `GET /me` · `PATCH /me/password` |
| planned | password reset by OTP, social sign-in |

---

## Phone is the identity, not email

`users.phone` is unique; `users.email` is nullable. That is the inverse of the
Laravel default and it is the correct shape here: checkout collects a phone,
order tracking looks up by phone, and a large share of customers have no email
at all. Making email the unique key would lock those people out of their own
accounts.

**OTP is the primary sign-in path**, password is the fallback — the order this
market actually uses. Ghorer Bazar lead with "Send OTP"; Shajgoj do the same.

---

## `POST /api/auth/otp/request`

`{ "phone": "01712345678" }` · `throttle:5,1`

**Always 200**, whether or not an account exists:

```json
{ "message": "If that number can receive SMS, a code is on its way.",
  "expiresInMinutes": 10 }
```

Saying "no account for that number" would turn this into a free tool for
checking which numbers shop here.

**429** when asked again within the 60-second resend cooldown — the one failure
worth naming, because it is actionable and discloses nothing.

### Why this is the most defended endpoint in the app

Every call costs real money at the SMS gateway, and it is trivially scriptable.

1. **Codes are stored hashed.** A leaked database must not hand out live logins.
2. **10-minute TTL, single use, 5 attempts**, then the code is burned.
3. **Attempts increment *before* the comparison**, so a crash mid-verify cannot
   be used to farm unlimited free guesses.
4. **Issuing a new code invalidates any earlier live one** — two valid codes at
   once doubles the guessing surface for no benefit.
5. **Throttled per IP at the route AND per phone in the service**, because an
   attacker rotating IPs must still not be able to bill us for SMS.
6. `random_int`, never `rand()`. A predictable OTP is not an OTP.

---

## `POST /api/auth/otp/verify`

`{ "phone": "01712345678", "code": "123456" }` · `throttle:10,1`

**200** → `{ "data": { "user": User, "token": "..." } }`
**422** → `{ "message": "That code is not valid." }`

One generic failure covers wrong, expired and never-issued. Distinguishing them
tells an attacker which numbers have live codes.

**Verifying also registers.** A customer who has just proved they control the
number should not then be asked to "sign up" — that extra step is pure drop-off.
Accounts created this way get a random *unusable* password hash, never an empty
one; an empty hash is a login bypass waiting to be found.

---

## `POST /api/auth/login` — password fallback

`{ "identifier": "01712345678 | you@example.com", "password": "..." }`

One field takes either, because asking which one you registered with is a
question the customer should not have to answer. Shajgoj label it the same way.

**422** → `{ "message": "Those details did not match." }` — never distinguishing
"no such account" from "wrong password". When the account is missing the service
still runs a `Hash::check` against a dummy hash, so response *time* does not leak
existence either.

---

## `POST /api/auth/register`

Explicit sign-up for customers who want a password from the start. Requires
name, phone and password; email optional. Passwords run through Laravel's
`uncompromised()` breach check.

---

## Authenticated

| Endpoint | Notes |
|---|---|
| `POST /logout` | revokes **only the token that made the request**, not every session |
| `GET /me` | current user |
| `PATCH /me/password` | current password required unless the account never had one; **revokes all other tokens** on success |

Revoking other sessions on a password change is the entire point of changing it
after a suspected compromise.

---

## The cart merge belongs to sign-in, not the controller

`AuthService::issueSession()` performs it, so **every** sign-in path does it.
A path that forgets silently throws away the basket the customer just built.

---

## Never in a response

`publicUser()` is the only shape returned: `id`, `name`, `phone`, `email`,
`tier`, `phoneVerified`. The password hash, tokens and internal columns never
leave the server.

The plaintext passwords in `modules/auth/data/users.json` are a **frontend mock
artefact** and must never reach the database — `CatalogSeeder`'s equivalent for
users does not exist for exactly that reason.

---

## Not built

- **SMS gateway.** `OtpService::deliver()` logs the code in local development
  and **throws in production**, deliberately: silently logging live login codes
  on a real site is a credential leak.
- Password reset by OTP, and social sign-in.
