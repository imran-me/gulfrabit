<?php

declare(strict_types=1);

namespace Modules\Marketing\Services;

use FilesystemIterator;
use InvalidArgumentException;
use RecursiveCallbackFilterIterator;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use RuntimeException;
use SplFileInfo;
use Throwable;

/**
 * Write the Meta pixel id into every storefront page, in place.
 *
 * WHY THE SERVER EDITS HTML AT ALL
 * --------------------------------
 * The storefront is static: tools/assemble.py builds every page, the pages are
 * committed, and Apache serves them without Laravel ever running. The pixel's
 * base code has to be IN that HTML — in <head>, before any module loads — or
 * Meta's own install checks cannot see it and early bounces are never counted
 * (the long note on meta_pixel_block() in assemble.py tells that story). So a
 * pixel id typed into the panel only reaches visitors if something rewrites
 * the pages, and the deploy has no build step to do it. This is that
 * something, run on save and again after every deploy's `git reset --hard`.
 *
 * TWO WRITERS, ONE FORMAT
 * -----------------------
 * The build writes the same block, between the same markers, from the same
 * template. block() must produce the SAME BYTES as meta_pixel_block() for the
 * same id, so that stamping the id the build already wrote is a no-op and
 * "0 pages changed" is a true statement rather than a formatting difference.
 * The contract, shared with assemble.py:
 *
 *   BEGIN + "\n" + inner + "  " + END
 *   inner = the template with __PIXEL_ID__ replaced            (pixel on)
 *         = the template's FIRST LINE with an empty id + "\n"   (pixel off)
 *
 * Change the markers or that shape in one place and not the other, and this
 * class stops finding the block it rewrites.
 *
 * FRAMEWORK-FREE ON PURPOSE
 * -------------------------
 * Nothing Laravel in here — no helpers, no facades. It is plain file work, and
 * keeping it plain means it can be run and tested with a bare PHP binary
 * against a copy of the pages, which is the only way to prove the byte-for-byte
 * promise above without a booted application.
 */
final class PixelStamp
{
    public const BEGIN = '<!-- GENERATED-PIXEL-BEGIN -->';
    public const END = '<!-- GENERATED-PIXEL-END -->';
    public const TEMPLATE = 'shared/components/meta-pixel.html';

    /** @param string $root The site root: where index.html and modules/ live. */
    public function __construct(private readonly string $root)
    {
    }

    /**
     * The whole block for one id, markers included. "" is the pixel switched
     * off, which still writes the markers and the meta line — see below.
     *
     * Throws before anything is touched when the id is not digits or the
     * template cannot be read, so a caller that gets a block back can trust it.
     */
    public function block(string $pixelId): string
    {
        // Digits or nothing. This lands inside a <script> and an attribute on
        // every storefront page, so it is the one string that must never be
        // allowed to carry anything else. `D` so a trailing newline cannot
        // slip past `$`.
        if (preg_match('/^[0-9]{0,20}$/D', $pixelId) !== 1) {
            throw new InvalidArgumentException('Not a pixel id: it must be digits only, or empty to switch the pixel off.');
        }

        $inner = str_replace('__PIXEL_ID__', $pixelId, $this->template());

        if ($pixelId === '') {
            // Switched off is NOT an empty block: the meta line saying so is
            // what stops analytics.js falling back to site-config.js and
            // loading the pixel anyway.
            $inner = explode("\n", $inner, 2)[0] . "\n";
        }

        return self::BEGIN . "\n" . $inner . '  ' . self::END;
    }

    /**
     * Every storefront page that carries the block, as absolute paths.
     *
     * Found by the marker rather than listed, so a page added to the build is
     * covered the day it ships and an admin page — which never carries the
     * block — can never be touched.
     *
     * @return list<string>
     */
    public function pages(): array
    {
        return array_keys($this->load()['pages']);
    }

