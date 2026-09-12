/**
 * pixel-page.js — the Pixel setup screen: Meta's three keys, and proof they work.
 *
 * The screen is authored in pixel.main.html; this file only moves the server's
 * answer into controls that already exist, and the owner's answer back.
 *
 * EVERYTHING PAINTED IS PAINTED FROM THE SERVER'S LAST ANSWER
 * ----------------------------------------------------------
 * After a save the form is redrawn from the RESPONSE, not from what was sent.
 * The server normalises what it stores (and may refuse part of it), so that is
 * the one moment this screen can be sure it is showing the shop rather than
 * the intention. The same holds for test mode and for "write it into every
 * page again" — both answer with the whole state, and the whole state is what
 * gets drawn.
 *
 * THE TOKEN NEVER COMES BACK
 * --------------------------
 * The server answers with a preview and a length, and nothing on this screen
 * could show more if it wanted to. The box is empty on every load and after
 * every save, and empty means "keep the saved one". Show/Hide only ever
 * unmasks what is being typed right now.
 *
 * A VIEW-ONLY SESSION SEES EVERYTHING AND CAN PRESS NOTHING
 * --------------------------------------------------------
 * settings.view reads, settings.edit writes. Without edit the inputs stay
 * disabled and every button that would change the shop is hidden rather than
 * greyed — a control that refuses the person looking at it only raises the
 * question of why it is there. The routes refuse on their own either way.
 */

import { adminFetch, isBackendAbsent } from '../admin/backend/api.js';
import { escapeHtml } from '../admin/admin-shell.js';
import { may, confirmAction } from '../admin/admin-delete.js';

const $ = (sel, root = document) => root.querySelector(sel);

/** The last state the server sent. Every paint reads from this and nothing else. */
let state = null;
/** May this session change anything? Decided once, from the session. */
let canEdit = false;
/** No backend at all: the screen describes, it does not control. */
let offline = false;
/** The test-mode countdown, or null. Module-level so there is only ever one. */
let clock = null;
/** Something is being sent right now — a second press must not send it twice. */
let working = false;

/* Every 30 seconds: the countdown is shown in whole minutes, so a faster tick
   would redraw the same number, and a slower one lets "1 minute left" stand
   for most of a minute after it has become untrue. */
const TICK_MS = 30000;

const SAVE_LABEL = 'Save and apply to every page';
const SEND_LABEL = 'Send test event';
const STAMP_LABEL = 'Write it into every page again';

document.addEventListener('admin:ready', init);

function init({ detail }) {
  const form = $('[data-px-form]');
  if (!form) return;

  canEdit = may('settings.edit', detail?.session);

  wire(form);
  applyAccess();
  load();
}

/* ---- Loading ------------------------------------------------------------ */

async function load() {
  let payload;
  try {
    payload = await adminFetch('/marketing/pixel');
  } catch (err) {
    if (isBackendAbsent(err)) return goOffline();
    const box = $('[data-px-error]');
    box.hidden = false;
    box.textContent = err.status === 403
      ? 'Your role cannot open the pixel keys. Ask an owner.'
      : `Could not load the pixel settings: ${err.message}`;
    return;
  }

  paint(payload.data, { refill: true });
  liveCheck();
}

/**
 * A quiet re-read, for when the screen knows its copy has gone stale — the
 * test-mode clock running out is the case. No error box on failure: the screen
 * already shows the last good answer, and the next action tries again.
 */
async function refresh() {
  try {
    const { data } = await adminFetch('/marketing/pixel');
    paint(data);
  } catch { /* keep what is on screen */ }
}

function goOffline() {
  offline = true;
  $('[data-px-offline]').hidden = false;
  $('[data-px-fields]').disabled = true;
  const save = $('[data-px-save]');
  save.textContent = 'Saving needs the backend';
  // Everything below the form reports on a server that is not there. Showing
  // it empty would be the screen pretending; hiding it is the screen saying
  // nothing, which is the truth.
  for (const sel of ['[data-px-strip]', '[data-px-check]', '[data-px-health]']) $(sel).hidden = true;
}

/* ---- Wiring ------------------------------------------------------------- */

