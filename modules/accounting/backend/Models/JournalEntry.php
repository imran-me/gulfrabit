<?php

declare(strict_types=1);

namespace Modules\Accounting\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One transaction. Posted entries are never edited — see LedgerService.
 *
 * @property string $reference
 * @property bool   $is_posted
 */
class JournalEntry extends Model
{
    protected $fillable = [
        'reference', 'entry_date', 'memo', 'is_posted', 'posted_at',
        'source_type', 'source_id', 'reverses_id',
        'created_by_admin_id', 'created_by_name',
    ];

    protected $casts = [
        'entry_date' => 'date',
        'posted_at'  => 'datetime',
        'is_posted'  => 'boolean',
    ];

    public function getRouteKeyName(): string
    {
        return 'reference';
    }

    public function lines(): HasMany
    {
        return $this->hasMany(JournalLine::class);
    }

    public function totalDebitPoisha(): int
    {
        return (int) $this->lines->sum('debit_poisha');
    }

    public function toAdminArray(): array
    {
        return [
            'reference' => $this->reference,
            'date'      => $this->entry_date?->toDateString(),
            'memo'      => $this->memo,
            'totalTaka' => intdiv($this->totalDebitPoisha(), 100),
            'source'    => $this->source_type,
            // Present so a correction is visible as a correction rather than
            // looking like a second, unexplained transaction.
            'reverses'  => $this->reverses_id,
            'by'        => $this->created_by_name ?? 'System',
            'lines'     => $this->relationLoaded('lines')
                ? $this->lines->map->toAdminArray()->all()
                : [],
        ];
    }
}
