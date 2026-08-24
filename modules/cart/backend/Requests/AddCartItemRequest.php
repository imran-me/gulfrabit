<?php

declare(strict_types=1);

namespace Modules\Cart\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Modules\Cart\Models\CartItem;
use Modules\Catalog\Models\Product;

/**
 * Adding a line to the cart.
 *
 * Note what is absent: **price**. There is no field for one, so a posted price
 * cannot be trusted by accident. The server resolves it from the SKU.
 */
class AddCartItemRequest extends FormRequest
{
    /** Costs a query to work out, and rules() and messages() both ask for it. */
    private ?int $resolvedMaxQty = null;

    public function authorize(): bool
    {
        return true;   // guests have carts
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'sku'     => ['required', 'string', 'max:32', 'exists:products,sku'],
            'qty'     => ['sometimes', 'integer', 'min:1', 'max:' . $this->maxQty()],
            'variant' => ['sometimes', 'nullable', 'string', 'max:64'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'sku.exists' => 'That product is no longer available.',
            'qty.max'    => 'You can order up to ' . number_format($this->maxQty())
                . ' of this item at a time.',
        ];
    }

    /**
     * How many of THIS product one line may hold.
     *
     * A flat max:99 was a rule about jars of honey applied to a reel of 1,000
     * tactile switches. The product page steps that part in thousands, the cart
     * line prints "min 1,000 units" under it, and Place Order answered 422 "You
     * can order up to 99 of an item at a time." — the product was advertised
     * and unbuyable. The ceiling is a fact about the product, so it is read
     * from the product: the same moq * 1,000 the stepper uses in
     * shared/js/core/state.js, and 99 for a product with no moq.
     *
     * The SKU is still unvalidated here — rules() is what validates it — so an
     * unknown one finds no moq and falls back to the retail ceiling. sku.exists
     * is what rejects that request, not this.
     */
    private function maxQty(): int
    {
        if ($this->resolvedMaxQty === null) {
            $sku = $this->input('sku');
            $moq = is_string($sku) && $sku !== ''
                ? Product::query()->where('sku', $sku)->value('moq')
                : null;

            $this->resolvedMaxQty = CartItem::maxQtyFor($moq === null ? null : (int) $moq);
        }

        return $this->resolvedMaxQty;
    }
}
