<?php

declare(strict_types=1);

namespace Modules\Auth\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password;

/**
 * Explicit registration.
 *
 * Most accounts are created implicitly by an OTP login; this exists for
 * customers who want a password from the start. Email stays optional — it is
 * not the identity here.
 */
class RegisterRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'name'     => ['required', 'string', 'min:3', 'max:120'],
            'phone'    => ['required', 'string', 'regex:/^(?:\+?88)?01[3-9]\d{8}$/', 'unique:users,phone'],
            'email'    => ['nullable', 'email', 'max:160', 'unique:users,email'],
            // Laravel's uncompromised() checks the password against known
            // breach corpora — free, and it stops the worst reuse.
            'password' => ['required', 'confirmed', Password::min(8)->letters()->numbers()->uncompromised()],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'phone.unique' => 'An account already exists for that number — sign in instead.',
            'phone.regex'  => 'Enter a valid Bangladeshi mobile number, e.g. 01712345678.',
        ];
    }
}
