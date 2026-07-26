<?php

declare(strict_types=1);

namespace Modules\Auth\Requests;

use Illuminate\Foundation\Http\FormRequest;

/** Submitting a login code. */
class OtpVerifyRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'phone' => ['required', 'string', 'regex:/^(?:\+?88)?01[3-9]\d{8}$/'],
            // Exactly six digits — a length check here stops obviously-wrong
            // input from consuming one of the five attempts.
            'code'  => ['required', 'string', 'digits:6'],
        ];
    }
}
