/* ============================================
   GSP TRADING - RISK ANALYTICS (pure computation)

   Real risk-analytics math for the Risk view. Replaces two placeholder
   surfaces with numbers computed from actual price history:

   - Correlation Matrix (was a static lookup table) -> pairwise Pearson
     correlation of daily returns.
   - Equity / Drawdown curve + Max Drawdown (was a Math.random walk) ->
     the current holdings valued back over real price history, plus the
     largest peak-to-trough decline on that curve.

   These functions are PURE: no network, no DOM, no Date. The caller
   fetches history from /api/chart/:symbol?interval=1d&range=1y (which
   returns { candles: [{ time, close, ... }] }) and passes close arrays /
   { time, close } series in. Given the data, we return the real numbers.

   STATED ASSUMPTIONS / APPROXIMATIONS (surface these in the UI):
   - Returns are SIMPLE daily returns (p_t / p_{t-1} - 1), not log returns.
   - Correlation uses Pearson on daily returns. When two symbols' histories
     differ in length, series are aligned by taking the LAST N observations
     of each (the most recent common window) before computing returns. This
     is a reasonable approximation; it assumes the trailing windows line up
     day-for-day, which is true for same-exchange daily bars over the same
     range.
   - Annualized volatility = sample stdev of daily returns * sqrt(252)
     (252 trading days/yr; sample stdev uses the n-1 denominator).
   - Sharpe = (mean daily return * 252 - riskFreeAnnual) / annualized vol.
     Arithmetic annualization, risk-free given as an annual rate.
   - The equity curve values the CURRENT share counts across all of history
     (constant shares). It is illustrative - what today's book would have
     been worth - NOT a realized track record with actual trade timing.
   ============================================ */

'use strict';

