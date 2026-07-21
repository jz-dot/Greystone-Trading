/* ============================================
   GSP TRADING - DETERMINISTIC STOCK SCREENER (pure computation)

   Replaces the hardcoded "Grey Sankore" momentum/value sample cards
   (services/grey-sankore.js -> MOCK_INSIGHTS) with signals computed from
   REAL market data. These functions are PURE: no network, no DOM, no
   Date.now(). The caller fetches the inputs (chart closes + fundamentals)
   from the app's live endpoints and feeds them in; nothing here reaches
   out. Same numbers in -> same numbers out, so results are testable and
   auditable.

   WHAT THIS IS: a rules-based screen of real prices and real fundamentals
   for research/education. The scoring weights are stated in comments and
   fixed - not a black box, not a prediction, not advice.

   WHAT THIS IS NOT: the old "ANOMALY DETECTED / options-flow / dark-pool"
   card is deliberately not reproduced here. Those signals need premium
   options-flow and dark-pool feeds we do not compute from OHLCV + basic
   fundamentals. See SCREENER_DISCLAIMER.

   INPUTS (per symbol), gathered by the caller:
   - momentum: { symbol, closes[], price, high52, low52 }
       closes  = daily close array, OLDEST -> NEWEST, from
                 /api/chart/:symbol?interval=1d&range=6mo  ({candles:[{close}]})
       price   = latest price (defaults to last close if omitted)
       high52/low52 = fiftyTwoWeekHigh / fiftyTwoWeekLow from /api/fundamentals
   - value: { symbol, fundamentals, price }
       fundamentals = the whole /api/fundamentals/:symbol object (fields
                      may be null); price defaults to regularMarketPrice.
   ============================================ */

'use strict';

