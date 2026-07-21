/**
 * Content · module API (mock)
 * Contact/newsletter are UI-only today. Replace with the /contact and
 * /newsletter endpoints; the pages keep the same call sites.
 */
export async function submitContact(/* payload */) {
  // TODO: backend — POST /contact with server-side validation + spam guard.
  return { ok: true };
}
