<?php

declare(strict_types=1);

namespace Modules\Cms\Services;

use Illuminate\Support\Facades\DB;
use Modules\Cms\Models\ContentBlock;
use Modules\Cms\Models\ContentRevision;
use RuntimeException;

/**
 * Reading and writing content overrides.
 *
 * WHY IMAGE PATHS ARE VALIDATED AND TEXT IS NOT
 * ---------------------------------------------
 * Text is safe by construction: the storefront writes it with `textContent`, so
 * markup in it is displayed rather than executed. Nothing needs sanitising
 * because nothing is ever parsed.
 *
 * An image src is different — it is a URL the browser will fetch. An arbitrary
 * one turns every visitor into a request to somebody else's server, which is
 * how a CMS field becomes a tracking pixel, a hotlink, or a way to make our
 * pages depend on a host we do not control. So images must be same-origin paths
 * under the asset directories, and anything else is refused with a reason.
 */
final class ContentService
{
    /** Directories an image override may point into. */
    private const ALLOWED_IMAGE_ROOTS = ['/assets/', '/uploads/'];

    /**
     * Every override for a page, keyed for direct lookup by the client.
     *
     * @return array<string, array{type:string, value:string, alt:?string}>
     */
    public function forPage(string $page): array
    {
        return ContentBlock::query()
            ->where('page', $page)
            ->get()
            ->mapWithKeys(fn (ContentBlock $b): array => [
                $b->key => [
                    'type'  => $b->type,
                    'value' => $b->value,
                    'alt'   => $b->alt,
                ],
            ])
            ->all();
    }

    /**
     * Create or update an override, keeping the previous value.
     *
     * @throws RuntimeException on an image path we will not serve
     */
    public function put(
        string $key,
        string $page,
        string $type,
        string $value,
        ?string $alt = null,
        ?int $adminId = null,
        ?string $adminName = null,
    ): ContentBlock {
        if ($type === 'image') {
            $value = $this->validateImagePath($value);
        }

        if ($type === 'text' && trim($value) === '') {
            // Empty is almost always a mis-click rather than an intention, and
            // an empty heading looks like a broken page rather than an edit.
            // Clearing is done by reverting to the authored content instead.
            throw new RuntimeException('Text cannot be empty. Revert it instead to restore the original.');
        }

        return DB::transaction(function () use ($key, $page, $type, $value, $alt, $adminId, $adminName): ContentBlock {
            $block = ContentBlock::query()->where('key', $key)->lockForUpdate()->first();

            if ($block !== null) {
                // Keep what it said BEFORE this edit, so undo is one row.
                ContentRevision::create([
                    'content_block_id'   => $block->id,
                    'value'              => $block->value,
                    'alt'                => $block->alt,
                    'changed_by_admin_id' => $block->updated_by_admin_id,
                    'changed_by_name'    => $block->updated_by_name,
                ]);
            }

            return ContentBlock::updateOrCreate(
                ['key' => $key],
                [
                    'page'  => $page,
                    'type'  => $type,
                    'value' => $value,
                    'alt'   => $alt,
                    'updated_by_admin_id' => $adminId,
                    'updated_by_name'     => $adminName,
                ],
            );
        });
    }

    /**
     * Remove an override entirely, so the page falls back to its authored text.
     *
     * This is the "undo everything" that makes live editing safe to hand over:
     * whatever an editor did, the developer's original is one click away and is
     * never itself stored in the database where it could be lost.
     */
    public function revert(ContentBlock $block): void
    {
        $block->delete();
    }

    /**
     * @throws RuntimeException when the path is not one we will serve
     */
    private function validateImagePath(string $path): string
    {
        $path = trim($path);

        // Reject anything with a scheme or a protocol-relative prefix before
        // looking at the rest. `//evil.example/x.png` is an absolute URL that
        // a naive "starts with /" check would wave through.
        if (str_contains($path, '://') || str_starts_with($path, '//')) {
            throw new RuntimeException('Images must be files on this site, not links to another server.');
        }

        // `..` cannot escape anywhere useful once the prefix check below runs,
        // but a path containing it is a sign of an attempt rather than a typo.
        if (str_contains($path, '..')) {
            throw new RuntimeException('Image path may not contain "..".');
        }

        foreach (self::ALLOWED_IMAGE_ROOTS as $root) {
            if (str_starts_with($path, $root)) {
                return $path;
            }
        }

        throw new RuntimeException(
            'Images must live under ' . implode(' or ', self::ALLOWED_IMAGE_ROOTS) . '.'
        );
    }
}
