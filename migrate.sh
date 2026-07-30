#!/bin/bash
#
# Apply pending database migrations, and SHOW what happens.
#
#     /bin/bash /home/u239665931/domains/gulfrabit.com/public_html/migrate.sh
#
# WHEN YOU NEED THIS
# ------------------
# You should not, normally — deploy.sh runs migrations on every push. This is
# for the case where one FAILED and the deploy carried on: new code is live
# against an old schema, and a screen returns an error with no obvious cause.
#
# The admin dashboard's setup check names the first migration that has not run.
# This script is how you see WHY it did not.
#
# It prints to the terminal as well as the log, so if you run it over SSH you
# read the answer immediately instead of opening a file afterwards.

set -uo pipefail
cd "$(dirname "$0")"

mkdir -p storage/logs
LOG="storage/logs/migrate.log"
: > "$LOG"

echo "GulfRabit — migrations, $(date)" | tee -a "$LOG"
echo "" | tee -a "$LOG"

echo "--- What is pending -------------------------------------------------" | tee -a "$LOG"
php artisan migrate:status 2>&1 | tee -a "$LOG"

echo "" | tee -a "$LOG"
echo "--- Applying --------------------------------------------------------" | tee -a "$LOG"

# No --quiet, and stderr kept. The error message is the entire point of running
# this by hand; swallowing it would leave you exactly where you started.
php artisan migrate --force 2>&1 | tee -a "$LOG"
STATUS=${PIPESTATUS[0]}

echo "" | tee -a "$LOG"

if [ "$STATUS" -eq 0 ]; then
    echo "OK — schema is up to date." | tee -a "$LOG"
    # Rebuilt because a migration can change what a cached config or route
    # closure resolves to. Cheap, and skipping it is a confusing half-fix.
    php artisan config:cache --quiet 2>&1 | tee -a "$LOG"
    php artisan route:cache  --quiet 2>&1 | tee -a "$LOG"
    echo "Caches rebuilt. Reload the admin dashboard — the setup check should be gone." | tee -a "$LOG"
else
    echo "FAILED (exit $STATUS)." | tee -a "$LOG"
    echo "" | tee -a "$LOG"
    echo "The FIRST error above is the real one — every migration after it is" | tee -a "$LOG"
    echo "blocked behind it, not broken itself. Send me that line." | tee -a "$LOG"
fi
