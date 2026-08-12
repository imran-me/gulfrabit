/**
 * sms-order-panel.js — the message-the-customer block on the admin order screen.
 *
 * SELF-MOUNTING, LIKE THE COURIER BLOCK NEXT TO IT
 * ------------------------------------------------
 * Admin's order fragment contains no messaging markup. This file finds the
 * order-detail grid and appends its own card, so deleting modules/sms/ and its
 * line in tools/assemble.py removes the feature with no orphan `<div>` left
 * behind in somebody else's fragment.
 *
 * WHAT IT REFUSES TO PRETEND
 * --------------------------
 * "Sent" means the gateway accepted the message — not that a handset rang, and
 * not that anybody read it. The thread says exactly that much and no more. A
 * green tick promising delivery would be inventing a fact the gateway never
 * gave us, and staff would quote it to a customer who is standing there saying
 * they got nothing.
 *
 * With no gateway configured the compose box is not drawn at all. A send button
 * that silently does nothing is worse than no send button: the message looks
 * sent, the customer is never told, and nobody finds out until they complain.
 */

import { adminFetch } from '../admin/backend/api.js';
import { escapeHtml } from '../admin/admin-shell.js';

/**
 * Ready-made openings for the three calls that happen every day.
 *
 * They fill the box; they do not send. Every one of them is edited before it
 * goes — a template that sent itself would be a status alert, and those are
 * already automatic (see Listeners/SendOrderStatusSms.php). This is for the
 * conversation the automation cannot have.
 *
 * English, and short. See the note in that listener: Bangla is UCS-2, 70
 * characters a segment against 160, so a Bangla SMS costs roughly triple.
 */
const TEMPLATES = [
  {
    label: 'Could not reach you',
    body: (o) => `GulfRabit: We tried calling about your order ${o.orderNumber} but could not reach you. Please call us back to confirm.`,
  },
  {
    label: 'Out for delivery today',
    body: (o) => `GulfRabit: Your order ${o.orderNumber} is out for delivery today. Please keep your phone nearby.`,
  },
  {
    label: 'Delivery delayed',
    body: (o) => `GulfRabit: Your order ${o.orderNumber} is delayed by a day. Sorry for the trouble — it is on the way.`,
  },
];

/** GSM-7 segment size. The billing unit, and the reason for the counter. */
const SEGMENT = 160;

let messages = [];
let meta = { canSend: false };
let order = null;

document.addEventListener('admin:ready', init);

function orderNumber() {
  return new URLSearchParams(location.search).get('no');
}

async function init() {
  const grid = document.querySelector('.aorder');
  if (!grid || !orderNumber()) return;   // not the order-detail screen

  grid.insertAdjacentHTML('beforeend', `
    <section class="acard" aria-labelledby="sms-head" data-sms-panel>
      <h2 class="h5" id="sms-head">Message the customer</h2>
      <div data-sms-body><p class="admin__sub">Loading…</p></div>
    </section>`);

  try {
    ({ data: messages, meta } = await adminFetch(
      `/orders/${encodeURIComponent(orderNumber())}/messages`
    ));
  } catch (err) {
    return paint(`<p class="admin__sub">${
      err.status === 404 || !err.status
        ? 'No backend connected yet — messaging appears once the API is live.'
        : escapeHtml(err.message)
    }</p>`);
  }

  order = { orderNumber: orderNumber() };
  render();
}

function paint(html) {
  const body = document.querySelector('[data-sms-body]');
  if (body) body.innerHTML = html;
}

function render() {
  paint(thread() + composer());
  wire();
}

/**
 * Everything ever sent about this order, automatic alerts included.
 *
 * Automatic messages are labelled as such rather than hidden, so staff can see
 * that "your order is on the way" already went out before they type it again.
 */
function thread() {
  if (!messages.length) {
    return '<p class="admin__sub">Nothing has been sent to this customer about this order yet.</p>';
  }

  return `
    <ul class="athread" role="list">
      ${messages.map((m) => `
        <li class="amsg${m.status === 'failed' ? ' is-failed' : ''}">
          <div class="amsg__body">${escapeHtml(m.body)}</div>
          <div class="atable__sub">
            ${m.status === 'failed'
              ? '<strong>Not sent</strong> — the gateway refused it. '
              : ''}
            ${escapeHtml(m.kind === 'manual' ? (m.sentBy || 'Staff') : 'Automatic')} · ${when(m.at)}
          </div>
        </li>`).join('')}
    </ul>`;
}

