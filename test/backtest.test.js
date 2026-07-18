'use strict';

/* ============================================
   BACKTEST ENGINE TESTS
   node --test test/backtest.test.js   (Node built-in, no deps)

   Every expected value below is hand-computed in the comments. The engine is
   pure and deterministic, so these are exact equalities (within float epsilon),
   not statistical checks.
   ============================================ */

const test = require('node:test');
const assert = require('node:assert');
const BT = require('../services/backtest.js');

const { runBacktest, strategies } = BT;

// Small helper: build a bar. Distinct open vs close is important for proving
// next-bar-open fills, so callers pass both explicitly.
function bar(time, open, close, high, low, volume) {
  return {
    time,
    open,
    close,
    high: high != null ? high : Math.max(open, close),
    low: low != null ? low : Math.min(open, close),
    volume: volume != null ? volume : 1000,
  };
}

const approx = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// ---------------------------------------------------------------------------
// 1. BUY-AND-HOLD == underlying close-to-close return (zero cost, fully invested)
// ---------------------------------------------------------------------------
// Construct a gap-free series where each bar's open equals the prior close, so
// the buy-and-hold entry (which fills at bar 1's open) enters at close[0], and
// the terminal liquidation exits at close[last]. With the account fully invested
// in a whole number of shares and zero commission, the total return must equal
// the raw close[last]/close[0] - 1.
//
//   closes:  100, 105, 110, 121
//   opens :  100, 100, 105, 110   (open[i] == close[i-1])
//   initialCapital = 10,000 ; entry open[1] = 100 ; shares = 10000/100 = 100
//   exit close[3] = 121 ; finalEquity = 100 * 121 = 12,100
//   totalReturn = 12100/10000 - 1 = 0.21  ==  121/100 - 1 = 0.21  (close-to-close)
test('buy-and-hold total return equals the underlying close-to-close return (zero cost)', () => {
  const bars = [
    bar(1, 100, 100),
    bar(2, 100, 105),
    bar(3, 105, 110),
    bar(4, 110, 121),
  ];
  const res = runBacktest({
    bars,
    strategy: strategies.buyAndHold,
    initialCapital: 10000,
    options: { cost: { broker: 'wealthsimple' } }, // $0 commission, same currency
  });

  const closeToClose = 121 / 100 - 1; // 0.21
  assert.ok(approx(res.totalReturn, closeToClose), `totalReturn ${res.totalReturn} != ${closeToClose}`);
  assert.ok(approx(res.finalEquity, 12100), `finalEquity ${res.finalEquity} != 12100`);
  assert.strictEqual(res.numTrades, 1); // one round trip: enter, liquidate at end
  assert.strictEqual(res.tradeLog[0].entryPrice, 100);
  assert.strictEqual(res.tradeLog[0].exitPrice, 121);
});

// ---------------------------------------------------------------------------
// 2. TRANSACTION COSTS reduce net return by exactly one round trip of commission
// ---------------------------------------------------------------------------
// Same bars, a fixed-quantity strategy (buy 50 shares) so the SHARE COUNT is
// identical across the two runs and the only difference is commission. RBC is a
// $9.95 flat commission per trade; a round trip (entry + terminal exit) is
// 2 * 9.95 = $19.90. Therefore:
//   finalEquity(zero-cost) - finalEquity(rbc) == 19.90 exactly
// and the net (cost) return is strictly lower.
test('transaction costs reduce net return by exactly one round-trip commission', () => {
  const bars = [
    bar(1, 100, 100),
    bar(2, 100, 105),
    bar(3, 105, 110),
    bar(4, 110, 121),
  ];
  const buy50 = (ctx) => (ctx.index === 0 ? ctx.buy(50) : ctx.hold());

  const free = runBacktest({
    bars, strategy: buy50, initialCapital: 100000,
    options: { cost: { broker: 'wealthsimple' } },
  });
  const paid = runBacktest({
    bars, strategy: buy50, initialCapital: 100000,
    options: { cost: { broker: 'rbc' } }, // $9.95 flat per trade
  });

  // 50 shares in BOTH runs (buy 50 at open[1]=100, exit 50 at close[3]=121).
  assert.strictEqual(free.tradeLog[0].quantity, 50);
  assert.strictEqual(paid.tradeLog[0].quantity, 50);

  const roundTrip = 2 * 9.95; // 19.90
  assert.ok(
    approx(free.finalEquity - paid.finalEquity, roundTrip, 1e-4),
    `cost delta ${free.finalEquity - paid.finalEquity} != ${roundTrip}`,
  );
  assert.ok(paid.totalReturn < free.totalReturn, 'cost run must have lower net return');
  assert.strictEqual(paid.tradeLog[0].commission, 19.9); // both legs charged
});

