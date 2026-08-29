<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\Theme\Controllers\LayoutController;
use Modules\Theme\Controllers\ThemeController;

/*
 * Admin routes, mounted under `web` by ThemeServiceProvider so the session
 * cookie the panel signs in with is actually read. Under `api` — which is
 * stateless — the Appearance screen would load and then 401 on save.
 *
 * `admin:content` rather than a new capability: the people trusted with the
 * words on the site are the people who should be trusted with its appearance.
 * Warehouse and accounts have no business here (see AdminUser::CAPABILITIES).
 */
Route::prefix('admin')
    ->name('admin.theme.')
    ->middleware(['admin', 'admin:content'])
    ->group(function (): void {
        Route::get('/theme', [ThemeController::class, 'index'])->name('index');
        Route::put('/theme', [ThemeController::class, 'update'])->name('update');

        // Arranging the home page is the same job as dressing the shop, so it
        // sits behind the same capability rather than a new one.
        Route::get('/home-layout', [LayoutController::class, 'index'])->name('layout.index');
        Route::put('/home-layout', [LayoutController::class, 'update'])->name('layout.update');
    });
