<?php

/*
 * Third-party service credentials.
 *
 * This file exists because of `php artisan config:cache`, which seed-catalog.sh
 * and the deploy flow both run: once the config is cached, `env()` returns
 * null EVERYWHERE except inside config/*.php files. A controller that read
 * env('META_CAPI_TOKEN') directly would work in development and silently send
 * nothing in production — the worst possible failure mode for tracking,
 * because ads keep spending while the optimisation signal quietly dies.
 *
 * Laravel merges this with the framework's own services defaults, so only the
 * keys named here are affected.
 */
return [

    'meta' => [
        // The same pixel id as shared/js/core/site-config.js — public by design.
        'pixel_id' => env('META_PIXEL_ID'),

        // The Conversions API access token from Events Manager → Settings.
        // SECRET. Lives in .env on the server and nowhere else — never in
        // site-config.js, never in this repo.
        'capi_token' => env('META_CAPI_TOKEN'),

        // Optional. Set while testing so events appear in Events Manager's
        // Test Events tab; clear it for real traffic.
        'test_event_code' => env('META_TEST_EVENT_CODE'),
    ],

];
