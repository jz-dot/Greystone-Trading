'use strict';

const test = require('node:test');
const assert = require('node:assert');
const CA = require('../services/corporate-actions.js');
const ACB = require('../services/acb.js');

const BUYS = [
  { type: 'buy', date: '2025-03-01', shares: 100, price: 40, commission: 9.99, fxRate: 1 },
  { type: 'buy', date: '2025-09-01', shares: 50, price: 50, commission: 9.99, fxRate: 1 },
];

test('applySplit: 2-for-1 doubles shares, halves price, only pre-split txns', () => {
  const withPost = BUYS.concat([{ type: 'buy', date: '2026-02-01', shares: 10, price: 30, commission: 0, fxRate: 1 }]);
  const r = CA.applySplit(withPost, '2026-01-15', 2);
  assert.strictEqual(r.affected, 2);
  assert.strictEqual(r.txns[0].shares, 200);
  assert.strictEqual(r.txns[0].price, 20);
  assert.strictEqual(r.txns[2].shares, 10, 'post-split txn untouched');
  assert.ok(r.txns[0].splitAdjusted);
  assert.strictEqual(BUYS[0].shares, 100, 'originals untouched');
});

test('applySplit: total ACB is invariant through a split', () => {
  const before = ACB.computeACB(BUYS).summary;
  const after = ACB.computeACB(CA.applySplit(BUYS, '2026-01-15', 4).txns).summary;
  assert.ok(Math.abs(before.currentBookValue - after.currentBookValue) < 1e-6);
  assert.strictEqual(after.currentShares, before.currentShares * 4);
});

test('applySplit: reverse split (1-for-4)', () => {
  const r = CA.applySplit(BUYS, '2026-01-15', 0.25);
  assert.strictEqual(r.txns[0].shares, 25);
  assert.strictEqual(r.txns[0].price, 160);
});

test('applySplit: roc txns pass through untouched', () => {
  const withRoc = BUYS.concat([{ type: 'roc', date: '2025-12-01', amount: 100, fxRate: 1 }]);
  const r = CA.applySplit(withRoc, '2026-01-15', 2);
  assert.strictEqual(r.txns[2].amount, 100);
  assert.strictEqual(r.affected, 2);
});

test('applySplit: rejects bad ratios and dates', () => {
  assert.throws(() => CA.applySplit(BUYS, '2026-01-15', 0));
  assert.throws(() => CA.applySplit(BUYS, '2026-01-15', 1));
  assert.throws(() => CA.applySplit(BUYS, 'garbage', 2));
});

test('dripTxn: zero-commission buy at amount/shares', () => {
  const t = CA.dripTxn({ date: '2026-03-31', shares: 1.2345, amount: 61.73, fxRate: 1.37, fxEstimated: true });
  assert.strictEqual(t.type, 'buy');
  assert.strictEqual(t.commission, 0);
  assert.strictEqual(t.source, 'drip');
  assert.ok(Math.abs(t.price - 61.73 / 1.2345) < 1e-6);
  assert.strictEqual(t.fxRate, 1.37);
  assert.strictEqual(t.fxEstimated, true);
  assert.throws(() => CA.dripTxn({ date: '2026-03-31', shares: 0, amount: 10 }));
});

test('rocTxn: shaped for acb.js and reduces ACB end to end', () => {
  const roc = CA.rocTxn({ date: '2025-12-31', amount: 500 });
  const r = ACB.computeACB(BUYS.concat([roc]));
  const plain = ACB.computeACB(BUYS);
  assert.ok(Math.abs(plain.summary.currentBookValue - r.summary.currentBookValue - 500) < 1e-6,
    'ACB reduced by exactly the ROC amount');
  assert.strictEqual(r.summary.currentShares, plain.summary.currentShares);
});

test('rocTxn: excess over ACB becomes a capital gain via acb.js', () => {
  const small = [{ type: 'buy', date: '2025-01-01', shares: 10, price: 10, commission: 0, fxRate: 1 }];
  const r = ACB.computeACB(small.concat([CA.rocTxn({ date: '2025-06-01', amount: 150 })]));
  assert.ok(r.summary.currentBookValue >= 0, 'ACB floors at zero');
  assert.ok(r.summary.totalRealizedGain >= 49.99, 'excess 50 realized as gain, got ' + r.summary.totalRealizedGain);
});

test('incomeEntry: CAD conversion and normalization', () => {
  const e = CA.incomeEntry({ symbol: 'ry.to', account: 'TFSA', currency: 'CAD', kind: 'dividend', date: '2026-04-24', amount: 49.35 });
  assert.strictEqual(e.symbol, 'RY.TO');
  assert.strictEqual(e.amountCad, 49.35);
  const u = CA.incomeEntry({ symbol: 'MSFT', currency: 'USD', date: '2026-04-24', amount: 100, fxRate: 1.38 });
  assert.strictEqual(u.amountCad, 138);
  assert.strictEqual(u.account, 'non-registered');
  assert.throws(() => CA.incomeEntry({ symbol: 'X', date: '2026-04-24', amount: 0 }));
});
