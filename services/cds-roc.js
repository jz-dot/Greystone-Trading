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
   The bundled CDS_FACTORS are ILLUSTRATIVE PLACEHOLDERS of realistic
   magnitude, NOT the authoritative published CRA / CDS Innovations
   figures. Every record is flagged `verified: false`. Users MUST verify
   or override each factor against the fund's actual published tax
   breakdown before relying on the output for a tax filing. See
   DATA_DISCLAIMER below and the `verified` flag on every record.
   ------------------------------------------------------------------
   ============================================ */

'use strict';

const CdsRoc = (function () {

  // Illustrative-only. Never present these as CRA/CDS authoritative numbers.
  const DATA_DISCLAIMER =
    'The bundled CDS_FACTORS are ILLUSTRATIVE PLACEHOLDER values of realistic ' +
    'magnitude, not the authoritative CDS Innovations / CRA published per-unit ' +
    'tax-breakdown factors. Every record is flagged verified:false. Before ' +
    'using any output for a tax filing you MUST verify each figure against the ' +
    "fund's own published year-end tax breakdown (CDS Innovations / the fund " +
    'website / your T3) and override it with the real published number. This ' +
    'is a calculation aid, not tax advice.';

  function num(v) { const n = Number(v); return isFinite(n) ? n : 0; }
  function round6(v) { return Math.round(v * 1e6) / 1e6; }

  // Build one uniform, self-documenting factor record.
  function rec(rocPerUnit, reinvestedPerUnit, year) {
    return {
      rocPerUnit: rocPerUnit,
      reinvestedPerUnit: reinvestedPerUnit,
      source: 'PLACEHOLDER - verify against the fund\'s CDS Innovations tax breakdown for ' + year,
      asOf: year + '-12-31',
      verified: false,
    };
  }

  // Curated per-unit factor dataset. Symbol -> year -> record.
  // Magnitudes only: ROC ~$0.00-$0.50/unit, reinvested/notional ~$0.00-$2.00/unit
  // for equity ETFs; swap-based total-return funds (HXT) pay ~$0 distributions.
  // ALL verified:false - see DATA_DISCLAIMER.
  const CDS_FACTORS = {
    'XEQT.TO': { 2023: rec(0.02, 0.18, 2023), 2024: rec(0.03, 0.22, 2024), 2025: rec(0.00, 0.15, 2025) },
    'VEQT.TO': { 2023: rec(0.01, 0.30, 2023), 2024: rec(0.02, 0.28, 2024), 2025: rec(0.00, 0.25, 2025) },
    'VFV.TO':  { 2023: rec(0.00, 0.12, 2023), 2024: rec(0.01, 0.10, 2024), 2025: rec(0.00, 0.08, 2025) },
    'XIC.TO':  { 2023: rec(0.05, 0.40, 2023), 2024: rec(0.04, 0.45, 2024), 2025: rec(0.03, 0.38, 2025) },
    'XIU.TO':  { 2023: rec(0.02, 0.30, 2023), 2024: rec(0.03, 0.35, 2024), 2025: rec(0.01, 0.28, 2025) },
    'ZEB.TO':  { 2023: rec(0.08, 0.20, 2023), 2024: rec(0.10, 0.15, 2024), 2025: rec(0.06, 0.18, 2025) },
    'VCN.TO':  { 2023: rec(0.03, 0.35, 2023), 2024: rec(0.02, 0.40, 2024), 2025: rec(0.01, 0.30, 2025) },
    'ZAG.TO':  { 2023: rec(0.15, 0.05, 2023), 2024: rec(0.12, 0.04, 2024), 2025: rec(0.10, 0.03, 2025) },
    'VDY.TO':  { 2023: rec(0.06, 0.25, 2023), 2024: rec(0.05, 0.28, 2024), 2025: rec(0.04, 0.22, 2025) },
    // HXT uses a total-return swap and pays ~$0 distributions: zero factors.
    'HXT.TO':  { 2023: rec(0.00, 0.00, 2023), 2024: rec(0.00, 0.00, 2024), 2025: rec(0.00, 0.00, 2025) },
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
