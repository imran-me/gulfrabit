#!/bin/bash
#
# GulfRabit deploy — run on the Hostinger server, by cron or by hand.
#
# Pulls whatever is on GitHub's main branch, installs dependencies, applies
# database MIGRATIONS, and rebuilds caches.
#
# WHAT IT WILL NOT DO
# -------------------
# It never touches your data. `migrate` changes table STRUCTURE; it does not
# copy, replace or delete rows. Orders, customers and the ledger live on this
# server and nowhere else — there is no step here that could overwrite them.
#
# WHY IT EXITS EARLY WHEN NOTHING CHANGED
# ---------------------------------------
# Cron runs this every few minutes. Without the check below, every run would
# reinstall dependencies and rebuild caches — and rebuilding the config cache
# takes the site down for a fraction of a second each time. Doing that all day
# for no reason is how a deploy script becomes the cause of outages.

set -euo pipefail

cd "$(dirname "$0")"

LOG="storage/logs/deploy.log"
mkdir -p storage/logs

say() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }

# ---- 1. Is there anything new? ------------------------------------------
git fetch origin main --quiet

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" = "$REMOTE" ]; then
    exit 0            # nothing to do, and nothing logged — cron runs constantly
fi

say "Deploying ${LOCAL:0:7} -> ${REMOTE:0:7}"

# ---- 2. Take the new code -------------------------------------------------
# `reset --hard` rather than `pull`: the server is a deployment target, not a
# place anyone edits. If a file here differs from GitHub, GitHub is right, and a
# merge conflict on a live server at 3am helps nobody.
git reset --hard origin/main --quiet
say "Code updated"

# ---- 3. Dependencies ------------------------------------------------------
# Only when composer.json or composer.lock actually changed. Reinstalling
# unchanged dependencies on every deploy wastes a minute and risks nothing but
# still risks it.
if git diff --name-only "$LOCAL" "$REMOTE" | grep -qE '^composer\.(json|lock)$'; then
    say "Dependencies changed — installing"
    composer install --no-dev --optimize-autoloader --no-interaction
else
    say "Dependencies unchanged — skipped"
fi

# ---- 4. Database STRUCTURE ------------------------------------------------
# --force because there is nobody at a keyboard to confirm the prompt.
# Structure only. Your rows are untouched.
say "Applying migrations"

# The exit code is CHECKED. This used to run bare, and a migration that failed
# left the deploy carrying on to cache routes and report success — so new code
# went live against an old schema, and the only symptom was a screen returning
# 500 some time later with nothing in the deploy log to connect it to.
#
# It does not abort the deploy: the code is already on disk from the reset
# above, so stopping here would leave the caches stale as well as the schema,
# which is strictly worse. It makes the failure loud instead, and the panel's
# setup check (GET /api/admin/health) reports the missing tables on the
# dashboard so somebody actually sees it.
if ! php artisan migrate --force; then
    say "!!! MIGRATION FAILED — the schema is behind the code."
    say "!!! Read the error above. The admin dashboard will list what is missing."
fi

# ---- 5. Caches ------------------------------------------------------------
# Rebuilt AFTER the code lands, never before, or they would cache the previous
# release's config and routes.
say "Rebuilding caches"
php artisan config:cache --quiet
php artisan route:cache --quiet
# view:cache is deliberately absent. GulfRabit renders no Blade templates —
# the storefront is static HTML built by tools/assemble.py and Laravel serves
# JSON only. There is no resources/views directory to compile, and calling it
# fails the whole step for nothing.

# ---- 6. Image copies ------------------------------------------------------
# The storefront derives a thumbnail's URL from the master's path rather than
# being told it — every consumer stores a plain path string, which is what
# lets modules/media be deleted without breaking a product. The cost is that a
# derived URL which does not exist is a 404 inside a <picture><source>, and a
# <source> that fails does NOT fall back to the <img>; it shows a broken image.
#
# So the copies have to exist before the page asks for them, and the only way
# to guarantee that ordering is to do it here, in the same breath as the
# deploy. Idempotent and cheap: images that already have their copies are
# skipped without being decoded.
say "Writing image copies"
php artisan media:tiers || say "!!! media:tiers failed — uploaded images will serve full size."

say "Done — now on ${REMOTE:0:7}"
