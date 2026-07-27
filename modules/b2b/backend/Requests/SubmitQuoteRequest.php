<?php

declare(strict_types=1);

namespace Modules\B2b\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Submitting an RFQ.
 *
 * Public — procurement staff routinely request quotes before anyone creates an
 * account, and forcing a signup here loses the lead outright.
 *
 * Note what is absent: any price. The submitter says WHAT and HOW MANY; what it
 * costs is ours to work out.
 */
class SubmitQuoteRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'company'      => ['required', 'string', 'min:2', 'max:160'],
            'contact'      => ['required', 'string', 'min:2', 'max:120'],
            // Phone required, email optional — the same identity assumption as
            // the rest of the site. A B2B buyer will answer their phone.
            'phone'        => ['required', 'string', 'regex:/^(?:\+?88)?01[3-9]\d{8}$/'],
            'email'        => ['nullable', 'email', 'max:160'],
            'notes'        => ['nullable', 'string', 'max:2000'],

            // An array from the start: a real RFQ covers several parts, and the
            // single-product form is just today's UI.
            'items'        => ['required', 'array', 'min:1', 'max:50'],
            'items.*.sku'  => ['required', 'string', 'max:32', 'exists:products,sku'],
            'items.*.qty'  => ['required', 'integer', 'min:1', 'max:1000000'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'phone.regex'        => 'Enter a valid Bangladeshi mobile number, e.g. 01712345678.',
            'items.required'     => 'Add at least one product to request a quote.',
            'items.*.sku.exists' => 'One of those products is no longer available.',
        ];
    }
}
