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
            Category::updateOrCreate(
                ['slug' => $row['slug']],
                [
                    'name'       => $row['name'],
                    'icon'       => $row['icon'] ?? null,
                    'image'      => $row['image'] ?? null,
                    'blurb'      => $row['blurb'] ?? null,
                    'audience'   => $row['audience'] ?? 'retail',
                    'sort_order' => $i,
                    'is_active'  => true,
                ],
            );
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

            Product::updateOrCreate(
                ['sku' => $row['id']],
                [
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
                    'rating'                => $row['rating'] ?? 0,
                    'review_count'          => $row['reviewCount'] ?? 0,
                    'in_stock'              => $row['inStock'] ?? true,
                    'tags'                  => $row['tags'] ?? [],
                    'dietary'               => $row['dietary'] ?? [],
                    'short_description'     => $row['shortDescription'] ?? null,
                    'description'           => $row['description'] ?? null,
                    'moq'                   => $row['moq'] ?? null,
                    'price_tiers'           => $this->tiersToPoisha($row['priceTiers'] ?? null),
                    'specs'                 => $row['specs'] ?? null,
                    'datasheet'             => $row['datasheet'] ?? null,
                    'is_active'             => true,
                ],
            );
        }
    }

    /** Taka in the JSON, poisha in the database. Never a float. */
    private function toPoisha(int|float|string $taka): int
    {
        return (int) round((float) $taka * 100);
    }

    /** @return array<int, array{qty:int, price_poisha:int}>|null */
    private function tiersToPoisha(?array $tiers): ?array
    {
        if ($tiers === null) {
            return null;
        }

        return array_map(fn (array $t): array => [
            'qty'          => (int) ($t['qty'] ?? $t['minQty'] ?? 1),
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
