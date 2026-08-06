<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\Highlights\Controllers\HighlightController;

/**
 * Public routes, loaded by HighlightsServiceProvider under the `api` group.
 * The staff routes live in routes-admin.php and are mounted under `web`,
 * because the panel authenticates with a session and `api` has none.
 */

// Public. The home page reads this before it paints its rails, so it is
// deliberately cheap and needs no session.
Route::get('/highlights/{rail}', [HighlightController::class, 'show'])
    ->name('highlights.show');
