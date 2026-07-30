<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\Media\Controllers\MediaController;

/**
 * Media library routes — staff only, all of them.
 *
 * Gated on the `products` capability rather than a new `media` one. The roles
 * that touch images are the roles that touch the catalogue and the site's
 * content: owner and manager. Warehouse and accounts have no reason to add or
 * remove a product photo, and inventing a separate capability would let those
 * two drift apart for no benefit.
 *
 * Loaded by MediaServiceProvider under the `api` middleware group with the
 * `api` prefix, so these sit at /api/admin/media.
 */
Route::prefix('admin')
    ->name('admin.media.')
    ->middleware(['admin', 'admin:products'])
    ->group(function (): void {
        Route::get('/media', [MediaController::class, 'index'])->name('index');
        Route::post('/media', [MediaController::class, 'store'])->name('store');
        Route::patch('/media/{asset}', [MediaController::class, 'update'])->name('update');
        Route::delete('/media/{asset}', [MediaController::class, 'destroy'])->name('destroy');
    });
