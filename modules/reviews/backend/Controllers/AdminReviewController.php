<?php

declare(strict_types=1);

namespace Modules\Reviews\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Modules\Reviews\Models\ProductReview;
use Modules\Reviews\Services\ReviewService;
use RuntimeException;

/**
 * The moderation queue.
 *
 * Every review arrives pending and waits here. That is the merchant's
 * decision, taken deliberately: it is slower than publishing on arrival, and
 * it means nothing reaches the shop that nobody has read.
 */
class AdminReviewController extends Controller
{
    public function __construct(private readonly ReviewService $reviews)
    {
    }

    /**
     * GET /api/admin/reviews?status=pending
     *
     * Pending by default, because that is the only list that is WORK. The
     * other two are archives, reachable by asking for them.
     */
    public function index(Request $request): JsonResponse
    {
        $status = (string) $request->query('status', ProductReview::PENDING);

        $query = ProductReview::query()->with(['product', 'order']);

        if (in_array($status, [ProductReview::PENDING, ProductReview::PUBLISHED, ProductReview::REJECTED], true)) {
            $query->where('status', $status);
        }

        // Oldest first in the queue, newest first everywhere else. A queue is
        // worked from the front — the review that has been waiting longest is
        // the customer who has been waiting longest.
        $page = $status === ProductReview::PENDING
            ? $query->oldest('created_at')->paginate(25)
            : $query->latest('created_at')->paginate(25);

        return response()->json([
            'data' => collect($page->items())
                ->map(fn (ProductReview $r): array => $r->toPanelArray())
                ->all(),
            'meta' => [
                'page'        => $page->currentPage(),
                'pages'       => $page->lastPage(),
                'total'       => $page->total(),
                // The badge on the sidebar, and the reason to open the screen.
                'pendingCount' => ProductReview::query()->where('status', ProductReview::PENDING)->count(),
            ],
        ]);
    }

    /**
     * PATCH /api/admin/reviews/{review}
     *
     * One route for all three moves rather than publish/reject/unpublish
     * endpoints. They are the same operation — set a status, recompute the
     * product's rating — and three routes would be three places to forget the
     * recompute.
     */
    public function update(Request $request, ProductReview $review): JsonResponse
    {
        $data = $request->validate([
            'status' => ['required', 'string'],
        ]);

        try {
            $review = $this->reviews->moderate($review, $data['status'], $request->user('admin')?->id);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json([
            'data'    => $review->toPanelArray(),
            'message' => match ($review->status) {
                ProductReview::PUBLISHED => 'Published. It is on the product page and counted in the rating.',
                ProductReview::REJECTED  => 'Rejected. It stays here and never reaches the shop.',
                default                  => 'Back in the queue.',
            },
        ]);
    }

    /**
     * DELETE /api/admin/reviews/{review}
     *
     * For spam, not for disagreement — rejecting is what disagreement is for,
     * and a rejected review can be reconsidered. This one is gone, which is
     * why the route sits behind admin.owner with the rest of the deletes.
     */
    public function destroy(ProductReview $review): JsonResponse
    {
        $this->reviews->forget($review);

        return response()->json(['message' => 'Review deleted.']);
    }
}
