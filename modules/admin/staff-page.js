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

/** The id whose row is currently showing the permission grid, or null. */
let permsId = null;

/** The server's permission catalogue: [{key, label, actions:[{key,label,permission}]}]. */
let areas = [];

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
  areas = payload.meta.areas ?? [];
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

  body.innerHTML = people.map(rowFor).join('');
}

/** A row is in one of three states: reading, editing details, editing access. */
function rowFor(u) {
  if (u.id === editingId) return editRow(u);
  if (u.id === permsId) return permRow(u);
  return row(u);
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
  /* A customised account's role is no longer a description of what it may do,
     so the badge says so. Without it the cell reads "Employee" while the person
     has half the catalogue, and the role is the first thing anybody checks. */
  const custom = u.isCustom
    ? '<div class="atable__sub"><span class="apill apill--info">Custom access</span></div>'
    : '';

  if (u.lockedRole) {
    return `<span class="apill apill--label">${escapeHtml(u.roleLabel)}</span>${custom}
            <div class="atable__sub">${escapeHtml(u.lockedRole)}</div>`;
  }

  return `
    <select class="select-gr" data-st-role-for="${u.id}"
            aria-label="Role for ${escapeHtml(u.name)}">
      ${roles.map((r) => `
        <option value="${escapeHtml(r.value)}"${r.value === u.role ? ' selected' : ''}
        >${escapeHtml(r.label)}</option>`).join('')}
    </select>${custom}`;
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

  /* Not on your own row. The server refuses an access change to yourself —
     somebody who takes away their own permissions by accident cannot undo it —
     and the role cell already carries that sentence, so offering a button that
     opens a grid nothing will save would be the worse half of both. */
  if (!u.isSelf) {
    bits.unshift(`<button type="button" class="alink-btn" data-st-perms="${u.id}">Access</button>`);
  }

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

/* ---- The permission grid ------------------------------------------------ */

/**
 * One account's access, area by area.
 *
 * Drawn from meta.areas — the server's own catalogue — so the grid can only
 * offer permissions the server enforces. There is no list of areas or actions
 * written down in this file, which is the same rule the role dropdown follows
 * and for the same reason.
 *
 * The role select at the top is a STARTING POINT, not a filter: picking one
 * ticks that preset's boxes and leaves them editable. Saving always sends the
 * ticked list, so what you see is exactly what the account gets.
 */
function permRow(u) {
  const held = new Set(u.permissions ?? []);

  return `
    <tr data-st-row="${u.id}">
      <td colspan="5">
        <form class="acat-new astperm" data-st-perm-form="${u.id}">
          <div class="astperm__head">
            <h3 class="h5">What ${escapeHtml(u.name)} may do</h3>
            <p class="admin__sub">
              ${u.isCustom
                ? 'This account has its own list. Its role is only a label until you put it back.'
                : `Following the ${escapeHtml(u.roleLabel)} preset. Tick anything and it becomes this account&rsquo;s own list.`}
            </p>
          </div>

          <div class="afilters__field afilters__field--wide">
            <label for="stp-role-${u.id}">Start from a role</label>
            <select class="input-gr" id="stp-role-${u.id}" data-st-perm-preset>
              <option value="">Choose a preset to fill the boxes…</option>
              ${roles.map((r) => `<option value="${escapeHtml(r.value)}">${escapeHtml(r.label)}</option>`).join('')}
            </select>
          </div>

          <div class="astperm__grid">
            ${areas.map((a) => areaBox(a, held)).join('')}
          </div>

          <div class="acat-new__actions">
            <button class="btn-gr btn-primary-gr btn-sm-gr" type="submit">Save access</button>
            ${u.isCustom
              ? `<button class="btn-gr btn-outline-gr btn-sm-gr" type="button"
                         data-st-perm-follow="${u.id}">Go back to following the role</button>`
              : ''}
            <button class="btn-gr btn-ghost-gr btn-sm-gr" type="button" data-st-perm-cancel>Cancel</button>
          </div>

          <p class="aerror" data-st-perm-error hidden role="alert"></p>
        </form>
      </td>
    </tr>`;
}

function areaBox(area, held) {
  const canView = held.has(`${area.key}.view`);

  return `
    <fieldset class="astperm__area${canView ? ' is-on' : ''}" data-st-area="${escapeHtml(area.key)}">
      <legend>${escapeHtml(area.label)}</legend>
      ${area.actions.map((act) => `
        <label class="astperm__act">
          <input type="checkbox" value="${escapeHtml(act.permission)}"
                 data-st-action="${escapeHtml(act.key)}"
                 ${held.has(act.permission) ? 'checked' : ''}>
          <span>${escapeHtml(act.label)}</span>
        </label>`).join('')}
    </fieldset>`;
}

/**
 * Keep the boxes honest about each other.
 *
 * Nothing in an area is reachable without being able to open it, so unticking
 * "Open and read" unticks the rest, and ticking anything else ticks it back.
 * The server would not be fooled by a saved list containing `orders.delete`
 * without `orders.view` — every delete route is inside a group that checks
 * view first — so a grid that let you save one would be a grid that quietly
 * promised something it could not deliver.
 */
function cascadeArea(box, changed) {
  const view = box.querySelector('[data-st-action="view"]');
  if (!view) return;

  if (changed === view && !view.checked) {
    box.querySelectorAll('input[type="checkbox"]').forEach((c) => { c.checked = false; });
  } else if (changed !== view && changed.checked) {
    view.checked = true;
  }

  box.classList.toggle('is-on', view.checked);
}

function onPermChange(e) {
  const box = e.target.closest('[data-st-area]');
  if (box) return cascadeArea(box, e.target);

  const preset = e.target.closest('[data-st-perm-preset]');
  if (!preset) return;

  const role = roles.find((r) => r.value === preset.value);
  if (!role) return;

  // Fills the boxes and leaves them editable — a preset, not a lock.
  const want = new Set(role.permissions ?? []);
  const form = preset.closest('[data-st-perm-form]');

  form.querySelectorAll('input[type="checkbox"]').forEach((c) => {
    c.checked = want.has(c.value);
  });
  form.querySelectorAll('[data-st-area]').forEach((box2) => {
    box2.classList.toggle('is-on', !!box2.querySelector('[data-st-action="view"]')?.checked);
  });
}

async function savePerms(form) {
  const id = form.dataset.stPermForm;
  const submit = form.querySelector('button[type="submit"]');
  const err = form.querySelector('[data-st-perm-error]');

  const permissions = [...form.querySelectorAll('input[type="checkbox"]:checked')]
    .map((c) => c.value);

  err.hidden = true;
  submit.disabled = true;
  submit.textContent = 'Saving…';

  try {
    const { message } = await adminFetch(`/staff/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissions }),
    });
    toast(message);
  } catch (error) {
    const fields = error.body?.errors ? Object.values(error.body.errors).flat() : [];
    err.textContent = fields.length ? fields.join(' ') : error.message;
    err.hidden = false;
    submit.disabled = false;
    submit.textContent = 'Save access';
    return;
  }

  permsId = null;
  load();
}

/** Hand the account back to its role — null, not an empty list. */
async function followRole(btn) {
  const id = btn.dataset.stPermFollow;

  btn.disabled = true;
  btn.textContent = 'Restoring…';

  try {
    const { message } = await adminFetch(`/staff/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissions: null }),
    });
    toast(message);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Go back to following the role';
    return toast(err.message, false);
  }

  permsId = null;
  load();
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

  const perms = el('data-st-perms');
  if (perms) { permsId = Number(perms.dataset.stPerms); editingId = null; return repaint(); }

  const permCancel = el('data-st-perm-cancel');
  if (permCancel) { permsId = null; return repaint(); }

  const follow = el('data-st-perm-follow');
  if (follow) return followRole(follow);

  const edit = el('data-st-edit');
  if (edit) { editingId = Number(edit.dataset.stEdit); permsId = null; return repaint(); }

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
  body.innerHTML = people.map(rowFor).join('');
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
  const perms = e.target.closest('[data-st-perm-form]');
  if (perms) {
    e.preventDefault();
    return savePerms(perms);
  }

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
  // The permission grid lives in the same delegated listener.
  if (e.target.closest('[data-st-perm-form]')) return onPermChange(e);

  const select = e.target.closest('[data-st-role-for]');
  if (!select) return;

  const id = select.dataset.stRoleFor;
  const person = people.find((u) => String(u.id) === id);
  const role = roles.find((r) => r.value === select.value);
  if (!person || !role) return;

  /* Changing the role of an account with its own list would otherwise do
     nothing visible: the custom list keeps winning, and the dropdown would sit
     there showing a role that means nothing. So the role change takes the
     custom list with it, and says so before it does. */
  if (person.isCustom) {
    const ok = await confirmDelete({
      title: `Replace ${person.name}'s custom access?`,
      body: `They have a list of their own at the moment. Switching to `
        + `${role.label} replaces it with that preset — anything you ticked by hand is lost.`,
      confirm: `Use the ${role.label} preset`,
      undo: 'You can set their permissions by hand again from Access.',
    });
    if (!ok) return repaint();

    return applyRole(id, role, { permissions: null });
  }

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
  return applyRole(id, role);
}

/**
 * Send a role change, optionally clearing the custom list with it.
 *
 * Split out because two callers need it and they disagree about `permissions`:
 * an ordinary role change leaves the field alone, while switching a customised
 * account back to a preset must send null to clear it. Threading that through
 * one function with a flag read worse than naming it.
 */
async function applyRole(id, role, extra = {}) {
  try {
    const { message } = await adminFetch(`/staff/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: role.value, ...extra }),
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
