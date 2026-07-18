'use strict';

/* ============================================================
   Unit tests for the trading-agent SIMULATION engine.

   Covers the accounting/honesty fixes:
   - long buy then partial sell realizes correct P&L
   - short sell then buy-to-cover realizes correct P&L and does
     NOT average as if going longer
   - crossing through zero flips the position side
   - dailyPnLHistory populates so Sharpe is a finite, non-zero
     number (not NaN), and is guarded for single/zero-variance
     series
   - the position-size guardrail costs orders off the real order
     price / last-known price, never a $100 constant

   These agents are simulation strategies only (see the header of
   services/trading-agents.js); the tests exercise the internal
   accounting deterministically via limit-priced sim fills.
   ============================================================ */

const test = require('node:test');
const assert = require('node:assert');
const { TradingAgent } = require('../services/trading-agents.js');

// Helper: build a sim-mode agent. AlpacaClient does not exist under Node,
// so simulationMode defaults to true.
function makeAgent(overrides) {
  return new TradingAgent(Object.assign({ symbols: ['X'] }, overrides || {}));
}

// Helper: force a deterministic sim fill at a chosen price by routing a
// limit order through _simulateOrder (limit fills at limit_price).
function fill(agent, symbol, side, qty, price) {
  return agent._simulateOrder({
    symbol,
    qty,
    side,
    type: 'limit',
    limit_price: price,
  });
}

test('long buy then partial sell realizes correct P&L', () => {
  const a = makeAgent();

  // Buy 100 @ $200 -> long 100 @ 200.
  fill(a, 'X', 'buy', 100, 200);
  // Sell 40 @ $210 -> closes 40 of the long.
  //   realized = (210 - 200) * 40 = 400
  fill(a, 'X', 'sell', 40, 210);

  const pos = a.positions['X'];
  assert.ok(pos, 'position should remain open');
  assert.strictEqual(pos.side, 'long');
  assert.strictEqual(pos.qty, 60);          // 100 - 40
  assert.strictEqual(pos.avgPrice, 200);    // avg unchanged on a partial close
  assert.strictEqual(a.realizedPnL, 400);
  assert.strictEqual(a.dailyPnL, 400);
  assert.strictEqual(a.wins, 1);
  assert.strictEqual(a.losses, 0);
});

test('short sell then buy-to-cover realizes correct P&L and does not average as long', () => {
  const a = makeAgent();

  // Sell 100 @ $200 with no position -> open short 100 @ 200.
  fill(a, 'X', 'sell', 100, 200);
  assert.strictEqual(a.positions['X'].side, 'short');
  assert.strictEqual(a.positions['X'].qty, 100);

  // Buy 40 @ $190 -> covers 40 of the short.
  //   short realized = (entry - exit) * qty = (200 - 190) * 40 = 400
  fill(a, 'X', 'buy', 40, 190);

  const pos = a.positions['X'];
  assert.strictEqual(pos.side, 'short', 'must stay short, not flip/average to long');
  assert.strictEqual(pos.qty, 60);          // 100 - 40, NOT 140 (the old bug added qty)
  assert.strictEqual(pos.avgPrice, 200);    // cover must not re-average the entry
  assert.strictEqual(a.realizedPnL, 400);
  assert.strictEqual(a.dailyPnL, 400);
  assert.strictEqual(a.wins, 1);
});

test('a losing short cover realizes negative P&L and counts a loss', () => {
  const a = makeAgent();
  // Short 50 @ $100, cover 50 @ $130 -> (100 - 130) * 50 = -1500.
  fill(a, 'X', 'sell', 50, 100);
  fill(a, 'X', 'buy', 50, 130);
  assert.strictEqual(a.positions['X'], undefined, 'short fully covered -> flat');
  assert.strictEqual(a.realizedPnL, -1500);
  assert.strictEqual(a.losses, 1);
  assert.strictEqual(a.wins, 0);
});

test('selling through a long crosses zero and flips to short', () => {
  const a = makeAgent();

  // Long 50 @ $100.
  fill(a, 'X', 'buy', 50, 100);
  // Sell 80 @ $120 -> close 50 long (realized (120-100)*50 = 1000),
  // remaining 30 opens a fresh short @ 120.
  fill(a, 'X', 'sell', 80, 120);

  const pos = a.positions['X'];
  assert.strictEqual(pos.side, 'short');
  assert.strictEqual(pos.qty, 30);          // 80 - 50 leftover
  assert.strictEqual(pos.avgPrice, 120);    // new short entry = fill price
  assert.strictEqual(a.realizedPnL, 1000);
});

test('buying through a short crosses zero and flips to long', () => {
  const a = makeAgent();

  // Short 50 @ $100.
  fill(a, 'X', 'sell', 50, 100);
  // Buy 80 @ $80 -> cover 50 (realized (100-80)*50 = 1000),
  // remaining 30 opens a fresh long @ 80.
  fill(a, 'X', 'buy', 80, 80);

  const pos = a.positions['X'];
  assert.strictEqual(pos.side, 'long');
  assert.strictEqual(pos.qty, 30);
  assert.strictEqual(pos.avgPrice, 80);
  assert.strictEqual(a.realizedPnL, 1000);
});