function wire(form) {
  const pixel = $('#px-id');
  const token = $('#px-token');
  const test = $('#px-test');

  /* A Pixel ID is digits and nothing else, so anything else is removed as it
     arrives — the spaces Meta's own page puts in when a number is selected
     with the mouse, most often. */
  pixel.addEventListener('input', () => {
    tidy(pixel, (v) => v.replace(/\D+/g, ''));
    edited('pixelId');
  });

  /* A paste that CONTAINS an id is taken for the id. Events Manager's address
     bar carries it (…/pixel/1423900436303846/overview?business_id=…), and
     stripping that to digits would glue the business id onto the end. */
  pixel.addEventListener('paste', (e) => {
    const text = e.clipboardData?.getData('text') ?? '';
    const run = text.match(/(?:^|\D)(\d{15,16})(?!\d)/);
    if (!run || run[1] === text.trim()) return;   // a bare id pastes as itself
    e.preventDefault();
    pixel.value = run[1];
    pixel.dispatchEvent(new Event('input', { bubbles: true }));
  });

  // A token never contains whitespace; a pasted one often ends in a newline.
  token.addEventListener('input', () => {
    tidy(token, (v) => v.replace(/\s+/g, ''));
    edited('accessToken');
  });

  /* Meta's Test events tab shows `test_event_code: TEST94842` beside its Copy
     button, and a mouse selection takes the label along with the code. Either
     is accepted: the label is dropped and the code is upper-cased, which is
     the only form Meta ever issues. */
  test.addEventListener('input', () => {
    tidy(test, cleanTestCode);
    edited('testEventCode');
  });

  $('[data-px-reveal]').addEventListener('click', () => reveal(token.type === 'password'));

  $('[data-px-remove]').addEventListener('change', (e) => {
    // Removing and replacing in the same save is a contradiction; the box
    // steps aside rather than letting both be sent.
    token.disabled = e.target.checked;
    if (e.target.checked) { token.value = ''; reveal(false); }
    edited('accessToken');
  });

  $('[data-px-suggest-use]').addEventListener('click', () => {
    pixel.value = $('[data-px-suggest-id]').textContent;
    edited('pixelId');
    pixel.focus();
  });

  form.addEventListener('submit', save);
  $('[data-px-send]').addEventListener('click', sendTest);
  $('[data-px-mode-on]').addEventListener('click', () => setMode(true));
  $('[data-px-mode-off]').addEventListener('click', () => setMode(false));
  $('[data-px-stamp]').addEventListener('click', stamp);
  $('[data-px-live-again]').addEventListener('click', liveCheck);

  /* A hidden tab must not keep a timer running to redraw a countdown nobody is
     looking at. Coming back redraws at once, because the minutes kept passing
     while it was away. */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return stopClock();
    if (state) { paintStrip(state); paintMode(state); }
    startClock();
  });

  /* A token pasted and not yet saved is the one thing on this screen that is
     expensive to lose: Meta shows it once, and getting another means going
     back through four screens of Events Manager. */
  window.addEventListener('beforeunload', (e) => {
    if (canEdit && !offline && isDirty()) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

/**
 * Normalise a box in place, keeping the caret where the owner left it.
 * Rewriting `value` puts the caret at the end, which makes correcting the
 * middle of a sixteen-digit number impossible — so the caret is moved to where
 * the same cleaning puts the text that was in front of it.
 */
function tidy(input, clean) {
  const raw = input.value;
  const tidied = clean(raw);
  if (tidied === raw) return;
  const at = input.selectionStart ?? raw.length;
  const caret = clean(raw.slice(0, at)).length;
  input.value = tidied;
  if (document.activeElement === input) input.setSelectionRange(caret, caret);
}

function cleanTestCode(v) {
  return v
    .replace(/^\s*["']?test_event_code["']?\s*[:=]\s*/i, '')
    .replace(/["',;\s]+/g, '')
    .toUpperCase();
}

function reveal(show) {
  const token = $('#px-token');
  const btn = $('[data-px-reveal]');
  token.type = show ? 'text' : 'password';
  btn.textContent = show ? 'Hide' : 'Show';
  btn.setAttribute('aria-label', show ? 'Hide the token you are typing' : 'Show the token you are typing');
}

/** Something in the form changed: its old error no longer applies. */
function edited(field) {
  fieldError(field, '');
  // "Saved." beside a form that has since been changed reads as though the
  // change was saved too.
  const said = $('[data-px-save-status]');
  if (said.dataset.tone === 'ok') say(said, '', '');
  refreshForm();
}

/* ---- Access ------------------------------------------------------------- */

function applyAccess() {
  if (canEdit) return;
  $('[data-px-readonly]').hidden = false;
  $('[data-px-save]').hidden = true;
  // The token box shows nothing even to an owner — it only takes a new one —
  // so to somebody who cannot type in it, it is an empty frame and no more.
  $('[data-px-secret]').hidden = true;
  $('[data-px-send-block]').hidden = true;
  $('[data-px-lede]').textContent = 'The keys the shop uses to talk to Meta.';
}

/* ---- Painting ----------------------------------------------------------- */

/**
 * Draw one state. `refill` also puts the saved values into the boxes, which
 * happens on load and after a save — and never after test mode or a re-stamp,
 * which must not wipe out something the owner is halfway through typing.
 */
function paint(s, { refill = false } = {}) {
  state = s;
  if (refill) fill(s);

  // The fieldset opens only once there is something real in it.
  if (!offline) $('[data-px-fields]').disabled = !canEdit;

  $('[data-px-env]').hidden = s.source !== 'env';
  $('[data-px-problem]').hidden = !s.problem;
  $('[data-px-problem-text]').textContent = s.problem || '';
  $('[data-px-error]').hidden = true;

  for (const sel of ['[data-px-strip]', '[data-px-check]', '[data-px-health]']) $(sel).hidden = false;

  paintStrip(s);
  paintToken(s);
  paintMode(s);
  paintHealth(s);
  refreshForm();
  startClock();
}

function fill(s) {
  $('#px-id').value = s.pixelId || '';
  $('#px-test').value = s.testEventCode || '';
  const token = $('#px-token');
  token.value = '';
  token.disabled = false;
  reveal(false);
  $('[data-px-remove]').checked = false;
  for (const f of ['pixelId', 'accessToken', 'testEventCode']) fieldError(f, '');
}

/* The three facts. Each returns a tone, a word, and a sentence; the strip only
   arranges them. The tone is a hint for colour and nothing reads it for
   meaning — the word always says it on its own. */

function paintStrip(s) {
  for (const [key, fact] of [['browser', browserFact(s)], ['capi', capiFact(s)], ['mode', modeFact(s)]]) {
    const el = $(`[data-px-fact="${key}"]`);
    el.dataset.tone = fact.tone;
    $('[data-px-fact-word]', el).textContent = fact.word;
    $('[data-px-fact-line]', el).textContent = fact.line;
  }
}

function browserFact(s) {
  const p = pagesOf(s);
  if (!p.total) return { tone: 'warn', word: 'Unknown', line: 'The server could not read the shop’s pages.' };

  if (p.fromBuild) {
    return { tone: 'ok', word: 'On', line: `On ${p.total} of ${p.total} pages, with pixel ${p.fromBuild} from the site’s build. Nothing is saved here yet.` };
  }
  if (!p.agree) {
    return { tone: 'bad', word: 'Pages disagree', line: s.pixelId
      ? `On ${p.matching} of ${p.total} pages. The others carry something else — see Health below.`
      : `Switched off here, but ${p.total - p.matching} of ${p.total} pages still carry a pixel.` };
  }
  return s.pixelId
    ? { tone: 'ok', word: 'On', line: `On ${p.total} of ${p.total} pages.` }
    : { tone: 'off', word: 'Off', line: `Switched off on all ${p.total} pages. Meta sees no visits.` };
}

function capiFact(s) {
  const f = s.forwarding || {};
  if (!s.accessToken?.set) {
    return { tone: 'off', word: 'Not set up', line: 'Only the browser reports to Meta, and ad blockers hide some visits from it.' };
  }
  if (failing(f)) {
    return { tone: 'bad', word: 'Failing', line: `Meta refused the last event: ${clip(f.lastFailure.message, 110)}` };
  }
  if (f.available === false) {
    return { tone: 'info', word: 'Ready', line: 'Token saved. Sending figures are not available on this server yet.' };
  }
  if (f.sent > 0) {
    return { tone: 'ok', word: 'Sending', line: `${num(f.sent)} ${plural(f.sent, 'event')} sent in the last ${f.hours || 24} hours.`
      + (f.failed ? ` ${num(f.failed)} failed.` : '') };
  }
  return { tone: 'info', word: 'Ready', line: `Token saved. Nothing sent in the last ${f.hours || 24} hours yet.` };
}

function modeFact(s) {
  const m = s.testMode || {};
  if (m.alwaysOn) {
    return { tone: 'warn', word: 'Always on', line: 'The test code comes from the server’s .env file, so it never switches itself off.' };
  }
  if (!s.testEventCode) return { tone: 'off', word: 'Off', line: 'No test code saved. Visits count as normal.' };
  if (modeOn(m)) {
    return { tone: 'info', word: `On until ${hhmm(m.until)}`, line: `${left(m.until)} left. The shop’s events show in Meta’s Test events tab.` };
  }
  return { tone: 'off', word: 'Off', line: 'The test code is saved and resting. Visits count as normal.' };
}

/**
 * A failure is only "failing" if nothing has got through since it. A token
 * that failed once at 09:00 and has sent four hundred events since is
 * working, and calling it failing would teach the owner to ignore the word.
 */
function failing(f) {
  if (!f?.lastFailure) return false;
  if (!f.lastSentAt) return true;
  return Date.parse(f.lastFailure.at) >= Date.parse(f.lastSentAt);
}

/**
 * What the shop's pages carry, in one shape the strip and Health both read.
 *
 * `fromBuild` is the first-visit case: nothing saved here, and every page
 * carrying the pixel the site was built with. That is not a disagreement —
 * nobody has asked for anything else yet — and it must not be offered a
 * re-stamp, which with nothing saved would write "off" into every page.
 */
function pagesOf(s) {
  const p = s.pages || {};
  const total = Number(p.total) || 0;
  const ids = p.ids || {};
  const saved = s.pixelId || '';
  // The server's own count when something is saved; with nothing saved, the
  // pages that agree with "nothing" are the ones with the pixel switched off.
  const matching = Number(saved ? (p.matching ?? ids[saved]) : ids['']) || 0;
  const others = Object.entries(ids)
    .filter(([id, n]) => id !== saved && Number(n) > 0)
    .sort((a, b) => b[1] - a[1]);
  const counted = Object.values(ids).reduce((sum, n) => sum + (Number(n) || 0), 0);

  let fromBuild = '';
  if (!saved && s.source === 'none' && others.length === 1 && others[0][0] !== '' && Number(others[0][1]) === total) {
    fromBuild = others[0][0];
  }

  return {
    total, matching, others, fromBuild,
    // Pages the server found with no pixel block at all.
    unmarked: Math.max(0, total - counted),
    agree: total > 0 && (fromBuild !== '' || matching === total),
  };
}

function paintToken(s) {
  const t = s.accessToken || {};
  const saved = $('[data-px-saved]');

  if (t.set) {
    const size = t.length ? ` · ${num(t.length)} characters` : '';
    let who = '';
    if (s.source === 'env') who = 'From the server’s .env file.';
    else if (s.updatedAt) who = `Saved${s.updatedBy ? ` by ${escapeHtml(s.updatedBy)}` : ''} ${when(s.updatedAt)}.`;
    saved.innerHTML = `<span class="px-saved__what">Saved token <code class="px-code">${escapeHtml(t.preview || '…')}</code>${size}</span>`
      + (who ? `<span class="px-saved__who">${who}</span>` : '');
    saved.dataset.set = '';
  } else {
    saved.innerHTML = '<span class="px-saved__what">No token saved yet.</span>';
    delete saved.dataset.set;
  }

  if (canEdit) {
    // Short enough for a phone's box; the line under it says the rest.
    $('#px-token').placeholder = t.set ? 'Paste a new token' : 'Paste the token here';
  }
  $('[data-px-token-keep]').textContent = !canEdit
    ? 'It is stored encrypted and never shown in full.'
    : t.set
      ? 'Leave it empty to keep the saved token. It is stored encrypted and never shown again in full.'
      : 'It is stored encrypted, and never shown again in full once saved.';

  $('[data-px-remove-wrap]').hidden = !t.set || !canEdit || offline;
}

function paintMode(s) {
  const m = s.testMode || {};
  const line = $('[data-px-mode-line]');
  let offer = '';   // which button to show: 'on', 'off' or none

  if (m.alwaysOn) {
    line.textContent = 'Always on. The test code comes from the server’s .env file, so it has no 60-minute clock.'
      + (s.source === 'env' ? ' Saving the keys on this screen takes over from the .env file.' : '');
  } else if (!s.testEventCode) {
    line.textContent = 'Off. Test mode needs a test event code: add one in key 3 and save.';
  } else if (modeOn(m)) {
    line.innerHTML = `<strong>On until ${escapeHtml(hhmm(m.until))}</strong> — ${escapeHtml(left(m.until))} left. `
      + 'Until then the shop’s events show in Meta’s Test events tab.';
    offer = 'off';
  } else {
    line.innerHTML = `Off. The saved code <code class="px-code">${escapeHtml(s.testEventCode)}</code> is resting, and visits count as normal.`;
    offer = 'on';
  }

  const act = canEdit && !offline;
  $('[data-px-mode-on]').hidden = !(act && offer === 'on');
  $('[data-px-mode-off]').hidden = !(act && offer === 'off');
}

function paintHealth(s) {
  const f = s.forwarding || {};
  $('[data-px-hours]').textContent = String(f.hours || 24);

  const nums = $('[data-px-nums]');
  if (f.available === false) {
    nums.hidden = true;
    $('[data-px-last-sent]').textContent = 'Figures are not available on this server yet.';
  } else {
    nums.hidden = false;
    $('[data-px-sent]').textContent = num(f.sent);
    $('[data-px-failed]').textContent = num(f.failed);
    $('[data-px-skipped]').textContent = num(f.skipped);
    // Only a failure is coloured. "Not sent" is the shipped state before a
    // token exists, not a fault, and painting it would cry wolf.
    $('[data-px-failed]').closest('.px-num').dataset.tone = f.failed > 0 ? 'bad' : '';
    $('[data-px-last-sent]').innerHTML = f.lastSentAt
      ? `Last event sent to Meta ${ago(f.lastSentAt)}.`
      : (s.accessToken?.set ? 'Nothing has been sent to Meta yet.' : 'Nothing is sent to Meta until a token is saved.');
  }

  const errBox = $('[data-px-last-error]');
  errBox.hidden = !f.lastFailure;
  if (f.lastFailure) {
    $('[data-px-last-error-text]').innerHTML = `<strong>Last error from Meta, ${ago(f.lastFailure.at)}:</strong> `
      + `“${escapeHtml(f.lastFailure.message)}”`;
  }

  paintPages(s);
}

function paintPages(s) {
  const p = pagesOf(s);
  const line = $('[data-px-pages]');
  const list = $('[data-px-ids]');
  const saved = s.pixelId || '';

  if (!p.total) {
    line.textContent = 'The server could not read the shop’s pages, so there is nothing to compare.';
  } else if (p.fromBuild) {
    line.innerHTML = `All ${p.total} pages carry pixel ${code(p.fromBuild)}, from the site’s build. Save a Pixel ID above and it is written into every page.`;
  } else if (p.agree) {
    line.innerHTML = saved
      ? `All ${p.total} pages carry pixel ${code(saved)}, ${theOne(s)}.`
      : `The pixel is switched off on all ${p.total} pages, as saved here.`;
  } else {
    line.innerHTML = saved
      ? `${p.matching} of ${p.total} pages carry pixel ${code(saved)}, ${theOne(s)}. The others:`
      : `The pixel is switched off here, and on ${p.matching} of ${p.total} pages. The others:`;
  }

  const one = (n) => Number(n) === 1;
  const rows = p.agree ? [] : [
    ...p.others.map(([id, n]) => (id
      ? `<li><strong>${num(n)} ${plural(n, 'page')}</strong> ${one(n) ? 'carries' : 'carry'} pixel ${code(id)}</li>`
      : `<li><strong>${num(n)} ${plural(n, 'page')}</strong> ${one(n) ? 'has' : 'have'} the pixel switched off</li>`)),
    ...(p.unmarked ? [`<li><strong>${num(p.unmarked)} ${plural(p.unmarked, 'page')}</strong> ${one(p.unmarked) ? 'was' : 'were'} built before this screen existed</li>`] : []),
  ];
  list.innerHTML = rows.join('');
  list.hidden = !rows.length;

  // Re-stamping writes what is SAVED HERE, and the server refuses anything
  // else: with nothing saved there is nothing to write but "off", and keys
  // from .env are taken over by saving, not by re-stamping.
  const fixable = !p.agree && p.total > 0 && canEdit && !offline;
  $('[data-px-stamp-row]').hidden = !(fixable && s.source === 'panel');
  $('[data-px-stamp-env]').hidden = !(fixable && s.source === 'env');
}

/* ---- The form's own state ---------------------------------------------- */

function values() {
  return {
    pixelId: $('#px-id').value.trim(),
    accessToken: $('#px-token').value.trim(),
    removeAccessToken: $('[data-px-remove]').checked,
    testEventCode: $('#px-test').value.trim(),
  };
}

function isDirty() {
  if (!state) return false;
  const v = values();
  return v.pixelId !== (state.pixelId || '')
    || v.accessToken !== ''
    || v.removeAccessToken
    || v.testEventCode !== (state.testEventCode || '');
}

/** Everything that depends on what is typed rather than on what is saved. */
function refreshForm() {
  if (!state) return;

  // The first-visit guard: an empty Pixel ID box over pages that carry a
  // pixel would switch it off on save. Say so, and offer the id back.
  const carried = pagesOf(state).others.find(([id]) => id !== '')?.[0] || '';
  const suggest = canEdit && !offline && !$('#px-id').value && !state.pixelId && carried;
  $('[data-px-suggest]').hidden = !suggest;
  if (suggest) $('[data-px-suggest-id]').textContent = carried;

  // The same warning, for a box that has just been emptied over a saved id:
  // the sentence that was background reading becomes the thing to read.
  const hint = $('[data-px-id-off]');
  if (canEdit && !$('#px-id').value && state.pixelId) hint.dataset.tone = 'warn';
  else delete hint.dataset.tone;

  const why = sendBlocker();
  const send = $('[data-px-send]');
  const note = $('[data-px-send-why]');
  send.disabled = Boolean(why) || working;
  note.hidden = !why;
  note.textContent = why;
}

/** Why the test cannot be sent right now, or '' when it can. */
function sendBlocker() {
  if (offline) return 'Sending a test needs the backend.';
  if (!state) return 'The keys have not loaded yet.';
  if (isDirty()) return 'Save first — the test uses the saved keys.';
  if (!state.pixelId) return 'Add the Pixel ID first (key 1), then save.';
  if (!state.accessToken?.set) return 'Add the access token first (key 2), then save. The test is sent by the server, and the token is what lets it speak to Meta.';
  if (!state.testEventCode) return 'Add the test event code first (key 3) — without it the event would count as a real visit.';
  return '';
}

function fieldError(field, message) {
  const slot = $(`[data-px-err="${field}"]`);
  const input = $(`[data-px-input="${field}"]`);
  if (!slot) return;
  slot.textContent = message;
  slot.hidden = !message;
  if (input) {
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }
}

/* ---- Save --------------------------------------------------------------- */

async function save(e) {
  e.preventDefault();
  if (!canEdit || offline || working || !state) return;

  const btn = $('[data-px-save]');
  const said = $('[data-px-save-status]');
  const fields = $('[data-px-fields]');
  const body = values();
  for (const f of ['pixelId', 'accessToken', 'testEventCode']) fieldError(f, '');

  // SWITCHING THE PIXEL OFF IS ASKED ABOUT BY NAME.
  // It is one empty box away — the likeliest first visit is somebody pasting
  // the token and the test code into a screen whose Pixel ID box is still
  // blank — and it silences every page of the shop at once, with nothing on
  // the storefront to show it happened. The warning beside the box is
  // background reading; a Save is a reflex. So the reflex gets a question,
  // with Cancel holding focus.
  const running = state.pixelId || pagesOf(state).others.find(([id]) => id !== '')?.[0] || '';
  if (!body.pixelId && running) {
    const pages = pagesOf(state).total;
    const ok = await confirmAction({
      title: 'Switch the Meta pixel off?',
      body: `The Pixel ID box is empty, so saving takes pixel ${running} off ${pages === 1 ? 'the page' : `all ${pages} pages`} of the shop. `
        + 'Your ads stop seeing visits and orders until a Pixel ID is saved again.',
      confirm: 'Switch it off',
      note: 'To keep it on, choose Cancel and put the Pixel ID back in box 1.',
      tone: 'danger',
    });
    if (!ok) {
      $('#px-id').focus();
      return;
    }
  }

  working = true;
  btn.disabled = true;
  btn.textContent = 'Saving…';
  // Locked while the request is out: the answer repaints every box from what
  // the server stored, and anything typed in the meantime would be thrown away
  // without a word.
  fields.disabled = true;
  say(said, 'Saving, and writing every page…', 'wait');

  try {
    const { data, meta } = await adminFetch('/marketing/pixel', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    paint(data, { refill: true });
    stampReport(said, meta?.stamp, data, 'Saved.');
    liveCheck();
  } catch (err) {
    if (err.status === 422) {
      showFieldErrors(err, said);
    } else if (isBackendAbsent(err)) {
      say(said, 'Not saved — there is no backend to save to. Nothing changed on the shop.', 'bad');
    } else {
      say(said, `Not saved. ${err.message}`, 'bad');
    }
  } finally {
    working = false;
    btn.disabled = false;
    btn.textContent = SAVE_LABEL;
    fields.disabled = offline || !canEdit;
    refreshForm();
  }
}

/**
 * Laravel keys its 422 by field, and each message goes under the box it is
 * about. Anything keyed to a field this screen does not draw still has to be
 * said somewhere, so it joins the line beside the button.
 */
function showFieldErrors(err, said) {
  const errors = err.body?.errors || {};
  const known = ['pixelId', 'accessToken', 'testEventCode'];
  let first = null;
  const loose = [];

  for (const [field, list] of Object.entries(errors)) {
    const msg = [].concat(list).join(' ');
    if (known.includes(field)) {
      fieldError(field, msg);
      first ??= $(`[data-px-input="${field}"]`);
    } else {
      loose.push(msg);
    }
  }

  const head = first ? 'Not saved — please check the boxes marked in red.' : `Not saved. ${err.message}`;
  say(said, [head, ...loose].join(' '), 'bad');
  // To the first box that needs fixing, so the keyboard lands where the work is.
  first?.focus();
}

/**
 * What the write did to the pages, honestly. A page that could not be written
 * still serves the old pixel, so it is named, with the server's reason.
 */
function stampReport(el, stamp, s, lead) {
  const failed = Object.entries(stamp?.failed || {});
  const pages = Number(stamp?.pages ?? s.pages?.total ?? 0);
  const done = Math.max(0, pages - failed.length);
  const what = s.pixelId ? `The pixel is now on ${done} ${plural(done, 'page')}.` : `The pixel is now switched off on ${done} ${plural(done, 'page')}.`;

  if (!failed.length) return say(el, `${lead} ${what}`, 'ok');

  el.dataset.tone = 'bad';
  el.innerHTML = `<p>${escapeHtml(lead)} ${escapeHtml(what)} But ${failed.length} ${plural(failed.length, 'page')} could not be written, and still ${failed.length === 1 ? 'serves' : 'serve'} the old setting:</p>`
    + `<ul class="px-fails">${failed.map(([path, why]) => `<li><code class="px-code">${escapeHtml(path)}</code> — ${escapeHtml(why)}</li>`).join('')}</ul>`
    + `<p>Press “${STAMP_LABEL}” under Health to try again.</p>`;
}

/* ---- Send a test event -------------------------------------------------- */

async function sendTest() {
  if (sendBlocker() || working) return;
  const btn = $('[data-px-send]');
  const out = $('[data-px-send-result]');

  working = true;
  btn.disabled = true;
  btn.textContent = 'Sending…';
  say(out, 'Sending one test PageView to Meta…', 'wait');

  try {
    const { data } = await adminFetch('/marketing/pixel/test', { method: 'POST' });
    const got = Number(data?.eventsReceived ?? 0);
    if (got > 0) {
      out.dataset.tone = 'ok';
      out.innerHTML = `<p><strong>Sent${data.sentAt ? ` at ${escapeHtml(clockTime(data.sentAt))}` : ''}.</strong> `
        + `Meta received ${got === 1 ? 'it' : `${num(got)} events`}. In Events Manager, Test events, a ${escapeHtml(data.eventName || 'PageView')} marked “Server” should be there now`
        + `${data.testEventCode ? `, under test code ${code(data.testEventCode)}` : ''}.</p>`
        + (data.fbtraceId ? `<p class="px-said__ref">Meta’s reference for this event: ${code(data.fbtraceId)}</p>` : '');
    } else {
      say(out, 'Meta answered, but counted no events. Check that the Pixel ID and the token belong to the same pixel.', 'warn');
    }
  } catch (err) {
    if (err.status === 429) say(out, 'That was pressed a moment ago. Wait a minute, then try again.', 'warn');
    else if (isBackendAbsent(err)) say(out, 'Not sent — there is no backend here.', 'bad');
    // 422 and 502 arrive as a plain sentence written for this screen.
    else say(out, `Not sent. ${err.message}`, 'bad');
  } finally {
    working = false;
    btn.textContent = SEND_LABEL;
    refreshForm();
  }
}

/* ---- Test mode ---------------------------------------------------------- */

async function setMode(on) {
  if (working) return;
  const btn = $(on ? '[data-px-mode-on]' : '[data-px-mode-off]');
  const said = $('[data-px-mode-status]');

  working = true;
  btn.disabled = true;
  say(said, on ? 'Turning test mode on…' : 'Stopping test mode…', 'wait');

  try {
    const { data } = await adminFetch('/marketing/pixel/test-mode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ on }),
    });
    paint(data);
    const m = data.testMode || {};
    say(said, on
      ? (modeOn(m) ? `Test mode is on until ${hhmm(m.until)}.` : 'Test mode is on.')
      : 'Test mode is off. Visits count as normal again.', 'ok');
    // The pressed button has just been swapped for its opposite. Focus goes
    // with it, rather than falling to the top of the page.
    const other = $(on ? '[data-px-mode-off]' : '[data-px-mode-on]');
    if (!other.hidden) other.focus();
  } catch (err) {
    if (isBackendAbsent(err)) say(said, 'Nothing changed — there is no backend here.', 'bad');
    else say(said, err.status === 422 ? err.message : `Could not change test mode. ${err.message}`, 'bad');
  } finally {
    working = false;
    btn.disabled = false;
    refreshForm();
  }
}

function modeOn(m) {
  if (!m?.active) return false;
  if (m.alwaysOn || !m.until) return true;
  return Date.parse(m.until) > Date.now();
}

function startClock() {
  stopClock();
  const m = state?.testMode;
  if (document.hidden || !m || m.alwaysOn || !modeOn(m) || !m.until) return;
  clock = setInterval(tick, TICK_MS);
}

function stopClock() {
  if (clock) clearInterval(clock);
  clock = null;
}

function tick() {
  if (!state) return stopClock();
  if (!modeOn(state.testMode)) {
    // The server stopped honouring the code at the same moment. Draw it as
    // off now, then ask the server, which has the final word.
    stopClock();
    state = { ...state, testMode: { ...state.testMode, active: false } };
    paintStrip(state);
    paintMode(state);
    refresh();
    return;
  }
  paintStrip(state);
  paintMode(state);
}

/* ---- Write it into every page again ------------------------------------ */

async function stamp() {
  if (working) return;
  const btn = $('[data-px-stamp]');
  const said = $('[data-px-stamp-status]');

  working = true;
  btn.disabled = true;
  btn.textContent = 'Writing…';
  say(said, 'Writing the pixel into every page…', 'wait');

  try {
    const { data, meta } = await adminFetch('/marketing/pixel/stamp', { method: 'POST' });
    paint(data);
    stampReport(said, meta?.stamp, data, 'Done.');
    liveCheck();
    // When it worked the button has gone with the disagreement; the report is
    // where the keyboard should be.
    if (btn.closest('[hidden]')) { said.tabIndex = -1; said.focus(); }
  } catch (err) {
    if (isBackendAbsent(err)) say(said, 'Nothing written — there is no backend here.', 'bad');
    else say(said, err.status === 422 ? err.message : `Nothing written. ${err.message}`, 'bad');
  } finally {
    working = false;
    btn.disabled = false;
    btn.textContent = STAMP_LABEL;
    refreshForm();
  }
}

/* ---- What visitors actually get ---------------------------------------- */

/**
 * The home page, fetched the way a visitor fetches it: fresh, and without the
 * admin's cookies. The pages on disk can be right while a page cache or the
 * CDN is still handing out the old copy, and only this sees that.
 *
 * DOMParser rather than a regex: it builds an inert document — no scripts
 * run, nothing loads — and reads the meta the same way analytics.js does.
 */
async function liveCheck() {
  if (offline) return;
  const out = $('[data-px-live]');
  const again = $('[data-px-live-again]');
  again.disabled = true;
  say(out, 'Checking your live home page…', 'wait');

  let html;
  try {
    const res = await fetch(`/?pixel-check=${Date.now()}`, { cache: 'no-store', credentials: 'omit' });
    if (!res.ok) throw new Error(String(res.status));
    html = await res.text();
  } catch {
    say(out, 'Could not load your live home page to check it. Try again in a moment.', 'warn');
    again.disabled = false;
    return;
  }
  again.disabled = false;

  const meta = new DOMParser().parseFromString(html, 'text/html').querySelector('meta[name="gr-meta-pixel"]');
  const saved = state?.pixelId || '';
  const cdn = ' If you saved a moment ago, the CDN can take a minute to catch up — check again shortly.';

  if (!meta) {
    return say(out, 'Your live home page was built before this screen existed, so it has no place for the pixel yet. The next deploy of the site adds it.', 'warn');
  }

  const live = (meta.getAttribute('content') || '').trim();
  if (!live) {
    return saved
      ? say(out, `Your live home page has the pixel switched off, but pixel ${saved} is ${state?.source === 'env' ? 'set in the server’s .env file' : 'saved here'}.${cdn}`, 'bad')
      : say(out, 'Your live home page has the pixel switched off, as saved here.', 'off');
  }
  if (!saved && state?.source === 'none') {
    return say(out, `Your live home page carries pixel ${live}, from the site’s build.`, 'ok');
  }
  if (live === saved) return say(out, `Your live home page carries pixel ${live} — ${theOne(state)}.`, 'ok');

  return saved
    ? say(out, `Your live home page carries pixel ${live}, but ${theOne(state)} is ${saved}.${cdn}`, 'bad')
    : say(out, `Your live home page still carries pixel ${live}, but the pixel is switched off here.${cdn}`, 'bad');
}

/* ---- Small things ------------------------------------------------------- */

/** Where the id being compared against lives — "saved here" is untrue while
    the keys still come from the server's .env file. */
function theOne(s) {
  return s?.source === 'env' ? 'the one in the server’s .env file' : 'the one saved here';
}

/** One sentence into a status line, as text — never as markup. */
function say(el, text, tone) {
  el.textContent = text;
  if (tone) el.dataset.tone = tone;
  else delete el.dataset.tone;
}

function code(v) {
  return `<code class="px-code">${escapeHtml(v)}</code>`;
}

function num(n) {
  return new Intl.NumberFormat('en-GB').format(Number(n) || 0);
}

function plural(n, word) {
  return Number(n) === 1 ? word : `${word}s`;
}

function clip(text, max) {
  const t = String(text ?? '');
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function hhmm(iso) {
  const d = new Date(iso);
  return Number.isNaN(+d) ? '' : d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function clockTime(iso) {
  const d = new Date(iso);
  return Number.isNaN(+d) ? '' : d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** "38 minutes left", counted up, so the last minute still says one. */
function left(iso) {
  const mins = Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 60000));
  return `${mins} ${plural(mins, 'minute')}`;
}

/** "on 3 Sep at 14:20", inside a <time> carrying the exact moment. */
function when(iso) {
  const d = new Date(iso);
  if (Number.isNaN(+d)) return '';
  const day = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return `on <time datetime="${escapeHtml(iso)}">${escapeHtml(day)} at ${escapeHtml(hhmm(iso))}</time>`;
}

/**
 * "5 minutes ago", as a <time> whose title is the exact date — the relative
 * words are what a glance wants, the date is there for whoever needs it.
 */
function ago(iso) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const secs = Math.round((Date.now() - t) / 1000);
  let words;
  if (secs < 45) words = 'just now';
  else if (secs < 3600) { const m = Math.max(1, Math.round(secs / 60)); words = `${m} ${plural(m, 'minute')} ago`; }
  else if (secs < 86400) { const h = Math.round(secs / 3600); words = `${h} ${plural(h, 'hour')} ago`; }
  else if (secs < 172800) words = 'yesterday';
  else if (secs < 604800) words = `${Math.round(secs / 86400)} days ago`;
  else words = `on ${new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const full = new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  return `<time datetime="${escapeHtml(iso)}" title="${escapeHtml(full)}">${escapeHtml(words)}</time>`;
}
