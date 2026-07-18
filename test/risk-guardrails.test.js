'use strict';

/* ============================================================================
   RISK GUARDRAILS ENGINE - UNIT TESTS
   Each hard limit is exercised twice: once with an order that breaches it (must
   deny) and once with an order inside it (must allow). Every threshold is hand
   computed in a comment so the expected outcome is auditable without running
   the code. Also covers the kill switch, circuit breaker, daily loss halt,
   paper-validation gate, fail-closed handling of malformed input, and reporting
   of multiple simultaneous violations.
   ============================================================================ */

const test = require('node:test');
const assert = require('node:assert');
const RG = require('../services/risk-guardrails.js');

// A risk state that will not itself trip any state-based halt: peak == start ==
// current equity, so drawdown and daily loss are both 0.
function cleanState(equity) {
  const rs = RG.createRiskState();
  rs.peakEquity = equity;
  rs.startOfDayEquity = equity;
  return rs;
}

function rulesOf(result) {
  return result.violations.map((v) => v.rule);
}

/* -------------------------------------------------------------------------- */
/* DEFAULT_LIMITS sanity                                                       */
/* -------------------------------------------------------------------------- */

test('DEFAULT_LIMITS exposes the conservative documented defaults', () => {
  const L = RG.DEFAULT_LIMITS;
  assert.strictEqual(L.maxOrderNotional, 10000);
  assert.strictEqual(L.maxPositionPct, 20);
  assert.strictEqual(L.maxConcurrentPositions, 10);
  assert.strictEqual(L.maxDailyLossPct, 3);
  assert.strictEqual(L.circuitBreakerDrawdownPct, 10);
  assert.strictEqual(L.maxLeverage, 1.0);
  assert.strictEqual(L.requirePaperConfirmedBeforeLive, true);
});

test('a fully valid, within-limits order is allowed with no violations', () => {
  // equity 100k, order 10 @ $100 = $1,000 notional.
  // notional 1,000 <= 10,000; position 1% <= 20%; leverage 0.01x <= 1x;
  // buying power 1,000 <= 100,000; paper mode so no live gate. -> allowed.
  const acct = { equity: 100000, buyingPower: 100000, positions: [] };
  const order = { symbol: 'AAPL', qty: 10, price: 100, side: 'buy', mode: 'paper' };
  const res = RG.checkOrder(order, acct, {}, cleanState(100000));
  assert.strictEqual(res.allowed, true);
  assert.deepStrictEqual(res.violations, []);
});

/* -------------------------------------------------------------------------- */
/* 1. Order notional cap                                                       */
/* -------------------------------------------------------------------------- */

test('order notional cap: denies over cap, allows within', () => {
  const acct = { equity: 100000, buyingPower: 100000, positions: [] };

  // BREACH: 200 @ $100 = $20,000 notional > $10,000 cap.
  // position 20,000/100,000 = 20% (== cap, not over); leverage 0.2x; bp ok.
  // So order_notional is the ONLY breach.
  const over = RG.checkOrder(
    { symbol: 'AAPL', qty: 200, price: 100, side: 'buy', mode: 'paper' },
    acct, {}, cleanState(100000)
  );
  assert.strictEqual(over.allowed, false);
  assert.ok(rulesOf(over).includes('order_notional'));
  assert.deepStrictEqual(rulesOf(over), ['order_notional']);

  // WITHIN: 10 @ $100 = $1,000 <= $10,000.
  const within = RG.checkOrder(
    { symbol: 'AAPL', qty: 10, price: 100, side: 'buy', mode: 'paper' },
    acct, {}, cleanState(100000)
  );
  assert.strictEqual(within.allowed, true);
});

/* -------------------------------------------------------------------------- */
/* 2. Position % of equity cap                                                 */
/* -------------------------------------------------------------------------- */

