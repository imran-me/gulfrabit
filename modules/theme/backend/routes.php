<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\Theme\Controllers\LayoutController;
use Modules\Theme\Controllers\ThemeController;

/*
 * The public read. Open, because it returns one word that is already visible
 * in the CSS of every page — and every page load asks for it.
 */
Route::get('/theme', [ThemeController::class, 'show'])->name('theme.show');

/*
 * The home page's section arrangement. Public and open for the same reason as
 * the theme above: it describes something already visible in the page's own
 * markup, and the home page asks for it on every visit.
 */
Route::get('/home-layout', [LayoutController::class, 'show'])->name('layout.show');
