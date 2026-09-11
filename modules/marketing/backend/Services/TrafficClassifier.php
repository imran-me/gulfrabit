<?php

declare(strict_types=1);

namespace Modules\Marketing\Services;

/**
 * Where a visit came from and what it arrived on, in a shopkeeper's words.
 *
 * Every event already carries three facts the shop was throwing away: the
 * user agent, the page that sent it, and the URL it landed on. Read together
 * they answer the questions a Bangladeshi COD shop actually asks - did this
 * come from the ad or from a post, from Messenger or from Google, on a phone
 * inside the Facebook app or in Chrome?
 *
 * NOTHING HERE IDENTIFIES ANYONE.
 * The output is a handful of coarse buckets - "phone", "Android", "Facebook
 * app" - shared by millions of people. The raw user agent is read and dropped,
 * never stored: a full agent string is half of a fingerprint, and this module
 * has promised since its first migration that it keeps none.
 *
 * KEYS, NOT LABELS, ARE STORED.
 * The database holds `meta_ads`, `mobile`, `facebook`; the words live in the
 * constants below and travel to the screen with every report. Renaming a label
 * is then a one-line change rather than a migration over every row ever
 * recorded.
 */
final class TrafficClassifier
{
    /**
     * Channels, in the order the screen lists them when counts tie.
     *
     * `meta_ads` is kept apart from `facebook` on purpose. Meta appends fbclid
     * to every outbound link, organic posts included, so fbclid proves the
     * click came from Meta but not that anyone paid for it. Only the shop's own
     * utm tags - which every ad it runs carries - say "this was an ad".
     */
    public const CHANNELS = [
        'meta_ads'   => 'Meta ads',
        'facebook'   => 'Facebook',
        'instagram'  => 'Instagram',
        'messenger'  => 'Messenger',
        'whatsapp'   => 'WhatsApp',
        'google_ads' => 'Google ads',
        'google'     => 'Google search',
        'youtube'    => 'YouTube',
        'tiktok'     => 'TikTok',
        'search'     => 'Other search engines',
        'social'     => 'Other social apps',
        'email'      => 'Email',
        'sms'        => 'SMS',
        'campaign'   => 'Other tagged links',
        'referral'   => 'Other websites',
        'direct'     => 'Direct',
    ];

    public const DEVICES = [
        'mobile'  => 'Phone',
        'tablet'  => 'Tablet',
        'desktop' => 'Computer',
    ];

    public const OS = [
        'android'  => 'Android',
        'ios'      => 'iPhone / iPad',
        'windows'  => 'Windows',
        'macos'    => 'Mac',
        'linux'    => 'Linux',
        'chromeos' => 'ChromeOS',
        'kaios'    => 'KaiOS',
        'other'    => 'Other',
    ];

    public const BROWSERS = [
        'facebook'  => 'Facebook app',
        'messenger' => 'Messenger',
        'instagram' => 'Instagram app',
        'tiktok'    => 'TikTok app',
        'chrome'    => 'Chrome',
        'safari'    => 'Safari',
        'samsung'   => 'Samsung Internet',
        'mi'        => 'Mi Browser',
        'uc'        => 'UC Browser',
        'opera'     => 'Opera',
        'edge'      => 'Edge',
        'firefox'   => 'Firefox',
        'other'     => 'Other',
    ];

    /**
     * Browsers that are really an app's built-in web view.
     *
     * The single most useful fact about this shop's traffic: a checkout that
     * works in Chrome can still fail inside Facebook's in-app browser, which
     * blocks some cookies, loses logins between visits and opens every
     * external link on top of the shop.
     */
    public const IN_APP = ['facebook', 'messenger', 'instagram', 'tiktok'];

    /** utm_medium values that mean money changed hands for the click. */
    private const PAID_MEDIUMS = [
        'cpc', 'ppc', 'cpm', 'cpv', 'paid', 'paidsocial', 'paid_social', 'paid-social',
        'social_paid', 'social-paid', 'ads', 'ad', 'display', 'sponsored', 'boost', 'boosted',
    ];

    /** utm_source values that belong to Meta's family of apps. */
    private const META_SOURCES = [
        'facebook', 'fb', 'meta', 'instagram', 'ig', 'messenger', 'msg', 'an',
        'audience_network', 'facebook_ads', 'fb_ads', 'meta_ads', 'facebook.com', 'm.facebook.com',
    ];

