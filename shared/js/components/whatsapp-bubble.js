/**
 * whatsapp-bubble.js — the floating chat button.
 *
 * Chat-before-COD is how this market buys: the question is not whether
 * customers will want to talk before ordering, it is whether the shop
 * answers. Same contract as the footer socials (site-config.js): an empty
 * number renders NOTHING — a chat button that opens a dead number is worse
 * than no button — and filling the config lights it up on every page, no
 * deploy beyond the push.
 */

import { CONFIG } from '../core/site-config.js';

export function initWhatsAppBubble() {
  const digits = String(CONFIG.whatsapp || '').replace(/\D/g, '');
  if (!digits) return;
  if (document.querySelector('[data-admin-shell], .wa-bubble')) return;

  const a = document.createElement('a');
  a.className = 'wa-bubble';
  a.href = `https://wa.me/${digits}`;
  a.target = '_blank';
  a.rel = 'noopener';
  a.setAttribute('aria-label', 'Chat with us on WhatsApp');
  a.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">'
    + '<path d="M12 2a10 10 0 0 0-8.65 15L2 22l5.13-1.32A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.05.79.81-2.97-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.13c-.25-.12-1.46-.72-1.68-.8-.23-.09-.39-.13-.56.12-.16.25-.63.8-.77.96-.14.17-.29.19-.53.06-.25-.12-1.04-.38-1.98-1.22-.73-.65-1.22-1.45-1.37-1.7-.14-.24-.02-.38.11-.5.11-.11.25-.29.37-.43.12-.15.16-.25.25-.42.08-.16.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.48c-.16 0-.43.06-.66.31-.22.25-.86.84-.86 2.05 0 1.2.88 2.37 1 2.53.12.17 1.73 2.64 4.2 3.7.59.26 1.05.41 1.4.52.59.19 1.13.16 1.56.1.47-.07 1.46-.6 1.67-1.18.2-.58.2-1.07.14-1.18-.06-.1-.22-.16-.47-.28z"/></svg>';
  document.body.appendChild(a);
}