test('adding to a long averages the entry price', () => {
  const a = makeAgent();
  // Buy 100 @ 100, then 100 @ 120 -> avg = (100*100 + 120*100)/200 = 110.
  fill(a, 'X', 'buy', 100, 100);
  fill(a, 'X', 'buy', 100, 120);
  const pos = a.positions['X'];
  assert.strictEqual(pos.qty, 200);
  assert.strictEqual(pos.avgPrice, 110);
  assert.strictEqual(a.realizedPnL, 0, 'adding to a position realizes nothing');
});

test('dailyPnLHistory populates and Sharpe is finite and non-zero', () => {
  const a = makeAgent();

  // Simulated day 1: buy 100 @ 200, sell 100 @ 210 -> dailyPnL = 1000.
  fill(a, 'X', 'buy', 100, 200);
  fill(a, 'X', 'sell', 100, 210);
  assert.strictEqual(a.dailyPnL, 1000);
  a.rolloverDay();
  assert.strictEqual(a.dailyPnL, 0, 'dailyPnL resets after rollover');

  // Day 2: +500.
  fill(a, 'X', 'buy', 100, 200);
  fill(a, 'X', 'sell', 100, 205);
  a.rolloverDay();

  // Day 3: +300.
  fill(a, 'X', 'buy', 100, 200);
  fill(a, 'X', 'sell', 100, 203);
  a.rolloverDay();

  assert.deepStrictEqual(a.dailyPnLHistory, [1000, 500, 300]);

  // Hand-computed Sharpe:
  //   mean = (1000 + 500 + 300) / 3 = 600
  //   variance = ((1000-600)^2 + (500-600)^2 + (300-600)^2) / 3
  //            = (160000 + 10000 + 90000) / 3 = 86666.667
  //   stddev = 294.392...
  //   sharpe = (600 / 294.392) * sqrt(252) = 2.03809 * 15.87451 = 32.3536
  const stats = a.getStats();
  assert.ok(Number.isFinite(stats.sharpe), 'Sharpe must be a finite number');
  assert.ok(!Number.isNaN(stats.sharpe), 'Sharpe must not be NaN');
  assert.ok(stats.sharpe > 0, 'Sharpe should be positive for a winning series');
  assert.ok(Math.abs(stats.sharpe - 32.3536) < 0.01, `Sharpe ~= 32.35, got ${stats.sharpe}`);
});

test('Sharpe is guarded to 0 for a single-sample history', () => {
  const a = makeAgent();
  fill(a, 'X', 'buy', 10, 100);
  fill(a, 'X', 'sell', 10, 110); // dailyPnL = 100
  a.rolloverDay();               // history = [100]
  assert.strictEqual(a.dailyPnLHistory.length, 1);
  const stats = a.getStats();
  assert.strictEqual(stats.sharpe, 0, 'single sample -> Sharpe 0, not NaN');
  assert.ok(Number.isFinite(stats.sharpe));
});

test('Sharpe is guarded to 0 for a zero-variance history', () => {
  const a = makeAgent();
  // Two identical days -> stddev 0 -> Sharpe must be 0, not Infinity/NaN.
  for (let d = 0; d < 2; d++) {
    fill(a, 'X', 'buy', 10, 100);
    fill(a, 'X', 'sell', 10, 110); // +100 each day
    a.rolloverDay();
  }
  assert.deepStrictEqual(a.dailyPnLHistory, [100, 100]);
  const stats = a.getStats();
  assert.strictEqual(stats.sharpe, 0);
  assert.ok(Number.isFinite(stats.sharpe));
});

test('guardrail costs the order off last-known price, not a $100 constant', async () => {
  const a = makeAgent({ maxPositionSize: 10000 });
  // Simulate live mode: _simPrices stays empty, but a real last price is known.
  a.simulationMode = false;
  a._lastPrices = { X: 200 };

  // 60 shares @ $200 = $12,000 > $10,000 limit -> must be rejected.
  // The OLD code costed this at $100/share = $6,000 and WOULD HAVE ALLOWED it.
  const res = await a.placeOrder('X', 'buy', 60, 'market');
  assert.strictEqual(res.error, 'GUARDRAIL');
  assert.match(res.message, /max position size/i);
});

test('guardrail rejects when no price is known rather than assuming $100', async () => {
  const a = makeAgent({ maxPositionSize: 10000 });
  a.simulationMode = false;
  a._lastPrices = {};   // nothing known
  a._simPrices = {};    // nothing known

  // 200 shares: at the old $100 fallback that is $20,000 (would reject with the
  // wrong reason); with no known price the guardrail must refuse to price it.
  const res = await a.placeOrder('X', 'buy', 200, 'market');
  assert.strictEqual(res.error, 'GUARDRAIL');
  assert.match(res.message, /no known price/i);
});

test('guardrail uses the explicit order (limit) price for cost', async () => {
  const a = makeAgent({ maxPositionSize: 10000 });
  a._simPrices = { X: 50 }; // sim price is low; the LIMIT price must drive the check

  // Limit 200 x 60 = $12,000 > $10,000 -> rejected on the order price.
  const rejected = await a.placeOrder('X', 'buy', 60, 'limit', 200);
  assert.strictEqual(rejected.error, 'GUARDRAIL');

  // Limit 200 x 40 = $8,000 < $10,000 -> allowed, fills in sim.
  const filled = await a.placeOrder('X', 'buy', 40, 'limit', 200);
  assert.strictEqual(filled.status, 'filled');
  assert.strictEqual(a.positions['X'].qty, 40);
  assert.strictEqual(a.positions['X'].avgPrice, 200);
});
