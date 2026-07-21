'use strict';

const test = require('node:test');
const assert = require('node:assert');
const TP = require('../services/tax-pack.js');

/* ---- fixtures ---- */

function pos(symbol, account, txns, extra) {
  return Object.assign({ symbol: symbol, account: account, currency: 'CAD', txns: txns }, extra || {});
}
const BUY = (date, shares, price, opts) => Object.assign({ type: 'buy', date, shares, price, commission: 0, fxRate: 1 }, opts || {});
const SELL = (date, shares, price, opts) => Object.assign({ type: 'sell', date, shares, price, commission: 0, fxRate: 1 }, opts || {});

// A sample portfolio: one registered (excluded), two non-registered symbols,
// plus one broker-imported lot (approx) and one prior-year disposition.
function samplePositions() {
  return [
    pos('AAA.TO', 'TFSA', [BUY('2026-01-05', 10, 10), SELL('2026-02-05', 10, 15)]),         // registered -> excluded
    pos('BBB.TO', 'non-registered', [BUY('2026-01-05', 10, 10), SELL('2026-03-01', 10, 18)]), // gain 80
    pos('CCC.TO', 'non-registered', [BUY('2026-02-01', 100, 20, { source: 'broker-import' }), SELL('2026-06-01', 50, 25)]), // approx
    pos('DDD.TO', 'non-registered', [BUY('2025-01-05', 20, 10), SELL('2025-06-01', 20, 12)]), // 2025 only
  ];
}

function sampleIncome() {
  return [
    { symbol: 'BBB.TO', account: 'non-registered', currency: 'CAD', kind: 'dividend', date: '2026-04-24', amount: 30, fxRate: 1, amountCad: 30 },
    { symbol: 'BBB.TO', account: 'non-registered', currency: 'CAD', kind: 'dividend', date: '2026-10-24', amount: 20, fxRate: 1, amountCad: 20 },
    { symbol: 'CCC.TO', account: 'non-registered', currency: 'CAD', kind: 'distribution', date: '2026-07-15', amount: 12.5, fxRate: 1, amountCad: 12.5 },
    { symbol: 'BBB.TO', account: 'non-registered', currency: 'CAD', kind: 'dividend', date: '2025-04-24', amount: 99, fxRate: 1, amountCad: 99 }, // other year
  ];
}

function sampleHoldings() {
  return [
    { symbol: 'BBB.TO', currency: 'CAD', marketValue: 60000 },
    { symbol: 'AAPL', currency: 'USD', marketValue: 40000 },
  ];
}

/* ---- buildTaxPack: data model ---- */

test('buildTaxPack: Schedule 3 pools non-registered and excludes registered', () => {
  const pack = TP.buildTaxPack({ positions: samplePositions(), income: sampleIncome(), year: 2026 });
  const syms = pack.schedule3.rows.map(r => r.symbol);
  assert.ok(!syms.includes('AAA.TO'), 'registered TFSA disposition excluded');
  assert.ok(syms.includes('BBB.TO') && syms.includes('CCC.TO'), 'non-registered dispositions present');
  assert.ok(!syms.includes('DDD.TO'), '2025 disposition excluded by year filter');
  // summary reflects the year's rows
  assert.strictEqual(pack.schedule3.summary.rowCount, pack.schedule3.rows.length);
  assert.ok(pack.schedule3.summary.totalGainCad > 0);
});

test('buildTaxPack: BBB.TO gain is correct (proceeds net, pooled ACB)', () => {
  const pack = TP.buildTaxPack({ positions: samplePositions(), year: 2026 });
  const bbb = pack.schedule3.rows.find(r => r.symbol === 'BBB.TO');
  assert.strictEqual(bbb.gainCad, 80); // 10 @ 18 - 10 @ 10
});

test('buildTaxPack: income grouped by symbol and totaled for the year', () => {
  const pack = TP.buildTaxPack({ positions: samplePositions(), income: sampleIncome(), year: 2026 });
  const inc = pack.incomeSummary;
  assert.strictEqual(inc.year, '2026');
  const bbb = inc.bySymbol.find(r => r.symbol === 'BBB.TO');
  const ccc = inc.bySymbol.find(r => r.symbol === 'CCC.TO');
  assert.strictEqual(bbb.cad, 50, 'BBB.TO two dividends summed (30 + 20)');
  assert.strictEqual(ccc.cad, 12.5);
  assert.strictEqual(inc.grandTotalCad, 62.5, 'grand total excludes 2025 entry');
});

