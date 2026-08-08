# modules/payments

Online payment: bKash and Nagad. The customer places the order first (COD
rules, every figure recomputed server-side), then — if their chosen method is
an online one and its gateway is configured — gets sent to the gateway to pay,
and comes back to the confirmation page with a verified verdict.

Delete this folder, its line in `bootstrap/providers.php` and its PSR-4 entry
in `composer.json`, and the shop still sells — everything pays on delivery,
which is where the shop started.

## The honest state today

**No merchant account exists at either gateway** (ACTION-REQUIRED §bKash,
§Nagad). Until credentials land in `.env`:

- `GET /api/payments/methods` answers `{bkash: false, nagad: false}`,
- the checkout hides the bKash/Nagad options and offers COD,
- nothing else in this module can run.

**This code has not yet been run against the live sandboxes** — the same
honest state the whole backend shipped in (see DEPLOY-HOSTINGER.md: "treat the
first deploy as the real first run"). Both flows are written carefully against
the gateways' documented contracts (bKash Tokenized Checkout v1.2.0-beta;
Nagad API v-0.2.0), and both default to **sandbox** hosts, so the first real
run can't charge anyone by accident. Expect to fix small things with sandbox
credentials in hand before pointing at production.

## The flow, in one paragraph

Checkout posts the order (payment stays `pending`), then asks
`POST /api/payments/intent`. The server opens a `payments` row, registers the
amount with the gateway server-to-server, and answers with a redirect URL. The
customer pays inside bKash/Nagad's own page and is bounced back to
`/api/payments/callback/{gateway}` — which asks the gateway *server-to-server*
what really happened (the redirect's query string is a claim, not a fact),
records the outcome, marks the order paid if and only if the gateway says so,
and 302s the browser to the confirmation page with `payment=success|cancelled|failed`.

An abandoned or failed payment leaves the order standing as COD — in this
market that is not an error path, it is Tuesday.

## Configuration (`.env` on the server)

```
# bKash — from the merchant portal after onboarding (sandbox values first)
BKASH_BASE_URL=https://tokenized.sandbox.bka.sh/v1.2.0-beta   # prod: https://tokenized.pay.bka.sh/v1.2.0-beta
BKASH_APP_KEY=...
BKASH_APP_SECRET=...
BKASH_USERNAME=...
BKASH_PASSWORD=...

# Nagad — from merchant onboarding. Keys are ONE base64 line each: the PEM
# body with its BEGIN/END armour and every newline stripped.
NAGAD_BASE_URL=http://sandbox.mynagad.com:10080/remote-payment-gateway-1.0   # prod: https://api.mynagad.com/api/dfs → base without /api/dfs
NAGAD_MERCHANT_ID=...
NAGAD_MERCHANT_NUMBER=...          # the wallet number
NAGAD_PUBLIC_KEY=...               # NAGAD's public key (they provide it)
NAGAD_PRIVATE_KEY=...              # OUR private key (we generate the pair)
```

`APP_URL` must be `https://gulfrabit.com` — the callback URLs the gateways are
given are built from it, and a wrong `APP_URL` sends paying customers to a URL
that does not exist.

Config is cached on this host: after editing `.env`, run
`php artisan config:cache` (deploy.sh already does).

## Cash flow difference from COD — worth knowing

COD money arrives via the courier's weekly remittance minus their fee. bKash
PGW money settles to the merchant wallet/bank on the gateway's own cycle
minus ~1.5–2% MDR. Reconcile both against `payments.trx_id` — it is the same
id the customer sees in their app, and the one on the gateway statement.

## What is deliberately NOT here

- **Card payments.** The checkout's "Card" option is hidden the moment a real
  backend answers; cards in BD mean an aggregator (SSLCommerz/aamarPay) —
  a different integration for a later day, and it would slot in as a third
  `PaymentGateway` implementation.
- **Webhooks.** Both gateways confirm synchronously in this flow; a
  server-push webhook is belt-and-braces for the browser-never-returned case
  and is listed as planned in endpoints.md. The staff fallback today: an order
  whose customer says "I paid" but shows `pending` is settled by the payments
  row's `gateway_ref` against the gateway portal.
- **Refunds through the gateway.** Recorded refunds exist (checkout's
  order_refunds); pushing them through the bKash refund API is future work.
