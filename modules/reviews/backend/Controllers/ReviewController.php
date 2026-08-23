<?php

declare(strict_types=1);

namespace Modules\Reviews\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Modules\Catalog\Models\Product;
use Modules\Reviews\Models\ProductReview;
use Modules\Reviews\Services\ReviewService;
use RuntimeException;

/**
 * Reviews, from the shopper's side.
 *
 * Reading is public. Writing needs a signed-in customer who has taken
 * delivery of the thing — the rule lives in ReviewService, and this file only
 * decides what the HTTP answer looks like.
 */
class ReviewController extends Controller
{
    public function __construct(private readonly ReviewService $reviews)
    {
    }

    /**
     * GET /api/catalog/products/{slug}/reviews
     *
     * Published only, newest first, and the distribution alongside — the bar
     * chart of how many gave 5, 4, 3 and so on. That breakdown is what lets a
     * shopper tell "4.6 from 200 people" apart from "4.6 from three friends
     * and a complaint", and computing it here costs one grouped query rather
     * than shipping every review to the browser to count them.
     */
    public function index(Request $request, string $slug): JsonResponse
    {
        $product = Product::query()->where('slug', $slug)->firstOrFail();

        $perPage = min(50, max(5, (int) $request->query('perPage', 10)));

        $page = ProductReview::query()
            ->where('product_id', $product->id)
            ->published()
            ->latest('created_at')
            ->latest('id')
            ->paginate($perPage);

        $spread = ProductReview::query()
            ->where('product_id', $product->id)
            ->published()
            ->selectRaw('rating, count(*) as total')
            ->groupBy('rating')
            ->pluck('total', 'rating');

        return response()->json([
            'data' => collect($page->items())
                ->map(fn (ProductReview $r): array => $r->toPublicArray())
                ->all(),
            'meta' => [
                'page'    => $page->currentPage(),
                'pages'   => $page->lastPage(),
                'total'   => $page->total(),
                'average' => (float) $product->rating,
                // Always all five keys, in order, so the browser draws five
                // bars without having to invent the missing ones.
                'spread'  => collect(range(5, 1))
                    ->mapWithKeys(fn (int $star): array => [$star => (int) ($spread[$star] ?? 0)])
                    ->all(),
            ],
        ]);
    }

    /**
     * GET /api/reviews/eligibility/{slug}
     *
     * Asked before the form is drawn. Answers for a signed-out visitor too —
     * with `signed-out` rather than a 401 — because "sign in to review this"
     * is a useful thing for the page to say, and a 401 here would look like
     * the session had expired.
     */
    public function eligibility(Request $request, string $slug): JsonResponse
    {
        $product = Product::query()->where('slug', $slug)->firstOrFail();

        return response()->json([
            'data' => $this->reviews->eligibility($request->user(), $product),
        ]);
    }

    /**
     * POST /api/reviews/{slug}
     *
     * Always lands as pending. Nothing here can publish.
     */
    public function store(Request $request, string $slug): JsonResponse
    {
        $product = Product::query()->where('slug', $slug)->firstOrFail();

        $data = $request->validate([
            'rating' => ['required', 'integer', 'min:1', 'max:5'],
            'title'  => ['nullable', 'string', 'max:120'],
            // A floor as well as a ceiling. "good" is not a review anyone can
            // use, and the floor is the cheapest filter there is against the
            // one-word noise a public form otherwise fills up with.
            'body'   => ['required', 'string', 'min:15', 'max:2000'],
        ], [
            'body.min' => 'Tell other shoppers a little more — a sentence or two is plenty.',
        ]);

        try {
            $review = $this->reviews->submit($request->user(), $product, $data);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json([
            'data'    => $review->toPublicArray(),
            'message' => 'Thank you — your review will appear once we have read it.',
        ], 201);
    }
}
