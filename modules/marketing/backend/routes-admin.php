<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
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
