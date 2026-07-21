/* ============================================
   CANADIAN ADJUSTED COST BASE (ACB) ENGINE
   Pure implementation - no external libraries
   ============================================

   WHAT THIS IS
   A tool to ASSIST with Canadian Adjusted Cost Base (ACB) and capital
   gain/loss tracking for non-registered (taxable) accounts. It implements
   the identical-property pooling rule, commission handling, the superficial
   loss rule, per-transaction multi-currency conversion to CAD, and return of
   capital (ROC) adjustments.

   THIS IS NOT TAX ADVICE. The output is a calculation aid only. Cost-basis and
   capital-gains reporting for Canadian tax has many facts and elections that a
   generic engine cannot know (affiliated persons in other accounts, identical
   property across accounts, corporate actions, T-slip reconciliation, and so
   on). Always verify results against current CRA guidance (see CRA "Adjusted
   cost base", the T4037 Capital Gains guide, and ITA sections 40, 53, and 54)
   and consult a qualified tax professional before filing.

   CORE RULES IMPLEMENTED
   - A BUY increases total ACB by (shares * price + commission). ACB per share
     equals total ACB divided by total shares held (pooled / average cost).
   - A SELL does NOT change ACB per share. It realizes a capital gain or loss
     equal to proceeds (sale value minus commission) minus (ACB-per-share times
     shares sold). It reduces total ACB by (ACB-per-share times shares sold) and
     reduces the share count.
   - Commissions on buys ADD to ACB. Commissions on sells REDUCE proceeds.
   - SUPERFICIAL LOSS (ITA s.54, s.40(2)(g)(i)): a loss is denied when identical
     property is acquired in the 61-day window (30 days before through 30 days
     after the disposition) AND is still held at the end of that window. The
     denied portion is prorated by (least of shares-sold, shares-acquired-in-
     window, shares-held-at-window-end) and is added to the ACB of the
     substituted (repurchased) property rather than being deductible now.
   - MULTI-CURRENCY: each transaction is converted to CAD using its OWN
     transaction-date fxRate. ACB and proceeds are computed in CAD. Default
     fxRate is 1.0 (CAD).
   - RETURN OF CAPITAL (ROC): reduces total ACB without changing the share
     count. ROC in excess of the remaining ACB triggers a capital gain and
     floors ACB at zero.
*/

// One calendar day in milliseconds.
const DAY_MS = 86400000;
// Superficial loss window: 30 days before and 30 days after the disposition.
const SUPERFICIAL_WINDOW_DAYS = 30;
// Tolerance for floating point share comparisons and zero snapping.
const EPS = 1e-9;

/**
 * Parse a transaction date into a UTC timestamp (ms).
 * Accepts a Date, a millisecond timestamp, or a 'YYYY-MM-DD' string.
 * 'YYYY-MM-DD' is anchored to UTC midnight so day math never drifts by a
 * timezone offset.
 * @param {(Date|number|string)} d
 * @returns {number} timestamp in ms
 */
function parseDate(d) {
  if (d instanceof Date) return d.getTime();
  if (typeof d === 'number') return d;
  if (typeof d === 'string') {
    const isoDay = /^\d{4}-\d{2}-\d{2}$/;
    const ms = isoDay.test(d) ? Date.parse(d + 'T00:00:00Z') : Date.parse(d);
    if (Number.isNaN(ms)) throw new Error('Invalid transaction date: ' + d);
    return ms;
  }
  throw new Error('Invalid transaction date: ' + String(d));
}

/**
 * Format a UTC timestamp back to a 'YYYY-MM-DD' string for ledger output.
 * @param {number} ms
 * @returns {string}
 */
