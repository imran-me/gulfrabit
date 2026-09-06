<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\Marketing\Controllers\AdminAnalyticsController;
use Modules\Marketing\Controllers\AdminCampaignController;

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
 * Export is a separate route rather than ?format=csv on the index: it streams a
 * file instead of returning JSON, and a single endpoint that sometimes does
 * both is how a caller ends up parsing a CSV as JSON.
 */
Route::get('admin/marketing/analytics/export', [AdminAnalyticsController::class, 'export'])
    ->middleware(['admin', 'admin:orders'])
    ->name('marketing.analytics.export');
