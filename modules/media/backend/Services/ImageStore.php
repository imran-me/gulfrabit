<?php

declare(strict_types=1);

namespace Modules\Media\Services;

use Illuminate\Http\UploadedFile;
use RuntimeException;

/**
 * Takes an uploaded file and puts a safe, web-sized image on disk.
 *
 * THE THREAT, stated plainly, because an upload endpoint on the document root
 * is the single most attackable thing in this codebase:
 *
 *  1. A file that is a valid image AND valid PHP (a "polyglot"). Apache is
 *     configured to execute .php anywhere, so a shell uploaded as image.php —
 *     or as image.jpg on a server that guesses types — is remote code
 *     execution.
 *  2. SVG. It is an image to a user and a document with <script> to a browser.
 *     Served from our own origin it is stored XSS against the admin session.
 *  3. A 6000×8000 phone photo that exhausts memory on decode, or a "zip bomb"
 *     equivalent: small file, enormous pixel dimensions.
 *
 * THE ANSWER, in layers, because any one of them can be wrong:
 *
 *  - Extension and MIME whitelist (raster only; SVG is REFUSED, see below).
 *  - getimagesize() must agree it is one of those types. This reads the actual
 *    header, not the client's claim.
 *  - Pixel budget checked BEFORE decoding, so a decompression bomb is rejected
 *    while it is still bytes.
 *  - **Full re-encode through GD.** This is the load-bearing one. The output
 *    is written from a pixel buffer, so nothing that was not a pixel survives:
 *    no EXIF, no trailing PHP, no polyglot. A shell cannot round-trip through
 *    imagecreatefromjpeg().
 *  - The filename we write is derived from a hash. The client's filename is
 *    recorded for display and never touches the filesystem.
 *  - modules/media/uploads/.htaccess denies execution as a last line, for the
 *    case where every check above has a hole.
 *
 * WHY SVG IS REFUSED rather than sanitised: sanitising SVG properly means a
 * DOM-aware allowlist of elements, attributes and URL schemes, and the failure
 * mode of getting it subtly wrong is admin session theft. There is no
 * dependency-free way to do it well, and category icons — the one place SVG
 * would help — already have a separate `icon` column for inline glyphs.
 */
class ImageStore
{
    /** Extension => the getimagesize() constant that must confirm it. */
    private const ALLOWED = [
        'jpg'  => IMAGETYPE_JPEG,
        'jpeg' => IMAGETYPE_JPEG,
        'png'  => IMAGETYPE_PNG,
        'webp' => IMAGETYPE_WEBP,
        'gif'  => IMAGETYPE_GIF,
    ];

    /** Longest edge of the stored image, in pixels. */
    private const MAX_EDGE = 2000;

    /**
     * Refuse anything whose declared dimensions exceed this, before decoding.
     * 50 megapixels is far beyond any product photo and still leaves room for
     * a modern phone camera held wrong.
     */
    private const MAX_PIXELS = 50_000_000;

    private const QUALITY = 82;

    /**
     * @return array{path: string, mime: string, bytes: int, width: int, height: int}
     */
    public function store(UploadedFile $file, string $hash): array
    {
        $ext = strtolower($file->getClientOriginalExtension());

        if (! isset(self::ALLOWED[$ext])) {
            throw new RuntimeException(
                'That file type is not allowed. Use JPG, PNG, WebP or GIF.'
            );
        }

        // The real type, read from the file's own header. A .jpg containing a
        // PHP script fails here, because getimagesize() returns false for it.
        $probe = @getimagesize($file->getRealPath());

        if ($probe === false || $probe[2] !== self::ALLOWED[$ext]) {
            throw new RuntimeException(
                'That file is not the image it claims to be. Re-save it and try again.'
            );
        }

        [$width, $height] = $probe;

        if ($width * $height > self::MAX_PIXELS) {
            throw new RuntimeException(
                'That image is too large to process. Resize it below 50 megapixels.'
            );
        }

        if (! extension_loaded('gd')) {
            // Deliberately fatal rather than falling back to move(). A move
            // without re-encode is exactly the hole this class exists to close,
            // and a silent downgrade to the unsafe path is worse than an
            // outage the host can fix in one click.
            throw new RuntimeException(
                'Image uploads need the GD extension, which is not enabled on this server.'
            );
        }

        $source = $this->decode($file->getRealPath(), $probe[2]);

        try {
            $resized = $this->fit($source, $width, $height);

            $relative = $this->relativePath($hash);
            $absolute = $this->absolutePath($relative);

            if (! is_dir(dirname($absolute))) {
                mkdir(dirname($absolute), 0755, true);
            }

            $this->encode($resized, $absolute);

            $out = [
                'path'   => $relative,
                'mime'   => 'image/webp',
                'bytes'  => (int) filesize($absolute),
                'width'  => imagesx($resized),
                'height' => imagesy($resized),
            ];

            if ($resized !== $source) {
                imagedestroy($resized);
            }

            return $out;
        } finally {
            imagedestroy($source);
        }
    }

