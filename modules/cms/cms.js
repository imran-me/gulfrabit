/**
 * cms.js — applies content overrides to a storefront page.
 *
 * THE ONE THING THIS FILE MAY DO
 * ------------------------------
 * Set `textContent` on an element, or `src`/`alt` on an image. That is the
 * whole surface, and it is enforced here rather than trusted to whoever writes
 * the content.
 *
 * That single restriction delivers both promises at once:
 *
 *   - **Layout cannot be edited.** No classes, no attributes, no structure, no
 *     markup. An editor changes words and pictures; the page they appear in is
 *     the developer's.
 *   - **Stored content cannot execute.** `textContent` never parses HTML, so a
 *     `<script>` typed into a headline is displayed as characters. There is no
 *     sanitiser to get wrong, because nothing is ever parsed.
 *
 * Those are the same rule seen from two directions, which is why an "html"
 * content type would not be a small convenience — it would remove both
 * guarantees in one change.
 *
 * ENHANCEMENT ONLY
 * ----------------
 * The authored HTML is the content. This swaps words in afterwards. If the
 * request fails, the module is deleted, or JavaScript is off, every page still
 * reads exactly as written — which is the property that makes it safe to hand
 * live editing to someone non-technical.
 */

const PAGE = document.documentElement.dataset.cmsPage;

if (PAGE) apply();

async function apply() {
  let overrides;
  try {
    const res = await fetch(`/api/cms/content?page=${encodeURIComponent(PAGE)}`);
    if (!res.ok) return;                 // no backend, or nothing to say
    ({ data: overrides } = await res.json());
  } catch {
    return;                              // authored content stands
  }

  if (!overrides || !Object.keys(overrides).length) return;

  for (const [key, block] of Object.entries(overrides)) {
    // Attribute selector on a value we did not choose: escape it. Keys are
    // constrained server-side, but a selector built from data is a selector
    // waiting to be broken by the first key with a quote in it.
    const nodes = document.querySelectorAll(`[data-cms="${cssEscape(key)}"]`);

    nodes.forEach((node) => {
      if (block.type === 'image') return applyImage(node, block);
      applyText(node, block);
    });
  }
}

function applyText(node, block) {
  // textContent, never innerHTML. This is the line that makes the whole feature
  // safe, and it is deliberately the only way text is ever written here.
  node.textContent = block.value;
}

function applyImage(node, block) {
  const img = node.tagName === 'IMG' ? node : node.querySelector('img');
  if (!img) return;

  // Same-origin paths only. The server validates this too; doing it again here
  // costs nothing and means a compromised or mis-migrated row still cannot turn
  // every visitor into a request to somebody else's host.
  if (!isLocalPath(block.value)) {
    console.warn('[cms] refusing a non-local image path for', block);
    return;
  }

  img.src = block.value;
  if (block.alt !== null && block.alt !== undefined) img.alt = block.alt;
}

function isLocalPath(path) {
  const p = String(path);
  if (p.includes('://') || p.startsWith('//')) return false;
  return p.startsWith('/assets/') || p.startsWith('/uploads/');
}

function cssEscape(value) {
  return window.CSS?.escape ? CSS.escape(value) : String(value).replace(/["\\]/g, '\\$&');
}
