<?php

declare(strict_types=1);

namespace Modules\Auth\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Password sign-in — the fallback path.
 *
 * One field accepts either a phone or an email, because asking the customer
 * which one they registered with is a question they should not have to answer.
 */
class LoginRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'identifier' => ['required', 'string', 'max:160'],
            'password'   => ['required', 'string', 'max:200'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'identifier.required' => 'Enter your phone number or email.',
        ];
    }
}
