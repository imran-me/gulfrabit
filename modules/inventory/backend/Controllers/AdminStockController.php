<?php

declare(strict_types=1);

namespace Modules\Inventory\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Modules\Catalog\Models\Product;
use Modules\Inventory\Models\StockLevel;
use Modules\Inventory\Models\StockMovement;
use Modules\Inventory\Models\Warehouse;
use Modules\Inventory\Requests\StockMovementRequest;
use Modules\Inventory\Services\StockService;
use RuntimeException;

/**
 * Stock screens.
 *
 * Note what is NOT here: no endpoint sets a quantity directly. Everything is a
 * movement with a reason, or a recount that records the difference. An
 * "set stock to 40" button is how a ledger stops being able to explain itself.
 */
class AdminStockController extends Controller
{
    public function __construct(
        private readonly StockService $stock,
    ) {
    }

    /** GET /api/admin/stock */
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'q'         => ['sometimes', 'string', 'max:64'],
            'warehouse' => ['sometimes', 'string', 'exists:warehouses,key'],
            'lowOnly'   => ['sometimes', 'boolean'],
            'perPage'   => ['sometimes', 'integer', 'min:10', 'max:100'],
        ]);

        $query = StockLevel::query()
            ->with('warehouse')
            ->join('products', 'products.id', '=', 'stock_levels.product_id')
            ->select('stock_levels.*', 'products.sku', 'products.title')
            ->orderBy('products.title');

        if (! empty($data['q'])) {
            $term = trim($data['q']);
            $query->where(function ($w) use ($term): void {
                $w->where('products.title', 'like', "%{$term}%")
                    ->orWhere('products.sku', 'like', "%{$term}%");
            });
        }

        if (! empty($data['warehouse'])) {
            $query->whereHas('warehouse', fn ($w) => $w->where('key', $data['warehouse']));
        }

        if ($request->boolean('lowOnly')) {
            $query->low();
        }

        $page = $query->paginate($data['perPage'] ?? 25);

        return response()->json([
            'data' => array_map(fn (StockLevel $l): array => $l->toAdminArray() + [
                'sku'   => $l->sku,
                'title' => $l->title,
            ], $page->items()),
            'meta' => [
                'total'       => $page->total(),
                'perPage'     => $page->perPage(),
                'currentPage' => $page->currentPage(),
                'lastPage'    => $page->lastPage(),
            ],
        ]);
    }

    /** GET /api/admin/warehouses */
    public function warehouses(): JsonResponse
    {
        return response()->json([
            'data' => Warehouse::query()->where('is_active', true)->get()->map->toAdminArray()->all(),
        ]);
    }

    /** GET /api/admin/stock/{sku}/movements */
    public function movements(string $sku): JsonResponse
    {
        $product = Product::query()->where('sku', $sku)->firstOrFail();

        $movements = StockMovement::query()
            ->where('product_id', $product->id)
            ->latest()
            ->limit(100)
            ->get();

        return response()->json([
            'data' => [
                'sku'   => $product->sku,
                'title' => $product->title,
                'movements' => $movements->map->toAdminArray()->all(),
                // Reported alongside so the screen can say "cost unknown"
                // rather than leaving a blank that looks like zero.
                'averageCostTaka' => ($avg = $this->stock->averageCostPoisha($product->id)) === null
                    ? null
                    : round($avg / 100, 2),
            ],
        ]);
    }

    /** POST /api/admin/stock/movements */
    public function store(StockMovementRequest $request): JsonResponse
    {
        $admin = $request->user('admin');
        $product = Product::query()->where('sku', $request->string('sku'))->firstOrFail();
        $warehouse = Warehouse::query()->where('key', $request->string('warehouse'))->firstOrFail();

        try {
            $movement = $this->stock->move(
                productId:      $product->id,
                warehouseId:    $warehouse->id,
                qtyDelta:       (int) $request->integer('qty'),
                reason:         $request->string('reason')->toString(),
                unitCostPoisha: $request->filled('unitCostTaka')
                    ? (int) round($request->float('unitCostTaka') * 100)
                    : null,
                note:           $request->input('note'),
                actorId:        $admin->id,
                actorName:      $admin->name,
            );
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['data' => $movement->toAdminArray()], 201);
    }

    /** POST /api/admin/stock/recount */
    public function recount(Request $request): JsonResponse
    {
        $data = $request->validate([
            'sku'       => ['required', 'string', 'exists:products,sku'],
            'warehouse' => ['required', 'string', 'exists:warehouses,key'],
            'counted'   => ['required', 'integer', 'min:0'],
            'note'      => ['sometimes', 'nullable', 'string', 'max:255'],
        ]);

        $admin = $request->user('admin');
        $product = Product::query()->where('sku', $data['sku'])->firstOrFail();
        $warehouse = Warehouse::query()->where('key', $data['warehouse'])->firstOrFail();

        $movement = $this->stock->recount(
            productId:   $product->id,
            warehouseId: $warehouse->id,
            countedQty:  $data['counted'],
            note:        $data['note'] ?? null,
            actorId:     $admin->id,
            actorName:   $admin->name,
        );

        return response()->json([
            // Null when the count agreed. Said explicitly, because "nothing
            // happened" and "it failed" must not look the same.
            'data'    => $movement?->toAdminArray(),
            'message' => $movement === null
                ? 'Count matched the system. No correction recorded.'
                : 'Correction recorded.',
        ]);
    }
}
