/**
 * Catalog · module API
 * Thin re-export of the shared data-service today. When the REST API lands,
 * this becomes the catalog client (fetch + auth header) and the pages keep
 * importing the same names.
 */
export {
  getAllProducts, getProductById, getProductsByCategory, getRelated,
  searchProducts, suggest, getCategories, getCategoryBySlug,
} from '../../../shared/js/core/data-service.js';

// TODO: backend — replace the shared data-service internals with API calls;
// no change needed here or in the catalog pages.
