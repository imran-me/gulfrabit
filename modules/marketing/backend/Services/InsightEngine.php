<?php

declare(strict_types=1);

namespace Modules\Marketing\Services;

use Throwable;

/**
 * What the numbers mean, in sentences.
 *
 * A dashboard shows forty numbers and leaves the reader to find the three
 * that matter. A shopkeeper checking the screen between packing orders will
 * not do that arithmetic - so this does it: it compares checkout in the
 * Facebook app with checkout in Chrome, the ad's cancellation rate with
 * everyone else's, the product people open with the product people buy, and
 * says so when one of them is out of line.
 *
 * EVERY RULE HAS A FLOOR
 * ----------------------
 * Nothing is said about fewer than a stated number of visits or orders. Three
 * visits converting "0%" against two converting "50%" is not an insight, it is
 * noise with a percentage sign, and one false alarm teaches the reader to skip
 * the whole panel. A quiet panel on a quiet week is correct.
 *
 * DETERMINISTIC, AND WRITTEN HERE
 * -------------------------------
 * Plain rules with plain thresholds, not a model. The merchant can ask "why
 * did it say that?" and the answer is a line in this file.
 */
final class InsightEngine
{
    /** Shown in this order, and the panel keeps the first eight. */
    private const TONES = ['bad' => 0, 'warn' => 1, 'good' => 2, 'info' => 3];

    private const LIMIT = 8;

    public function __construct(
        private readonly AnalyticsService $analytics,
        private readonly TrackerReports $reports,
        private readonly OrderOutcomes $outcomes,
    ) {
    }

    /** @return list<array<string, string|null>> */
    public function for(TrackerFilter $f): array
    {
        $head   = $this->analytics->headline($f);
        $kpis   = $head['kpis'];
        $linked = $this->outcomes->linked($f);

        // Each rule is independent and each is guarded: a rule that trips on
        // an odd corner of the data costs its own sentence, never the panel.
        $rules = [
            fn () => $this->silence($head['health']),
            fn () => $this->capiFailing($head['capi']),
            fn () => $this->trafficChange($kpis, $f),
            fn () => $this->conversionChange($kpis, $f),
            fn () => $this->checkoutLeak($kpis),
            fn () => $this->biggestDrop($head['funnel']),
            fn () => $this->inAppCheckout($this->reports->completion($f, 'browser')),
            fn () => $this->inAppShare($this->reports->breakdown($f, 'browser', 20), $kpis),
            fn () => $this->deviceGap($this->reports->breakdown($f, 'device', 5)),
            fn () => $this->channelStandouts($this->reports->breakdown($f, 'channel', 20), $kpis),
            fn () => $this->lostOrdersByChannel($this->outcomes->byChannel($linked)),
            fn () => $this->products($this->reports->products($f)['products']),
            fn () => $this->searches($this->reports->search($f)),
            fn () => $this->peakHours($this->reports->heatmap($f)),
            fn () => $this->returning($this->reports->breakdown($f, 'visit_type', 5)),
            fn () => $this->coverage($this->outcomes->reconcile($f, $linked)),
        ];

        $out = [];
        foreach ($rules as $rule) {
            try {
                foreach ((array) $rule() as $insight) {
                    if (is_array($insight)) {
                        $out[] = $insight;
                    }
                }
            } catch (Throwable) {
                continue;
            }
        }

        usort($out, fn (array $a, array $b): int => self::TONES[$a['tone']] <=> self::TONES[$b['tone']]);

        return array_slice($out, 0, self::LIMIT);
    }

    /* ---- Tracking health ------------------------------------------------- */

    private function silence(array $health): array
    {
        $ago = $health['lastEventAgoSeconds'];

        if ($ago === null) {
            return [$this->make('silence', 'info', 'Nothing recorded yet',
                'The screen fills within seconds of the first visit to the storefront. If it stays empty after you have browsed the shop yourself, the tracking route or its migration has not reached the server.',
                null, null)];
        }

        if ($ago > 6 * 3600) {
            $hours = (int) floor($ago / 3600);

            return [$this->make('silence', 'bad', "No visits recorded for {$hours} hours",
                'Either the shop has had no visitors at all, or tracking has stopped. Open the storefront on your phone and check the Live tab - your own visit should appear within seconds.',
                'live', "{$hours} h")];
        }

        return [];
    }

