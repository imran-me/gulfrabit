<?php

declare(strict_types=1);

namespace Modules\Cart\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Modules\Cart\Models\CartItem;

/**
 * Changing a line quantity.
 *
 * `qty: 0` is allowed and means remove — the stepper expresses removal that way
 * when you decrement from 1, and rejecting it would strand the item.
 */
class UpdateCartItemRequest extends FormRequest
{
    /** Costs a query to work out, and rules() and messages() both ask for it. */
    private ?int $resolvedMaxQty = null;

    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'qty' => ['required', 'integer', 'min:0', 'max:' . $this->maxQty()],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'qty.max' => 'You can order up to ' . number_format($this->maxQty())
                . ' of this item at a time.',
        ];
    }

    /**
     * The ceiling belongs to the product on this line, not to the cart. The
     * cart page steps a 1,000-unit reel in thousands, so a flat max:99 here
     * turned every edit of such a line into a 422 the customer could do nothing
     * about — the same refusal as add-to-cart, one screen later.
     *
     * The line is fetched by route id purely to read its moq. Whether it is
     * THIS customer's line is settled where it matters — CartService loads it
     * through the caller's own cart and 404s otherwise — so an id that is not
     * theirs, or not a line at all, only falls back to the retail ceiling.
     */
    private function maxQty(): int
    {
        if ($this->resolvedMaxQty === null) {
            $moq = CartItem::query()
                ->with('product:id,moq')
                ->find($this->route('lineId'))?->product?->moq;

            $this->resolvedMaxQty = CartItem::maxQtyFor($moq === null ? null : (int) $moq);
        }

        return $this->resolvedMaxQty;
    }
}
