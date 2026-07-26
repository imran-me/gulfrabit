<?php

declare(strict_types=1);

namespace Modules\Cart\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Adding a line to the cart.
 *
 * Note what is absent: **price**. There is no field for one, so a posted price
 * cannot be trusted by accident. The server resolves it from the SKU.
 */
class AddCartItemRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;   // guests have carts
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'sku'     => ['required', 'string', 'max:32', 'exists:products,sku'],
            'qty'     => ['sometimes', 'integer', 'min:1', 'max:99'],
            'variant' => ['sometimes', 'nullable', 'string', 'max:64'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'sku.exists' => 'That product is no longer available.',
            'qty.max'    => 'You can order up to 99 of an item at a time.',
        ];
    }
}
