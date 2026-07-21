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

test('CDS_FACTORS: sourced records are verified; the BMO 2025 ROC gaps are not', () => {
  // Verified from the funds' own published tables.
  assert.strictEqual(CDS.CDS_FACTORS['XEQT.TO']['2024'].verified, true);
  assert.strictEqual(CDS.CDS_FACTORS['VEQT.TO']['2023'].verified, true);
  assert.strictEqual(CDS.CDS_FACTORS['XIU.TO']['2023'].verified, true);
  assert.strictEqual(CDS.CDS_FACTORS['HXT.TO']['2023'].verified, true);
  // Finalized full-year 2025 ROC not yet published for these two.
  assert.strictEqual(CDS.CDS_FACTORS['ZEB.TO']['2025'].verified, false);
  assert.strictEqual(CDS.CDS_FACTORS['ZAG.TO']['2025'].verified, false);
  let count = 0;
  for (const sym of Object.keys(CDS.CDS_FACTORS))
    for (const yr of Object.keys(CDS.CDS_FACTORS[sym])) count++;
  assert.strictEqual(count, 30);
});

test('DATA_DISCLAIMER: exists, non-empty, tells the user to confirm against their T3', () => {
  assert.strictEqual(typeof CDS.DATA_DISCLAIMER, 'string');
  assert.ok(CDS.DATA_DISCLAIMER.length > 0);
  assert.match(CDS.DATA_DISCLAIMER, /T3|confirm|verify/i);
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
  assert.strictEqual(r.rocPerUnit, 0.02996);
  assert.strictEqual(r.reinvestedPerUnit, 0.00000);
  assert.strictEqual(r.verified, true);
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
  // ZAG.TO 2023: roc 0.075975/unit. 200 units -> 15.195
  const a = CDS.computeAcbAdjustments({ symbol: 'ZAG.TO', unitsHeld: 200, year: 2023 });
  assert.strictEqual(a.rocPerUnit, 0.075975);
  assert.ok(Math.abs(a.rocAmount - 15.195) < 1e-6);
  assert.strictEqual(a.verified, true);
});

test('computeAcbAdjustments: reinvested math = unitsHeld * reinvestedPerUnit', () => {
  // XEQT.TO 2025: reinvested 0.32215/unit -> 100 units 32.215; roc 0.04485 -> 4.485
  const a = CDS.computeAcbAdjustments({ symbol: 'XEQT.TO', unitsHeld: 100, year: 2025 });
  assert.ok(Math.abs(a.reinvestedAmount - 32.215) < 1e-6);
  assert.ok(Math.abs(a.rocAmount - 4.485) < 1e-6);
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
  // Override factors keep this a test of the leg-shaping logic, not the data.
  const txns = CDS.buildAdjustmentTxns({ symbol: 'ANY.TO', unitsHeld: 100, year: 2024, factors: { rocPerUnit: 0.04, reinvestedPerUnit: 0.45 }, fxRate: 1, currency: 'CAD' });
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
    symbol: 'ANY.TO', unitsHeld: 100, year: 2024, factors: { rocPerUnit: 0.01, reinvestedPerUnit: 0.10 }, fxRate: 1.37, currency: 'USD',
  });
  assert.ok(txns.length >= 1);
  for (const t of txns) {
    assert.strictEqual(t.fxRate, 1.37);
    assert.strictEqual(t.currency, 'USD');
  }
});

test('buildAdjustmentTxns: skips a zero-factor leg (roc 0 -> reinvest only)', () => {
  const txns = CDS.buildAdjustmentTxns({ symbol: 'ANY.TO', unitsHeld: 100, year: 2023, factors: { rocPerUnit: 0, reinvestedPerUnit: 0.12 }, fxRate: 1 });
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
  // Hold 100 units bought during 2024, then apply CDS adjustments (override
  // factors: roc 0.04/unit -> 4.00 lowers ACB, reinvested 0.45/unit -> 45.00 raises it).
  const buy = { type: 'buy', date: '2024-01-15', shares: 100, price: 30, commission: 0, fxRate: 1 };
  const baseline = ACB.computeACB([buy]).summary;
  assert.strictEqual(baseline.currentBookValue, 3000);

  const adjTxns = CDS.buildAdjustmentTxns({ symbol: 'ANY.TO', unitsHeld: 100, year: 2024, factors: { rocPerUnit: 0.04, reinvestedPerUnit: 0.45 }, fxRate: 1 });
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
