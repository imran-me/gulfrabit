# media

The image library. Upload once, file it, use anywhere in the panel.

Delete this folder, remove its line from `composer.json` and
`bootstrap/providers.php`, and every screen keeps working — they load the
picker with a dynamic import and fall back to showing images without letting
you change them. The uploaded files and the `media_assets` rows stay put, the
same way removing a module does not drop its tables.

---

## What it gives you

| | |
|---|---|
| `POST /api/admin/media` | upload one image, optionally into a folder |
| `GET /api/admin/media` | the library, paged, searchable, folder-scoped |
| `PATCH /api/admin/media/{id}` | write alt text, or refile one image |
| `POST /api/admin/media/move` | refile a selection in one request |
| `DELETE /api/admin/media/{id}` | delete, refused while in use unless `?force=1` |
| `GET /api/admin/media/folders` | the whole tree, with counts |
| `POST /api/admin/media/folders` | create |
| `PATCH /api/admin/media/folders/{id}` | rename, move, or both |
| `DELETE /api/admin/media/folders/{id}` | delete, refused while occupied unless `?force=1` |
| `POST /api/admin/media/delete-many` | delete a selection; in-use images are skipped and reported |
| `modules/media/library.html` | the **Images** screen — the file manager |
| `media-picker.js` | the picker, for any screen that needs one |
| `folders.js` | the tree, and the dialogs that edit it |
| `uploader.js` | the upload itself, shared by both screens |
| `image-drawer.js` | one image, up close |
| `toast.js` | what just happened, and Undo |

All routes are staff-only, gated on the `products` capability.

`GET /api/admin/media` takes `folder=all` (the default, and what every caller
written before folders got), `folder=root` for the top level, or `folder=<id>`
— add `deep=1` to include that folder's subfolders. The default is `all` on
purpose: a screen that never heard of folders keeps seeing the whole library
rather than silently narrowing to the top level.

## Folders

**A folder is metadata, not a directory.** The files stay exactly where
`ImageStore` puts them, and an image carries a `folder_id`. Everything good
about this feature follows from that one decision:

- **No URL ever changes.** Every consumer stores a plain path string. If
  reorganising rewrote paths, tidying the library on a Tuesday would blank out
  pictures on the live shop, and the person who tidied would never connect the
  two.
- **Moving 400 photos is one `UPDATE`**, not 400 file moves that time out
  halfway through on a shared host and leave a state nobody can describe.
- **Deduplication still works.** One photo is one file, however many folders
  someone would like to file it under.

`media_folders` carries `parent_id` — the truth — plus `path` and `depth`,
which are the same fact cached. That is what makes "everything under this
folder" and "is this move a cycle?" one indexed `LIKE` each instead of a
recursive walk per screen paint. The price is that a move must rewrite its
subtree, so **only `FolderTree` may write those three columns.** A move that
updates a row but not its subtree leaves a folder that quietly stops showing
its own images, weeks later, for someone who did not make the move.

Six levels deep, maximum (`MediaFolder::MAX_DEPTH`). Past that a merchant
cannot hold the tree in their head and the sidebar has run out of indent.

**Deleting a folder never deletes an image.** It is refused while the folder
holds anything, and forcing it moves the contents up to the parent. A folder is
filing; an image is a picture on a live shop, and conflating the two is how a
catalogue is lost by tidying up.

Folders carry an optional **colour** — a token from `MediaFolder::COLORS`, never
a hex, because a free colour picker lets someone choose white on white. CSS
resolves it: `data-c="amber"` on any element tints the folder icon inside it,
so the tree, the tiles, the destination picker and the "filed under" chip all
follow without knowing what amber is.

## The three rules the Images screen is built on

Worth knowing before changing anything on that screen, because most of its code
exists to keep one of them true.

1. **Every gesture has a plain twin.** Drag onto a folder, or press "Move to
   folder…". Shift-click a range, or tick the boxes. A drag is hard on a touch
   screen and impossible from a keyboard, so it is always the fast path and
   never the only path. Adding a drag-only action is the one change this screen
   will not accept.

2. **Reversible things do not ask; irreversible things do.** Filing is
   high-volume and low-stakes — a merchant moves forty pictures and gets one
   wrong. Confirming all forty to catch the one taxes every correct action, and
   taxed confirmations get clicked through without reading. So a move offers
   Undo, and Undo returns each image to the folder it individually came from.
   Deleting a file has nothing to undo it with, so that one asks, every time.

3. **The panel says what it did.** Every write raises a toast. On a grid of two
   hundred the only other feedback is a thumbnail quietly appearing or
   vanishing somewhere off screen.

Keyboard: `/` focuses search, `Ctrl/⌘+A` selects everything loaded, `Esc` drops
the selection, `Delete` deletes it (after asking). With the drawer open, `←` and
`→` walk the folder and load the next page when they reach the end.

## Uploading

`uploader.js` owns it, and both screens call it. Two copies would have drifted
the day one learned about folders and the other did not — a bug that reads as
"uploads from the picker file correctly, uploads from the library do not" and
reproduces for nobody.

Files dropped on the Images screen upload into the folder they were dropped on,
or into the folder currently open. There is also a document-level
`preventDefault` for file drags: without it, a near-miss makes the browser
navigate to the dropped JPEG, the panel disappears, and the merchant has no
idea what they did.

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
const asset = await media.pickImage();                  // null if dismissed
const asset = await media.pickImage({ folderId: 12 });  // opens in that folder
```

`folderId` decides where the sheet opens **and** where anything uploaded from
it lands. A product screen passes nothing and browses the whole library; the
Images screen passes the folder the merchant is standing in, so uploading while
inside "Ramadan 2026" files them there instead of dumping them at the top level
to be sorted later.

**Always load it with a dynamic import and a `.catch`.** A static `import`
would make your screen fail to load entirely if this module were removed, which
is the one thing the module structure exists to prevent. `tools/module-deps.py`
fails the build on a static cycle.

## Where the files go

`/uploads/YYYY/MM/<sha256>.webp` — the document root is the repo root on this
host, so Apache serves them with no PHP in the request path. **Folders do not
appear in this path and must not**; see above.

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
