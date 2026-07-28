<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\Cms\Controllers\ContentController;

/**
 * CMS routes — the module's entire routing surface.
 *
 * One public read and three admin writes. The read is open because it returns
 * words already printed on a public page; the writes sit behind `admin:content`,
 * held by owner, manager and editor.
 */

// Public: every storefront page load asks for its overrides.
Route::get('/cms/content', [ContentController::class, 'show'])->name('cms.content');

Route::prefix('admin/cms')->name('admin.cms.')
    ->middleware(['admin', 'admin:content'])->group(function (): void {
        Route::get('/blocks', [ContentController::class, 'index'])->name('index');
        Route::put('/blocks', [ContentController::class, 'store'])->name('store');
        Route::get('/blocks/{block}/revisions', [ContentController::class, 'revisions'])->name('revisions');
        // Reverting restores the developer's original, which is never stored
        // here and therefore cannot be lost.
        Route::delete('/blocks/{block}', [ContentController::class, 'destroy'])->name('destroy');
    });
