# Things only you can do

Last updated 2026-08-13.

Everything here needs a human with hPanel access, an account, or a decision.
Nothing on this list can be done from the code.

Do them in this order. The first four take about half an hour together and
unblock everything else.

---

## 1. Run the migrations — ✅ DONE 2026-08-13

Verified on the server: `php artisan migrate` answers *Nothing to migrate*, and
`migrate:status` shows every migration `Ran`, including the order pipeline
stages, order notes and SMS authorship added on 13 August.

Kept here rather than deleted, because the failure was worth remembering: three
migrations never ran because `deploy.sh` did not check the exit code, so one
failed and the deploy carried on and reported success. That is fixed — it
shouts now — and the admin dashboard raises a panel naming any migration that
has not run.

<details><summary>What it was, and how to run them by hand again</summary>

Until it was done, image uploads, product-scoped coupons and the Home page
screen did not work.

```
ssh -p 65002 u239665931@145.79.58.223
/bin/bash /home/u239665931/domains/gulfrabit.com/public_html/migrate.sh
```

It applies them, rebuilds the caches, and **prints the error if one fails**.
If it fails, send me the FIRST error line — everything after it is blocked
behind that one, not broken itself.

> From now on the admin **dashboard** tells you when something like this
> happens: a panel appears naming what is missing and what to do. It shows
> nothing when all is well. No more cron jobs to find out.

</details>

---

## 2. Turn on GD — 2 minutes ⚠ blocks all image uploads

**hPanel → Advanced → PHP Configuration → PHP Extensions → tick `gd` → Save.**

The image library re-encodes every upload through GD, which is what strips EXIF
and makes it impossible to hide a PHP shell inside a photo. Without the
extension, uploads refuse rather than falling back to an unsafe plain copy.

It is very likely already on — Hostinger enables it by default. **Test instead
of guessing:** open **Images** in the panel and upload any photo. If it works,
tick this off. If it says GD is not enabled, do the above.

Until this works, you cannot add a product — a photo is required.

---

## 3. Get `composer.lock` into the repo — 5 minutes

**Why:** it is the file that pins the exact version of every PHP dependency.
Without it, each deploy resolves versions afresh, so the server can quietly end
up on a different Laravel patch release than the one that was tested — and the
first sign is a screen breaking for no reason anybody changed.

It has never been committed, because Composer only runs on the server.

**Steps:**

1. hPanel → Files → File Manager → open `public_html`
2. Find `composer.lock`, **Download** it
3. Drop it into your local project folder (it will replace nothing — there is
   no local copy)
4. In VS Code: commit it and push

If it is not there, create it first over SSH:

```
cd /home/u239665931/domains/gulfrabit.com/public_html && composer install --no-dev
```

Once it is in the repo, `deploy.sh` installs exactly those versions every time.

---

## 4. Decide which categories to switch off — 5 minutes

**Admin → Categories.**

Eighteen categories are live. The six older ones are probably not what you want
on a premium import shop: Gadgets & Electronics, Kitchen & Home, Fashion,
Beauty & Personal Care, Office Supplies, Industrial Raw Materials.

Switching **Live** off hides the category *and every product in it*. Nothing is
deleted; switching it back restores everything.

**`Nuts & Dry Fruits` overlaps with `Dry Fruits` and `Nuts & Makhana`.** Pick
which one you want, then move the products: Admin → Products → open one →
change **Category** → Save. Then switch off the two you are not using.

---

## 5. Fill in cost prices — 20 minutes, and the cheapest real win

**Admin → Products → "Show them"** on the missing-cost banner.

Type the unit cost from your supplier invoice. Every one you fill makes the
Profit & Loss report real — until then it honestly says "cost not recorded"
rather than reporting your entire revenue as profit.

---

## 6. Get these accounts — the actual blockers

In order of how much each unblocks:

| What | Why it matters | Without it |
|---|---|---|
| **Payment gateway** (bKash / Nagad — the code is ready, see §6d) | Online payment | COD works today; checkout offers COD only |
| **Product photography** | Every image is a placeholder SVG | The whole "premium" positioning, undone in one screen |
| **SMS gateway** (code ready, see §6c) | Order confirmed/shipped SMS + customer OTP login | No SMS; login is mocked |
| **Email** (SMTP or API) | Order confirmations, staff invites | Customers get no confirmation |
| **Courier API keys** (Pathao / Steadfast / RedX) | Automatic tracking | Manual tracking works today |
| **Real GS1 barcodes** | The Sourcing page tells customers to check them | The 44 present are valid-format but unregistered |

**Payment and photography are the two that matter now.** The rest can wait
until you are taking orders.

---

## 6b. Meta ads — two .env keys and one paste — 5 minutes

The tracking is built on both sides and ships switched off. Turning it on:

1. **Events Manager → your pixel → Settings → Conversions API → Generate
   access token.** In hPanel, add to `.env`:

   ```
   META_PIXEL_ID=<the 15-16 digit pixel id>
   META_CAPI_TOKEN=<the token — this file is the ONLY place it goes>
   ```

   Then `php artisan config:cache` (or just wait for the next deploy, which
   runs it).

2. **Paste the same pixel id** into the `metaPixelId` field of
   `shared/js/core/site-config.js` and push.

Until both are done: no tracking script loads, nothing is sent anywhere, and
the shop behaves exactly as it does today. When both are done, every ad
click, checkout and purchase reports to Meta twice (browser + server) and
deduplicates — which is what lets Meta optimise for buyers instead of
clickers. Each order also records which campaign sold it, visible on the
order screen in the panel.

---

## 6c. SMS to customers — one account, three .env keys

The code is built and dormant (modules/sms). When an order is marked
**confirmed** or **shipped** in the panel, the customer gets a short English
SMS with the order number and the amount to keep ready. Nothing sends until:

