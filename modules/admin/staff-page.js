/**
 * staff-page.js — who works here, and what each of them may do.
 *
 * The screen that hands out access. Three things shape how it behaves.
 *
 * THE ROLE LIST COMES FROM THE SERVER
 * -----------------------------------
 * Every dropdown, every blurb and the reference at the foot of the page are
 * painted from `meta.roles` — AdminUser::roleCatalogue(). None of it is
 * written down in this file. A copy of the role list in JavaScript is a copy
 * that drifts, and the way you find out is a 422 on a role the form offered.
 *
 * REFUSALS ARE SHOWN, NOT HIDDEN
 * ------------------------------
 * When a row's role cannot be changed the server sends `lockedRole` — a
 * sentence, not a boolean — and the cell prints it where the dropdown would
 * have been. A control that silently vanishes teaches nobody anything; one
 * that says "the only active owner" teaches the rule once.
 *
 * NOTHING HERE IS THE CONTROL
 * ---------------------------
 * The screen is owner-only because `admin:staff` is on the routes, not because
 * the sidebar leaves it out for everyone else. Every refusal drawn on this
 * page is drawn again in AdminStaffController, which is the copy that counts.
 */

import { adminFetch } from './backend/api.js';
import { escapeHtml } from './admin-shell.js';
import { confirmDelete, toast } from './admin-delete.js';

/** The server's role catalogue: {value, label, blurb, capabilities[]}. */
let roles = [];

/** The last payload, so an inline edit can find its row without re-fetching. */
let people = [];

/** The id whose row is currently swapped into an edit form, or null. */
let editingId = null;

document.addEventListener('admin:ready', init);

function init() {
  const body = document.querySelector('[data-st-body]');
  if (!body) return;

  document.querySelector('[data-st-new]')?.addEventListener('click', () => showForm(true));
  document.querySelector('[data-st-cancel]')?.addEventListener('click', () => showForm(false));
  document.querySelector('[data-st-form]')?.addEventListener('submit', create);
  document.querySelector('[data-st-role]')?.addEventListener('change', paintRoleBlurb);

  document.querySelector('[data-st-secret-copy]')?.addEventListener('click', copySecret);
  document.querySelector('[data-st-secret-done]')?.addEventListener('click', hideSecret);

  /* Delegated to the tbody, which is replaced wholesale on every load —
     handlers bound to the rows themselves are handlers that quietly stop
     working after the first refresh. */
  body.addEventListener('click', onClick);
  body.addEventListener('change', onChange);
  body.addEventListener('submit', onEditSubmit);

  load();
}

/* ---- Reading ------------------------------------------------------------ */

async function load() {
  const body = document.querySelector('[data-st-body]');

  let payload;
  try {
    payload = await adminFetch('/staff');
  } catch (err) {
    body.innerHTML = `<tr><td colspan="5" class="atable__empty">${loadMessage(err)}</td></tr>`;
    document.querySelector('[data-st-count]').textContent = '';
    return;
  }

  roles = payload.meta.roles ?? [];
  people = payload.data ?? [];

  fillRoleSelect();
  paintRolesReference();
  paintTrail(payload.events ?? []);
  paint(payload.meta);
}

function loadMessage(err) {
  // Said plainly rather than left as an empty table, which reads as broken.
  if (err.status === 403) return 'Only an owner can manage staff accounts.';
  if (err.status === 404 || !err.status) {
    return 'No backend connected yet — staff accounts appear once the API is live.';
  }
  return escapeHtml(err.message);
}

function paint(meta) {
  const body = document.querySelector('[data-st-body]');

  /* Both numbers, because they answer different questions: how many accounts
     exist at all, and how many of them can actually sign in this morning. */
  const disabled = meta.total - meta.activeCount;
  document.querySelector('[data-st-count]').textContent =
    `${meta.total} account${meta.total === 1 ? '' : 's'}`
    + (disabled ? ` · ${meta.activeCount} active, ${disabled} disabled` : '');

  body.innerHTML = people
    .map((u) => (u.id === editingId ? editRow(u) : row(u)))
    .join('');
}

