<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\Reviews\Controllers\AdminReviewController;
use Modules\Reviews\Controllers\ReviewController;

/**
 * Reviews — three audiences, three guards.
 *
 * Mounted by ReviewsServiceProvider under `web` with the `api` prefix, the
 * same as every other module here: the storefront and the panel both
 * authenticate with a session cookie, and the stateless `api` group would see
 * every request as a stranger.
 */

/* ---- Public: reading reviews -------------------------------------------
 * No auth. This is the part of the feature a search engine and a signed-out
 * shopper both need, and it exposes nothing a product page does not already
 * show. Sits under /catalog/products/{slug}/reviews so it reads as part of
 * the product, which is what it is.
 */
Route::get('/catalog/products/{slug}/reviews', [ReviewController::class, 'index'])
    ->name('catalog.products.reviews');

/* ---- Customer: writing one ---------------------------------------------
 * `auth:sanctum` matches modules/account. Eligibility is deliberately OUTSIDE
 * the guard: it has a real answer for a signed-out visitor — "sign in to
 * review this" — and behind the guard that would arrive as a 401, which the
 * storefront shows as a session that expired.
 */
Route::get('/reviews/eligibility/{slug}', [ReviewController::class, 'eligibility'])
    ->name('reviews.eligibility');

Route::middleware('auth:sanctum')->group(function (): void {
    // Rate-limited because it is a public write that costs a person's
    // attention: every submission becomes an item in the merchant's queue,
    // and a form that can be posted a hundred times a minute is a queue
    // nobody can work. Well below the app default, like OTP and promo codes.
    Route::post('/reviews/{slug}', [ReviewController::class, 'store'])
        ->middleware('throttle:6,1')
        ->name('reviews.store');
});

/* ---- Staff: the queue ---------------------------------------------------
 * Gated on `products`, not a capability of its own. Whoever curates the
 * catalogue is who decides what is said about it — the same argument
 * modules/media makes for filing images under the products capability.
 */
Route::prefix('admin')
    ->name('admin.reviews.')
    ->middleware(['admin', 'admin:products'])
    ->group(function (): void {
        Route::get('/reviews', [AdminReviewController::class, 'index'])->name('index');
        Route::patch('/reviews/{review}', [AdminReviewController::class, 'update'])->name('update');

        // Deleting is owner-only, like every other delete in the panel.
        // Rejecting is the reversible move and needs no such gate.
        Route::middleware('admin:products.delete')->group(function (): void {
            Route::delete('/reviews/{review}', [AdminReviewController::class, 'destroy'])->name('destroy');
        });
    });
