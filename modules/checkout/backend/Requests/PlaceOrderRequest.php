<?php

declare(strict_types=1);

namespace Modules\Checkout\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Placing an order.
 *
 * The field list mirrors the checkout form exactly: four required fields plus a
 * district. Phone is required and email is not, because in this market the
 * phone number is the identity primitive and a large share of buyers have no
 * email at all.
 *
 * Absent by design: subtotal, discount, delivery charge, total. The client does
 * not get to propose ANY figure — every number on the order is recomputed
 * server-side from the cart, the catalog, the delivery zone and the promo rules.
 */
class PlaceOrderRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;   // guest checkout is the default path
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'name'     => ['required', 'string', 'min:3', 'max:120'],
            // Bangladeshi mobile: 01[3-9] followed by 8 digits, optionally +88.
            'phone'    => ['required', 'string', 'regex:/^(?:\+?88)?01[3-9]\d{8}$/'],
            'email'    => ['nullable', 'email', 'max:160'],

            // THE STREET ADDRESS IS NOT REQUIRED, AND THE DISTRICT IS.
            //
            // Every order is telephoned before it is packed — `placed` means
            // "it arrived; nobody has spoken to them yet" and `confirmed`
            // means "a human called and the customer said yes". The address is
            // settled on that call whatever the form collected, so refusing an
            // order for want of a house number loses a sale to save a phone
            // call that was going to happen anyway.
            //
            // `min:6` still applies to an address that IS given, so a typed
            // "x" is still rejected — nullable means absent, not unchecked.
            //
            // The district stays required because it is the only one of the
            // three that is load-bearing before the call: delivery_zones is
            // keyed on it, so the total quoted to the customer depends on it.
            // A total agreed before the district is known is a total that can
            // change afterwards, and that is a different conversation from
            // "what is your house number".
            'address'  => ['nullable', 'string', 'min:6', 'max:255'],
            'area'     => ['nullable', 'string', 'max:120'],
            'district' => ['required', 'string', 'max:64', 'exists:districts,key'],
            'notes'    => ['nullable', 'string', 'max:500'],

            'delivery' => ['required', 'string', 'exists:delivery_zones,key'],
            'payment'  => ['required', Rule::in(['bkash', 'nagad', 'card', 'cod'])],

            // The honeypot. A field humans never see (visually hidden, out of
            // the tab order, autocomplete off) and form-filling bots reliably
            // fill. `prohibited` = present-and-non-empty fails, so real
            // customers — whose browsers submit it empty — never trip it.
            // The error message is deliberately generic: a honeypot that
            // explains itself is a honeypot with instructions for stepping
            // around it.
            'website' => ['prohibited'],

            // Ad attribution. The one exception to "the client proposes
            // nothing": these cost no money and buy the report that ties spend
            // to sales. Bounded hard — a UTM set is a handful of short strings,
            // and anything larger is someone using the column as a dumping
            // ground. Nullable throughout: organic orders carry neither.
            'source'    => ['sometimes', 'nullable', 'array', 'max:10'],
            'source.*'  => ['string', 'max:255'],
            'eventId'   => ['sometimes', 'nullable', 'string', 'max:64'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'phone.regex'      => 'Enter a valid Bangladeshi mobile number, e.g. 01712345678.',
            'district.exists'  => 'Choose your district so we can price delivery.',
            'delivery.exists'  => 'That delivery option is no longer available.',
        ];
    }
}
