<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\Highlights\Controllers\AdminHighlightController;
use Modules\Highlights\Controllers\HighlightController;

/**
 * Loaded by HighlightsServiceProvider under the `api` group and prefix.
 */

// Public. The home page reads this before it paints its rails, so it is
// deliberately cheap and needs no session.
Route::get('/highlights/{rail}', [HighlightController::class, 'show'])
    ->name('highlights.show');

// Staff. Same capability as products — curating the front page is a
// merchandising job, done by whoever curates the catalogue.
Route::prefix('admin')
    ->name('admin.highlights.')
    ->middleware(['admin', 'admin:products'])
    ->group(function (): void {
        Route::get('/highlights', [AdminHighlightController::class, 'index'])->name('index');
        // PUT, not PATCH: the whole shelf is replaced, not merged into.
        Route::put('/highlights/{rail}', [AdminHighlightController::class, 'update'])->name('update');
    });
