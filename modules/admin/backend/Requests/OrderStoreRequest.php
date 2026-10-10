<?php

declare(strict_types=1);

namespace Modules\Admin\Requests;

use Illuminate\Validation\Rule;
use Modules\Checkout\Models\Order;

/**
 * Placing an order taken by phone or by message.
 *
 * Everything OrderQuoteRequest allows, plus the half a quote does not need:
 * who it is for and where it is going. The customer's fields carry the SAME
 * rules as the storefront's PlaceOrderRequest — same phone pattern, same
 * optional street address, same required district — because an order typed in
 * here sits in the same table and is read by the same slip, the same courier
 * booking and the same SMS, none of which know or care who did the typing.
 */
class OrderStoreRequest extends OrderQuoteRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return array_merge(parent::rules(), [
            'name'     => ['required', 'string', 'min:3', 'max:120'],
            // Bangladeshi mobile: 01[3-9] followed by 8 digits, optionally +88.
            // The pattern is PlaceOrderRequest's. Kept identical on purpose:
            // the SMS gateway and the courier's booking form both reject what
            // this rejects, and finding that out at the door of the warehouse
            // is later than finding it out here.
            'phone'    => ['required', 'string', 'regex:/^(?:\+?88)?01[3-9]\d{8}$/'],
            'email'    => ['sometimes', 'nullable', 'email', 'max:160'],

            // Not required, for the reason it is not required at checkout: a
            // customer who says "I will send the address on WhatsApp" has
            // still placed an order. It lands with the address marked missing,
            // and the order screen has an Add button for exactly that.
            'address'  => ['sometimes', 'nullable', 'string', 'min:6', 'max:255'],
            'area'     => ['sometimes', 'nullable', 'string', 'max:120'],
            // Required here though optional in a quote: it sets the delivery
            // charge, and an order cannot be written with a total that is
            // still waiting on where it is going.
            'district' => ['required', 'string', 'max:64', 'exists:districts,key'],
            'notes'    => ['sometimes', 'nullable', 'string', 'max:500'],

            'payment'  => ['required', Rule::in(['cod', 'bkash', 'nagad', 'card'])],

            // Which door it came through. `website` is not on this list — see
            // Order::MANUAL_CHANNELS.
            'channel'  => ['required', Rule::in(Order::MANUAL_CHANNELS)],

            // "The customer has already said yes." Absent means false, and
            // false is the default the form sends: a custom order lands in
            // `placed` and is worked from there like any other. This is the
            // shortcut for an order whose confirmation call was the call it
            // was taken on, and it is only ever set by a person ticking a box.
            'confirmed' => ['sometimes', 'boolean'],
        ]);
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return array_merge(parent::messages(), [
            'name.required'     => 'Whose order is this? Enter the customer’s name.',
            'name.min'          => 'That name is too short to put on a parcel.',
            'phone.required'    => 'Enter the customer’s mobile number.',
            'phone.regex'       => 'Enter a valid Bangladeshi mobile number, e.g. 01712345678.',
            'address.min'       => 'That address is too short to find a house with. Leave it empty to add it later.',
            'district.required' => 'Choose the district so delivery can be priced.',
            'channel.in'        => 'Say how the order came in — phone, WhatsApp, Messenger…',
        ]);
    }
}
