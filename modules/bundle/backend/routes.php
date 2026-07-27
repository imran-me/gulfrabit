<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\Bundle\Controllers\BundleController;

/**
 * Bundle module routes — the module's entire routing surface.
 *
 * Loaded by BundleServiceProvider, so deleting modules/bundle/ takes these with
 * it and leaves nothing dangling in a global routes file.
 */

Route::prefix('bundles')->name('bundles.')->group(function (): void {

    // Public and cacheable: a pairing is catalogue data, identical for every
    // visitor. The co-purchase aggregate behind it is computed server-side and
    // never exposes an individual order.
    Route::get('/{sku}', [BundleController::class, 'show'])
        ->where('sku', '[A-Za-z0-9\-]{1,32}')
        ->name('show');
});