function row(u) {
  return `
    <tr data-st-row="${u.id}"${u.isActive ? '' : ' class="is-off"'}>
      <td class="atable__name">
        <strong>${escapeHtml(u.name)}</strong>${u.isSelf ? ' <span class="apill apill--label">you</span>' : ''}
        <div class="atable__sub">${escapeHtml(u.email)}</div>
      </td>
      <td>${roleCell(u)}</td>
      <td>${statusCell(u)}</td>
      <td class="atable__sub">${seenCell(u)}</td>
      <td class="atable__actions">${actionsCell(u)}</td>
    </tr>`;
}

function roleCell(u) {
  if (u.lockedRole) {
    return `<span class="apill apill--label">${escapeHtml(u.roleLabel)}</span>
            <div class="atable__sub">${escapeHtml(u.lockedRole)}</div>`;
  }

  return `
    <select class="select-gr" data-st-role-for="${u.id}"
            aria-label="Role for ${escapeHtml(u.name)}">
      ${roles.map((r) => `
        <option value="${escapeHtml(r.value)}"${r.value === u.role ? ' selected' : ''}
        >${escapeHtml(r.label)}</option>`).join('')}
    </select>`;
}

function statusCell(u) {
  if (!u.isActive) {
    return '<span class="apill apill--wait">Disabled</span>'
      + '<div class="atable__sub">Cannot sign in. History kept.</div>';
  }

  if (u.isLocked) {
    return '<span class="apill apill--bad">Locked</span>'
      + `<div class="atable__sub">Five wrong passwords. Frees up ${when(u.lockedUntil)}.</div>`;
  }

  return '<span class="apill apill--ok">Active</span>';
}

function seenCell(u) {
  if (!u.lastLoginAt) return 'Never signed in';

  /* The IP is here so an owner can notice one account signing in from two
     places — the usual sign that a login has been shared rather than a second
     account created. */
  return escapeHtml(when(u.lastLoginAt))
    + (u.lastLoginIp ? `<br>from ${escapeHtml(u.lastLoginIp)}` : '');
}

function actionsCell(u) {
  const bits = [
    `<button type="button" class="alink-btn" data-st-edit="${u.id}">Edit</button>`,
    `<button type="button" class="alink-btn" data-st-reset="${u.id}">Reset password</button>`,
  ];

  if (u.isLocked) {
    bits.push(`<button type="button" class="alink-btn" data-st-unlock="${u.id}">Unlock</button>`);
  }

  if (!u.isActive) {
    bits.push(`<button type="button" class="alink-btn" data-st-enable="${u.id}">Enable</button>`);
  } else if (!u.isSelf) {
    /* Hidden on your own row rather than shown-and-refused. "You cannot
       disable yourself" is self-evident once you think about it, unlike the
       last-owner rule, which is why that one gets a sentence and this one gets
       silence. The server refuses it either way. */
    bits.push(`<button type="button" class="alink-btn alink-btn--danger"
                       data-st-disable="${u.id}">Disable</button>`);
  }

  return `<div class="arow-actions">${bits.join('')}</div>`;
}

/* ---- The trail ---------------------------------------------------------- */

/**
 * Who changed what, newest first.
 *
 * The sentence is composed on the SERVER — see AdminUserEvent::sentence(). It
 * has to be, because it depends on the role labels (`warehouse` reads as
 * "Employee"), and a second copy of that mapping here is how the trail ends up
 * telling somebody they were made a Warehouse.
 */
function paintTrail(events) {
  const host = document.querySelector('[data-st-trail]');
  if (!host) return;

  if (!events.length) {
    host.innerHTML = '<li class="atimeline__empty">Nothing yet. Every staff change from '
      + 'here on is recorded — what changed, to whom, and who did it.</li>';
    return;
  }

  host.innerHTML = events.map((e) => `
    <li class="atimeline__item">
      <div class="atimeline__what">
        <strong>${escapeHtml(e.subject)}</strong> ${escapeHtml(e.sentence)}
      </div>
      <div class="atimeline__who">${
        /* No "by" line where somebody acted on their own account. The sentence
           already says "changed their own password", and following it with
           "by Rahim" reads as a second person with the same name. */
        e.isSelf ? escapeHtml(when(e.at))
                 : `by ${escapeHtml(e.actor)} · ${escapeHtml(when(e.at))}`
      }</div>
    </li>`).join('');
}