// ---------------------------------------------------------------------------
// 3. NO-LOOKAHEAD: an order decided on bar i fills at bar i+1's OPEN
// ---------------------------------------------------------------------------
// close[0] = 110 but open[1] = 105. A strategy that acts on bar 0 (observing
// close 110) must NOT fill at 110; it must fill at the next bar's open, 105.
// We also assert the history view refuses to expose the future bar.
test('no-lookahead: a bar-0 decision fills at bar-1 open, not bar-0 close', () => {
  const bars = [
    bar(1, 100, 110), // close 110
    bar(2, 105, 108), // next open 105 (deliberately different from prior close)
  ];

  let futureVisible = true;
  const strat = (ctx) => {
    if (ctx.index === 0) {
      // Attempt to read a FUTURE bar; the view must return undefined.
      futureVisible = ctx.history.at(1) !== undefined || ctx.history.get(1) !== undefined;
      return ctx.buy(1);
    }
    return ctx.hold();
  };

  const res = runBacktest({
    bars, strategy: strat, initialCapital: 100000,
    options: { cost: { broker: 'wealthsimple' } },
  });

  assert.strictEqual(futureVisible, false, 'strategy must not see bar 1 while on bar 0');
  assert.strictEqual(res.tradeLog[0].entryPrice, 105, 'fill must be the NEXT bar open (105)');
  assert.notStrictEqual(res.tradeLog[0].entryPrice, 110, 'fill must NOT be the decision-bar close (110)');
  // Gross pnl of the 1-share round trip: exit at terminal close 108, entry 105 => +3.
  assert.strictEqual(res.tradeLog[0].grossPnl, 3);
});

// ---------------------------------------------------------------------------
// 4. SMA CROSSOVER on a monotonic up series: exactly one trade, positive return
// ---------------------------------------------------------------------------
// Monotonically rising closes 100..107 with gap-free opens. With fast=2, slow=3
// the slow SMA first exists at index 2; the fast SMA already exceeds it (rising
// series), so a single golden cross fires at index 2 and fills at index 3's
// open. The position is held to the end (no death cross on a rising series) and
// liquidated once. Result: exactly ONE trade and a strictly positive return.
test('smaCrossover on a monotonic up series produces exactly one trade and a positive return', () => {
  const closes = [100, 101, 102, 103, 104, 105, 106, 107];
  const bars = closes.map((c, i) => bar(i + 1, i === 0 ? c : closes[i - 1], c));

  const res = runBacktest({
    bars,
    strategy: strategies.smaCrossover(2, 3),
    initialCapital: 100000,
    options: { cost: { broker: 'wealthsimple' } },
  });

  assert.strictEqual(res.numTrades, 1, 'exactly one golden-cross round trip');
  assert.ok(res.totalReturn > 0, `expected positive return, got ${res.totalReturn}`);
  assert.ok(res.finalEquity > 100000, 'final equity must exceed initial capital');
  assert.strictEqual(res.tradeLog[0].side, 'long');
  // Entry fills at open[3] = close[2] = 102 (next bar after the index-2 signal).
  assert.strictEqual(res.tradeLog[0].entryPrice, 102);
});

// ---------------------------------------------------------------------------
// 5. MAX DRAWDOWN on a known peak-then-trough curve
// ---------------------------------------------------------------------------
// [100, 120, 60, 200]: running peak hits 120, then equity falls to 60.
// Deepest drawdown = (120 - 60) / 120 = 0.5. The later recovery to 200 does not
// reduce the historical max drawdown.
test('maxDrawdown equals the hand-computed peak-to-trough fraction', () => {
  assert.strictEqual(BT.computeMaxDrawdown([100, 120, 60, 200]), 0.5);
  // A monotonically rising curve has zero drawdown.
  assert.strictEqual(BT.computeMaxDrawdown([100, 110, 130]), 0);
  // Simple 25% case: peak 120, trough 90 => 30/120 = 0.25.
  assert.strictEqual(BT.computeMaxDrawdown([100, 120, 90, 110]), 0.25);
  // Degenerate inputs.
  assert.strictEqual(BT.computeMaxDrawdown([100]), 0);
  assert.strictEqual(BT.computeMaxDrawdown([]), 0);
});

