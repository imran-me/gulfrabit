<?php

declare(strict_types=1);

namespace Modules\Cart\Services;

use Modules\Cart\Models\Promotion;

/**
 * Promo validation and discount maths — the server's word, not the client's.
 *
 * The frontend mock in `backend/api.js` knows a couple of codes so the cart UI
 * can be built; those are a fixture, never an authority. A discount that the
 * browser can name is a discount the browser can invent.
 */
final class PromotionService
{
    /**
     * Look up a redeemable promo. Null when it does not exist, has expired, is
     * exhausted, or is switched off — the caller cannot tell which, on purpose,
     * because "this code expired" tells a guesser their guess was once real.
     */
    public function find(?string $code): ?Promotion
    {
        if ($code === null || trim($code) === '') {
            return null;
        }

        return Promotion::query()
            ->redeemable()
            ->where('code', strtoupper(trim($code)))
            ->first();
    }

    /** Discount in poisha for a code against a goods subtotal. 0 if it does not apply. */
    public function discountPoisha(?string $code, int $subtotalPoisha): int
    {
        return $this->find($code)?->discountPoisha($subtotalPoisha) ?? 0;
    }

    /**
     * Validate for the UI: does it exist, and does this basket qualify?
     *
     * Distinguishes "no such code" from "your basket is too small", because the
     * second one is actionable — the customer can add another item — and
     * collapsing both into "invalid code" loses a sale.
     *
     * @return array{valid:bool, reason:?string, discount:int, label:?string}
     */
    public function validate(?string $code, int $subtotalPoisha): array
    {
        $promo = $this->find($code);

        if ($promo === null) {
            return ['valid' => false, 'reason' => 'unknown', 'discount' => 0, 'label' => null];
        }

        if ($subtotalPoisha < $promo->min_subtotal_poisha) {
            return [
                'valid'    => false,
                'reason'   => 'min_subtotal',
                'discount' => 0,
                'label'    => $promo->label,
                'minSpend' => intdiv($promo->min_subtotal_poisha, 100),
            ];
        }

        return [
            'valid'    => true,
            'reason'   => null,
            'discount' => intdiv($promo->discountPoisha($subtotalPoisha), 100),
            'label'    => $promo->label,
        ];
    }

    /**
     * Burn one use. Call ONLY when an order is actually created — not when the
     * code is typed, or a browsing customer exhausts a limited campaign without
     * buying anything.
     */
    public function recordRedemption(Promotion $promo): void
    {
        $promo->increment('used_count');
    }
}