/* ---- The role reference at the foot of the page ------------------------- */

function paintRolesReference() {
  const host = document.querySelector('[data-st-roles]');
  if (!host) return;

  host.innerHTML = roles.map((r) => `
    <div class="aroles__row">
      <p class="aroles__name">${escapeHtml(r.label)}</p>
      <p class="aroles__blurb">${escapeHtml(r.blurb)}</p>
      <p class="aroles__areas">
        ${r.capabilities.map((c) => `<span class="apill apill--label">${escapeHtml(areaLabel(c))}</span>`).join(' ')}
      </p>
    </div>`).join('');
}

/** Capability slugs are one word each; this is only about the capital. */
function areaLabel(area) {
  return area.charAt(0).toUpperCase() + area.slice(1);
}

/* ---- Creating ----------------------------------------------------------- */

function showForm(on) {
  const form = document.querySelector('[data-st-form]');
  if (!form) return;

  form.hidden = !on;
  document.querySelector('[data-st-new]').setAttribute('aria-expanded', String(on));

  if (!on) {
    form.reset();
    paintRoleBlurb();
    hideFormError();
    return;
  }

  /* form.elements, not form.name.

     `form.name` is HTMLFormElement's OWN name attribute — an empty string here
     — because a legacy platform object's named getter is shadowed by anything
     already on its prototype chain. `form.role` is worse: ARIA reflection put
     `role` on Element, so that resolves to the form's role attribute (null)
     rather than the select. Both fail at runtime, and `form.email` beside them
     works fine, which is exactly the kind of half-working that costs an hour.

     form.elements is an HTMLFormControlsCollection with none of those names on
     its prototype, so every control is reachable by the name it was given. */
  form.elements.name.focus();
}

/**
 * Populated from the server's catalogue, preserving whatever was already
 * chosen so a background refresh cannot silently move the selection.
 *
 * The first option is a placeholder with an empty value, so `required` forces
 * a deliberate choice. This field decides what a new person can reach; a
 * dropdown that arrives with an answer already in it is a dropdown that gets
 * scrolled past.
 */
function fillRoleSelect() {
  const select = document.querySelector('[data-st-role]');
  if (!select) return;

  const chosen = select.value;

  select.innerHTML = '<option value="">Choose a role…</option>'
    + roles.map((r) => `<option value="${escapeHtml(r.value)}">${escapeHtml(r.label)}</option>`).join('');

  if (chosen) select.value = chosen;
  paintRoleBlurb();
}

function paintRoleBlurb() {
  const select = document.querySelector('[data-st-role]');
  const out = document.querySelector('[data-st-role-blurb]');
  if (!select || !out) return;

  const role = roles.find((r) => r.value === select.value);
  out.textContent = role?.blurb ?? '';
}

async function create(e) {
  e.preventDefault();
  hideFormError();

  const form = e.currentTarget;
  const submit = form.querySelector('button[type="submit"]');

  submit.disabled = true;
  submit.textContent = 'Creating…';

  let payload;
  try {
    payload = await adminFetch('/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.elements.name.value.trim(),      // see showForm()
        email: form.elements.email.value.trim(),
        role: form.elements.role.value,
      }),
    });
  } catch (err) {
    showFormError(err);
    return;
  } finally {
    submit.disabled = false;
    submit.textContent = 'Create account';
  }

  showForm(false);
  showSecret({
    title: `Password for ${payload.data.name}`,
    password: payload.password,
    note: payload.message,
  });
  load();
}

function showFormError(err) {
  const out = document.querySelector('[data-st-form-error]');
  if (!out) return;

  /* Laravel sends `errors` keyed by field on a 422, and adminFetch carries the
     parsed body along on the thrown error. Listing them beats the summary
     sentence, which for two bad fields says only that the data was invalid. */
  const fields = err.body?.errors ? Object.values(err.body.errors).flat() : [];

  out.textContent = fields.length ? fields.join(' ') : err.message;
  out.hidden = false;
}

