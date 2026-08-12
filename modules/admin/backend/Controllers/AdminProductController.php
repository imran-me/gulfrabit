<?php

declare(strict_types=1);

namespace Modules\Admin\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Modules\Admin\Requests\ProductStoreRequest;
use Modules\Admin\Requests\ProductUpdateRequest;
use Modules\Catalog\Models\Category;
use Modules\Catalog\Models\Product;

/**
 * Editing the catalogue.
 *
 * WHAT THIS SCREEN WILL AND WILL NOT CHANGE
 * -----------------------------------------
 * It edits the fields a merchant changes week to week: price, cost, stock,
 * description, photos, which category a product sits in, whether it is listed.
 *
 * It will not change the **SKU** or the **barcode** after creation. Those are
 * identity. The SKU is in every order line ever placed, and the barcode is a
 * claim the Sourcing page invites customers to verify against the physical
 * pack — a screen that lets a busy person retype either is a screen that
 * eventually breaks something nobody will connect back to this edit.
 *
 * DELETING IS UNLISTING. `products` is soft-deleting, and every `order_items`
 * row points at a product id. A hard delete would take the product name and
 * price out of orders already placed, which is both a broken order history and
 * a bookkeeping problem. So delete() soft-deletes and restore() undoes it.
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
            'sort'      => ['sometimes', 'in:title,newest,price-desc'],
        ]);

        $query = Product::query()->with('category:id,slug,name');

        // Title A→Z stays the default: this screen is mostly "find the product
        // I already know the name of". Newest-first exists for the other
        // errand — getting back to the product you created a minute ago, which
        // alphabetical order files somewhere in the middle of the catalogue.
        $query = match ($data['sort'] ?? 'title') {
            'newest'     => $query->orderByDesc('created_at')->orderByDesc('id'),
            // The id tiebreak is load-bearing on every branch that sorts a
            // non-unique column: OFFSET pagination over an unspecified order
            // among ties can show one product on two pages and another on
            // neither. Prices cluster on round figures, so ties are the norm.
            'price-desc' => $query->orderByDesc('price_poisha')->orderByDesc('id'),
            default      => $query->orderBy('title')->orderBy('id'),
        };

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
                // For the placement chips — which home-page rails this product
                // is a candidate for. The list never edits them, so names only.
                'tags'       => $p->tags ?? [],
                // The Highlights picker builds its optimistic shelf rows from
                // this payload and needs the thumbnail.
                'image'      => $p->image,
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
                'performance'  => $this->performance($product),
            ],
        ]);
    }

    /**
     * How this product has actually sold — totals, and the same figures split
     * by pack size.
     *
     * WHY IT READS ORDER LINES AND NOT THE PRODUCT
     * --------------------------------------------
     * Order lines are snapshots: they keep the title, the pack label and the
     * price that were charged, and they survive the product being renamed,
     * repriced or delisted. That is exactly what a sales history needs. The
     * join is on `sku`, not `product_id`, for the same reason — product_id is
     * nullable-on-delete, and a removed product's past sales must still count.
     *
     * THE BUCKETS, AND WHY THESE ONES
     * -------------------------------
     *   delivered — units that reached a customer and were paid for. This is
     *               the only bucket whose revenue is real money.
     *   open      — placed through shipped: demand that exists but could still
     *               evaporate. Kept apart from delivered because counting the
     *               two together is how a shop talks itself into a reorder it
     *               cannot afford.
     *   cancelled — including spam, which is a cancellation with a reason.
     *   returned  — the expensive bucket in a COD market: the courier was
     *               paid twice and the goods came back. Shown on its own so a
     *               product with a quiet return problem cannot hide inside a
     *               healthy-looking sold figure.
     *
     * One query, grouped in SQL and folded in PHP: a product with a thousand
     * order lines must not become a thousand rows on the wire.
     *
     * @return array<string, mixed>
     */
    private function performance(Product $product): array
    {
        $rows = DB::table('order_items')
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->where('order_items.sku', $product->sku)
            ->groupBy('order_items.variant', 'orders.status')
            ->selectRaw('order_items.variant as variant, orders.status as status,'
                . ' SUM(order_items.qty) as units,'
                . ' SUM(order_items.line_total_poisha) as revenue')
            ->get();

        $blank = ['delivered' => 0, 'open' => 0, 'cancelled' => 0, 'returned' => 0];
        $totals = $blank + ['revenue' => 0];
        $perVariant = [];

        foreach ($rows as $row) {
            $bucket = match ($row->status) {
                'delivered'             => 'delivered',
                'returned'              => 'returned',
                'cancelled', 'spam'     => 'cancelled',
                default                 => 'open',
            };

            $units = (int) $row->units;
            // A null variant is a one-size product; it groups under '' so the
            // panel has one row to draw rather than a special case.
            $key = (string) ($row->variant ?? '');
            $perVariant[$key] ??= $blank;
            $perVariant[$key][$bucket] += $units;

            $totals[$bucket] += $units;

            if ($bucket === 'delivered') {
                $totals['revenue'] += (int) $row->revenue;
            }
        }

        // Counted on its own, NOT by summing the grouped counts: an order that
        // contains two pack sizes of this product appears in two groups, and
        // adding those together would report it as two orders.
        $orderCount = DB::table('order_items')
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->where('order_items.sku', $product->sku)
            ->distinct()
            ->count('orders.id');

        $lastOrdered = DB::table('order_items')
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->where('order_items.sku', $product->sku)
            ->max('orders.created_at');

        return [
            'unitsDelivered' => $totals['delivered'],
            'unitsOpen'      => $totals['open'],
            'unitsCancelled' => $totals['cancelled'],
            'unitsReturned'  => $totals['returned'],
            'orders'         => $orderCount,
            'revenueTaka'    => intdiv($totals['revenue'], 100),
            'lastOrderedAt'  => $lastOrdered,
            // Keyed by pack label so the panel can line these up against the
            // variants it is already drawing.
            'byVariant'      => $perVariant,
        ];
    }

    /**
     * POST /api/admin/products
     *
     * Asks for the four things a product cannot exist without — name, category,
     * price, and a photo — and defaults everything else. A create form that
     * demanded every column would be abandoned halfway; the edit screen is
     * where the rest gets filled in, and it opens immediately afterwards.
     *
     * The product is created **unlisted**. Adding something to the catalogue
     * and having it appear on the live shop mid-typo is the wrong default; the
     * merchant switches it on when it is ready.
     */
    public function store(ProductStoreRequest $request): JsonResponse
    {
        $category = Category::where('slug', $request->input('category'))->firstOrFail();

        $sub = null;

        if ($slug = $request->input('subCategory')) {
            $sub = Category::where('slug', $slug)->first();

            if (! $sub || $sub->parent_id !== $category->id) {
                return response()->json([
                    'message' => 'That sub-category is not inside the category you picked.',
                ], 422);
            }
        }

        $images = array_values(array_filter((array) $request->input('images', [])));

        $product = Product::create([
            'sku'                   => $this->nextSku(),
            'title'                 => $request->input('title'),
            'brand'                 => $request->input('brand'),
            'origin'                => $request->input('origin'),
            'barcode'               => $request->input('barcode'),
            'category_id'           => $category->id,
            'sub_category_id'       => $sub?->id,
            'price_poisha'          => $this->poisha($request->input('priceTaka')),
            'original_price_poisha' => $this->poisha($request->input('originalPriceTaka')),
            'cost_poisha'           => $this->poisha($request->input('costTaka')),
            'image'                 => $images[0] ?? null,
            'images'                => $images,
            'unit'                  => $request->input('unit'),
            'variants'              => $this->variantsToPoisha($request->input('variants')),
            'default_variant'       => $request->input('defaultVariant'),
            'tags'                  => $request->input('tags', []),
            'dietary'               => $request->input('dietary', []),
            'search_terms'          => $request->input('searchTerms', []),
            'short_description'     => $request->input('shortDescription'),
            'description'           => $request->input('description'),
            'in_stock'              => true,
            // Off. See the docblock: a new product must not appear on the shop
            // before anyone has looked at it.
            'is_active'             => false,
        ]);

        return response()->json([
            'data'    => $product->toAdminArray(),
            'message' => "Created as {$product->sku}. It is not on the site yet — "
                . 'switch Listed on when you are ready.',
        ], 201);
    }

    /**
     * DELETE /api/admin/products/{sku} — unlist, never erase.
     *
     * Soft delete: the row stays, so every order that ever contained this
     * product still knows what it was. It leaves the shop, the search index and
     * the admin list, and restore() brings it back with its price history and
     * its stock ledger intact.
     */
    public function destroy(string $sku): JsonResponse
    {
        $product = Product::query()->where('sku', $sku)->firstOrFail();

        DB::transaction(function () use ($product): void {
            // Belt and braces. A restore() would otherwise bring the product
            // back live on the shop the moment it returns, which is not what
            // anyone means by "undo the delete".
            $product->is_active = false;
            $product->save();
            $product->delete();
        });

        return response()->json([
            'message' => "{$product->title} removed from the shop. Past orders still show it, "
                . 'and it can be restored.',
        ]);
    }

    /** POST /api/admin/products/{sku}/restore */
    public function restore(string $sku): JsonResponse
    {
        $product = Product::withTrashed()->where('sku', $sku)->firstOrFail();

        $product->restore();

        return response()->json([
            'data'    => $product->toAdminArray(),
            'message' => "{$product->title} is back in the catalogue, still unlisted.",
        ]);
    }

    /**
     * The next `gr-NNNN`.
     *
     * Derived from the highest existing number rather than a row count, which
     * would reuse a SKU after a delete — and a reused SKU means two different
     * products sharing an identifier across order history. Trashed rows are
     * included for exactly that reason.
     */
    private function nextSku(): string
    {
        $highest = Product::withTrashed()
            ->where('sku', 'like', 'gr-%')
            ->get(['sku'])
            ->map(fn (Product $p): int => (int) substr($p->sku, 3))
            ->max();

        return 'gr-' . max(1001, (int) $highest + 1);
    }

    /** Taka to integer poisha. Null stays null — it means "not known". */
    private function poisha(mixed $taka): ?int
    {
        return $taka === null || $taka === '' ? null : (int) round((float) $taka * 100);
    }

    /**
     * Variant rows arrive with prices in taka and are stored in poisha, like
     * every other money value in the schema — never as a float, which is how a
     * 1,450.00 becomes a 1,449.99 three joins later. Same stored shape as
     * CatalogSeeder::variantsToPoisha writes; the model's variantsTaka() is
     * the only reader of both.
     *
     * Returns null rather than [] for an empty list, so "this product has no
     * pack sizes" reads the same in the column as it does for a product that
     * never had any.
     *
     * @param  array<int, array<string, mixed>>|null $rows
     * @return array<int, array<string, mixed>>|null
     */
    private function variantsToPoisha(?array $rows): ?array
    {
        if (empty($rows)) {
            return null;
        }

        return array_values(array_map(fn (array $r): array => [
            'label'                 => (string) $r['label'],
            'amount'                => isset($r['amount']) && $r['amount'] !== '' ? (float) $r['amount'] : null,
            'price_poisha'          => $this->poisha($r['priceTaka'] ?? 0),
            'original_price_poisha' => isset($r['originalPriceTaka']) && (float) $r['originalPriceTaka'] > (float) ($r['priceTaka'] ?? 0)
                ? $this->poisha($r['originalPriceTaka'])
                : null,
            'in_stock'              => (bool) ($r['inStock'] ?? true),
            // What we hold of this pack. Staff-only — Product::variantsTaka()
            // strips it on the way to the storefront. Null is "not counted",
            // which is a different fact from "none left".
            'stock_qty'             => isset($r['stockQty']) && $r['stockQty'] !== '' && $r['stockQty'] !== null
                ? (int) $r['stockQty']
                : null,
            // The public per-pack "Only N left". Null means this pack makes no
            // claim and the product-level figure stands.
            'stock_display'         => isset($r['stockDisplay']) && $r['stockDisplay'] !== '' && $r['stockDisplay'] !== null
                ? (int) $r['stockDisplay']
                : null,
        ], $rows));
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

        // The strike-price invariant, checked against what the product will
        // actually hold. The request rule can only compare fields that arrive
        // together; a diff-only PATCH may carry either price alone, so the
        // real comparison has to happen here, after both columns are settled.
        if ($product->original_price_poisha !== null
            && $product->original_price_poisha < $product->price_poisha) {
            return response()->json([
                'message' => 'The “was” price cannot be lower than the selling price.',
            ], 422);
        }

        foreach (['title', 'brand', 'short_description', 'description', 'unit'] as $field) {
            $input = lcfirst(str_replace('_', '', ucwords($field, '_')));
            if ($request->has($input)) {
                $product->{$field} = $request->input($input);
            }
        }

        // The JSON list columns. `has` rather than a truthiness check on
        // purpose: an empty array is a legitimate edit — it is how the last tag
        // is removed — and `if ($tags)` would silently refuse to clear them.
        foreach (['tags' => 'tags', 'dietary' => 'dietary', 'searchTerms' => 'search_terms'] as $input => $column) {
            if ($request->has($input)) {
                $product->{$column} = array_values($request->input($input, []));
            }
        }

        if ($request->has('variants')) {
            $product->variants = $this->variantsToPoisha($request->input('variants'));
        }
        if ($request->has('defaultVariant')) {
            $product->default_variant = $request->input('defaultVariant');
        }

        if ($request->has('inStock')) {
            $product->in_stock = $request->boolean('inStock');
        }
        if ($request->has('isActive')) {
            $product->is_active = $request->boolean('isActive');
        }

        // The public "Only N left" figure. An explicit null clears it, which
        // means "show no such line" — deliberately not the same as 0, which
        // tells customers the shelf is empty. Laravel turns the form's empty
        // string into null before this runs, which is exactly the intent.
        if ($request->has('stockDisplay')) {
            $value = $request->input('stockDisplay');
            $product->stock_display = $value === null || $value === '' ? null : (int) $value;
        }

        // Moving a product between categories. Needed the day the catalogue
        // grew "Dry Fruits" and "Nuts & Makhana" alongside the older
        // "Nuts & Dry Fruits" — without this, sorting that out means editing
        // JSON and re-seeding.
        if ($request->has('category')) {
            $category = Category::where('slug', $request->input('category'))->first();

            if (! $category) {
                return response()->json(['message' => 'That category no longer exists.'], 422);
            }

            $product->category_id = $category->id;

            // A sub-category from the previous parent would now be pointing
            // somewhere unrelated, so it is cleared unless this same request
            // sets a new one.
            if (! $request->has('subCategory')) {
                $product->sub_category_id = null;
            }
        }

        if ($request->has('subCategory')) {
            $slug = $request->input('subCategory');

            if (! $slug) {
                $product->sub_category_id = null;
            } else {
                $sub = Category::where('slug', $slug)->first();

                if (! $sub || $sub->parent_id !== $product->category_id) {
                    return response()->json([
                        'message' => 'That sub-category is not inside this product\'s category.',
                    ], 422);
                }

                $product->sub_category_id = $sub->id;
            }
        }

        // The gallery arrives as a complete, ordered list — add, remove and
        // reorder are all the same request. Sending a diff would need the
        // client and server to agree on identity for images that have none
        // beyond their URL, and the list is never more than a handful long.
        if ($request->has('images')) {
            $images = array_values(array_filter((array) $request->input('images')));

            $product->images = $images;
            // `image` is the single thumbnail every listing and cart line
            // reads. Keeping it as element zero means "first photo is the
            // main photo" — which is what dragging one to the front means to
            // the person doing it.
            $product->image = $images[0] ?? null;
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
