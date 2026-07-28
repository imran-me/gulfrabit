<?php

declare(strict_types=1);

namespace Modules\Inventory\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StockMovementRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;   // `admin:inventory` middleware already decided this
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'sku'       => ['required', 'string', 'exists:products,sku'],
            'warehouse' => ['required', 'string', 'exists:warehouses,key'],

            // Signed and non-zero. The SIGN is validated against the reason in
            // StockService, not here — a validator that only knows the number
            // would happily accept a negative receipt.
            'qty'    => ['required', 'integer', 'not_in:0', 'min:-100000', 'max:100000'],
            'reason' => ['required', 'in:receipt,sale,return,damage,theft,count,transfer_in,transfer_out'],

            // Receipts only. This is the figure the whole cost-of-goods
            // calculation is built from, so it is worth asking for every time
            // stock arrives rather than reconstructing it later from invoices.
            'unitCostTaka' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:1000000'],

            'note' => ['sometimes', 'nullable', 'string', 'max:255'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'qty.not_in' => 'A movement of zero records nothing.',
        ];
    }
}
