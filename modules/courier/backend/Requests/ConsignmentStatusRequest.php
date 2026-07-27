<?php

declare(strict_types=1);

namespace Modules\Courier\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ConsignmentStatusRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            // 'draft' is absent deliberately: a consignment starts there and
            // nothing may move it back, because "not yet handed over" stops
            // being true the moment it is.
            'status'      => ['required', 'in:booked,picked_up,in_transit,delivered,failed,returned,cancelled'],
            'description' => ['sometimes', 'nullable', 'string', 'max:255'],
            'location'    => ['sometimes', 'nullable', 'string', 'max:120'],
        ];
    }
}
