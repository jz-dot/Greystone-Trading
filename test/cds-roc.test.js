'use strict';

const test = require('node:test');
const assert = require('node:assert');
const CDS = require('../services/cds-roc.js');
const ACB = require('../services/acb.js');

const EXPECTED_SYMBOLS = [
  'XEQT.TO', 'VEQT.TO', 'VFV.TO', 'XIC.TO', 'XIU.TO',
  'ZEB.TO', 'VCN.TO', 'ZAG.TO', 'VDY.TO', 'HXT.TO',
];
const EXPECTED_YEARS = [2023, 2024, 2025];

test('CDS_FACTORS: dataset shape - all symbols, all years, required fields', () => {
  assert.strictEqual(typeof CDS.CDS_FACTORS, 'object');
  for (const sym of EXPECTED_SYMBOLS) {
    assert.ok(CDS.CDS_FACTORS[sym], 'missing symbol ' + sym);
    for (const yr of EXPECTED_YEARS) {
      const r = CDS.CDS_FACTORS[sym][yr];
      assert.ok(r, sym + ' missing year ' + yr);
      assert.strictEqual(typeof r.rocPerUnit, 'number');
      assert.strictEqual(typeof r.reinvestedPerUnit, 'number');
      assert.strictEqual(typeof r.source, 'string');
      assert.strictEqual(typeof r.asOf, 'string');
      assert.ok('verified' in r);
    }
  }
});

test('CDS_FACTORS: magnitudes are realistic (roc <= 0.50, reinvested <= 2.00, non-negative)', () => {
  for (const sym of EXPECTED_SYMBOLS) {
    for (const yr of EXPECTED_YEARS) {
      const r = CDS.CDS_FACTORS[sym][yr];
      assert.ok(r.rocPerUnit >= 0 && r.rocPerUnit <= 0.5, sym + ' ' + yr + ' roc out of range');
      assert.ok(r.reinvestedPerUnit >= 0 && r.reinvestedPerUnit <= 2.0, sym + ' ' + yr + ' reinvested out of range');
    }
  }
});

test('CDS_FACTORS: EVERY record is flagged verified:false (honesty guarantee)', () => {
  let count = 0;
  for (const sym of Object.keys(CDS.CDS_FACTORS)) {
    for (const yr of Object.keys(CDS.CDS_FACTORS[sym])) {
      assert.strictEqual(CDS.CDS_FACTORS[sym][yr].verified, false,
        sym + ' ' + yr + ' must be verified:false');
      count++;
    }
  }
  assert.ok(count >= 30, 'expected >=30 records, got ' + count);
});

test('DATA_DISCLAIMER: exists, non-empty, flags placeholder / verify', () => {
  assert.strictEqual(typeof CDS.DATA_DISCLAIMER, 'string');
  assert.ok(CDS.DATA_DISCLAIMER.length > 0);
  assert.match(CDS.DATA_DISCLAIMER, /PLACEHOLDER/i);
  assert.match(CDS.DATA_DISCLAIMER, /verify/i);
});

test('HXT.TO is a swap-based ~$0-distribution fund: zero factors', () => {
  for (const yr of EXPECTED_YEARS) {
    const r = CDS.getFactors('HXT.TO', yr);
    assert.strictEqual(r.rocPerUnit, 0);
    assert.strictEqual(r.reinvestedPerUnit, 0);
  }
});

test('getFactors: hit returns the record', () => {
  const r = CDS.getFactors('XEQT.TO', 2024);
  assert.ok(r);
  assert.strictEqual(r.rocPerUnit, 0.03);
  assert.strictEqual(r.reinvestedPerUnit, 0.22);
  assert.strictEqual(r.verified, false);
});

test('getFactors: miss returns null (unknown symbol and unknown year)', () => {
  assert.strictEqual(CDS.getFactors('NOPE.TO', 2024), null);
  assert.strictEqual(CDS.getFactors('XEQT.TO', 2019), null);
  assert.strictEqual(CDS.getFactors('', 2024), null);
});

test('getFactors: symbol is case-insensitive', () => {
  const lower = CDS.getFactors('xeqt.to', 2024);
  const upper = CDS.getFactors('XEQT.TO', 2024);
  assert.deepStrictEqual(lower, upper);
  assert.ok(CDS.getFactors('  vfv.TO  '.trim(), 2023)); // trims/normalizes
});