    /**
     * Referring sites, by the registrable domain a host ends with.
     *
     * Android apps that open a link send `android-app://<package>` as the
     * referrer, which parses to the package name as a host - so Gmail,
     * Messenger and WhatsApp on Android are recognisable even though none of
     * them is a website.
     */
    private const HOSTS = [
        'facebook'   => ['facebook.com', 'fb.com', 'fb.me', 'fb.watch', 'facebook.net', 'com.facebook.katana', 'com.facebook.lite'],
        'instagram'  => ['instagram.com', 'com.instagram.android'],
        'messenger'  => ['messenger.com', 'm.me', 'com.facebook.orca', 'com.facebook.mlite'],
        'whatsapp'   => ['whatsapp.com', 'wa.me', 'whatsapp.net', 'com.whatsapp', 'com.whatsapp.w4b'],
        'youtube'    => ['youtube.com', 'youtu.be', 'com.google.android.youtube'],
        'tiktok'     => ['tiktok.com', 'com.zhiliaoapp.musically', 'com.ss.android.ugc.trill'],
        'google_ads' => ['googleadservices.com', 'googlesyndication.com', 'doubleclick.net'],
        'email'      => ['com.google.android.gm', 'mail.google.com', 'outlook.live.com', 'mail.yahoo.com'],
        'google'     => ['com.google.android.googlequicksearchbox'],
        'search'     => ['bing.com', 'yahoo.com', 'duckduckgo.com', 'yandex.com', 'yandex.ru', 'baidu.com', 'ecosia.org', 'search.brave.com', 'ask.com', 'naver.com'],
        'social'     => ['t.co', 'twitter.com', 'x.com', 'linkedin.com', 'lnkd.in', 'pinterest.com', 'reddit.com', 'threads.net', 'snapchat.com', 'quora.com', 't.me', 'telegram.org', 'org.telegram.messenger', 'imo.im', 'com.imo.android.imoim'],
    ];

    /* ---- Device ---------------------------------------------------------- */

    public function device(string $agent): ?string
    {
        if ($agent === '') {
            return null;
        }

        if (preg_match('/iPad|Tablet|PlayBook|Silk\/|Kindle|SM-T\d|Nexus (7|9|10)\b/i', $agent)) {
            return 'tablet';
        }

        // Phones before the Android rule below: Opera Mini and KaiOS feature
        // phones name Android without saying "Mobile", and are phones.
        if (preg_match('/Mobi|iPhone|iPod|Windows Phone|IEMobile|Opera Mini|BlackBerry|KaiOS/i', $agent)) {
            return 'mobile';
        }

        // Android phones say "Mobile" and were caught above; an Android agent
        // that does not is a tablet.
        if (stripos($agent, 'Android') !== false) {
            return 'tablet';
        }

        return 'desktop';
    }

    public function os(string $agent): ?string
    {
        return match (true) {
            $agent === ''                                           => null,
            // KaiOS agents also say "Android", so it is asked first.
            stripos($agent, 'KaiOS') !== false                      => 'kaios',
            stripos($agent, 'Android') !== false                    => 'android',
            (bool) preg_match('/iPhone|iPad|iPod|CPU OS/i', $agent) => 'ios',
            stripos($agent, 'Windows') !== false                    => 'windows',
            stripos($agent, 'CrOS') !== false                       => 'chromeos',
            (bool) preg_match('/Macintosh|Mac OS X/i', $agent)      => 'macos',
            (bool) preg_match('/Linux|X11/i', $agent)               => 'linux',
            default                                                 => 'other',
        };
    }

    /**
     * The browser, or the app whose built-in browser this is.
     *
     * ORDER IS THE LOGIC. Messenger's agent also contains FBAN, every Chromium
     * browser also says "Chrome", and nearly all of them say "Safari" - so the
     * specific checks run first and the generic ones catch what is left.
     */
    public function browser(string $agent): ?string
    {
        if ($agent === '') {
            return null;
        }

        $rules = [
            'messenger' => '/FB_IAB\/MESSENGER|MessengerForiOS|MessengerLite|FBAN\/Messenger|Orca-Android/i',
            'facebook'  => '/FBAN|FBAV|FB_IAB|FB4A|FBIOS/i',
            'instagram' => '/Instagram/i',
            'tiktok'    => '/musical_ly|BytedanceWebview|TikTok|trill_/i',
            'samsung'   => '/SamsungBrowser/i',
            'mi'        => '/MiuiBrowser/i',
            'uc'        => '/UCBrowser|UCWEB|UBrowser/i',
            'opera'     => '/OPR\/|Opera|OPiOS|OPT\//i',
            'edge'      => '/Edg\/|EdgA\/|EdgiOS\/|Edge\//i',
            'firefox'   => '/Firefox|FxiOS/i',
            'chrome'    => '/Chrome|CriOS/i',
            'safari'    => '/Safari/i',
        ];

        foreach ($rules as $key => $pattern) {
            if (preg_match($pattern, $agent)) {
                return $key;
            }
        }

        return 'other';
    }

    /* ---- Channel --------------------------------------------------------- */

