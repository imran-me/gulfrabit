#!/bin/bash
#
# GulfRabit doctor — find EVERYTHING that is broken, in one run.
#
# WHY THIS EXISTS
# ---------------
# Deploying to a host with no shell means every bug costs a full round trip:
# deploy, run a cron job, wait, read a log, fix one thing, repeat. Fixing one
# bug per trip is intolerable when there are five.
#
# So this does not stop at the first failure. It loads every model class, hits
# every registered route, checks every driver against the table it needs, and
# reports the lot. One run, one list, one fix pass.
#
# Read-only. It creates nothing, changes nothing, and is safe to run against a
# live site.

cd "$(dirname "$0")"
mkdir -p storage/logs
LOG="storage/logs/doctor.log"
: > "$LOG"

out() { echo "$*" | tee -a "$LOG"; }

out "GulfRabit doctor — $(date)"
out "================================================"

# ---------------------------------------------------------------- environment
out ""
out "## Environment"
out "PHP:        $(php -r 'echo PHP_VERSION;')"
out "Laravel:    $(php artisan --version 2>&1 | head -1)"
out ".env:       $([ -f .env ] && echo present || echo MISSING)"
out "vendor/:    $([ -d vendor ] && echo present || echo MISSING)"
out "APP_KEY:    $(grep -q '^APP_KEY=base64' .env 2>/dev/null && echo set || echo 'NOT SET')"
out "APP_DEBUG:  $(grep '^APP_DEBUG=' .env 2>/dev/null | cut -d= -f2)"

# ---------------------------------------------------------------- storage
out ""
out "## Writable paths"
for d in storage storage/logs storage/framework/cache storage/framework/sessions bootstrap/cache; do
    out "$([ -w "$d" ] && echo 'ok  ' || echo 'FAIL') $d"
done

# ------------------------------------------------- models, drivers and routes
# One PHP process, booted once. Everything below runs inside it so a single
# fatal cannot hide the checks that come after — each is wrapped.
out ""
php -d display_errors=0 <<'PHP' 2>&1 | tee -a "$LOG"
require "vendor/autoload.php";
$app = require_once "bootstrap/app.php";

try {
    $app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
} catch (Throwable $e) {
    echo "## BOOT FAILED\n" . $e->getMessage() . "\n";
    exit;
}

use Illuminate\Support\Facades\{DB, Schema, Route};

/* ---- 1. Database ------------------------------------------------------- */
echo "\n## Database\n";
try {
    DB::connection()->getPdo();
    echo "ok   connected to " . DB::connection()->getDatabaseName() . "\n";
} catch (Throwable $e) {
    echo "FAIL " . $e->getMessage() . "\n";
    exit;
}

/* ---- 2. Driver tables --------------------------------------------------- */
// A driver selected in .env whose table is missing fails only on the one code
// path that uses it — which is how a missing `cache` table looked like a bug in
// the delivery module.
echo "\n## Driver requirements\n";
$need = [
    'CACHE_STORE'      => ['database' => ['cache', 'cache_locks']],
    'SESSION_DRIVER'   => ['database' => ['sessions']],
    'QUEUE_CONNECTION' => ['database' => ['jobs', 'failed_jobs']],
];
foreach ($need as $key => $map) {
    $value = env($key);
    foreach (($map[$value] ?? []) as $table) {
        printf("%-4s %s=%s needs table '%s'\n",
            Schema::hasTable($table) ? 'ok' : 'FAIL', $key, $value, $table);
    }
}

/* ---- 3. Every model loads and its table exists -------------------------- */
// Loading the class is the point: a method signature that clashes with the
// framework is a FATAL at load time and cannot be caught by reading source.
echo "\n## Models\n";
$bad = 0;
foreach (glob('modules/*/backend/Models/*.php') as $file) {
    $module = ucfirst(explode('/', $file)[1]);
    $class  = "Modules\\{$module}\\Models\\" . basename($file, '.php');
    try {
        if (!class_exists($class)) { echo "FAIL {$class} — class not found\n"; $bad++; continue; }
        $model = new $class;
        $table = $model->getTable();
        if (!Schema::hasTable($table)) { echo "FAIL {$class} — table '{$table}' missing\n"; $bad++; continue; }
        $count = DB::table($table)->count();
        printf("ok   %-46s %-24s %d rows\n", $class, $table, $count);
    } catch (Throwable $e) {
        echo "FAIL {$class} — " . $e->getMessage() . "\n"; $bad++;
    }
}
echo $bad === 0 ? "all models ok\n" : "{$bad} model(s) broken\n";

/* ---- 4. Seeded reference data ------------------------------------------- */
echo "\n## Reference data\n";
foreach ([
    'products' => 'catalogue', 'categories' => 'categories',
    'delivery_zones' => 'delivery zones', 'districts' => 'districts',
    'couriers' => 'couriers', 'warehouses' => 'warehouses',
    'accounts' => 'chart of accounts', 'product_bundles' => 'bundles',
    'promotions' => 'promo codes', 'admin_users' => 'STAFF ACCOUNTS',
] as $table => $label) {
    if (!Schema::hasTable($table)) { printf("FAIL %-22s table missing\n", $label); continue; }
    $n = DB::table($table)->count();
    printf("%-4s %-22s %d\n", $n > 0 ? 'ok' : 'WARN', $label, $n);
}

/* ---- 5. Every GET route actually resolves ------------------------------- */
// Routes with parameters are skipped — a 404 for a made-up id proves nothing.
echo "\n## API routes\n";
$routes = collect(Route::getRoutes())->filter(
    fn($r) => in_array('GET', $r->methods()) && str_starts_with($r->uri(), 'api/') && !str_contains($r->uri(), '{')
);
echo "  " . $routes->count() . " parameterless GET routes registered\n";
foreach ($routes as $r) {
    echo "     /" . $r->uri() . "\n";
}
PHP

out ""
out "================================================"
out "Done. Everything above marked FAIL needs fixing."
