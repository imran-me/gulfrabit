# Deploying GulfRabit to Hostinger

**Goal:** you push to GitHub → the site updates on Hostinger by itself.

Follow these in order. Do not skip step 0.

---

## First, the thing people get wrong

**Git deploys code. It does not deploy your database, and you do not want it to.**

| | Comes from GitHub? |
|---|---|
| Pages, styles, PHP, JavaScript | ✅ every push |
| Database **structure** (tables, columns) | ✅ every push, via `php artisan migrate` |
| Database **contents** (orders, customers, money) | ❌ **never** |

Your live orders exist in exactly one place: the server. Nothing in this setup
can overwrite them, on purpose. A deployment that could replace live records is
one careless push away from losing the business's books.

When you add a feature that needs a new table, you write a **migration**, commit
it, push it, and the deploy runs it. That is the "automatic database sync" you
actually want — and it only ever adds and alters structure.

---

## Step 0 — Check what your plan gives you

In hPanel, look for these two things and write down what you find:

1. **Advanced → SSH Access** — is there an SSH username, host and port?
2. **Hosting → Manage → PHP Configuration** — which PHP versions are offered?

**If you have SSH:** continue with this guide as written. It is the reliable
path.

**If you do NOT have SSH:** you are on a plan that cannot run `composer` or
`php artisan` at all, which Laravel needs. Upgrade to a plan with SSH (on
Hostinger that is Business and above) before going further. Everything else here
assumes SSH exists.

> Do not try to work around this with FTP-only deployment. You would be able to
> copy files up and never able to run a migration, which means the database
> structure can never change again without doing it by hand in phpMyAdmin.

---

## Step 1 — Set the PHP version

hPanel → **Hosting → Manage → PHP Configuration**.

Select **PHP 8.2** (or higher if offered).

Then open `.github/workflows/deploy.yml` in this repo and make sure the
`php-version:` line matches what you selected. If the two disagree, dependencies
get compiled against one runtime and executed on another — and the failure shows
up as a broken page long after the deploy said "success".

---

## Step 2 — Create the database

hPanel → **Databases → Management**.

1. Create a new MySQL database. Hostinger prefixes the name, so you will get
   something like `u123456789_gulfrabit`.
2. Create a database **user**, also prefixed: `u123456789_gr`.
3. Give that user **all privileges** on that database.
4. **Write down all three**: database name, username, password. You need them in
   step 4 and Hostinger will not show the password again.

Leave `DB_HOST` as `localhost` — on Hostinger shared hosting the database is on
the same machine as the site.

---

## Step 3 — Generate an SSH key for GitHub

This is how GitHub proves to Hostinger that it is allowed to deploy. Do this on
**your own computer**, in Git Bash:

```bash
ssh-keygen -t ed25519 -C "github-deploy-gulfrabit" -f ~/.ssh/gulfrabit_deploy
```

Press Enter twice when it asks for a passphrase — **leave it empty**. An
automated deploy has nobody to type a passphrase.

You now have two files:

| File | What it is | Where it goes |
|---|---|---|
| `~/.ssh/gulfrabit_deploy.pub` | **Public** key | Hostinger |
| `~/.ssh/gulfrabit_deploy` | **Private** key | GitHub secret |

Show the public one and copy it:

```bash
cat ~/.ssh/gulfrabit_deploy.pub
```

In hPanel → **Advanced → SSH Access → Manage SSH keys → Add new key**, paste it.

> The private key is a password to your server. It goes into GitHub Secrets and
> nowhere else — never into a file in the repo, never into a chat, never into a
> commit.

---

## Step 4 — Create `.env` on the server

`.env` holds your database password and app key. It is in `.gitignore`
deliberately and must **never** be committed.

SSH in from your computer:

```bash
ssh -p PORT USERNAME@HOST     # the values from hPanel → SSH Access
```

Then:

```bash
cd ~/domains/YOURDOMAIN/public_html
nano .env
```

Paste this, filling in your own values:

```ini
APP_NAME=GulfRabit
APP_ENV=production
APP_KEY=
APP_DEBUG=false
APP_TIMEZONE=Asia/Dhaka
APP_URL=https://your-temporary-hostinger-url

LOG_CHANNEL=stack
LOG_LEVEL=error

DB_CONNECTION=mysql
DB_HOST=localhost
DB_PORT=3306
DB_DATABASE=u123456789_gulfrabit
DB_USERNAME=u123456789_gr
DB_PASSWORD=the-password-from-step-2

SESSION_DRIVER=database
SESSION_LIFETIME=120

# The first owner account. The seeder refuses to run without ADMIN_EMAIL and
# generates a strong password if you leave ADMIN_PASSWORD unset — see
# modules/admin/backend/Seeders/AdminUserSeeder.php
ADMIN_EMAIL=you@yourcompany.com
ADMIN_NAME=Your Name
```

