<?php

declare(strict_types=1);

namespace Modules\Admin\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * "Is the server actually set up?" — answered in the browser, by a logged-in
 * member of staff, in plain words.
 *
 * WHY THIS EXISTS. Every previous answer to that question was a cron job that
 * wrote a log file the owner then had to open in File Manager. That is a poor
 * way to ask a yes/no question, and it is the reason a failed migration can sit
 * unnoticed until a screen 500s.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. No paths, no credentials, no versions of
 * anything an attacker could match against a CVE list beyond the PHP minor,
 * and no raw exception text. It is behind the admin session, but a staff
 * account is not a reason to hand out a map of the host. Every check answers
 * "working / not working" plus what to do about it.
 */
class AdminHealthController extends Controller
{
    /**
     * Tables the panel needs, and which screen breaks without each.
     *
     * Listed by hand rather than read from the migrations directory: the point
     * is to catch a migration that did not run, and deriving the list from the
     * same files that failed to run would always agree with itself.
     */
    private const TABLES = [
        'products'          => 'Products',
        'categories'        => 'Categories',
        'orders'            => 'Orders',
        'promotions'        => 'Coupons',
        'promotion_targets' => 'Coupons scoped to particular products',
        'media_assets'      => 'Images',
        'highlights'        => 'Home page shelves',
        'stock_movements'   => 'Stock',
        'journal_entries'   => 'Profit & loss',
    ];

    /** GET /api/admin/health */
    public function index(): JsonResponse
    {
        $checks = [];

        // ---- database tables ------------------------------------------
        $missing = [];

        foreach (self::TABLES as $table => $screen) {
            if (! Schema::hasTable($table)) {
                $missing[] = "{$screen} (`{$table}`)";
            }
        }

        $checks[] = [
            'name'   => 'Database tables',
            'ok'     => $missing === [],
            'detail' => $missing === []
                ? count(self::TABLES) . ' expected tables present.'
                : 'Missing: ' . implode(', ', $missing),
            'fix'    => $missing === []
                ? null
                // The deploy runs migrations every time, so a missing table
                // means one failed rather than that nobody ran it.
                : 'A migration did not finish. Run `php artisan migrate --force` '
                    . 'over SSH and read what it prints — the first error is the real one.',
        ];

        // ---- image uploads ---------------------------------------------
        $gd = extension_loaded('gd');

        $checks[] = [
            'name'   => 'Image uploads (GD)',
            'ok'     => $gd,
            'detail' => $gd
                ? 'GD is enabled — photos can be uploaded and re-encoded.'
                : 'The GD extension is off, so every upload will be refused.',
            'fix'    => $gd
                ? null
                : 'hPanel → Advanced → PHP Configuration → PHP Extensions → tick `gd` → Save.',
        ];

        $uploads = base_path('uploads');
        $writable = is_dir($uploads) ? is_writable($uploads) : is_writable(base_path());

        $checks[] = [
            'name'   => 'Uploads folder',
            'ok'     => $writable,
            'detail' => $writable
                ? 'Writable — new photos can be saved.'
                : 'Not writable, so uploads will fail even with GD on.',
            'fix'    => $writable ? null : 'Set the `uploads` folder to 755 in File Manager.',
        ];

        // ---- is there anything in the shop -----------------------------
        try {
            $products = DB::table('products')->whereNull('deleted_at')->count();
            $live = DB::table('products')->whereNull('deleted_at')->where('is_active', true)->count();

            $checks[] = [
                'name'   => 'Catalogue',
                'ok'     => $live > 0,
                'detail' => "{$products} products, {$live} listed on the site.",
                'fix'    => $live > 0 ? null : 'Nothing is listed. Switch a product on, or add one.',
            ];
        } catch (\Throwable) {
            $checks[] = [
                'name'   => 'Catalogue',
                'ok'     => false,
                'detail' => 'Could not read the products table.',
                'fix'    => 'See the database check above.',
            ];
        }

        // ---- how far behind is the code --------------------------------
        $checks[] = [
            'name'   => 'PHP',
            'ok'     => version_compare(PHP_VERSION, '8.2', '>='),
            'detail' => 'Running PHP ' . PHP_MAJOR_VERSION . '.' . PHP_MINOR_VERSION . '.',
            'fix'    => version_compare(PHP_VERSION, '8.2', '>=')
                ? null
                : 'This build needs PHP 8.2 or newer. hPanel → Advanced → PHP Configuration.',
        ];

        return response()->json([
            'data' => [
                'ok'     => ! collect($checks)->contains(fn (array $c): bool => ! $c['ok']),
                'checks' => $checks,
            ],
        ]);
    }
}
