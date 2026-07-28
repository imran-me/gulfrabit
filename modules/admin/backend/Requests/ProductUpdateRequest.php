<?php

declare(strict_types=1);

namespace Modules\Admin\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * What may be edited on a product.
 *
 * Note what is absent: `sku`, `barcode`, `category_id`, `origin`. Those are
 * identity, not settings. A screen that lets a busy person retype a barcode is
 * a screen that will eventually break the one verifiable promise the Sourcing
 * page makes to customers — that the code on the pack matches the code we
 * published.
 */
class ProductUpdateRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;   // `admin:products` middleware already decided this
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'title'            => ['sometimes', 'string', 'min:3', 'max:191'],
            'brand'            => ['sometimes', 'nullable', 'string', 'max:96'],
            'shortDescription' => ['sometimes', 'nullable', 'string', 'max:255'],
            'description'      => ['sometimes', 'nullable', 'string', 'max:5000'],

            // `nullable` on cost is load-bearing: clearing it means "we no
            // longer claim to know this", which is a different and more honest
            // state than zero.
            'priceTaka'         => ['sometimes', 'numeric', 'gt:0', 'max:10000000'],
            'originalPriceTaka' => ['sometimes', 'nullable', 'numeric', 'gte:priceTaka', 'max:10000000'],
            'costTaka'          => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:10000000'],

            'inStock'  => ['sometimes', 'boolean'],
            'isActive' => ['sometimes', 'boolean'],

            'reason' => ['sometimes', 'nullable', 'string', 'max:255'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            // The strike-through price must be the higher one, or the discount
            // badge on the storefront shows a negative saving.
            'originalPriceTaka.gte' => 'The “was” price cannot be lower than the selling price.',
            'priceTaka.gt'          => 'A selling price of zero is not a price.',
        ];
    }
}
