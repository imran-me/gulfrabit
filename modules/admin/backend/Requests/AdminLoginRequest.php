<?php

declare(strict_types=1);

namespace Modules\Admin\Requests;

use Illuminate\Foundation\Http\FormRequest;

class AdminLoginRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'email'    => ['required', 'string', 'email', 'max:191'],
            // No max on length and no complexity rules at the door: this
            // validates shape, not policy. Rejecting a long passphrase here
            // would be worse for security, not better.
            'password' => ['required', 'string'],
        ];
    }
}