test('position % cap: denies when resulting position exceeds 20% of equity', () => {
  const equity = 100000; // 20% cap = $20,000 per position.

  // BREACH: existing AAPL $15,000 + buy 90 @ $100 ($9,000) = $24,000 resulting.
  // 24,000/100,000 = 24% > 20%. Order notional 9,000 <= 10,000 (no notional
  // breach); leverage (15,000+9,000)/100,000 = 0.24x (ok); symbol already open.
  // So position_pct is the only breach.
  const overAcct = { equity, buyingPower: 100000, positions: [{ symbol: 'AAPL', marketValue: 15000 }] };
  const over = RG.checkOrder(
    { symbol: 'AAPL', qty: 90, price: 100, side: 'buy', mode: 'paper' },
    overAcct, {}, cleanState(equity)
  );
  assert.strictEqual(over.allowed, false);
  assert.deepStrictEqual(rulesOf(over), ['position_pct']);

  // WITHIN: existing $5,000 + $9,000 = $14,000 = 14% <= 20%.
  const withinAcct = { equity, buyingPower: 100000, positions: [{ symbol: 'AAPL', marketValue: 5000 }] };
  const within = RG.checkOrder(
    { symbol: 'AAPL', qty: 90, price: 100, side: 'buy', mode: 'paper' },
    withinAcct, {}, cleanState(equity)
  );
  assert.strictEqual(within.allowed, true);
});

/* -------------------------------------------------------------------------- */
/* 3. Concurrent position count cap                                            */
/* -------------------------------------------------------------------------- */

test('concurrent positions cap: denies an 11th, allows adding to an existing name', () => {
  // 10 open positions, each $1,000. equity 1,000,000 keeps every other check
  // slack (position % tiny, leverage ~0.011x).
  const positions = [];
  for (let i = 0; i < 10; i++) positions.push({ symbol: 'S' + i, marketValue: 1000 });
  const acct = { equity: 1000000, buyingPower: 1000000, positions };

  // BREACH: new symbol -> resulting 11 > 10.
  const over = RG.checkOrder(
    { symbol: 'NEW', qty: 10, price: 100, side: 'buy', mode: 'paper' },
    acct, {}, cleanState(1000000)
  );
  assert.strictEqual(over.allowed, false);
  assert.deepStrictEqual(rulesOf(over), ['max_concurrent_positions']);

  // WITHIN: order adds to already-open S0 -> count stays 10.
  const within = RG.checkOrder(
    { symbol: 'S0', qty: 10, price: 100, side: 'buy', mode: 'paper' },
    acct, {}, cleanState(1000000)
  );
  assert.strictEqual(within.allowed, true);
});

/* -------------------------------------------------------------------------- */
/* 4. Buying power                                                             */
/* -------------------------------------------------------------------------- */

test('buying power: denies when a buy exceeds available funds, allows within', () => {
  // BREACH: buy 60 @ $100 = $6,000 > $5,000 buying power.
  // notional 6,000 <= 10,000; position 6% ok; leverage 0.06x ok.
  const overAcct = { equity: 100000, buyingPower: 5000, positions: [] };
  const over = RG.checkOrder(
    { symbol: 'AAPL', qty: 60, price: 100, side: 'buy', mode: 'paper' },
    overAcct, {}, cleanState(100000)
  );
  assert.strictEqual(over.allowed, false);
  assert.deepStrictEqual(rulesOf(over), ['buying_power']);

  // WITHIN: same $6,000 order, buying power $50,000.
  const withinAcct = { equity: 100000, buyingPower: 50000, positions: [] };
  const within = RG.checkOrder(
    { symbol: 'AAPL', qty: 60, price: 100, side: 'buy', mode: 'paper' },
    withinAcct, {}, cleanState(100000)
  );
  assert.strictEqual(within.allowed, true);
});

/* -------------------------------------------------------------------------- */
/* 5. Leverage cap                                                             */
/* -------------------------------------------------------------------------- */

test('leverage cap: denies when gross exposure/equity exceeds 1.0x, allows within', () => {
  // equity 20,000, max leverage 1.0x -> gross exposure cap $20,000.
  // BREACH: existing gross $18,000 (A $9k + B $9k) + buy C $3,000 = $21,000.
  // 21,000/20,000 = 1.05x > 1.0x. Order notional 3,000 <= 10,000; C position
  // 3,000/20,000 = 15% <= 20%; buying power 50,000 ok; concurrent 3 <= 10.
  // So leverage is the only breach. (Existing A/B are not re-checked for
  // position % - that rule only bounds the incoming order's resulting name.)
  const overAcct = {
    equity: 20000, buyingPower: 50000,
    positions: [{ symbol: 'A', marketValue: 9000 }, { symbol: 'B', marketValue: 9000 }],
  };
  const over = RG.checkOrder(
    { symbol: 'C', qty: 30, price: 100, side: 'buy', mode: 'paper' },
    overAcct, {}, cleanState(20000)
  );
  assert.strictEqual(over.allowed, false);
  assert.deepStrictEqual(rulesOf(over), ['leverage']);

  // WITHIN: existing gross $10,000 + $3,000 = $13,000 -> 0.65x <= 1.0x.
  const withinAcct = {
    equity: 20000, buyingPower: 50000,
    positions: [{ symbol: 'A', marketValue: 5000 }, { symbol: 'B', marketValue: 5000 }],
  };
  const within = RG.checkOrder(
    { symbol: 'C', qty: 30, price: 100, side: 'buy', mode: 'paper' },
    withinAcct, {}, cleanState(20000)
  );
  assert.strictEqual(within.allowed, true);
});