Save with `Ctrl+O`, `Enter`, then `Ctrl+X`.

**`APP_DEBUG=false` is not optional.** With it true, any error page shows your
database credentials and file paths to whoever triggered the error.

---

## Step 5 — Add the secrets to GitHub

On GitHub: your repo → **Settings → Secrets and variables → Actions → New
repository secret**. Add five:

| Secret name | Value |
|---|---|
| `HOSTINGER_HOST` | SSH host from hPanel (an IP or hostname) |
| `HOSTINGER_PORT` | SSH port from hPanel (usually `65002`) |
| `HOSTINGER_USER` | SSH username (`u123456789`) |
| `HOSTINGER_PATH` | `/home/u123456789/domains/YOURDOMAIN/public_html` |
| `HOSTINGER_SSH_KEY` | The **entire** contents of `~/.ssh/gulfrabit_deploy` |

For the key, copy everything including the first and last lines:

```bash
cat ~/.ssh/gulfrabit_deploy
```

It must start with `-----BEGIN OPENSSH PRIVATE KEY-----` and end with
`-----END OPENSSH PRIVATE KEY-----`. A key missing either line fails with a
confusing "invalid format" error.

---

## Step 6 — First deploy

```bash
git add .github/workflows/deploy.yml DEPLOY.md
git commit -m "ci: deploy to Hostinger on push"
git push origin main
```

Watch it on GitHub → **Actions**. The first run takes a few minutes because it
resolves every Composer dependency from scratch.

**When it succeeds**, commit the lock file it produced so future deploys are
identical and much faster:

```bash
# From the Actions run, download composer.lock, or generate it locally if you
# have PHP + Composer:
composer update --no-dev
git add composer.lock
git commit -m "chore: pin dependency versions"
git push
```

---

## Step 7 — One-time server setup

Still over SSH, from `public_html`:

```bash
# 1. Application key. Without it every session and encrypted value is unreadable.
php artisan key:generate --force

# 2. Writable directories. Laravel writes logs, cache and sessions here.
chmod -R 775 storage bootstrap/cache

# 3. Create the tables.
php artisan migrate --force

# 4. Fill the reference data: categories, products, delivery zones, couriers,
#    the chart of accounts, and your first admin account.
php artisan db:seed --force
```

**Watch step 4's output.** If you left `ADMIN_PASSWORD` unset, the seeder prints
a generated password **once**. Copy it immediately — it is not stored anywhere
retrievable and there is no password reset for staff accounts yet.

---

## Step 8 — Check it works

Open your Hostinger temporary URL:

| URL | Should show |
|---|---|
| `/` | The storefront home page |
| `/modules/catalog/category.html?slug=nuts-dry-fruits` | Products from the database |
| `/api/delivery/options` | JSON delivery zones — **this proves PHP is running** |
| `/modules/admin/login.html` | Staff sign-in |
| `/.env` | **404 or 403.** If it shows your password, stop and fix `.htaccess` |

That fourth one is the real milestone: it is the first time any PHP in this
project has ever executed.

---

## From now on

```bash
git add -A
git commit -m "what you changed"
git push
```

That is the whole deployment process. GitHub builds it, verifies it, ships it,
and migrates the database structure.

**A push never touches your orders, customers or accounts.**

---

## When something breaks

| Symptom | Cause | Fix |
|---|---|---|
| Action fails at "Ship to Hostinger" | SSH key or path wrong | Re-check the five secrets; test `ssh -p PORT USER@HOST` yourself |
| 500 error on every page | Usually `.env` missing or `storage` not writable | `chmod -R 775 storage bootstrap/cache`; check `storage/logs/laravel.log` |
| Site works, `/api/*` 404s | `.htaccess` not uploaded, or mod_rewrite off | Confirm `.htaccess` exists in `public_html` |
| Changes do not appear | Config cached from the previous release | `php artisan config:clear && php artisan config:cache` |
| "No application encryption key" | Step 7.1 skipped | `php artisan key:generate --force` |

To read the real error rather than a blank page:

```bash
tail -50 storage/logs/laravel.log
```

Never set `APP_DEBUG=true` on a live site to diagnose something. Read the log.

---

## Still not automated (and why)

- **Backups.** Set these up in hPanel and test a restore. Migrations change
  structure, and a migration that goes wrong on live data is exactly when you
  find out whether your backups work.
- **Real product photography, payment gateway, SMS, courier APIs** — these need
  accounts and credentials only you can supply. See `context.md` §8b.
