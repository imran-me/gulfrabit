/**
 * skeleton-loader — shimmer placeholders shown while mock JSON "loads".
 * Loading states are designed, not default (no bare spinner, no layout jump).
 *
 * Helpers return HTML strings you drop into a grid/rail before data arrives,
 * then replace with real cards once data-service resolves.
 */

/** A single product-card skeleton matching the real card's footprint. */
export function productCardSkeleton() {
  return `
    <div class="product-card" aria-hidden="true">
      <div class="skeleton skeleton--media"></div>
      <div class="product-card__body">
        <div class="skeleton skeleton--text" style="width:40%"></div>
        <div class="skeleton skeleton--text" style="width:85%"></div>
        <div class="skeleton skeleton--text" style="width:55%"></div>
        <div class="skeleton skeleton--text" style="width:30%;height:1.2em;margin-top:.4em"></div>
      </div>
    </div>`;
}

/** Fill a container with N product-card skeletons. */
export function renderProductSkeletons(container, count = 8) {
  if (!container) return;
  container.innerHTML = Array.from({ length: count }, productCardSkeleton).join('');
}

/** Generic line skeletons (for text blocks, spec tables, etc.). */
export function textSkeletons(lines = 3, widths = ['100%', '90%', '75%']) {
  return Array.from({ length: lines }, (_, i) =>
    `<div class="skeleton skeleton--text" style="width:${widths[i % widths.length]}"></div>`).join('');
}
