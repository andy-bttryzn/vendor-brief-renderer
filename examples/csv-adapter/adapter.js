#!/usr/bin/env node
// CSV → vendor.json adapter (example).
//
// Demonstrates how to convert a flat CSV of vendor + tasks + contacts data
// into the structured vendor.json shape the renderer expects. The point isn't
// the CSV itself; the point is the boundary — your real adapter pulls from
// monday / Salesforce / Airtable / a database, but the output shape is the same.
//
// Usage:
//   node adapter.js vendor.csv tasks.csv contacts.csv > vendor.json
//   node adapter.js vendor.csv tasks.csv contacts.csv | node ../../index.js -

'use strict';

const fs = require('fs');

function parseCSV(text) {
  // Tiny CSV parser — handles quoted fields with embedded commas + newlines.
  // For real production work, use papaparse / csv-parse / similar.
  const rows = [];
  let cur = [];
  let buf = '';
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuote) {
      if (c === '"' && text[i + 1] === '"') { buf += '"'; i++; }
      else if (c === '"') inQuote = false;
      else buf += c;
    } else {
      if (c === '"') inQuote = true;
      else if (c === ',') { cur.push(buf); buf = ''; }
      else if (c === '\n') { cur.push(buf); rows.push(cur); cur = []; buf = ''; }
      else if (c === '\r') { /* skip */ }
      else buf += c;
    }
  }
  if (buf.length || cur.length) { cur.push(buf); rows.push(cur); }
  if (rows.length === 0) {
    throw new Error('CSV is empty (no header row found)');
  }
  const headers = rows.shift().map(h => h.trim());
  return rows.filter(r => r.some(v => v.length)).map(r => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (r[i] || '').trim(); });
    return obj;
  });
}

function loadCSV(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`CSV file not found: ${filePath}`);
  }
  return parseCSV(fs.readFileSync(filePath, 'utf8'));
}

function splitTags(s) {
  if (!s) return [];
  return s.split('|').map(t => t.trim()).filter(Boolean);
}

function num(s) {
  if (!s) return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function toVendor(vendorRow, taskRows, contactRows) {
  // Group tasks by status group (Blockers / Ongoing / Upcoming / Completed)
  const tasksGrouped = {
    blockers: [], ongoing: [], upcoming: [], completed: [],
  };
  for (const t of taskRows) {
    if (t.vendor_id !== vendorRow.id) continue;
    const group = (t.group || 'ongoing').toLowerCase();
    const task = {
      id: t.id,
      name: t.name,
      status: t.status,
      notes: t.notes || undefined,
      updatedAt: t.updated_at || undefined,
      url: t.url || undefined,
    };
    if (tasksGrouped[group]) tasksGrouped[group].push(task);
    else tasksGrouped.ongoing.push(task);
  }

  // Split contacts by status
  const active = [];
  const inactive = [];
  for (const c of contactRows) {
    if (c.vendor_id !== vendorRow.id) continue;
    const contact = {
      name: c.name,
      role: c.role || undefined,
      email: c.email || undefined,
      phone: c.phone || undefined,
    };
    if ((c.status || '').toLowerCase() === 'inactive') inactive.push(contact);
    else active.push(contact);
  }

  return {
    vendor: {
      id: vendorRow.id,
      name: vendorRow.name,
      side: vendorRow.side || undefined,
      status: vendorRow.status || undefined,
      rating: num(vendorRow.rating),
      url: vendorRow.url || undefined,
      notes: vendorRow.notes || undefined,
      sourcing: vendorRow.sourcing || undefined,
      verticals: {
        live: splitTags(vendorRow.verticals_live),
        other: splitTags(vendorRow.verticals_other),
      },
      modalities: {
        live: splitTags(vendorRow.modalities_live),
        other: splitTags(vendorRow.modalities_other),
      },
    },
    contacts: { active, inactive },
    tasks: tasksGrouped,
    links: [],          // wire from your own data source
    inboxMatrix: [],    // wire from your own inbox fetcher
    reference: {},      // populate as needed
    synthesis: vendorRow.synthesis || undefined,
    openItems: [],      // human-authored or AI-authored
    recommendedActions: [],
    headerMeta: {
      generatedAt: new Date().toISOString(),
      scope: 'full',
    },
  };
}

function main() {
  const [, , vendorCsv, tasksCsv, contactsCsv] = process.argv;
  if (!vendorCsv || !tasksCsv || !contactsCsv) {
    console.error('usage: node adapter.js vendor.csv tasks.csv contacts.csv > vendor.json');
    process.exit(1);
  }
  let vendors, tasks, contacts;
  try {
    vendors = loadCSV(vendorCsv);
    tasks = loadCSV(tasksCsv);
    contacts = loadCSV(contactsCsv);
  } catch (e) {
    console.error(`ERROR: ${e.message}`);
    process.exit(1);
  }

  if (vendors.length === 0) {
    console.error('no vendors in CSV');
    process.exit(1);
  }
  if (vendors.length > 1) {
    console.error(`warning: ${vendors.length} vendors in CSV; using first (id=${vendors[0].id})`);
  }

  const vendorJson = toVendor(vendors[0], tasks, contacts);
  process.stdout.write(JSON.stringify(vendorJson, null, 2) + '\n');
}

if (require.main === module) main();

module.exports = { toVendor, parseCSV };