    private function capiFailing(array $capi): array
    {
        if ($capi['failed'] < 1) {
            return [];
        }

        $total = max(1, $capi['sent'] + $capi['failed']);
        $pct   = $this->pct($capi['failed'] / $total * 100);
        $one   = $capi['failed'] === 1;
        $none  = $capi['sent'] < 1;

        // THE RATE IS THE DIAGNOSIS, and one guess for every rate was wrong.
        // A token Meta will not accept is refused on EVERY event, so naming it
        // while 288 of 289 got through sends the merchant off to regenerate a
        // token that was working - which is what this said on 2026-09-12, in
        // red, over a single malformed event. A few refusals among accepted
        // ones is the opposite story: the keys are fine and those particular
        // events were not. Either way Meta's own words for the last one are on
        // Pixel setup, which is what this links to.
        $body = $none
            ? 'Nothing is reaching Meta\'s server copy: all ' . $capi['failed'] . ' '
                . ($one ? 'event was' : 'events were') . ' refused. The browser pixel still works, so '
                . 'visits are counted, but ad optimisation loses what the server copy recovers. The '
                . 'access token or the Pixel ID is almost certainly wrong or expired - Send test event '
                . 'on Pixel setup answers which, in Meta\'s own words.'
            : ($one ? '1 event' : $capi['failed'] . ' events') . " ({$pct}% of those sent) "
                . ($one ? 'was' : 'were') . ' refused, and the rest reached Meta - so the keys '
                . 'themselves are working. Pixel setup shows Meta\'s reason for the last refusal.';

        return [$this->make(
            'capi',
            // Red is for something that is broken. A minority of refusals with
            // the rest getting through is worth looking at, not an emergency.
            $none ? 'bad' : 'warn',
            $none
                ? 'Meta is refusing the server copy of your events'
                : 'Meta refused ' . ($one ? 'one event' : 'some events') . ' the server sent',
            $body,
            null,
            (string) $capi['failed'],
            '/admin/pixel',
        )];
    }

    /* ---- Period against period ------------------------------------------- */

    private function trafficChange(array $kpis, TrackerFilter $f): array
    {
        $now  = (int) $kpis['sessions']['value'];
        $then = (int) $kpis['sessions']['prev'];

        if ($then < 20) {
            return [];
        }

        $change = ($now - $then) / $then * 100;
        if (abs($change) < 20) {
            return [];
        }

        $up = $change > 0;

        return [$this->make('traffic', $up ? 'good' : 'warn',
            ($up ? 'Visits are up ' : 'Visits are down ') . $this->pct(abs($change)) . '%',
            number_format($now) . ' visits against ' . number_format($then) . " in {$f->compareLabel}." . ($up
                ? ' Check the Sources tab for where the new visits came from.'
                : ' If an ad was paused or its budget cut, this is where it shows first.'),
            'sources', ($up ? '+' : '−') . $this->pct(abs($change)) . '%')];
    }

    private function conversionChange(array $kpis, TrackerFilter $f): array
    {
        $now  = $kpis['conversionPct']['value'];
        $then = $kpis['conversionPct']['prev'];

        if ($now === null || $then === null || $then <= 0
            || $kpis['sessions']['value'] < 50 || $kpis['sessions']['prev'] < 50) {
            return [];
        }

        $change = ($now - $then) / $then * 100;
        if (abs($change) < 25) {
            return [];
        }

        $up = $change > 0;

        return [$this->make('conversion', $up ? 'good' : 'warn',
            $up ? 'More visits are turning into orders' : 'Fewer visits are turning into orders',
            "{$this->pct($now)}% of visits ordered, against {$this->pct($then)}% in {$f->compareLabel}." . ($up
                ? ''
                : ' A price change, a slower page or a new ad bringing less ready buyers are the usual causes.'),
            'overview', "{$this->pct($now)}%")];
    }

