/**
 * reviews-panel.js — the reviews section on a product page.
 *
 * WHAT IT REPLACED. The product page used to keep "reviews" in localStorage:
 * anyone could type any name, the review was visible only to the browser that
 * wrote it, and a hardcoded "Verified buyer — exactly as described" was seeded
 * underneath so the section never looked empty. None of it was real, and the
 * star rating printed above it came from a number in a fixture.
 *
 * Now every review here was written by a signed-in customer whose delivered
 * order contained this product, and read by the merchant before it appeared.
 *
 * WHY THE SECTION STILL DRAWS WHEN THE API IS DOWN. It renders the summary
 * from what the product payload already carries and says the list could not be
 * loaded. A shop that will not show its product page because the review
 * endpoint is unhappy is a shop that cannot take an order.
 */

const STARS = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);

/**
 * @param {HTMLElement} host   the [data-pdp-reviews] container
 * @param {object} product     needs { slug, rating, reviewCount }
 */
export async function mountReviews(host, product) {
  if (!host || !product?.slug) return;

  host.innerHTML = '<p class="text-muted-gr">Loading reviews…</p>';

  const [list, eligibility] = await Promise.all([
    fetchJSON(`/api/catalog/products/${encodeURIComponent(product.slug)}/reviews`),
    fetchJSON(`/api/reviews/eligibility/${encodeURIComponent(product.slug)}`),
  ]);

  const state = {
    slug: product.slug,
    items: list?.data ?? [],
    meta: list?.meta ?? null,
    page: list?.meta?.page ?? 1,
    can: eligibility?.data ?? null,
    offline: !list,
  };

  paint(host, state, product);
}

/* ------------------------------------------------------------------ *
 * Painting
 * ------------------------------------------------------------------ */

function paint(host, state, product) {
  host.innerHTML = `
    ${summary(state, product)}
    ${state.offline
      ? '<p class="text-muted-gr">Reviews could not be loaded just now.</p>'
      : `<div class="stack-4" style="margin-top:1.5rem" data-rv-list>${
          state.items.length
            ? state.items.map(card).join('')
            : '<p class="text-muted-gr">No reviews yet. If you have bought this, yours would be the first.</p>'
        }</div>
        ${state.meta && state.page < state.meta.pages
          ? '<div style="margin-top:1rem"><button class="btn-gr btn-outline-gr btn-sm-gr" type="button" data-rv-more>Show more reviews</button></div>'
          : ''}`}
    ${writeArea(state)}`;

  host.querySelector('[data-rv-more]')?.addEventListener('click', (e) => more(host, state, product, e.target));

  const form = host.querySelector('[data-rv-form]');
  if (form) wireForm(host, state, product, form);
}

/**
 * The average, and the shape behind it.
 *
 * The five bars are the point. "4.6" alone cannot be told apart from "4.6 from
 * three friends and one complaint"; the spread is what lets a shopper judge
 * whether the number is worth anything.
 */
function summary(state, product) {
  const total = state.meta?.total ?? product.reviewCount ?? 0;
  const avg = state.meta?.average ?? product.rating ?? 0;

  if (!total) {
    return '<p class="text-muted-gr">This product has no reviews yet.</p>';
  }

  const spread = state.meta?.spread ?? null;

  const bars = spread
    ? `<div class="rv-spread" aria-hidden="true">${[5, 4, 3, 2, 1].map((star) => {
        const n = spread[star] ?? 0;
        const pct = total ? Math.round((n / total) * 100) : 0;
        return `<div class="rv-spread__row">
                  <span class="rv-spread__star">${star}★</span>
                  <span class="rv-spread__track"><i style="width:${pct}%"></i></span>
                  <span class="rv-spread__n">${n}</span>
                </div>`;
      }).join('')}</div>`
    : '';

  return `
    <div class="review-summary">
      <span class="review-summary__avg">${Number(avg).toFixed(1)}</span>
      <span>
        <span class="review-card__stars">${STARS(Math.round(avg))}</span>
        <div class="caption">${total} review${total === 1 ? '' : 's'} from customers who bought it</div>
      </span>
    </div>
    ${bars}`;
}

function card(r) {
  return `
    <div class="review-card">
      <div class="review-card__head">
        <strong>${esc(r.author)}</strong>
        <span class="caption">${when(r.date)}</span>
      </div>
      <div class="review-card__stars" aria-label="${r.rating} out of 5">${STARS(r.rating)}</div>
      ${r.verified ? '<span class="rv-verified">Verified purchase</span>' : ''}
      ${r.title ? `<p class="rv-title">${esc(r.title)}</p>` : ''}
      <p style="margin-top:.5rem">${esc(r.body)}</p>
    </div>`;
}

/**
 * The form, or the reason there isn't one.
 *
 * Every branch says something useful. "Only customers who have received this
 * product can review it" is a rule worth stating plainly — it is also the
 * sentence that tells a shopper the other reviews on the page mean something.
 */
