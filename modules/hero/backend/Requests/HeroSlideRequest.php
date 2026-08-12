<?php

declare(strict_types=1);

namespace Modules\Hero\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/**
 * One banner, on the way in.
 */
class HeroSlideRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;   // the `admin:content` middleware already decided this
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        $required = $this->isMethod('POST') ? 'required' : 'sometimes';

        return [
            'imagePath'   => [$required, 'string', 'max:255'],
            // Required, not optional. A hero is the loudest thing on the page
            // and a screen reader gets nothing at all from it without this.
            'alt'         => [$required, 'string', 'min:3', 'max:255'],
            'headline'    => ['sometimes', 'nullable', 'string', 'max:120'],
            'subheadline' => ['sometimes', 'nullable', 'string', 'max:200'],

            'linkType'    => [$required, 'in:product,category,custom,none'],
            'linkValue'   => ['sometimes', 'nullable', 'string', 'max:255'],

            'sortOrder'   => ['sometimes', 'integer', 'min:0', 'max:9999'],
            'isActive'    => ['sometimes', 'boolean'],
            'startsAt'    => ['sometimes', 'nullable', 'date'],
            'endsAt'      => ['sometimes', 'nullable', 'date', 'after:startsAt'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $v): void {
            $type  = $this->input('linkType');
            $value = trim((string) $this->input('linkValue'));

            if ($type === 'none') {
                return;                       // a picture that is not a link
            }

            if ($value === '') {
                $v->errors()->add('linkValue', 'Choose where this banner should go.');

                return;
            }

            if ($type !== 'custom') {
                return;                       // a product id or category slug
            }

            // A same-site path only, never a full URL.
            //
            // A banner is the most-clicked thing on the shop, and an admin
            // account that can aim it at any host is an admin account that can
            // phish the shop's own customers from the shop's own home page.
            // The rules, in order: must start with a single slash (so "//evil"
            // — a protocol-relative URL — is refused as firmly as
            // "https://evil"), and must contain no colon before the first
            // slash, which is what "javascript:" needs to survive.
            if (! str_starts_with($value, '/') || str_starts_with($value, '//')) {
                $v->errors()->add('linkValue', 'A custom link must be a path on this site, starting with "/".');

                return;
            }

            if (preg_match('#^/[^/]*:#', $value) === 1) {
                $v->errors()->add('linkValue', 'That link is not a valid path on this site.');
            }
        });
    }
}
