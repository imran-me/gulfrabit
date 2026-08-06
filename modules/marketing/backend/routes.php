<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\Marketing\Controllers\TrackController;

/*
 * POST /api/track — the browser's event mirror (see shared/js/core/analytics.js).
 *
 * Throttled hard because it is an open, unauthenticated POST: every visitor's
 * browser is a legitimate caller, so it cannot require a session — which also
 * means a bored script can hammer it. 120/min per IP is ten times what a
 * human's funnel produces and a rounding error of what a flood would want.
 */
Route::post('track', TrackController::class)
    ->middleware('throttle:120,1')
    ->name('marketing.track');
