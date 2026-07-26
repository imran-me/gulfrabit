<?php

declare(strict_types=1);

namespace Modules\Auth\Requests;

use Illuminate\Foundation\Http\FormRequest;

/** Asking for a login code. */
class OtpRequestRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            // Bangladeshi mobile only. Anything else cannot receive our SMS, so
            // accepting it would just burn gateway credit on a guaranteed
            // failure.
            'phone' => ['required', 'string', 'regex:/^(?:\+?88)?01[3-9]\d{8}$/'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'phone.regex' => 'Enter a valid Bangladeshi mobile number, e.g. 01712345678.',
        ];
    }
}
