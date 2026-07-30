# media

The image library. Upload once, use anywhere in the panel.

Delete this folder, remove its line from `composer.json` and
`bootstrap/providers.php`, and every screen keeps working — they load the
picker with a dynamic import and fall back to showing images without letting
you change them. The uploaded files and the `media_assets` rows stay put, the
same way removing a module does not drop its tables.

---

## What it gives you

| | |
|---|---|
| `POST /api/admin/media` | upload one image |
| `GET /api/admin/media` | the library, paged and searchable |
| `PATCH /api/admin/media/{id}` | write alt text |
| `DELETE /api/admin/media/{id}` | delete, refused while in use unless `?force=1` |
| `modules/media/library.html` | the **Images** screen in the sidebar |
| `media-picker.js` | the picker, for any screen that needs one |

All routes are staff-only, gated on the `products` capability.

## Using the picker from another screen

Declarative — this is what most screens want:

```html
<div data-media-field="image" data-label="Category image"></div>
```

```js
const media = await import('/modules/media/media-picker.js').catch(() => null);
media?.mountImageFields(form);
```

It renders a preview and a button, and keeps a hidden `<input name="image">`
in step — so `form.image.value` reads the chosen URL like any other field, and
a normal form submit carries it.

Imperative, for anything that is not a form field:

```js
const asset = await media.pickImage();   // null if dismissed
```

**Always load it with a dynamic import and a `.catch`.** A static `import`
would make your screen fail to load entirely if this module were removed, which
is the one thing the module structure exists to prevent. `tools/module-deps.py`
fails the build on a static cycle.

## Where the files go

`/uploads/YYYY/MM/<sha256>.webp` — the document root is the repo root on this
host, so Apache serves them with no PHP in the request path.

- **Content-addressed.** The filename is a hash of the original bytes, so the
  same URL always means the same pixels and the files cache for a year.
  Uploading a photo twice returns the existing row instead of a second copy.
- **Untracked by git**, except `uploads/.htaccess`. `deploy.sh` uses
  `git reset --hard`, which leaves untracked files alone, so uploads survive
  every deploy.
- **Always WebP**, longest edge 2000px, quality 82. One output format keeps the
  library predictable, and WebP is roughly a third smaller than JPEG — which is
  what a catalogue browsed on mobile data actually feels.

## Security

An upload endpoint writing into the document root is the most attackable thing
in this codebase. The layers, in order, are documented in
`backend/Services/ImageStore.php`. The load-bearing one is that **every image
is fully re-encoded through GD**: the file written is a pixel buffer, so no
EXIF, no appended PHP and no polyglot survives.

**SVG is refused.** It is an image to a person and a scriptable document to a
browser; served from our own origin that is stored XSS against the admin
session. Sanitising it properly needs a DOM-aware allowlist, and category icons
already have a separate `icon` column for inline glyphs.

`uploads/.htaccess` denies execution as a last line of defence. It is committed
so a fresh clone can never produce an uploads folder without it. **Do not
delete it.**

## Requires

- **GD** (`extension_loaded('gd')`). Uploads fail with a clear message if it is
  missing rather than falling back to a plain move, because a move without
  re-encoding is exactly the hole above.
- `modules/admin` — for the staff session, the CSRF header and the sidebar.
