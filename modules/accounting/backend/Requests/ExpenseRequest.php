<?php

declare(strict_types=1);

namespace Modules\Accounting\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ExpenseRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;   // `admin:accounting` middleware already decided this
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'amountTaka'  => ['required', 'numeric', 'gt:0', 'max:100000000'],
            // Which expense account this belongs to. `exists` against the chart
            // rather than a hardcoded list, so accounts added by the merchant
            // work without a code change.
            'accountCode' => ['required', 'string', 'exists:accounts,code'],
            // Where the money left from — bank, cash in hand, or payable if it
            // is on credit. An expense with no funding side is half an entry.
            'paidFrom'    => ['required', 'string', 'exists:accounts,code'],
            'description' => ['required', 'string', 'min:3', 'max:191'],
            // Defaults to today in the service. Allowed to be backdated because
            // receipts arrive late, but not into the future.
            'date'        => ['sometimes', 'date', 'before_or_equal:today'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'description.required' => 'Describe what this was for — it is what the entry says forever.',
            'date.before_or_equal' => 'An expense cannot be dated in the future.',
        ];
    }
}