function hideFormError() {
  const out = document.querySelector('[data-st-form-error]');
  if (out) out.hidden = true;
}

/* ---- The password panel ------------------------------------------------- */

function showSecret({ title, password, note }) {
  const box = document.querySelector('[data-st-secret]');
  if (!box) return;

  box.querySelector('[data-st-secret-title]').textContent = title;
  box.querySelector('[data-st-secret-value]').textContent = password;
  box.querySelector('[data-st-secret-note]').textContent = note;
  box.querySelector('[data-st-secret-copy]').textContent = 'Copy';
  box.hidden = false;

  // Brought into view: on a laptop the panel sits above the fold, but after
  // creating the sixteenth account the form is halfway down a long table and
  // the one thing that must be read could easily be off screen.
  box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function hideSecret() {
  const box = document.querySelector('[data-st-secret]');
  if (!box) return;

  // Cleared, not merely hidden. A dismissed panel still holding the plaintext
  // in the DOM is a plaintext credential sitting in a page left open on a
  // counter all afternoon.
  box.querySelector('[data-st-secret-value]').textContent = '';
  box.hidden = true;
}

async function copySecret() {
  const btn = document.querySelector('[data-st-secret-copy]');
  const value = document.querySelector('[data-st-secret-value]')?.textContent ?? '';
  if (!value) return;

  try {
    await navigator.clipboard.writeText(value);
    btn.textContent = 'Copied';
    setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
  } catch {
    /* No clipboard permission, or an insecure context. Selecting the text is
       the honest fallback — it puts the password one Ctrl+C away rather than
       reporting a success that did not happen. */
    const el = document.querySelector('[data-st-secret-value]');
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    btn.textContent = 'Selected — copy it';
  }
}

/* ---- Row actions -------------------------------------------------------- */

function onClick(e) {
  const el = (attr) => e.target.closest(`[${attr}]`);

  const edit = el('data-st-edit');
  if (edit) { editingId = Number(edit.dataset.stEdit); return repaint(); }

  const cancel = el('data-st-edit-cancel');
  if (cancel) { editingId = null; return repaint(); }

  const reset = el('data-st-reset');
  if (reset) return resetPassword(reset);

  const unlock = el('data-st-unlock');
  if (unlock) return act(unlock, unlock.dataset.stUnlock, 'unlock', 'Unlocking…');

  const enable = el('data-st-enable');
  if (enable) return act(enable, enable.dataset.stEnable, 'enable', 'Enabling…');

  const disable = el('data-st-disable');
  if (disable) return disableAccount(disable);
}

/** Repaint from the payload already in hand — no round trip to open an edit. */
function repaint() {
  const body = document.querySelector('[data-st-body]');
  body.innerHTML = people.map((u) => (u.id === editingId ? editRow(u) : row(u))).join('');
  body.querySelector('[data-st-edit-form] input')?.focus();
}

function editRow(u) {
  return `
    <tr data-st-row="${u.id}">
      <td colspan="5">
        <form class="acat-new" data-st-edit-form="${u.id}">
          <div class="afilters__field">
            <label for="ste-name-${u.id}">Name</label>
            <input class="input-gr" id="ste-name-${u.id}" name="name" type="text" required
                   minlength="2" maxlength="120" value="${escapeHtml(u.name)}">
          </div>
          <div class="afilters__field afilters__field--wide">
            <label for="ste-email-${u.id}">Email <span class="atable__sub">— what they sign in with</span></label>
            <input class="input-gr" id="ste-email-${u.id}" name="email" type="email" required
                   maxlength="191" value="${escapeHtml(u.email)}">
          </div>
          <div class="acat-new__actions">
            <button class="btn-gr btn-primary-gr btn-sm-gr" type="submit">Save</button>
            <button class="btn-gr btn-ghost-gr btn-sm-gr" type="button" data-st-edit-cancel>Cancel</button>
          </div>
          <p class="aerror" data-st-edit-error hidden role="alert"></p>
        </form>
      </td>
    </tr>`;
}

async function onEditSubmit(e) {
  const form = e.target.closest('[data-st-edit-form]');
  if (!form) return;
  e.preventDefault();

  const id = form.dataset.stEditForm;
  const submit = form.querySelector('button[type="submit"]');
  const err = form.querySelector('[data-st-edit-error]');

  err.hidden = true;
  submit.disabled = true;
  submit.textContent = 'Saving…';

  try {
    const { message } = await adminFetch(`/staff/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.elements.name.value.trim(),      // see showForm()
        email: form.elements.email.value.trim(),
      }),
    });
    toast(message);
  } catch (error) {
    const fields = error.body?.errors ? Object.values(error.body.errors).flat() : [];
    err.textContent = fields.length ? fields.join(' ') : error.message;
    err.hidden = false;
    submit.disabled = false;
    submit.textContent = 'Save';
    return;
  }

  editingId = null;
  load();
}

/**
 * A role changed in the row's dropdown.
 *
 * Saved on `change` rather than behind a Save button, because the dropdown IS
 * the decision — there is nothing else on the row to save alongside it.
 *
 * Promoting somebody to owner asks first. That one grants the delete button on
 * every screen in the panel plus this screen itself, which means the person
 * you just promoted can change your role too. Every other move is reversible
 * from here by the person making it, so it goes through on the click.
 */
async function onChange(e) {
  const select = e.target.closest('[data-st-role-for]');
  if (!select) return;

  const id = select.dataset.stRoleFor;
  const person = people.find((u) => String(u.id) === id);
  const role = roles.find((r) => r.value === select.value);
  if (!person || !role) return;

  if (role.value === 'owner') {
    const ok = await confirmDelete({
      title: `Make ${person.name} an owner?`,
      body: 'An owner can do everything in this panel, including deleting records, '
        + 'and including managing staff — so they will be able to change your role too.',
      confirm: 'Make them an owner',
      undo: 'You can change it back, as long as you are still an owner yourself.',
    });
    // Cancelled: the dropdown is showing a choice that was never made, so put
    // the row back the way it was rather than leave it lying.
    if (!ok) return repaint();
  }

  select.disabled = true;

  try {
    const { message } = await adminFetch(`/staff/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: role.value }),
    });
    toast(message);
  } catch (err) {
    toast(err.message, false);
  }

  load();
}

