<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Schedule;

// Abandoned-cart cleanup: carts table is indexed on updated_at for this.
Schedule::call(function (): void {
    \Modules\Cart\Models\Cart::query()
        ->whereNull('user_id')
        ->where('updated_at', '<', now()->subDays(60))
        ->delete();
})->daily()->name('prune-abandoned-guest-carts')->onOneServer();
