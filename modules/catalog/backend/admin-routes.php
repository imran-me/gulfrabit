<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\Catalog\Controllers\AdminStockAlertController;

/**
 * The catalogue's one admin write, kept apart from the public read-only file.
 *
 * A SEPARATE file on the `web` stack, exactly as modules/b2b does it: the
 * panel authenticates with a session cookie, which needs the session and CSRF
 * middleware that the `api` group the public catalog routes use deliberately
 * omits.
 *
 * `admin:products` — whoever curates the catalogue is whoever tells people it
 * is back. Not gated on `admin.owner`: this is not destructive, it is the
 * ordinary work of a restock, and requiring an owner to press it on the
 * morning a shipment lands is how forty people never get told.
 */
Route::prefix('admin')->name('admin.')
    ->middleware(['admin', 'admin:products'])
    ->group(function (): void {
        Route::post('/products/{sku}/notify-waiting', [AdminStockAlertController::class, 'send'])
            ->name('products.notify-waiting');
    });
