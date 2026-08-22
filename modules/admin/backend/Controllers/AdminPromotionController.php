<?php

declare(strict_types=1);

namespace Modules\Admin\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Modules\Cart\Models\Promotion;
use Modules\Cart\Models\PromotionTarget;
use Modules\Catalog\Models\Category;
use Modules\Catalog\Models\Product;

/**
 * Coupons and offers.
 *
 * THE CODE IS PERMANENT, EVERYTHING ELSE IS NOT
 * ---------------------------------------------
 * A code that has been printed, texted or posted cannot be renamed — customers
 * hold it, and changing it turns their coupon into "that code is not valid"
 * with no explanation. So `code` is set once and the panel does not offer it as
 * a field afterwards. To run a different code, make a new one and switch the
 * old one off.
 *
 * Everything else — value, dates, minimum spend, cap, which products it covers
 * — is a live campaign setting and changes freely.
 *
 * WHY DELETE IS RESTRICTED, NOT OFFERED FREELY
 * --------------------------------------------
 * `used_count` is the record that a campaign ran. Orders reference the code as
 * a string, so deleting a used promotion does not break them, but it does
 * destroy the only place the campaign's size is written down — and somebody
 * will ask what GULF10 cost six months from now. A used code can only be
 * switched off; an unused one can be deleted outright, since there is nothing
 * to remember.
 */
class AdminPromotionController extends Controller
{
    /** GET /api/admin/promotions */
    public function index(): JsonResponse
    {
        // Deleted codes come back in the same payload. A shop has a handful of
        // promo codes, not a paginated list, and the screen is a set of cards
        // you read down — the client draws the deleted ones in their own
        // section underneath rather than behind a tab nobody would open.
        $promotions = Promotion::query()
            ->withTrashed()
            ->with('targets')
            ->orderByDesc('is_active')
            ->orderByDesc('id')
            ->get();

        // Names for the targets, resolved in two queries rather than per row.
        $categoryNames = Category::whereIn('id', $promotions->flatMap(
            fn (Promotion $p) => $p->targets->pluck('category_id')->filter()
        )->unique())->pluck('name', 'id');

        $productNames = Product::withTrashed()->whereIn('id', $promotions->flatMap(
            fn (Promotion $p) => $p->targets->pluck('product_id')->filter()
        )->unique())->pluck('title', 'id');

        return response()->json([
            'data' => $promotions->map(fn (Promotion $p): array => [
                'code'        => $p->code,
                'label'       => $p->label,
                'type'        => $p->type,
                // Percent stays a percent; a flat amount is stored in poisha
                // and shown in taka. The panel never sees poisha.
                'value'       => $p->type === 'pct' ? $p->value : intdiv($p->value, 100),
                'scope'       => $p->scope,
                'minSpend'    => intdiv($p->min_subtotal_poisha, 100),
                'maxDiscount' => $p->max_discount_poisha === null ? null : intdiv($p->max_discount_poisha, 100),
                'startsAt'    => $p->starts_at?->toDateString(),
                'endsAt'      => $p->ends_at?->toDateString(),
                'usageLimit'  => $p->usage_limit,
                'usedCount'   => $p->used_count,
                'isActive'    => $p->is_active,
                'isPublic'    => $p->is_public,
                'deletedAt'   => $p->deleted_at?->toIso8601String(),
                // Why it is not currently redeemable, in the merchant's words.
                // "Active" with nothing happening on the shop is the single
                // most confusing state a coupon screen can show.
                'state'       => $this->state($p),
                'targets'     => $p->targets->map(fn (PromotionTarget $t): array => [
                    'kind' => $t->product_id ? 'product' : 'category',
                    'id'   => $t->product_id ?: $t->category_id,
                    'name' => $t->product_id
                        ? ($productNames[$t->product_id] ?? 'deleted product')
                        : ($categoryNames[$t->category_id] ?? 'deleted category'),
                ])->values()->all(),
            ])->all(),
        ]);
    }