    /**
     * What the pages carry right now, without changing any of them.
     *
     * `ids` maps each declared id to how many pages carry it; "" is pages with
     * the pixel switched off. More than one key means the pages disagree.
     * NOTE: PHP turns numeric-string keys into integers, so compare keys with
     * (string) — "1423900436303846" comes back as an int key.
     *
     * @return array{total: int, ids: array<string|int, int>, unknown: int}
     */
    public function survey(): array
    {
        $ids = [];
        $unknown = 0;
        $pages = $this->load()['pages'];

        foreach ($pages as $html) {
            $id = $this->declaredId($html);

            if ($id === null) {
                $unknown++;
                continue;
            }

            $ids[$id] = ($ids[$id] ?? 0) + 1;
        }

        return ['total' => count($pages), 'ids' => $ids, 'unknown' => $unknown];
    }

    /**
     * Put this id's block into every page that carries one.
     *
     * Only a page whose bytes actually change is written, so running this on
     * every deploy is cheap and the `changed` count means something. One page
     * that cannot be written is reported and skipped; it never costs the
     * others their update.
     *
     * Throws only when the block itself cannot be made — a bad id or a missing
     * template — and then before any page has been touched.
     *
     * @return array{pages: int, changed: int, failed: array<string, string>}
     */
    public function apply(string $pixelId): array
    {
        $block = $this->block($pixelId);
        $found = $this->load();

        $changed = 0;
        $failed = [];

        foreach ($found['pages'] as $path => $html) {
            try {
                $start = strpos($html, self::BEGIN);
                // END is looked for AFTER begin: an END marker earlier in the
                // page (a comment quoting it, say) must not produce a negative
                // span that eats the page.
                $end = $start === false ? false : strpos($html, self::END, $start + strlen(self::BEGIN));

                if ($start === false || $end === false) {
                    $failed[$this->relative($path)] = 'The page has the start of the pixel block but not its end, '
                        . 'so it was left alone rather than guessed at.';
                    continue;
                }

                $out = substr($html, 0, $start) . $block . substr($html, $end + strlen(self::END));

                if ($out === $html) {
                    continue;
                }

                $this->write($path, $out);
                $changed++;
            } catch (Throwable $e) {
                $failed[$this->relative($path)] = $e->getMessage();
            }
        }

        foreach ($found['unreadable'] as $path) {
            $failed[$this->relative($path)] = 'The page could not be read, so it was left as it was.';
        }

        return ['pages' => count($found['pages']), 'changed' => $changed, 'failed' => $failed];
    }

    /**
     * The template, with Windows line endings folded to \n.
     *
     * assemble.py reads it in text mode, which does exactly this, so a copy
     * checked out with CRLF must not make the two writers disagree.
     */
    private function template(): string
    {
        $path = $this->base() . '/' . self::TEMPLATE;
        $raw = is_file($path) ? @file_get_contents($path) : false;

        if ($raw === false) {
            throw new RuntimeException('The pixel template ' . self::TEMPLATE . ' is missing, so no page was changed.');
        }

        return str_replace(["\r\n", "\r"], "\n", $raw);
    }

    /**
     * Read every candidate once. Pages carrying the marker are kept with their
     * bytes; files that could not be read at all are listed separately, since
     * whether they carry the block is unknown.
     *
     * @return array{pages: array<string, string>, unreadable: list<string>}
     */
    private function load(): array
    {
        $pages = [];
        $unreadable = [];

        foreach ($this->candidates() as $path) {
            $html = @file_get_contents($path);

            if ($html === false) {
                $unreadable[] = $path;
                continue;
            }

            if (str_contains($html, self::BEGIN)) {
                $pages[$path] = $html;
            }
        }

        return ['pages' => $pages, 'unreadable' => $unreadable];
    }

    /**
     * index.html, 404.html and every *.html under modules/ — the places the
     * build writes pages. _fragments/ is pruned rather than filtered: those are
     * the build's INPUTS, and stamping one would put a second block into every
     * page built from it on the next build.
     *
     * @return list<string>
     */
    private function candidates(): array
    {
        $root = $this->base();
        $out = [];

        foreach (['index.html', '404.html'] as $top) {
            if (is_file($root . '/' . $top)) {
                $out[] = $root . '/' . $top;
            }
        }

        $modules = $root . '/modules';

        if (! is_dir($modules)) {
            return $out;
        }

        $tree = new RecursiveCallbackFilterIterator(
            new RecursiveDirectoryIterator($modules, FilesystemIterator::SKIP_DOTS),
            static fn (SplFileInfo $f): bool => $f->isDir()
                ? $f->getFilename() !== '_fragments'
                : str_ends_with($f->getFilename(), '.html'),
        );

        $found = [];

        foreach (new RecursiveIteratorIterator($tree) as $file) {
            /** @var SplFileInfo $file */
            if ($file->isFile()) {
                $found[] = $file->getPathname();
            }
        }

        // Directory order is whatever the filesystem likes; a report that lists
        // failures in a different order each run is harder to read than it
        // needs to be.
        sort($found, SORT_STRING);

        return array_merge($out, $found);
    }

