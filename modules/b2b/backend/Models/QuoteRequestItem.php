<?php

declare(strict_types=1);

namespace Modules\B2b\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Modules\Catalog\Models\Product;

/**
 * One line on an RFQ. Title and unit price are snapshots, so the quote still
 * reads correctly after the catalog changes.
 */
class QuoteRequestItem extends Model
{
    use HasFactory;

    protected $fillable = [
        'quote_request_id', 'product_id', 'sku', 'title', 'qty', 'indicative_unit_poisha',
    ];

    protected function casts(): array
    {
        return [
            'qty'                    => 'integer',
            'indicative_unit_poisha' => 'integer',
        ];
    }

    public function quoteRequest(): BelongsTo
    {
        return $this->belongsTo(QuoteRequest::class);
    }

    /** Nullable: delisting a product must not damage the record of the request. */
    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function toStorefrontArray(): array
    {
        return [
            'sku'            => $this->sku,
            'title'          => $this->title,
            'qty'            => $this->qty,
            'indicativeUnit' => intdiv($this->indicative_unit_poisha, 100),
        ];
    }
}