const Screener = (function () {

  const SCREENER_DISCLAIMER =
    'This is a rules-based screen of real market data (prices and published ' +
    'fundamentals) built for research and education, not investment advice. ' +
    'Scores come from fixed, documented heuristics - momentum from price ' +
    'action (RSI, moving averages, distance from 52-week extremes) and value ' +
    'from valuation ratios, dividend yield, and pullback depth. Anomaly, ' +
    'options-flow, dark-pool, and unusual-activity style signals are NOT ' +
    'computed here: they require premium data feeds this screen does not use. ' +
    'Do your own diligence before trading.';

  // ---- small numeric helpers ----
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function round2(v) { return Math.round(v * 100) / 100; }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  // valuation ratios are only meaningful when strictly positive
  function posNum(v) { return isNum(v) && v > 0 ? v : null; }

  // ============================================================
  //  1. MOMENTUM INDICATORS (from a close-price array)
  // ============================================================

  // Last simple moving average of `period` closes. null if insufficient.
  function sma(closes, period) {
    if (!Array.isArray(closes) || !isNum(period) || period <= 0) return null;
    if (closes.length < period) return null;
    let sum = 0;
    for (let i = closes.length - period; i < closes.length; i++) {
      if (!isNum(closes[i])) return null;
      sum += closes[i];
    }
    return round2(sum / period);
  }

  // Wilder's RSI (0-100). Needs at least period+1 closes; null otherwise.
  // Seeds with a simple average of the first `period` gains/losses, then
  // applies Wilder smoothing for every later bar.
  function rsi(closes, period) {
    period = isNum(period) && period > 0 ? Math.floor(period) : 14;
    if (!Array.isArray(closes) || closes.length < period + 1) return null;

    let gainSum = 0, lossSum = 0;
    for (let i = 1; i <= period; i++) {
      if (!isNum(closes[i]) || !isNum(closes[i - 1])) return null;
      const d = closes[i] - closes[i - 1];
      if (d >= 0) gainSum += d; else lossSum += -d;
    }
    let avgGain = gainSum / period;
    let avgLoss = lossSum / period;

    for (let i = period + 1; i < closes.length; i++) {
      if (!isNum(closes[i]) || !isNum(closes[i - 1])) return null;
      const d = closes[i] - closes[i - 1];
      const g = d > 0 ? d : 0;
      const l = d < 0 ? -d : 0;
      avgGain = (avgGain * (period - 1) + g) / period;
      avgLoss = (avgLoss * (period - 1) + l) / period;
    }

    if (avgLoss === 0) return avgGain === 0 ? 50 : 100; // no losses -> maxed (flat -> neutral)
    const rs = avgGain / avgLoss;
    return round2(100 - 100 / (1 + rs));
  }

  // Signed % of price relative to the 52-week high (negative = below high).
  function pctFrom52wHigh(price, high52) {
    if (!isNum(price) || !posNum(high52)) return null;
    return round2(((price - high52) / high52) * 100);
  }

  // Signed % of price relative to the 52-week low (positive = above low).
  function pctFrom52wLow(price, low52) {
    if (!isNum(price) || !posNum(low52)) return null;
    return round2(((price - low52) / low52) * 100);
  }

  // ============================================================
  //  2. MOMENTUM SIGNAL (scored read)
  //
  //  Deterministic 0-100 score, five components summing to 100:
  //    RSI(14) strength ............ 0-30
  //    price above 20-day SMA ...... 0 or 15
  //    price above 50-day SMA ...... 0 or 15
  //    20>50 SMA (golden cross) .... 0 or 20
  //    proximity to 52-week high ... 2-20
  //  Rationale: momentum favours names trending up (price over rising
  //  averages, fast over slow) with firm-but-not-blown-out RSI and price
  //  pressing against its yearly high. Extreme overbought RSI (>=70) is
  //  shaded down slightly (26 not 30) to stay honest about exhaustion risk.
  //  Needs >= 50 closes (for SMA50) or returns null.
  // ============================================================
  function momentumSignal(input) {
    input = input || {};
    const symbol = input.symbol;
    const closes = input.closes;
    if (!Array.isArray(closes) || closes.length < 50) return null;

    const price = isNum(input.price) ? input.price : closes[closes.length - 1];
    if (!isNum(price)) return null;

    const r = rsi(closes, 14);
    const s20 = sma(closes, 20);
    const s50 = sma(closes, 50);
    if (r === null || s20 === null || s50 === null) return null;

    const high52 = posNum(input.high52);
    const low52 = posNum(input.low52);

    // --- RSI component (0-30) ---
    let rsiPts;
    if (r >= 70) rsiPts = 26;        // strong but overbought
    else if (r >= 60) rsiPts = 30;   // ideal momentum band
    else if (r >= 50) rsiPts = 22;
    else if (r >= 40) rsiPts = 12;
    else if (r >= 30) rsiPts = 6;
    else rsiPts = 2;                 // oversold / no momentum

    // --- trend components ---
    const sma20Pts = price >= s20 ? 15 : 0;
    const sma50Pts = price >= s50 ? 15 : 0;
    const crossPts = s20 >= s50 ? 20 : 0; // golden-cross state = uptrend

    // --- distance from 52-week high (0-20). Neutral 10 if high unknown. ---
    let highDistPts = 10;
    let pctHigh = null;
    if (high52 !== null) {
      pctHigh = pctFrom52wHigh(price, high52);
      const ad = Math.abs(pctHigh);
      if (price >= high52 || ad <= 5) highDistPts = 20;
      else if (ad <= 10) highDistPts = 14;
      else if (ad <= 20) highDistPts = 8;
      else highDistPts = 2;
    }

    const score = clamp(round2(rsiPts + sma20Pts + sma50Pts + crossPts + highDistPts), 0, 100);

    // --- trend label ---
    let trend;
    if (price >= s20 && s20 >= s50) trend = 'bullish';
    else if (price < s20 && s20 < s50) trend = 'bearish';
    else trend = 'neutral';

    // --- human-readable signals ---
    const signals = [];
    let rsiWord;
    if (r >= 70) rsiWord = 'overbought';
    else if (r >= 60) rsiWord = 'strong';
    else if (r >= 50) rsiWord = 'firm';
    else if (r >= 40) rsiWord = 'soft';
    else if (r >= 30) rsiWord = 'weak';
    else rsiWord = 'oversold';
    signals.push('RSI ' + Math.round(r) + ' (' + rsiWord + ')');
    signals.push(s20 >= s50 ? '20>50 SMA (uptrend)' : '20<50 SMA (downtrend)');
    signals.push(price >= s20 ? 'Price above 20-day SMA' : 'Price below 20-day SMA');
    if (pctHigh !== null) {
      const adH = Math.round(Math.abs(pctHigh));
      if (price >= high52 || adH === 0) signals.push('At 52-week high');
      else signals.push(adH + '% below 52w high');
    }
    let pctLow = null;
    if (low52 !== null) {
      pctLow = pctFrom52wLow(price, low52);
      if (pctLow !== null && pctLow > 0) signals.push(Math.round(pctLow) + '% above 52w low');
    }

    const summary = (symbol ? symbol + ': ' : '') + trend + ' momentum, RSI ' + Math.round(r) +
      ', ' + (price >= s20 ? 'above' : 'below') + ' the 20-day SMA and ' +
      (s20 >= s50 ? '20>50 (uptrend)' : '20<50 (downtrend)') +
      (pctHigh !== null ? ', ' + Math.round(Math.abs(pctHigh)) + '% ' +
        (price >= high52 ? 'above' : 'below') + ' its 52-week high' : '') + '.';

    return {
      symbol: symbol,
      score: score,
      rsi: r,
      sma20: s20,
      sma50: s50,
      trend: trend,
      signals: signals,
      summary: summary,
    };
  }

  // ============================================================
  //  3. VALUE SIGNAL (scored read from real fundamentals)
  //
  //  Neutral base 50, adjusted by whatever fields are present. A field
  //  that is null is skipped entirely - never fabricated, never penalised.
  //  Documented adjustments (baseline P/E ~20, P/B ~1.5-3):
  //    Forward P/E (primary) ...... -15 .. +20
  //    Trailing P/E (secondary) ... -6  .. +10
  //    Price/Book ................. -8  .. +15
  //    Dividend yield (income) .... 0   .. +12
  //    Pullback below 52w high .... 0   .. +12  (buy-the-dip proxy)
  //  Final score clamped to 0-100. Requires at least one of forward P/E,
  //  trailing P/E, or P/B; otherwise there is nothing to value -> null.
  //
  //  Dividend-yield units: Yahoo-style feeds report this either as a
  //  fraction (0.031) or as a percent (3.1). We normalise: a raw value
  //  <= 1 is read as a fraction and multiplied by 100; > 1 is taken as a
  //  percent as-is. Documented assumption, applied deterministically.
  // ============================================================
  function valueSignal(input) {
    input = input || {};
    const symbol = input.symbol;
    const f = input.fundamentals;
    if (!f || typeof f !== 'object') return null;

    const fwdPE = posNum(f.forwardPE);
    const trailPE = posNum(f.trailingPE);
    const pb = posNum(f.priceToBook);
    const high52 = posNum(f.fiftyTwoWeekHigh);
    const price = isNum(input.price) ? input.price
      : (isNum(f.regularMarketPrice) ? f.regularMarketPrice : null);

    // Nothing to value on -> not a candidate.
    if (fwdPE === null && trailPE === null && pb === null) return null;

    // Dividend yield -> percent.
    let divYieldPct = null;
    if (isNum(f.dividendYield) && f.dividendYield > 0) {
      divYieldPct = round2(f.dividendYield <= 1 ? f.dividendYield * 100 : f.dividendYield);
    }

    let score = 50;
    const signals = [];

    if (fwdPE !== null) {
      let pts;
      if (fwdPE <= 10) pts = 20;
      else if (fwdPE <= 15) pts = 14;
      else if (fwdPE <= 20) pts = 7;
      else if (fwdPE <= 25) pts = 0;
      else if (fwdPE <= 35) pts = -8;
      else pts = -15;
      score += pts;
      const tag = fwdPE <= 15 ? 'cheap vs 20 baseline'
        : fwdPE <= 20 ? 'fair vs 20 baseline' : 'rich vs 20 baseline';
      signals.push('Fwd P/E ' + round2(fwdPE) + ' (' + tag + ')');
    }

    if (trailPE !== null) {
      let pts;
      if (trailPE <= 12) pts = 10;
      else if (trailPE <= 20) pts = 4;
      else if (trailPE <= 30) pts = 0;
      else pts = -6;
      score += pts;
      signals.push('Trailing P/E ' + round2(trailPE));
    }

    if (pb !== null) {
      let pts;
      if (pb <= 1) pts = 15;
      else if (pb <= 2) pts = 9;
      else if (pb <= 3) pts = 3;
      else if (pb <= 5) pts = -3;
      else pts = -8;
      score += pts;
      const tag = pb <= 1 ? 'below book value' : pb <= 3 ? 'reasonable' : 'expensive vs book';
      signals.push('P/B ' + round2(pb) + ' (' + tag + ')');
    }

    if (divYieldPct !== null) {
      if (divYieldPct >= 4) score += 12;
      else if (divYieldPct >= 2) score += 8;
      else score += 4;
      signals.push('Div yield ' + divYieldPct + '%');
    }

    // Pullback below the 52-week high as a mean-reversion / entry proxy.
    let pctHigh = null;
    if (price !== null && high52 !== null) {
      pctHigh = pctFrom52wHigh(price, high52);
      const belowPct = -pctHigh; // positive when price is under the high
      if (belowPct >= 30) score += 12;
      else if (belowPct >= 20) score += 8;
      else if (belowPct >= 10) score += 4;
      if (belowPct >= 5) signals.push(Math.round(belowPct) + '% below 52w high');
    }

    score = clamp(round2(score), 0, 100);

    const cheapBits = [];
    if (fwdPE !== null) cheapBits.push('fwd P/E ' + round2(fwdPE));
    if (pb !== null) cheapBits.push('P/B ' + round2(pb));
    if (divYieldPct !== null) cheapBits.push(divYieldPct + '% yield');
    const summary = (symbol ? symbol + ': ' : '') + 'value score ' + score +
      (cheapBits.length ? ' on ' + cheapBits.join(', ') : '') +
      (pctHigh !== null && -pctHigh >= 10 ? ', ' + Math.round(-pctHigh) + '% off its 52-week high' : '') + '.';

    return {
      symbol: symbol,
      score: score,
      fwdPE: fwdPE !== null ? round2(fwdPE) : null,
      trailingPE: trailPE !== null ? round2(trailPE) : null,
      pb: pb !== null ? round2(pb) : null,
      divYield: divYieldPct,
      signals: signals,
      summary: summary,
    };
  }

  // ============================================================
  //  4. SCREEN a universe
  //  items = array of per-symbol input objects (see file header).
  //  kind  = 'momentum' | 'value'. Maps each item through the right
  //  signal fn, drops nulls (insufficient data), sorts by score desc.
  // ============================================================
  function screen(items, kind) {
    if (!Array.isArray(items)) return [];
    let fn;
    if (kind === 'momentum') fn = momentumSignal;
    else if (kind === 'value') fn = valueSignal;
    else throw new Error("screen: kind must be 'momentum' or 'value', got " + JSON.stringify(kind));

    const rows = [];
    for (let i = 0; i < items.length; i++) {
      const r = fn(items[i]);
      if (r !== null) rows.push(r);
    }
    rows.sort(function (a, b) { return b.score - a.score; });
    return rows;
  }

  return {
    sma: sma,
    rsi: rsi,
    pctFrom52wHigh: pctFrom52wHigh,
    pctFrom52wLow: pctFrom52wLow,
    momentumSignal: momentumSignal,
    valueSignal: valueSignal,
    screen: screen,
    SCREENER_DISCLAIMER: SCREENER_DISCLAIMER,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Screener;
} else if (typeof window !== 'undefined') {
  window.Screener = Screener;
}
