<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\Marketing\Controllers\AdminAnalyticsController;
use Modules\Marketing\Controllers\AdminCampaignController;
use Modules\Marketing\Controllers\AdminAdSpendController;
use Modules\Marketing\Controllers\AdminPixelController;

/*
 * Admin routes, mounted under `web` by MarketingServiceProvider — the
 * panel's session lives there. POST /api/track stays in routes.php on
 * `api`: it is called by every storefront page, tokenises nothing, and a
 * CSRF check would reject all of it.
 */
/*
 * The campaigns report — which ad sold what. Behind the same capability as
 * the orders screen, because it is the orders screen's data wearing a
 * different grouping; anyone allowed to see revenue per order may see it
 * per campaign, and nobody else.
 */
Route::get('admin/marketing/campaigns', [AdminCampaignController::class, 'index'])
    ->middleware(['admin', 'admin:orders'])
    ->name('marketing.campaigns');

/*
 * The pixel dashboard - the shop's own copy of its funnel.
 *
 * Same capability as the campaigns report and the orders screen: this is the
 * same revenue seen from the visitor's side, and the drop-off between two
 * steps is commercially sensitive in exactly the way order data is.
 *
 * The session id in the footprint route is an opaque random string from the
 * browser, not a database id - there is nothing to enumerate towards, and it
 * identifies a visit rather than a person.
 */
Route::get('admin/marketing/analytics', [AdminAnalyticsController::class, 'index'])
    ->middleware(['admin', 'admin:orders'])
    ->name('marketing.analytics');

Route::get('admin/marketing/analytics/sessions', [AdminAnalyticsController::class, 'sessions'])
    ->middleware(['admin', 'admin:orders'])
    ->name('marketing.analytics.sessions');

Route::get('admin/marketing/analytics/sessions/{session}', [AdminAnalyticsController::class, 'footprint'])
    ->middleware(['admin', 'admin:orders'])
    ->name('marketing.analytics.footprint');

/*
 * The Tracking screen's tabs, one route each, so a tab's queries run only when
 * somebody opens it. Every one reads the same query string - period, from/to,
 * channel, device, campaign - through TrackerFilter, so every tab is about the
 * same visits as the headline above it.
 */
Route::get('admin/marketing/analytics/insights', [AdminAnalyticsController::class, 'insights'])
    ->middleware(['admin', 'admin:orders'])
    ->name('marketing.analytics.insights');

Route::get('admin/marketing/analytics/live', [AdminAnalyticsController::class, 'live'])
    ->middleware(['admin', 'admin:orders'])
    ->name('marketing.analytics.live');

Route::get('admin/marketing/analytics/sources', [AdminAnalyticsController::class, 'sources'])
    ->middleware(['admin', 'admin:orders'])
    ->name('marketing.analytics.sources');

Route::get('admin/marketing/analytics/audience', [AdminAnalyticsController::class, 'audience'])
    ->middleware(['admin', 'admin:orders'])
    ->name('marketing.analytics.audience');

Route::get('admin/marketing/analytics/products', [AdminAnalyticsController::class, 'products'])
    ->middleware(['admin', 'admin:orders'])
    ->name('marketing.analytics.products');

Route::get('admin/marketing/analytics/search', [AdminAnalyticsController::class, 'search'])
    ->middleware(['admin', 'admin:orders'])
    ->name('marketing.analytics.search');

Route::get('admin/marketing/analytics/checkout', [AdminAnalyticsController::class, 'checkout'])
    ->middleware(['admin', 'admin:orders'])
    ->name('marketing.analytics.checkout');

/*
 * Export is a separate route rather than ?format=csv on the index: it streams a
 * file instead of returning JSON, and a single endpoint that sometimes does
 * both is how a caller ends up parsing a CSV as JSON.
 */
Route::get('admin/marketing/analytics/export', [AdminAnalyticsController::class, 'export'])
    ->middleware(['admin', 'admin:orders'])
    ->name('marketing.analytics.export');

/*
 * Pixel setup - the three Meta keys, edited in the panel instead of .env.
 *
 * Settings, not orders: this screen holds a secret (the Conversions API token)
 * and a save rewrites every storefront page, so reading it needs settings.view
 * and every write needs settings.edit - a narrower pair than the dashboards
 * above, which only ever read.
 *
 * The test route is throttled on top: every press is a real call to Meta on
 * the shop's own token, and ten a minute is more than anyone checking a setup
 * will ever need.
 */
Route::get('admin/marketing/pixel', [AdminPixelController::class, 'show'])
    ->middleware(['admin', 'admin:settings'])
    ->name('marketing.pixel.show');

Route::put('admin/marketing/pixel', [AdminPixelController::class, 'update'])
    ->middleware(['admin', 'admin:settings.edit'])
    ->name('marketing.pixel.update');

Route::post('admin/marketing/pixel/test', [AdminPixelController::class, 'test'])
    ->middleware(['admin', 'admin:settings.edit', 'throttle:10,1'])
    ->name('marketing.pixel.test');

Route::post('admin/marketing/pixel/test-mode', [AdminPixelController::class, 'testMode'])
    ->middleware(['admin', 'admin:settings.edit'])
    ->name('marketing.pixel.test-mode');

Route::post('admin/marketing/pixel/stamp', [AdminPixelController::class, 'stamp'])
    ->middleware(['admin', 'admin:settings.edit'])
    ->name('marketing.pixel.stamp');

/*
 * Ad spend — what the campaigns beside it cost.
 *
 * READING is the orders capability, the same as the revenue it is divided
 * into. CHANGING where the money is read from — an ad account, an access
 * token, an exchange rate — is the settings capability: it is a credential,
 * and a rate that is wrong rewrites every cost-per-order on the screen.
 *
 * The sync is throttled because every press is a call to Meta, and a button
 * that makes a number appear gets pressed twice by anyone waiting for it.
 */
Route::get('admin/marketing/ad-spend', [AdminAdSpendController::class, 'show'])
    ->middleware(['admin', 'admin:orders'])
    ->name('marketing.spend.show');

Route::put('admin/marketing/ad-spend', [AdminAdSpendController::class, 'update'])
    ->middleware(['admin', 'admin:settings.edit'])
    ->name('marketing.spend.update');

Route::post('admin/marketing/ad-spend/sync', [AdminAdSpendController::class, 'sync'])
    ->middleware(['admin', 'admin:orders', 'throttle:20,1'])
    ->name('marketing.spend.sync');

Route::post('admin/marketing/ad-spend/rows', [AdminAdSpendController::class, 'store'])
    ->middleware(['admin', 'admin:orders'])
    ->name('marketing.spend.store');

Route::delete('admin/marketing/ad-spend/rows/{id}', [AdminAdSpendController::class, 'destroy'])
    ->whereNumber('id')
    ->middleware(['admin', 'admin:orders'])
    ->name('marketing.spend.destroy');

Route::post('admin/marketing/ad-spend/map', [AdminAdSpendController::class, 'map'])
    ->middleware(['admin', 'admin:orders'])
    ->name('marketing.spend.map');