// ---------------------------------------------------------------------------
// 6. SHARPE on a flat equity curve is 0 (not NaN)
// ---------------------------------------------------------------------------
// A flat curve yields all-zero per-period returns => zero variance. Sharpe must
// be exactly 0 and finite, never NaN (guarded division).
test('Sharpe on a flat / zero-variance equity curve is 0, not NaN', () => {
  const flat = BT.computeSharpe([100, 100, 100, 100], 252, 0);
  assert.strictEqual(flat, 0);
  assert.ok(Number.isFinite(flat), 'Sharpe must be finite');
  // A curve that rises on average but with VARYING per-period returns has a
  // positive, finite Sharpe. (A constant-return curve would have zero variance
  // and thus Sharpe 0, which is exactly why the flat case above is 0.)
  const up = BT.computeSharpe([100, 102, 101, 104], 252, 0);
  assert.ok(up > 0 && Number.isFinite(up), `expected positive finite Sharpe, got ${up}`);
  // Too few points -> 0.
  assert.strictEqual(BT.computeSharpe([100], 252, 0), 0);
});

// ---------------------------------------------------------------------------
// 7. CASH CONSTRAINT: a strategy can never spend more cash than it has
// ---------------------------------------------------------------------------
// initialCapital = 1,000 and the entry price (open[1]) is 100, so at most
// floor(1000/100) = 10 shares are affordable at zero cost. A strategy that
// tries to buy 1,000,000,000 shares must be clamped to 10, cash must never go
// negative on any bar, and the position value must not exceed the capital.
test('a strategy cannot spend more than available cash', () => {
  const bars = [
    bar(1, 100, 100),
    bar(2, 100, 100),
    bar(3, 100, 100),
  ];
  const greedy = (ctx) => (ctx.index === 0 ? ctx.buy(1e9) : ctx.hold());

  const res = runBacktest({
    bars, strategy: greedy, initialCapital: 1000,
    options: { cost: { broker: 'wealthsimple' }, closeAtEnd: false },
  });

  // Entry bought exactly 10 shares (the max affordable).
  assert.strictEqual(res.equityCurve[1].positionQty, 10, 'must buy the max affordable (10) shares');
  // Cash is never negative on any recorded bar.
  for (const p of res.equityCurve) {
    assert.ok(p.cash >= -1e-9, `cash went negative: ${p.cash}`);
  }
  // 10 shares * $100 = $1000 <= initialCapital; nothing overspent.
  assert.ok(10 * 100 <= 1000 + 1e-9);
  // Buying one more share (11 * 100 = 1100) would have exceeded cash, so it was refused.
  assert.ok(res.equityCurve[1].positionQty * 100 <= 1000 + 1e-9);
});

// ---------------------------------------------------------------------------
// 8. CASH CONSTRAINT with commission: fee is reserved (never overspends)
// ---------------------------------------------------------------------------
// With RBC's $9.95 flat commission, buying at 100 with $1,000: the largest N
// with N*100 + 9.95 <= 1000 is N = 9 (9*100 + 9.95 = 909.95). N = 10 would need
// 1009.95 > 1000, so it must be refused down to 9.
test('cash constraint reserves commission so the account never goes negative', () => {
  const bars = [bar(1, 100, 100), bar(2, 100, 100), bar(3, 100, 100)];
  const greedy = (ctx) => (ctx.index === 0 ? ctx.buy(1e9) : ctx.hold());

  const res = runBacktest({
    bars, strategy: greedy, initialCapital: 1000,
    options: { cost: { broker: 'rbc' }, closeAtEnd: false },
  });

  assert.strictEqual(res.equityCurve[1].positionQty, 9, 'commission must be reserved => 9 shares, not 10');
  for (const p of res.equityCurve) assert.ok(p.cash >= -1e-9, `cash negative: ${p.cash}`);
});

