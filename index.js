#!/usr/bin/env node
// vendor-brief-renderer — turn a structured vendor.json into a 10-section Markdown brief.
//
// The renderer is the deliverable. Data gathering (monday/CRM/Gmail/whatever
// upstream lives in your shop) is out of scope; ship a vendor.json that matches
// the contract documented in README.md, and this prints the brief.
//
// Usage:
//   node index.js vendor.json
//   node index.js vendor.json --section 9        # render only section 9
//   node index.js vendor.json --no-empty         # skip sections with no data
//
// Schema in TS notation:
//   See examples/example-vendor.json + README.md for the full contract.
//
// Output: Markdown on stdout. The renderer never crashes — missing fields
// become "_unknown_" or get the section omitted.

'use strict';

const fs = require('fs');
const path = require('path');

function loadVendor(filePath) {
  if (!filePath) throw new Error('usage: node index.js <vendor.json> [--section N] [--no-empty]');
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function parseArgs(argv) {
  const args = { filePath: null, sectionOnly: null, noEmpty: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--section') args.sectionOnly = parseInt(argv[++i], 10);
    else if (a === '--no-empty') args.noEmpty = true;
    else if (a === '--help' || a === '-h') {
      console.log('usage: node index.js <vendor.json> [--section N] [--no-empty]');
      process.exit(0);
    } else if (!args.filePath) args.filePath = a;
  }
  return args;
}

function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/\|/g, '\\|');
}

function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d.getTime())) return String(s);
  return d.toISOString().slice(0, 10);
}

function link(text, url) {
  if (!url) return text || '';
  return `[${text || url}](${url})`;
}

function joinList(items) {
  if (!items || !items.length) return '_none_';
  return items.join(', ');
}

// ---------- Section renderers ----------

function section1Header(v) {
  const lines = [];
  const name = v.vendor?.name || '_unnamed_';
  lines.push(`# ${name}`);
  const tags = [];
  if (v.vendor?.side) tags.push(v.vendor.side);
  if (v.vendor?.status) tags.push(v.vendor.status);
  if (v.vendor?.rating) tags.push(`★ ${v.vendor.rating}`);
  if (tags.length) lines.push(`**${tags.join(' · ')}**`);
  if (v.vendor?.url) lines.push(`<${v.vendor.url}>`);
  const meta = v.headerMeta || {};
  const sub = [];
  if (meta.generatedAt) sub.push(`generated: ${fmtDate(meta.generatedAt)}`);
  if (meta.scope) sub.push(`scope: ${meta.scope}`);
  if (meta.triggerThreadId) sub.push(`trigger: ${meta.triggerThreadId}`);
  if (sub.length) lines.push(`<sub>${sub.join(' · ')}</sub>`);
  return lines.join('\n\n');
}

function section2Summary(v) {
  const vendor = v.vendor || {};
  const lines = ['## 2. Summary', ''];
  const rows = [
    ['Side', vendor.side],
    ['Status', vendor.status],
    ['Rating', vendor.rating ? `★ ${vendor.rating}` : null],
    ['Verticals (live)', joinList(vendor.verticals?.live)],
    ['Verticals (other)', joinList(vendor.verticals?.other)],
    ['Modalities (live)', joinList(vendor.modalities?.live)],
    ['Modalities (other)', joinList(vendor.modalities?.other)],
    ['Sourcing', vendor.sourcing],
    ['Website', vendor.url],
    ['Notes', vendor.notes],
  ].filter(([, val]) => val !== null && val !== undefined && val !== '');
  if (!rows.length) return null;
  lines.push('| Field | Value |');
  lines.push('| --- | --- |');
  for (const [k, vv] of rows) {
    lines.push(`| ${esc(k)} | ${esc(vv)} |`);
  }
  return lines.join('\n');
}

function section3Contacts(v) {
  const contacts = v.contacts || {};
  const active = contacts.active || [];
  const inactive = contacts.inactive || [];
  if (!active.length && !inactive.length) return null;
  const lines = ['## 3. Contacts', ''];
  function renderGroup(label, list) {
    if (!list.length) return;
    lines.push(`**${label}**`);
    lines.push('');
    lines.push('| Name | Role | Email | Phone |');
    lines.push('| --- | --- | --- | --- |');
    for (const c of list) {
      lines.push(`| ${esc(c.name)} | ${esc(c.role)} | ${esc(c.email)} | ${esc(c.phone)} |`);
    }
    lines.push('');
  }
  renderGroup('Active', active);
  renderGroup('Inactive', inactive);
  return lines.join('\n').trim();
}

function section4InboxMatrix(v) {
  const threads = v.inboxMatrix || [];
  if (!threads.length) return null;
  const lines = ['## 4. Inbox', ''];
  lines.push('| Subject | Last activity | Owner | Labels | Summary |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const t of threads) {
    const subj = link(t.subject || '(no subject)', t.threadUrl);
    lines.push(
      `| ${esc(subj)} | ${esc(fmtDate(t.lastDate))} | ${esc(t.owner || '—')} | ${esc((t.labels || []).join(', '))} | ${esc(t.summary || '—')} |`
    );
  }
  return lines.join('\n');
}

