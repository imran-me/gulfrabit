/**
 * admin-table-cards.js — what makes the panel's tables readable on a phone.
 *
 * THE PROBLEM
 * Every list screen in this panel is a wide table: orders is ten columns and
 * 817px, products eight and 720, stock, journal, movements, campaigns, quotes
 * and couriers all six or seven. `.atable` carries `min-width: 720px` and
 * `.atable-wrap` scrolls sideways, which is the right answer on a laptop and
 * an unusable one on a 390px screen. The merchant reads an order number, then
 * swipes right to find its total, and by the time the total is on screen the
 * order number has gone — there is no row heading to hold on to. Working the
 * order list from a phone meant scrolling sideways once per column per row.
 *
 * THE ANSWER
 * Under 720px each row becomes a small card and each cell gets its column's
 * name printed beside it. That needs every <td> to know its heading, and the
 * headings already exist — in the <thead> directly above. So rather than
 * hand-authoring data-label on roughly seventy cells across ten renderers,
 * every one of which would drift the first time a column moved, the label is
 * copied from the heading at the same index.
 *
 * WHY IT WATCHES THE DOM
 * These tables are painted by fetch, repainted by every filter, every page of
 * the pager, every bulk action. Labelling once at boot would label the
 * "Loading…" row and nothing after it. The observer is on childList only and
 * this writes attributes, so it cannot retrigger itself.
 *
 * Imported by admin-shell.js, which every screen in the panel already loads —
 * one implementation, ten screens, and a new list screen gets it for free.
 */

/** Cells that span the table are messages, not data. They get no label. */
function labelTable(table) {
  const head = table.tHead?.rows[0];
  const body = table.tBodies[0];
  if (!head || !body) return;

  const headings = [...head.cells].map((th) => th.textContent.trim());

  for (const row of body.rows) {
    [...row.cells].forEach((cell, i) => {
      if (cell.colSpan > 1) { cell.removeAttribute('data-label'); return; }

      const heading = headings[i];
      // An empty heading is deliberate — the select-all checkbox column has
      // one, and the row-actions column at the end has one. A card does not
      // want the words "" printed beside a checkbox.
      if (heading) cell.setAttribute('data-label', heading);
      else cell.removeAttribute('data-label');
    });
  }
}

export function initTableCards(root = document) {
  const scope = root.querySelector?.('[data-admin-shell]') || root.body || root;
  if (!scope || scope.dataset?.tableCards) return;
  if (scope.dataset) scope.dataset.tableCards = 'on';

  const relabel = () => scope.querySelectorAll('table.atable').forEach(labelTable);

  relabel();

  // Coalesced to one pass a frame: a repaint of forty rows is forty childList
  // records, and re-reading the same eight headings forty times is waste.
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; relabel(); });
  }).observe(scope, { childList: true, subtree: true });
}
