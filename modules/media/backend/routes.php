<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\Media\Controllers\FolderController;
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
 * Loaded by MediaServiceProvider under the `web` middleware group with the
 * `api` prefix, so these sit at /api/admin/media. `web` because the panel
 * authenticates with a session cookie — see the provider.
 */
Route::prefix('admin')
    ->name('admin.media.')
    ->middleware(['admin', 'admin:products'])
    ->group(function (): void {
        // Folders first. `/media/folders` would otherwise be a candidate for
        // `/media/{asset}` on a PATCH or DELETE, and the router takes the
        // first match — which would make renaming a folder an attempt to edit
        // an image called "folders".
        Route::get('/media/folders', [FolderController::class, 'index'])->name('folders.index');
        Route::post('/media/folders', [FolderController::class, 'store'])->name('folders.store');
        Route::patch('/media/folders/{folder}', [FolderController::class, 'update'])->name('folders.update');
        Route::delete('/media/folders/{folder}', [FolderController::class, 'destroy'])->name('folders.destroy');

        Route::get('/media', [MediaController::class, 'index'])->name('index');
        Route::post('/media', [MediaController::class, 'store'])->name('store');
        Route::post('/media/move', [MediaController::class, 'move'])->name('move');
        Route::patch('/media/{asset}', [MediaController::class, 'update'])->name('update');
        Route::delete('/media/{asset}', [MediaController::class, 'destroy'])->name('destroy');
    });
