<?php

declare(strict_types=1);

namespace Modules\Admin\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Cart\Models\CartItem;

/**
 * Pricing an order a member of staff is in the middle of typing.
 *
 * The form asks for this on every change — a line added, a pack switched, a
 * district chosen — so almost everything is optional: half a form is the
 * normal state of a form, and a quote that refused to answer until the phone
 * number was valid would be no use to somebody still asking what the customer
 * wants.
 *
 * WHAT IS ABSENT, AS EVERYWHERE ELSE
 * ----------------------------------
 * No price, no discount, no delivery charge, no total. Staff choose products,
 * packs and quantities; the server works out what that costs, by the same
 * route it prices a website order. A member of staff is trusted to take an
 * order — that is not the same as being handed a field that edits one.
 */
class OrderQuoteRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;   // `admin:orders.edit` on the route already decided this
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            // Forty lines is a very large phone order and a small payload. The
            // cap is on the request, not on the business: past it, somebody is
            // typing a wholesale order into the wrong screen.
            'lines'           => ['required', 'array', 'min:1', 'max:40'],
            'lines.*.sku'     => ['required', 'string', 'max:64'],
            // The column's ceiling, not the product's. What ONE product may be
            // ordered up to depends on its minimum order quantity, which this
            // class cannot see — OrderService::basket() enforces that and
            // names the product when it refuses.
            'lines.*.qty'     => ['required', 'integer', 'min:1', 'max:' . CartItem::COLUMN_MAX_QTY],
            // 64 is `order_items.variant`. A longer label would pass a looser
            // rule and then fail the INSERT, which is a 500 where a sentence
            // was available.
            'lines.*.variant' => ['sometimes', 'nullable', 'string', 'max:64'],

            'district' => ['sometimes', 'nullable', 'string', 'max:64', 'exists:districts,key'],
            // Deliberately not `exists:delivery_zones,key`. A stale or
            // unoffered key is not an error here — OrderService ignores it in
            // favour of what the district actually costs, exactly as it does
            // for a customer's.
            'delivery' => ['sometimes', 'nullable', 'string', 'max:64'],
            'payment'  => ['sometimes', 'nullable', Rule::in(['cod', 'bkash', 'nagad', 'card'])],
            'promo'    => ['sometimes', 'nullable', 'string', 'max:32'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'lines.required'  => 'Add at least one product to the order.',
            'lines.max'       => 'That is more lines than one order can hold here. Split it into two orders.',
            'lines.*.qty.min' => 'A quantity has to be at least 1.',
            'district.exists' => 'Choose the district so delivery can be priced.',
        ];
    }
}
