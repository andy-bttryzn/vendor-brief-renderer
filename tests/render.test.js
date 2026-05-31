// Smoke + edge-case tests for vendor-brief-renderer.
// Run with: node --test
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const os = require('node:os');
const { render, SECTIONS, loadVendor } = require('../index.js');

const EXAMPLE_PATH = path.join(__dirname, '..', 'examples', 'example-vendor.json');
const example = JSON.parse(fs.readFileSync(EXAMPLE_PATH, 'utf8'));

test('SECTIONS has exactly 10 entries in order', () => {
  assert.equal(SECTIONS.length, 10);
  assert.deepEqual(SECTIONS.map(s => s.n), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test('render() with the full example produces a non-empty markdown string', () => {
  const out = render(example);
  assert.ok(typeof out === 'string');
  assert.ok(out.length > 500);
  assert.ok(out.endsWith('\n'));
});

test('render() includes the vendor header on section 1', () => {
  const out = render(example);
  assert.match(out, /^# Acme Roofing Network/m);
  assert.match(out, /\*\*Buyer · Live · ★ 4\*\*/);
});

test('render() emits all 10 numbered section headings', () => {
  const out = render(example);
  for (let i = 2; i <= 10; i++) {
    assert.match(out, new RegExp(`^## ${i}\\.`, 'm'), `missing section ${i}`);
  }
});

test('render() with --section 9 returns only section 9', () => {
  const out = render(example, { sectionOnly: 9 });
  assert.match(out, /^## 9\. Open Items/m);
  assert.doesNotMatch(out, /^## 8\./m);
  assert.doesNotMatch(out, /^## 10\./m);
});

test('render() with noEmpty: true drops sections that have no data', () => {
  const minimal = {
    vendor: { name: 'Tiny Vendor', side: 'Buyer' },
  };
  const out = render(minimal, { noEmpty: true });
  // Section 1 (header) always renders. Sections 2-10 should all be dropped or empty.
  assert.match(out, /^# Tiny Vendor/m);
  assert.doesNotMatch(out, /no data/);
});

test('render() without noEmpty: true placeholder-fills missing sections', () => {
  const minimal = {
    vendor: { name: 'Tiny Vendor', side: 'Buyer' },
  };
  const out = render(minimal);
  assert.match(out, /no data/);
});

test('render() does not crash on completely empty input', () => {
  const out = render({});
  assert.ok(typeof out === 'string');
});

test('section 4 (inbox matrix) renders thread links', () => {
  const out = render(example);
  assert.match(out, /\[Re: Q2 cap raise\]\(https:\/\/mail\.example\.com\/thread\/abc123\)/);
});

test('section 6 (tasks) splits by group', () => {
  const out = render(example);
  assert.match(out, /### Blockers/);
  assert.match(out, /### Ongoing/);
  assert.match(out, /### Upcoming \/ Paused/);
  // No Completed in the example; should not render the heading
  assert.doesNotMatch(out, /### Completed/);
});

test('sources line appears on items 9 and 10', () => {
  const out = render(example);
  assert.match(out, /_Sources: \[thread abc123\]/);
  assert.match(out, /_Sources: \[task 498\]/);
});

test('contacts section splits active and inactive', () => {
  const out = render(example);
  assert.match(out, /\*\*Active\*\*/);
  assert.match(out, /\*\*Inactive\*\*/);
});

test('headerMeta sub-block is rendered', () => {
  const out = render(example);
  assert.match(out, /<sub>generated: 2026-05-30 · scope: full<\/sub>/);
});

test('handles vendor with only inactive contacts', () => {
  const out = render({
    vendor: { name: 'V' },
    contacts: {
      inactive: [{ name: 'X', role: 'former', email: 'x@y' }],
    },
  });
  assert.match(out, /\*\*Inactive\*\*/);
  assert.doesNotMatch(out, /\*\*Active\*\*/);
});

test('handles tasks with no notes / no updatedAt', () => {
  const out = render({
    vendor: { name: 'V' },
    tasks: { blockers: [{ name: 'Just a name' }] },
  });
  assert.match(out, /- Just a name/);
});

test('synthesis preserves multi-paragraph prose', () => {
  const out = render({
    vendor: { name: 'V' },
    synthesis: 'Para one.\n\nPara two.',
  });
  assert.match(out, /Para one\./);
  assert.match(out, /Para two\./);
});

test('open items with no sources render without sources line', () => {
  const out = render({
    vendor: { name: 'V' },
    openItems: [{ text: 'something' }],
  });
  assert.match(out, /- something/);
  assert.doesNotMatch(out, /_Sources:/);
});

test('recommended actions are numbered', () => {
  const out = render({
    vendor: { name: 'V' },
    recommendedActions: [
      { text: 'First' },
      { text: 'Second' },
      { text: 'Third' },
    ],
  });
  assert.match(out, /1\. First/);
  assert.match(out, /2\. Second/);
  assert.match(out, /3\. Third/);
});

test('loadVendor: rejects non-object JSON (array)', () => {
  const tmp = path.join(os.tmpdir(), 'vbr-arr.json');
  fs.writeFileSync(tmp, '[]');
  assert.throws(() => loadVendor(tmp), /must be a JSON object \(got array\)/);
  fs.unlinkSync(tmp);
});

test('loadVendor: rejects non-object JSON (string)', () => {
  const tmp = path.join(os.tmpdir(), 'vbr-str.json');
  fs.writeFileSync(tmp, '"a string"');
  assert.throws(() => loadVendor(tmp), /must be a JSON object \(got string\)/);
  fs.unlinkSync(tmp);
});

test('loadVendor: rejects null', () => {
  const tmp = path.join(os.tmpdir(), 'vbr-null.json');
  fs.writeFileSync(tmp, 'null');
  assert.throws(() => loadVendor(tmp), /must be a JSON object \(got null\)/);
  fs.unlinkSync(tmp);
});

test('loadVendor: rejects number', () => {
  const tmp = path.join(os.tmpdir(), 'vbr-num.json');
  fs.writeFileSync(tmp, '42');
  assert.throws(() => loadVendor(tmp), /must be a JSON object \(got number\)/);
  fs.unlinkSync(tmp);
});

test('loadVendor: clear error on missing file', () => {
  assert.throws(() => loadVendor('/nonexistent/path/that/does/not/exist.json'), /file not found/);
});

test('loadVendor: clear error on malformed JSON', () => {
  const tmp = path.join(os.tmpdir(), 'vbr-bad.json');
  fs.writeFileSync(tmp, '{ not json }');
  assert.throws(() => loadVendor(tmp), SyntaxError);
  fs.unlinkSync(tmp);
});

test('loadVendor: accepts valid object', () => {
  const result = loadVendor(EXAMPLE_PATH);
  assert.equal(typeof result, 'object');
  assert.ok(result.vendor);
});

test('renderer escapes pipe characters in table cells', () => {
  const out = render({
    vendor: { name: 'V' },
    contacts: { active: [{ name: 'Smith | Jones', role: 'Director', email: 'x@y' }] },
  });
  // The literal | should be backslash-escaped in the table cell
  assert.match(out, /Smith \\\| Jones/);
});
