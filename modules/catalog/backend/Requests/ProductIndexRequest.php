<?php

declare(strict_types=1);

namespace Modules\Catalog\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Validates a product listing / search request.
 *
 * Filters arrive straight from query-string URLs that users share and bookmark,
 * so everything is optional and nothing is trusted. `sort` is whitelisted rather
 * than passed through — it reaches an ORDER BY, and an open sort parameter is a
 * column-enumeration hole.
 */
class ProductIndexRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'category'   => ['sometimes', 'string', 'max:96', 'exists:categories,slug'],
            'q'          => ['sometimes', 'string', 'max:120'],

            'brands'     => ['sometimes', 'array', 'max:30'],
            'brands.*'   => ['string', 'max:96'],
            'origins'    => ['sometimes', 'array', 'max:30'],
            'origins.*'  => ['string', 'max:64'],
            'tags'       => ['sometimes', 'array', 'max:12'],
            'tags.*'     => ['string', 'max:32'],
            'dietary'    => ['sometimes', 'array', 'max:12'],
            'dietary.*'  => ['string', 'max:32'],

            // Taka, not poisha — this is what the user typed into the filter.
            'minPrice'   => ['sometimes', 'integer', 'min:0', 'max:10000000'],
            'maxPrice'   => ['sometimes', 'integer', 'min:0', 'max:10000000', 'gte:minPrice'],

            'rating'     => ['sometimes', 'numeric', 'between:0,5'],
            'inStock'    => ['sometimes', 'boolean'],
            'onSale'     => ['sometimes', 'boolean'],

            'sort'       => ['sometimes', Rule::in(['featured', 'price-asc', 'price-desc', 'newest', 'rating'])],
            'perPage'    => ['sometimes', 'integer', 'min:1', 'max:60'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'maxPrice.gte' => 'The maximum price cannot be below the minimum.',
            'sort.in'      => 'Unknown sort option.',
        ];
    }

    /** The validated filter bag, shaped for ProductQueryService. */
    public function filters(): array
    {
        return $this->validated();
    }
}
