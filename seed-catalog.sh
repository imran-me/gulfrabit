#!/bin/bash
#
# Re-seed the catalogue: categories and products from the module JSON files.
#
# Run this after editing modules/catalog/data/*.json in VS Code. Anything you
# change in the ADMIN PANEL needs nothing — it is already in the database.
#
# WHY THIS IS A SCRIPT AND NOT A CRON ONE-LINER
# ---------------------------------------------
# The equivalent one-liner needs quotes around the seeder class, because the
# namespace contains backslashes. hPanel's cron field mangles them and bash ends
# up seeing `cd` with several arguments. A script file takes no quoting at all:
#
#     /bin/bash /home/u239665931/domains/gulfrabit.com/public_html/seed-catalog.sh
#
# WHAT IT WILL AND WILL NOT DO
# ----------------------------
# CatalogSeeder uses updateOrCreate, so this ADDS new categories and products
# and UPDATES existing ones to match the JSON. It deletes nothing.
#
# It will also overwrite a price you edited in the admin panel, if the JSON
# still holds the old one. That is exactly why deploy.sh does not run seeds —
# this is a deliberate act, not something that should happen on every push.

set -uo pipefail
cd "$(dirname "$0")"

mkdir -p storage/logs
LOG="storage/logs/seed.log"
: > "$LOG"

echo "Catalogue seed — $(date)" | tee -a "$LOG"
echo "" | tee -a "$LOG"

# SINGLE quotes around the class. The namespace separator is a backslash, and
# unquoted bash reads `\C` as an escaped C and drops the backslash — PHP then
# received `ModulesCatalogSeedersCatalogSeeder` and could not find it. Double
# quotes would not help either; only single quotes stop bash touching it.
php artisan db:seed --class='Modules\Catalog\Seeders\CatalogSeeder' --force >> "$LOG" 2>&1
echo "exit=$?" | tee -a "$LOG"

echo "" | tee -a "$LOG"
php artisan config:cache >> "$LOG" 2>&1

echo "" | tee -a "$LOG"
echo "Done. Open the Categories screen in the admin panel to confirm." | tee -a "$LOG"
