<?php

declare(strict_types=1);

namespace Modules\Accounting\Services;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Modules\Accounting\Models\Account;
use Modules\Accounting\Models\JournalEntry;
use RuntimeException;

/**
 * The only way anything is written to the books.
 *
 * THE ONE RULE
 * ------------
 * Within an entry, total debits equal total credits. Everything else in
 * double-entry follows from it, and it is checked here — in code, inside the
 * transaction that writes the rows — rather than trusted to whoever assembled
 * the lines. A ledger that can be one poisha out is a ledger that cannot be
 * reconciled, and nobody discovers that until year end.
 *
 * POSTED IS FINAL
 * ---------------
 * `post()` writes and seals. There is no update path, and no delete path for a
 * posted entry: a mistake is corrected by `reverse()`, which writes a mirror
 * entry and leaves both visible. An accountant looking at last quarter must see
 * the same numbers today that they saw then.
 */
final class LedgerService
{
    /**
     * Write and post an entry.
     *
     * @param array<int, array{account:string, debit?:int, credit?:int, memo?:string}> $lines
     *   `account` is a system_key or a code — resolved here so callers never
     *   hold account ids, which change between environments.
     *
     * @throws RuntimeException if the entry does not balance or names an
     *   account that does not exist
     */
    public function post(
        string $memo,
        array $lines,
        ?string $entryDate = null,
        ?string $sourceType = null,
        ?int $sourceId = null,
        ?int $adminId = null,
        ?string $adminName = null,
    ): JournalEntry {
        if (count($lines) < 2) {
            throw new RuntimeException('A journal entry needs at least two lines.');
        }

        $resolved = [];
        $debits = 0;
        $credits = 0;

        foreach ($lines as $line) {
            $account = $this->account($line['account']);

            $debit = (int) ($line['debit'] ?? 0);
            $credit = (int) ($line['credit'] ?? 0);

            if ($debit < 0 || $credit < 0) {
                // A negative debit is a credit wearing a disguise. Allowing it
                // would mean two ways to express the same thing and reports
                // that disagree depending on which was used.
                throw new RuntimeException('Amounts must be positive — use the other column.');
            }
            if (($debit > 0) === ($credit > 0)) {
                throw new RuntimeException('Each line is either a debit or a credit, never both or neither.');
            }

            $debits += $debit;
            $credits += $credit;

            $resolved[] = [
                'account_id'   => $account->id,
                'debit_poisha' => $debit,
                'credit_poisha' => $credit,
                'memo'         => $line['memo'] ?? null,
            ];
        }

        if ($debits !== $credits) {
            throw new RuntimeException(sprintf(
                'Entry does not balance: debits %s, credits %s.',
                number_format($debits / 100, 2),
                number_format($credits / 100, 2),
            ));
        }

        if ($debits === 0) {
            throw new RuntimeException('An entry for zero records nothing.');
        }

        return DB::transaction(function () use ($memo, $resolved, $entryDate, $sourceType, $sourceId, $adminId, $adminName): JournalEntry {
            // Normalised once, so the reference year and the stored column are
            // reading the same string. The `date` validation rule accepts
            // anything strtotime understands, so what arrives here is not
            // reliably 'Y-m-d' — and the reference year is cut from it.
            $date = $entryDate !== null
                ? Carbon::parse($entryDate)->toDateString()
                : now()->toDateString();

            $entry = JournalEntry::create([
                'reference'  => $this->nextReference($date),
                'entry_date' => $date,
                'memo'       => $memo,
                'is_posted'  => true,
                'posted_at'  => now(),
                'source_type' => $sourceType,
                'source_id'  => $sourceId,
                'created_by_admin_id' => $adminId,
                'created_by_name'     => $adminName,
            ]);

            $entry->lines()->createMany($resolved);

            return $entry->load('lines.account');
        });
    }

    /**
     * Reverse a posted entry.
     *
     * Debits become credits and vice versa, on the same accounts, dated today
     * rather than backdated to the original — because the correction happened
     * today, and backdating it would change a period that has already been
     * reported on.
     */
    public function reverse(JournalEntry $entry, string $reason, ?int $adminId = null, ?string $adminName = null): JournalEntry
    {
        if (! $entry->is_posted) {
            throw new RuntimeException('Only a posted entry can be reversed.');
        }

        if (JournalEntry::query()->where('reverses_id', $entry->id)->exists()) {
            throw new RuntimeException('This entry has already been reversed.');
        }

        $lines = $entry->lines->map(fn ($l): array => [
            'account' => $l->account->system_key ?? $l->account->code,
            'debit'   => (int) $l->credit_poisha,
            'credit'  => (int) $l->debit_poisha,
            'memo'    => $l->memo,
        ])->all();

        $reversal = $this->post(
            memo:      "Reversal of {$entry->reference}: {$reason}",
            lines:     $lines,
            adminId:   $adminId,
            adminName: $adminName,
        );

        $reversal->update(['reverses_id' => $entry->id]);

        return $reversal;
    }

    /** Resolve a system key or an account code to an account. */
    public function account(string $keyOrCode): Account
    {
        $account = Account::query()
            ->where('system_key', $keyOrCode)
            ->orWhere('code', $keyOrCode)
            ->first();

        if ($account === null) {
            throw new RuntimeException("No account '{$keyOrCode}' in the chart of accounts.");
        }

        if (! $account->is_active) {
            throw new RuntimeException("Account '{$account->name}' is archived and cannot be posted to.");
        }

        return $account;
    }

    /** Has this event already been posted? Guards every automatic posting. */
    public function alreadyPosted(string $sourceType, int $sourceId): bool
    {
        return JournalEntry::query()
            ->where('source_type', $sourceType)
            ->where('source_id', $sourceId)
            ->exists();
    }

    /**
     * The next reference for an entry dated `$entryDate`, given as 'Y-m-d'.
     *
     * The year is the entry's own, not today's. A December receipt handed in
     * during January belongs to December's books, and numbering it from `now()`
     * wedged the ledger outright: the backdated entry took a current-year
     * reference without adding to the current year's count, so the next entry
     * was handed that same reference, the unique index on `reference` rejected
     * it, and — the count never having moved — it rejected every entry after it
     * too. Nothing could be posted at all, order postings included, until a row
     * was edited by hand.
     *
     * One past the highest reference already issued for the year, rather than a
     * count of that year's entries, because a count re-issues a number wherever
     * the sequence has a gap — including the gap left by the mislabelled entry
     * an already-wedged ledger is carrying, which is what lets this repair such
     * a ledger instead of colliding with it forever.
     */
    private function nextReference(string $entryDate): string
    {
        $prefix = sprintf('JE-%s-', substr($entryDate, 0, 4));

        // The counter is zero-padded to a fixed width, so ordering by text
        // already gives the numerically highest; the longer-string-first sort
        // covers the day the width outgrows five digits, where plain text order
        // would put '99999' above '100000' and hand back a taken number.
        $last = JournalEntry::query()
            ->where('reference', 'like', $prefix.'%')
            ->orderByRaw('LENGTH(reference) desc')
            ->orderByDesc('reference')
            ->value('reference');

        $next = $last === null ? 1 : ((int) substr($last, strlen($prefix))) + 1;

        return sprintf('%s%05d', $prefix, $next);
    }
}
