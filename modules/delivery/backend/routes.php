<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\Delivery\Controllers\DeliveryQuoteController;

/**
 * Delivery module routes.
 *
 * This file is the module's entire routing surface. It is loaded by the module
 * service provider, so deleting modules/delivery/ removes these routes with it
 * and leaves nothing dangling in a global routes file — which is the whole point
 * of the module rule.
 *
 * Mount (in the module's ServiceProvider::boot):
 *   Route::middleware('api')->prefix('api')->group(__DIR__.'/routes.php');
 */

Route::prefix('delivery')->name('delivery.')->group(function (): void {

    // Public: a guest must be able to price delivery before creating an account.
    Route::get('/options', [DeliveryQuoteController::class, 'options'])
        ->name('options');

    Route::get('/districts', [DeliveryQuoteController::class, 'districts'])
        ->name('districts');

    // Throttled: cheap to serve but trivially scriptable, and it is the endpoint
    // an attacker would hammer to enumerate serviceable areas.
    Route::post('/quote', [DeliveryQuoteController::class, 'quote'])
        ->middleware('throttle:60,1')
        ->name('quote');
});
