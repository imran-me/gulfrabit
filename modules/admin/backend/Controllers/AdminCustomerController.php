<?php

declare(strict_types=1);

namespace Modules\Admin\Controllers;

use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Modules\Admin\Models\CustomerNote;
use Modules\Admin\Services\CustomerAnonymiserService;
use RuntimeException;

/**
 * Customer records.
 *
 * This is the most sensitive screen in the panel: it is a searchable index of
 * every person who has ever bought something, with their phone number. Two
 * consequences run through the whole class.
 *
 * 1. Only `owner` and `manager` have the `customers` capability. Warehouse
 *    sees a delivery address on a packing slip and nothing else; accounts sees
 *    money without names.
 * 2. Nothing here ever returns a password hash, a remember token or an OTP.
 *    The User model hides the first two; this class never touches the third.
 */
class AdminCustomerController extends Controller
{
    public function __construct(
        private readonly CustomerAnonymiserService $anonymiser,
    ) {
    }

    /** GET /api/admin/customers */
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'q'       => ['sometimes', 'string', 'max:64'],
            'perPage' => ['sometimes', 'integer', 'min:10', 'max:100'],
            'deleted' => ['sometimes', 'boolean'],
        ]);

        $page = $this->filtered($data)->latest('created_at')->paginate($data['perPage'] ?? 25);
        $stats = $this->orderStatsFor(collect($page->items())->pluck('id')->all());

        return response()->json([
            'data' => array_map(function (User $u) use ($stats): array {
                $s = $stats[$u->id] ?? ['orders' => 0, 'spentPoisha' => 0, 'lastAt' => null];

                return [
                    'id'         => $u->id,
                    'name'       => $u->name,
                    'phone'      => $u->phone,
                    'email'      => $u->email,
                    'tier'       => $u->tier,
                    'verified'   => $u->phone_verified_at !== null,
                    'orders'     => $s['orders'],
                    // Paid orders only. Counting placed ones would credit a
                    // customer with money they never actually handed over.
                    'spentTaka'  => intdiv($s['spentPoisha'], 100),
                    'lastOrderAt' => $s['lastAt'],
                    'joinedAt'   => $u->created_at?->toIso8601String(),
                    'deletedAt'  => $u->deleted_at?->toIso8601String(),
                ];
            }, $page->items()),
            'meta' => [
                'total'       => $page->total(),
                'perPage'     => $page->perPage(),
                'currentPage' => $page->currentPage(),
                'lastPage'    => $page->lastPage(),
                // Both sides counted under the same search, and both computed
                // regardless of which tab is open — each badge has to predict
                // what clicking it would show, from wherever you are standing.
                // `total` above is the page's own total and flips with the tab,
                // so it cannot do that job.
                'liveCount'    => $this->filtered(['deleted' => false] + $data)->count(),
                'deletedCount' => $this->filtered(['deleted' => true] + $data)->count(),
            ],
        ]);
    }

    /**
     * DELETE /api/admin/customers/{user}
     *
     * NOT the same act as `forget`, and the difference is the whole point.
     *
     *   forget  — anonymise in place. Irreversible, logged as an erasure,
     *             demands a typed reason. For the day somebody asks to be
     *             erased.
     *   delete  — take them off the list. Reversible, keeps everything. For a
     *             test account, a duplicate, or a number that was nobody.
     *
     * Using the first to do the second is how an erasure log fills with
     * entries that mean nothing, and how the one real erasure request becomes
     * impossible to find among them.
     *
     * Their orders are deliberately untouched. An order is a historical record
     * with its own delivery snapshot on it — deleting the customer does not
     * unsell what they bought, and the money stays on the books.
     */
    public function destroy(User $user): JsonResponse
    {
        if ($user->trashed()) {
            return response()->json(['message' => 'That customer is already deleted.'], 422);
        }

        $user->delete();

        return response()->json([
            'message' => "{$user->name} removed from the customer list. "
                . 'Their orders are unchanged, and they can be put back.',
        ]);
    }

    /**
     * POST /api/admin/customers/{user}/restore
     *
     * Note that this is not the only way a deleted customer comes back: one
     * who signs in with an OTP and proves they control their phone number is
     * restored by that act, because deleting is a tidying of the list and not
     * a ban. See AuthService::loginWithVerifiedPhone in modules/auth.
     */
    public function restore(string $user): JsonResponse
    {
        // Typed as a string and cast here, not hinted `int`. A route parameter
        // arrives as a string, and it only survives an `int` hint because the
        // container that calls this is not in strict mode — a rule about
        // another file, which this one declares strict_types precisely to stop
        // depending on.
        $model = User::withTrashed()->findOrFail((int) $user);

        if (! $model->trashed()) {
            return response()->json(['message' => 'That customer is not deleted.'], 422);
        }

        $model->restore();

        return response()->json(['message' => "{$model->name} is back on the customer list."]);
    }

    /**
     * The customer list under the current search, on one side of the drawer.
     *
     * Shared by the page of rows and by the Deleted tab's count, so the two
     * can never answer different questions — a "Deleted 12" badge that ignores
     * the search box while the rows beside it obey it is a badge that gets
     * mistrusted and then ignored.
     *
     * @param  array<string, mixed>  $data
     */
    private function filtered(array $data): Builder
    {
        $query = User::query();

        // Every other caller in the project — checkout, the account pages, the
        // storefront — sees only live customers, because the global scope is
        // doing its job. This is the one screen allowed to look in the drawer,
        // and only when it asks.
        if (! empty($data['deleted'])) {
            $query->onlyTrashed();
        }

        if (! empty($data['q'])) {
            $term = trim($data['q']);
            // Name, phone, email. Not a wildcard across every column — a broad
            // LIKE over an address book turns a support tool into a way to
            // trawl for people who live in a particular area.
            $query->where(function ($w) use ($term): void {
                $w->where('name', 'like', "%{$term}%")
                    ->orWhere('phone', 'like', "%{$term}%")
                    ->orWhere('email', 'like', "%{$term}%");
            });
        }

        return $query;
    }

    /** GET /api/admin/customers/{user} */
    public function show(User $user): JsonResponse
    {
        $orders = Schema::hasTable('orders')
            ? DB::table('orders')->where('user_id', $user->id)->latest('placed_at')->limit(50)->get()
            : collect();

        $stats = $this->orderStatsFor([$user->id])[$user->id]
            ?? ['orders' => 0, 'spentPoisha' => 0, 'lastAt' => null];

        return response()->json([
            'data' => [
                'id'       => $user->id,
                'name'     => $user->name,
                'phone'    => $user->phone,
                'email'    => $user->email,
                'tier'     => $user->tier,
                'verified' => $user->phone_verified_at !== null,
                'joinedAt' => $user->created_at?->toIso8601String(),
                // The route binds withTrashed, so this screen opens for a
                // deleted customer and has to be able to say so.
                'deletedAt' => $user->deleted_at?->toIso8601String(),

                'stats' => [
                    'orders'      => $stats['orders'],
                    'spentTaka'   => intdiv($stats['spentPoisha'], 100),
                    'lastOrderAt' => $stats['lastAt'],
                    // Average of PAID orders, so a string of abandoned
                    // cash-on-delivery attempts does not flatter the figure.
                    'avgOrderTaka' => $stats['orders'] > 0
                        ? intdiv(intdiv($stats['spentPoisha'], $stats['orders']), 100)
                        : 0,
                ],

                'orders' => $orders->map(fn ($o): array => [
                    'orderNumber' => $o->order_number,
                    'status'      => $o->status,
                    'paymentStatus' => $o->payment_status,
                    'totalTaka'   => intdiv((int) $o->total_poisha, 100),
                    'placedAt'    => $o->placed_at,
                ])->all(),

                'addresses' => Schema::hasTable('addresses')
                    ? DB::table('addresses')->where('user_id', $user->id)->get()->map(fn ($a): array => [
                        'label'    => $a->label ?? null,
                        'line'     => $a->address_line ?? null,
                        'district' => $a->district_name ?? null,
                        'isDefault' => (bool) ($a->is_default ?? false),
                    ])->all()
                    : [],

                'notes' => CustomerNote::query()
                    ->where('user_id', $user->id)
                    ->latest()
                    ->get()
                    ->map->toAdminArray()
                    ->all(),
            ],
        ]);
    }

    /** POST /api/admin/customers/{user}/notes */
    public function addNote(Request $request, User $user): JsonResponse
    {
        $data = $request->validate([
            'body' => ['required', 'string', 'min:2', 'max:2000'],
        ]);

        $admin = $request->user('admin');

        $note = CustomerNote::create([
            'user_id'        => $user->id,
            'body'           => $data['body'],
            'author_admin_id' => $admin->id,
            'author_name'    => $admin->name,
        ]);

        return response()->json(['data' => $note->toAdminArray()], 201);
    }

    /**
     * POST /api/admin/customers/{user}/forget
     *
     * Owner only. This is irreversible and it edits historical order records,
     * which is not something a manager should be able to do while clearing a
     * support queue.
     */
    public function forget(Request $request, User $user): JsonResponse
    {
        $admin = $request->user('admin');

        if ($admin->role !== 'owner') {
            return response()->json([
                'message' => 'Only an owner can erase a customer.',
            ], 403);
        }

        $data = $request->validate([
            'reason' => ['required', 'string', 'min:3', 'max:500'],
        ]);

        try {
            $this->anonymiser->anonymise($user, $data['reason'], $admin->id, $admin->name);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['message' => 'Customer details removed. Their order figures are unchanged.']);
    }

    /**
     * Order counts and paid totals, in one query for the whole page.
     *
     * @param array<int, int> $userIds
     * @return array<int, array{orders:int, spentPoisha:int, lastAt:?string}>
     */
    private function orderStatsFor(array $userIds): array
    {
        if ($userIds === [] || ! Schema::hasTable('orders')) {
            return [];
        }

        return DB::table('orders')
            ->selectRaw('user_id, COUNT(*) as orders, SUM(total_poisha) as spent, MAX(placed_at) as last_at')
            ->whereIn('user_id', $userIds)
            ->where('payment_status', 'paid')
            ->groupBy('user_id')
            ->get()
            ->keyBy('user_id')
            ->map(fn ($r): array => [
                'orders'      => (int) $r->orders,
                'spentPoisha' => (int) $r->spent,
                'lastAt'      => $r->last_at,
            ])
            ->all();
    }
}
