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

            // origin and barcode are still absent, on purpose — see the note
            // above. They were the obvious things to add while filling this
            // list out, and the class docblock is the reason not to: a barcode
            // the panel can retype is a barcode that stops matching the pack.
            // If origin ever needs correcting, do it deliberately and say so
            // there, rather than letting it arrive as part of a form tidy-up.

            // Display pack size — "500 g". Never parsed, only printed.
            'unit' => ['sometimes', 'nullable', 'string', 'max:32'],

            // Merchandising lists. Bounded so a paste accident cannot put a
            // thousand entries in a JSON column that is read on every render.
            'tags'          => ['sometimes', 'array', 'max:12'],
            'tags.*'        => ['string', 'max:32'],
            'dietary'       => ['sometimes', 'array', 'max:12'],
            'dietary.*'     => ['string', 'max:32'],
            'searchTerms'   => ['sometimes', 'array', 'max:40'],
            'searchTerms.*' => ['string', 'max:48'],

            // Selectable packs. THE LABEL IS THE IDENTITY: cart lines and
            // order rows record the chosen pack by label, and the PDP selects
            // by it. Renaming a label therefore orphans past carts' claim to
            // it — allowed, but it is a real change, not cosmetics. `amount`
            // is how much of the product's `unit` the pack holds; it drives
            // the "৳ X / kg" line and nothing else.
            'variants'                      => ['sometimes', 'array', 'max:12'],
            'variants.*.label'              => ['required', 'string', 'max:96'],
            'variants.*.amount'             => ['sometimes', 'nullable', 'numeric', 'gt:0'],
            'variants.*.priceTaka'          => ['required', 'numeric', 'gt:0', 'max:10000000'],
            'variants.*.originalPriceTaka'  => ['sometimes', 'nullable', 'numeric', 'max:10000000'],
            'variants.*.inStock'            => ['sometimes', 'boolean'],
            // What we actually hold of this pack. Staff-only, and nullable
            // because "nobody has counted this" is a real state that must not
            // be recorded as zero — the same distinction cost makes.
            'variants.*.stockQty'           => ['sometimes', 'nullable', 'integer', 'min:0', 'max:999999'],
            // The public per-pack "Only N left". Same cap as the product-level
            // field: scarcity that reads "Only 4,000 left" is not scarcity.
            'variants.*.stockDisplay'       => ['sometimes', 'nullable', 'integer', 'min:0', 'max:9999'],
            'defaultVariant'                => ['sometimes', 'nullable', 'string', 'max:96'],

            // `nullable` on cost is load-bearing: clearing it means "we no
            // longer claim to know this", which is a different and more honest
            // state than zero.
            'priceTaka'         => ['sometimes', 'numeric', 'gt:0', 'max:10000000'],
            // gte:priceTaka compares against the OTHER FIELD IN THE REQUEST,
            // not the stored price — and this endpoint receives diff-only
            // PATCHes, so "set a was-price without touching the price" arrived
            // without priceTaka and the comparison against null failed every
            // time. The merchant literally could not create a discount except
            // by re-typing the selling price in the same save. The rule only
            // applies when both fields travel together; the controller enforces
            // the invariant against the stored price for every other shape.
            'originalPriceTaka' => array_values(array_filter([
                'sometimes', 'nullable', 'numeric',
                $this->has('priceTaka') ? 'gte:priceTaka' : null,
                'max:10000000',
            ])),
            'costTaka'          => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:10000000'],

            'inStock'  => ['sometimes', 'boolean'],
            'isActive' => ['sometimes', 'boolean'],

            // The PUBLIC "Only N left" figure. Nullable is the whole point:
            // clearing it means "say nothing about how many are left", which
            // is a different statement from 0 ("we are out"). Capped low
            // because scarcity that reads "Only 4,000 left" is not scarcity.
            'stockDisplay' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:9999'],

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
