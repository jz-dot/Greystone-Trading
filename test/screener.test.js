'use strict';

const test = require('node:test');
const assert = require('node:assert');
const S = require('../services/screener.js');

// ---------- helpers to build synthetic series ----------
function upSeries(n, start, step) {           // strictly increasing
  const a = [];
  for (let i = 0; i < n; i++) a.push(start + i * step);
  return a;
}
function downSeries(n, start, step) {          // strictly decreasing
  const a = [];
  for (let i = 0; i < n; i++) a.push(start - i * step);
  return a;
}

// ---------- SMA ----------
test('sma: last simple moving average, exact', () => {
  assert.strictEqual(S.sma([1, 2, 3, 4, 5], 5), 3);        // whole array
  assert.strictEqual(S.sma([1, 2, 3, 4, 5], 3), 4);        // last three: (3+4+5)/3
});

test('sma: insufficient data or bad period -> null', () => {
  assert.strictEqual(S.sma([1, 2], 3), null);
  assert.strictEqual(S.sma([1, 2, 3], 0), null);
  assert.strictEqual(S.sma(null, 3), null);
});

// ---------- RSI ----------
test('rsi: hand-computed Wilder example equals 75', () => {
  // 15 closes -> 14 deltas: five +6 gains (sum 30), five -2 losses (sum 10),
  // four flat. avgGain=30/14, avgLoss=10/14, RS=3 -> RSI = 100 - 100/4 = 75.
  const closes = [100, 106, 104, 110, 108, 114, 112, 118, 116, 122, 120, 120, 120, 120, 120];
  assert.strictEqual(closes.length, 15);
  assert.strictEqual(S.rsi(closes, 14), 75);
});

test('rsi: all gains -> 100, all losses -> 0', () => {
  assert.strictEqual(S.rsi(upSeries(30, 50, 1), 14), 100);
  assert.strictEqual(S.rsi(downSeries(30, 120, 1), 14), 0);
});

test('rsi: insufficient data -> null', () => {
  assert.strictEqual(S.rsi(upSeries(14, 50, 1), 14), null); // need period+1 = 15
  assert.strictEqual(S.rsi([1, 2, 3], 14), null);
});

// ---------- 52-week distance helpers ----------
test('pctFrom52wHigh: signed distance, negative below the high', () => {
  assert.strictEqual(S.pctFrom52wHigh(90, 100), -10);
  assert.strictEqual(S.pctFrom52wHigh(100, 100), 0);
  assert.strictEqual(S.pctFrom52wHigh(110, 100), 10);
});

test('pctFrom52wLow: signed distance, positive above the low', () => {
  assert.strictEqual(S.pctFrom52wLow(110, 100), 10);
  assert.strictEqual(S.pctFrom52wLow(100, 100), 0);
});

test('pctFrom helpers: null on invalid input', () => {
  assert.strictEqual(S.pctFrom52wHigh(90, 0), null);
  assert.strictEqual(S.pctFrom52wHigh(null, 100), null);
  assert.strictEqual(S.pctFrom52wLow(90, null), null);
});

// ---------- momentumSignal ----------
test('momentumSignal: clean uptrend is bullish with a high score', () => {
  const closes = upSeries(60, 50, 1); // 50..109 strictly up
  const r = S.momentumSignal({ symbol: 'UP', closes, price: 109, high52: 109, low52: 50 });
  assert.strictEqual(r.trend, 'bullish');
  assert.ok(r.score >= 90, 'score was ' + r.score);
  assert.strictEqual(r.rsi, 100);
  assert.ok(r.signals.some(s => s.indexOf('uptrend') !== -1));
});

test('momentumSignal: clean downtrend is bearish with a low score', () => {
  const closes = downSeries(60, 120, 1); // 120..61 strictly down
  const r = S.momentumSignal({ symbol: 'DN', closes, price: 61, high52: 120, low52: 61 });
  assert.strictEqual(r.trend, 'bearish');
  assert.ok(r.score <= 15, 'score was ' + r.score);
  assert.strictEqual(r.rsi, 0);
});

test('momentumSignal: uptrend outscores downtrend (direction sanity)', () => {
  const up = S.momentumSignal({ symbol: 'UP', closes: upSeries(60, 50, 1), price: 109, high52: 109, low52: 50 });
  const dn = S.momentumSignal({ symbol: 'DN', closes: downSeries(60, 120, 1), price: 61, high52: 120, low52: 61 });
  assert.ok(up.score > dn.score);
});

test('momentumSignal: price defaults to last close when omitted', () => {
  const closes = upSeries(60, 50, 1);
  const r = S.momentumSignal({ symbol: 'UP', closes });
  assert.strictEqual(r.trend, 'bullish');
});

