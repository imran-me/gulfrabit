# Things only you can do

Last updated 2026-07-30.

Everything here needs a human with hPanel access, an account, or a decision.
Nothing on this list can be done from the code.

Do them in this order. The first four take about half an hour together and
unblock everything else.

---

## 1. Run the migrations — 2 minutes ⚠ do this one first

Three migrations never ran on the server. `deploy.sh` used to run them without
checking the exit code, so one failed and the deploy carried on and reported
success. That is fixed — it shouts now — but the three still need applying.

**The shop is fine.** The home page falls back to its old behaviour and
customers see nothing wrong. What does not work until this is done: uploading
images, coupons scoped to particular products, and the Home page screen.

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
| **Payment gateway** (bKash / Nagad / SSLCommerz) | The shop cannot take money | Checkout is a form that goes nowhere |
| **Product photography** | Every image is a placeholder SVG | The whole "premium" positioning, undone in one screen |
| **SMS gateway** | Customer OTP login | Login is mocked |
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
