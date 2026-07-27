<?php

declare(strict_types=1);

namespace Modules\B2b\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Modules\B2b\Models\QuoteRequest;
use Modules\Catalog\Models\Product;
use RuntimeException;

/**
 * Creating and pricing RFQs.
 *
 * The important distinction: this produces an **indicative** figure from
 * published tier pricing, never a commitment. A B2B quote is agreed by a human
 * after checking stock, lead time and freight. Storing the indicative total
 * lets the desk see whether our own price moved between the ask and the reply.
 */
final class QuoteService
{
    public function create(array $input, ?int $userId = null): QuoteRequest
    {
        return DB::transaction(function () use ($input, $userId): QuoteRequest {
            $lines = $this->resolveLines($input['items']);

            if ($lines === []) {
                throw new RuntimeException('Add at least one product to request a quote.');
            }

            $quote = QuoteRequest::create([
                'reference'               => $this->generateReference(),
                'user_id'                 => $userId,
                'company'                 => $input['company'],
                'contact_name'            => $input['contact'],
                'contact_phone'           => $this->normalisePhone($input['phone']),
                'contact_email'           => $input['email'] ?? null,
                'notes'                   => $input['notes'] ?? null,
                'indicative_total_poisha' => array_sum(array_column($lines, 'lineTotal')),
                'status'                  => 'new',
            ]);

            foreach ($lines as $line) {
                $quote->items()->create([
                    'product_id'             => $line['productId'],
                    'sku'                    => $line['sku'],
                    'title'                  => $line['title'],
                    'qty'                    => $line['qty'],
                    'indicative_unit_poisha' => $line['unit'],
                ]);
            }

            return $quote->load('items');
        });
    }

    /**
     * Turn submitted { sku, qty } pairs into priced lines.
     *
     * @return array<int, array{productId:int, sku:string, title:string, qty:int, unit:int, lineTotal:int}>
     */
    private function resolveLines(array $items): array
    {
        $lines = [];

        foreach ($items as $item) {
            $product = Product::query()->active()->where('sku', $item['sku'])->first();

            if ($product === null) {
                throw new RuntimeException("Unknown product: {$item['sku']}");
            }

            $qty = max(1, (int) $item['qty']);

            // Below MOQ is not an error — it is a conversation. Quoting anyway
            // and letting the desk say "our minimum is 50" keeps the lead,
            // where a hard rejection loses it.
            $unit = $this->tierPricePoisha($product, $qty);

            $lines[] = [
                'productId' => (int) $product->id,
                'sku'       => $product->sku,
                'title'     => $product->title,
                'qty'       => $qty,
                'unit'      => $unit,
                'lineTotal' => $unit * $qty,
            ];
        }

        return $lines;
    }

    /**
     * Unit price for a quantity, from the product's volume breaks.
     *
     * Tiers are stored as [{qty, price_poisha}] where `qty` is the MINIMUM
     * quantity for that price. Sorted descending and the first match wins, so
     * ordering 2,000 gets the 2,000-unit rate rather than the 50-unit one.
     *
     * Mirrors resolveTierPrice() in backend/api.js — change both together.
     */
    public function tierPricePoisha(Product $product, int $qty): int
    {
        $tiers = $product->price_tiers ?? [];

        if ($tiers === []) {
            return $product->price_poisha;
        }

        usort($tiers, static fn (array $a, array $b) => ($b['qty'] ?? 0) <=> ($a['qty'] ?? 0));

        foreach ($tiers as $tier) {
            if ($qty >= (int) ($tier['qty'] ?? 0)) {
                return (int) ($tier['price_poisha'] ?? $product->price_poisha);
            }
        }

        // Below every break: the list price stands.
        return $product->price_poisha;
    }

    /**
     * RFQ-2026-XXXXXX, random. A sequential reference would let a competitor
     * submit two requests and read our pipeline volume off the gap.
     */
    private function generateReference(): string
    {
        do {
            $ref = 'RFQ-' . now()->year . '-' . strtoupper(Str::random(6));
        } while (QuoteRequest::where('reference', $ref)->exists());

        return $ref;
    }

    private function normalisePhone(string $phone): string
    {
        $digits = preg_replace('/\D/', '', $phone) ?? '';

        return str_starts_with($digits, '88') ? substr($digits, 2) : $digits;
    }
}
