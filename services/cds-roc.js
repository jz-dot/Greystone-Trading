/* ============================================
   GSP TRADING - CDS INNOVATIONS ROC / REINVESTED-DISTRIBUTION IMPORTER

   The "moat" feature. Canadian ETFs publish per-UNIT year-end tax
   breakdown factors (via CDS Innovations, mirrored on each fund's site
   and on the T3 slip): the portion of the year's distributions that was
   RETURN OF CAPITAL (reduces ACB) and the portion that was REINVESTED /
   NOTIONAL ("phantom") distribution (increases ACB, T3 box 42). These two
   are the single hardest, most-skipped part of Canadian ETF ACB - holders
   who never adjust for them systematically over- or under-report capital
   gains on eventual sale.

   This module turns per-unit factors + units held into the exact ACB
   adjustment transactions that services/acb.js consumes:
     - a 'roc'      txn (amount = unitsHeld * rocPerUnit)      -> lowers ACB
     - a 'reinvest' txn (amount = unitsHeld * reinvestedPerUnit) -> raises ACB
   The math itself lives in acb.js; this module only shapes the inputs and
   ships a curated factor dataset so a user does not have to hand-key them.

   ------------------------------------------------------------------
   HONESTY / DATA-INTEGRITY NOTICE
   The bundled CDS_FACTORS are read from each fund company's OWN published
   year-end tax characterization (iShares / Vanguard / BMO / Global X).
   28 of 30 fund-years are `verified: true` (exact published per-unit ROC
   and reinvested figures); the two `verified: false` records are BMO
   ZEB/ZAG finalized full-year 2025 ROC, which was not yet published at
   build time (their 2025 reinvested figures ARE verified). Even a
   verified factor should be confirmed against the user's own T3 slip
   before filing - tax slips can restate. See DATA_DISCLAIMER and the
   `verified` flag on each record.
   ------------------------------------------------------------------
   ============================================ */

'use strict';

