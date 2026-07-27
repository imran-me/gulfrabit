<?php

declare(strict_types=1);

namespace Modules\Courier\Requests;

use Illuminate\Foundation\Http\FormRequest;

class AssignCourierRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;   // the `admin:orders` middleware already decided this
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'courierKey' => ['required', 'string', 'exists:couriers,key'],

            // Optional on purpose. An API driver returns the tracking number,
            // a manual one needs it typed, and sometimes it is on a slip that
            // arrives an hour after the rider does. Forcing it at handover
            // would push staff into inventing one.
            'trackingNumber' => ['sometimes', 'nullable', 'string', 'max:64'],

            // What the COURIER charges us — not the delivery fee the customer
            // paid. Keeping the two apart is the only way to know whether
            // delivery makes or loses money.
            'costTaka' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:100000'],

            'note' => ['sometimes', 'nullable', 'string', 'max:500'],
        ];
    }
}