test('getFactors: year accepts string or number', () => {
  assert.deepStrictEqual(CDS.getFactors('XIC.TO', 2023), CDS.getFactors('XIC.TO', '2023'));
});

test('listCoverage: one entry per symbol with ascending years', () => {
  const cov = CDS.listCoverage();
  assert.strictEqual(cov.length, EXPECTED_SYMBOLS.length);
  const syms = cov.map((c) => c.symbol).sort();
  assert.deepStrictEqual(syms, EXPECTED_SYMBOLS.slice().sort());
  for (const c of cov) {
    assert.deepStrictEqual(c.years, EXPECTED_YEARS);
  }
});

test('computeAcbAdjustments: roc math = unitsHeld * rocPerUnit', () => {
  // ZAG.TO 2023: roc 0.15/unit. 200 units -> 30.00
  const a = CDS.computeAcbAdjustments({ symbol: 'ZAG.TO', unitsHeld: 200, year: 2023 });
  assert.strictEqual(a.rocPerUnit, 0.15);
  assert.strictEqual(a.rocAmount, 30);
  assert.strictEqual(a.verified, false);
});

test('computeAcbAdjustments: reinvested math = unitsHeld * reinvestedPerUnit', () => {
  // XIC.TO 2024: reinvested 0.45/unit. 100 units -> 45.00; roc 0.04 -> 4.00
  const a = CDS.computeAcbAdjustments({ symbol: 'XIC.TO', unitsHeld: 100, year: 2024 });
  assert.strictEqual(a.reinvestedAmount, 45);
  assert.strictEqual(a.rocAmount, 4);
});

test('computeAcbAdjustments: override factors respected over dataset', () => {
  const a = CDS.computeAcbAdjustments({
    symbol: 'XEQT.TO', unitsHeld: 100, year: 2024,
    factors: { rocPerUnit: 0.10, reinvestedPerUnit: 1.00 },
  });
  assert.strictEqual(a.rocAmount, 10);
  assert.strictEqual(a.reinvestedAmount, 100);
  assert.strictEqual(a.rocPerUnit, 0.10);
  assert.strictEqual(a.source, 'user-override');
  assert.strictEqual(a.verified, true); // user attests the real figure
});

test('computeAcbAdjustments: override works even for an unknown symbol', () => {
  const a = CDS.computeAcbAdjustments({
    symbol: 'MYSTERY.TO', unitsHeld: 50, year: 2022,
    factors: { rocPerUnit: 0.2, reinvestedPerUnit: 0.4 },
  });
  assert.strictEqual(a.rocAmount, 10);
  assert.strictEqual(a.reinvestedAmount, 20);
});

test('computeAcbAdjustments: zero-factor fund produces zeros (HXT.TO)', () => {
  const a = CDS.computeAcbAdjustments({ symbol: 'HXT.TO', unitsHeld: 1000, year: 2024 });
  assert.strictEqual(a.rocAmount, 0);
  assert.strictEqual(a.reinvestedAmount, 0);
});

test('computeAcbAdjustments: unitsHeld<=0 guard -> zeros with reason', () => {
  const a = CDS.computeAcbAdjustments({ symbol: 'XEQT.TO', unitsHeld: 0, year: 2024 });
  assert.strictEqual(a.rocAmount, 0);
  assert.strictEqual(a.reinvestedAmount, 0);
  assert.ok(a.reason);
  const neg = CDS.computeAcbAdjustments({ symbol: 'XEQT.TO', unitsHeld: -5, year: 2024 });
  assert.strictEqual(neg.rocAmount, 0);
  assert.ok(neg.reason);
});

test('computeAcbAdjustments: unknown symbol/year guard -> zeros with reason', () => {
  const a = CDS.computeAcbAdjustments({ symbol: 'NOPE.TO', unitsHeld: 100, year: 2024 });
  assert.strictEqual(a.rocAmount, 0);
  assert.strictEqual(a.reinvestedAmount, 0);
  assert.strictEqual(a.source, null);
  assert.ok(a.reason);
});

