# Risk

Whether a phone number's parcels come back.

Cash on delivery means the shop pays to send a parcel before anyone has paid
for it. A refused delivery costs the courier fee both ways and the packing in
between; the customer loses nothing, so a number that refuses once refuses
again. Every established shop in Bangladesh keeps this list — usually in
somebody's head, or a notebook, and it leaves when they do.

The shop already has the evidence. `orders.status` records delivered, returned,
cancelled and spam against a phone number the checkout normalises to one form.
This module reads it back **before the next parcel goes out**.

## Parts

| Piece | Job |
|---|---|
| `backend/Services/DeliveryRisk.php` | one number's record, the watchlist, and the shop's own delivery rate |
| `backend/Controllers/AdminRiskController.php` | two reads: the window, and one phone |
| `backend/routes-admin.php` | `GET /api/admin/risk`, `GET /api/admin/risk/phone` — both `admin:orders` |
| `risk.html` + `risk-page.js` + `risk.css` | the Delivery risk screen (`/admin/risk`, sidebar group Trade) |
| `risk-nav.js` | its entry in the admin sidebar |

## It owns no tables

Every number is read from `orders`, which the checkout module owns and this one
only reads. A shop's record of who accepts parcels is not a second database to
keep in step with the first — it is the first one asked a different question.

So deleting `modules/risk/` removes a screen and nothing else: no data, no
history, no flags left behind on anybody's orders. (Delete the folder, its line
in `bootstrap/providers.php`, its PSR-4 entry in `composer.json`, its page entry
and nav line in `tools/assemble.py`, and the `/admin/risk` rewrite.)

## The bands

Only DECIDED orders count — delivered, returned, cancelled, spam. An order
still with the courier is not evidence either way, so it is excluded from every
rate and reported separately as "on the way now".

| Band | When | What the screen says |
|---|---|---|
| New customer | no decided order from this number | "First order from this number. Nothing known either way." |
| Good record | decided orders, none failed | "4 parcels, all accepted." |
| Normal | under a third failed | "1 of 5 did not complete — normal for cash on delivery." |
| Call before dispatch | a third to two thirds failed, or 3+ in flight and nothing delivered | "2 of 4 came back or were cancelled." |
| Ask for payment first | two thirds or more failed, 3+ failures, or any order marked fake | "3 of 4 came back." |

Cancelled is counted alongside returned because the parcel cost the same either
way. Which it was is one click away on the order itself.

## What it deliberately is not

- **Not a blacklist.** No order is blocked, no customer is banned, and the
  storefront never sees any of this. A band is a sentence for the person
  deciding whether to send a parcel today — call first, or ask for the delivery
  charge in advance. The reason is always printed beside the band so a human
  can disagree with it.
- **Not a shared fraud service.** Nothing is sent anywhere and no outside API is
  called. This is what happened between THIS shop and this customer, which is
  the only evidence the shop can stand behind. It also means a customer who is
  new to you is simply new, not safe.
- **Not colour alone.** Every band is a word first, with its reason under it, so
  the screen reads the same in greyscale, in a screenshot pasted into a chat,
  and to somebody who cannot separate red from green. A judgement about a
  person's history is the last place a colour should be doing the deciding.
