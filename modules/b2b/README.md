# Module · B2B Industrial

A distinct sub-brand for procurement teams sourcing raw materials for the
electronics industry — denser, spec-driven, gold-accented. Not retail.

- **b2b-industrial.html** (`_fragments/b2b.main.html`, `b2b-page.js`, `b2b.css`):
  procurement hero + metrics, a **spec-driven component list** (tiered pricing,
  MOQ badges, inline specs), a **datasheet** download list, and an **RFQ** form.
- Renders the `industrial-raw-materials` products with their `specs`, `moq` and
  `priceTiers` from `data/products.json`.

## Backend
`backend/endpoints.md` + `backend/api.js` — RFQ submission + tiered pricing.
