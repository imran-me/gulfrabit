<?php

declare(strict_types=1);

namespace Modules\Reviews\Console;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Modules\Catalog\Models\Product;
use Modules\Reviews\Models\ProductReview;
use Modules\Reviews\Services\ReviewService;

/**
 * Demo reviews, for development and staging.
 *
 * WHY THIS REFUSES TO RUN IN PRODUCTION, in one paragraph so nobody has to
 * wonder: a review is a claim about a product made by a named person who
 * bought it, and a shopper spends money on the strength of it. Invented ones
 * are a deceptive trade practice under Bangladesh's Consumer Rights Protection
 * Act and its equivalents in every market this shop imports from, and this
 * storefront additionally publishes its aggregate to Google as
 * AggregateRating — structured-data review markup that is not backed by real
 * reviews is the specific thing Google delists sites for. None of that is
 * true of a staging box, where the same rows are exactly what is needed to see
 * whether the section paints, whether Bengali wraps correctly next to English,
 * and whether a 400-character review breaks the card.
 *
 * So it is the same data either way, and only the environment decides.
 *
 * WHAT IT WRITES. 30-40 reviews per product, in the mix a Bangladeshi shop
 * actually receives: perfect English, English with the typos people really
 * make, one-liners, Bengali script, and Banglish. Weighted so about 95% land
 * at five stars, which is the shape asked for — and worth knowing that a
 * catalogue where every product sits at 4.9 is itself a tell, which is part of
 * what makes this a layout fixture rather than a marketing tool.
 *
 *     php artisan reviews:demo
 *     php artisan reviews:demo --per=40
 *     php artisan reviews:demo --clear
 *
 * CLEARING IS EXACT. Demo rows are the only reviews with neither a user nor an
 * order — ReviewService::submit() always sets both — so --clear can remove
 * every one of them without ever touching something a customer wrote.
 */
class SeedDemoReviews extends Command
{
    protected $signature = 'reviews:demo
        {--per=35 : Roughly how many reviews per product}
        {--clear  : Remove demo reviews instead of writing them}';

    protected $description = 'Fill the catalogue with demo reviews (development and staging only)';

    public function handle(ReviewService $reviews): int
    {
        if (app()->isProduction()) {
            $this->error('reviews:demo does not run in production.');
            $this->line('');
            $this->line('  These reviews are written by nobody. On a live shop they are an invented');
            $this->line('  claim a customer spends money on, and this storefront publishes the');
            $this->line('  aggregate to Google as review markup.');
            $this->line('');
            $this->line('  For a real rating, take an order to "delivered" and the customer can');
            $this->line('  review it — see modules/reviews/README.md.');

            return self::FAILURE;
        }

        return $this->option('clear') ? $this->clear($reviews) : $this->seed($reviews);
    }

    private function clear(ReviewService $reviews): int
    {
        // The discriminator, and the reason it is safe: every review a person
        // submits carries a user_id and the order that proved the purchase.
        $ids = ProductReview::query()
            ->whereNull('user_id')
            ->whereNull('order_id')
            ->pluck('product_id')
            ->unique();

        $gone = ProductReview::query()
            ->whereNull('user_id')
            ->whereNull('order_id')
            ->delete();

        foreach ($ids as $productId) {
            $reviews->recount((int) $productId);
        }

        $this->info("Removed {$gone} demo review(s). Anything a customer wrote is untouched.");

        return self::SUCCESS;
    }

