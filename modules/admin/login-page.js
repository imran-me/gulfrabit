/**
 * login-page.js — the staff sign-in form.
 *
 * Deliberately has no shell import: this is the one admin page a signed-out
 * person is meant to reach, so loading admin-shell.js here would bounce them
 * straight back to it.
 */

import { signIn, getSession } from './backend/api.js';

const form = document.querySelector('[data-admin-login]');
const errorEl = document.querySelector('[data-login-error]');
const submit = document.querySelector('[data-login-submit]');

init();

async function init() {
  // Already signed in? Don't make them type it again.
  const session = await getSession().catch(() => null);
  if (session) return void go();

  form?.addEventListener('submit', onSubmit);
}

async function onSubmit(e) {
  e.preventDefault();
  errorEl.hidden = true;

  const email = form.email.value.trim();
  const password = form.password.value;

  if (!email || !password) {
    return fail('Enter your work email and password.');
  }

  submit.disabled = true;
  submit.textContent = 'Signing in…';

  const result = await signIn(email, password);

  if (!result.ok) {
    submit.disabled = false;
    submit.textContent = 'Sign in';
    // The server returns one message for every failure mode on purpose; this
    // just shows whatever it said rather than trying to be more specific.
    return fail(result.message);
  }

  go();
}

function fail(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
  form.password.value = '';
  form.password.focus();
}

/** Return to the screen they were sent away from, if it was one of ours. */
function go() {
  const next = new URLSearchParams(location.search).get('next');
  // Only same-origin admin paths. An open redirect on a login form is how a
  // phishing page borrows your domain's credibility.
  const safe = next && next.startsWith('/modules/admin/') && !next.startsWith('//');
  location.replace(safe ? next : '/modules/admin/index.html');
}