function section5HelpfulLinks(v) {
  const links = v.links || [];
  if (!links.length) return null;
  const lines = ['## 5. Helpful Links', ''];
  for (const l of links) {
    const name = l.notes || l.url;
    lines.push(`- ${link(name, l.url)}${l.notes && l.url ? `  \n  ${esc(l.url)}` : ''}`);
  }
  return lines.join('\n');
}

function section6Tasks(v) {
  const tasks = v.tasks || {};
  const groupOrder = ['blockers', 'ongoing', 'upcoming', 'completed'];
  const groupLabels = {
    blockers: 'Blockers',
    ongoing: 'Ongoing',
    upcoming: 'Upcoming / Paused',
    completed: 'Completed',
  };
  const anyHasTasks = groupOrder.some(g => (tasks[g] || []).length);
  if (!anyHasTasks) return null;
  const lines = ['## 6. Tasks', ''];
  for (const g of groupOrder) {
    const list = tasks[g] || [];
    if (!list.length) continue;
    lines.push(`### ${groupLabels[g]}`);
    lines.push('');
    for (const t of list) {
      const head = `- ${link(t.name, t.url)}`;
      const meta = [];
      if (t.status) meta.push(`status: ${t.status}`);
      if (t.updatedAt) meta.push(`updated: ${fmtDate(t.updatedAt)}`);
      lines.push(meta.length ? `${head}  \n  _${meta.join(' · ')}_` : head);
      if (t.notes) lines.push(`  > ${esc(t.notes).split('\n').join('\n  > ')}`);
    }
    lines.push('');
  }
  return lines.join('\n').trim();
}

function section7Reference(v) {
  const ref = v.reference || {};
  const entries = Object.entries(ref).filter(([, val]) => val !== null && val !== undefined && val !== '');
  if (!entries.length) return null;
  const lines = ['## 7. Reference', ''];
  for (const [k, val] of entries) {
    lines.push(`- **${esc(k)}**: ${esc(val)}`);
  }
  return lines.join('\n');
}

function section8Synthesis(v) {
  const s = v.synthesis;
  if (!s) return null;
  return ['## 8. Synthesis', '', String(s).trim()].join('\n');
}

function sourcesLine(sources) {
  if (!sources || !sources.length) return '';
  const parts = sources.map(s => typeof s === 'string' ? s : link(s.label || s.url, s.url));
  return `  \n  _Sources: ${parts.join('; ')}_`;
}

function section9OpenItems(v) {
  const items = v.openItems || [];
  if (!items.length) return null;
  const lines = ['## 9. Open Items', ''];
  for (const it of items) {
    let head = `- ${esc(it.text)}`;
    if (it.waitingOn) head += ` _(waiting on ${esc(it.waitingOn)})_`;
    lines.push(head + sourcesLine(it.sources));
  }
  return lines.join('\n');
}

function section10RecommendedActions(v) {
  const items = v.recommendedActions || [];
  if (!items.length) return null;
  const lines = ['## 10. Recommended Actions', ''];
  items.forEach((it, idx) => {
    let head = `${idx + 1}. ${esc(it.text)}`;
    if (it.assignee) head += ` _[${esc(it.assignee)}]_`;
    lines.push(head + sourcesLine(it.sources));
  });
  return lines.join('\n');
}

// ---------- Main ----------

const SECTIONS = [
  { n: 1, fn: section1Header },
  { n: 2, fn: section2Summary },
  { n: 3, fn: section3Contacts },
  { n: 4, fn: section4InboxMatrix },
  { n: 5, fn: section5HelpfulLinks },
  { n: 6, fn: section6Tasks },
  { n: 7, fn: section7Reference },
  { n: 8, fn: section8Synthesis },
  { n: 9, fn: section9OpenItems },
  { n: 10, fn: section10RecommendedActions },
];

function render(vendor, opts = {}) {
  const out = [];
  for (const sec of SECTIONS) {
    if (opts.sectionOnly && sec.n !== opts.sectionOnly) continue;
    let rendered;
    try {
      rendered = sec.fn(vendor);
    } catch (e) {
      rendered = `## ${sec.n}. _(error rendering: ${e.message})_`;
    }
    if (!rendered) {
      if (opts.noEmpty || opts.sectionOnly) continue;
      rendered = `## ${sec.n}. _(no data)_`;
    }
    out.push(rendered);
  }
  return out.join('\n\n') + '\n';
}

function main() {
  const args = parseArgs(process.argv);
  const vendor = loadVendor(args.filePath);
  process.stdout.write(render(vendor, {
    sectionOnly: args.sectionOnly,
    noEmpty: args.noEmpty,
  }));
}

if (require.main === module) {
  try { main(); }
  catch (e) { console.error('ERROR:', e.message); process.exit(1); }
}

module.exports = { render, SECTIONS };