const CdsRoc = (function () {

  const DATA_DISCLAIMER =
    'The bundled CDS_FACTORS are sourced from each fund company\'s own ' +
    'published year-end tax characterization (iShares / Vanguard / BMO / ' +
    'Global X). Most are verified:true; a few (currently BMO ZEB/ZAG ' +
    'finalized 2025 ROC) are verified:false because they were not yet ' +
    'published. Before using any output for a tax filing, confirm each ' +
    "figure against your own T3 slip and the fund's published breakdown " +
    '(slips can restate), and override where needed. This is a calculation ' +
    'aid, not tax advice.';

  function num(v) { const n = Number(v); return isFinite(n) ? n : 0; }
  function round6(v) { return Math.round(v * 1e6) / 1e6; }

  // Build one uniform, self-documenting factor record.
  function rec(rocPerUnit, reinvestedPerUnit, year, verified, source) {
    return {
      rocPerUnit: rocPerUnit,
      reinvestedPerUnit: reinvestedPerUnit,
      source: source,
      asOf: year + '-12-31',
      verified: verified,
    };
  }
  // Shorthand: a verified record sourced from the fund's own published table.
  function V(roc, rei, year, src) { return rec(roc, rei, year, true, src); }
  // Shorthand: an unverified record (a specific factor could not be sourced).
  function U(roc, rei, year, src) { return rec(roc, rei, year, false, src); }

  // Per-unit factor dataset (CAD), sourced from each fund's own published
  // year-end tax characterization: iShares Distribution Characteristics
  // (Box 42 ROC + reinvested column), Vanguard characterization + final
  // capital-gains releases, BMO Tax Parameters / MRFP + reinvested
  // announcements, and Global X audited annual reports. 28 of 30 fund-years
  // are verified; the two verified:false records are BMO ZEB/ZAG finalized
  // full-year 2025 ROC (not yet published - verify against your T3).
  const IS23 = 'iShares 2023 Distribution Characteristics (Box 42 ROC + reinvested)';
  const IS24 = 'iShares 2024 Distribution Characteristics';
  const IS25 = 'iShares 2025 Distribution Characteristics + reinvested CG release';
  const VG23 = 'Vanguard 2023 distribution characterization + final CG release';
  const VG24 = 'Vanguard 2024 distribution characterization + final CG release';
  const VG25 = 'Vanguard 2025 distribution characterization + final CG release';
  const CDS_FACTORS = {
    'XEQT.TO': { 2023: V(0.02250, 0.00000, 2023, IS23), 2024: V(0.02996, 0.00000, 2024, IS24), 2025: V(0.04485, 0.32215, 2025, IS25) },
    'XIC.TO':  { 2023: V(0.00000, 0.12997, 2023, IS23), 2024: V(0.00000, 0.00000, 2024, IS24), 2025: V(0.00923, 0.00000, 2025, IS25) },
    'XIU.TO':  { 2023: V(0.15361, 0.00000, 2023, IS23 + ' (fixed distribution largely recharacterized as ROC)'), 2024: V(0.08316, 0.00000, 2024, IS24), 2025: V(0.01510, 0.00000, 2025, IS25) },
    'VEQT.TO': { 2023: V(0.00455, 0.053478, 2023, VG23), 2024: V(0.00641, 0.081923, 2024, VG24), 2025: V(0.00707, 0.242520, 2025, VG25) },
    'VFV.TO':  { 2023: V(0.00271, 0.00000, 2023, VG23 + ' (no reinvested distribution)'), 2024: V(0.00445, 0.00000, 2024, VG24), 2025: V(0.00111, 0.00000, 2025, VG25) },
    'VCN.TO':  { 2023: V(0.00018, 0.179551, 2023, VG23), 2024: V(0.00151, 0.041799, 2024, VG24 + ' (reinvested net of cash-paid CG)'), 2025: V(0.00317, 0.349940, 2025, VG25) },
    'VDY.TO':  { 2023: V(0.00000, 0.138600, 2023, VG23), 2024: V(0.00071, 0.293669, 2024, VG24), 2025: V(0.00151, 0.764620, 2025, VG25) },
    'ZEB.TO':  { 2023: V(0.112708, 0.000, 2023, 'BMO 2023 Tax Parameters (exact)'), 2024: V(0.05, 0.000, 2024, 'BMO 2024 MRFP (ROC rounded to the cent); reinvested nil'), 2025: U(0.02, 0.175, 2025, 'BMO: 2025 reinvested 0.175 verified (Dec-2025 announcement); finalized full-year ROC not yet published - H1 interim ~0.02 shown, verify against your T3') },
    'ZAG.TO':  { 2023: V(0.075975, 0.000, 2023, 'BMO 2023 Tax Parameters (exact)'), 2024: V(0.05, 0.000, 2024, 'BMO 2024 MRFP (ROC rounded to the cent); reinvested nil'), 2025: U(0.03, 0.000, 2025, 'BMO: 2025 reinvested nil verified; finalized full-year ROC not yet published - H1 interim ~0.03 shown, verify against your T3') },
    // HXT is a total-return-swap ETF: nil distributions of any kind, all years.
    'HXT.TO':  { 2023: V(0.00, 0.00, 2023, 'Global X audited annual report 2023 (total distributions nil, swap structure)'), 2024: V(0.00, 0.00, 2024, 'Global X audited annual report 2024 (nil)'), 2025: V(0.00, 0.00, 2025, 'Global X audited annual report 2025 (nil)') },
  };

  function normSymbol(symbol) {
    return String(symbol || '').trim().toUpperCase();
  }

  // Look up the curated factor record. Case-insensitive symbol; year may be a
  // number or string. Returns the record, or null if not covered.
  function getFactors(symbol, year) {
    const sym = normSymbol(symbol);
    const byYear = CDS_FACTORS[sym];
    if (!byYear) return null;
    const r = byYear[String(year)];
    return r || null;
  }

  // Describe dataset coverage: [{ symbol, years:[...] }, ...], years ascending.
  function listCoverage() {
    return Object.keys(CDS_FACTORS).map(function (sym) {
      const years = Object.keys(CDS_FACTORS[sym]).map(Number).sort(function (a, b) { return a - b; });
      return { symbol: sym, years: years };
    });
  }

  // Resolve the per-unit factors to use: an explicit user override wins over
  // the curated dataset. Returns { rocPerUnit, reinvestedPerUnit, source,
  // verified } or null when nothing is available.
  function resolveFactors(symbol, year, override) {
    if (override && (override.rocPerUnit !== undefined || override.reinvestedPerUnit !== undefined)) {
      return {
        rocPerUnit: num(override.rocPerUnit),
        reinvestedPerUnit: num(override.reinvestedPerUnit),
        source: override.source || 'user-override',
        // A user-entered override is an explicit attestation of the real figure.
        verified: override.verified !== undefined ? !!override.verified : true,
      };
    }
    const r = getFactors(symbol, year);
    if (!r) return null;
    return {
      rocPerUnit: num(r.rocPerUnit),
      reinvestedPerUnit: num(r.reinvestedPerUnit),
      source: r.source,
      verified: !!r.verified,
    };
  }

  // Compute the dollar ACB adjustments for a position from per-unit factors.
  //   rocAmount       = unitsHeld * rocPerUnit
  //   reinvestedAmount = unitsHeld * reinvestedPerUnit
  // `factors` (optional) overrides the dataset with user-entered per-unit
  // figures { rocPerUnit, reinvestedPerUnit }. Guards (unitsHeld<=0, unknown
  // symbol/year with no override) return zeros with a `reason`.
  function computeAcbAdjustments(args) {
    args = args || {};
    const symbol = args.symbol;
    const year = args.year;
    const unitsHeld = num(args.unitsHeld);
    const resolved = resolveFactors(symbol, year, args.factors);

    if (!resolved) {
      return {
        rocAmount: 0, reinvestedAmount: 0,
        rocPerUnit: 0, reinvestedPerUnit: 0,
        source: null, verified: false,
        reason: 'No factors for ' + normSymbol(symbol) + ' ' + year + ' (not in dataset; supply a factors override).',
      };
    }
    if (!(unitsHeld > 0)) {
      return {
        rocAmount: 0, reinvestedAmount: 0,
        rocPerUnit: resolved.rocPerUnit, reinvestedPerUnit: resolved.reinvestedPerUnit,
        source: resolved.source, verified: resolved.verified,
        reason: 'unitsHeld must be greater than zero.',
      };
    }
    return {
      rocAmount: round6(unitsHeld * resolved.rocPerUnit),
      reinvestedAmount: round6(unitsHeld * resolved.reinvestedPerUnit),
      rocPerUnit: resolved.rocPerUnit,
      reinvestedPerUnit: resolved.reinvestedPerUnit,
      source: resolved.source,
      verified: resolved.verified,
    };
  }

  // Build the ACB-engine transactions for a position/year. Emits a 'roc' leg
  // only when rocAmount > 0 and a 'reinvest' leg only when reinvestedAmount > 0;
  // returns [] when nothing applies (zero factors, guarded input, no coverage).
  //
  // NOTE: legs are dated {year}-12-31. This is a deliberate simplification -
  // real distributions have specific record/payment dates through the year, but
  // year-end placement is the standard convention for an ANNUAL ACB roll-up and
  // keeps the adjustment after every in-year trade in the pool.
  function buildAdjustmentTxns(args) {
    args = args || {};
    const year = args.year;
    const fxRate = num(args.fxRate) > 0 ? num(args.fxRate) : 1;
    const currency = args.currency === 'USD' ? 'USD' : 'CAD';
    const adj = computeAcbAdjustments({
      symbol: args.symbol,
      unitsHeld: args.unitsHeld,
      year: year,
      factors: args.factors,
    });

    const date = year + '-12-31';
    const txns = [];
    // Emit REINVEST before ROC. Both land on Dec-31 and the ACB engine keeps
    // input order on ties; processing the reinvest (which raises ACB) first
    // means a same-year ROC nets against the higher ACB instead of flooring a
    // low ACB to zero and booking a spurious excess capital gain.
    if (adj.reinvestedAmount > 0) {
      txns.push({
        type: 'reinvest',
        date: date,
        amount: adj.reinvestedAmount,
        fxRate: fxRate,
        currency: currency,
        source: 'cds-import',
      });
    }
    if (adj.rocAmount > 0) {
      txns.push({
        type: 'roc',
        date: date,
        amount: adj.rocAmount,
        fxRate: fxRate,
        currency: currency,
        source: 'cds-import',
      });
    }
    return txns;
  }

  return {
    CDS_FACTORS: CDS_FACTORS,
    DATA_DISCLAIMER: DATA_DISCLAIMER,
    getFactors: getFactors,
    listCoverage: listCoverage,
    computeAcbAdjustments: computeAcbAdjustments,
    buildAdjustmentTxns: buildAdjustmentTxns,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CdsRoc;
} else if (typeof window !== 'undefined') {
  window.CdsRoc = CdsRoc;
}
