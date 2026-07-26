<?php

declare(strict_types=1);

namespace Modules\Delivery\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates a shipping-quote request.
 *
 * Note what is NOT accepted: a `cost`. The client may not propose a delivery
 * charge, so there is no field for one to arrive in. Price is resolved
 * server-side from the district alone.
 */
class ShippingQuoteRequest extends FormRequest
{
    /** Quoting is public — a guest must be able to price delivery before login. */
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'district' => ['required', 'string', 'max:64', 'exists:districts,key'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'district.required' => 'Choose your district so we can price delivery.',
            'district.exists'   => 'We do not recognise that district.',
        ];
    }

    public function districtKey(): string
    {
        return (string) $this->validated()['district'];
    }
}
