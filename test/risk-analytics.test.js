'use strict';

const test = require('node:test');
const assert = require('node:assert');
const RA = require('../services/risk-analytics.js');

// ---------------------------------------------------------------------------
// dailyReturns
// ---------------------------------------------------------------------------
test('dailyReturns: simple returns, length n-1', () => {
  const r = RA.dailyReturns([100, 110, 121]);
  assert.strictEqual(r.length, 2);
  assert.ok(Math.abs(r[0] - 0.1) < 1e-12);
  assert.ok(Math.abs(r[1] - 0.1) < 1e-12);
});

test('dailyReturns: < 2 points -> []', () => {
  assert.deepStrictEqual(RA.dailyReturns([100]), []);
  assert.deepStrictEqual(RA.dailyReturns([]), []);
  assert.deepStrictEqual(RA.dailyReturns(null), []);
});

// ---------------------------------------------------------------------------
// correlation
// ---------------------------------------------------------------------------
test('correlation: identical series = 1', () => {
  const a = [0.01, -0.02, 0.03, 0.015, -0.01];
  assert.strictEqual(RA.correlation(a, a.slice()), 1);
});

test('correlation: exactly-opposite series = -1', () => {
  const a = [0.01, -0.02, 0.03, 0.015, -0.01];
  const b = a.map((x) => -x);
  assert.strictEqual(RA.correlation(a, b), -1);
});

test('correlation: known small pair = sqrt(3)/2', () => {
  // A=[1,2,3], B=[1,1,3] -> Pearson = 2 / sqrt(2 * 8/3) = 0.8660254...
  const r = RA.correlation([1, 2, 3], [1, 1, 3]);
  assert.ok(Math.abs(r - 0.8660254) < 1e-5, 'got ' + r);
});

test('correlation: zero variance -> null', () => {
  assert.strictEqual(RA.correlation([0.01, 0.01, 0.01], [0.01, -0.02, 0.03]), null);
  assert.strictEqual(RA.correlation([0.01, -0.02, 0.03], [0.02, 0.02, 0.02]), null);
});

test('correlation: < 2 overlapping points -> null', () => {
  assert.strictEqual(RA.correlation([0.01], [0.02]), null);
  assert.strictEqual(RA.correlation([], []), null);
});

// ---------------------------------------------------------------------------
// correlationMatrix
// ---------------------------------------------------------------------------
test('correlationMatrix: diagonal = 1, symmetric, correct shape', () => {
  const out = RA.correlationMatrix({
    A: [100, 102, 101, 105, 103],
    B: [100, 102, 101, 105, 103], // identical to A
    C: [50, 49, 51, 50, 52],
  });
  assert.deepStrictEqual(out.symbols, ['A', 'B', 'C']);
  assert.strictEqual(out.matrix.length, 3);
  out.matrix.forEach((row) => assert.strictEqual(row.length, 3));
  // diagonal
  for (let i = 0; i < 3; i++) assert.strictEqual(out.matrix[i][i], 1);
  // identical A/B correlate to 1
  assert.ok(Math.abs(out.matrix[0][1] - 1) < 1e-9);
  // symmetry
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      assert.strictEqual(out.matrix[i][j], out.matrix[j][i]);
    }
  }
});

test('correlationMatrix: aligns unequal histories by last-N overlap', () => {
  // X is longer; its LAST 5 closes equal Y exactly -> correlation 1.
  const out = RA.correlationMatrix({
    X: [1, 2, 3, 100, 102, 101, 105, 103],
    Y: [100, 102, 101, 105, 103],
  });
  assert.ok(Math.abs(out.matrix[0][1] - 1) < 1e-9, 'got ' + out.matrix[0][1]);
});

// ---------------------------------------------------------------------------
// buildEquityCurve
// ---------------------------------------------------------------------------
test('buildEquityCurve: sums shares*close and forward-fills a gap', () => {
  const positions = [
    { symbol: 'AAA', shares: 10 },
    { symbol: 'BBB', shares: 5 },
  ];
  const prices = {
    // AAA is the shortest series -> its timestamps [1,2,3] are the axis
    AAA: [{ time: 1, close: 100 }, { time: 2, close: 110 }, { time: 3, close: 120 }],
    // BBB is missing time 2 -> forward-fill 50 from time 1
    BBB: [{ time: 1, close: 50 }, { time: 3, close: 60 }, { time: 4, close: 70 }, { time: 5, close: 80 }],
  };
  const out = RA.buildEquityCurve(positions, prices);
  assert.strictEqual(out.points.length, 3);
  assert.deepStrictEqual(out.points[0], { time: 1, value: 10 * 100 + 5 * 50 });   // 1250
  assert.deepStrictEqual(out.points[1], { time: 2, value: 10 * 110 + 5 * 50 });   // 1350 (BBB fwd-filled)
  assert.deepStrictEqual(out.points[2], { time: 3, value: 10 * 120 + 5 * 60 });   // 1500
  assert.ok(/illustrative/i.test(out.note));
});