    /**
     * Which channel a visit arrived through, read from its FIRST event.
     *
     * The caller decides that it is the first event; this only weighs the
     * evidence, strongest first:
     *
     *   1. an ad platform's own click id - gclid, ttclid - which survives even
     *      when somebody forgot the utm tags;
     *   2. utm tags, which are the advertiser's own words;
     *   3. fbclid alone, which proves Meta but not payment;
     *   4. the referring site;
     *   5. with no referrer at all, the in-app browser the link opened in.
     *      Facebook, Messenger and Instagram often strip the referrer, so
     *      without this step most of this shop's social traffic would be
     *      filed as "Direct" - which is exactly where other tools file it.
     */
    public function channel(?string $url, ?string $referrer, string $agent, string $ownHost): string
    {
        $q = $this->query($url);

        if (isset($q['gclid']) || isset($q['gbraid']) || isset($q['wbraid'])) {
            return 'google_ads';
        }
        if (isset($q['ttclid'])) {
            return 'tiktok';
        }

        $source = strtolower(trim($q['utm_source'] ?? ''));
        $medium = strtolower(trim($q['utm_medium'] ?? ''));

        if ($source !== '' || $medium !== '') {
            return $this->fromUtm($source, $medium, trim($q['utm_campaign'] ?? ''), $referrer, $agent);
        }

        $refHost = $this->host($referrer);

        if (isset($q['fbclid'])) {
            return $this->metaFamily($refHost, $agent);
        }

        if ($refHost !== null && ! $this->sameSite($refHost, $ownHost)) {
            return $this->fromHost($refHost, $agent);
        }

        return $this->inApp($agent) ?? 'direct';
    }

    /** A URL's host, lower-cased and without "www.", or null. */
    public function host(?string $url): ?string
    {
        if ($url === null || $url === '') {
            return null;
        }

        $host = parse_url($url, PHP_URL_HOST);
        if (! is_string($host) || $host === '') {
            return null;
        }

        $host = strtolower($host);

        return str_starts_with($host, 'www.') ? substr($host, 4) : $host;
    }

    /** Whether a host is this shop - gulfrabit.com and www.gulfrabit.com both are. */
    public function sameSite(string $host, string $ownHost): bool
    {
        $own = strtolower($ownHost);
        $own = str_starts_with($own, 'www.') ? substr($own, 4) : $own;

        return $own !== '' && ($host === $own || str_ends_with($host, '.' . $own));
    }

    private function fromUtm(string $source, string $medium, string $campaign, ?string $referrer, string $agent): string
    {
        $paid = in_array($medium, self::PAID_MEDIUMS, true)
            || str_contains($medium, 'paid')
            || str_contains($medium, 'cpc');

        $isMeta = in_array($source, self::META_SOURCES, true)
            || str_contains($source, 'facebook')
            || str_contains($source, 'instagram');

        if ($isMeta) {
            // Every Meta ad this shop runs is tagged with a campaign; a post
            // shared by hand almost never is. That is the line between the two.
            if ($paid || $campaign !== '') {
                return 'meta_ads';
            }

            if ($source === 'ig' || str_contains($source, 'instagram')) {
                return 'instagram';
            }
            if ($source === 'messenger' || $source === 'msg') {
                return 'messenger';
            }

            return $this->metaFamily($this->host($referrer), $agent);
        }

        return match (true) {
            str_contains($source, 'google')                         => $paid ? 'google_ads' : 'google',
            str_contains($source, 'youtube')                        => 'youtube',
            str_contains($source, 'tiktok')                         => 'tiktok',
            str_contains($source, 'whatsapp') || $source === 'wa'   => 'whatsapp',
            $medium === 'email' || str_contains($source, 'mail')
                || str_contains($source, 'newsletter')              => 'email',
            $medium === 'sms' || $source === 'sms'                  => 'sms',
            default                                                 => 'campaign',
        };
    }

    private function fromHost(string $host, string $agent): string
    {
        // The named list runs FIRST. Gmail's Android referrer is
        // com.google.android.gm and YouTube's is com.google.android.youtube -
        // both would satisfy the google-dot pattern below and be filed as
        // search traffic.
        foreach (self::HOSTS as $channel => $domains) {
            foreach ($domains as $domain) {
                if ($host === $domain || str_ends_with($host, '.' . $domain)) {
                    return $channel === 'facebook' ? $this->metaFamily($host, $agent) : $channel;
                }
            }
        }

        // google.com, google.com.bd, google.co.uk - every national domain.
        if (preg_match('/(^|\.)google\.[a-z.]+$/', $host)) {
            return 'google';
        }

        return 'referral';
    }

    /** Facebook, Instagram or Messenger, when all we know is "Meta". */
    private function metaFamily(?string $host, string $agent): string
    {
        if (($host !== null && str_contains($host, 'instagram')) || stripos($agent, 'Instagram') !== false) {
            return 'instagram';
        }

        if ($this->inApp($agent) === 'messenger'
            || ($host !== null && ($host === 'm.me' || str_contains($host, 'messenger')))) {
            return 'messenger';
        }

        return 'facebook';
    }

    /** The channel an in-app browser implies, or null for an ordinary browser. */
    private function inApp(string $agent): ?string
    {
        $browser = $this->browser($agent);

        return in_array($browser, self::IN_APP, true) ? $browser : null;
    }

    /** @return array<string, string> */
    private function query(?string $url): array
    {
        if ($url === null || $url === '') {
            return [];
        }

        $query = parse_url($url, PHP_URL_QUERY);
        if (! is_string($query) || $query === '') {
            return [];
        }

        parse_str($query, $params);

        $out = [];
        foreach ($params as $key => $value) {
            if (is_string($value)) {
                $out[strtolower((string) $key)] = $value;
            }
        }

        return $out;
    }
}