    /**
     * The id a page's block declares: the meta line first — it is the one line
     * present whether the pixel is on or off — then the fbq init call for a
     * block written before the meta line existed. Null when neither says.
     */
    private function declaredId(string $html): ?string
    {
        $start = strpos($html, self::BEGIN);

        if ($start === false) {
            return null;
        }

        $end = strpos($html, self::END, $start + strlen(self::BEGIN));

        if ($end === false) {
            return null;
        }

        $inside = substr($html, $start, $end - $start);

        if (preg_match('/<meta\s+name=[\x22\x27]gr-meta-pixel[\x22\x27]\s+content=[\x22\x27]([^\x22\x27]*)[\x22\x27]/', $inside, $m) === 1) {
            return preg_match('/^[0-9]*$/D', $m[1]) === 1 ? $m[1] : null;
        }

        if (preg_match('/fbq\(\s*[\x22\x27]init[\x22\x27]\s*,\s*[\x22\x27]([0-9]+)[\x22\x27]\s*\)/', $inside, $m) === 1) {
            return $m[1];
        }

        return null;
    }

    /**
     * Replace a file without ever leaving it half-written.
     *
     * The new bytes go to a temporary file IN THE SAME FOLDER, then rename()
     * swaps it in — atomic on one filesystem, so a visitor loading the page
     * mid-write gets the old page or the new one, never a truncated one. The
     * original's permission bits are copied across first, or every stamped page
     * would quietly take on the web server's default mode.
     *
     * A page the web server may not write is refused up front. rename() would
     * replace it anyway on Linux — replacing a file depends on the folder, not
     * the file — which would silently override whoever made it read-only.
     */
    private function write(string $path, string $bytes): void
    {
        $target = realpath($path) ?: $path;   // write through a symlink, not over it
        clearstatcache(true, $target);

        if (! is_writable($target)) {
            throw new RuntimeException('The web server is not allowed to change this file, so it was left as it was.');
        }

        $perms = @fileperms($target);
        $tmp = dirname($target) . DIRECTORY_SEPARATOR . '.' . basename($target) . '.' . bin2hex(random_bytes(6)) . '.tmp';

        // 'x': create, and fail rather than reuse a file that already exists.
        $fh = @fopen($tmp, 'xb');

        if ($fh === false) {
            throw new RuntimeException('A temporary copy could not be created beside the file — its folder is not writable by the web server.');
        }

        try {
            $written = 0;
            $length = strlen($bytes);

            while ($written < $length) {
                $n = @fwrite($fh, substr($bytes, $written));

                if ($n === false || $n === 0) {
                    throw new RuntimeException('The new copy could not be written in full — is the disk full?');
                }

                $written += $n;
            }

            fflush($fh);
            fclose($fh);
            $fh = null;   // closed: Windows cannot rename a file that is still open

            if ($perms !== false) {
                @chmod($tmp, $perms & 07777);
            }

            if (! @rename($tmp, $target)) {
                throw new RuntimeException('The file could not be replaced — it may be read-only or in use.');
            }
        } catch (Throwable $e) {
            if (is_resource($fh)) {
                fclose($fh);
            }

            if (is_file($tmp)) {
                @unlink($tmp);
            }

            throw $e;
        }
    }

    /** Relative to the root, with forward slashes — what the panel shows. */
    private function relative(string $path): string
    {
        $base = $this->base();
        $rel = str_starts_with($path, $base) ? substr($path, strlen($base)) : $path;

        return ltrim(str_replace('\\', '/', $rel), '/');
    }

    private function base(): string
    {
        return rtrim($this->root, '/\\');
    }
}