/* -------------------------------------------------------------------------- */
/* Kill switch                                                                 */
/* -------------------------------------------------------------------------- */

test('kill switch denies ALL orders and release restores trading', () => {
  const acct = { equity: 100000, buyingPower: 100000, positions: [] };
  const order = { symbol: 'AAPL', qty: 10, price: 100, side: 'buy', mode: 'paper' };
  const rs = cleanState(100000);

  // Engaged -> even a perfectly valid order is denied.
  RG.engageKillSwitch(rs, 'manual halt by operator');
  assert.strictEqual(RG.isHalted(rs), true);
  const halted = RG.checkOrder(order, acct, {}, rs);
  assert.strictEqual(halted.allowed, false);
  assert.ok(rulesOf(halted).includes('kill_switch'));

  // Released -> same order flows again.
  RG.releaseKillSwitch(rs);
  assert.strictEqual(RG.isHalted(rs), false);
  const restored = RG.checkOrder(order, acct, {}, rs);
  assert.strictEqual(restored.allowed, true);
});

test('isHalted fails closed on a missing risk state and checkOrder denies', () => {
  assert.strictEqual(RG.isHalted(undefined), true);
  assert.strictEqual(RG.isHalted(null), true);
  const acct = { equity: 100000, buyingPower: 100000, positions: [] };
  const order = { symbol: 'AAPL', qty: 10, price: 100, side: 'buy', mode: 'paper' };
  const res = RG.checkOrder(order, acct, {}, undefined);
  assert.strictEqual(res.allowed, false);
  assert.ok(rulesOf(res).includes('kill_switch'));
});

/* -------------------------------------------------------------------------- */
/* Circuit breaker (drawdown from peak)                                        */
/* -------------------------------------------------------------------------- */

test('circuit breaker auto-halts when drawdown from peak exceeds the threshold', () => {
  // peak 100,000; start-of-day 91,000; current equity 89,500.
  // drawdown = (100,000 - 89,500)/100,000 = 10.5% > 10% -> HALT (circuit breaker).
  // daily loss = (91,000 - 89,500)/91,000 = 1.65% < 3% -> NOT the trigger,
  // so the reason is unambiguously the circuit breaker.
  const rs = RG.createRiskState();
  rs.peakEquity = 100000;
  rs.startOfDayEquity = 91000;

  RG.updateRiskState(rs, { equity: 89500 }, {});
  assert.strictEqual(rs.halted, true);
  assert.match(rs.haltReason, /circuit breaker/i);
  assert.match(rs.haltReason, /drawdown/i);

  // And an order is now denied by the circuit breaker inside checkOrder too.
  const res = RG.checkOrder(
    { symbol: 'AAPL', qty: 10, price: 100, side: 'buy', mode: 'paper' },
    { equity: 89500, buyingPower: 100000, positions: [] }, {}, rs
  );
  assert.strictEqual(res.allowed, false);
  // kill_switch (rs is halted) AND the independent circuit_breaker check fire.
  assert.ok(rulesOf(res).includes('kill_switch'));
  assert.ok(rulesOf(res).includes('circuit_breaker'));
});

test('circuit breaker does not halt within the drawdown threshold', () => {
  // peak 100,000; equity 95,000 -> drawdown 5% <= 10%. start-of-day 95,000 so
  // no daily loss either. -> no halt.
  const rs = RG.createRiskState();
  rs.peakEquity = 100000;
  rs.startOfDayEquity = 95000;
  RG.updateRiskState(rs, { equity: 95000 }, {});
  assert.strictEqual(rs.halted, false);
  assert.strictEqual(rs.haltReason, null);
});