test('buildAdjustmentTxns: emits roc + reinvest legs, Dec-31 date, cds-import source', () => {
  // XIC.TO 2024: roc 4.00, reinvested 45.00 for 100 units.
  const txns = CDS.buildAdjustmentTxns({ symbol: 'XIC.TO', unitsHeld: 100, year: 2024, fxRate: 1, currency: 'CAD' });
  assert.strictEqual(txns.length, 2);
  const roc = txns.find((t) => t.type === 'roc');
  const rei = txns.find((t) => t.type === 'reinvest');
  assert.ok(roc && rei);
  assert.strictEqual(roc.amount, 4);
  assert.strictEqual(rei.amount, 45);
  assert.strictEqual(roc.date, '2024-12-31');
  assert.strictEqual(rei.date, '2024-12-31');
  assert.strictEqual(roc.source, 'cds-import');
  assert.strictEqual(rei.source, 'cds-import');
  assert.strictEqual(roc.fxRate, 1);
});

test('buildAdjustmentTxns: carries fxRate and currency through to the legs', () => {
  const txns = CDS.buildAdjustmentTxns({
    symbol: 'VFV.TO', unitsHeld: 100, year: 2024, fxRate: 1.37, currency: 'USD',
  });
  // VFV.TO 2024: roc 0.01 -> 1.00, reinvested 0.10 -> 10.00
  assert.ok(txns.length >= 1);
  for (const t of txns) {
    assert.strictEqual(t.fxRate, 1.37);
    assert.strictEqual(t.currency, 'USD');
  }
});

test('buildAdjustmentTxns: skips a zero-factor leg (VFV.TO 2023 roc = 0 -> reinvest only)', () => {
  // VFV.TO 2023: roc 0.00 (skip), reinvested 0.12 -> only the reinvest leg.
  const txns = CDS.buildAdjustmentTxns({ symbol: 'VFV.TO', unitsHeld: 100, year: 2023, fxRate: 1 });
  assert.strictEqual(txns.length, 1);
  assert.strictEqual(txns[0].type, 'reinvest');
  assert.ok(Math.abs(txns[0].amount - 12) < 1e-6);
});

test('buildAdjustmentTxns: zero-factor fund (HXT.TO) and guarded input -> []', () => {
  assert.deepStrictEqual(CDS.buildAdjustmentTxns({ symbol: 'HXT.TO', unitsHeld: 500, year: 2024 }), []);
  assert.deepStrictEqual(CDS.buildAdjustmentTxns({ symbol: 'XEQT.TO', unitsHeld: 0, year: 2024 }), []);
  assert.deepStrictEqual(CDS.buildAdjustmentTxns({ symbol: 'NOPE.TO', unitsHeld: 100, year: 2024 }), []);
});

test('END-TO-END: buy + generated adjustments move ACB by (reinvested - roc)', () => {
  // Hold 100 units of XIC.TO bought during 2024, then apply CDS adjustments.
  // XIC.TO 2024: roc 0.04/unit -> 4.00 (lowers ACB), reinvested 0.45/unit -> 45.00 (raises ACB).
  const buy = { type: 'buy', date: '2024-01-15', shares: 100, price: 30, commission: 0, fxRate: 1 };
  const baseline = ACB.computeACB([buy]).summary;
  assert.strictEqual(baseline.currentBookValue, 3000);

  const adjTxns = CDS.buildAdjustmentTxns({ symbol: 'XIC.TO', unitsHeld: 100, year: 2024, fxRate: 1 });
  const withAdj = ACB.computeACB([buy].concat(adjTxns)).summary;

  const expectedNet = 45 - 4; // reinvested minus roc
  assert.ok(Math.abs(withAdj.currentBookValue - (3000 + expectedNet)) < 1e-6,
    'ACB should move by reinvested - roc; got ' + withAdj.currentBookValue);
  // Adjustments never change the unit count.
  assert.strictEqual(withAdj.currentShares, 100);
  // No spurious realized gain (roc well under ACB).
  assert.strictEqual(withAdj.totalRealizedGain, 0);
});

test('buildAdjustmentTxns emits reinvest before roc (avoids spurious ROC-excess gain)', () => {
  const txns = CDS.buildAdjustmentTxns({
    symbol: 'XIC.TO', unitsHeld: 100, year: 2024,
    factors: { rocPerUnit: 0.40, reinvestedPerUnit: 4.50 }, fxRate: 1, currency: 'CAD'
  });
  assert.deepStrictEqual(txns.map(t => t.type), ['reinvest', 'roc']);
});
