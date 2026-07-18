'use strict';

const test = require('node:test');
const assert = require('node:assert');
const FM = require('../services/fee-model.js');

// Helper: number of brokers we expect to be modeled.
const EXPECTED_BROKER_IDS = [
  'wealthsimple', 'questrade', 'nbdb', 'qtrade', 'ibkr',
  'moomoo', 'webull', 'td', 'rbc', 'disnat',
];

test('BROKERS enumerates all 10 Canadian brokers with well-formed fee shapes', () => {
  for (const id of EXPECTED_BROKER_IDS) {
    const b = FM.BROKERS[id];
    assert.ok(b, `missing broker ${id}`);
    assert.strictEqual(b.id, id, `broker id mismatch for ${id}`);
    assert.ok(b.stockCommission && typeof b.stockCommission.type === 'string', `${id} stockCommission shape`);
    assert.ok(b.optionsFee && typeof b.optionsFee.perContract === 'number', `${id} optionsFee shape`);
    assert.ok(b.fx && typeof b.fx.ratePct === 'number', `${id} fx shape`);
    assert.ok(typeof b.accountFees === 'string', `${id} accountFees note`);
  }
  assert.strictEqual(Object.keys(FM.BROKERS).length, EXPECTED_BROKER_IDS.length);
});

test('a $0-commission stock trade at Wealthsimple has zero commission and zero total', () => {
  const r = FM.estimateTradeCost({
    broker: 'wealthsimple', side: 'buy', quantity: 100, price: 30,
    currency: 'CAD', accountCurrency: 'CAD',
  });
  assert.strictEqual(r.commission, 0, 'Wealthsimple stock commission must be 0');
  assert.strictEqual(r.fxCost, 0, 'same-currency trade has no FX');
  assert.strictEqual(r.total, 0, 'total must be 0');
});

test('a USD trade from a CAD account incurs ~1.5% FX at Wealthsimple but near-zero at IBKR', () => {
  const trade = { side: 'buy', quantity: 100, price: 50, currency: 'USD', accountCurrency: 'CAD' };
  const notional = 100 * 50; // 5000 USD

  const ws = FM.estimateTradeCost(Object.assign({ broker: 'wealthsimple' }, trade));
  const expectedWsFx = (notional * FM.BROKERS.wealthsimple.fx.ratePct) / 100; // 75
  assert.strictEqual(ws.fxCost, FM.round2(expectedWsFx), 'Wealthsimple FX should be 1.5% of notional');
  assert.ok(Math.abs(ws.fxCost / notional - 0.015) < 1e-9, 'Wealthsimple FX drag should be 1.5%');
  assert.strictEqual(ws.commission, 0);

  const ib = FM.estimateTradeCost(Object.assign({ broker: 'ibkr' }, trade));
  // IBKR FX: 0.002% of notional = 0.10, floored at the US$2 minimum.
  assert.strictEqual(ib.fxCost, 2.0, 'IBKR FX should hit the US$2 minimum, not a spread');
  assert.ok(ib.fxCost / notional < 0.001, 'IBKR FX drag is under 0.1% (near spot)');
  // IBKR commission: 0.005 * 100 = 0.50, floored at US$1 min, under the 1% cap.
  assert.strictEqual(ib.commission, 1.0, 'IBKR commission hits US$1 minimum');
  assert.strictEqual(ib.total, 3.0, 'IBKR total = 1.00 commission + 2.00 FX');
  assert.ok(ib.total < ws.total, 'IBKR is far cheaper than Wealthsimple on a USD trade');
});

test('compareBrokers returns IBKR cheapest first for a USD trade with FX', () => {
  const trade = { side: 'buy', quantity: 100, price: 50, currency: 'USD', accountCurrency: 'CAD' };
  // Compare the mainstream brokers with documented FX (moomoo excluded: its
  // advertised $0 FX is unverified and would otherwise sort ahead falsely).
  const subset = ['wealthsimple', 'questrade', 'nbdb', 'td', 'rbc', 'ibkr'];
  const ranked = FM.compareBrokers(trade, subset);
  assert.strictEqual(ranked[0].broker, 'ibkr', 'IBKR should be the cheapest venue for this USD trade');
  // Sorted ascending by total.
  for (let i = 1; i < ranked.length; i++) {
    assert.ok(ranked[i].total >= ranked[i - 1].total, 'results must be sorted cheapest first');
  }
  // Banks (flat commission + FX) should be the most expensive here.
  assert.ok(['td', 'rbc'].includes(ranked[ranked.length - 1].broker), 'a bank should be the most expensive');
});

