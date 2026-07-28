<?php

declare(strict_types=1);

namespace Modules\Accounting\Services;

use Illuminate\Support\Facades\DB;
use Modules\Accounting\Models\Account;

/**
 * Trial balance and profit & loss.
 *
 * THE HONESTY RULE THIS FILE EXISTS TO KEEP
 * -----------------------------------------
 * A P&L that shows revenue, no cost of goods, and calls the difference "profit"
 * is not a P&L. It is a revenue report with a misleading total, and it reads as
 * good news, so nobody questions it.
 *
 * So the P&L returns `costOfGoodsKnown` alongside the figures, and it is false
 * whenever any sale in the period was posted without a cost line. When it is
 * false, `grossProfit` is null — not zero, not "same as revenue" — and the
 * screen says which orders are missing costs so somebody can go and fix it.
 */
final class ReportService
{
    /**
     * Trial balance: every account with a non-zero balance.
     *
     * Debits and credits must total the same. If they ever do not, something
     * wrote to the tables without going through LedgerService, and the report
     * says so rather than quietly presenting an unbalanced set of figures.
     *
     * @return array{rows:array<int,array<string,mixed>>, totalDebitTaka:int, totalCreditTaka:int, balanced:bool}
     */
    public function trialBalance(?string $from = null, ?string $to = null): array
    {
        $rows = $this->accountTotals($from, $to);

        $totalDebit = 0;
        $totalCredit = 0;
        $out = [];

        foreach ($rows as $row) {
            $totalDebit += $row['debits'];
            $totalCredit += $row['credits'];

            $balance = $row['account']->balanceFrom($row['debits'], $row['credits']);
            if ($balance === 0) {
                continue;   // an account with nothing in it is noise on this report
            }

            $out[] = [
                'code'        => $row['account']->code,
                'name'        => $row['account']->name,
                'type'        => $row['account']->type,
                'debitTaka'   => intdiv($row['debits'], 100),
                'creditTaka'  => intdiv($row['credits'], 100),
                'balanceTaka' => intdiv($balance, 100),
            ];
        }

        return [
            'rows'            => $out,
            'totalDebitTaka'  => intdiv($totalDebit, 100),
            'totalCreditTaka' => intdiv($totalCredit, 100),
            'balanced'        => $totalDebit === $totalCredit,
        ];
    }

    /**
     * Profit & loss for a period.
     *
     * @return array<string, mixed>
     */
    public function profitAndLoss(string $from, string $to): array
    {
        $rows = $this->accountTotals($from, $to);

        $income = [];
        $expenses = [];
        $incomeTotal = 0;
        $expenseTotal = 0;

        foreach ($rows as $row) {
            $account = $row['account'];
            $balance = $account->balanceFrom($row['debits'], $row['credits']);

            if ($balance === 0) {
                continue;
            }

            if ($account->type === 'income') {
                $income[] = ['name' => $account->name, 'amountTaka' => intdiv($balance, 100)];
                $incomeTotal += $balance;
            } elseif ($account->type === 'expense') {
                $expenses[] = ['name' => $account->name, 'amountTaka' => intdiv($balance, 100)];
                $expenseTotal += $balance;
            }
        }

        $missing = $this->salesMissingCost($from, $to);
        $costKnown = $missing === 0;

        return [
            'from' => $from,
            'to'   => $to,

            'income'        => $income,
            'incomeTaka'    => intdiv($incomeTotal, 100),
            'expenses'      => $expenses,
            'expensesTaka'  => intdiv($expenseTotal, 100),

            // Net is always computable: it is simply what was recorded.
            'netTaka'       => intdiv($incomeTotal - $expenseTotal, 100),

            // Gross profit is NOT. It needs cost of goods, and cost of goods is
            // only real if every sale in the period carried one.
            'costOfGoodsKnown'  => $costKnown,
            'salesMissingCost'  => $missing,
            'grossProfitTaka'   => $costKnown
                ? intdiv($incomeTotal - $this->costOfGoodsTotal($from, $to), 100)
                : null,

            // Said in words, in the payload, so every consumer of this report
            // carries the caveat rather than only the one screen that
            // remembered to.
            'caveat' => $costKnown
                ? null
                : "{$missing} sale(s) in this period were posted without a cost of goods, so "
                  . 'gross profit and margin cannot be calculated. Record unit costs on stock '
                  . 'receipts, or set a cost on each product, and re-run this report.',
        ];
    }

    /**
     * Sales entries in the period that carry no cost-of-goods line.
     *
     * Counted from the ledger rather than from products, because what matters
     * is what was actually posted at the time — a cost added today does not
     * retrospectively make last month's entry complete.
     */
    private function salesMissingCost(string $from, string $to): int
    {
        $cogs = Account::query()->where('system_key', 'cost_of_goods')->value('id');

        if ($cogs === null) {
            return 0;
        }

        return DB::table('journal_entries')
            ->where('source_type', 'order')
            ->where('is_posted', true)
            ->whereBetween('entry_date', [$from, $to])
            ->whereNotExists(function ($q) use ($cogs): void {
                $q->select(DB::raw(1))
                    ->from('journal_lines')
                    ->whereColumn('journal_lines.journal_entry_id', 'journal_entries.id')
                    ->where('journal_lines.account_id', $cogs);
            })
            ->count();
    }

    private function costOfGoodsTotal(string $from, string $to): int
    {
        return (int) DB::table('journal_lines')
            ->join('journal_entries', 'journal_entries.id', '=', 'journal_lines.journal_entry_id')
            ->join('accounts', 'accounts.id', '=', 'journal_lines.account_id')
            ->where('accounts.system_key', 'cost_of_goods')
            ->where('journal_entries.is_posted', true)
            ->whereBetween('journal_entries.entry_date', [$from, $to])
            ->sum(DB::raw('journal_lines.debit_poisha - journal_lines.credit_poisha'));
    }

    /**
     * Debit and credit totals per account, optionally within a period.
     *
     * @return array<int, array{account:Account, debits:int, credits:int}>
     */
    private function accountTotals(?string $from, ?string $to): array
    {
        $query = DB::table('journal_lines')
            ->join('journal_entries', 'journal_entries.id', '=', 'journal_lines.journal_entry_id')
            ->selectRaw('journal_lines.account_id, SUM(journal_lines.debit_poisha) as debits, SUM(journal_lines.credit_poisha) as credits')
            // Drafts are excluded everywhere. An unposted entry is somebody's
            // work in progress, not a fact about the business.
            ->where('journal_entries.is_posted', true)
            ->groupBy('journal_lines.account_id');

        if ($from) {
            $query->where('journal_entries.entry_date', '>=', $from);
        }
        if ($to) {
            $query->where('journal_entries.entry_date', '<=', $to);
        }

        $totals = $query->get()->keyBy('account_id');
        $accounts = Account::query()->active()->get();

        $out = [];
        foreach ($accounts as $account) {
            $row = $totals[$account->id] ?? null;
            $out[] = [
                'account' => $account,
                'debits'  => (int) ($row->debits ?? 0),
                'credits' => (int) ($row->credits ?? 0),
            ];
        }

        return $out;
    }
}
