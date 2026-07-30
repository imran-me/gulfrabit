<?php

declare(strict_types=1);

namespace Modules\Cart\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Modules\Cart\Models\Cart;
use Modules\Cart\Requests\AddCartItemRequest;
use Modules\Cart\Requests\UpdateCartItemRequest;
use Modules\Cart\Services\CartService;
use Modules\Cart\Services\PromotionService;
use RuntimeException;

/**
 * Cart endpoints.
 *
 * Identity is an httpOnly guest-token cookie, or the authenticated user. The
 * cookie is httpOnly so page JS cannot read or forge it — the cart id is not
 * something the client should be able to choose.
 */
class CartController extends Controller
{
    private const GUEST_COOKIE = 'gr_cart';
    private const COOKIE_DAYS = 60;

    public function __construct(
        private readonly CartService $carts,
        private readonly PromotionService $promotions,
    ) {
    }

    public function show(Request $request): JsonResponse
    {
        $cart = $this->cartFor($request);

        return $this->respond($cart, $request);
    }

    public function addItem(AddCartItemRequest $request): JsonResponse
    {
        $cart = $this->cartFor($request);

        try {
            $cart = $this->carts->addItem(
                $cart,
                $request->validated('sku'),
                (int) ($request->validated('qty') ?? 1),
                $request->validated('variant'),
            );
        } catch (RuntimeException $e) {
            // Out of stock / withdrawn. 422 rather than 500 — this is a
            // legitimate state the customer can act on, not a server fault.
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return $this->respond($cart, $request);
    }

    public function updateItem(UpdateCartItemRequest $request, int $lineId): JsonResponse
    {
        $cart = $this->carts->updateQty($this->cartFor($request), $lineId, (int) $request->validated('qty'));

        return $this->respond($cart, $request);
    }

    public function removeItem(Request $request, int $lineId): JsonResponse
    {
        return $this->respond($this->carts->removeItem($this->cartFor($request), $lineId), $request);
    }

    public function clear(Request $request): JsonResponse
    {
        return $this->respond($this->carts->clear($this->cartFor($request)), $request);
    }

    /**
     * GET /api/cart/offers
     *
     * The publicly advertisable offer rules, plus the active gift threshold.
     * Public and cacheable — this is marketing copy, identical for everyone,
     * and it contains no basket and no customer.
     *
     * It answers "what may we print", which is a different question from
     * applyPromo()'s "does this code work for this basket". Keeping them apart
     * is what stops a private code being advertised just because it happens to
     * be redeemable.
     */
    public function offers(): JsonResponse
    {
        return response()->json([
            'data' => [
                ...$this->promotions->publicOffers(),
                ...$this->carts->activeGiftOffer(),
            ],
        ]);
    }

    public function applyPromo(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'code' => ['required', 'string', 'max:32'],
        ]);

        $cart = $this->cartFor($request);
        // Exact poisha. Using the taka figure from the payload and multiplying
        // by 100 would lose up to 99 poisha and could flip the basket across a
        // minimum-spend boundary.
        $check = $this->promotions->validate(
            $validated['code'],
            $this->carts->subtotalPoisha($cart),
            // A promotion scoped to particular products needs to see them.
            $this->carts->discountLines($cart),
        );

        if (! $check['valid']) {
            return response()->json([
                // Three different situations, three different messages. Only
                // "not valid" is a dead end; the other two tell the customer
                // what would make the code work, which is the difference
                // between a lost sale and a larger one.
                'message' => match ($check['reason']) {
                    'min_subtotal' => "Spend ৳ {$check['minSpend']} to use this code.",
                    'not_eligible' => 'This code is for selected items, and none of them are in your basket.',
                    default        => 'That code is not valid.',
                },
                'errors'  => ['code' => ['invalid']],
            ], 422);
        }

        return $this->respond($this->carts->applyPromo($cart, $validated['code']), $request);
    }

    public function removePromo(Request $request): JsonResponse
    {
        return $this->respond($this->carts->applyPromo($this->cartFor($request), null), $request);
    }

    /**
     * POST /api/cart/merge — called once, right after login, so the basket the
     * customer built while logged out is not silently thrown away.
     */
    public function merge(Request $request): JsonResponse
    {
        $token = $request->cookie(self::GUEST_COOKIE);
        $userId = (int) $request->user()->id;

        $cart = $token
            ? $this->carts->mergeGuestIntoUser($token, $userId)
            : $this->carts->resolve(null, $userId);

        // The guest cart is gone; clear its cookie so a stale token cannot
        // resurrect an empty cart on the next request.
        return response()
            ->json(['data' => $this->carts->toStorefrontArray($cart)])
            ->withoutCookie(self::GUEST_COOKIE);
    }

    /* ---- internals ----------------------------------------------------- */

    private function cartFor(Request $request): Cart
    {
        return $this->carts->resolve(
            $request->cookie(self::GUEST_COOKIE),
            $request->user()?->id,
        );
    }

    /**
     * Always return the whole cart, never a partial patch. Clients that merge
     * partial responses drift out of sync with the server's totals, and the
     * cart is the one screen where a wrong number is unforgivable.
     */
    private function respond(Cart $cart, Request $request): JsonResponse
    {
        $response = response()->json(['data' => $this->carts->toStorefrontArray($cart)]);

        // Hand a guest their token so the next request finds the same cart.
        // guest_token is never null on a guest cart — CartService::resolve()
        // always mints one — so there is deliberately no fallback here: a
        // generated-on-the-fly value would set a cookie no cart actually holds.
        if ($cart->isGuest() && $cart->guest_token !== null
            && $request->cookie(self::GUEST_COOKIE) !== $cart->guest_token) {
            $response->withCookie(cookie(
                name: self::GUEST_COOKIE,
                value: $cart->guest_token,
                minutes: self::COOKIE_DAYS * 24 * 60,
                httpOnly: true,
                sameSite: 'lax',
            ));
        }

        return $response;
    }
}
