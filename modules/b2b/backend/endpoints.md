# B2B · Backend endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/b2b/rfq` | submit a request-for-quote → ticket id, email confirmation |
| GET | `/b2b/products` | industrial catalogue with `specs`, `moq`, `priceTiers` |
| GET | `/b2b/products/{id}/pricing?qty=` | resolved unit price for a quantity |
| GET | `/b2b/datasheets/{id}` | datasheet PDF (auth/gated as needed) |

Notes
- RFQ should create a CRM/ticket record and notify the sales team; respond via
  email within the stated 48h SLA.
- Tiered pricing lives on the product; the server resolves the unit price for a
  requested quantity. Consider account-specific contract pricing for B2B buyers.
