<?php

declare(strict_types=1);

namespace Modules\B2b\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Modules\B2b\Models\QuoteRequest;

/**
 * The B2B desk's inbox.
 *
 * WHY THIS IS THE NOTIFICATION
 * ----------------------------
 * A quote request was being stored and nobody was told. The obvious fix is an
 * email, and there is no mail credential (context.md §8b/B2) — so the fix that
 * actually works today is to make an unanswered request impossible to walk
 * past: a count on the dashboard every staff member sees on sign-in, and a list
 * ordered oldest-first so the one that has been waiting longest is at the top.
 *
 * That is not a placeholder for email. For a desk of two or three people it is
 * a better notification than email, because it cannot be marked read and
 * forgotten — the count stays up until the request is actually moved on.
 * Email becomes an addition when there is something to send it with.
 */
class AdminQuoteController extends Controller
{
    /** Statuses that still need somebody to act. */
    public const OPEN = ['new', 'reviewing'];

    /** GET /api/admin/quotes */
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'status'  => ['sometimes', 'in:new,reviewing,quoted,won,lost,open'],
            'perPage' => ['sometimes', 'integer', 'min:10', 'max:100'],
        ]);

        $query = QuoteRequest::query()->with('items');

        if (($data['status'] ?? 'open') === 'open') {
            // Oldest first, deliberately. A newest-first inbox buries the
            // request that has been waiting three days under the one that
            // arrived this morning, and the old one is the one costing money.
            $query->whereIn('status', self::OPEN)->oldest();
        } elseif (isset($data['status'])) {
            $query->where('status', $data['status'])->latest();
        } else {
            $query->latest();
        }

        $page = $query->paginate($data['perPage'] ?? 25);

        return response()->json([
            'data' => array_map(fn (QuoteRequest $q): array => [
                'reference'   => $q->reference,
                'company'     => $q->company,
                'contactName' => $q->contact_name,
                'phone'       => $q->contact_phone,
                'email'       => $q->contact_email,
                'status'      => $q->status,
                'lines'       => $q->items->count(),

                // The actual request, not just how many lines it has.
                //
                // This screen used to send the COUNT alone, so the B2B desk
                // could mark a request "Quote sent" without ever being able to
                // see what had been asked for. The workflow was complete and
                // the information needed to do the work was missing.
                //
                // Free: `with('items')` above already loaded them, so this adds
                // no query — the rows were being fetched and then thrown away.
                'items' => $q->items->map(fn ($i): array => [
                    'sku'   => $i->sku,
                    'title' => $i->title,
                    'qty'   => $i->qty,
                    // What the storefront quoted as a guide when they asked.
                    // Named "indicative" everywhere, including on screen: the
                    // desk's whole job is to replace it with a real price, and
                    // a column headed "price" invites somebody to treat it as
                    // one already agreed.
                    'indicativeUnitTaka' => intdiv((int) $i->indicative_unit_poisha, 100),
                ])->all(),
                'indicativeTaka' => intdiv((int) $q->indicative_total_poisha, 100),
                'notes'       => $q->notes,
                'receivedAt'  => $q->created_at?->toIso8601String(),
                // How long it has been sitting. The number staff should be
                // looking at, computed here so every screen agrees.
                'waitingHours' => $q->created_at ? (int) $q->created_at->diffInHours(now()) : 0,
            ], $page->items()),
            'meta' => [
                'total'       => $page->total(),
                'currentPage' => $page->currentPage(),
                'lastPage'    => $page->lastPage(),
                'openCount'   => QuoteRequest::query()->whereIn('status', self::OPEN)->count(),
            ],
        ]);
    }

    /** POST /api/admin/quotes/{quoteRequest}/status */
    public function status(Request $request, QuoteRequest $quoteRequest): JsonResponse
    {
        $data = $request->validate([
            'status' => ['required', 'in:new,reviewing,quoted,won,lost'],
            'note'   => ['sometimes', 'nullable', 'string', 'max:500'],
        ]);

        $quoteRequest->status = $data['status'];

        // Stamped the first time it leaves 'new', so "how long did we take to
        // respond" is answerable later. Not overwritten afterwards — the answer
        // is about the first response, not the most recent touch.
        if ($data['status'] !== 'new' && $quoteRequest->responded_at === null) {
            $quoteRequest->responded_at = now();
        }

        if (! empty($data['note'])) {
            $stamp = now()->toDateString();
            $who = $request->user('admin')->name;
            $quoteRequest->notes = trim(($quoteRequest->notes ?? '') . "\n[{$stamp} {$who}] {$data['note']}");
        }

        $quoteRequest->save();

        return response()->json([
            'data' => ['status' => $quoteRequest->status],
        ]);
    }
}