async function resetPassword(btn) {
  const id = btn.dataset.stReset;
  const person = people.find((u) => String(u.id) === id);
  if (!person) return;

  const ok = await confirmDelete({
    title: `Reset ${person.name}'s password?`,
    body: 'Their current password stops working immediately. You will be shown a new one '
      + 'to hand over, once.',
    confirm: 'Reset password',
    undo: '',
  });
  if (!ok) return;

  btn.disabled = true;
  btn.textContent = 'Resetting…';

  let payload;
  try {
    payload = await adminFetch(`/staff/${encodeURIComponent(id)}/password`, { method: 'POST' });
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Reset password';
    return toast(err.message, false);
  }

  showSecret({
    title: `New password for ${payload.data.name}`,
    password: payload.password,
    note: payload.message,
  });
  load();
}

async function disableAccount(btn) {
  const id = btn.dataset.stDisable;
  const person = people.find((u) => String(u.id) === id);
  if (!person) return;

  const ok = await confirmDelete({
    title: `Disable ${person.name}?`,
    body: 'They stop being able to sign in, on their very next click — including in a session '
      + 'they already have open.',
    confirm: 'Disable account',
    // The default reassurance talks about a Deleted tab. There isn't one here,
    // and there is no delete to undo — this is the truthful version.
    undo: 'Their name stays on everything they did, and you can switch them back on any time.',
  });
  if (!ok) return;

  return act(btn, id, 'disable', 'Disabling…');
}

/** The three one-click state changes, which differ only in their URL. */
async function act(btn, id, action, busyText) {
  const was = btn.textContent;

  btn.disabled = true;
  btn.textContent = busyText;

  try {
    const { message } = await adminFetch(
      `/staff/${encodeURIComponent(id)}/${action}`, { method: 'POST' },
    );
    toast(message);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = was;
    return toast(err.message, false);
  }

  load();
}

function when(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}
