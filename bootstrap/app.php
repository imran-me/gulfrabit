<?php

declare(strict_types=1);

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

/**
 * Application bootstrap (Laravel 11/12 style — there is no Http/Kernel.php).
 *
 * NOTE the `api:` entry. Module routes are mounted with ->middleware('api'),
 * and in Laravel 11+ that middleware group only exists if API routing is
 * enabled here. Without this line every module route 500s on an unknown
 * middleware group, which is a confusing way to discover the problem.
 *
 * Module providers are listed in bootstrap/providers.php — that file and
 * composer.json are the only two places a module is named from outside its
 * own folder.
 */
return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__ . '/../routes/web.php',
        api: __DIR__ . '/../routes/api.php',
        commands: __DIR__ . '/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Guest carts rely on an httpOnly cookie surviving the response cycle;
        // the default cookie middleware in the 'api' group handles that.
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        //
    })
    ->create();
