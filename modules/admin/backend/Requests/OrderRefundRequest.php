<?php

declare(strict_types=1);

namespace Modules\Admin\Requests;

use Illuminate\Foundation\Http\FormRequest;

class OrderRefundRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            // Taka in, poisha stored. The ceiling here is a sanity bound only;
            // the real limit is what is still refundable on THIS order, and
            // that is checked inside the same DB transaction that writes the
            // row, because checking it here would leave a race.
            'amountTaka' => ['required', 'numeric', 'gt:0', 'max:10000000'],
            'method'     => ['required', 'in:original,bkash,nagad,bank,cash,store_credit'],
            // A refund with no stated reason is untraceable three months later,
            // which is exactly when someone asks about it.
            'reason'     => ['required', 'string', 'min:3', 'max:500'],
            'reference'  => ['sometimes', 'nullable', 'string', 'max:120'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'reason.required' => 'Say why this refund is being given — it is the only record.',
        ];
    }
}
