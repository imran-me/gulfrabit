<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

/**
 * A customer.
 *
 * `phone` is unique and `email` is nullable — the deliberate inverse of the
 * Laravel default. In this market the phone number is the identity primitive:
 * checkout requires it, order tracking looks up by it, and a large share of
 * buyers have no email at all. Making email the unique key would lock those
 * customers out of their own accounts.
 *
 * Referenced by Modules\Cart\Models\Cart and Modules\Checkout\Models\Order.
 */
class User extends Authenticatable
{
    use HasApiTokens;
    use HasFactory;
    use Notifiable;

    protected $fillable = [
        'name',
        'phone',
        'email',
        'password',
        'tier',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'phone_verified_at' => 'datetime',
            // Laravel 10+ hashes on assignment, so a plain password assigned to
            // this attribute is never stored in the clear.
            'password'          => 'hashed',
        ];
    }
}
