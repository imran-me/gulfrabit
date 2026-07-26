# Account · API contract

Owned by `modules/account`. Base path `/api/account`, mounted by
`AccountServiceProvider`. **Every route is authenticated** — all of it is one
customer's private data.

Depends on `catalog` (wishlist points at products) and `delivery` (an address
belongs to a district, which is what prices it). One-way — neither knows account
exists.

| Status | Endpoint |
|---|---|
| **authored** | addresses CRUD + set-default · wishlist list/add/remove |
| planned | profile update, saved payment methods |

## Order history is NOT here

It lives in `modules/checkout`, which already serves `GET /api/orders`.
Re-exposing it under `/account` would mean two places to keep in step and two
places to get authorisation wrong.

---

## Addresses

| Method | Path |
|---|---|
| `GET` | `/api/account/addresses` |
| `POST` | `/api/account/addresses` |
| `PATCH` | `/api/account/addresses/{id}` |
| `DELETE` | `/api/account/addresses/{id}` |
| `POST` | `/api/account/addresses/{id}/default` |

```ts
type Address = {
  id: number; label: string;          // "Home" / "Office"
  name: string; phone: string;        // recipient, not always the account holder
  line1: string; area: string | null;
  districtKey: string;                // what checkout re-quotes delivery from
  districtName: string;
  notes: string | null;               // landmark, floor, timing
  isDefault: boolean;
};
```

**The shape mirrors the checkout form exactly**, including no postcode —
Bangladeshi addresses are not routed by one and checkout does not ask. An
address that cannot be dropped straight into checkout is just a note.

`districtKey` is returned as well as the name because **checkout needs the key
to price delivery**. Free-text city was precisely the field that left the old
checkout unable to quote a charge.

### The invariant: exactly one default

Not zero — checkout would have nothing to pre-fill. Not two — checkout would
have to guess. `AddressService` maintains it on every write path, inside a
transaction:

- the **first** address saved becomes the default whatever was ticked
- setting a new default clears the old one
- **deleting the default promotes the next address**, so the invariant survives
  without the customer noticing or fixing anything

### Ownership

Every lookup resolves **through the authenticated user** (`where('user_id', …)
->findOrFail()`), never by id followed by a comparison. One forgotten check in
the second style and any customer can read or delete another's address.

A miss returns **404, not 403** — confirming an id exists is itself information.

---

## Wishlist

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/account/wishlist` | |
| `POST` | `/api/account/wishlist` | `{ sku }` — saving twice is a no-op |
| `DELETE` | `/api/account/wishlist/{sku}` | **idempotent** |

Returns the **product-card contract**, so the wishlist grid reuses the same
renderer as every other grid rather than being a special case.

**Not a snapshot**, deliberately — unlike order lines. A wishlist is a pointer
to something you still intend to buy, so it shows today's price and today's
stock. Storing a price here would let the list advertise a number we no longer
honour.

Two small decisions that matter in practice:

- `firstOrCreate` on add, so a double-tap is a no-op rather than a 500 from the
  unique index.
- Removing something already gone returns **success, not 404**. The button
  should never show an error for reaching the state the customer asked for.
- A product deleted after being saved is **filtered out of the response** rather
  than rendered as a blank card.

---

## Not built

- Profile update (name/email) — `PATCH /api/auth/me` covers password only today.
- Saved payment methods — needs the gateway first.
- **Guest wishlist merge on sign-in.** The cart does this
  (`AuthService::issueSession`); the wishlist does not yet, so a guest who saves
  items and then signs in still loses them.