    /** POST /api/admin/promotions */
    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request, creating: true);

        $code = strtoupper(trim($data['code']));

        // withTrashed, because `code` is unique and a soft-deleted row keeps
        // it. Without this the insert below dies on the constraint with a
        // database error, for what is really a simple situation: the code is
        // already there, deleted, and the merchant almost certainly wants it
        // back rather than a second one.
        $existing = Promotion::withTrashed()->where('code', $code)->first();

        if ($existing !== null) {
            return response()->json([
                'message' => $existing->trashed()
                    ? "The code {$code} was deleted. Restore it from Deleted below rather than "
                        . 'making a second one — restoring brings its scope back with it.'
                    : "The code {$code} already exists.",
            ], 422);
        }

        $promotion = DB::transaction(function () use ($data, $code): Promotion {
            $promotion = Promotion::create($this->columns($data) + [
                'code'      => $code,
                'is_active' => $data['isActive'] ?? true,
                'is_public' => $data['isPublic'] ?? false,
            ]);

            $this->syncTargets($promotion, $data);

            return $promotion;
        });

        return response()->json([
            'data'    => ['code' => $promotion->code],
            'message' => "{$promotion->code} created.",
        ], 201);
    }

    /** PATCH /api/admin/promotions/{promotion:code} */
    public function update(Request $request, Promotion $promotion): JsonResponse
    {
        $data = $this->validated($request, creating: false);

        DB::transaction(function () use ($promotion, $data): void {
            $promotion->fill($this->columns($data));

            if (array_key_exists('isActive', $data)) $promotion->is_active = $data['isActive'];
            if (array_key_exists('isPublic', $data)) $promotion->is_public = $data['isPublic'];

            $promotion->save();

            if (array_key_exists('scope', $data)) {
                $this->syncTargets($promotion, $data);
            }
        });

        return response()->json([
            'data'    => ['code' => $promotion->code, 'isActive' => $promotion->is_active],
            'message' => 'Saved.',
        ]);
    }

    /** DELETE /api/admin/promotions/{promotion:code} */
    public function destroy(Promotion $promotion): JsonResponse
    {
        if ($promotion->used_count > 0) {
            return response()->json([
                'message' => "{$promotion->code} has been used {$promotion->used_count} time(s), "
                    . 'so it is the only record of what that campaign cost. Switch it off instead.',
            ], 422);
        }

        // Soft, so the targets do NOT cascade away. A code scoped to eleven
        // products was eleven decisions; restoring has to bring them back, and
        // it can only do that if the rows are still attached to a promotion id
        // that still exists.
        //
        // Switched off on the way out, the same belt-and-braces the product
        // delete uses: otherwise restore hands back a LIVE discount, and
        // undoing a mistake would start taking money off orders the moment it
        // was undone. Switching it on again stays a deliberate act.
        DB::transaction(function () use ($promotion): void {
            $promotion->is_active = false;
            $promotion->save();
            $promotion->delete();
        });

        return response()->json([
            'message' => "{$promotion->code} deleted. It is under Deleted below, with its scope.",
        ]);
    }

    /** POST /api/admin/promotions/{promotion}/restore */
    public function restore(string $promotion): JsonResponse
    {
        $model = Promotion::withTrashed()->where('code', strtoupper(trim($promotion)))->firstOrFail();

        if (! $model->trashed()) {
            return response()->json(['message' => 'That code is not deleted.'], 422);
        }

        $model->restore();

        // Deliberately still switched off — destroy() turned it off on the way
        // out precisely so this cannot hand back a live discount.
        return response()->json([
            'message' => "{$model->code} is back, still switched off. Switch it on when you are ready.",
        ]);
    }

    /* ---- helpers ------------------------------------------------------ */

    /** @return array<string, mixed> */
    private function validated(Request $request, bool $creating): array
    {
        $required = $creating ? 'required' : 'sometimes';

        return $request->validate([
            'code' => $creating
                ? ['required', 'string', 'min:3', 'max:32', 'regex:/^[A-Za-z0-9_-]+$/']
                : ['prohibited'],

            'label' => ['sometimes', 'nullable', 'string', 'max:191'],
            'type'  => [$required, 'in:pct,flat'],

            // Percent is capped at 90. Not 100: a code that makes an order free
            // is almost always a typo, and the one time it is not, it can be
            // set in the database by someone who has thought about it.
            'value' => [$required, 'numeric', 'gt:0', 'max:1000000'],

            'scope'     => ['sometimes', 'in:all,categories,products'],
            'targets'   => ['sometimes', 'array', 'max:200'],
            'targets.*' => ['string', 'max:96'],

            'minSpend'    => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:10000000'],
            'maxDiscount' => ['sometimes', 'nullable', 'numeric', 'gt:0', 'max:10000000'],

            'startsAt' => ['sometimes', 'nullable', 'date'],
            'endsAt'   => ['sometimes', 'nullable', 'date', 'after:startsAt'],

            'usageLimit' => ['sometimes', 'nullable', 'integer', 'min:1', 'max:1000000'],

            'isActive' => ['sometimes', 'boolean'],
            'isPublic' => ['sometimes', 'boolean'],
        ], [
            'code.prohibited' => 'A coupon code cannot be changed once it exists — customers may '
                . 'already be holding it. Create a new code and switch this one off.',
            'endsAt.after' => 'The end date has to be after the start date.',
            'code.regex'   => 'Use letters, numbers, hyphens and underscores only.',
        ]);
    }

    /**
     * Panel fields to database columns. Money arrives in taka and is stored in
     * poisha; a percentage is stored as-is.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function columns(array $data): array
    {
        $columns = [];

        if (array_key_exists('label', $data)) $columns['label'] = $data['label'] ?: null;
        if (array_key_exists('type', $data))  $columns['type'] = $data['type'];
        if (array_key_exists('scope', $data)) $columns['scope'] = $data['scope'];

        if (array_key_exists('value', $data)) {
            $type = $data['type'] ?? 'pct';
            $columns['value'] = $type === 'pct'
                ? min(90, (int) round((float) $data['value']))
                : (int) round((float) $data['value'] * 100);
        }

        if (array_key_exists('minSpend', $data)) {
            $columns['min_subtotal_poisha'] = (int) round((float) ($data['minSpend'] ?? 0) * 100);
        }

        if (array_key_exists('maxDiscount', $data)) {
            $columns['max_discount_poisha'] = $data['maxDiscount'] === null || $data['maxDiscount'] === ''
                ? null
                : (int) round((float) $data['maxDiscount'] * 100);
        }

        foreach (['startsAt' => 'starts_at', 'endsAt' => 'ends_at'] as $input => $column) {
            if (array_key_exists($input, $data)) {
                $columns[$column] = $data[$input] ?: null;
            }
        }

        if (array_key_exists('usageLimit', $data)) {
            $columns['usage_limit'] = $data['usageLimit'] ?: null;
        }

        return $columns;
    }

    /**
     * Replace the target set wholesale.
     *
     * `targets` arrives as slugs (categories) or SKUs (products) — the panel
     * never handles database ids, so a re-seed that renumbers rows cannot
     * silently repoint a live campaign at different products.
     *
     * @param array<string, mixed> $data
     */
    private function syncTargets(Promotion $promotion, array $data): void
    {
        $promotion->targets()->delete();

        $scope = $data['scope'] ?? 'all';

        if ($scope === 'all') {
            return;
        }

        $keys = array_values(array_unique((array) ($data['targets'] ?? [])));

        if ($keys === []) {
            return;      // scope set, nothing chosen yet — applies to nothing
        }

        $rows = $scope === 'products'
            ? Product::withTrashed()->whereIn('sku', $keys)->pluck('id')
                ->map(fn (int $id): array => ['product_id' => $id, 'category_id' => null])
            : Category::whereIn('slug', $keys)->pluck('id')
                ->map(fn (int $id): array => ['category_id' => $id, 'product_id' => null]);

        $now = now();

        $promotion->targets()->insert($rows->map(fn (array $r): array => $r + [
            'promotion_id' => $promotion->id,
            'created_at'   => $now,
            'updated_at'   => $now,
        ])->all());
    }

    /**
     * Why a coupon is or is not working right now, as a short phrase.
     *
     * "Active" is not enough on its own: a coupon can be switched on, saved,
     * and still do nothing because it starts next week, expired last month, hit
     * its usage limit, or is scoped to a set nobody filled in. Every one of
     * those looks identical on a list that only shows a toggle.
     */
    private function state(Promotion $promotion): string
    {
        if (! $promotion->is_active) {
            return 'off';
        }

        $now = now();

        if ($promotion->starts_at && $promotion->starts_at->gt($now)) {
            return 'scheduled';
        }

        if ($promotion->ends_at && $promotion->ends_at->lt($now)) {
            return 'expired';
        }

        if ($promotion->usage_limit !== null && $promotion->used_count >= $promotion->usage_limit) {
            return 'used up';
        }

        if ($promotion->scope !== 'all' && $promotion->targets->isEmpty()) {
            return 'no items chosen';
        }

        return 'live';
    }
}
