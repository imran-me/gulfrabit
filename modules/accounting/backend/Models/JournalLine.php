<?php

declare(strict_types=1);

namespace Modules\Accounting\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One debit or one credit. Never both — LedgerService enforces it.
 *
 * @property int $debit_poisha
 * @property int $credit_poisha
 */
class JournalLine extends Model
{
    protected $fillable = ['journal_entry_id', 'account_id', 'debit_poisha', 'credit_poisha', 'memo'];

    protected $casts = ['debit_poisha' => 'integer', 'credit_poisha' => 'integer'];

    public function account(): BelongsTo
    {
        return $this->belongsTo(Account::class);
    }

    public function entry(): BelongsTo
    {
        return $this->belongsTo(JournalEntry::class, 'journal_entry_id');
    }

    public function toAdminArray(): array
    {
        return [
            'account'     => $this->account?->name,
            'accountCode' => $this->account?->code,
            // Nulls, not zeros. A blank cell in a ledger means "not this side";
            // a printed 0.00 makes every row look like it has two amounts.
            'debitTaka'   => $this->debit_poisha > 0 ? intdiv($this->debit_poisha, 100) : null,
            'creditTaka'  => $this->credit_poisha > 0 ? intdiv($this->credit_poisha, 100) : null,
            'memo'        => $this->memo,
        ];
    }
}
