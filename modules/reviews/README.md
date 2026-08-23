# reviews

Customer reviews, from people who actually received the product.

Delete this folder, remove its line from `composer.json` and
`bootstrap/providers.php`, and every screen keeps working — the product page
loads its review section with a dynamic import and a `.catch`, so it renders
everything else and says reviews are unavailable. The `product_reviews` rows
and each product's last computed rating stay put, the same way removing
`modules/media` does not drop the uploads.

---

## What it gives you

| | |
|---|---|
| `GET /api/catalog/products/{slug}/reviews` | published reviews, paged, with the 5→1 spread |
| `GET /api/reviews/eligibility/{slug}` | may I review this, and if not why |
| `POST /api/reviews/{slug}` | submit one; always lands pending |
| `GET /api/admin/reviews?status=pending` | the moderation queue |
| `PATCH /api/admin/reviews/{id}` | publish, reject, or put back to pending |
| `DELETE /api/admin/reviews/{id}` | for spam; owner only |
| `modules/reviews/reviews.html` | the **Reviews** screen in the sidebar |
| `reviews-panel.js` | the section on a product page |
| `php artisan reviews:recount` | rewrite every rating from real reviews |

Reading is public. Writing needs `auth:sanctum` and is rate-limited to 6 a
minute — every submission becomes an item in somebody's queue. The admin routes
are gated on the `products` capability: whoever curates the catalogue is who
decides what is said about it.

## Why this module exists

Products already had `rating` and `review_count`. Those two columns **were** the
whole system — numbers a seeder wrote, with nothing behind them. The live shop
advertised *"4.7 from 288 reviews"* for products that had never been reviewed,
and `product-page.js` publishes those figures to Google as `AggregateRating`,
which makes an invented number a structured claim rather than a decoration.

The columns stayed and kept their job: the catalogue sorts and filters on
rating, and a join-with-aggregate on every listing query is the wrong trade.
But they are **derived** now.

**`ReviewService::recount()` is the only thing that may write them.** It
recomputes from the published rows rather than incrementing — an increment is
correct until the first moderation reversed or the first race, and then it is
quietly wrong for ever with nothing to notice it. It runs inside the same
transaction as every status change.

## Who may review

A signed-in customer with a **delivered** order containing that product, who has
not already reviewed it.

Delivered, not placed or shipped: on cash on delivery a shipped order is one
that can still be refused at the door, and a review is about the thing in your
hand. That costs a few days of reviews and buys the only claim that makes the
Verified badge worth printing. `order_id` is kept on the row, so the claim stays
checkable — the admin queue links straight to that order.

One review per customer per product, enforced by a unique index rather than a
check in PHP: two taps on a slow connection is the most ordinary way to get two,
and the second should lose at the database.

A rejected review is **kept, not deleted**, so the same abuse cannot be
resubmitted looking new and a rejection can be reversed. Its author is never
told it was rejected — they see the same sentence a published review gets.
Telling someone their words were refused invites an argument the merchant has no
screen to have, and tells a spammer exactly when to try again.

## Moderation

Everything arrives `pending`. Nothing in the customer-facing controller can
publish. The queue is worked oldest-first, because the review that has waited
longest is the customer who has waited longest.

**Reject** is the reversible move and is what disagreement is for. **Delete** is
for spam, is permanent, and sits behind `admin.owner` with every other delete in
the panel.

## If ratings ever look wrong

```
php artisan reviews:recount --dry-run   # what would change
php artisan reviews:recount             # do it
```

It rewrites every product from its published reviews. On a shop with no reviews
yet that means zero across the board, which is the honest answer: the storefront
draws "No reviews yet" instead of stars, and the product page omits the
`AggregateRating` markup entirely at zero.

## Requires

- `modules/catalog` — the product a review is about.
- `modules/checkout` — the delivered order that proves the purchase.
- `modules/admin` — the staff session and the sidebar.
