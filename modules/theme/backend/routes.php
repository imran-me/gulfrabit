<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\Theme\Controllers\ThemeController;

/*
 * The public read. Open, because it returns one word that is already visible
 * in the CSS of every page — and every page load asks for it.
 */
Route::get('/theme', [ThemeController::class, 'show'])->name('theme.show');
