<?php

declare(strict_types=1);

namespace Modules\Admin\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * The delivery address, written down from the confirmation call.
 *
 * WHY THIS EXISTS
 * ---------------
 * The express checkout asks for a name, a phone and a district and stops —
 * everything else is settled when a human rings to confirm, which is what
 * `placed` -> `confirmed` has always meant in this shop. That left the staff
 * member on the phone with a house number and nowhere to put it: an order note
 * is free text that the packing slip does not read, and `address_line` was
 * write-once at checkout.
 *
 * THE DISTRICT IS NOT EDITABLE HERE, AND THAT IS THE POINT
 * -------------------------------------------------------
 * `district_key` picks the delivery zone, and the delivery zone is a price the
 * customer has already been quoted and has already agreed to. Letting this
 * endpoint move it would change what the order is worth as a side effect of a
 * typing correction — silently, since nothing here recalculates the total.
 *
 * A district that is genuinely wrong is a different and larger conversation:
 * the customer is being asked to pay a different delivery fee, and that needs
 * saying out loud rather than fixing behind their back. Cancel and re-place,
 * or price the change deliberately.
 *
 * So: the street and the thana, which cost nothing and are what the call is
 * actually for.
 */
class OrderAddressRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;   // `admin:orders.edit` on the route already decided this
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            // Required, unlike at checkout. Skipping it there is a customer
            // saving themselves three taps on a form that is about to be
            // followed by a phone call. Skipping it HERE would be a staff
            // member clearing the address off an order and saving that, which
            // is not a thing anyone means to do.
            'address' => ['required', 'string', 'min:6', 'max:255'],
            'area'    => ['nullable', 'string', 'max:120'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'address.required' => 'Write the address down before saving.',
            'address.min'      => 'That is too short to find a house with.',
        ];
    }
}
