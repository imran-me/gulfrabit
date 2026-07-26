<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\Auth\Controllers\AuthController;

/**
 * Auth module routes.
 *
 * Throttles are tight and deliberate. OTP request costs real money per call and
 * OTP verify is a 6-digit guessing target, so both are rate-limited well below
 * the app default. Login is limited to blunt credential stuffing.
 */

Route::prefix('auth')->name('auth.')->group(function (): void {

    // 5/min per IP. The per-phone cooldown lives in OtpService, because an
    // attacker rotating IPs must still not be able to bill us for SMS.
    Route::post('/otp/request', [AuthController::class, 'requestOtp'])
        ->middleware('throttle:5,1')
        ->name('otp.request');

    // 10/min: five attempts are allowed per code, and this caps how fast
    // someone can burn through codes for different numbers.
    Route::post('/otp/verify', [AuthController::class, 'verifyOtp'])
        ->middleware('throttle:10,1')
        ->name('otp.verify');

    Route::post('/login', [AuthController::class, 'login'])
        ->middleware('throttle:10,1')
        ->name('login');

    Route::post('/register', [AuthController::class, 'register'])
        ->middleware('throttle:5,1')
        ->name('register');

    Route::middleware('auth:sanctum')->group(function (): void {
        Route::post('/logout', [AuthController::class, 'logout'])->name('logout');
        Route::get('/me', [AuthController::class, 'me'])->name('me');
        Route::patch('/me/password', [AuthController::class, 'updatePassword'])->name('password.update');
    });
});