const RiskAnalytics = (function () {
  const TRADING_DAYS = 252;

  function num(v) { const n = Number(v); return isFinite(n) ? n : 0; }
  function round2(v) { return Math.round(v * 100) / 100; }
  function round6(v) { return Math.round(v * 1e6) / 1e6; }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  function mean(arr) {
    if (!arr.length) return 0;
    let s = 0;
    for (let i = 0; i < arr.length; i++) s += arr[i];
    return s / arr.length;
  }

  // Sample standard deviation (n-1 denominator). null if < 2 points.
  function sampleStdev(arr) {
    if (!Array.isArray(arr) || arr.length < 2) return null;
    const m = mean(arr);
    let ss = 0;
    for (let i = 0; i < arr.length; i++) {
      const d = arr[i] - m;
      ss += d * d;
    }
    return Math.sqrt(ss / (arr.length - 1));
  }

  // (1) Simple daily returns from a close array. length n-1; < 2 points -> [].
  function dailyReturns(closes) {
    const c = Array.isArray(closes) ? closes : [];
    if (c.length < 2) return [];
    const out = [];
    for (let i = 1; i < c.length; i++) {
      const prev = num(c[i - 1]);
      const cur = num(c[i]);
      out.push(prev !== 0 ? (cur - prev) / prev : 0);
    }
    return out;
  }

  // Align two arrays to their common (shortest) length by taking the LAST N
  // of each - the most recent overlapping window.
  function alignLastN(a, b) {
    const n = Math.min(a.length, b.length);
    return [a.slice(a.length - n), b.slice(b.length - n)];
  }

  // (2) Pearson correlation of two equal-length return arrays, clamped to
  // [-1, 1]. null if < 2 overlapping points or zero variance in either.
  function correlation(returnsA, returnsB) {
    const a0 = Array.isArray(returnsA) ? returnsA : [];
    const b0 = Array.isArray(returnsB) ? returnsB : [];
    const pair = alignLastN(a0, b0);
    const a = pair[0], b = pair[1];
    const n = a.length;
    if (n < 2) return null;
    const ma = mean(a), mb = mean(b);
    let cov = 0, va = 0, vb = 0;
    for (let i = 0; i < n; i++) {
      const da = a[i] - ma;
      const db = b[i] - mb;
      cov += da * db;
      va += da * da;
      vb += db * db;
    }
    if (va === 0 || vb === 0) return null; // zero variance -> undefined correlation
    const r = cov / Math.sqrt(va * vb);
    return round6(clamp(r, -1, 1));
  }

  // (3) Pairwise correlation matrix. seriesBySymbol = { SYM: closes[] }.
  // Alignment: series are trimmed to the shortest common length by taking
  // the LAST N closes of each before computing returns (last-N overlap is a
  // reasonable approximation when histories differ in length). Diagonal = 1.
  // Ordering is deterministic (input key order).
  function correlationMatrix(seriesBySymbol) {
    const map = seriesBySymbol || {};
    const symbols = Object.keys(map);
    // shortest common close length across all symbols
    let minLen = Infinity;
    symbols.forEach(function (s) {
      const arr = Array.isArray(map[s]) ? map[s] : [];
      if (arr.length < minLen) minLen = arr.length;
    });
    if (!isFinite(minLen)) minLen = 0;

    // trim each series to the last minLen closes, then to daily returns
    const returnsBySymbol = {};
    symbols.forEach(function (s) {
      const arr = Array.isArray(map[s]) ? map[s] : [];
      const trimmed = arr.slice(arr.length - minLen);
      returnsBySymbol[s] = dailyReturns(trimmed);
    });

    const matrix = symbols.map(function (rowSym, i) {
      return symbols.map(function (colSym, j) {
        if (i === j) return 1;
        return correlation(returnsBySymbol[rowSym], returnsBySymbol[colSym]);
      });
    });

    return { symbols: symbols, matrix: matrix };
  }

  // Sort a { time, close } series ascending by time (shallow copy).
  function sortedSeries(series) {
    return (Array.isArray(series) ? series.slice() : [])
      .filter(function (p) { return p && p.time !== undefined && p.time !== null; })
      .sort(function (a, b) { return num(a.time) - num(b.time); });
  }

  // (4) Real "current-holdings-valued-back" equity curve.
  //   positions = [{ symbol, shares }]
  //   priceSeriesBySymbol = { SYM: [{ time, close }] }
  // Common time axis = the timestamps of the SHORTEST included series (fewest
  // points); ties broken by first appearance. For each date we sum
  // shares * close across positions. A symbol missing a price on an axis date
  // is FORWARD-FILLED from its last known close (and back-filled with its
  // first close for any axis date before its history starts). A symbol with
  // no data is EXCLUDED and named in the note.
  function buildEquityCurve(positions, priceSeriesBySymbol) {
    const pos = Array.isArray(positions) ? positions : [];
    const priceMap = priceSeriesBySymbol || {};

    const included = [];       // positions that have usable price data
    const excludedSet = {};    // symbols with no data
    pos.forEach(function (p) {
      const sym = p && p.symbol;
      const sorted = sortedSeries(priceMap[sym]);
      if (sym && sorted.length) included.push({ symbol: sym, shares: num(p.shares), series: sorted });
      else if (sym) excludedSet[sym] = true;
    });
    const excludedSymbols = Object.keys(excludedSet);

    const baseNote = 'Current holdings valued over historical prices (constant share count) - illustrative of what today\'s book would have been worth, not a realized track record.';

    if (!included.length) {
      return {
        points: [],
        note: baseNote + (excludedSymbols.length ? ' Excluded (no price data): ' + excludedSymbols.join(', ') + '.' : ''),
        excludedSymbols: excludedSymbols,
      };
    }

    // unique symbols among included, first-appearance order
    const uniqueSyms = [];
    const seen = {};
    included.forEach(function (r) { if (!seen[r.symbol]) { seen[r.symbol] = r.series; uniqueSyms.push(r.symbol); } });

    // axis = deduped sorted times of the shortest included series
    let axisSym = uniqueSyms[0];
    let axisLen = Infinity;
    uniqueSyms.forEach(function (s) {
      const times = uniqueTimes(seen[s]);
      if (times.length < axisLen) { axisLen = times.length; axisSym = s; }
    });
    const axis = uniqueTimes(seen[axisSym]);

    // forward-filled close per unique symbol, aligned to axis
    const filled = {};
    uniqueSyms.forEach(function (s) {
      filled[s] = forwardFill(seen[s], axis);
    });

    const points = axis.map(function (t, idx) {
      let value = 0;
      included.forEach(function (r) {
        value += r.shares * filled[r.symbol][idx];
      });
      return { time: t, value: round2(value) };
    });

    return {
      points: points,
      note: baseNote + (excludedSymbols.length ? ' Excluded (no price data): ' + excludedSymbols.join(', ') + '.' : ''),
      excludedSymbols: excludedSymbols,
    };
  }

  function uniqueTimes(series) {
    const out = [];
    let last;
    for (let i = 0; i < series.length; i++) {
      const t = num(series[i].time);
      if (i === 0 || t !== last) { out.push(t); last = t; }
    }
    return out;
  }

  // For each axis time, return the series' close at the latest observation
  // with time <= axis time (forward fill). Before the series starts, use its
  // first close (back fill). series is pre-sorted ascending by time.
  function forwardFill(series, axis) {
    const out = new Array(axis.length);
    let p = 0;
    let lastClose = series.length ? num(series[0].close) : 0;
    for (let i = 0; i < axis.length; i++) {
      const t = axis[i];
      while (p < series.length && num(series[p].time) <= t) {
        lastClose = num(series[p].close);
        p++;
      }
      out[i] = lastClose;
    }
    return out;
  }

  // (5) Largest peak-to-trough decline on an equity curve.
  // points = [{ time, value }]. Empty / single point -> all zeros.
  function maxDrawdown(points) {
    const pts = Array.isArray(points) ? points : [];
    if (pts.length < 2) {
      return { maxDrawdownPct: 0, peakValue: 0, troughValue: 0, peakIndex: 0, troughIndex: 0 };
    }
    let peakValue = num(pts[0].value);
    let peakIndex = 0;
    let maxDD = 0; // as a fraction
    let ddPeakVal = peakValue, ddTroughVal = peakValue, ddPeakIdx = 0, ddTroughIdx = 0;

    for (let i = 1; i < pts.length; i++) {
      const v = num(pts[i].value);
      if (v > peakValue) {
        peakValue = v;
        peakIndex = i;
      } else if (peakValue > 0) {
        const dd = (peakValue - v) / peakValue;
        if (dd > maxDD) {
          maxDD = dd;
          ddPeakVal = peakValue;
          ddTroughVal = v;
          ddPeakIdx = peakIndex;
          ddTroughIdx = i;
        }
      }
    }

    return {
      maxDrawdownPct: round2(maxDD * 100),
      peakValue: round2(ddPeakVal),
      troughValue: round2(ddTroughVal),
      peakIndex: ddPeakIdx,
      troughIndex: ddTroughIdx,
    };
  }

  // (6a) Annualized volatility from a close array. Sample stdev of daily
  // returns * sqrt(252). null if fewer than 2 daily returns (< 3 closes).
  function annualizedVolatility(closes) {
    const rets = dailyReturns(closes);
    const sd = sampleStdev(rets);
    if (sd === null) return null;
    return sd * Math.sqrt(TRADING_DAYS);
  }

  // (6b) Sharpe ratio from a close array. (mean daily * 252 - rf) / annual vol.
  // riskFreeAnnual defaults to 4%. null if insufficient data or zero vol.
  function sharpeRatio(closes, riskFreeAnnual) {
    const rf = (riskFreeAnnual === undefined || riskFreeAnnual === null) ? 0.04 : num(riskFreeAnnual);
    const rets = dailyReturns(closes);
    if (rets.length < 2) return null;
    const vol = annualizedVolatility(closes);
    if (vol === null || vol === 0) return null;
    const annualReturn = mean(rets) * TRADING_DAYS;
    return (annualReturn - rf) / vol;
  }

  return {
    dailyReturns: dailyReturns,
    correlation: correlation,
    correlationMatrix: correlationMatrix,
    buildEquityCurve: buildEquityCurve,
    maxDrawdown: maxDrawdown,
    annualizedVolatility: annualizedVolatility,
    sharpeRatio: sharpeRatio,
    TRADING_DAYS: TRADING_DAYS,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = RiskAnalytics;
} else if (typeof window !== 'undefined') {
  window.RiskAnalytics = RiskAnalytics;
}
