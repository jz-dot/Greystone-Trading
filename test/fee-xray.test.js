'use strict';

const test = require('node:test');
const assert = require('node:assert');
const FX = require('../services/fee-xray.js');

const HOLDINGS = [
  { marketValue: 60000, currency: 'USD' },
  { marketValue: 30000, currency: 'CAD' },
  { marketValue: 10000, currency: 'CAD' },
];

test('portfolioStats: totals, USD share, position count', () => {
  const s = FX.portfolioStats(HOLDINGS);
  assert.strictEqual(s.totalValueCad, 100000);
  assert.strictEqual(s.usdValueCad, 60000);
  assert.ok(Math.abs(s.usdShare - 0.6) < 1e-9);
  assert.strictEqual(s.positionCount, 3);
});

test('portfolioStats: empty and garbage input', () => {
  assert.strictEqual(FX.portfolioStats([]).totalValueCad, 0);
  assert.strictEqual(FX.portfolioStats(null).usdShare, 0);
  assert.strictEqual(FX.portfolioStats([{ marketValue: -5, currency: 'USD' }, {}]).positionCount, 0);
});

test('defaultTradeSize: 2% of portfolio, clamped both ends', () => {
  assert.strictEqual(FX.defaultTradeSize(100000), 2000);
  assert.strictEqual(FX.defaultTradeSize(1000), 250);       // floor
  assert.strictEqual(FX.defaultTradeSize(10000000), 50000); // cap
});

test('buildProfile: trade mix follows USD share; overrides respected', () => {
  const p = FX.buildProfile(HOLDINGS, { tradesPerYear: 20 });
  assert.strictEqual(p.usdTrades, 12);
  assert.strictEqual(p.cadTrades, 8);
  assert.strictEqual(p.avgTradeSizeCad, 2000);
  const p2 = FX.buildProfile(HOLDINGS, { tradesPerYear: 20, avgTradeSizeCad: 5000 });
  assert.strictEqual(p2.avgTradeSizeCad, 5000);
});

test('annualCostForBroker: a $0-commission broker beats a $9.99 bank on commissions', () => {
  const p = FX.buildProfile(HOLDINGS, { tradesPerYear: 24 });
  const ws = FX.annualCostForBroker('wealthsimple', p);
  const td = FX.annualCostForBroker('td', p);
  assert.strictEqual(ws.commissionsYr, 0);
  assert.ok(td.commissionsYr >= 24 * 9.99 - 0.01, 'TD charges 9.99 both currencies');
});

test('annualCostForBroker: IBKR FX drag is far below a 1.5% broker', () => {
  const p = FX.buildProfile(HOLDINGS, { tradesPerYear: 24 });
  const ibkr = FX.annualCostForBroker('ibkr', p);
  const rbc = FX.annualCostForBroker('rbc', p);
  assert.ok(ibkr.fxDragYr < rbc.fxDragYr / 10, 'ibkr ' + ibkr.fxDragYr + ' vs rbc ' + rbc.fxDragYr);
});

test('no USD holdings -> zero FX drag everywhere', () => {
  const cadOnly = [{ marketValue: 50000, currency: 'CAD' }];
  const p = FX.buildProfile(cadOnly, { tradesPerYear: 24 });
  assert.strictEqual(p.usdTrades, 0);
  FX.compareAnnualCosts(p).forEach(r => assert.strictEqual(r.fxDragYr, 0));
});

test('zero trades and zero contracts -> zero cost at every broker', () => {
  const p = FX.buildProfile(HOLDINGS, { tradesPerYear: 0, optionContractsPerYear: 0 });
  FX.compareAnnualCosts(p).forEach(r => assert.strictEqual(r.totalYr, 0));
});

test('options contracts add per-contract fees', () => {
  const p0 = FX.buildProfile(HOLDINGS, { tradesPerYear: 0, optionContractsPerYear: 0 });
  const p1 = FX.buildProfile(HOLDINGS, { tradesPerYear: 0, optionContractsPerYear: 100 });
  const td0 = FX.annualCostForBroker('td', p0);
  const td1 = FX.annualCostForBroker('td', p1);
  assert.ok(td1.optionsYr > td0.optionsYr);
  assert.strictEqual(td1.totalYr, td1.optionsYr);
});

test('compareAnnualCosts: ascending order, vsCheapest non-negative and zero at the top', () => {
  const p = FX.buildProfile(HOLDINGS, { tradesPerYear: 24, optionContractsPerYear: 20 });
  const rows = FX.compareAnnualCosts(p);
  assert.strictEqual(rows.length, 10);
  assert.strictEqual(rows[0].vsCheapest, 0);
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i].totalYr >= rows[i - 1].totalYr);
    assert.ok(rows[i].vsCheapest >= 0);
  }
});

test('fxStory: drag math and honest gambit friction', () => {
  const p = FX.buildProfile(HOLDINGS, { tradesPerYear: 20 }); // 12 USD trades x 2000 = 24000
  const s = FX.fxStory(p, 'rbc'); // 1.5%
  assert.strictEqual(s.volumeCad, 24000);
  assert.strictEqual(s.dragAtBroker, 360);
  assert.strictEqual(s.gambitCost, Math.round((2 * 9.99 + 24) * 100) / 100);
  assert.ok(Math.abs(s.gambitSavings - (360 - s.gambitCost)) < 0.01);
  assert.strictEqual(s.gambitWorthIt, true);
});

test('fxStory: gambit not worth it on tiny volume', () => {
  const tiny = [{ marketValue: 1000, currency: 'USD' }];
  const p = FX.buildProfile(tiny, { tradesPerYear: 1 });
  const s = FX.fxStory(p, 'questrade');
  assert.strictEqual(s.gambitSavings, 0);
  assert.strictEqual(s.gambitWorthIt, false);
});
