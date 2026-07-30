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

    /**
     * Discount in poisha for a code against a goods subtotal. 0 if it does not
     * apply.
     *
     * `$lines` is required for any promotion scoped to particular products or
     * categories — see CartService::discountLines. Omitting it does not
     * silently widen the discount: a scoped promotion with no lines returns 0.
     *
     * @param array<int, array{product_id?:int|null, category_id?:int|null, total_poisha:int}>|null $lines
     */
    public function discountPoisha(?string $code, int $subtotalPoisha, ?array $lines = null): int
    {
        return $this->find($code)?->discountPoisha($subtotalPoisha, $lines) ?? 0;
    }

    /**
     * Validate for the UI: does it exist, and does this basket qualify?
     *
     * Distinguishes "no such code" from "your basket is too small", because the
     * second one is actionable — the customer can add another item — and
     * collapsing both into "invalid code" loses a sale.
     *
     * @param array<int, array{product_id?:int|null, category_id?:int|null, total_poisha:int}>|null $lines
     * @return array{valid:bool, reason:?string, discount:int, label:?string}
     */
    public function validate(?string $code, int $subtotalPoisha, ?array $lines = null): array
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

        $discount = $promo->discountPoisha($subtotalPoisha, $lines);

        // A real code, a big enough basket, and still nothing off — the basket
        // holds none of the items this offer is for. Distinct from "unknown"
        // and from "too small", because it is the only one of the three the
        // customer fixes by shopping rather than by giving up.
        if ($discount === 0 && $promo->scope !== 'all') {
            return [
                'valid'    => false,
                'reason'   => 'not_eligible',
                'discount' => 0,
                'label'    => $promo->label,
            ];
        }

        return [
            'valid'    => true,
            'reason'   => null,
            'discount' => intdiv($discount, 100),
            'label'    => $promo->label,
        ];
    }

    /**
     * The offer rules that may be printed in public, cheapest threshold first.
     *
     * Deliberately NOT "every redeemable promotion". A code can be valid and
     * still have no business on a product page — a win-back code, an
     * influencer's code, a campaign that has not launched. `is_public` defaults
     * to false, so a code is advertised only when someone decides to advertise
     * it. Nothing secret leaks by forgetting a flag.
     *
     * Values come back in whole taka: this feeds copy, not arithmetic the
     * server will act on, and the browser must never be handed a discount it
     * could then claim. The order pipeline recomputes every figure in poisha.
     *
     * @return array<int, array<string, mixed>>
     */
    public function publicOffers(): array
    {
        return Promotion::query()
            ->public()
            ->with('targets')
            ->orderBy('min_subtotal_poisha')
            ->get()
            // A scoped promotion with nothing chosen applies to nothing, so
            // advertising it is advertising a code that will be refused. The
            // panel flags this state as "no items chosen"; here it is simply
            // dropped, because a customer cannot act on it.
            ->reject(fn (Promotion $p): bool => $p->scope !== 'all' && $p->targets->isEmpty())
            ->map(fn (Promotion $p): array => [
                'kind'        => 'promo',
                'code'        => $p->code,
                'label'       => $p->label,
                'type'        => $p->type,
                'value'       => $p->type === 'pct' ? $p->value : intdiv($p->value, 100),
                'minSpend'    => intdiv($p->min_subtotal_poisha, 100),
                'maxDiscount' => $p->max_discount_poisha === null
                    ? null
                    : intdiv($p->max_discount_poisha, 100),
                // So the copy can say "on selected dates" rather than implying
                // the code works on anything in the basket. A published offer
                // that is refused at the cart is worse than one never shown.
                'scope'       => $p->scope,
            ])
            ->values()
            ->all();
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
