'use strict';

const test = require('node:test');
const assert = require('node:assert');
const TR = require('../services/tax-report.js');

function pos(symbol, account, txns, extra) {
  return Object.assign({ symbol: symbol, account: account, currency: 'CAD', txns: txns }, extra || {});
}

const BUY = (date, shares, price, opts) => Object.assign({ type: 'buy', date, shares, price, commission: 0, fxRate: 1 }, opts || {});
const SELL = (date, shares, price, opts) => Object.assign({ type: 'sell', date, shares, price, commission: 0, fxRate: 1 }, opts || {});

test('dispositions come only from non-registered positions', () => {
  const rows = TR.buildDispositions([
    pos('AAA.TO', 'TFSA', [BUY('2026-01-05', 10, 10), SELL('2026-02-05', 10, 15)]),
    pos('BBB.TO', 'non-registered', [BUY('2026-01-05', 10, 10), SELL('2026-02-05', 10, 15)]),
  ]);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].symbol, 'BBB.TO');
  assert.strictEqual(rows[0].gainCad, 50);
});

test('identical property pools ACROSS taxable accounts before the sell', () => {
  // 10 @ 10 in one account, 10 @ 20 in another; selling 10 @ 20 must use
  // pooled ACB 15/share -> gain 50, not 100.
  const rows = TR.buildDispositions([
    pos('CCC.TO', 'non-registered', [BUY('2026-01-05', 10, 10)]),
    pos('CCC.TO', 'non-registered', [BUY('2026-01-10', 10, 20), SELL('2026-03-01', 10, 20)], { account: 'non-registered' }),
  ]);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].acbCad, 150);
  assert.strictEqual(rows[0].gainCad, 50);
});

test('year filter keeps only that year', () => {
  const positions = [pos('DDD.TO', 'non-registered', [
    BUY('2025-01-05', 20, 10), SELL('2025-06-01', 10, 12), SELL('2026-06-01', 10, 14),
  ])];
  assert.strictEqual(TR.buildDispositions(positions, { year: '2025' }).length, 1);
  assert.strictEqual(TR.buildDispositions(positions, { year: '2026' }).length, 1);
  assert.strictEqual(TR.buildDispositions(positions).length, 2);
});

test('superficial loss flag and denied amount propagate', () => {
  const rows = TR.buildDispositions([pos('EEE.TO', 'non-registered', [
    BUY('2026-01-05', 100, 50),
    SELL('2026-03-02', 100, 30),      // loss 2000
    BUY('2026-03-20', 100, 31),       // rebuy inside 30 days -> denied
  ])]);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].superficialLoss, true);
  assert.ok(rows[0].deniedLossCad > 0);
  assert.strictEqual(rows[0].gainCad, 0, 'denied loss reported as 0 gain');
});

test('ROC excess over ACB appears as its own row', () => {
  const rows = TR.buildDispositions([pos('FFF.TO', 'non-registered', [
    BUY('2026-01-05', 10, 1),
    { type: 'roc', date: '2026-05-01', amount: 100, fxRate: 1 },
  ])]);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].type, 'roc-excess');
  assert.strictEqual(rows[0].gainCad, 90);
});

test('approx flag propagates from imported or estimated-FX lots', () => {
  const rows = TR.buildDispositions([pos('GGG.TO', 'non-registered', [
    BUY('2026-01-05', 10, 10, { source: 'broker-import' }), SELL('2026-02-05', 10, 15),
  ])]);
  assert.strictEqual(rows[0].approx, true);
});

test('summarize splits gains and losses and counts flags', () => {
  const s = TR.summarize([
    { proceedsCad: 150, acbCad: 100, gainCad: 50, superficialLoss: false, approx: false },
    { proceedsCad: 80, acbCad: 100, gainCad: -20, superficialLoss: true, approx: true },
  ]);
  assert.strictEqual(s.totalGainCad, 30);
  assert.strictEqual(s.gainsCad, 50);
  assert.strictEqual(s.lossesCad, -20);
  assert.strictEqual(s.superficialCount, 1);
  assert.strictEqual(s.approxCount, 1);
});

test('dispositionsToCsv: well-formed with totals and disclaimer', () => {
  const rows = TR.buildDispositions([pos('HHH.TO', 'non-registered', [BUY('2026-01-05', 10, 10), SELL('2026-02-05', 10, 15)])]);
  const csv = TR.dispositionsToCsv(rows);
  const lines = csv.trim().split('\r\n');
  assert.match(lines[0], /^Symbol,Type,Date of disposition/);
  assert.match(lines[1], /HHH\.TO,Disposition,2026-02-05,10,150\.00,100\.00,50\.00/);
  assert.match(csv, /TOTALS/);
  assert.match(csv, /Not tax advice/);
});

test('incomeToCsv: year filter and CAD total', () => {
  const csv = TR.incomeToCsv([
    { symbol: 'RY.TO', account: 'non-registered', kind: 'dividend', date: '2026-04-24', amount: 49.35, currency: 'CAD', fxRate: 1, amountCad: 49.35 },
    { symbol: 'MSFT', account: 'RRSP', kind: 'dividend', date: '2025-12-12', amount: 100, currency: 'USD', fxRate: 1.38, amountCad: 138 },
  ], { year: '2026' });
  assert.match(csv, /RY\.TO/);
  assert.ok(!/MSFT/.test(csv), 'other-year rows excluded');
  assert.match(csv, /TOTAL,,,,,,,49\.35/);
});

test('empty portfolio produces an empty, valid report', () => {
  assert.deepStrictEqual(TR.buildDispositions([]), []);
  const csv = TR.dispositionsToCsv([]);
  assert.match(csv, /^Symbol,Type/);
});
