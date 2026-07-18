'use strict';

const test = require('node:test');
const assert = require('node:assert');
const PS = require('../services/portfolio-sync.js');

// ---- decide(): full direction matrix ----

test('both sides empty -> none', () => {
  const d = PS.decide({ savedAt: null, hasData: false }, { savedAt: null, hasData: false });
  assert.strictEqual(d.action, 'none');
  assert.strictEqual(d.backupLocal, false);
});

test('local data, no account copy -> push', () => {
  const d = PS.decide({ savedAt: '2026-07-18T10:00:00Z', hasData: true }, { savedAt: null, hasData: false });
  assert.strictEqual(d.action, 'push');
});

test('untimestamped local data, no account copy -> still push (nothing to lose)', () => {
  const d = PS.decide({ savedAt: null, hasData: true }, { savedAt: null, hasData: false });
  assert.strictEqual(d.action, 'push');
  assert.strictEqual(d.backupLocal, false);
});

test('empty local, account has data -> pull without backup', () => {
  const d = PS.decide({ savedAt: null, hasData: false }, { savedAt: '2026-07-18T10:00:00Z', hasData: true });
  assert.strictEqual(d.action, 'pull');
  assert.strictEqual(d.backupLocal, false);
});

test('both have data, account newer -> pull WITH local backup', () => {
  const d = PS.decide(
    { savedAt: '2026-07-18T09:00:00Z', hasData: true },
    { savedAt: '2026-07-18T11:00:00Z', hasData: true }
  );
  assert.strictEqual(d.action, 'pull');
  assert.strictEqual(d.backupLocal, true);
});

test('both have data, local newer -> push', () => {
  const d = PS.decide(
    { savedAt: '2026-07-18T12:00:00Z', hasData: true },
    { savedAt: '2026-07-18T11:00:00Z', hasData: true }
  );
  assert.strictEqual(d.action, 'push');
});

test('both have data, equal timestamps -> none', () => {
  const t = '2026-07-18T11:00:00Z';
  const d = PS.decide({ savedAt: t, hasData: true }, { savedAt: t, hasData: true });
  assert.strictEqual(d.action, 'none');
});

test('legacy local (no timestamp) vs existing account copy -> account wins, local snapshotted', () => {
  const d = PS.decide(
    { savedAt: null, hasData: true },
    { savedAt: '2026-07-01T00:00:00Z', hasData: true }
  );
  assert.strictEqual(d.action, 'pull');
  assert.strictEqual(d.backupLocal, true);
});

test('timestamped local vs untimestamped account copy -> push', () => {
  const d = PS.decide(
    { savedAt: '2026-07-18T12:00:00Z', hasData: true },
    { savedAt: null, hasData: true }
  );
  assert.strictEqual(d.action, 'push');
});

test('numeric epoch timestamps are accepted', () => {
  const d = PS.decide(
    { savedAt: 1000, hasData: true },
    { savedAt: 2000, hasData: true }
  );
  assert.strictEqual(d.action, 'pull');
});

test('garbage timestamps are treated as missing', () => {
  assert.strictEqual(PS.parseTs('not-a-date'), null);
  const d = PS.decide(
    { savedAt: 'not-a-date', hasData: true },
    { savedAt: '2026-07-18T11:00:00Z', hasData: true }
  );
  assert.strictEqual(d.action, 'pull');
  assert.strictEqual(d.backupLocal, true);
});

// ---- buildDoc / isValidDoc / hasContent ----

test('buildDoc produces a valid, versioned document', () => {
  const doc = PS.buildDoc([{ symbol: 'AAPL' }], [], [], '2026-07-18T12:00:00Z');
  assert.strictEqual(doc.version, 1);
  assert.strictEqual(doc.savedAt, '2026-07-18T12:00:00Z');
  assert.ok(PS.isValidDoc(doc));
});

test('buildDoc coerces non-array slices to empty arrays', () => {
  const doc = PS.buildDoc(null, undefined, 'junk', '2026-07-18T12:00:00Z');
  assert.deepStrictEqual(doc.positions, []);
  assert.deepStrictEqual(doc.realized, []);
  assert.deepStrictEqual(doc.activity, []);
  assert.ok(PS.isValidDoc(doc));
});

test('isValidDoc rejects malformed documents', () => {
  assert.strictEqual(PS.isValidDoc(null), false);
  assert.strictEqual(PS.isValidDoc([]), false);
  assert.strictEqual(PS.isValidDoc({}), false);
  assert.strictEqual(PS.isValidDoc({ positions: [], realized: [], activity: 'x' }), false);
});

test('hasContent detects any non-empty slice', () => {
  assert.strictEqual(PS.hasContent({ positions: [], realized: [], activity: [] }), false);
  assert.strictEqual(PS.hasContent({ positions: [{}], realized: [], activity: [] }), true);
  assert.strictEqual(PS.hasContent({ positions: [], realized: [{}], activity: [] }), true);
  assert.strictEqual(PS.hasContent({ positions: [], realized: [], activity: [{}] }), true);
  assert.strictEqual(PS.hasContent(null), false);
});