    private function seed(ReviewService $reviews): int
    {
        $per = max(5, min(60, (int) $this->option('per')));

        $products = Product::query()->orderBy('id')->get(['id', 'sku', 'title', 'category_id']);

        if ($products->isEmpty()) {
            $this->warn('No products to review.');

            return self::SUCCESS;
        }

        $categories = DB::table('categories')->pluck('slug', 'id');

        $bar = $this->output->createProgressBar($products->count());
        $bar->start();

        $written = 0;

        foreach ($products as $product) {
            $bar->advance();

            $slug = (string) ($categories[$product->category_id] ?? '');

            // Deterministic per product: re-running gives the same catalogue
            // rather than a different one, so a screenshot taken on Tuesday
            // still matches the box on Thursday.
            mt_srand(crc32($product->sku));

            $count = $per + mt_rand(-5, 5);
            $rows = [];
            $usedNames = [];

            for ($i = 0; $i < $count; $i++) {
                $author = $this->uniqueName($usedNames);
                $rating = $this->rating();
                [$title, $body] = $this->text($slug, (string) $product->title, $rating);

                $rows[] = [
                    'product_id'  => $product->id,
                    'user_id'     => null,
                    'order_id'    => null,
                    'author_name' => $author,
                    'rating'      => $rating,
                    'title'       => $title,
                    'body'        => $body,
                    'status'      => ProductReview::PUBLISHED,
                    // Set, because the badge is part of what is being looked
                    // at. On a staging box it claims nothing about anybody.
                    'verified_at' => now()->subDays(mt_rand(1, 240)),
                    'created_at'  => now()->subDays(mt_rand(1, 240)),
                    'updated_at'  => now(),
                ];
            }

            // One insert per product rather than one per review: fifty
            // products times thirty-five rows is 1,750 round trips otherwise,
            // which on a remote staging database is minutes of waiting.
            ProductReview::query()->insert($rows);

            $written += count($rows);

            $reviews->recount($product->id);
        }

        $bar->finish();
        $this->newLine(2);

        $this->info("Wrote {$written} demo review(s) across {$products->count()} product(s).");
        $this->comment('Remove them again with: php artisan reviews:demo --clear');

        return self::SUCCESS;
    }

    /**
     * About 95% at five stars, as asked for.
     *
     * The remainder is not noise for its own sake: a product with nothing but
     * five-star reviews reads as bought, and the four with a caveat in it is
     * what makes the rest look like people.
     */
    private function rating(): int
    {
        $roll = mt_rand(1, 100);

        return match (true) {
            $roll <= 95 => 5,
            $roll <= 99 => 4,
            default     => 3,
        };
    }

    /** @param array<string, true> $used */
    private function uniqueName(array &$used): string
    {
        $first = ['Imran', 'Nusrat', 'Rafiq', 'Tasnim', 'Sabbir', 'Mehjabin', 'Arif', 'Sumaiya',
            'Tanvir', 'Farhana', 'Jubayer', 'Ishrat', 'Mahmud', 'Rumana', 'Shakil', 'Nabila',
            'Ashraf', 'Tahmina', 'Rayhan', 'Sharmin', 'Fahim', 'Lamia', 'Zahid', 'Anika',
            'Masud', 'Ritu', 'Sohel', 'Nadia', 'Kamrul', 'Priya', 'Rakib', 'Sadia',
            'Emon', 'Jannat', 'Nayeem', 'Mim', 'Shuvo', 'Afsana', 'Tareq', 'Rimi'];

        $last = ['H.', 'A.', 'R.', 'K.', 'I.', 'S.', 'B.', 'M.', 'C.', 'T.', 'N.', 'F.'];

        for ($try = 0; $try < 40; $try++) {
            $name = $first[mt_rand(0, count($first) - 1)] . ' ' . $last[mt_rand(0, count($last) - 1)];

            if (! isset($used[$name])) {
                $used[$name] = true;

                return $name;
            }
        }

        // Ran out of combinations on a very large --per. A repeated name is
        // more honest here than a name with a number stapled to it.
        return $first[mt_rand(0, count($first) - 1)] . ' ' . $last[mt_rand(0, count($last) - 1)];
    }

    /**
     * One review's headline and body.
     *
     * FIVE VOICES, because a review section where everyone writes the same way
     * is the thing that looks generated, and because each one exercises
     * something different in the layout: Bengali script tests the font stack
     * and line height, a one-liner tests the card at its shortest, and a long
     * English paragraph tests the measure.
     *
     * @return array{0: ?string, 1: string}
     */
    private function text(string $categorySlug, string $title, int $rating): array
    {
        // A short, human way to refer to the product inside a sentence. The
        // full title reads like an advert when a person quotes it back, and
        // every title in this catalogue puts the qualifier after an em dash:
        // "Ajwa Dates — Madinah Select" is "Ajwa Dates" to the person buying.
        $short = trim(explode('—', $title)[0]);

        if ($rating <= 4) {
            return $this->reserved($short, $rating);
        }

        return match (mt_rand(1, 5)) {
            1 => $this->perfectEnglish($categorySlug, $short),
            2 => $this->typoEnglish($categorySlug, $short),
            3 => $this->oneLiner(),
            4 => $this->bengali($categorySlug),
            default => $this->banglish($categorySlug, $short),
        };
    }