test('buildEquityCurve: excludes a symbol with no data and names it', () => {
  const positions = [
    { symbol: 'AAA', shares: 1 },
    { symbol: 'ZZZ', shares: 100 }, // no price data
  ];
  const prices = {
    AAA: [{ time: 1, close: 100 }, { time: 2, close: 200 }],
    ZZZ: [],
  };
  const out = RA.buildEquityCurve(positions, prices);
  assert.deepStrictEqual(out.excludedSymbols, ['ZZZ']);
  assert.ok(out.note.indexOf('ZZZ') !== -1);
  assert.strictEqual(out.points[0].value, 100); // only AAA contributes
  assert.strictEqual(out.points[1].value, 200);
});

// ---------------------------------------------------------------------------
// maxDrawdown
// ---------------------------------------------------------------------------
test('maxDrawdown: 100 -> 120 -> 90 -> 110 gives 25%', () => {
  const dd = RA.maxDrawdown([
    { time: 1, value: 100 },
    { time: 2, value: 120 },
    { time: 3, value: 90 },
    { time: 4, value: 110 },
  ]);
  assert.strictEqual(dd.maxDrawdownPct, 25);
  assert.strictEqual(dd.peakValue, 120);
  assert.strictEqual(dd.troughValue, 90);
  assert.strictEqual(dd.peakIndex, 1);
  assert.strictEqual(dd.troughIndex, 2);
});

test('maxDrawdown: empty / single point -> zeros', () => {
  const zeros = { maxDrawdownPct: 0, peakValue: 0, troughValue: 0, peakIndex: 0, troughIndex: 0 };
  assert.deepStrictEqual(RA.maxDrawdown([]), zeros);
  assert.deepStrictEqual(RA.maxDrawdown([{ time: 1, value: 100 }]), zeros);
});

test('maxDrawdown: monotonically rising series -> 0%', () => {
  const dd = RA.maxDrawdown([
    { time: 1, value: 100 },
    { time: 2, value: 110 },
    { time: 3, value: 130 },
  ]);
  assert.strictEqual(dd.maxDrawdownPct, 0);
});

// ---------------------------------------------------------------------------
// annualizedVolatility / sharpeRatio
// ---------------------------------------------------------------------------
test('annualizedVolatility: sanity against hand computation', () => {
  // returns [0.1, -0.1, 0.1]; sample stdev = 0.1154700538; * sqrt(252)
  const vol = RA.annualizedVolatility([100, 110, 99, 108.9]);
  assert.ok(Math.abs(vol - 1.833030) < 1e-4, 'got ' + vol);
});

test('annualizedVolatility: insufficient data -> null', () => {
  assert.strictEqual(RA.annualizedVolatility([100]), null);       // 0 returns
  assert.strictEqual(RA.annualizedVolatility([100, 110]), null);  // 1 return, need >= 2
});

test('sharpeRatio: sanity against hand computation', () => {
  // mean daily 0.0333333 * 252 = 8.4; (8.4 - 0.04) / 1.833030 = 4.56099
  const s = RA.sharpeRatio([100, 110, 99, 108.9], 0.04);
  assert.ok(Math.abs(s - 4.56099) < 1e-3, 'got ' + s);
});

test('sharpeRatio: default risk-free rate is used', () => {
  const explicit = RA.sharpeRatio([100, 110, 99, 108.9], 0.04);
  const defaulted = RA.sharpeRatio([100, 110, 99, 108.9]);
  assert.ok(Math.abs(explicit - defaulted) < 1e-12);
});

test('sharpeRatio: insufficient data / zero vol -> null', () => {
  assert.strictEqual(RA.sharpeRatio([100, 110]), null);        // 1 return
  assert.strictEqual(RA.sharpeRatio([100, 200, 400, 800]), null); // constant 100% returns -> zero vol
});