test('buildTaxPack: year filter isolates the right year for income', () => {
  const pack2025 = TP.buildTaxPack({ positions: samplePositions(), income: sampleIncome(), year: 2025 });
  assert.strictEqual(pack2025.incomeSummary.grandTotalCad, 99);
  assert.strictEqual(pack2025.incomeSummary.bySymbol.length, 1);
});

test('buildTaxPack: reconciliation rows exist with blank t5008BookValue and variance', () => {
  const pack = TP.buildTaxPack({ positions: samplePositions(), year: 2026 });
  assert.ok(pack.reconciliation.length >= 2);
  const bbb = pack.reconciliation.find(r => r.symbol === 'BBB.TO');
  assert.strictEqual(bbb.t5008BookValue, null, 'book value left blank for filer');
  assert.strictEqual(bbb.variance, null);
  assert.strictEqual(bbb.trackerGainCad, 80);
  assert.ok(typeof bbb.trackerProceedsCad === 'number' && typeof bbb.trackerAcbCad === 'number');
  assert.ok(/T5008/.test(bbb.note));
});

test('buildTaxPack: approxWarnings populated from a broker-import lot', () => {
  const pack = TP.buildTaxPack({ positions: samplePositions(), year: 2026 });
  assert.deepStrictEqual(pack.approxWarnings, ['CCC.TO']);
  const ccc = pack.schedule3.rows.find(r => r.symbol === 'CCC.TO');
  assert.strictEqual(ccc.approx, true);
});

test('buildTaxPack: meta.generatedAt is null (module never stamps a date)', () => {
  const pack = TP.buildTaxPack({ positions: samplePositions(), year: 2026 });
  assert.strictEqual(pack.meta.generatedAt, null);
  assert.strictEqual(pack.meta.year, '2026');
  assert.ok(Array.isArray(pack.meta.caveats) && pack.meta.caveats.length >= 4);
  assert.ok(/not tax advice/i.test(pack.meta.disclaimer));
});

test('buildTaxPack: trueCost present only when holdings + feeInputs given', () => {
  const withCost = TP.buildTaxPack({
    positions: samplePositions(), year: 2026,
    holdings: sampleHoldings(), feeInputs: { tradesPerYear: 40 }, currentBrokerId: 'td',
  });
  assert.ok(withCost.trueCost && typeof withCost.trueCost === 'object');
  assert.strictEqual(withCost.trueCost.currentBrokerId, 'td');
  assert.ok(withCost.trueCost.currentBrokerCost > 0);
  assert.ok(withCost.trueCost.cheapestBrokerCost >= 0);
  assert.ok(typeof withCost.trueCost.cheapestBrokerName === 'string');
  assert.ok(withCost.trueCost.fxDrag > 0, 'USD holdings produce FX drag at TD');

  const noCost = TP.buildTaxPack({ positions: samplePositions(), year: 2026 });
  assert.strictEqual(noCost.trueCost, null, 'omitted when inputs absent');
});

test('buildTaxPack: annualOverpayment equals current minus cheapest', () => {
  const pack = TP.buildTaxPack({
    positions: samplePositions(), year: 2026,
    holdings: sampleHoldings(), feeInputs: { tradesPerYear: 40 }, currentBrokerId: 'td',
  });
  const tc = pack.trueCost;
  assert.strictEqual(tc.annualOverpayment, Math.round((tc.currentBrokerCost - tc.cheapestBrokerCost) * 100) / 100);
  assert.ok(tc.annualOverpayment >= 0);
});

test('buildTaxPack: empty portfolio produces a valid, empty pack (no throw)', () => {
  const pack = TP.buildTaxPack({});
  assert.deepStrictEqual(pack.schedule3.rows, []);
  assert.strictEqual(pack.schedule3.summary.rowCount, 0);
  assert.deepStrictEqual(pack.incomeSummary.bySymbol, []);
  assert.strictEqual(pack.incomeSummary.grandTotalCad, 0);
  assert.deepStrictEqual(pack.reconciliation, []);
  assert.deepStrictEqual(pack.approxWarnings, []);
  assert.strictEqual(pack.trueCost, null);
});

/* ---- renderTaxPackHtml ---- */