    /** @return array{0: ?string, 1: string} */
    private function perfectEnglish(string $slug, string $short): array
    {
        $openers = [
            "Ordered {$short} last week and it arrived in two days, sealed properly.",
            "This is my third order of {$short} and the quality has been the same every time.",
            "Bought {$short} for my mother and she asked me to order two more.",
            "The packaging was much better than I expected — nothing was crushed or leaking.",
            "Delivery to Chattogram took three days, which is faster than I am used to.",
        ];

        $middles = match ($slug) {
            'dates-nuts' => [
                ' The dates are soft and fresh, not dry like the ones from the local market.',
                ' Good size, clean, and they actually taste like they were packed recently.',
                ' Nuts were crisp and none of them were stale.',
            ],
            'oil-ghee' => [
                ' The smell is exactly right — you can tell it has not been cut with anything.',
                ' Clear, no sediment, and the bottle was sealed properly.',
                ' A little goes a long way, so the price works out reasonable.',
            ],
            'honey' => [
                ' Thick, crystallises naturally in the cold, which is how you know it is real.',
                ' Not overly sweet, and it has a proper flavour rather than just sugar.',
            ],
            'spices', 'herbs' => [
                ' The aroma when you open the pack is very strong, which is a good sign.',
                ' Ground fresh by the smell of it, nothing like the supermarket packets.',
            ],
            'beauty-personal-care' => [
                ' My skin has not reacted at all, which is rare for me.',
                ' Absorbs quickly and does not leave anything greasy behind.',
            ],
            'kitchen-appliances' => [
                ' Feels solid, not the flimsy plastic I was worried about at this price.',
                ' Easy to clean and it has held up to daily use so far.',
            ],
            default => [
                ' Exactly as described on the page, no surprises.',
                ' Good value for what it costs.',
            ],
        };

        $closers = [
            ' Will order again.',
            ' Recommended.',
            ' Happy with it.',
            ' Would buy from GulfRabit again.',
            '',
        ];

        $body = $openers[array_rand($openers)]
            . $middles[array_rand($middles)]
            . $closers[array_rand($closers)];

        $titles = [null, 'Exactly as described', 'Good quality', 'Fast delivery', 'Will order again', null];

        return [$titles[array_rand($titles)], $body];
    }

    /**
     * The same voice with the typos people actually make.
     *
     * Real misspellings — recieved, definately, qualtiy — and the missing
     * apostrophe, not random letter soup. A fixture full of nonsense words
     * does not tell you whether the card handles ordinary human typing.
     *
     * @return array{0: ?string, 1: string}
     */
    private function typoEnglish(string $slug, string $short): array
    {
        $bodies = [
            "recieved the order today, packing was very good. qualtiy is definately better then the local shop. thanks",
            "i have order {$short} 2 times now, both time fresh. delivery man was polite also.",
            "Product is good but delivary took 4 days. Still ok, no complain about the item itself.",
            "very nice prodcut, my familly liked it. price is litle high but worth it i think.",
            "Its realy fresh. i was worried about buying food online but this was fine. will order agian inshallah",
            "everything was seald properly, nothing damage. good service",
            "amazing quality, cant belive its this cheap compare to shop price",
        ];

        $titles = [null, 'good prodcut', 'satisfied', null, 'realy good'];

        return [$titles[array_rand($titles)], $bodies[array_rand($bodies)]];
    }

    /** @return array{0: ?string, 1: string} */
    private function oneLiner(): array
    {
        $bodies = [
            'Good product, fast delivery.',
            'Fresh and well packed. Recommended.',
            'Exactly what I ordered. No issues.',
            'Very good, thank you.',
            'Alhamdulillah, good quality.',
            'Received on time, everything sealed.',
            'Better than the market price.',
            'Satisfied with the purchase.',
        ];

        return [null, $bodies[array_rand($bodies)]];
    }