/* -------------------------------------------------------------------------- */
/* Daily loss limit                                                            */
/* -------------------------------------------------------------------------- */

test('daily loss limit halts when the day loss exceeds the cap', () => {
  // start-of-day 100,000; peak 100,000; equity 96,000.
  // daily loss = (100,000 - 96,000)/100,000 = 4% > 3% -> HALT.
  // drawdown = 4% <= 10% so the circuit breaker is NOT the trigger; the reason
  // is the daily loss limit.
  const rs = RG.createRiskState();
  rs.peakEquity = 100000;
  rs.startOfDayEquity = 100000;
  RG.updateRiskState(rs, { equity: 96000 }, {});
  assert.strictEqual(rs.halted, true);
  assert.match(rs.haltReason, /daily loss/i);
});

test('daily loss limit does not halt a small intraday drawdown', () => {
  // 2% day loss < 3% cap; 2% drawdown < 10% -> no halt.
  const rs = RG.createRiskState();
  rs.peakEquity = 100000;
  rs.startOfDayEquity = 100000;
  RG.updateRiskState(rs, { equity: 98000 }, {});
  assert.strictEqual(rs.halted, false);
});

test('startNewDay resets the daily baseline but never releases a halt', () => {
  const rs = RG.createRiskState();
  rs.peakEquity = 100000;
  rs.startOfDayEquity = 100000;
  RG.updateRiskState(rs, { equity: 96000 }, {}); // halts on 4% daily loss
  assert.strictEqual(rs.halted, true);

  RG.startNewDay(rs, 96000);
  assert.strictEqual(rs.startOfDayEquity, 96000);
  assert.strictEqual(rs.dailyRealizedPnl, 0);
  assert.strictEqual(rs.peakEquity, 100000); // peak (high-water mark) preserved
  assert.strictEqual(rs.halted, true); // halt survives the day boundary
});

test('updateRiskState fails closed on invalid equity', () => {
  const rs = cleanState(100000);
  RG.updateRiskState(rs, { equity: NaN }, {});
  assert.strictEqual(rs.halted, true);
  assert.match(rs.haltReason, /equity/i);
});

/* -------------------------------------------------------------------------- */
/* Live order requires paper validation                                        */
/* -------------------------------------------------------------------------- */

test('live order without paper confirmation is denied; confirmed is allowed', () => {
  const acct = { equity: 100000, buyingPower: 100000, positions: [] };

  // LIVE, not paper-confirmed -> denied by paper_confirmation gate.
  const unconfirmed = RG.checkOrder(
    { symbol: 'AAPL', qty: 10, price: 100, side: 'buy', mode: 'live' },
    acct, {}, cleanState(100000)
  );
  assert.strictEqual(unconfirmed.allowed, false);
  assert.deepStrictEqual(rulesOf(unconfirmed), ['paper_confirmation']);

  // LIVE, order carries paperConfirmed -> allowed.
  const confirmedOnOrder = RG.checkOrder(
    { symbol: 'AAPL', qty: 10, price: 100, side: 'buy', mode: 'live', paperConfirmed: true },
    acct, {}, cleanState(100000)
  );
  assert.strictEqual(confirmedOnOrder.allowed, true);

  // LIVE, confirmation carried on account state -> allowed.
  const confirmedOnAccount = RG.checkOrder(
    { symbol: 'AAPL', qty: 10, price: 100, side: 'buy', mode: 'live' },
    { ...acct, paperConfirmed: true }, {}, cleanState(100000)
  );
  assert.strictEqual(confirmedOnAccount.allowed, true);

  // PAPER mode never needs confirmation.
  const paper = RG.checkOrder(
    { symbol: 'AAPL', qty: 10, price: 100, side: 'buy', mode: 'paper' },
    acct, {}, cleanState(100000)
  );
  assert.strictEqual(paper.allowed, true);

  // If the requirement is disabled, an unconfirmed live order is allowed.
  const disabled = RG.checkOrder(
    { symbol: 'AAPL', qty: 10, price: 100, side: 'buy', mode: 'live' },
    acct, { requirePaperConfirmedBeforeLive: false }, cleanState(100000)
  );
  assert.strictEqual(disabled.allowed, true);
});

/* -------------------------------------------------------------------------- */
/* Fail closed on malformed input                                              */
/* -------------------------------------------------------------------------- */