test('momentumSignal: insufficient data -> null', () => {
  assert.strictEqual(S.momentumSignal({ symbol: 'X', closes: upSeries(49, 50, 1) }), null);
  assert.strictEqual(S.momentumSignal({ symbol: 'X', closes: [1, 2, 3] }), null);
  assert.strictEqual(S.momentumSignal(null), null);
});

// ---------- valueSignal ----------
const CHEAP = {
  symbol: 'CHEAP',
  fundamentals: { forwardPE: 9, trailingPE: 11, priceToBook: 0.9, dividendYield: 0.04, fiftyTwoWeekHigh: 100 },
  price: 70,
};
const EXPENSIVE = {
  symbol: 'RICH',
  fundamentals: { forwardPE: 40, trailingPE: 45, priceToBook: 8, dividendYield: null, fiftyTwoWeekHigh: 100 },
  price: 98,
};

test('valueSignal: rewards low P/E, dividend, and pullback', () => {
  const cheap = S.valueSignal(CHEAP);
  const rich = S.valueSignal(EXPENSIVE);
  assert.ok(cheap.score > rich.score, 'cheap ' + cheap.score + ' vs rich ' + rich.score);
  assert.ok(cheap.score >= 90);
  assert.strictEqual(cheap.divYield, 4);                 // 0.04 fraction -> 4%
  assert.ok(cheap.signals.some(s => s.indexOf('Fwd P/E 9') !== -1));
  assert.ok(cheap.signals.some(s => s.indexOf('below 52w high') !== -1));
});

test('valueSignal: omits null fields, never fabricates', () => {
  const r = S.valueSignal({ symbol: 'ONLYFWD', fundamentals: { forwardPE: 15, trailingPE: null, priceToBook: null, dividendYield: null } });
  assert.notStrictEqual(r, null);
  assert.strictEqual(r.divYield, null);
  assert.strictEqual(r.pb, null);
  assert.strictEqual(r.trailingPE, null);
  assert.ok(!r.signals.some(s => s.indexOf('P/B') !== -1));
  assert.ok(!r.signals.some(s => s.indexOf('Div yield') !== -1));
  assert.ok(!r.signals.some(s => s.indexOf('Trailing') !== -1));
});

test('valueSignal: div yield already in percent is left as-is', () => {
  const r = S.valueSignal({ symbol: 'D', fundamentals: { forwardPE: 18, dividendYield: 3.1 } });
  assert.strictEqual(r.divYield, 3.1);
});

test('valueSignal: no valuation ratios -> null', () => {
  assert.strictEqual(S.valueSignal({ symbol: 'X', fundamentals: { marketCap: 1e9, shortName: 'X' } }), null);
  assert.strictEqual(S.valueSignal({ symbol: 'X', fundamentals: null }), null);
  assert.strictEqual(S.valueSignal(null), null);
});

// ---------- screen ----------
test('screen momentum: ranks by score desc and drops nulls', () => {
  const items = [
    { symbol: 'DN', closes: downSeries(60, 120, 1), price: 61, high52: 120, low52: 61 },
    { symbol: 'UP', closes: upSeries(60, 50, 1), price: 109, high52: 109, low52: 50 },
    { symbol: 'BAD', closes: [1, 2, 3] }, // insufficient -> dropped
  ];
  const ranked = S.screen(items, 'momentum');
  assert.strictEqual(ranked.length, 2);
  assert.strictEqual(ranked[0].symbol, 'UP');
  assert.ok(ranked[0].score >= ranked[1].score);
});

test('screen value: ranks by score desc and drops nulls', () => {
  const items = [EXPENSIVE, CHEAP, { symbol: 'NONE', fundamentals: { marketCap: 5 } }];
  const ranked = S.screen(items, 'value');
  assert.strictEqual(ranked.length, 2);
  assert.strictEqual(ranked[0].symbol, 'CHEAP');
});

test('screen: unknown kind throws, non-array -> []', () => {
  assert.throws(() => S.screen([], 'anomaly'), /momentum.*value/);
  assert.deepStrictEqual(S.screen(null, 'value'), []);
});

// ---------- disclaimer / honesty ----------
test('SCREENER_DISCLAIMER exists and disclaims options-flow signals', () => {
  assert.strictEqual(typeof S.SCREENER_DISCLAIMER, 'string');
  assert.ok(S.SCREENER_DISCLAIMER.length > 100);
  assert.ok(/not investment advice/i.test(S.SCREENER_DISCLAIMER));
  assert.ok(/options-flow|dark-pool|anomaly/i.test(S.SCREENER_DISCLAIMER));
});