    /* ---- Funnel and checkout --------------------------------------------- */

    private function checkoutLeak(array $kpis): array
    {
        $n    = (int) $kpis['abandoned']['value'];
        $taka = (int) $kpis['abandonedTaka']['value'];

        if ($n < 3) {
            return [];
        }

        return [$this->make('checkout-leak', 'warn', $this->taka($taka) . ' left at checkout',
            "{$n} visits started checkout and did not order. The Checkout tab lists each one - what was in the cart, the phone or computer, and the ad or post that brought them.",
            'checkout', $this->taka($taka))];
    }

    private function biggestDrop(array $funnel): array
    {
        $worst = null;

        for ($i = 1, $n = count($funnel); $i < $n; $i++) {
            $before = (int) $funnel[$i - 1]['sessions'];
            $drop   = $funnel[$i]['dropOffPct'];

            if ($before < 20 || $drop === null || $drop < 70) {
                continue;
            }
            if ($worst === null || $drop > $worst['drop']) {
                $worst = ['i' => $i, 'drop' => $drop, 'before' => $before];
            }
        }

        if ($worst === null) {
            return [];
        }

        $from = self::STEP_WORDS[$funnel[$worst['i'] - 1]['stage']] ?? $funnel[$worst['i'] - 1]['stage'];
        $to   = self::STEP_WORDS[$funnel[$worst['i']]['stage']] ?? $funnel[$worst['i']]['stage'];

        return [$this->make('funnel-drop', 'warn', "Most visits are lost before they {$to}",
            "{$worst['drop']}% of the " . number_format($worst['before']) . " visits that {$from} did not go on to {$to}. That one step is where a fix pays most.",
            'overview', "−{$worst['drop']}%")];
    }

    /** How each funnel step reads inside a sentence. */
    private const STEP_WORDS = [
        'PageView'         => 'visited the shop',
        'ViewContent'      => 'open a product',
        'AddToCart'        => 'add to cart',
        'InitiateCheckout' => 'start checkout',
        'Purchase'         => 'order',
    ];

    /**
     * Checkout completion inside app browsers against ordinary browsers - the
     * comparison no ad dashboard makes, and the one a Facebook-first shop
     * most needs: its customers are in the app, and the app is where
     * checkouts break.
     */
    private function inAppCheckout(array $rows): array
    {
        $tally = ['in' => ['n' => 0, 'ok' => 0], 'out' => ['n' => 0, 'ok' => 0]];

        foreach ($rows as $r) {
            // Visits recorded before the browser was stored belong to neither side.
            if ($r['key'] === null) {
                continue;
            }
            $side = in_array($r['key'], TrafficClassifier::IN_APP, true) ? 'in' : 'out';
            $tally[$side]['n']  += $r['checkouts'];
            $tally[$side]['ok'] += $r['converted'];
        }

        if ($tally['in']['n'] < 5 || $tally['out']['n'] < 5) {
            return [];
        }

        $inPct  = $tally['in']['ok'] / $tally['in']['n'] * 100;
        $outPct = $tally['out']['ok'] / $tally['out']['n'] * 100;

        if ($outPct <= 0 || $inPct >= $outPct * 0.7) {
            return [];
        }

        return [$this->make('in-app-checkout', 'bad', 'Checkout breaks down inside the Facebook app',
            "Only {$this->pct($inPct)}% of checkouts started inside Facebook, Messenger or Instagram finish, against {$this->pct($outPct)}% in ordinary browsers. Place a test order on a phone from inside the Facebook app - that is where most of your buyers are.",
            'checkout', "{$this->pct($inPct)}%")];
    }

