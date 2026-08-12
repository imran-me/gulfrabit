<?php

declare(strict_types=1);

namespace Modules\Admin\Requests;

use Illuminate\Foundation\Http\FormRequest;

class OrderNoteRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;   // the `admin:orders` middleware already decided this
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            // 2000 rather than the 500 a status-change note gets. That one
            // annotates a click; this one is where somebody writes down a whole
            // phone call, and truncating the third paragraph of "what the
            // customer actually said" is how a record stops being worth keeping.
            'body' => ['required', 'string', 'min:2', 'max:2000'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'body.required' => 'Write something before saving the note.',
        ];
    }
}
