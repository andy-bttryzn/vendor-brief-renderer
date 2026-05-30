# CSV adapter example

Shows the boundary between your data source and the renderer.

The point of this example isn't CSV — it's the *shape* of an adapter. Your real adapter will pull from monday, Salesforce, Airtable, your own database, or wherever your vendor data lives. The output is always the `vendor.json` shape the renderer expects.

## Files

- `adapter.js` — reads 3 CSVs (vendor / tasks / contacts), produces `vendor.json` on stdout
- `sample-vendor.csv` — one row of vendor data
- `sample-tasks.csv` — rows of tasks, joined to vendor by `vendor_id`
- `sample-contacts.csv` — rows of contacts, joined to vendor by `vendor_id`

## End-to-end run

```bash
# Adapter → JSON → renderer → Markdown
node adapter.js sample-vendor.csv sample-tasks.csv sample-contacts.csv \
  | node ../../index.js -
```

The renderer accepts `-` as a filename to read JSON from stdin. This makes pipe composition clean.

## What the adapter does

1. Reads 3 CSVs (tiny built-in parser; swap for `csv-parse` / `papaparse` if you have complex CSVs)
2. Joins tasks to vendor by `vendor_id`, groups by `group` column
3. Joins contacts to vendor by `vendor_id`, splits active vs inactive by `status` column
4. Splits pipe-delimited tag fields (`Solar|Roofing` → `["Solar", "Roofing"]`)
5. Emits the structured `vendor.json` matching the renderer's contract

## Adapt this to your stack

The structure is:

```js
function toVendor(vendorRow, taskRows, contactRows) {
  return {
    vendor:    { ... },        // basic identity + classification
    contacts:  { active, inactive },
    tasks:     { blockers, ongoing, upcoming, completed },
    links:     [...],
    inboxMatrix: [...],
    reference: { ... },
    synthesis: '...',
    openItems: [...],
    recommendedActions: [...],
    headerMeta: { generatedAt, scope },
  };
}
```

Replace `parseCSV(fs.readFileSync(...))` with your own source-of-truth fetch:

- monday.com: use the `monday-helper` sibling project
- Salesforce: REST `/sobjects/Account/{id}` + child queries
- Airtable: `airtable` SDK or HTTP
- Database: whatever your ORM gives you

The boundary is the function signature: *input is whatever your store hands you; output is `vendor.json`.* Everything else stays the same.

## Common adapter footguns

- **Missing `vendor_id` on tasks or contacts.** The adapter silently drops rows whose `vendor_id` doesn't match. Add a count-check + warning before shipping.
- **Pipe-delimited tags vs comma-delimited tags.** Pick one convention and use it everywhere. This adapter uses pipe.
- **Empty strings vs null.** The renderer treats `''` and `null` and missing fields as equivalent ("no data"). Your source store may distinguish; normalize in the adapter.
- **Date format.** The renderer accepts ISO 8601. If your store hands you `2026-05-26 14:00:00` without a `T` / `Z`, parse and reformat in the adapter.
