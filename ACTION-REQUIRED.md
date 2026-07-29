# Things only you can do

Everything here needs a human with hPanel access, an account, or a decision.
Nothing on this list can be done from the code.

---

## 1. Run the seeder once — 2 minutes

**Why:** the nine new categories (Dates, Honey, Beverage, Dry Fruits, Spices,
Nuts & Makhana, Baby Food, Herbs, Oil & Ghee) exist in the code but not yet in
the live database.

`deploy.sh` deliberately does not seed — if it did, every deploy would overwrite
prices you had edited in the admin panel with whatever is in the JSON file.

**Steps** — hPanel → Advanced → Cron Jobs → Create:

```
/bin/bash -c "cd /home/u239665931/domains/gulfrabit.com/public_html && php artisan db:seed --class='Modules\Catalog\Seeders\CatalogSeeder' --force > storage/logs/seed.log 2>&1"
```

Wait 2 minutes → **delete the cron job** → check
`storage/logs/seed.log` shows no errors.

Then open the admin panel's Categories screen — you should see 18 categories.

> Repeat this same step whenever you edit `products.json` or `categories.json`
> directly in VS Code. Anything you change *in the admin panel* needs nothing.

---

## 2. Decide which categories to switch off — 5 minutes

**gulfrabit.com/modules/admin/categories.html**

The six older categories are still live: Gadgets & Electronics, Kitchen & Home,
Fashion, Beauty & Personal Care, Office Supplies, Industrial Raw Materials.

Switching **Live** off hides the category and every product in it. Nothing is
deleted, and switching it back restores everything.

`Nuts & Dry Fruits` now overlaps with the new `Dry Fruits` and `Nuts & Makhana`
— worth deciding which of the three you actually want.

---

## 3. Get these accounts — the real blockers

In order of how much they unblock:

| What | Why it matters | Without it |
|---|---|---|
| **Payment gateway** (bKash / Nagad / SSLCommerz) | The shop cannot take money | Checkout is a form that goes nowhere |
| **Cost prices per product** | Gross profit and margin | The P&L honestly reports "cost not recorded" |
| **Product photography** | Everything is a placeholder SVG | Also blocks responsive images |
| **SMS gateway** | Customer OTP login | Login is mocked |
| **Email** (SMTP or API) | Order confirmations, staff invites | Customers get no confirmation |
| **Courier API keys** (Pathao / Steadfast / RedX) | Automatic tracking | Manual tracking works today |
| **Real GS1 barcodes** | The Sourcing page tells customers to check them | The 44 present are valid-format but unregistered |

**Cost prices are the cheapest win.** Admin → Products → filter "Missing cost"
→ type the figure from your supplier invoice. Each one you fill makes the P&L
more real.

---

## 4. Security housekeeping

- The **SSH password** you pasted in chat — change it if you have not
  (hPanel → Advanced → SSH Access → Change).
- The **admin password** from `reset-db.log` — make sure it is in a password
  manager. There is no staff password reset built yet.
- Delete `storage/logs/reset-db.log` and `setup.log` from File Manager once
  saved; they are blocked from the web but there is no reason to keep them.

---

## 5. Optional

- **Backups**: hPanel → Files → Backups. Confirm daily backups are on and try a
  restore once, before there is real data to lose.
- **Old WordPress database**: delete it whenever you are satisfied nothing was
  missed.