    private function inAppShare(array $browsers, array $kpis): array
    {
        $total = (int) $kpis['sessions']['value'];
        if ($total < 30) {
            return [];
        }

        $inApp = 0;
        foreach ($browsers as $b) {
            if (in_array($b['key'], TrafficClassifier::IN_APP, true)) {
                $inApp += $b['sessions'];
            }
        }

        $share = $inApp / $total * 100;
        if ($share < 40) {
            return [];
        }

        return [$this->make('in-app-share', 'info', "{$this->pct($share)}% of visits open inside Facebook, Messenger or Instagram",
            'Those in-app browsers keep no login between visits and block some cookies. Keep the checkout short, make the phone number the first field, and test every change inside the app, not only in Chrome.',
            'audience', "{$this->pct($share)}%")];
    }

    private function deviceGap(array $devices): array
    {
        $by = [];
        foreach ($devices as $d) {
            if ($d['key'] !== null) {
                $by[$d['key']] = $d;
            }
        }

        $m = $by['mobile'] ?? null;
        $c = $by['desktop'] ?? null;

        if ($m === null || $c === null || $m['sessions'] < 30 || $c['sessions'] < 30) {
            return [];
        }

        $mPct = $m['converted'] / $m['sessions'] * 100;
        $cPct = $c['converted'] / $c['sessions'] * 100;

        if ($mPct <= 0 || $cPct / $mPct < 2) {
            return [];
        }

        $x = $this->pct($cPct / $mPct);

        return [$this->make('device-gap', 'warn', "Computers order {$x}× as often as phones",
            "{$this->pct($cPct)}% of computer visits ordered, {$this->pct($mPct)}% of phone visits. Most of your visitors are on phones, so the phone checkout is where the money is.",
            'audience', "{$x}×")];
    }

    /* ---- Channels -------------------------------------------------------- */

    private function channelStandouts(array $channels, array $kpis): array
    {
        $total     = (int) $kpis['sessions']['value'];
        $overall   = $kpis['conversionPct']['value'];
        $converted = 0;
        foreach ($channels as $c) {
            $converted += $c['converted'];
        }

        if ($total < 50 || $overall === null || $overall <= 0 || $converted < 3) {
            return [];
        }

        $out  = [];
        $best = null;

        foreach ($channels as $c) {
            if ($c['key'] === null || $c['sessions'] < 25 || $c['converted'] < 2) {
                continue;
            }
            $rate = $c['converted'] / $c['sessions'] * 100;
            if ($rate >= $overall * 1.5 && ($best === null || $rate > $best['rate'])) {
                $best = ['c' => $c, 'rate' => $rate];
            }
        }

        if ($best !== null) {
            $name  = TrafficClassifier::CHANNELS[$best['c']['key']] ?? $best['c']['key'];
            $out[] = $this->make('channel-best', 'good', "{$name} visits order most often",
                "{$this->pct($best['rate'])}% of visits from {$name} ended in an order, against {$this->pct($overall)}% across the shop.",
                'sources', "{$this->pct($best['rate'])}%");
        }

        // Paid traffic that does not convert is the one leak with a bill attached.
        foreach ($channels as $c) {
            if ($c['key'] !== 'meta_ads' || $c['sessions'] < 50) {
                continue;
            }
            $share = $c['sessions'] / $total * 100;
            $rate  = $c['converted'] / $c['sessions'] * 100;
            if ($share >= 30 && $rate < $overall * 0.5) {
                $out[] = $this->make('ads-weak', 'warn', 'Meta ads bring visits that do not order',
                    "Ads brought {$this->pct($share)}% of visits, and {$this->pct($rate)}% of them ordered against {$this->pct($overall)}% overall. Compare the ads in the Sources tab - usually one creative or audience is dragging the rest down.",
                    'sources', "{$this->pct($rate)}%");
            }
        }

        return $out;
    }