function writeArea(state) {
  const can = state.can;

  if (!can) return '';

  if (!can.allowed) {
    return `<p class="rv-note">${esc(can.message)}${
      can.reason === 'signed-out'
        ? ' <a href="/account/login">Sign in</a>'
        : ''
    }</p>`;
  }

  return `
    <form class="review-form stack-4" data-rv-form novalidate style="margin-top:1.5rem">
      <h3 class="h5">Write a review</h3>
      <p class="caption">${esc(can.message)}</p>

      <div class="star-input" data-rv-stars role="radiogroup" aria-label="Your rating">
        ${[1, 2, 3, 4, 5].map((n) => `
          <button type="button" data-star="${n}" role="radio" aria-checked="false"
                  aria-label="${n} star${n > 1 ? 's' : ''}">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.9 21l1.2-6.8-5-4.9 6.9-1z"/></svg>
          </button>`).join('')}
      </div>

      <div class="field-gr">
        <label class="label-gr" for="rv-title">Headline <span class="caption">(optional)</span></label>
        <input id="rv-title" class="input-gr" name="title" maxlength="120">
      </div>

      <div class="field-gr">
        <label class="label-gr" for="rv-body">Your review</label>
        <textarea id="rv-body" class="textarea-gr" name="body" rows="4" maxlength="2000"
                  placeholder="What is it like? Was it what you expected?"></textarea>
      </div>

      <p class="aerror rv-error" data-rv-error hidden role="alert"></p>

      <button class="btn-gr btn-primary-gr" type="submit">Submit review</button>
      <p class="caption">Reviews are read before they appear, so yours will not show straight away.</p>
    </form>`;
}

/* ------------------------------------------------------------------ *
 * Behaviour
 * ------------------------------------------------------------------ */

function wireForm(host, state, product, form) {
  let rating = 0;

  const stars = [...form.querySelectorAll('[data-star]')];
  const mark = (value, cls) => stars.forEach((b, i) => b.classList.toggle(cls, i < value));

  stars.forEach((btn, i) => {
    btn.addEventListener('click', () => {
      rating = i + 1;
      mark(rating, 'is-on');
      stars.forEach((b, j) => b.setAttribute('aria-checked', String(j === i)));
    });
    btn.addEventListener('mouseenter', () => mark(i + 1, 'is-hover'));
    btn.addEventListener('mouseleave', () => mark(rating, 'is-hover'));
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const error = form.querySelector('[data-rv-error]');
    const say = (message) => {
      error.textContent = message;
      error.hidden = false;
    };

    error.hidden = true;

    // Checked here rather than with `required`, because a star row is not a
    // form control the browser can validate and "please fill in this field"
    // would point at nothing.
    if (!rating) return say('Choose a star rating first.');

    const body = form.body.value.trim();
    if (body.length < 15) return say('Tell other shoppers a little more — a sentence or two is plenty.');

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Sending…';

    let res;
    try {
      res = await post(`/api/reviews/${encodeURIComponent(state.slug)}`, {
        rating,
        title: form.title.value.trim() || null,
        body,
      });
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Submit review';
      return say(err.message);
    }

    // Replaced rather than reset. The review is not on the page and will not
    // be for a while, so leaving an empty form under a thank-you reads as
    // "that did not work, try again".
    form.replaceWith(Object.assign(document.createElement('p'), {
      className: 'rv-note',
      textContent: res.message,
    }));
  });
}

async function more(host, state, product, btn) {
  btn.disabled = true;
  btn.textContent = 'Loading…';

  const next = await fetchJSON(
    `/api/catalog/products/${encodeURIComponent(state.slug)}/reviews?page=${state.page + 1}`
  );

  if (!next) {
    btn.disabled = false;
    btn.textContent = 'Show more reviews';
    return;
  }

  state.items = [...state.items, ...next.data];
  state.meta = next.meta;
  state.page = next.meta.page;

  paint(host, state, product);
}

/* ------------------------------------------------------------------ *
 * Plumbing
 * ------------------------------------------------------------------ */

/** null on any failure — every caller treats that as "show what we have". */
async function fetchJSON(url) {
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function post(url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      // Laravel's session guard needs it, and the cookie is set by any page
      // that has spoken to the app. Absent, the post 419s and the message
      // below is what the customer sees.
      'X-XSRF-TOKEN': decodeURIComponent(cookie('XSRF-TOKEN') ?? ''),
    },
    body: JSON.stringify(payload),
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(body.message
      || (res.status === 419 ? 'Your session expired — reload the page and try again.' : 'That did not send. Try again.'));
  }

  return body;
}

function cookie(name) {
  return document.cookie.split('; ').find((c) => c.startsWith(`${name}=`))?.split('=')[1];
}

function when(iso) {
  if (!iso) return '';

  const then = new Date(iso);
  const days = Math.floor((Date.now() - then.getTime()) / 86400000);

  return days <= 0 ? 'today'
    : days === 1 ? 'yesterday'
      : days < 30 ? `${days} days ago`
        : then.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
