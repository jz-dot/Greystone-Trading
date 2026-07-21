/* ============================================
   GSP TRADING - CORPORATE ACTIONS & INCOME (pure logic)

   The transforms behind dividends, DRIP reinvestments, return of
   capital, and stock splits. ACB math itself lives in services/acb.js
   (which understands buy/sell/roc); this module builds well-formed
   transactions for it and applies the one action acb.js does not model
   directly: splits.

   SPLIT SEMANTICS: a split multiplies shares and divides per-share price
   for every transaction dated STRICTLY BEFORE the split's effective date
   (post-split trades are already in new units). Total ACB is invariant
   by construction. Reverse splits are ratios below 1 (1-for-4 = 0.25).

   ROC SEMANTICS (T3 box 42): reduces ACB dollar-for-dollar; any excess
   over remaining ACB is an immediate capital gain - acb.js implements
   that, we only shape the transaction.
   ============================================ */

'use strict';

const CorporateActions = (function () {

  function num(v) { const n = Number(v); return isFinite(n) ? n : 0; }
  function round6(v) { return Math.round(v * 1e6) / 1e6; }
  function isISO(d) { return /^\d{4}-\d{2}-\d{2}$/.test(String(d || '')); }

  // Apply a split to a transaction list. Returns { txns, affected } with a
  // NEW array (originals untouched); roc txns pass through (dollar amounts
  // are unit-independent).
  function applySplit(txns, effectiveDate, ratio) {
    ratio = num(ratio);
    if (!(ratio > 0)) throw new Error('Split ratio must be a positive number (2 = 2-for-1, 0.25 = 1-for-4).');
    if (ratio === 1) throw new Error('A 1-for-1 split changes nothing.');
    if (!isISO(effectiveDate)) throw new Error('Split effective date must be YYYY-MM-DD.');
    let affected = 0;
    const out = (Array.isArray(txns) ? txns : []).map(function (t) {
      if (!t || t.type === 'roc' || !(t.date < effectiveDate)) return t;
      affected++;
      const copy = Object.assign({}, t);
      copy.shares = round6(num(t.shares) * ratio);
      copy.price = round6(num(t.price) / ratio);
      copy.splitAdjusted = true;
      return copy;
    });
    return { txns: out, affected: affected };
  }

  // A DRIP reinvestment is a zero-commission buy at the reinvestment price.
  function dripTxn(args) {
    args = args || {};
    const shares = num(args.shares);
    const amount = num(args.amount);
    if (!(shares > 0)) throw new Error('DRIP shares received must be positive.');
    if (!(amount > 0)) throw new Error('DRIP distribution amount must be positive.');
    if (!isISO(args.date)) throw new Error('DRIP date must be YYYY-MM-DD.');
    const txn = {
      type: 'buy',
      date: args.date,
      shares: shares,
      price: round6(amount / shares),
      commission: 0,
      fxRate: num(args.fxRate) > 0 ? num(args.fxRate) : 1,
      source: 'drip',
    };
    if (args.fxEstimated) txn.fxEstimated = true;
    return txn;
  }

  // Return of capital: total dollars received for the position, in the
  // position's own currency. acb.js reduces ACB and gains any excess.
  function rocTxn(args) {
    args = args || {};
    const amount = num(args.amount);
    if (!(amount > 0)) throw new Error('Return of capital amount must be positive.');
    if (!isISO(args.date)) throw new Error('ROC date must be YYYY-MM-DD.');
    const txn = {
      type: 'roc',
      date: args.date,
      amount: amount,
      fxRate: num(args.fxRate) > 0 ? num(args.fxRate) : 1,
    };
    if (args.fxEstimated) txn.fxEstimated = true;
    return txn;
  }

  // Normalized cash-income entry for the income ledger (dividends and other
  // distributions that do NOT touch ACB).
  function incomeEntry(args) {
    args = args || {};
    const amount = num(args.amount);
    if (!(amount > 0)) throw new Error('Income amount must be positive.');
    if (!isISO(args.date)) throw new Error('Income date must be YYYY-MM-DD.');
    const fx = num(args.fxRate) > 0 ? num(args.fxRate) : 1;
    return {
      symbol: String(args.symbol || '').toUpperCase(),
      account: args.account || 'non-registered',
      currency: args.currency === 'USD' ? 'USD' : 'CAD',
      kind: (args.kind === 'drip' || args.kind === 'reinvested-distribution') ? args.kind : 'dividend',
      date: args.date,
      amount: round6(amount),
      fxRate: fx,
      amountCad: round6(amount * fx),
      fxEstimated: !!args.fxEstimated,
    };
  }

  return {
    applySplit: applySplit,
    dripTxn: dripTxn,
    rocTxn: rocTxn,
    incomeEntry: incomeEntry,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CorporateActions;
} else if (typeof window !== 'undefined') {
  window.CorporateActions = CorporateActions;
}