function formatDate(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Coerce a possibly-undefined numeric field to a finite Number.
 * @param {*} v
 * @param {number} fallback
 * @returns {number}
 */
function num(v, fallback) {
  if (v === undefined || v === null || v === '') return fallback;
  const n = Number(v);
  if (Number.isNaN(n)) throw new Error('Expected a number but got: ' + String(v));
  return n;
}

/**
 * Snap a value that is within EPS of zero to exactly zero. Keeps pooled ACB
 * from carrying tiny floating point residuals after a full liquidation.
 * @param {number} v
 * @returns {number}
 */
function snapZero(v) {
  return Math.abs(v) < EPS ? 0 : v;
}

/**
 * Normalize and sort the transaction list.
 * Sort is by date, stable (input order preserved on ties). The engine
 * processes transactions in this settled order and documents that ties keep
 * the caller's ordering.
 * @param {Array} transactions
 * @returns {Array} array of normalized transactions with parsed timestamps
 */
function normalize(transactions) {
  if (!Array.isArray(transactions)) {
    throw new Error('transactions must be an array');
  }
  const rows = transactions.map((tx, originalIndex) => {
    if (!tx || typeof tx !== 'object') {
      throw new Error('Each transaction must be an object');
    }
    const type = String(tx.type || '').toLowerCase();
    if (type !== 'buy' && type !== 'sell' && type !== 'roc' && type !== 'reinvest') {
      throw new Error("Unknown transaction type '" + tx.type + "'. Expected 'buy', 'sell', 'roc', or 'reinvest'.");
    }
    const ts = parseDate(tx.date);
    const fxRate = num(tx.fxRate, 1);
    if (fxRate <= 0) throw new Error('fxRate must be positive');
    const shares = num(tx.shares, 0);
    const price = num(tx.price, 0);
    const commission = num(tx.commission, 0);
    // amount is an optional ROC-specific field: the total distribution in the
    // transaction currency. If absent, ROC falls back to shares * price.
    const amount = tx.amount === undefined ? null : num(tx.amount, 0);
    if ((type === 'buy' || type === 'sell') && shares <= 0) {
      throw new Error(type + ' transactions require shares greater than zero');
    }
    return { type, ts, fxRate, shares, price, commission, amount, originalIndex, raw: tx };
  });
  // Stable sort by timestamp; fall back to original index to keep ties ordered.
  rows.sort((a, b) => (a.ts - b.ts) || (a.originalIndex - b.originalIndex));
  return rows;
}

/**
 * Net shares held (buys minus sells) as of a given timestamp, inclusive.
 * Used to evaluate the "still held at the end of the window" condition of the
 * superficial loss rule.
 * @param {Array} rows normalized transactions
 * @param {number} asOfTs
 * @returns {number}
 */
function sharesHeldAsOf(rows, asOfTs) {
  let held = 0;
  for (const r of rows) {
    if (r.ts > asOfTs) break; // rows are sorted by ts
    if (r.type === 'buy') held += r.shares;
    else if (r.type === 'sell') held -= r.shares;
    // roc does not change share count
  }
  return held;
}

/**
 * Compute the full running ACB ledger for an ordered list of transactions.
 *
 * @param {Array<Object>} transactions each { date, type: 'buy'|'sell'|'roc',
 *   shares, price, commission, fxRate, [amount] }. price and commission are in
 *   the transaction currency; fxRate converts that currency to CAD (default 1).
 *   For 'roc', use `amount` (total distribution in the transaction currency) or
 *   fall back to shares * price.
 * @param {Object} [options]
 * @param {boolean} [options.detectSuperficialLoss=true] enable superficial
 *   loss detection and denied-loss reallocation to ACB.
 * @returns {Object} { ledger, summary }
 *   ledger: one row per transaction, in settled order, with the running state
 *           AFTER the transaction. Monetary fields are CAD.
 *   summary: { totalRealizedGain, currentShares, currentBookValue,
 *              currentACBPerShare, totalSuperficialLossDenied }
 */
function computeACB(transactions, options) {
  const opts = options || {};
  const detectSuperficial = opts.detectSuperficialLoss !== false;
  const rows = normalize(transactions);

  let totalACB = 0;   // CAD, pooled adjusted cost base of the holding
  let shares = 0;     // current share count
  let totalRealizedGain = 0;       // CAD, sum of allowed capital gains/losses
  let totalSuperficialLossDenied = 0; // CAD, denied and reallocated to ACB

  // Denied superficial loss to be added to the ACB of a FUTURE buy, keyed by
  // that buy's index in `rows`. Applied when that buy is processed.
  const pendingACBAdd = {};

  const ledger = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const fx = r.fxRate;

    if (r.type === 'buy') {
      // Base cost in CAD plus commission (commission ADDS to ACB).
      const baseCostCAD = (r.shares * r.price + r.commission) * fx;
      // Any denied superficial loss reallocated onto this repurchase.
      const superAdj = pendingACBAdd[i] || 0;
      totalACB += baseCostCAD + superAdj;
      shares += r.shares;
      const acbPerShare = shares > 0 ? totalACB / shares : 0;
      ledger.push({
        index: i,
        date: formatDate(r.ts),
        type: 'buy',
        shares: r.shares,
        price: r.price,
        commission: r.commission,
        fxRate: fx,
        cashFlowCAD: -baseCostCAD,
        costCAD: baseCostCAD,
        superficialLossAdjustment: snapZero(superAdj),
        sharesHeld: snapZero(shares),
        totalACB: snapZero(totalACB),
        acbPerShare: acbPerShare,
      });
      continue;
    }

    if (r.type === 'reinvest') {
      // Reinvested / notional ("phantom") distribution: a fund distributes
      // income that is immediately reinvested WITHOUT issuing new units or
      // paying cash (T3 box 42 reinvested distributions). It is taxed as
      // income in the year received (handled elsewhere) and INCREASES ACB by
      // the reinvested amount - the mirror of return of capital. Shares and
      // cash are unchanged; no capital gain arises here.
      const reinvestCAD = (r.amount !== null ? r.amount : r.shares * r.price) * fx;
      totalACB = snapZero(totalACB + reinvestCAD);
      const acbPerShareRi = shares > 0 ? totalACB / shares : 0;
      ledger.push({
        index: i,
        date: formatDate(r.ts),
        type: 'reinvest',
        shares: 0,
        fxRate: fx,
        reinvestAmount: reinvestCAD,
        cashFlowCAD: 0,
        capitalGain: 0,
        sharesHeld: snapZero(shares),
        totalACB: snapZero(totalACB),
        acbPerShare: acbPerShareRi,
      });
      continue;
    }

    if (r.type === 'roc') {
      // Return of capital reduces ACB; excess over ACB is a capital gain.
      const rocCAD = (r.amount !== null ? r.amount : r.shares * r.price) * fx;
      let rocCapitalGain = 0;
      if (rocCAD <= totalACB + EPS) {
        totalACB -= rocCAD;
      } else {
        rocCapitalGain = rocCAD - totalACB;
        totalACB = 0;
        totalRealizedGain += rocCapitalGain;
      }
      totalACB = snapZero(totalACB);
      const acbPerShare = shares > 0 ? totalACB / shares : 0;
      ledger.push({
        index: i,
        date: formatDate(r.ts),
        type: 'roc',
        shares: 0,
        fxRate: fx,
        rocAmount: rocCAD,
        cashFlowCAD: rocCAD,
        capitalGain: rocCapitalGain,
        rocCapitalGain: rocCapitalGain,
        sharesHeld: snapZero(shares),
        totalACB: snapZero(totalACB),
        acbPerShare: acbPerShare,
      });
      continue;
    }

    // r.type === 'sell'
    if (r.shares > shares + EPS) {
      throw new Error(
        'Cannot sell ' + r.shares + ' shares on ' + formatDate(r.ts) +
        '; only ' + snapZero(shares) + ' held.'
      );
    }

    const acbPerShareAtSale = shares > 0 ? totalACB / shares : 0;
    const costBasisCAD = acbPerShareAtSale * r.shares;
    // Proceeds are net of commission (commission REDUCES proceeds).
    const proceedsCAD = (r.shares * r.price - r.commission) * fx;
    const rawGain = proceedsCAD - costBasisCAD;

    let superficial = false;
    let deniedLoss = 0;
    let realizedGain = rawGain;

    if (detectSuperficial && rawGain < -EPS) {
      const loss = -rawGain; // positive magnitude of the loss (L)
      const windowStart = r.ts - SUPERFICIAL_WINDOW_DAYS * DAY_MS;
      const windowEnd = r.ts + SUPERFICIAL_WINDOW_DAYS * DAY_MS;

      // P: identical property acquired anywhere in the 61-day window.
      // Also collect the window buys that settle strictly AFTER this sale;
      // those are the substituted property that carries the denied loss.
      let acquiredInWindow = 0;
      const afterBuys = [];
      let afterBuysShares = 0;
      for (let j = 0; j < rows.length; j++) {
        const b = rows[j];
        if (b.type !== 'buy') continue;
        if (b.ts >= windowStart && b.ts <= windowEnd) {
          acquiredInWindow += b.shares;
          if (j > i) {
            afterBuys.push({ index: j, shares: b.shares });
            afterBuysShares += b.shares;
          }
        }
      }

      // B: identical property still held at the end of the window.
      const heldAtWindowEnd = sharesHeldAsOf(rows, windowEnd);

      if (acquiredInWindow > EPS && heldAtWindowEnd > EPS) {
        // Denied shares = least of (sold, acquired-in-window, held-at-window-end).
        const deniedShares = Math.min(r.shares, acquiredInWindow, heldAtWindowEnd);
        deniedLoss = (deniedShares / r.shares) * loss;
        if (deniedLoss > EPS) {
          superficial = true;
          // Only the allowed portion of the loss is realized now.
          realizedGain = rawGain + deniedLoss;
          totalSuperficialLossDenied += deniedLoss;

          // Reallocate the denied loss to the ACB of the substituted property.
          // Prefer buys that settle after this sale (the classic repurchase);
          // if the substitution happened before the sale, the still-held shares
          // are already in the pool, so add the denied loss to the pool now.
          if (afterBuysShares > EPS) {
            for (const b of afterBuys) {
              pendingACBAdd[b.index] =
                (pendingACBAdd[b.index] || 0) + deniedLoss * (b.shares / afterBuysShares);
            }
          } else {
            // Add to the pool immediately (after this sale reduces ACB below).
            totalACB += deniedLoss;
          }
        }
      }
    }

    // Apply the disposition: reduce pooled ACB and share count.
    totalACB -= costBasisCAD;
    shares -= r.shares;
    if (Math.abs(shares) < EPS) {
      // Full liquidation returns the pool to zero.
      shares = 0;
      totalACB = 0;
    } else {
      totalACB = snapZero(totalACB);
    }

    totalRealizedGain += realizedGain;
    const acbPerShare = shares > 0 ? totalACB / shares : 0;

    ledger.push({
      index: i,
      date: formatDate(r.ts),
      type: 'sell',
      shares: r.shares,
      price: r.price,
      commission: r.commission,
      fxRate: fx,
      proceeds: proceedsCAD,
      costBasis: costBasisCAD,
      capitalGain: snapZero(realizedGain),
      rawCapitalGain: snapZero(rawGain),
      superficialLoss: superficial,
      deniedLoss: snapZero(deniedLoss),
      cashFlowCAD: proceedsCAD,
      sharesHeld: snapZero(shares),
      totalACB: snapZero(totalACB),
      acbPerShare: acbPerShare,
    });
  }

  const currentShares = snapZero(shares);
  const currentBookValue = snapZero(totalACB);
  const currentACBPerShare = currentShares > 0 ? currentBookValue / currentShares : 0;

  return {
    ledger,
    summary: {
      totalRealizedGain: snapZero(totalRealizedGain),
      currentShares,
      currentBookValue,
      currentACBPerShare,
      totalSuperficialLossDenied: snapZero(totalSuperficialLossDenied),
    },
  };
}

/**
 * Convenience wrapper returning only the current position.
 * @param {Array<Object>} transactions
 * @param {Object} [options]
 * @returns {Object} { shares, totalACB, acbPerShare } all CAD
 */
function currentACB(transactions, options) {
  const { summary } = computeACB(transactions, options);
  return {
    shares: summary.currentShares,
    totalACB: summary.currentBookValue,
    acbPerShare: summary.currentACBPerShare,
  };
}

// Export for both Node.js and browser
const ACB = {
  computeACB,
  currentACB,
  parseDate,
  formatDate,
  SUPERFICIAL_WINDOW_DAYS,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ACB;
} else if (typeof window !== 'undefined') {
  window.ACB = ACB;
}