    /** @return array{0: ?string, 1: string} */
    private function bengali(string $slug): array
    {
        $bodies = match ($slug) {
            'dates-nuts' => [
                'খেজুরগুলো খুব নরম আর তাজা ছিল। বাজারের খেজুরের চেয়ে অনেক ভালো, দাম অনুযায়ী ঠিক আছে।',
                'প্যাকেজিং খুব ভালো ছিল, কিছুই নষ্ট হয়নি। পরিবারের সবাই পছন্দ করেছে।',
                'রমজানের জন্য অর্ডার করেছিলাম, সময়মতো পেয়েছি। মান নিয়ে কোনো অভিযোগ নেই।',
            ],
            'oil-ghee' => [
                'ঘি এর ঘ্রাণটা একদম আসল, ভেজাল মনে হয়নি। আবার অর্ডার করব ইনশাআল্লাহ।',
                'তেলটা পরিষ্কার, কোনো তলানি নেই। বোতল সিল করা অবস্থায় পেয়েছি।',
            ],
            'honey' => [
                'মধু খাঁটি মনে হয়েছে, শীতে জমে গেছে যেটা আসল মধুর লক্ষণ। ধন্যবাদ।',
            ],
            'spices', 'herbs' => [
                'মসলার ঘ্রাণ অনেক কড়া, তাজা বোঝা যায়। রান্নায় স্বাদ ভালো হয়েছে।',
            ],
            default => [
                'পণ্যের মান ভালো, ডেলিভারিও দ্রুত ছিল। ধন্যবাদ গালফর‍্যাবিট।',
                'যেমন ছবিতে দেখেছি ঠিক তেমনই পেয়েছি। কোনো সমস্যা হয়নি।',
            ],
        };

        $shorts = [
            'খুব ভালো প্রোডাক্ট।',
            'দ্রুত ডেলিভারি পেয়েছি, ধন্যবাদ।',
            'মান ভালো, দাম ঠিক আছে।',
            'আলহামদুলিল্লাহ, ভালো জিনিস।',
        ];

        // Roughly a third of the Bengali reviews are one line, the same as the
        // English ones — the split is about how people write, not language.
        $body = mt_rand(1, 3) === 1
            ? $shorts[array_rand($shorts)]
            : $bodies[array_rand($bodies)];

        return [null, $body];
    }

    /**
     * Banglish — Bengali written in Latin script, which is how a great many
     * Bangladeshi customers actually type on a phone.
     *
     * @return array{0: ?string, 1: string}
     */
    private function banglish(string $slug, string $short): array
    {
        $bodies = [
            "Product ta khub valo chilo, packaging o sundor. Delivery timer moddhei peyechi.",
            "Onek din pore emon fresh jinis pelam. Dam ta ektu beshi mone hoyeche but quality valo.",
            "Ma er jonno order korechilam, khub pochondo korechen. Abar nibo insha Allah.",
            "{$short} ta ekdom description er moto. Kono problem hoy nai, seal kora chilo.",
            "Bhai delivery fast chilo, 2 diner moddhe peye gechi. Quality niye kono complain nai.",
            "Local bazar theke onek valo. Ei dame ei quality pawa jay na normally.",
            "Order kore tension e chilam but hate paoar por shanti. Recommend korbo.",
        ];

        $titles = [null, 'Valo product', null, 'Recommend kori', null];

        return [$titles[array_rand($titles)], $bodies[array_rand($bodies)]];
    }

    /**
     * The four- and three-star ones.
     *
     * They carry an actual reservation, because a four-star review whose text
     * is indistinguishable from a five-star one is what makes a whole section
     * look written by one person.
     *
     * @return array{0: ?string, 1: string}
     */
    private function reserved(string $short, int $rating): array
    {
        $four = [
            "Quality is good but the delivery took longer than the estimate — five days to Sylhet.",
            "No complaints about {$short} itself. The packaging was a bit loose though, one corner was dented.",
            "Good product. Slightly expensive compared to what I pay locally, but the quality is better.",
            "Fresh and as described. Would have given five stars if the courier had called before arriving.",
            "দাম একটু বেশি মনে হয়েছে, তবে জিনিসের মান ভালো। ডেলিভারি একদিন দেরি হয়েছে।",
            "Valo product but delivery ektu late chilo. Quality thik ache.",
        ];

        $three = [
            "It is fine, nothing special. The photo makes it look larger than it is.",
            "Average. Arrived intact and on time, but I have had better from elsewhere at this price.",
            "মোটামুটি ভালো। ছবিতে যেমন দেখায় আকারে তার চেয়ে ছোট মনে হলো।",
        ];

        $pool = $rating === 4 ? $four : $three;

        return [null, $pool[array_rand($pool)]];
    }
}