1. Open an account at **bulksmsbd.net** (prepaid — a few hundred taka of
   credit is plenty to start). Apply for a **masked sender id** ("GulfRabit")
   on their form; use the default non-masked number while that approves.
2. In hPanel, add to `.env`:

   ```
   SMS_GATEWAY=bulksmsbd
   SMS_API_KEY=<from their panel>
   SMS_SENDER_ID=<approved sender id, or the number they gave>
   ```

   Then `php artisan config:cache` (or wait for the next deploy).

To rehearse without spending credit: `SMS_GATEWAY=log` writes every would-be
message to `storage/logs/laravel.log` instead of sending. Every real attempt
— sent or failed — is recorded in the `sms_logs` table, so "the customer got
no SMS" is a checkable fact, not an argument.

---

## 6d. bKash / Nagad online payment — merchant onboarding, then .env

The full redirect flow is built and dormant (modules/payments): order first,
then the gateway, then back with a server-verified verdict. Until credentials
exist, the checkout shows COD only — nothing half-works.

**bKash** — apply for a **bKash Merchant account + Payment Gateway (Tokenized
Checkout)** at merchant.bkash.com / through their sales desk. Onboarding takes
days-to-weeks and needs the trade licence. They issue sandbox credentials
first — put those in `.env` and test end-to-end, THEN swap to production:

```
BKASH_BASE_URL=https://tokenized.sandbox.bka.sh/v1.2.0-beta
BKASH_APP_KEY=...  BKASH_APP_SECRET=...  BKASH_USERNAME=...  BKASH_PASSWORD=...
```

**Nagad** — merchant onboarding via nagad.com.bd's merchant desk. You generate
an RSA key pair (they explain how); they give you their public key and a
merchant id:

```
NAGAD_BASE_URL=http://sandbox.mynagad.com:10080/remote-payment-gateway-1.0
NAGAD_MERCHANT_ID=...   NAGAD_MERCHANT_NUMBER=<wallet number>
NAGAD_PUBLIC_KEY=<their key, one base64 line>
NAGAD_PRIVATE_KEY=<your key, one base64 line>
```

Both need `APP_URL=https://gulfrabit.com` in `.env` — the return-from-gateway
URLs are built from it. After any `.env` edit: `php artisan config:cache`.

**Important:** this module has been authored against both gateways' documented
APIs but never yet run against their sandboxes (no credentials exist). Budget
an hour with sandbox credentials in hand for the first real run — same honest
deal as the first deploy of the backend itself. Money cannot move until you
deliberately point `BASE_URL` at production.

---

## 6e. Google — Search Console, then Merchant Center

Nothing in the code is waiting on these. Both are accounts, and without the
first one you are guessing about search rather than reading it.

**Search Console — 10 minutes, do it before the ads start.**
`search.google.com/search-console` → add `gulfrabit.com` as a **Domain**
property → it gives you one TXT record → hPanel → DNS → add it. Then submit
`https://gulfrabit.com/sitemap.xml`.

It shows which queries the shop actually appears for, which of the 39 URLs
Google accepted, and it emails you when something breaks. Expect it to be
nearly empty for the first few weeks — a new domain is not a fault.

**Merchant Center — later, worth more than it sounds.**
`merchants.google.com` puts products into the Shopping tab **free**. For an
import shop here that is usually a better return than blog-style SEO, and the
product structured data it wants is already on every product page.

### What is already done in the code

- `sitemap.xml` (39 URLs, regenerated by `tools/sitemap.py`) and `robots.txt`,
  with the staff panel disallowed.
- `Organization` structured data sitewide; `Product` + `Offer` +
  `BreadcrumbList` on every product page — the markup that puts a price and a
  stock status in a search result.
- Canonical URLs, so the `?utm_source=facebook` copies of a page created by
  every ad do not compete with the page itself.
- Real per-product titles and descriptions, including the Open Graph tags a
  WhatsApp preview reads.

### The one real weakness left

Every product is served from **one file** — `product.html?id=gr-1101` — so the
HTML that leaves the server carries a generic title and the real one is written
by JavaScript afterwards. Google renders JavaScript, but the served title is
what usually becomes the search snippet. Giving each product its own URL and
its own file is the largest SEO change still outstanding, and it is a code job,
not one for this list.

> **CrUX.** Google's page-experience signal reads real-visitor speed data from
> the Chrome User Experience Report. There is nothing to sign up for — an
> origin appears once it has enough real Chrome traffic, which this domain does
> not have yet. PageSpeed Insights will say *no field data available*; that is
> expected and is not costing you anything today.

---

## 7. Security housekeeping — 5 minutes

- The **SSH password** you pasted in chat — change it if you have not
  (hPanel → Advanced → SSH Access → Change).
- The **admin password** from `reset-db.log` — put it in a password manager.
  There is no staff password reset built yet.
- Delete `storage/logs/reset-db.log` and `setup.log` in File Manager once
  saved. They are blocked from the web, but there is no reason to keep them.

---

## 8. Optional

- **Backups**: hPanel → Files → Backups. Confirm daily backups are on, and try
  a restore once — before there is real data to lose.
- **Old WordPress database**: delete it whenever you are satisfied nothing was
  missed.

---

## No longer needed

**You do not need to run cron jobs or read log files to manage the shop.**
Categories, products, images and coupons all write straight to the database
from the panel and appear on the site immediately.

`seed-catalog.sh` exists for one case only: if you edit
`modules/catalog/data/*.json` directly in VS Code. Anything done in the admin
panel needs nothing.

`deploy.sh` runs every minute on its own. Push to GitHub and it is live within
the minute — no action from you.
