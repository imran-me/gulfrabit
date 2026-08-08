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

    /*
     * Transactional SMS (modules/sms). No key = no SMS, silently — the
     * status change an SMS rides on must never fail because the garnish is
     * unconfigured. SMS_GATEWAY=log writes messages to laravel.log instead
     * of sending, for rehearsing the flow before buying credit.
     */
    'sms' => [
        'gateway'   => env('SMS_GATEWAY', 'bulksmsbd'),
        'api_key'   => env('SMS_API_KEY'),
        'sender_id' => env('SMS_SENDER_ID'),
    ],

    /*
     * bKash Tokenized Checkout (modules/payments). Defaults to the SANDBOX
     * host on purpose: the day credentials arrive, nothing real can be
     * charged by accident. Production is a deliberate one-line change.
     */
    'bkash' => [
        'base_url'   => env('BKASH_BASE_URL', 'https://tokenized.sandbox.bka.sh/v1.2.0-beta'),
        'app_key'    => env('BKASH_APP_KEY'),
        'app_secret' => env('BKASH_APP_SECRET'),
        'username'   => env('BKASH_USERNAME'),
        'password'   => env('BKASH_PASSWORD'),
    ],

    /*
     * Nagad (modules/payments). The two keys are single-line base64 — the
     * PEM body with armour and newlines stripped; the gateway rebuilds the
     * PEM. Sandbox by default, same policy as bKash.
     */
    'nagad' => [
        'base_url'        => env('NAGAD_BASE_URL', 'http://sandbox.mynagad.com:10080/remote-payment-gateway-1.0'),
        'merchant_id'     => env('NAGAD_MERCHANT_ID'),
        'merchant_number' => env('NAGAD_MERCHANT_NUMBER'),
        'public_key'      => env('NAGAD_PUBLIC_KEY'),
        'private_key'     => env('NAGAD_PRIVATE_KEY'),
    ],

];
