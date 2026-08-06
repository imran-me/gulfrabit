<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\Highlights\Controllers\AdminHighlightController;

/*
 * Admin routes, mounted under `web` by HighlightsServiceProvider so the
 * session cookie the panel signs in with is actually read. They were in
 * routes.php under `api`, which is stateless — so the Home page screen
 * could load its shell and then 401 on every save.
 */
Route::prefix('admin')
    ->name('admin.highlights.')
    ->middleware(['admin', 'admin:products'])
    ->group(function (): void {
        Route::get('/highlights', [AdminHighlightController::class, 'index'])->name('index');
        // PUT, not PATCH: the whole shelf is replaced, not merged into.
        Route::put('/highlights/{rail}', [AdminHighlightController::class, 'update'])->name('update');
    });
