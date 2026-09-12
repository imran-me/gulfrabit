<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\Risk\Controllers\AdminRiskController;

/*
 * Delivery risk, mounted under `web` by RiskServiceProvider — the panel
 * authenticates with a session cookie, and the api group has no session.
 *
 * Both routes sit behind the orders capability. This is order history read a
 * different way, and the person it is for is the person deciding whether to
 * put a parcel on a van; anyone trusted to see an order is trusted to see
 * whether that customer's last three came back.
 */
Route::get('admin/risk', [AdminRiskController::class, 'index'])
    ->middleware(['admin', 'admin:orders'])
    ->name('risk.index');

/*
 * The phone rides in the query string rather than the path. A number in a URL
 * path ends up in access logs, browser history and anything that copies a
 * link; it is the shop's own customer either way, but there is no reason to
 * spread it further than the screen that asked for it.
 */
Route::get('admin/risk/phone', [AdminRiskController::class, 'phone'])
    ->middleware(['admin', 'admin:orders'])
    ->name('risk.phone');