function composer() {
  if (!meta.canSend) {
    return `
      <p class="admin__sub" style="border-top:1px solid var(--gr-border);padding-top:var(--space-4)">
        No SMS gateway is configured, so nothing can be sent from here yet.
        Add <code>SMS_API_KEY</code> and <code>SMS_SENDER_ID</code> to <code>.env</code> —
        or set <code>SMS_GATEWAY=log</code> to see exactly what customers would receive
        without spending credit.
      </p>`;
  }

  return `
    ${meta.gateway === 'log' ? `
      <p class="admin__sub" style="border-top:1px solid var(--gr-border);padding-top:var(--space-4)">
        <strong>Test mode.</strong> The gateway is set to <code>log</code>: messages are written
        to the log and to the message history, and no customer receives anything.
      </p>` : ''}

    <form class="anote-form" data-sms-form>
      <div class="atemplates" role="group" aria-label="Ready-made messages">
        ${TEMPLATES.map((t, i) => `
          <button class="btn-gr btn-ghost-gr btn-sm-gr" type="button" data-template="${i}">
            ${escapeHtml(t.label)}
          </button>`).join('')}
      </div>

      <div class="afilters__field afilters__field--wide">
        <label for="sms-body">Message to ${escapeHtml(meta.sendsTo || 'the customer')}</label>
        <textarea class="input-gr" id="sms-body" name="body" rows="3" required maxlength="480"
                  placeholder="Type what you want to tell them, or start from one above."></textarea>
        <!-- aria-live so the cost is announced as it changes, not only seen. -->
        <p class="admin__sub" data-sms-count aria-live="polite">0 characters · 1 SMS</p>
      </div>

      <button class="btn-gr btn-primary-gr btn-sm-gr" type="submit">Send SMS</button>
      <p class="admin__sub" style="flex:1 1 100%">
        Goes to the number on this order and nowhere else. Sending cannot be undone.
      </p>
    </form>`;
}

function wire() {
  const form = document.querySelector('[data-sms-form]');
  if (!form) return;

  form.querySelectorAll('[data-template]').forEach((btn) => {
    btn.addEventListener('click', () => {
      form.body.value = TEMPLATES[Number(btn.dataset.template)].body(order);
      form.body.focus();
      count(form);
    });
  });

  form.body.addEventListener('input', () => count(form));
  form.addEventListener('submit', send);
}

/**
 * Characters and, more to the point, segments — because segments are what the
 * shop pays for. A merchant who can see "2 SMS" before pressing send writes
 * shorter messages, and that is the whole reason this is on screen.
 */
function count(form) {
  const n = form.body.value.length;
  const segments = Math.max(1, Math.ceil(n / SEGMENT));
  form.querySelector('[data-sms-count]').textContent =
    `${n} character${n === 1 ? '' : 's'} · ${segments} SMS`;
}

async function send(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const btn = form.querySelector('button[type="submit"]');
  const body = form.body.value.trim();
  if (!body) return;

  btn.disabled = true;
  btn.textContent = 'Sending…';

  let sent;
  try {
    ({ data: sent } = await adminFetch(`/orders/${encodeURIComponent(orderNumber())}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    }));
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Send SMS';

    // A 502 means the gateway refused it, and the server has already logged the
    // attempt. Show the failure IN the thread rather than only as an error
    // line: "there is a record of this and it did not go" is the true and
    // useful reading, and it is one the next person also needs to see.
    if (err.status === 502 && err.body?.data) {
      messages.push(err.body.data);
      render();
      // render() rebuilds the compose box empty, which is right after a send
      // that worked and cruel after one that did not. Put the words back — the
      // most likely next action is pressing send again.
      restoreDraft(body);
    }

    return failure(err.message || 'The message could not be sent.');
  }

  messages.push(sent);
  render();
}

function restoreDraft(body) {
  const form = document.querySelector('[data-sms-form]');
  if (!form) return;
  form.body.value = body;
  count(form);
}

function failure(message) {
  const el = document.querySelector('[data-order-error]');
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
}

function when(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
