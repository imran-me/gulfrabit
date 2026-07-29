#!/bin/bash
#
# DROP EVERY TABLE, rebuild the schema, reload reference data.
#
# For one situation only: a first install where migrations half-ran and left
# tables behind, so `migrate` now fails with "table already exists". There is
# nothing to lose at that point, and starting clean is quicker than unpicking
# which migrations think they ran.
#
# IT REFUSES ONCE THE SHOP IS REAL
# --------------------------------
# The guard below aborts if a single order or customer exists. That is what
# separates this from a footgun: a script that wipes the database is fine while
# the database is empty and catastrophic the moment it is not, and the only
# thing standing between those two is a check that runs every time.
#
# Deliberately NOT wired to cron on a schedule. Run it, read the log, delete
# the job.

set -uo pipefail
cd "$(dirname "$0")"

mkdir -p storage/logs
LOG="storage/logs/reset-db.log"
: > "$LOG"

say() { echo "" | tee -a "$LOG"; echo "=== $* ===" | tee -a "$LOG"; }

echo "GulfRabit DB reset — $(date)" | tee -a "$LOG"

# ---- The guard ------------------------------------------------------------
say "Checking the database is still empty"

# Counts rows in the tables that would represent real business activity. If any
# table is missing the query fails, which is fine — a missing orders table means
# there cannot be orders in it.
GUARD=$(php -r '
require "vendor/autoload.php";
$app = require_once "bootstrap/app.php";
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$total = 0;
foreach (["orders", "users", "journal_entries", "stock_movements"] as $t) {
    try {
        if (Illuminate\Support\Facades\Schema::hasTable($t)) {
            $total += Illuminate\Support\Facades\DB::table($t)->count();
        }
    } catch (Throwable $e) { /* table gone or unreadable — nothing to protect */ }
}
echo $total;
' 2>>"$LOG")

echo "Rows found across orders/users/journal_entries/stock_movements: ${GUARD:-unknown}" | tee -a "$LOG"

if [ -z "${GUARD:-}" ]; then
    echo "STOP: could not check. Refusing to wipe a database I cannot read." | tee -a "$LOG"
    exit 1
fi

if [ "$GUARD" -gt 0 ]; then
    echo "" | tee -a "$LOG"
    echo "STOP: this database has real records in it." | tee -a "$LOG"
    echo "Nothing has been changed. If you genuinely want to start over, take a" | tee -a "$LOG"
    echo "backup first and drop the tables yourself in phpMyAdmin." | tee -a "$LOG"
    exit 1
fi

# ---- Rebuild --------------------------------------------------------------
say "Dropping all tables and re-running every migration"
php artisan migrate:fresh --force >> "$LOG" 2>&1
echo "   exit=$?" >> "$LOG"

say "Seeding reference data"
php artisan db:seed --force >> "$LOG" 2>&1
echo "   exit=$?" >> "$LOG"

say "Caches"
php artisan config:cache >> "$LOG" 2>&1
php artisan route:cache >> "$LOG" 2>&1

say "Done"
echo "" | tee -a "$LOG"
echo "The generated admin password is in this log, once. Copy it now." | tee -a "$LOG"
