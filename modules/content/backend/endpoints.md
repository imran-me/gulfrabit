# Content · API contract

Owned by `modules/content` — About, Contact, FAQ, Shipping & Returns, 404.

## This module has no backend today, deliberately

These are **static pages**. The copy lives in `_fragments/*.main.html`, is built
by `tools/assemble.py`, and is served as HTML. There is nothing to query.

The one exception worth naming: the **refund matrix** and **delivery zone table**
on Shipping & Returns are currently hand-written HTML that duplicates figures
owned by `modules/delivery` and `modules/cart`. They are correct today because
they were written together, and they will drift the first time a rate changes.

> **The fix when it matters:** render those two tables from
> `GET /api/delivery/options` rather than maintaining them by hand. Recorded here
> rather than done now, because a static page that is right is better than an
> API call that is not needed yet — but it *is* a known duplication.

## When this module would grow a backend

Shajgoj's strongest engineering asset is a widget-based page CMS: every homepage
section is a row of `{widget_name, content, order, is_active}`, so merchandisers
reorder pages without a deploy. If editable content becomes a requirement, that
is the shape to build — and it would live here.

Contact form submissions would also belong here, with the same rules as
everything else: validation in a FormRequest, rate limiting, and no trust in
anything the client sends.
