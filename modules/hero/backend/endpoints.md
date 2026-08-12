# Hero — HTTP contract

One public read for the storefront. Everything else sits behind `admin` +
`admin:content` — arranging banners is merchandising, the same capability that
edits page copy, and deliberately not one that reaches money or customers.

---

## `GET /api/hero`

Public, cacheable (60s), and never a reason the home page fails.

```json
{ "data": [
    { "id": 3, "image": "/uploads/2026/08/ramadan.jpg",
      "alt": "Ramadan dates gift box", "headline": null, "subheadline": null,
      "href": "/product/gr-1101" }
  ],
  "meta": {
    "ready": true,
    "settings": { "intervalMs": 6000, "transition": "fade", "transitionMs": 600,
                  "easing": "ease-in-out", "kenBurns": false, "autoplay": true }
  } }
```

**Slides and settings arrive together** because the page cannot start without
both — the dot that fills while a slide is held is animated from `intervalMs`,
and a second round trip for that number would leave the first slide either
frozen or running at the wrong speed.

`href` is **built server-side** from `link_type` + `link_value`, and is `null`
for a banner that is not a link. The page renders those as a plain picture: an
`<a>` with no href is not a link, and one with `href="#"` is a link that lies.

`ready` is false when there are no live banners **and** when the table does not
exist yet — the window between a deploy landing and its migration running. Both
mean the same thing to the storefront: keep the banners authored into
`index.html`. That is why this endpoint answers 200 with an empty list rather
than erroring.

Only slides that are active **and** inside their schedule are returned.

---

## `GET /api/admin/hero`

Every slide, live or not, in panel order, plus the movement settings.

Adds to each row: `linkType`, `linkValue`, `sortOrder`, `isActive`, `startsAt`,
`endsAt`, `updatedBy`, `updatedAt`. The panel edits the link *parts* and shows
the finished `href` beneath each row, so somebody can see where a banner points
without saving to find out.

## `POST /api/admin/hero`

```json
{ "imagePath": "/uploads/…", "alt": "Ramadan dates gift box",
  "linkType": "product", "linkValue": "gr-1101", "isActive": false }
```

`alt` is **required**, not optional. A hero is the loudest thing on the page and
a screen reader gets nothing at all from it without one.

New slides are appended, never inserted first. A banner created to work on
later must not become the front page because of where it landed in the list.

**201** → the slide.

## `PATCH /api/admin/hero/{slide}`

Same shape, all fields optional — except that `linkType` and `linkValue` are
treated as a pair. Sending one without the other is how a slide ends up saying
"product" with a category slug attached, so the panel always sends both.

Setting `linkType: "none"` clears `link_value`, so a slide switched away from a
product cannot keep a stale id that reappears if it is switched back.

**422** → validation. The one worth knowing:

> A custom link must be a path on this site, starting with "/".

Refused: any absolute URL, `//evil.com` (protocol-relative), and anything with
a scheme before the first slash (`javascript:`). See the README for why this is
a security rule and not a tidiness one.

## `DELETE /api/admin/hero/{slide}`

A real delete. A banner is artwork with no history hanging off it — no order
refers to one — so a soft-deleted pile of last year's campaigns would be
clutter pretending to be caution. The panel offers "switch off" for anything
worth keeping, and says so in the confirmation.

**204**.

## `POST /api/admin/hero/order`

```json
{ "ids": [7, 3, 9] }
```

The **whole** running order, because that is what a drag produces: moving one
banner changes the position of every banner after it. Sending them one at a
time leaves the list briefly holding two slides that both think they are third.

## `PATCH /api/admin/hero/settings`

```json
{ "intervalMs": 8000, "transition": "zoom", "transitionMs": 600,
  "easing": "spring", "kenBurns": true, "autoplay": true }
```

Bounds are enforced here, not only in the panel, where a number input is a
suggestion: **2–30 seconds** for the interval — below two it is unreadable,
above thirty nobody ever sees the second banner — and **0–2000ms** for the
transition.

`transition` and `easing` are whitelists because both values reach a
stylesheet. A free-text field that lands in CSS is a field worth validating out
of existence.
