# vendor-brief-renderer

Turn a structured `vendor.json` into a 10-section Markdown brief.

This is the rendering layer of a vendor-ops workflow. Data gathering (CRM, ticketing, email, whatever lives upstream in your shop) is out of scope. Build a fetcher that produces `vendor.json` matching the contract below, pipe it in, get a brief out.

## Why a renderer-only project

Every vendor-ops shop has its own data sources, label schemes, board IDs, and column conventions. A renderer that *also* tries to be a fetcher ends up either (a) coupled to one shop's stack, or (b) drowning in adapter abstractions. The renderer alone is the portable artifact — give it a JSON file matching the contract, get a clean brief out.

Wire your CRM / ticket / inbox fetchers however your stack demands. The brief shape is the contract.

## Install

```bash
# Node 18+; no runtime deps
git clone <this repo>
cd vendor-brief-renderer
```

## Usage

```bash
node index.js examples/example-vendor.json > brief.md
node index.js examples/example-vendor.json --section 9   # just open-items
node index.js examples/example-vendor.json --no-empty    # hide sections with no data
```

The renderer never crashes. Missing optional fields render as `_unknown_` or get the entire section dropped.

## The 10 sections

| # | Title | Source field |
|---|---|---|
| 1 | Header (name, side, status, rating, URL) | `vendor.*`, `headerMeta.*` |
| 2 | Summary table (verticals, modalities, sourcing, notes) | `vendor.*` |
| 3 | Contacts (active / inactive subsections) | `contacts.active[]`, `contacts.inactive[]` |
| 4 | Inbox matrix (subject / last activity / owner / labels / summary) | `inboxMatrix[]` |
| 5 | Helpful Links | `links[]` |
| 6 | Tasks (Blockers / Ongoing / Upcoming / Completed) | `tasks.{blockers,ongoing,upcoming,completed}[]` |
| 7 | Reference data (free-form k/v) | `reference{}` |
| 8 | Synthesis (analyst prose) | `synthesis` |
| 9 | Open Items (waiting-on tags + sources) | `openItems[]` |
| 10 | Recommended Actions (assignee tags + sources) | `recommendedActions[]` |

## Data contract

```ts
type Vendor = {
  vendor: {
    id?: string;
    name: string;
    side?: 'Buyer' | 'Affiliate' | 'Both' | string;
    status?: string;           // 'Live', 'Onboarding', 'Paused', etc.
    rating?: 1 | 2 | 3 | 4 | 5;
    url?: string;
    notes?: string;
    sourcing?: string;
    verticals?: { live?: string[]; other?: string[] };
    modalities?: { live?: string[]; other?: string[] };
  };
  contacts?: {
    active?:   { name: string; role?: string; email?: string; phone?: string }[];
    inactive?: { name: string; role?: string; email?: string; phone?: string }[];
  };
  tasks?: {
    blockers?:  Task[];
    ongoing?:   Task[];
    upcoming?:  Task[];
    completed?: Task[];
  };
  links?: { url: string; notes?: string }[];
  inboxMatrix?: {
    threadUrl?: string;
    subject?: string;
    lastDate?: string;         // ISO 8601
    owner?: string;
    labels?: string[];
    summary?: string;
  }[];
  reference?: Record<string, string | number>;
  synthesis?: string;          // markdown
  openItems?: {
    text: string;
    waitingOn?: string;
    sources?: (string | { label?: string; url: string })[];
  }[];
  recommendedActions?: {
    text: string;
    assignee?: string;
    sources?: (string | { label?: string; url: string })[];
  }[];
  headerMeta?: {
    generatedAt?: string;      // ISO 8601
    scope?: 'full' | 'thread-segment' | string;
    triggerThreadId?: string;
  };
};

type Task = {
  id?: string;
  name: string;
  status?: string;
  notes?: string;
  updatedAt?: string;          // ISO 8601
  url?: string;
};
```

See `examples/example-vendor.json` and `examples/example-output.md` for a full worked example.

## Programmatic use

```js
const { render } = require('vendor-brief-renderer');
const vendor = require('./acme.json');
const markdown = render(vendor, { noEmpty: true });
fs.writeFileSync('acme.md', markdown);
```

## Design notes

- **Sources line on items 9 + 10.** Every Open Item and Recommended Action carries a `sources` array. Render-time becomes `_Sources: [thread abc](url); [task 501](url)_` — clickable provenance for each conclusion. Bias toward "show your work" so the analyst's call is auditable later.
- **Inactive contacts kept, not hidden.** Useful when re-engaging dormant relationships or attributing past comms. Filtering is a downstream concern.
- **No "blocked" Recommended Action language.** Actions are written as imperatives; if something can't be done, it belongs in Open Items with a `waitingOn`.

## License

MIT. See `LICENSE`.
