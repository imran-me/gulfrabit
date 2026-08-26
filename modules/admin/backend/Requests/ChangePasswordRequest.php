<?php

declare(strict_types=1);

namespace Modules\Admin\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password;

/**
 * Changing your own password.
 *
 * The strength rule is deliberately weaker than what the server generates
 * (twenty characters, mixed) and deliberately stronger than nothing. Somebody
 * replacing a generated password is choosing something they can remember and
 * type at a counter twenty times a day; demand symbols and mixed case on top
 * of twelve characters and what you get is the shop's name, a year and an
 * exclamation mark — written on a note under the keyboard.
 *
 * `uncompromised()` is deliberately NOT here. It would check the password
 * against the Have I Been Pwned range API, which means this shop's server
 * making an outbound call to a third party every time a staff member changes
 * their password. That is a defensible trade, but it is the merchant's trade
 * to make, not a dependency to add to a password form by default.
 */
class ChangePasswordRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;   // `admin` on the route is the control — any signed-in staff
    }

    public function rules(): array
    {
        return [
            'current'  => ['required', 'string'],
            'password' => [
                'required',
                'confirmed',
                // Refuses re-submitting the one you already have. Without it,
                // "change your password" happily accepts the password being
                // changed and reports success, which is the worst possible
                // answer to give somebody who has been told to rotate it.
                'different:current',
                Password::min(12)->letters()->numbers(),
            ],
        ];
    }

    public function messages(): array
    {
        return [
            'current.required'    => 'Type your current password to confirm it is you.',
            'password.confirmed'  => 'The two new passwords do not match.',
            'password.different'  => 'That is the password you already have. Choose a different one.',
        ];
    }

    public function attributes(): array
    {
        return ['current' => 'your current password', 'password' => 'the new password'];
    }
}