    /**
     * Cancellations and returns per channel - the cost a COD shop pays in
     * courier fees for every order that was never going to be accepted.
     */
    private function lostOrdersByChannel(array $rows): array
    {
        $totalOrders = 0;
        $totalLost   = 0;
        foreach ($rows as $r) {
            $totalOrders += $r['orders'];
            $totalLost   += $r['cancelled'] + $r['returned'] + $r['spam'];
        }

        $worst = null;
        foreach ($rows as $r) {
            if ($r['orders'] < 5) {
                continue;
            }
            $lost = $r['cancelled'] + $r['returned'] + $r['spam'];
            $rate = $lost / $r['orders'] * 100;
            if ($rate >= 30 && ($worst === null || $rate > $worst['rate'])) {
                $worst = ['r' => $r, 'rate' => $rate, 'lost' => $lost];
            }
        }

        if ($worst === null) {
            return [];
        }

        $restOrders = $totalOrders - $worst['r']['orders'];
        $restRate   = $restOrders > 0 ? ($totalLost - $worst['lost']) / $restOrders * 100 : null;
        $name       = TrafficClassifier::CHANNELS[$worst['r']['channel']] ?? $worst['r']['channel'];

        return [$this->make('lost-orders', 'bad', "{$this->pct($worst['rate'])}% of {$name} orders were cancelled or returned",
            "{$worst['lost']} of {$worst['r']['orders']} orders from {$name} never became a sale" . ($restRate !== null
                ? ", against {$this->pct($restRate)}% for every other channel."
                : '.') . ' A phone confirmation before dispatch, or an advance for delivery, protects the courier budget.',
            'sources', "{$this->pct($worst['rate'])}%")];
    }

    /* ---- Products and search --------------------------------------------- */

    private function products(array $products): array
    {
        $out = [];

        foreach ($products as $p) {
            if (in_array('oos-demand', $p['flags'], true)) {
                $out[] = $this->make('oos-' . $p['id'], 'bad', "“{$p['name']}” is out of stock and still wanted",
                    "{$p['views']} visits opened it in this period. Restock it, or hide it until it is back so the visits go to something they can buy.",
                    'products', (string) $p['views']);
                break;
            }
        }

        foreach ($products as $p) {
            if (in_array('look-not-add', $p['flags'], true)) {
                $out[] = $this->make('look-' . $p['id'], 'warn', "“{$p['name']}” is looked at, rarely added",
                    "{$p['views']} visits opened it and {$p['carts']} added it to cart. People want it enough to look - the price, the photos or the description is stopping them.",
                    'products', "{$p['viewToCartPct']}%");
                break;
            }
        }

        foreach ($products as $p) {
            if (in_array('star', $p['flags'], true)) {
                $out[] = $this->make('star-' . $p['id'], 'good', "“{$p['name']}” sells to the people who see it",
                    "{$p['viewToOrderPct']}% of the visits that opened it ordered it. It is the product to put in front of more people - in an ad, or at the top of the home page.",
                    'products', "{$p['viewToOrderPct']}%");
                break;
            }
        }

        return $out;
    }

    private function searches(array $search): array
    {
        $out = [];
        $t   = $search['totals'];

        if ($t['emptySearches'] >= 3) {
            $top = array_slice(array_map(fn (array $e): string => '“' . $e['term'] . '”', $search['empty']), 0, 3);
            $out[] = $this->make('empty-search', 'info', "{$t['emptySearches']} searches found nothing",
                'Most asked for: ' . implode(', ', $top) . '. Each is a customer telling you, in their own words, what they came to buy.',
                'search', (string) $t['emptySearches']);
        }

        if ($t['searchers'] >= 20 && $t['others'] >= 50
            && $t['othersPct'] !== null && $t['othersPct'] > 0 && $t['searchersPct'] !== null
            && $t['searchersPct'] >= $t['othersPct'] * 2) {
            $x = $this->pct($t['searchersPct'] / $t['othersPct']);
            $out[] = $this->make('searchers', 'good', "Visitors who search order {$x}× as often",
                "{$this->pct($t['searchersPct'])}% of visits that used search ended in an order, against {$this->pct($t['othersPct'])}% of those that did not. Search is worth keeping in easy reach on the phone.",
                'search', "{$x}×");
        }

        return $out;
    }

    /* ---- Timing and loyalty ---------------------------------------------- */