// ---------------------------------------------------------------------------
// 9. EDGE CASES: empty bars, single bar, insufficient indicator history
// ---------------------------------------------------------------------------
test('edge cases: empty series, single bar, and insufficient indicator history are safe', () => {
  // Empty series: well-formed zeroed result.
  const empty = runBacktest({ bars: [], strategy: strategies.buyAndHold, initialCapital: 5000 });
  assert.strictEqual(empty.finalEquity, 5000);
  assert.strictEqual(empty.totalReturn, 0);
  assert.strictEqual(empty.numTrades, 0);
  assert.strictEqual(empty.maxDrawdown, 0);
  assert.strictEqual(empty.annualizedSharpe, 0);
  assert.deepStrictEqual(empty.equityCurve, []);

  // Single bar: the bar-0 decision can never fill (no next bar). Flat result.
  const single = runBacktest({
    bars: [bar(1, 100, 100)], strategy: strategies.buyAndHold, initialCapital: 5000,
  });
  assert.strictEqual(single.numTrades, 0, 'no fill is possible with a single bar');
  assert.strictEqual(single.finalEquity, 5000);
  assert.strictEqual(single.equityCurve.length, 1);

  // Insufficient history for the slow SMA -> the crossover strategy holds and
  // never trades (only 3 bars, slow period 10).
  const bars = [bar(1, 100, 101), bar(2, 101, 102), bar(3, 102, 103)];
  const thin = runBacktest({
    bars, strategy: strategies.smaCrossover(3, 10), initialCapital: 5000,
    options: { cost: { broker: 'wealthsimple' } },
  });
  assert.strictEqual(thin.numTrades, 0, 'insufficient indicator history must not trade');
  assert.strictEqual(thin.totalReturn, 0);
});

// ---------------------------------------------------------------------------
// 10. ACCOUNTING RECONCILIATION: sum of trade P&L == change in equity
// ---------------------------------------------------------------------------
// A hard invariant that proves cash and trade-log accounting agree: with all
// positions closed at the end, initialCapital + sum(tradePnl) must equal
// finalEquity. Run with a real broker cost so commissions are exercised.
test('accounting reconciles: initialCapital + sum(trade pnl) == finalEquity', () => {
  const closes = [100, 102, 101, 105, 104, 108, 110, 107, 112, 115];
  const bars = closes.map((c, i) => bar(i + 1, i === 0 ? c : closes[i - 1], c));

  const res = runBacktest({
    bars,
    strategy: strategies.smaCrossover(2, 4),
    initialCapital: 50000,
    options: { cost: { broker: 'rbc' } },
  });

  const sumPnl = res.tradeLog.reduce((a, t) => a + t.pnl, 0);
  assert.ok(
    approx(50000 + sumPnl, res.finalEquity, 0.01),
    `reconciliation failed: 50000 + ${sumPnl} != ${res.finalEquity}`,
  );
  // Metrics are internally consistent.
  assert.ok(res.exposure >= 0 && res.exposure <= 1, 'exposure must be a fraction');
  assert.ok(res.winRate >= 0 && res.winRate <= 1, 'winRate must be a fraction');
});

// ---------------------------------------------------------------------------
// 11. SHORTING: a short position profits when price falls
// ---------------------------------------------------------------------------
// Falling series 100 -> 90. Short 10 shares entered at open[1] = 100 and
// covered at the terminal close 90 => gross pnl = (100 - 90) * 10 = +100.
test('short positions are supported and profit on a falling series', () => {
  const bars = [
    bar(1, 100, 100),
    bar(2, 100, 95),
    bar(3, 95, 90),
  ];
  const shortIt = (ctx) => (ctx.index === 0 ? ctx.short(10) : ctx.hold());

  const res = runBacktest({
    bars, strategy: shortIt, initialCapital: 100000,
    options: { cost: { broker: 'wealthsimple' } },
  });

  assert.strictEqual(res.numTrades, 1);
  assert.strictEqual(res.tradeLog[0].side, 'short');
  assert.strictEqual(res.tradeLog[0].entryPrice, 100);
  assert.strictEqual(res.tradeLog[0].exitPrice, 90);
  assert.strictEqual(res.tradeLog[0].grossPnl, 100); // (100 - 90) * 10
  assert.ok(res.totalReturn > 0, 'short into a decline should be profitable');
});

// ---------------------------------------------------------------------------
// 12. HELPER: profitFactor and CAGR hand values
// ---------------------------------------------------------------------------
test('profitFactor and CAGR helpers match hand-computed values', () => {
  // wins 10 + 30 = 40 ; losses |-20| = 20 ; PF = 40/20 = 2.
  assert.strictEqual(BT.computeProfitFactor([10, -20, 30]), 2);
  // All wins, no losses -> Infinity.
  assert.strictEqual(BT.computeProfitFactor([5, 5]), Infinity);
  // No wins -> 0.
  assert.strictEqual(BT.computeProfitFactor([-1, -2]), 0);
  // Double the money over exactly one year -> 100% CAGR.
  assert.ok(approx(BT.computeCAGR(100, 200, 1), 1.0));
  // Zero / negative span guards.
  assert.strictEqual(BT.computeCAGR(100, 200, 0), 0);
  // Wiped-out account clamps to -1, never NaN.
  assert.strictEqual(BT.computeCAGR(100, 0, 2), -1);
});
