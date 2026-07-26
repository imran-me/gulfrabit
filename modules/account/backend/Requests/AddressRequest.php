<?php

declare(strict_types=1);

namespace Modules\Account\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Creating or updating a saved address.
 *
 * Mirrors the checkout form exactly. An address that cannot be dropped straight
 * into checkout is just a note, so the required set is identical: recipient,
 * phone, line, district. No postcode — Bangladeshi addresses are not routed by
 * one and checkout does not ask for it.
 */
class AddressRequest extends FormRequest
{
    public function authorize(): bool
    {
        // Ownership is enforced by route-model scoping in the controller, not
        // here — this only validates shape.
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        $required = $this->isMethod('POST') ? 'required' : 'sometimes';

        return [
            'label'      => ['sometimes', 'string', 'max:32'],
            'name'       => [$required, 'string', 'min:3', 'max:120'],
            'phone'      => [$required, 'string', 'regex:/^(?:\+?88)?01[3-9]\d{8}$/'],
            'line1'      => [$required, 'string', 'min:6', 'max:255'],
            'area'       => ['nullable', 'string', 'max:120'],
            // The district is what prices delivery, so it must resolve to a
            // real row rather than being free text.
            'districtId' => [$required, 'integer', 'exists:districts,id'],
            'notes'      => ['nullable', 'string', 'max:500'],
            'isDefault'  => ['sometimes', 'boolean'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'phone.regex'       => 'Enter a valid Bangladeshi mobile number, e.g. 01712345678.',
            'districtId.exists' => 'Choose a district we deliver to.',
        ];
    }
}
