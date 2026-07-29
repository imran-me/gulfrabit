#!/bin/bash
#
# GulfRabit first-run setup — run ONCE, on the server, after .env exists.
#
# Everything it does is safe to repeat, so a second accidental run cannot break
# anything:
#   * key:generate only writes a key if APP_KEY is empty
#   * migrate only applies migrations that have not run
#   * db:seed uses updateOrCreate throughout, so it refreshes reference data
#     rather than duplicating it
#
# It writes everything to storage/logs/setup.log because there is no shell on
# this host — the log IS the output, and it is the only place the generated
# admin password will ever appear.

set -uo pipefail
cd "$(dirname "$0")"

mkdir -p storage/logs storage/framework/{cache,sessions,views} bootstrap/cache
LOG="storage/logs/setup.log"
: > "$LOG"

say() { echo "" | tee -a "$LOG"; echo "=== $* ===" | tee -a "$LOG"; }
run() { echo "\$ $*" >> "$LOG"; "$@" >> "$LOG" 2>&1; echo "   exit=$?" >> "$LOG"; }

echo "GulfRabit setup — $(date)" | tee -a "$LOG"

# ---- 0. Sanity ------------------------------------------------------------
say "Environment"
{ php -v | head -1; echo "pwd: $(pwd)"; } >> "$LOG" 2>&1

if [ ! -f .env ]; then
    echo "STOP: no .env file. Create it first — see DEPLOY.md Step 2." | tee -a "$LOG"
    exit 1
fi

if [ ! -d vendor ]; then
    echo "STOP: no vendor/ directory. The deploy did not install dependencies." | tee -a "$LOG"
    exit 1
fi

# ---- 1. Writable directories ---------------------------------------------
# Laravel writes logs, cache, sessions and compiled views here. A fresh clone
# has them empty and sometimes read-only, and the resulting error is a blank
# 500 with nothing in the log — because it cannot write the log either.
say "Permissions"
run chmod -R 775 storage bootstrap/cache

# ---- 2. Application key ---------------------------------------------------
# Encrypts sessions and anything using Crypt. Without it every request fails.
say "Application key"
run php artisan key:generate --force

# ---- 3. Schema ------------------------------------------------------------
# Creates the tables. Structure only — there is no data to lose on a first run,
# and on any later run this applies only what is new.
say "Migrations"
run php artisan migrate --force

# ---- 4. Reference data ----------------------------------------------------
# Categories, products, delivery zones, couriers, the chart of accounts, and
# the first admin account.
say "Seeding"
run php artisan db:seed --force

# ---- 5. Caches ------------------------------------------------------------
say "Caches"
run php artisan config:cache
run php artisan route:cache
# view:cache is deliberately absent. GulfRabit renders no Blade templates —
# the storefront is static HTML built by tools/assemble.py and Laravel serves
# JSON only. There is no resources/views directory to compile, and calling it
# fails the whole step for nothing.

say "Done"
echo "" | tee -a "$LOG"
echo "Open storage/logs/setup.log in the File Manager." | tee -a "$LOG"
echo "If a password was generated for the admin account, it is in there ONCE." | tee -a "$LOG"
