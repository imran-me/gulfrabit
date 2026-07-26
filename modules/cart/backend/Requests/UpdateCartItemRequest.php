<?php

declare(strict_types=1);

namespace Modules\Cart\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Changing a line quantity.
 *
 * `qty: 0` is allowed and means remove — the stepper expresses removal that way
 * when you decrement from 1, and rejecting it would strand the item.
 */
class UpdateCartItemRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'qty' => ['required', 'integer', 'min:0', 'max:99'],
        ];
    }
}
