<?php

declare(strict_types=1);

namespace Modules\Admin\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * What may be edited on a product.
 *
 * Note what is absent: `sku`, `barcode` and `origin`. Those are identity, not
 * settings. A screen that lets a busy person retype a barcode is a screen that
 * will eventually break the one verifiable promise the Sourcing page makes to
 * customers — that the code on the pack matches the code we published. They
 * are set once, at creation, in ProductStoreRequest.
 *
 * `category` IS editable, unlike the other three. Which shelf a product sits
 * on is a merchandising decision that changes — the catalogue grew "Dry Fruits"
 * and "Nuts & Makhana" next to an older "Nuts & Dry Fruits", and sorting that
 * out has to be possible from the panel rather than by re-seeding. Nothing
 * outside the shop's own navigation depends on it.
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

            // Where it sits in the catalogue. The controller checks that the
            // sub-category is actually inside the category — a rule the
            // validator cannot express, since it spans two fields and a row.
            'category'    => ['sometimes', 'string', 'exists:categories,slug'],
            'subCategory' => ['sometimes', 'nullable', 'string', 'exists:categories,slug'],

            // The complete, ordered gallery. Element zero is the main photo.
            // Bounded at 12 because a PDP nobody scrolls to the end of is not
            // more persuasive, and every entry is another image to store.
            'images'   => ['sometimes', 'array', 'max:12'],
            'images.*' => ['string', 'max:255'],

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