test("Norbert's Gambit saves roughly (1.5% of amount minus journaling fee) and is positive for $10,000", () => {
  const amount = 10000;
  const ratePct = 1.5;
  const journalingFee = 10;
  const g = FM.norbertsGambitSavings({ amountCAD: amount, brokerFxRatePct: ratePct, journalingFee });

  const expectedBrokerFx = (amount * ratePct) / 100; // 150
  assert.strictEqual(g.brokerFxCost, expectedBrokerFx, 'broker FX cost should be 1.5% of amount');
  assert.strictEqual(g.savings, FM.round2(expectedBrokerFx - journalingFee), 'savings = broker FX cost - journaling fee');
  assert.ok(g.savings > 0, 'gambit must save money on a $10,000 conversion');
  assert.strictEqual(g.currency, 'CAD');

  // With no journaling fee the full 1.5% is saved.
  const gFree = FM.norbertsGambitSavings({ amountCAD: amount, brokerFxRatePct: ratePct });
  assert.strictEqual(gFree.savings, expectedBrokerFx, 'zero-fee gambit saves the full FX cost');
});

test('annualFxDrag on $50,000 USD volume at 1.5% is $750', () => {
  const d = FM.annualFxDrag({ usdTradingVolume: 50000, brokerFxRatePct: 1.5 });
  assert.strictEqual(d.annualDrag, 750, 'annual FX drag should be exactly $750');
});

test('a same-currency trade has zero FX cost (CAD security in a CAD account)', () => {
  const r = FM.estimateTradeCost({
    broker: 'td', side: 'buy', quantity: 100, price: 40,
    currency: 'CAD', accountCurrency: 'CAD',
  });
  assert.strictEqual(r.crossCurrency, false);
  assert.strictEqual(r.fxCost, 0, 'no conversion means no FX cost');
  // TD still charges its flat commission on the same-currency trade.
  assert.strictEqual(r.commission, FM.BROKERS.td.stockCommission.amount);
});

test('options-contract fees apply correctly: Wealthsimple $0 vs NBDB $1.25/contract min $6.25', () => {
  const base = { side: 'buy', price: 2.5, currency: 'CAD', accountCurrency: 'CAD', isOption: true };

  const ws1 = FM.estimateTradeCost(Object.assign({ broker: 'wealthsimple', contracts: 1 }, base));
  assert.strictEqual(ws1.optionsFee, 0, 'Wealthsimple options fee is $0 per contract');
  assert.strictEqual(ws1.commission, 0, 'options trades carry no separate stock commission');

  // NBDB: 1 contract -> $1.25 floored at the $6.25 minimum.
  const nb1 = FM.estimateTradeCost(Object.assign({ broker: 'nbdb', contracts: 1 }, base));
  assert.strictEqual(nb1.optionsFee, 6.25, 'NBDB single contract hits the $6.25 minimum');

  // NBDB: 10 contracts -> $12.50, above the minimum.
  const nb10 = FM.estimateTradeCost(Object.assign({ broker: 'nbdb', contracts: 10 }, base));
  const expected10 = FM.BROKERS.nbdb.optionsFee.perContract * 10; // 12.50
  assert.strictEqual(nb10.optionsFee, FM.round2(expected10), 'NBDB 10 contracts = $12.50 (above minimum)');

  // Bank options carry a per-order base plus per-contract.
  const td1 = FM.estimateTradeCost(Object.assign({ broker: 'td', contracts: 1 }, base));
  const expectedTd = FM.BROKERS.td.optionsFee.base + FM.BROKERS.td.optionsFee.perContract; // 9.99 + 1.25
  assert.strictEqual(td1.optionsFee, FM.round2(expectedTd), 'TD options = base $9.99 + $1.25/contract');
});

test('a zero-quantity trade costs nothing', () => {
  const r = FM.estimateTradeCost({
    broker: 'td', quantity: 0, price: 40, currency: 'CAD', accountCurrency: 'CAD',
  });
  assert.strictEqual(r.total, 0);
  assert.strictEqual(r.commission, 0);
});

test('an unknown broker throws a clear error', () => {
  assert.throws(
    () => FM.estimateTradeCost({ broker: 'robinhood', quantity: 10, price: 5, currency: 'USD', accountCurrency: 'CAD' }),
    /Unknown broker "robinhood"/,
    'estimateTradeCost should reject unknown brokers'
  );
  assert.throws(() => FM.getBroker('nope'), /Unknown broker/);
});

test('IBKR per-share commission respects the 1% max cap on tiny, high-priced lots', () => {
  // 1 share at $50: raw per-share fee 0.005 floored to US$1 min, but the 1%
  // cap on a $50 notional is $0.50, so the cap wins.
  const r = FM.estimateTradeCost({
    broker: 'ibkr', quantity: 1, price: 50, currency: 'USD', accountCurrency: 'USD',
  });
  assert.strictEqual(r.commission, 0.5, 'IBKR commission capped at 1% of the $50 notional');
  assert.strictEqual(r.fxCost, 0, 'USD security in a USD account has no FX');
});
