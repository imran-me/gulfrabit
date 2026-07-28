<?php

declare(strict_types=1);

namespace Modules\Accounting\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Modules\Accounting\Models\Account;
use Modules\Accounting\Models\JournalEntry;
use Modules\Accounting\Requests\ExpenseRequest;
use Modules\Accounting\Services\LedgerService;
use Modules\Accounting\Services\ReportService;
use RuntimeException;

/**
 * The books.
 *
 * `admin:accounting`, held by owner, manager and accounts. Note the deliberate
 * absence of an "edit entry" endpoint: a posted entry is corrected by reversing
 * it, never by changing it, so that last quarter still says today what it said
 * then.
 */
class AdminAccountingController extends Controller
{
    public function __construct(
        private readonly LedgerService $ledger,
        private readonly ReportService $reports,
    ) {
    }

    /** GET /api/admin/accounting/accounts */
    public function accounts(): JsonResponse
    {
        return response()->json([
            'data' => Account::query()->active()->get()->map->toAdminArray()->all(),
        ]);
    }

    /** GET /api/admin/accounting/journal */
    public function journal(Request $request): JsonResponse
    {
        $data = $request->validate([
            'from'    => ['sometimes', 'date'],
            'to'      => ['sometimes', 'date', 'after_or_equal:from'],
            'perPage' => ['sometimes', 'integer', 'min:10', 'max:100'],
        ]);

        $query = JournalEntry::query()
            ->with('lines.account')
            ->where('is_posted', true)
            ->latest('entry_date')
            ->latest('id');

        if (isset($data['from'])) {
            $query->where('entry_date', '>=', $data['from']);
        }
        if (isset($data['to'])) {
            $query->where('entry_date', '<=', $data['to']);
        }

        $page = $query->paginate($data['perPage'] ?? 25);

        return response()->json([
            'data' => array_map(fn (JournalEntry $e): array => $e->toAdminArray(), $page->items()),
            'meta' => [
                'total'       => $page->total(),
                'currentPage' => $page->currentPage(),
                'lastPage'    => $page->lastPage(),
            ],
        ]);
    }

    /** GET /api/admin/accounting/trial-balance */
    public function trialBalance(Request $request): JsonResponse
    {
        $data = $request->validate([
            'from' => ['sometimes', 'date'],
            'to'   => ['sometimes', 'date', 'after_or_equal:from'],
        ]);

        return response()->json([
            'data' => $this->reports->trialBalance($data['from'] ?? null, $data['to'] ?? null),
        ]);
    }

    /** GET /api/admin/accounting/profit-and-loss */
    public function profitAndLoss(Request $request): JsonResponse
    {
        $data = $request->validate([
            'from' => ['required', 'date'],
            'to'   => ['required', 'date', 'after_or_equal:from'],
        ]);

        return response()->json([
            'data' => $this->reports->profitAndLoss($data['from'], $data['to']),
        ]);
    }

    /**
     * POST /api/admin/accounting/expenses
     *
     * The one form most days need. It writes an ordinary double-entry: debit
     * the expense account, credit wherever the money left from. Deliberately
     * not a separate "expenses" table — an expense IS a journal entry, and a
     * parallel table would be a second set of books to reconcile.
     */
    public function recordExpense(ExpenseRequest $request): JsonResponse
    {
        $admin = $request->user('admin');
        $amount = (int) round($request->float('amountTaka') * 100);

        try {
            $entry = $this->ledger->post(
                memo:      $request->string('description')->toString(),
                lines: [
                    ['account' => $request->string('accountCode')->toString(), 'debit' => $amount],
                    ['account' => $request->string('paidFrom')->toString(),    'credit' => $amount],
                ],
                entryDate: $request->input('date'),
                adminId:   $admin->id,
                adminName: $admin->name,
            );
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['data' => $entry->toAdminArray()], 201);
    }

    /** POST /api/admin/accounting/journal/{entry}/reverse */
    public function reverse(Request $request, JournalEntry $entry): JsonResponse
    {
        $data = $request->validate([
            'reason' => ['required', 'string', 'min:3', 'max:255'],
        ]);

        $admin = $request->user('admin');

        try {
            $reversal = $this->ledger->reverse($entry, $data['reason'], $admin->id, $admin->name);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['data' => $reversal->toAdminArray()], 201);
    }
}
