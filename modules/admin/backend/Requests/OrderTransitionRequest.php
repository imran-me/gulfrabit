<?php

declare(strict_types=1);

namespace Modules\Admin\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Checkout\Services\OrderFulfilmentService;

class OrderTransitionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;   // the `admin:orders` middleware already decided this
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            // Shape only. WHETHER this particular move is legal for this
            // particular order is OrderFulfilmentService's job — a validator
            // that only knows the list of statuses would happily accept
            // "delivered → placed".
            'to'   => ['required', Rule::in(array_keys(OrderFulfilmentService::TRANSITIONS))],
            'note' => ['sometimes', 'nullable', 'string', 'max:500'],
        ];
    }
}
