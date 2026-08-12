/**
 * order-stages.js — what each order stage is CALLED, in one place.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Three screens name these stages: the tab bar on the list, the pill in the
 * table, and the buttons on one order. When the labels lived in each of them,
 * `shipped` was "Shipped" in the table and "Mark shipped" on the button and
 * nobody could say whether those were the same thing. They are, and now they
 * say so from one file.
 *
 * The stage KEYS are the server's, and this file invents none of them — a label
 * here for a status the API does not have would draw a tab that is always
 * empty. What is legal is decided by OrderFulfilmentService; this is the
 * vocabulary, not the rules.
 *
 * NOUNS AND VERBS ARE DIFFERENT WORDS
 * -----------------------------------
 * A tab is a place — "Packing", a shelf things sit on. A button is an act —
 * "Start packing", something you do to this order right now. English has both
 * and the panel should use both; a button labelled "Packing" reads as a
 * statement of fact rather than an offer.
 */

/**
 * The pipeline, in the order it is worked. Mirrors STAGE_ORDER in
 * OrderFulfilmentService — the server sends counts keyed by these.
 */
export const STAGES = [
  { key: 'placed',            label: 'Placed',            tone: 'wait' },
  { key: 'confirmed',         label: 'Confirmed',         tone: 'info' },
  { key: 'packed',            label: 'Packing',           tone: 'wait' },
  { key: 'ready_for_courier', label: 'Ready for courier', tone: 'info' },
  { key: 'shipped',           label: 'With courier',      tone: 'info' },
  { key: 'delivered',         label: 'Delivered',         tone: 'ok'   },
  { key: 'returned',          label: 'Returned',          tone: 'bad'  },
  { key: 'cancelled',         label: 'Cancelled',         tone: 'bad'  },
  { key: 'spam',              label: 'Spam',              tone: 'bad'  },
];

/** What the button that MOVES an order here should say. */
export const TRANSITION_LABELS = {
  confirmed:         'Confirm — call done',
  packed:            'Start packing',
  ready_for_courier: 'Ready for courier',
  shipped:           'Handed to courier',
  delivered:         'Mark delivered',
  cancelled:         'Cancel order',
  returned:          'Mark returned',
  spam:              'Mark as spam',
};

/**
 * Transitions that need a typed reason before they happen.
 *
 * All three end the order, and all three are what a mis-click lands on. The
 * reason is the only record of why an order stopped being one — six months
 * later "cancelled" alone answers nothing.
 */
export const NEEDS_REASON = ['cancelled', 'returned', 'spam'];

const BY_KEY = Object.fromEntries(STAGES.map((s) => [s.key, s]));

/**
 * The human name for a stage key.
 *
 * Falls back to the raw key rather than to "Unknown": if the server grows a
 * status this file has not learned yet, showing `awaiting_stock` is ugly and
 * true, while "Unknown" is tidy and useless.
 */
export function stageLabel(key) {
  return BY_KEY[key]?.label ?? key;
}

/** Pill tone for a stage key. Colour reinforces the word; it never replaces it. */
export function stageTone(key) {
  return BY_KEY[key]?.tone ?? 'wait';
}
