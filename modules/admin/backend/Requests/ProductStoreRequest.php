<?php

declare(strict_types=1);

namespace Modules\Admin\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * What is required to bring a product into existence.
 *
 * Four things are mandatory — title, category, price, and at least one photo.
 * Everything else has a sensible default and can be filled in on the edit
 * screen, which opens straight after creation.
 *
 * The photo is required deliberately. A catalogue of premium imported goods
 * where a listing shows a grey placeholder undoes the positioning in one
 * screen, and "I'll add the picture later" reliably means never. Making it a
 * field the merchant cannot skip is the cheapest way to keep that from
 * happening product by product.
 *
 * `barcode` and `origin` are accepted HERE and nowhere else. They are identity
 * — the Sourcing page invites customers to check the barcode against the
 * physical pack — so they are set once, when the person has the packaging in
 * front of them, and are not editable afterwards.
 */
class ProductStoreRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;   // `admin:products` middleware already decided this
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'title'       => ['required', 'string', 'min:3', 'max:191'],
            'category'    => ['required', 'string', 'exists:categories,slug'],
            'subCategory' => ['sometimes', 'nullable', 'string', 'exists:categories,slug'],

            'priceTaka' => ['required', 'numeric', 'gt:0', 'max:10000000'],

            // The "was" price. Must be above the selling price or the discount
            // it implies is a lie, and a struck-through number that is lower
            // than the one beside it is the kind of detail customers notice.
            'originalPriceTaka' => ['sometimes', 'nullable', 'numeric', 'gt:priceTaka', 'max:10000000'],

            // Nullable, never defaulted to zero: a zero cost makes every sale
            // report as pure profit in the P&L.
            'costTaka' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:10000000'],

            'images'   => ['required', 'array', 'min:1', 'max:12'],
            'images.*' => ['string', 'max:255'],

            'brand'   => ['sometimes', 'nullable', 'string', 'max:96'],
            'origin'  => ['sometimes', 'nullable', 'string', 'max:64'],
            'barcode' => ['sometimes', 'nullable', 'string', 'max:32', 'unique:products,barcode'],

            'shortDescription' => ['sometimes', 'nullable', 'string', 'max:255'],
            'description'      => ['sometimes', 'nullable', 'string', 'max:5000'],

            // Kept identical to ProductUpdateRequest so a product cannot be
            // created in a shape the edit screen is then unable to express.
            'unit' => ['sometimes', 'nullable', 'string', 'max:32'],

            'tags'          => ['sometimes', 'array', 'max:12'],
            'tags.*'        => ['string', 'max:32'],
            'dietary'       => ['sometimes', 'array', 'max:12'],
            'dietary.*'     => ['string', 'max:32'],
            'searchTerms'   => ['sometimes', 'array', 'max:40'],
            'searchTerms.*' => ['string', 'max:48'],

            'variants'                     => ['sometimes', 'array', 'max:12'],
            'variants.*.label'             => ['required', 'string', 'max:96'],
            'variants.*.amount'            => ['sometimes', 'nullable', 'numeric', 'gt:0'],
            'variants.*.priceTaka'         => ['required', 'numeric', 'gt:0', 'max:10000000'],
            'variants.*.originalPriceTaka' => ['sometimes', 'nullable', 'numeric', 'max:10000000'],
            'variants.*.inStock'           => ['sometimes', 'boolean'],
            'defaultVariant'               => ['sometimes', 'nullable', 'string', 'max:96'],

            /* Arrival. `availableFrom` is the whole feature: a date in the
               future makes the product upcoming, and the day it passes the
               product goes on sale by itself. Clearing it (null) is how a
               merchant says "it is here now" ahead of the date.

               `after_or_equal:today` on a NEW product only — see the update
               request, where a past date has to stay editable so an arrival
               that already happened can be corrected. */
            'availableFrom'    => ['sometimes', 'nullable', 'date'],
            'preorderEnabled'  => ['sometimes', 'boolean'],
            // The cap on what may be sold before the shipment lands. Null is
            // "no cap", which is right for a line the supplier always has and
            // wrong for a single seasonal container.
            'preorderLimit'    => ['sometimes', 'nullable', 'integer', 'min:1', 'max:9999'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'images.required' => 'Add at least one photo. It becomes the product\'s main image.',
            'category.exists' => 'Pick a category. Create one first if the right one does not exist.',
            'originalPriceTaka.gt' => 'The "was" price has to be higher than the selling price.',
            'barcode.unique' => 'Another product already has that barcode.',
        ];
    }
}
