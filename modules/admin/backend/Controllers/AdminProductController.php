<?php

declare(strict_types=1);

namespace Modules\Admin\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Modules\Admin\Requests\ProductUpdateRequest;
use Modules\Catalog\Models\Product;

/**
 * Editing the catalogue.
 *
 * Scoped deliberately narrowly: the fields a merchant changes week to week —
 * price, cost, stock flag, description, activity. Not the SKU, not the category
 * structure, not the barcode. Those are identity, and a screen that lets a busy
 * person retype a barcode is a screen that will eventually break the one
 * verifiable promise on the Sourcing page.
 */
class AdminProductController extends Controller
{
    /** Money fields whose changes are logged. */
    private const TRACKED_MONEY = [
        'price_poisha'          => 'price',
        'original_price_poisha' => 'original_price',
        'cost_poisha'           => 'cost',
    ];

    /** GET /api/admin/products */
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'q'         => ['sometimes', 'string', 'max:64'],
            'category'  => ['sometimes', 'string', 'max:96'],
            'noCost'    => ['sometimes', 'boolean'],
            'perPage'   => ['sometimes', 'integer', 'min:10', 'max:100'],
        ]);

        $query = Product::query()->with('category:id,slug,name')->orderBy('title');

        if (! empty($data['q'])) {
            $term = trim($data['q']);
            $query->where(fn ($w) => $w->where('title', 'like', "%{$term}%")
                ->orWhere('sku', 'like', "%{$term}%")
                ->orWhere('brand', 'like', "%{$term}%"));
        }

        if (! empty($data['category'])) {
            $query->whereHas('category', fn ($c) => $c->where('slug', $data['category']));
        }

        // The most useful filter on this screen right now: which products still
        // have no cost recorded, and therefore cannot appear in a margin
        // figure. It turns a vague blocker into a worklist.
        if ($request->boolean('noCost')) {
            $query->whereNull('cost_poisha');
        }

        $page = $query->paginate($data['perPage'] ?? 25);

        return response()->json([
            'data' => array_map(fn (Product $p): array => [
                'sku'        => $p->sku,
                'title'      => $p->title,
                'brand'      => $p->brand,
                'category'   => $p->category?->name,
                'priceTaka'  => intdiv($p->price_poisha, 100),
                'costTaka'   => $p->cost_poisha === null ? null : intdiv($p->cost_poisha, 100),
                'marginPct'  => $this->marginPercent($p),
                'inStock'    => $p->in_stock,
                'isActive'   => $p->is_active,
            ], $page->items()),
            'meta' => [
                'total'       => $page->total(),
                'perPage'     => $page->perPage(),
                'currentPage' => $page->currentPage(),
                'lastPage'    => $page->lastPage(),
                // Surfaced so the screen can lead with it rather than making
                // somebody page through looking for gaps.
                'missingCost' => Product::query()->whereNull('cost_poisha')->count(),
            ],
        ]);
    }

    /** GET /api/admin/products/{sku} */
    public function show(string $sku): JsonResponse
    {
        $product = Product::query()->with('category:id,slug,name')->where('sku', $sku)->firstOrFail();

        $history = DB::table('product_price_changes')
            ->where('product_id', $product->id)
            ->latest()
            ->limit(50)
            ->get()
            ->map(fn ($h): array => [
                'field' => $h->field,
                'from'  => $h->from_poisha === null ? null : intdiv((int) $h->from_poisha, 100),
                'to'    => $h->to_poisha === null ? null : intdiv((int) $h->to_poisha, 100),
                'actor' => $h->actor_name,
                'reason' => $h->reason,
                'at'    => $h->created_at,
            ])
            ->all();

        return response()->json([
            'data' => $product->toAdminArray() + [
                'marginPct'    => $this->marginPercent($product),
                'priceHistory' => $history,
            ],
        ]);
    }

    /** PATCH /api/admin/products/{sku} */
    public function update(ProductUpdateRequest $request, string $sku): JsonResponse
    {
        $product = Product::query()->where('sku', $sku)->firstOrFail();
        $admin = $request->user('admin');

        $changes = [];

        foreach (['priceTaka' => 'price_poisha', 'originalPriceTaka' => 'original_price_poisha', 'costTaka' => 'cost_poisha'] as $input => $column) {
            if (! $request->has($input)) {
                continue;
            }

            $value = $request->input($input);
            // An explicit null means "we do not know this", which is a real and
            // different state from zero — especially for cost, where zero would
            // report every sale as pure profit.
            $new = $value === null || $value === '' ? null : (int) round((float) $value * 100);

            if ($new !== $product->{$column}) {
                $changes[$column] = ['from' => $product->{$column}, 'to' => $new];
                $product->{$column} = $new;
            }
        }

        foreach (['title', 'brand', 'short_description', 'description'] as $field) {
            $input = lcfirst(str_replace('_', '', ucwords($field, '_')));
            if ($request->has($input)) {
                $product->{$field} = $request->input($input);
            }
        }

        if ($request->has('inStock')) {
            $product->in_stock = $request->boolean('inStock');
        }
        if ($request->has('isActive')) {
            $product->is_active = $request->boolean('isActive');
        }

        DB::transaction(function () use ($product, $changes, $admin, $request): void {
            $product->save();

            foreach ($changes as $column => $move) {
                DB::table('product_price_changes')->insert([
                    'product_id'     => $product->id,
                    'field'          => self::TRACKED_MONEY[$column],
                    'from_poisha'    => $move['from'],
                    'to_poisha'      => $move['to'],
                    'actor_admin_id' => $admin->id,
                    'actor_name'     => $admin->name,
                    'reason'         => $request->input('reason'),
                    'created_at'     => now(),
                    'updated_at'     => now(),
                ]);
            }
        });

        return response()->json([
            'data'    => $product->fresh()->toAdminArray(),
            'message' => $changes === []
                ? 'Saved.'
                : count($changes) . ' price change(s) recorded against your name.',
        ]);
    }

    /**
     * Gross margin as a percentage of the selling price.
     *
     * Null when cost is unknown — NOT zero, and not "100%". A product with no
     * recorded cost has no knowable margin, and saying so is the entire reason
     * the cost column is nullable.
     */
    private function marginPercent(Product $p): ?int
    {
        if ($p->cost_poisha === null || $p->price_poisha <= 0) {
            return null;
        }

        return (int) round((($p->price_poisha - $p->cost_poisha) / $p->price_poisha) * 100);
    }
}
