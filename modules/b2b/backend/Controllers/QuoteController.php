<?php

declare(strict_types=1);

namespace Modules\B2b\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Modules\B2b\Models\QuoteRequest;
use Modules\B2b\Requests\SubmitQuoteRequest;
use Modules\B2b\Services\QuoteService;
use RuntimeException;

/**
 * Requests for quote.
 */
class QuoteController extends Controller
{
    public function __construct(
        private readonly QuoteService $quotes,
    ) {
    }

    /**
     * POST /api/b2b/quotes
     * Public. Returns the reference the customer quotes when chasing it.
     */
    public function store(SubmitQuoteRequest $request): JsonResponse
    {
        try {
            $quote = $this->quotes->create($request->validated(), $request->user()?->id);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json([
            'data' => $quote->toStorefrontArray() + [
                // Said explicitly in the payload, not just in the docs: this
                // figure is published tier pricing, not an agreed quote. Stock,
                // lead time and freight are settled by a human.
                'indicativeOnly' => true,
                'message' => 'Request received. Our B2B desk replies within one working day.',
            ],
        ], 201);
    }

    /**
     * GET /api/b2b/quotes/{reference}
     *
     * Guests must supply the phone that submitted it. The reference alone is
     * not a credential — it appears in email threads and screenshots, and the
     * request contains a competitor's order volumes.
     */
    public function show(Request $request, QuoteRequest $quote): JsonResponse
    {
        $user = $request->user();

        if ($user !== null && $quote->user_id === $user->id) {
            return response()->json(['data' => $quote->load('items')->toStorefrontArray()]);
        }

        $phone = preg_replace('/\D/', '', (string) $request->query('phone'));
        $phone = str_starts_with((string) $phone, '88') ? substr((string) $phone, 2) : $phone;

        if ($phone !== '' && $phone === $quote->contact_phone) {
            return response()->json(['data' => $quote->load('items')->toStorefrontArray()]);
        }

        // 404, not 403 — confirming a reference exists tells someone their
        // guess was real.
        return response()->json(['message' => 'Quote request not found.'], 404);
    }

    /**
     * POST /api/b2b/price-check
     *
     * Indicative tier pricing for a quantity, so the storefront can show
     * "at 500 units this is BDT 190" before anyone submits anything.
     */
    public function priceCheck(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'sku' => ['required', 'string', 'max:32', 'exists:products,sku'],
            'qty' => ['required', 'integer', 'min:1', 'max:1000000'],
        ]);

        $product = \Modules\Catalog\Models\Product::where('sku', $validated['sku'])->firstOrFail();
        $unit = $this->quotes->tierPricePoisha($product, (int) $validated['qty']);

        return response()->json([
            'data' => [
                'sku'            => $product->sku,
                'qty'            => (int) $validated['qty'],
                'unitPrice'      => intdiv($unit, 100),
                'lineTotal'      => intdiv($unit * (int) $validated['qty'], 100),
                'moq'            => $product->moq,
                // Below MOQ is surfaced, not blocked: it is a conversation, and
                // a hard rejection loses the lead.
                'belowMoq'       => $product->moq !== null && $validated['qty'] < $product->moq,
                'indicativeOnly' => true,
            ],
        ]);
    }
}
