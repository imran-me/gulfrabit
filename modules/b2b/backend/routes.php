<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\B2b\Controllers\QuoteController;

/**
 * B2B module routes.
 *
 * Submitting is PUBLIC. Procurement staff routinely request quotes before
 * anyone creates an account, and forcing a signup loses the lead outright.
 * Reading one back is not public — see QuoteController::show().
 */

Route::prefix('b2b')->name('b2b.')->group(function (): void {

    // Tighter than the order throttle: an RFQ creates a lead a human then has
    // to read, so flooding it wastes staff time rather than just server time.
    Route::post('/quotes', [QuoteController::class, 'store'])
        ->middleware('throttle:5,1')
        ->name('quotes.store');

    Route::get('/quotes/{quote}', [QuoteController::class, 'show'])
        ->middleware('throttle:30,1')
        ->name('quotes.show');

    Route::post('/price-check', [QuoteController::class, 'priceCheck'])
        ->middleware('throttle:60,1')
        ->name('price-check');
});