test('malformed orders are denied (fail closed)', () => {
  const acct = { equity: 100000, buyingPower: 100000, positions: [] };
  const rs = cleanState(100000);

  const cases = [
    ['null order', null],
    ['missing qty', { symbol: 'AAPL', price: 100, side: 'buy' }],
    ['missing price', { symbol: 'AAPL', qty: 10, side: 'buy' }],
    ['negative qty', { symbol: 'AAPL', qty: -5, price: 100, side: 'buy' }],
    ['zero qty', { symbol: 'AAPL', qty: 0, price: 100, side: 'buy' }],
    ['NaN qty', { symbol: 'AAPL', qty: NaN, price: 100, side: 'buy' }],
    ['NaN price', { symbol: 'AAPL', qty: 10, price: NaN, side: 'buy' }],
    ['negative price', { symbol: 'AAPL', qty: 10, price: -100, side: 'buy' }],
    ['missing symbol', { qty: 10, price: 100, side: 'buy' }],
    ['bad side', { symbol: 'AAPL', qty: 10, price: 100, side: 'sideways' }],
    ['qty as string', { symbol: 'AAPL', qty: '10', price: 100, side: 'buy' }],
  ];

  for (const [label, order] of cases) {
    const res = RG.checkOrder(order, acct, {}, rs);
    assert.strictEqual(res.allowed, false, `${label} should be denied`);
    assert.ok(rulesOf(res).includes('malformed_input'), `${label} should flag malformed_input`);
  }
});

test('malformed account state is denied (fail closed)', () => {
  const order = { symbol: 'AAPL', qty: 10, price: 100, side: 'buy', mode: 'paper' };
  const rs = cleanState(100000);

  const nullAcct = RG.checkOrder(order, null, {}, rs);
  assert.strictEqual(nullAcct.allowed, false);
  assert.ok(rulesOf(nullAcct).includes('malformed_input'));

  const nanEquity = RG.checkOrder(order, { equity: NaN, buyingPower: 100000, positions: [] }, {}, rs);
  assert.strictEqual(nanEquity.allowed, false);
  assert.ok(rulesOf(nanEquity).includes('malformed_input'));

  // A buy with no usable buying power fails closed.
  const noBp = RG.checkOrder(order, { equity: 100000, positions: [] }, {}, rs);
  assert.strictEqual(noBp.allowed, false);
  assert.ok(rulesOf(noBp).includes('malformed_input'));
});

/* -------------------------------------------------------------------------- */
/* Multiple simultaneous violations are all reported                           */
/* -------------------------------------------------------------------------- */

test('checkOrder reports ALL simultaneous violations, not just the first', () => {
  // equity 10,000, buying power 5,000, no positions.
  // Order: buy 1,000 @ $100 = $100,000 notional. Breaches, at once:
  //   order_notional : 100,000 > 10,000
  //   position_pct   : 100,000/10,000 = 1000% > 20%
  //   leverage       : 100,000/10,000 = 10x > 1x
  //   buying_power   : 100,000 > 5,000
  // (concurrent stays 1 <= 10, so it does not fire.)
  const acct = { equity: 10000, buyingPower: 5000, positions: [] };
  const res = RG.checkOrder(
    { symbol: 'AAPL', qty: 1000, price: 100, side: 'buy', mode: 'paper' },
    acct, {}, cleanState(10000)
  );
  assert.strictEqual(res.allowed, false);
  const rules = rulesOf(res);
  for (const expected of ['order_notional', 'position_pct', 'leverage', 'buying_power']) {
    assert.ok(rules.includes(expected), `expected violation ${expected}, got ${rules.join(', ')}`);
  }
  assert.strictEqual(res.violations.length, 4);
});

test('a kill switch stacks with limit breaches (all reported together)', () => {
  const acct = { equity: 10000, buyingPower: 5000, positions: [] };
  const rs = cleanState(10000);
  RG.engageKillSwitch(rs, 'operator halt');
  const res = RG.checkOrder(
    { symbol: 'AAPL', qty: 1000, price: 100, side: 'buy', mode: 'paper' },
    acct, {}, rs
  );
  assert.strictEqual(res.allowed, false);
  assert.ok(rulesOf(res).includes('kill_switch'));
  assert.ok(rulesOf(res).includes('order_notional'));
});
