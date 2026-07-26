<?php

declare(strict_types=1);

namespace Modules\Auth\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * A one-time login code.
 *
 * @property string $phone
 * @property string $code_hash
 * @property int    $attempts
 */
class OtpCode extends Model
{
    use HasFactory;

    /** Wrong guesses allowed before the code is burned. */
    public const MAX_ATTEMPTS = 5;

    /** Long enough to read an SMS, short enough to be useless if intercepted. */
    public const TTL_MINUTES = 10;

    /** Minimum gap between sends to the same number — each SMS costs money. */
    public const RESEND_COOLDOWN_SECONDS = 60;

    protected $fillable = [
        'phone', 'code_hash', 'attempts', 'expires_at', 'consumed_at', 'request_ip',
    ];

    protected function casts(): array
    {
        return [
            'expires_at'  => 'datetime',
            'consumed_at' => 'datetime',
            'attempts'    => 'integer',
        ];
    }

    public function scopeUsable(Builder $q): Builder
    {
        return $q->whereNull('consumed_at')
            ->where('expires_at', '>', now())
            ->where('attempts', '<', self::MAX_ATTEMPTS);
    }

    public function isUsable(): bool
    {
        return $this->consumed_at === null
            && $this->expires_at->isFuture()
            && $this->attempts < self::MAX_ATTEMPTS;
    }
}
