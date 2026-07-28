<?php

declare(strict_types=1);

namespace Modules\Accounting\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One account in the chart of accounts.
 *
 * @property string $code
 * @property string $type
 */
class Account extends Model
{
    protected $fillable = [
        'code', 'name', 'type', 'parent_id', 'system_key',
        'is_system', 'is_active', 'description',
    ];

    protected $casts = ['is_system' => 'boolean', 'is_active' => 'boolean'];

    /** Account types whose balance increases on the DEBIT side. */
    public const DEBIT_NORMAL = ['asset', 'expense'];

    public function lines(): HasMany
    {
        return $this->hasMany(JournalLine::class);
    }

    /**
     * Derived from `type`, never stored.
     *
     * A separate `normal_balance` column could be set to disagree with the
     * type — an asset marked credit-normal would silently invert every report
     * it appears in, and nothing would flag it.
     */
    public function isDebitNormal(): bool
    {
        return in_array($this->type, self::DEBIT_NORMAL, true);
    }

    /**
     * Turn raw debit/credit totals into a balance in this account's own terms.
     *
     * A cash account with 500 debits and 200 credits has 300. A revenue account
     * with 200 debits and 500 credits also has 300 — of income. Both are
     * positive numbers meaning "more of what this account is for", which is how
     * a person reads a trial balance.
     */
    public function balanceFrom(int $debits, int $credits): int
    {
        return $this->isDebitNormal() ? $debits - $credits : $credits - $debits;
    }

    public function scopeActive(Builder $q): Builder
    {
        return $q->where('is_active', true)->orderBy('code');
    }

    public function toAdminArray(): array
    {
        return [
            'code'     => $this->code,
            'name'     => $this->name,
            'type'     => $this->type,
            'systemKey' => $this->system_key,
            'isSystem' => $this->is_system,
            'isActive' => $this->is_active,
        ];
    }
}
