/**
 * support-line.js — the helpline in the announce strip.
 *
 * Dazzline leads its page with "হেল্পলাইন – 01894627009 (সকাল ১০টা থেকে…)"
 * and it is the right instinct: a COD customer is about to promise cash to a
 * website, and a phone number with hours says a human stands behind it. Ours
 * rides the announce bar that already tops every page — a tel: link, so on
 * the phones this traffic arrives on, one tap dials.
 *
 * Config-driven and dormant when empty, like the socials and the WhatsApp
 * bubble: a helpline nobody answers is worse than none.
 */

import { CONFIG } from '../core/site-config.js';

export function initSupportLine() {
  const raw = String(CONFIG.phone || '').trim();
  if (!raw) return;

  const inner = document.querySelector('.announce-bar__inner');
  if (!inner || inner.querySelector('.announce-bar__phone')) return;

  const digits = raw.replace(/\D/g, '');
  const a = document.createElement('a');
  a.className = 'announce-bar__phone';
  a.href = `tel:+${digits.startsWith('880') ? digits : '88' + digits}`;
  a.textContent = CONFIG.supportHours ? `${raw} · ${CONFIG.supportHours}` : raw;
  a.setAttribute('aria-label', 'Call our helpline');

  // Before the delivery line: the number is the part a worried customer is
  // scanning for, and the strip truncates from the end on narrow screens.
  inner.prepend(a);
}
