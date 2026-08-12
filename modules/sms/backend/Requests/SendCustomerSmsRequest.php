<?php

declare(strict_types=1);

namespace Modules\Sms\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * One typed message to one customer.
 *
 * The 480-character ceiling is a cost decision, not a technical one. A GSM-7
 * SMS carries 160 characters per segment and every segment is billed, so this
 * is three segments — enough for a real explanation, short of the message where
 * somebody pastes a paragraph and spends fifteen taka without noticing. The
 * panel shows the segment count live so the limit is never a surprise.
 */
class SendCustomerSmsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;   // the `admin:orders` middleware already decided this
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'body' => ['required', 'string', 'min:2', 'max:480'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'body.required' => 'Write a message before sending.',
            'body.max'      => 'Keep it under 480 characters — that is three SMS segments.',
        ];
    }
}
