<?php

declare(strict_types=1);

namespace Modules\Bundle\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;
use Modules\Bundle\Services\BundleService;

/**
 * The pairing shown on a product page.
 *
 * Thin by design: the decision about which source may be used, and what it is
 * allowed to be called, lives in BundleService.
 */
class BundleController extends Controller
{
    public function __construct(
        private readonly BundleService $bundles,
    ) {
    }

    /**
     * GET /api/bundles/{sku}
     *
     * 204 rather than 404 when there is no pairing. The product exists and the
     * request was fine; there is simply nothing to show, and a 404 here would
     * read in the client's logs as a broken product page.
     */
    public function show(string $sku): JsonResponse
    {
        $bundle = $this->bundles->forProduct($sku);

        if ($bundle === null) {
            return response()->json([], 204);
        }

        return response()->json(['data' => $bundle]);
    }
}