    private function peakHours(array $heatmap): array
    {
        $hours = array_fill(0, 24, 0);
        foreach ($heatmap['cells'] as $c) {
            $hours[$c['h']] += $c['sessions'];
        }

        $total = array_sum($hours);
        if ($total < 30) {
            return [];
        }

        $best = 0;
        $bestAt = 0;
        for ($h = 0; $h < 24; $h++) {
            $sum = $hours[$h] + $hours[($h + 1) % 24] + $hours[($h + 2) % 24];
            if ($sum > $best) {
                $best   = $sum;
                $bestAt = $h;
            }
        }

        $share = $best / $total * 100;
        if ($share < 20) {
            return [];
        }

        $window = $this->hour($bestAt) . ' and ' . $this->hour(($bestAt + 3) % 24);

        return [$this->make('peak-hours', 'info', "Visits peak between {$window}",
            "{$this->pct($share)}% of this period's visits arrived in those three hours. Post, boost and raise ad budgets before then, and have somebody ready to answer the phone.",
            'audience', $this->hour($bestAt))];
    }

    private function returning(array $types): array
    {
        $by = [];
        foreach ($types as $t) {
            if ($t['key'] !== null) {
                $by[$t['key']] = $t;
            }
        }

        $new = $by['new'] ?? null;
        $ret = $by['returning'] ?? null;

        if ($new === null || $ret === null || $new['sessions'] < 30 || $ret['sessions'] < 30 || $new['converted'] < 1) {
            return [];
        }

        $newPct = $new['converted'] / $new['sessions'] * 100;
        $retPct = $ret['converted'] / $ret['sessions'] * 100;

        if ($retPct < $newPct * 2) {
            return [];
        }

        $x = $this->pct($retPct / $newPct);

        return [$this->make('returning', 'info', "Returning visitors order {$x}× as often as new ones",
            "{$this->pct($retPct)}% against {$this->pct($newPct)}%. People buy on the second or third visit - retargeting the ones who looked and left is worth its budget.",
            'audience', "{$x}×")];
    }

    private function coverage(array $recon): array
    {
        $out = [];

        if (($recon['ordersInWindow'] ?? 0) >= 5 && $recon['coveragePct'] !== null && $recon['coveragePct'] < 80) {
            $out[] = $this->make('coverage', 'info', "{$recon['untracked']} of {$recon['ordersInWindow']} orders were never tracked",
                'No purchase event arrived for them - an ad blocker, a connection lost at the moment of ordering, or an order entered by staff. Meta did not see those sales either.',
                'checkout', "{$recon['coveragePct']}%");
        }

        if ($recon['unmatched'] >= 2) {
            $out[] = $this->make('unmatched', 'info', "{$recon['unmatched']} tracked purchases have no order behind them",
                'The pixel saw "Place order" pressed, and no order exists - a checkout that failed after the tap, or the button pressed twice. Meta counted them as sales.',
                'checkout', (string) $recon['unmatched']);
        }

        return $out;
    }

    /* ---- Wording --------------------------------------------------------- */

    /**
     * A finding. `tab` names a tab of this screen; `href` a screen elsewhere in
     * the panel - a finding the merchant cannot act on from here is half a
     * finding, and "check the access token" is two clicks away in Pixel setup.
     *
     * @return array<string, string|null>
     */
    private function make(string $id, string $tone, string $title, string $body, ?string $tab, ?string $figure, ?string $href = null): array
    {
        return compact('id', 'tone', 'title', 'body', 'tab', 'figure', 'href');
    }

    /** Whole numbers from 10 up; one decimal below, where it carries meaning. */
    private function pct(float|int $n): string
    {
        return $n >= 10 ? (string) (int) round($n) : rtrim(rtrim(number_format((float) $n, 1), '0'), '.');
    }

    private function taka(int $n): string
    {
        return '৳ ' . number_format($n);
    }

    private function hour(int $h): string
    {
        return match (true) {
            $h === 0  => 'midnight',
            $h === 12 => 'noon',
            $h < 12   => $h . ' am',
            default   => ($h - 12) . ' pm',
        };
    }
}
