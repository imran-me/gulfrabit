<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\Hero\Controllers\AdminHeroController;
use Modules\Hero\Controllers\HeroController;

/**
 * Hero module routes — the module's entire routing surface.
 *
 * One public read and a guarded write side. Deleting modules/hero/ takes both
 * with it; the home page falls back to the banners authored into index.html
 * and the shop carries on.
 */

// Public: the storefront's home page asks for this on every visit. No auth, no
// session, cacheable — it is the same answer for everybody.
Route::get('/hero', [HeroController::class, 'index'])->name('hero.index');

Route::prefix('admin/hero')->name('admin.hero.')
    // `admin:content` — arranging banners is merchandising. It is the same
    // capability that edits page copy, and deliberately not one that reaches
    // money or customer records.
    ->middleware(['admin', 'admin:content'])
    ->group(function (): void {
        Route::get('/', [AdminHeroController::class, 'index'])->name('index');
        Route::post('/', [AdminHeroController::class, 'store'])->name('store');

        // Before the {slide} routes, or "order" and "settings" would be read
        // as slide ids and 404 against a model that has no such key.
        Route::post('/order', [AdminHeroController::class, 'reorder'])->name('reorder');
        Route::patch('/settings', [AdminHeroController::class, 'settings'])->name('settings');

        Route::patch('/{slide}', [AdminHeroController::class, 'update'])->name('update');
        Route::delete('/{slide}', [AdminHeroController::class, 'destroy'])->name('destroy');
    });