    public function delete(string $relativePath): void
    {
        $absolute = $this->absolutePath($relativePath);

        // Refuse to unlink anything that resolved outside the uploads folder.
        // The path comes from our own table, but a traversal bug upstream
        // would otherwise turn "delete an image" into "delete any file".
        $root = realpath($this->root());
        $real = realpath($absolute);

        if ($root === false || $real === false || ! str_starts_with($real, $root)) {
            return;
        }

        @unlink($real);
    }

    /** A GD image from a file, by the type getimagesize() confirmed. */
    private function decode(string $path, int $type): \GdImage
    {
        $image = match ($type) {
            IMAGETYPE_JPEG => @imagecreatefromjpeg($path),
            IMAGETYPE_PNG  => @imagecreatefrompng($path),
            IMAGETYPE_WEBP => @imagecreatefromwebp($path),
            IMAGETYPE_GIF  => @imagecreatefromgif($path),
            default        => false,
        };

        if ($image === false) {
            throw new RuntimeException('That image could not be read. It may be damaged.');
        }

        return $image;
    }

    /** Downscale to MAX_EDGE, preserving aspect ratio. Never upscales. */
    private function fit(\GdImage $source, int $width, int $height): \GdImage
    {
        $longest = max($width, $height);

        if ($longest <= self::MAX_EDGE) {
            return $source;
        }

        $scale = self::MAX_EDGE / $longest;
        $w = max(1, (int) round($width * $scale));
        $h = max(1, (int) round($height * $scale));

        $target = imagecreatetruecolor($w, $h);

        // Keep transparency: without these two calls a PNG logo comes back
        // with a black box behind it, which looks like a broken upload.
        imagealphablending($target, false);
        imagesavealpha($target, true);

        imagecopyresampled($target, $source, 0, 0, 0, 0, $w, $h, $width, $height);

        return $target;
    }

    /**
     * Everything is stored as WebP.
     *
     * One output format keeps the library predictable, and WebP is roughly a
     * third smaller than JPEG at the same quality. On a catalogue browsed
     * almost entirely over mobile data in Bangladesh that is the difference
     * users actually feel. Support is universal in browsers from 2020 onward.
     */
    private function encode(\GdImage $image, string $absolute): void
    {
        imagepalettetotruecolor($image);
        imagealphablending($image, true);
        imagesavealpha($image, true);

        if (! imagewebp($image, $absolute, self::QUALITY)) {
            throw new RuntimeException('The image could not be saved. Try again.');
        }

        chmod($absolute, 0644);
    }

    /**
     * /uploads/YYYY/MM/<hash>.webp
     *
     * Dated folders keep any single directory small — a few thousand files in
     * one folder makes both the filesystem and File Manager slow. The hash as
     * the filename means the path is content-addressed: the same image always
     * lands in the same place, and a stale URL can never point at a different
     * picture than it did before.
     */
    private function relativePath(string $hash): string
    {
        return sprintf('/uploads/%s/%s.webp', date('Y/m'), $hash);
    }

    private function absolutePath(string $relativePath): string
    {
        return $this->root() . str_replace('/uploads', '', $relativePath);
    }

    /**
     * The document root IS the repo root here (see .htaccess), so /uploads is
     * served straight by Apache with no PHP in the request path.
     */
    private function root(): string
    {
        return base_path('uploads');
    }
}
