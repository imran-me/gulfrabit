# modules/sms

Transactional SMS to customers: "your order is confirmed", "your order is on
the way". Backend-only — there is no page here and no public endpoint, because
a gateway key that reaches the browser is a gateway key someone else is using.

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
raw answer. Prepaid credit that runs out looks exactly like a working system
otherwise. When a customer says "I got no SMS", this table is the answer.

## How it hangs together

`modules/checkout` dispatches `OrderStatusChanged` after each fulfilment
transition commits. This module's provider subscribes
`SendOrderStatusSms`, which composes the message and hands it to `SmsService`.
The dependency is one-way (sms → checkout); checkout has no idea this module
exists. An SMS failure never breaks the status change that triggered it —
the SMS is the garnish, the status change is the meal.
