<?php

declare(strict_types=1);

namespace Modules\Cms\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ContentBlockRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;   // `admin:content` middleware already decided this
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            // Dotted key, matching what is written into the markup. Constrained
            // so a typo cannot create an orphan row nothing will ever read.
            'key'  => ['required', 'string', 'max:120', 'regex:/^[a-z0-9]+(\.[a-z0-9-]+)+$/'],
            'page' => ['required', 'string', 'max:60', 'regex:/^[a-z0-9-]+$/'],

            // Two types, and there is deliberately no 'html'. See the
            // content_blocks migration for why that is not an oversight.
            'type'  => ['required', 'in:text,image'],
            'value' => ['required', 'string', 'max:5000'],
            'alt'   => ['sometimes', 'nullable', 'string', 'max:255'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'key.regex'  => 'Keys look like page.section.field.',
            'type.in'    => 'Only text and images can be edited — layout is not editable.',
        ];
    }
}
