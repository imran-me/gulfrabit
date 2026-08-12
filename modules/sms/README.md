# modules/sms

Transactional SMS to customers: "your order is confirmed", "your order is on
the way" — plus the message a staff member types by hand on the order screen.

No public endpoint. The two routes here are admin-only, because a gateway key
that reaches the storefront browser is a gateway key someone else is using.

Delete this folder, its line in `bootstrap/providers.php` and its PSR-4 entry
in `composer.json`, and the shop works exactly as before — orders simply stop
texting.

## The honest state today

**No SMS gateway account exists yet** (ACTION-REQUIRED §SMS). Until the
credentials land in `.env`, this module is dormant: order status changes fire
their event, the listener runs, `SmsService` sees no configuration and does
nothing. No error, no half-send.

## What gets sent, and when

| Order moves to | Message |
|---|---|
| `confirmed` | order number + amount to keep ready (or "already paid") |
| `shipped` | same, plus the tracking page link |

Nothing on `placed` — the confirmation *call* is the placed-notification, and
texting an order that then fails its call promises a delivery that is not
coming. Nothing on cancelled/returned; those conversations happen on the phone.

Messages are English on purpose: Bangla SMS is UCS-2 (70 chars/segment vs
160), so every Bangla message costs roughly triple. Change the copy in
`backend/Listeners/SendOrderStatusSms.php`.

## Messaging a customer by hand

`sms-order-panel.js` mounts a **Message the customer** card onto the admin order
screen — the same self-mounting trick the courier module uses, so deleting this
folder takes the card with it and leaves no orphan markup in admin's fragment.

| Route | What it does |
|---|---|
| `GET /api/admin/orders/{order}/messages` | the whole thread for one order, automatic alerts included |
| `POST /api/admin/orders/{order}/messages` | send one typed message (throttled 20/min) |

**The endpoint takes no phone number.** The destination is read from the order
the route is bound to, so this cannot be turned into an SMS gateway with a login
form in front of it — not by a stolen session, not by a bug in the page script.

Three things the panel refuses to fake:

- **No gateway configured → no compose box**, with the reason written on screen.
  A send button that silently does nothing is worse than no send button.
- **"Sent" means the gateway accepted it**, not that a handset rang. The thread
  says that much and no more.
- **A refused message stays in the thread**, marked *Not sent*. It happened, it
  is logged, and the next person needs to see it.

Three ready-made openings (could not reach you / out for delivery / delayed)
fill the box and are edited before sending. They never send themselves — a
template that sent itself would be a status alert, and those are already
automatic. The character counter shows **segments**, because segments are what
the shop pays for.

## Configuration (`.env` on the server)

```
SMS_GATEWAY=bulksmsbd        # or "log" to test without sending
SMS_API_KEY=...              # from bulksmsbd.net → API key
SMS_SENDER_ID=...            # approved sender id (masked) or the given number
```

`SMS_GATEWAY=log` writes each would-be message to `laravel.log` and `sms_logs`
without sending anything — run the whole order flow and read exactly what
customers would receive, before buying credit.

Remember: config is cached on this host. After editing `.env`, run
`php artisan config:cache` (deploy.sh already does).

## Why bulksmsbd.net

Prepaid credit, an HTTP GET, non-masked sending works the day the account is
opened. Masked sender id (the SMS arriving as "GulfRabit") needs their approval
form and a few days — worth doing, it is a trust signal on a phone full of
`+8801...` spam. Any other BD gateway (SSL Wireless, Alpha, MimSMS) is one new
method in `backend/Services/SmsService.php`.

## The paper trail

Every attempt lands in `sms_logs` — phone, body, sent/failed, the gateway's
raw answer, **who sent it** and whether a person chose to (`kind`: `manual` vs
`automatic`). Prepaid credit that runs out looks exactly like a working system
otherwise. When a customer says "I got no SMS", this table is the answer.

`kind` is not derivable from `sent_by_name` being null: a future automated
campaign would also have no author, and lumping it in with the transactional
alerts would destroy the one honest count here — how many messages we actually
chose to send this person.

## How it hangs together

`modules/checkout` dispatches `OrderStatusChanged` after each fulfilment
transition commits. This module's provider subscribes
`SendOrderStatusSms`, which composes the message and hands it to `SmsService`.
The dependency is one-way (sms → checkout); checkout has no idea this module
exists. An SMS failure never breaks the status change that triggered it —
the SMS is the garnish, the status change is the meal.