test('renderTaxPackHtml: returns a string containing the year in the title', () => {
  const pack = TP.buildTaxPack({ positions: samplePositions(), income: sampleIncome(), year: 2026 });
  const html = TP.renderTaxPackHtml(pack);
  assert.strictEqual(typeof html, 'string');
  assert.match(html, /2026 Investment Tax Summary/);
  // fragment, not a full document
  assert.ok(!/<html/i.test(html) && !/<body/i.test(html), 'is a fragment, no html/body');
  assert.match(html, /^<div class="gsp-taxpack">/);
});

test('renderTaxPackHtml: contains the not-tax-advice disclaimer text', () => {
  const html = TP.renderTaxPackHtml(TP.buildTaxPack({ positions: samplePositions(), year: 2026 }));
  assert.match(html, /Not tax advice/);
  assert.match(html, /not a T-slip/i);
});

test('renderTaxPackHtml: contains every section heading', () => {
  const pack = TP.buildTaxPack({
    positions: samplePositions(), income: sampleIncome(), year: 2026,
    holdings: sampleHoldings(), feeInputs: { tradesPerYear: 40 }, currentBrokerId: 'td',
  });
  const html = TP.renderTaxPackHtml(pack);
  assert.match(html, /Capital Dispositions \(Schedule 3\)/);
  assert.match(html, /Investment Income/);
  assert.match(html, /T5008 Reconciliation/);
  assert.match(html, /True Cost of Your Trading/);      // present because trueCost was built
  assert.match(html, /Approximate cost basis - verify before filing/);
  assert.match(html, /What this does not know/);
});

test('renderTaxPackHtml: True Cost section omitted when trueCost is null', () => {
  const html = TP.renderTaxPackHtml(TP.buildTaxPack({ positions: samplePositions(), year: 2026 }));
  assert.ok(!/True Cost of Your Trading/.test(html));
});

test('renderTaxPackHtml: lists caveats and the approx warnings', () => {
  const html = TP.renderTaxPackHtml(TP.buildTaxPack({ positions: samplePositions(), year: 2026 }));
  assert.match(html, /affiliated persons/);
  assert.match(html, /Registered accounts/);
  assert.match(html, /CDS/);
  // approx symbol surfaced as a chip
  assert.match(html, /CCC\.TO/);
});

test('renderTaxPackHtml: the reconciliation blank column is visibly rendered', () => {
  const html = TP.renderTaxPackHtml(TP.buildTaxPack({ positions: samplePositions(), year: 2026 }));
  assert.match(html, /Broker T5008 book value \(enter\)/);
  assert.match(html, /class="blank"/);
});

test('renderTaxPackHtml: makes no fabricated authority claim', () => {
  const html = TP.renderTaxPackHtml(TP.buildTaxPack({ positions: samplePositions(), year: 2026 }));
  assert.ok(!/certified by (the )?(cra|canada revenue agency)/i.test(html));
  assert.ok(!/issued by (the )?(cra|canada revenue agency)/i.test(html));
  assert.ok(!/official t5008/i.test(html));
  assert.ok(!/this is your (official )?t-?slip/i.test(html));
});

test('renderTaxPackHtml: HTML-escapes a symbol containing & and <', () => {
  const positions = [pos('A&B<CO', 'non-registered', [BUY('2026-01-05', 10, 10), SELL('2026-02-05', 10, 15)])];
  const income = [{ symbol: 'A&B<CO', account: 'non-registered', currency: 'CAD', kind: 'dividend', date: '2026-05-01', amount: 5, fxRate: 1, amountCad: 5 }];
  const html = TP.renderTaxPackHtml(TP.buildTaxPack({ positions, income, year: 2026 }));
  assert.match(html, /A&amp;B&lt;CO/);
  assert.ok(!/A&B<CO/.test(html), 'raw unescaped symbol must not appear');
});

test('renderTaxPackHtml: empty pack still renders all core headings without throwing', () => {
  const html = TP.renderTaxPackHtml(TP.buildTaxPack({ year: 2027 }));
  assert.match(html, /2027 Investment Tax Summary/);
  assert.match(html, /Capital Dispositions \(Schedule 3\)/);
  assert.match(html, /No taxable dispositions recorded/);
  assert.match(html, /Approximate cost basis - verify before filing/);
  assert.match(html, /None\. Every disposition above rests on entered trade history\./);
});
