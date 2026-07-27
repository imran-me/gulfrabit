<?php

declare(strict_types=1);

/**
 * Registered service providers (Laravel 11+ replaces the old config/app.php list).
 *
 * THIS IS THE ONLY PLACE A MODULE IS REFERENCED FROM OUTSIDE ITS OWN FOLDER.
 *
 * Each module's provider registers that module's routes and migrations from
 * inside modules/<feature>/backend/, so wiring a feature up is one line here,
 * and removing a feature is: delete the folder, delete the line, delete its
 * PSR-4 entry in composer.json. Nothing else in the codebase knows it existed.
 *
 * Keep this list alphabetical.
 */

return [
    App\Providers\AppServiceProvider::class,

    Modules\Account\AccountServiceProvider::class,
    Modules\Admin\AdminServiceProvider::class,
    Modules\Auth\AuthServiceProvider::class,
    Modules\B2b\B2bServiceProvider::class,
    Modules\Bundle\BundleServiceProvider::class,
    Modules\Cart\CartServiceProvider::class,
    Modules\Catalog\CatalogServiceProvider::class,
    Modules\Checkout\CheckoutServiceProvider::class,
    Modules\Delivery\DeliveryServiceProvider::class,

    // Added as each module grows a Laravel layer. The frontend for these already
    // runs on the mock seam in modules/<feature>/backend/api.js:
    //
    // Modules\Content\ContentServiceProvider::class,
    // Modules\Deals\DealsServiceProvider::class,
];
