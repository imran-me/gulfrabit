/**
 * admin-delete.js — one delete, spoken the same way on every screen.
 *
 * WHY THIS IS SHARED AND NOT COPIED
 * ---------------------------------
 * Delete now exists on a dozen screens across eight modules. Before this file
 * they were drifting apart: media asked with `window.confirm`, categories used
 * a bespoke inline warning, coupons had its own `note()`, and three more pages
 * carried a fourth and fifth copy of the same toast. A destructive action that
 * looks different in five places is a destructive action people stop reading.
 *
 * So the *question* and the *answer* live here — the dialog, the toast, and
 * the rule about who may ask — and each screen supplies only what is specific
 * to it: what is being deleted, and what to do afterwards.
 *
 * DELETING IS NEVER DESTROYING
 * ----------------------------
 * Every delete behind this helper is a soft delete. The row leaves the list,
 * goes to that screen's Deleted tab, and can be restored with its history
 * intact. That is what makes a one-click confirm honest rather than reckless:
 * the dialog says you can undo this because you can. Anything that genuinely
 * cannot be undone must NOT use this helper — it should say so in its own
 * words, at length, the way the customer erasure screen does.
 *
 * The dialog is a courtesy, not a control. The control is the area's delete
 * permission on the route — `admin:orders.delete`, `admin:products.delete` —
 * see Middleware/RequireAdmin.php.
 */


/* Both the versioned <script src> and the unversioned imports evaluate this
   file, so module-scoped state is per-instance. Anything that must be a
   singleton — the one dialog element, the one toast — hangs off globalThis,
   for the same reason admin-shell.js keeps its screen registry there. */
const state = (globalThis.grAdminDelete ??= { session: null, dialog: null, toast: null, toastTimer: 0 });

/* The shell hands the session to every screen; catching it here too means no
   caller has to thread it through to ask "may I draw a delete button?". */
document.addEventListener('admin:ready', (e) => { state.session = e.detail?.session ?? null; });

/**
 * May the signed-in staff member do one specific thing?
 *
 * The session carries a flat list of `area.action` strings, already expanded —
 * an owner arrives with every permission spelled out rather than a wildcard to
 * interpret. So this is a membership test and nothing more; every rule about
 * what the list CONTAINS lives on the server, in AdminUser.
 *
 * @param {string} permission e.g. 'orders.delete'
 */
export function may(permission, session = state.session) {
  const held = session?.permissions;
  if (!Array.isArray(held)) return false;
  // '*' should never reach a browser — the server expands it — but honouring
  // it costs one comparison and avoids an owner losing every button to a
  // serialisation change nobody thought to check here.
  return held.includes('*') || held.includes(permission);
}

/**
 * May they delete in this area?
 *
 * THIS USED TO BE `session.role === 'owner'`, FOR EVERY SCREEN AT ONCE
 * -------------------------------------------------------------------
 * That was one rule, deliberately, back when deleting was one question with
 * the same answer everywhere. Permissions are per area now, which is the whole
 * point — "may work orders but not delete them" is a thing a shop wants to be
 * able to say — so the caller has to name the area it is drawing buttons for.
 *
 * The area is required rather than defaulted. A default would silently pick a
 * side on every call site that forgot to pass one, and half of them would be
 * wrong in the permissive direction.
 *
 * @param {string} area e.g. 'orders'
 */
export function canDelete(area, session = state.session) {
  return may(`${area}.delete`, session);
}

/**
 * Ask before deleting. Resolves true if the answer is yes.
 *
 * Native <dialog>, so focus trapping, Escape, the backdrop and the top layer
 * are the browser's job rather than four more things to get subtly wrong. The
 * cancel button holds initial focus: the default answer to "shall I delete
 * this?" is no, and a keyboard user who hits Enter on reflex should not lose a
 * record to it.
 *
 * @param {object} o
 * @param {string} o.title      what is being deleted, in the merchant's words
 * @param {string} [o.body]     the consequence, one sentence
 * @param {string} [o.confirm]  button text, defaults to "Delete"
 * @param {string} [o.undo]     the reassurance; pass '' to omit it entirely
 * @returns {Promise<boolean>}
 */
export function confirmDelete({ title, body = '', confirm = 'Delete', undo } = {}) {
  const dlg = ensureDialog();

  dlg.querySelector('[data-adel-title]').textContent = title;

  const bodyEl = dlg.querySelector('[data-adel-body]');
  bodyEl.textContent = body;
  bodyEl.hidden = !body;

  // The default reassurance is true for everything routed through here. A
  // caller that hard-deletes must pass its own line — or, better, not use this.
  const undoText = undo === undefined
    ? 'It moves to the Deleted tab, where you can put it back.'
    : undo;
  const undoEl = dlg.querySelector('[data-adel-undo]');
  undoEl.textContent = undoText;
  undoEl.hidden = !undoText;

  dlg.querySelector('[data-adel-confirm]').textContent = confirm;

  return new Promise((resolve) => {
    // `close` rather than the buttons' own clicks: Escape and the backdrop
    // both close the dialog without either button being pressed, and those
    // must resolve false rather than leave the promise hanging forever.
    dlg.addEventListener('close', () => resolve(dlg.returnValue === 'confirm'), { once: true });
    dlg.showModal();
    dlg.querySelector('[data-adel-cancel]').focus();
  });
}

function ensureDialog() {
  if (state.dialog?.isConnected) return state.dialog;

  document.body.insertAdjacentHTML('beforeend', [
    '<dialog class="adel" data-adel>',
    '  <form method="dialog" class="adel__panel">',
    '    <h2 class="adel__title" data-adel-title></h2>',
    '    <p class="adel__body" data-adel-body hidden></p>',
    '    <p class="adel__undo" data-adel-undo hidden></p>',
    '    <div class="adel__actions">',
    '      <button type="submit" value="cancel" class="btn-gr btn-outline-gr" data-adel-cancel>Cancel</button>',
    '      <button type="submit" value="confirm" class="btn-gr btn-danger-gr" data-adel-confirm>Delete</button>',
    '    </div>',
    '  </form>',
    '</dialog>',
  ].join('\n'));

  state.dialog = document.querySelector('[data-adel]');
  return state.dialog;
}

/**
 * Say what just happened, without stealing the screen.
 *
 * Floating and shared, rather than each screen reserving a strip of layout for
 * a message it shows twice a day. Failures stay up until dismissed or replaced
 * — a failure that fades after four seconds is a failure somebody misses and
 * then cannot find out about.
 *
 * @param {string} message
 * @param {boolean} [ok] false paints it as a failure and stops the auto-hide
 */
export function toast(message, ok = true) {
  const el = ensureToast();

  el.textContent = message;
  el.className = 'atoast atoast--' + (ok ? 'ok' : 'bad') + ' is-on';
  el.hidden = false;

  clearTimeout(state.toastTimer);
  if (ok) state.toastTimer = setTimeout(() => { el.classList.remove('is-on'); }, 4000);
}

function ensureToast() {
  if (state.toast?.isConnected) return state.toast;

  // role=status, not alert: this reports the result of something the user just
  // did deliberately. An assertive live region interrupts whatever a screen
  // reader was mid-sentence on, which is the wrong trade for "Saved."
  document.body.insertAdjacentHTML('beforeend',
    '<p class="atoast" role="status" aria-live="polite" data-atoast hidden></p>');

  state.toast = document.querySelector('[data-atoast]');
  state.toast.addEventListener('click', () => state.toast.classList.remove('is-on'));
  return state.toast;
}
