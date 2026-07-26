<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\Catalog\Controllers\CategoryController;
use Modules\Catalog\Controllers\ProductController;

/**
 * Catalog module routes — the module's entire routing surface.
 *
 * Loaded by CatalogServiceProvider from inside this folder, so deleting
 * modules/catalog/ takes these endpoints with it.
 *
 * All read-only and public: the catalog is the shop window. Write operations
 * (admin product management) will live behind an auth middleware group when
 * that module exists, not here.
 */

Route::prefix('catalog')->name('catalog.')->group(function (): void {

    Route::get('/products',       [ProductController::class, 'index'])->name('products.index');
    Route::get('/products/{product}', [ProductController::class, 'show'])->name('products.show');

    // Declared BEFORE the wildcard would ever catch them is unnecessary here
    // because the wildcard is scoped under /products, but keep them grouped.
    Route::get('/suggest',        [ProductController::class, 'suggest'])
        ->middleware('throttle:120,1')          // typed on every keystroke (debounced)
        ->name('suggest');

    Route::get('/deals',          [ProductController::class, 'deals'])->name('deals');

    Route::get('/categories',     [CategoryController::class, 'index'])->name('categories.index');
    Route::get('/categories/{category}', [CategoryController::class, 'show'])->name('categories.show');
});
