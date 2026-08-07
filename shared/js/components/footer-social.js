/**
 * footer-social.js — show a footer contact surface only when there is
 * somewhere to go.
 *
 * The footer ships its social icons and contact rows (helpline, WhatsApp)
 * hidden. Each is revealed only if site-config.js names a URL or number for
 * it, so an unconfigured shop shows nothing rather than links to "#". The
 * helpline and WhatsApp used to be an announce-bar line and a floating
 * bubble; they now live in the Customer Care column, same contract. Nothing
 * here runs on a page without a footer, and a missing config value is the
 * normal case, not an error.
 */

import { CONFIG } from '../core/site-config.js';

export function initFooterSocial() {
  for (const a of document.querySelectorAll('[data-social]')) {
    const url = CONFIG.social?.[a.dataset.social];
    if (!url) continue;                       // stays hidden

    a.href = url;
    a.target = '_blank';
    // noopener because target=_blank otherwise hands the new tab a live
    // reference back to this window; noreferrer keeps the referrer off it.
    a.rel = 'noopener noreferrer';
    a.hidden = false;
  }

  const phoneRow = document.querySelector('[data-contact="phone"]');
  const rawPhone = String(CONFIG.phone || '').trim();
  if (phoneRow && rawPhone) {
    const digits = rawPhone.replace(/\D/g, '');
    const a = phoneRow.querySelector('a');
    // tel: wants the international form; local numbers get the 88 prefix so
    // one tap dials on the phones this traffic arrives on.
    a.href = `tel:+${digits.startsWith('880') ? digits : '88' + digits}`;
    a.querySelector('[data-contact-text]').textContent =
      CONFIG.supportHours ? `${rawPhone} · ${CONFIG.supportHours}` : rawPhone;
    phoneRow.hidden = false;
  }

  const waRow = document.querySelector('[data-contact="whatsapp"]');
  const waDigits = String(CONFIG.whatsapp || '').replace(/\D/g, '');
  if (waRow && waDigits) {
    const a = waRow.querySelector('a');
    a.href = `https://wa.me/${waDigits}`;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    waRow.hidden = false;
  }
}
