<?php

declare(strict_types=1);

namespace Modules\Catalog\Seeders;

use Illuminate\Database\Seeder;
use Modules\Catalog\Models\Category;
use Modules\Catalog\Models\Product;
use RuntimeException;

/**
 * Seeds categories and products from the module's own mock JSON.
 *
 * Reading the same files the storefront reads means the seeded database and the
 * pre-backend frontend cannot drift — the day the API goes live, the data is
 * already identical and nothing visibly changes.
 *
 *   php artisan db:seed --class="Modules\Catalog\Seeders\CatalogSeeder"
 */
class CatalogSeeder extends Seeder
{
    public function run(): void
    {
        $categoryIds = $this->seedCategories();
        $this->seedProducts($categoryIds);
    }

    /** @return array<string,int> slug => id */
    private function seedCategories(): array
    {
        $payload = $this->readJson('categories.json');

        foreach ($payload['categories'] ?? [] as $i => $row) {
            $category = Category::firstOrNew(['slug' => $row['slug']]);

            $category->fill([
                'name'       => $row['name'],
                'icon'       => $row['icon'] ?? null,
                'image'      => $row['image'] ?? null,
                'blurb'      => $row['blurb'] ?? null,
                'audience'   => $row['audience'] ?? 'retail',
                'sort_order' => $i,
            ]);

            // is_active is seeded, not synced. The JSON flag is the launch
            // default — currently the food-only set, see categories.json _meta —
            // but once a row exists the admin panel's switch is the authority,
            // and a re-seed must not silently switch a category back on that a
            // merchant deliberately turned off. (It used to hardcode true here,
            // which did exactly that.)
            if (! $category->exists) {
                $category->is_active = $row['active'] ?? true;
            }

            $category->save();
        }

        return Category::query()->pluck('id', 'slug')->all();
    }

    /** @param array<string,int> $categoryIds */
    private function seedProducts(array $categoryIds): void
    {
        $payload = $this->readJson('products.json');

        foreach ($payload['products'] ?? [] as $row) {
            $categoryId = $categoryIds[$row['categorySlug']] ?? null;

            if ($categoryId === null) {
                throw new RuntimeException(
                    "Product {$row['id']} references unknown category '{$row['categorySlug']}'."
                );
            }

            $product = Product::firstOrNew(['sku' => $row['id']]);

            // Same rule as categories above: is_active is SEEDED, not synced.
            // It used to be hardcoded true in the attribute list below, which
            // meant a re-seed silently re-listed every product a merchant had
            // switched off — and, once products.json grew its own `active`
            // flag, quietly ignored it too.
            if (! $product->exists) {
                $product->is_active = $row['active'] ?? true;
            }

            $product->fill([
                'title'                 => $row['title'],
                'brand'                 => $row['brand'] ?? null,
                'origin'                => $row['origin'] ?? null,
                'barcode'               => $row['barcode'] ?? null,
                'category_id'           => $categoryId,
                // Sub-categories are a slug on the product in the mock data.
                // They become real rows once the taxonomy is managed in admin.
                'sub_category_id'       => $categoryIds[$row['subSlug'] ?? ''] ?? null,
                'price_poisha'          => $this->toPoisha($row['price']),
                'original_price_poisha' => isset($row['originalPrice']) && $row['originalPrice'] > $row['price']
                    ? $this->toPoisha($row['originalPrice'])
                    : null,
                'image'                 => $row['image'] ?? null,
                'images'                => $row['images'] ?? [],
                // Both have been in products.json since launch with no column
                // to land in — see the 2026_08_04 migration. Taka in the file,
                // poisha in the column.
                'unit'                  => $row['unit'] ?? null,
                'variants'              => $this->variantsToPoisha($row['variants'] ?? null),
                'default_variant'       => $row['defaultVariant'] ?? null,
                'rating'                => $row['rating'] ?? 0,
                'review_count'          => $row['reviewCount'] ?? 0,
                'in_stock'              => $row['inStock'] ?? true,
                'tags'                  => $row['tags'] ?? [],
                'dietary'               => $row['dietary'] ?? [],
                'search_terms'          => $row['searchTerms'] ?? [],
                'short_description'     => $row['shortDescription'] ?? null,
                'description'           => $row['description'] ?? null,
                'moq'                   => $row['moq'] ?? null,
                'price_tiers'           => $this->tiersToPoisha($row['priceTiers'] ?? null),
                'faq'                   => $row['faq'] ?? null,
                'specs'                 => $row['specs'] ?? null,
                'datasheet'             => $row['datasheet'] ?? null,
            ]);

            $product->save();
        }
    }

    /** Taka in the JSON, poisha in the database. Never a float. */
    private function toPoisha(int|float|string $taka): int
    {
        return (int) round((float) $taka * 100);
    }

    /**
     * Variant rows from the JSON, priced in poisha.
     *
     * The shape mirrors what the storefront actually consumes (see
     * paintVariants in modules/catalog/product-page.js): LABEL is the key —
     * cart lines and order rows record the chosen variant by label, so it is
     * required and everything else is optional. `amount` is how much of the
     * product's `unit` the pack holds; it exists for the "৳ X / kg" line.
     * Taka in the file, poisha in the column.
     *
     * @return array<int, array<string, mixed>>|null
     */
    private function variantsToPoisha(?array $variants): ?array
    {
        if (empty($variants)) {
            return null;
        }

        return array_values(array_map(fn (array $v): array => [
            'label'                 => (string) ($v['label'] ?? ''),
            'amount'                => $v['amount'] ?? null,
            'price_poisha'          => $this->toPoisha($v['price'] ?? 0),
            'original_price_poisha' => isset($v['originalPrice']) && $v['originalPrice'] > ($v['price'] ?? 0)
                ? $this->toPoisha($v['originalPrice'])
                : null,
            'in_stock'              => (bool) ($v['inStock'] ?? true),
        ], $variants));
    }

    /** @return array<int, array{qty:int, price_poisha:int}>|null */
    private function tiersToPoisha(?array $tiers): ?array
    {
        if ($tiers === null) {
            return null;
        }

        return array_map(fn (array $t): array => [
            // The data uses 'min' (minimum qty for the tier). Accepting the
            // other spellings too, but 'min' MUST come first — reading 'qty'
            // first silently seeded every tier at quantity 1, which would have
            // made all bulk pricing apply from a single unit.
            'qty'          => (int) ($t['min'] ?? $t['qty'] ?? $t['minQty'] ?? 1),
            'price_poisha' => $this->toPoisha($t['price'] ?? 0),
        ], $tiers);
    }

    private function readJson(string $file): array
    {
        $path = __DIR__ . '/../../data/' . $file;

        if (! is_file($path)) {
            throw new RuntimeException("Missing {$path} — the catalog module owns this file.");
        }

        return json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
    }
}
