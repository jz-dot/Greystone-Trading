/* ============================================
   GSP TRADING - EVENT-DRIVEN BACKTESTING ENGINE
   Pure, deterministic strategy proving ground.

   PURPOSE
   -------
   This backtester is the safety prerequisite for autonomous execution: no
   strategy touches real money until it has proven itself here on historical
   data. It is a pure, deterministic, event-driven simulator with no network
   access and no wall-clock or random dependence (no Date.now, no Math.random),
   so a given (bars, strategy, options) triple always yields the identical
   result.

   RESEARCH-ONLY DISCLAIMER
   ------------------------
   This engine is for research and strategy validation only. Past simulated
   performance does not guarantee future results. It models next-bar-open fills
   and explicit transaction costs, but it does NOT model slippage, partial
   fills, market impact, borrow costs on shorts, dividends, or intraday gaps
   unless you configure them. Treat every result as an optimistic upper bound
   and validate on out-of-sample data before risking capital.

   NO-LOOKAHEAD GUARANTEE (the single most important property)
   ----------------------------------------------------------
   A backtester that can see the future is worse than none: it manufactures
   returns that cannot be earned. Two structural defenses enforce that a
   decision made on bar i can never use information from bar i+1 or later:

     1. The strategy is handed a bounded, read-only history "view" that exposes
        ONLY bars[0..i]. Any request for an index greater than i returns
        undefined. Future bars are simply not present in the object graph the
        strategy receives, so lookahead is impossible by construction, not by
        convention. The SMA helpers refuse to compute over any index > i.

     2. Orders are decided on bar i but FILL at bar i+1's OPEN price
        (next-bar-open fill). The strategy never trades at the same close it
        just observed. The decision on the final bar can never fill, because
        there is no next bar - that is correct, not a bug.

   Transaction costs are applied on every fill through services/fee-model.js,
   so the same Canadian-broker cost model that powers the rest of GSP Trading
   governs the backtest.
   ============================================ */

'use strict';

const FeeModel = require('./fee-model.js');

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

/**
 * Round a money amount to cents. Guards against negative zero.
 * @param {number} n
 * @returns {number}
 */
function round2(n) {
  const r = Math.round((n + Number.EPSILON) * 100) / 100;
  return r === 0 ? 0 : r;
}

/**
 * Best-effort conversion of a bar time to epoch milliseconds, used only for
 * CAGR span and holding-period reporting. Deterministic (never reads the clock).
 * Small integers are treated as sequential indices, not timestamps, so callers
 * that pass 1,2,3,... fall back to the periods-per-year model for annualization.
 * @param {*} t
 * @returns {number|null}
 */
function toMs(t) {
  if (t instanceof Date) return t.getTime();
  if (typeof t === 'number' && Number.isFinite(t)) return t >= 1e6 ? t : null;
  if (typeof t === 'string') {
    const ms = Date.parse(t);
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
}

// ---- PURE METRIC HELPERS (exported for direct hand-verification) ----

/**
 * Total return of an equity path: final / initial - 1.
 * @param {number} initial
 * @param {number} final
 * @returns {number}
 */
function computeTotalReturn(initial, final) {
  if (!(initial > 0)) return 0;
  return final / initial - 1;
}

/**
 * Compound annual growth rate. Returns 0 when the span is non-positive and
 * clamps a wiped-out account (final <= 0) to -1 (total loss) rather than NaN.
 * @param {number} initial
 * @param {number} final
 * @param {number} years
 * @returns {number}
 */
function computeCAGR(initial, final, years) {
  if (!(initial > 0) || !(years > 0)) return 0;
  const ratio = final / initial;
  if (ratio <= 0) return -1;
  return Math.pow(ratio, 1 / years) - 1;
}

/**
 * Maximum peak-to-trough drawdown of an equity curve, returned as a POSITIVE
 * fraction (0.25 means a 25% drawdown). Zero for curves shorter than 2 points
 * or that only rise.
 * @param {number[]} equities
 * @returns {number}
 */
function computeMaxDrawdown(equities) {
  if (!Array.isArray(equities) || equities.length < 2) return 0;
  let peak = equities[0];
  let maxDD = 0;
  for (let i = 0; i < equities.length; i++) {
    const e = equities[i];
    if (e > peak) peak = e;
    const dd = peak > 0 ? (peak - e) / peak : 0;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
}

/**
 * Annualized Sharpe ratio computed from an equity curve. Per-period returns are
 * derived from consecutive equity points; the excess mean over the per-period
 * risk-free rate is divided by the SAMPLE standard deviation and scaled by
 * sqrt(periodsPerYear).
 *
 * A flat (zero-variance) curve returns 0, never NaN. Fewer than two returns
 * also returns 0.
 *
 * @param {number[]} equities
 * @param {number} [periodsPerYear=252]
 * @param {number} [rfPerPeriod=0] - per-period risk-free rate (already de-annualized)
 * @returns {number}
 */
function computeSharpe(equities, periodsPerYear, rfPerPeriod) {
  const ppy = typeof periodsPerYear === 'number' && periodsPerYear > 0 ? periodsPerYear : 252;
  const rf = typeof rfPerPeriod === 'number' ? rfPerPeriod : 0;
  if (!Array.isArray(equities) || equities.length < 2) return 0;

  const returns = [];
  for (let i = 1; i < equities.length; i++) {
    const prev = equities[i - 1];
    // A non-positive prior equity makes the ratio meaningless; treat as flat.
    returns.push(prev > 0 ? equities[i] / prev - 1 : 0);
  }
  if (returns.length < 2) return 0;

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  let sumSq = 0;
  for (const r of returns) sumSq += (r - mean) * (r - mean);
  const variance = sumSq / (returns.length - 1); // sample variance
  const std = Math.sqrt(variance);
  if (!(std > 0)) return 0; // flat / zero-variance equity -> 0, not NaN

  const sharpe = ((mean - rf) / std) * Math.sqrt(ppy);
  return Number.isFinite(sharpe) ? sharpe : 0;
}

/**
 * Profit factor = gross wins / gross losses over an array of trade P&Ls.
 * Returns Infinity when there are wins but no losses, and 0 when there are no
 * winning trades.
 * @param {number[]} pnls
 * @returns {number}
 */
function computeProfitFactor(pnls) {
  let grossProfit = 0;
  let grossLoss = 0;
  for (const p of pnls || []) {
    if (p > 0) grossProfit += p;
    else if (p < 0) grossLoss += -p;
  }
  if (grossLoss === 0) return grossProfit > 0 ? Infinity : 0;
  return grossProfit / grossLoss;
}

/**
 * Simple moving average of a numeric field over data ending at endIndex
 * (inclusive). Returns null when there is insufficient history or endIndex is
 * out of range. Never reads beyond endIndex.
 * @param {Array<object>} data
 * @param {number} endIndex
 * @param {number} period
 * @param {string} [field='close']
 * @returns {number|null}
 */
function sma(data, endIndex, period, field) {
  const f = field || 'close';
  if (!Array.isArray(data)) return null;
  if (endIndex == null || endIndex < 0 || endIndex >= data.length) return null;
  if (period <= 0 || endIndex + 1 < period) return null;
  let sum = 0;
  for (let k = endIndex - period + 1; k <= endIndex; k++) sum += data[k][f];
  return sum / period;
}

// ---- BAR VALIDATION / NORMALIZATION ----

/**
 * Validate and freeze the input bar series into an internal, immutable copy.
 * Freezing an internal copy (not the caller's array) both prevents strategy
 * mutation and coerces the OHLCV fields to numbers exactly once.
 * @param {Array<object>} bars
 * @returns {ReadonlyArray<object>}
 */
function normalizeBars(bars) {
  if (!Array.isArray(bars)) {
    throw new TypeError('runBacktest: `bars` must be an array of { time, open, high, low, close, volume }.');
  }
  const out = new Array(bars.length);
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    if (!b || typeof b !== 'object') {
      throw new TypeError(`runBacktest: bar at index ${i} is not an object.`);
    }
    const close = Number(b.close);
    if (!Number.isFinite(close)) {
      throw new TypeError(`runBacktest: bar at index ${i} has a non-finite close.`);
    }
    const open = Number(b.open);
    out[i] = Object.freeze({
      time: b.time,
      open: Number.isFinite(open) ? open : close,
      high: Number.isFinite(Number(b.high)) ? Number(b.high) : close,
      low: Number.isFinite(Number(b.low)) ? Number(b.low) : close,
      close,
      volume: Number.isFinite(Number(b.volume)) ? Number(b.volume) : 0,
    });
  }
  return Object.freeze(out);
}

/**
 * Build a bounded, read-only history view exposing only data[0..upto].
 * This is the structural no-lookahead guard handed to the strategy.
 * @param {ReadonlyArray<object>} data
 * @param {number} upto - highest index the strategy is allowed to see
 * @returns {object}
 */
function historyView(data, upto) {
  return Object.freeze({
    get length() {
      return upto + 1;
    },
    /**
     * Array-like access with negative-index support (like Array.prototype.at).
     * Any index resolving beyond `upto` (a future bar) yields undefined.
     */
    at(k) {
      const idx = k < 0 ? upto + 1 + k : k;
      if (idx < 0 || idx > upto) return undefined;
      return data[idx];
    },
    /** Absolute-index access; future or invalid indices yield undefined. */
    get(k) {
      if (typeof k !== 'number' || k < 0 || k > upto) return undefined;
      return data[k];
    },
    /** Bounded slice; the end is clamped so future bars can never leak in. */
    slice(start, end) {
      const hi = upto + 1;
      const e = end == null || end > hi ? hi : end;
      return data.slice(start, e);
    },
    /** The most recent n bars up to and including the current bar. */
    tail(n) {
      const start = Math.max(0, upto + 1 - n);
      return data.slice(start, upto + 1);
    },
  });
}

// ---- ORDER INTENT PARSING ----

/**
 * Normalize a strategy return value into a canonical order intent, or null for
 * hold. Helper calls on the context take precedence over the return value.
 * @param {*} ret
 * @returns {object|null}
 */
function parseReturn(ret) {
  if (ret == null) return null;
  if (typeof ret === 'string') {
    if (ret === 'close' || ret === 'exit' || ret === 'flat') return { kind: 'target', qty: 0 };
    return null; // 'hold' and unrecognized strings -> hold
  }
  if (typeof ret !== 'object') return null;
  const action = ret.action || ret.type;
  const size = ret.size != null ? ret.size : ret.quantity;
  switch (action) {
    case 'buy':
      return { kind: 'delta', qty: Math.abs(Number(size) || 0) };
    case 'sell':
    case 'short':
      return { kind: 'delta', qty: -Math.abs(Number(size) || 0) };
    case 'target':
      return { kind: 'target', qty: Number(ret.quantity != null ? ret.quantity : ret.qty) || 0 };
    case 'targetPercent':
    case 'targetPct': {
      const frac = ret.fraction != null ? ret.fraction : (ret.percent != null ? ret.percent : ret.frac);
      return { kind: 'targetPct', frac: Number(frac) || 0 };
    }
    case 'close':
    case 'exit':
    case 'flat':
      return { kind: 'target', qty: 0 };
    case 'hold':
    default:
      return null;
  }
}

/** Collapse no-op intents (zero-share deltas) to null. */
function normalizeIntent(intent) {
  if (!intent) return null;
  if (intent.kind === 'delta' && !(Math.abs(intent.qty) > 0)) return null;
  return intent;
}

// ---- CORE ENGINE ----

/**
 * runBacktest
 * Event-driven, next-bar-open, no-lookahead backtest of a single-symbol series.
 *
 * @param {object} params
 * @param {Array<object>} params.bars - ordered [{ time, open, high, low, close, volume }, ...].
 *        (Multi-symbol maps are a documented future extension; single-symbol is the core.)
 * @param {function} params.strategy - called once per bar as strategy(context). It
 *        emits at most one intended order per bar via context helpers
 *        (buy/sell/short/target/targetPercent/close/hold) or by returning an
 *        action object. The order fills at the NEXT bar's open.
 * @param {number} [params.initialCapital=100000]
 * @param {object} [params.options]
 * @param {number} [params.options.periodsPerYear=252] - annualization factor for Sharpe/CAGR.
 * @param {number} [params.options.riskFreeRate=0] - ANNUAL risk-free rate (de-annualized internally).
 * @param {object} [params.options.cost] - fee-model config: { broker, currency, accountCurrency, side }.
 *        Defaults to Wealthsimple CAD (a frictionless $0 baseline). Set a broker
 *        id (e.g. 'rbc') and currencies for realistic commissions and FX.
 * @param {boolean} [params.options.closeAtEnd=true] - liquidate any open position at the
 *        final bar's close so trades are realized and the round-trip cost is charged.
 * @param {number} [params.options.maxLeverage=1] - buying-power multiple on cash (1 = no leverage).
 * @returns {object} metrics + equityCurve + tradeLog (see bottom of function).
 */
function runBacktest(params) {
  const {
    bars,
    strategy,
    initialCapital = 100000,
    options = {},
  } = params || {};

  if (typeof strategy !== 'function') {
    throw new TypeError('runBacktest: `strategy` must be a function.');
  }
  if (typeof initialCapital !== 'number' || !(initialCapital > 0)) {
    throw new RangeError('runBacktest: `initialCapital` must be a positive number.');
  }

  const periodsPerYear = typeof options.periodsPerYear === 'number' && options.periodsPerYear > 0
    ? options.periodsPerYear
    : 252;
  const riskFreeRate = typeof options.riskFreeRate === 'number' ? options.riskFreeRate : 0;
  const rfPerPeriod = riskFreeRate / periodsPerYear;
  const closeAtEnd = options.closeAtEnd !== false;
  const maxLeverage = typeof options.maxLeverage === 'number' && options.maxLeverage > 0
    ? options.maxLeverage
    : 1;

  const costCfg = Object.assign(
    { broker: 'wealthsimple', currency: 'CAD', accountCurrency: 'CAD', side: 'buy' },
    options.cost || {}
  );

  /**
   * Transaction cost for a single fill, via the fee-model. Zero-size or the
   * explicit 'none'/null broker cost nothing.
   */
  function feeFor(quantity, price) {
    if (!(quantity > 0) || !(price >= 0)) return 0;
    if (costCfg.broker == null || costCfg.broker === 'none') return 0;
    const est = FeeModel.estimateTradeCost({
      broker: costCfg.broker,
      quantity,
      price,
      currency: costCfg.currency,
      accountCurrency: costCfg.accountCurrency,
      side: costCfg.side,
    });
    return est.total;
  }

  const data = normalizeBars(bars);
  const n = data.length;

  // ---- portfolio state ----
  let cash = initialCapital;
  let positionQty = 0; // signed: >0 long, <0 short

  const equityCurve = [];
  const tradeLog = [];
  let inMarketBars = 0;

  // Open round-trip trade accumulator (weighted-average netting model).
  let openTrade = null;

  /**
   * Determine the executable share change for a resolved target, honoring the
   * cash constraint (never spend more cash than available) for longs and a
   * conservative cash-based margin for shorts. Integer shares only.
   */
  function clampTrade(tradeQty, price) {
    if (!(Math.abs(tradeQty) > 0) || !(price > 0)) return 0;
    let q = Math.trunc(tradeQty);
    if (q === 0) return 0;

    if (q > 0) {
      // Buying: cannot exceed cash/price. This is the hard "never overspend"
      // ceiling; the fee correction loop below trims for commissions.
      const maxByCash = Math.floor(cash / price);
      if (maxByCash <= 0) return 0;
      if (q > maxByCash) q = maxByCash;
    } else {
      // Selling/shorting. Reducing a long always adds cash and is unconstrained;
      // opening/extending a short is capped by a conservative 1:1 cash margin.
      const resulting = positionQty + q;
      if (resulting < 0) {
        const maxShortMag = Math.floor((cash * maxLeverage) / price);
        const minResulting = -maxShortMag;
        if (resulting < minResulting) q = minResulting - positionQty;
      }
    }

    // Fee correction: guarantee post-trade cash stays >= 0. Seeded near the
    // analytic ceiling above, so this decrements at most a handful of times.
    let guard = 0;
    while (q !== 0 && guard < 1000000) {
      const fee = feeFor(Math.abs(q), price);
      const cashDelta = q > 0 ? -q * price - fee : Math.abs(q) * price - fee;
      if (cash + cashDelta >= -1e-9) break;
      q = q > 0 ? q - 1 : q + 1;
      guard++;
    }
    return q;
  }

  /**
   * Record a fill into the round-trip trade accumulator, emitting a completed
   * trade to the log whenever the position returns to flat (handling flips).
   */
  function recordFill(qty, price, time, index, fee) {
    let remaining = qty;
    const feePerShare = Math.abs(qty) > 0 ? fee / Math.abs(qty) : 0;

    while (remaining !== 0) {
      if (!openTrade) {
        openTrade = {
          direction: remaining > 0 ? 1 : -1,
          qty: 0,
          entryValue: 0,
          exitValue: 0,
          exitQty: 0,
          commission: 0,
          entryTime: time,
          entryIndex: index,
          exitTime: time,
          exitIndex: index,
        };
      }
      const dir = openTrade.direction;
      if (Math.sign(remaining) === dir) {
        // Increasing the open position.
        const shares = Math.abs(remaining);
        openTrade.qty += shares;
        openTrade.entryValue += shares * price;
        openTrade.commission += shares * feePerShare;
        remaining = 0;
      } else {
        // Reducing / closing the open position.
        const closeShares = Math.min(Math.abs(remaining), openTrade.qty);
        openTrade.exitValue += closeShares * price;
        openTrade.exitQty += closeShares;
        openTrade.commission += closeShares * feePerShare;
        openTrade.qty -= closeShares;
        openTrade.exitTime = time;
        openTrade.exitIndex = index;
        remaining += dir === 1 ? closeShares : -closeShares;

        if (openTrade.qty === 0) {
          const entryAvg = openTrade.entryValue / openTrade.exitQty;
          const exitAvg = openTrade.exitValue / openTrade.exitQty;
          const gross = openTrade.direction * (exitAvg - entryAvg) * openTrade.exitQty;
          const net = gross - openTrade.commission;
          const ems = toMs(openTrade.entryTime);
          const xms = toMs(openTrade.exitTime);
          tradeLog.push({
            side: openTrade.direction > 0 ? 'long' : 'short',
            entryIndex: openTrade.entryIndex,
            entryTime: openTrade.entryTime,
            entryPrice: round2(entryAvg),
            exitIndex: openTrade.exitIndex,
            exitTime: openTrade.exitTime,
            exitPrice: round2(exitAvg),
            quantity: openTrade.exitQty,
            grossPnl: round2(gross),
            commission: round2(openTrade.commission),
            pnl: round2(net),
            returnPct: entryAvg !== 0 ? net / (entryAvg * openTrade.exitQty) : 0,
            holdingBars: openTrade.exitIndex - openTrade.entryIndex,
            holdingPeriodMs: ems != null && xms != null ? xms - ems : null,
          });
          openTrade = null;
          // If `remaining` is still non-zero, the loop opens a fresh trade in
          // the opposite direction (a position flip).
        }
      }
    }
  }

  /**
   * Resolve an intent to a desired absolute position at fillPrice, then execute
   * the (clamped) share change: update cash, position, and the trade log.
   */
  function executeIntent(intent, fillPrice, time, index) {
    if (!intent || !(fillPrice > 0)) return;

    let desired;
    if (intent.kind === 'delta') {
      desired = positionQty + intent.qty;
    } else if (intent.kind === 'target') {
      desired = intent.qty;
    } else if (intent.kind === 'targetPct') {
      const equityNow = cash + positionQty * fillPrice;
      desired = Math.trunc((intent.frac * equityNow) / fillPrice);
    } else {
      return;
    }
    desired = Math.trunc(desired);

    const rawTradeQty = desired - positionQty;
    const tradeQty = clampTrade(rawTradeQty, fillPrice);
    if (tradeQty === 0) return;

    const fee = feeFor(Math.abs(tradeQty), fillPrice);
    const cashDelta = tradeQty > 0
      ? -tradeQty * fillPrice - fee
      : Math.abs(tradeQty) * fillPrice - fee;
    cash += cashDelta;
    positionQty += tradeQty;
    recordFill(tradeQty, fillPrice, time, index, fee);
  }

  // Guard: empty series returns a well-formed zeroed result.
  if (n === 0) {
    return buildResult({
      initialCapital,
      finalEquity: initialCapital,
      equityCurve,
      tradeLog,
      inMarketBars,
      bars: 0,
      periodsPerYear,
      rfPerPeriod,
      years: 0,
      costCfg,
    });
  }

  // ---- main event loop ----
  // pendingOrder was decided on the PREVIOUS bar; it fills at THIS bar's open.
  let pendingOrder = null;

  for (let i = 0; i < n; i++) {
    const bar = data[i];

    // 1. Fill the order decided on the previous bar, at this bar's OPEN.
    if (pendingOrder) {
      executeIntent(pendingOrder, bar.open, bar.time, i);
      pendingOrder = null;
    }

    // 2. Mark to market at this bar's CLOSE and record the equity point.
    if (positionQty !== 0) inMarketBars++;
    const mtm = cash + positionQty * bar.close;
    equityCurve.push({
      index: i,
      time: bar.time,
      price: bar.close,
      cash,
      positionQty,
      equity: mtm,
    });

    // 3. Ask the strategy for the next decision. It sees ONLY bars[0..i].
    let decided = false;
    let intent = null;
    const setIntent = (v) => { decided = true; intent = v; };

    const ctx = {
      index: i,
      time: bar.time,
      bar,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
      history: historyView(data, i),
      cash,
      equity: mtm,
      initialCapital,
      position: {
        quantity: positionQty,
        direction: Math.sign(positionQty),
        avgPrice: openTrade ? openTrade.entryValue / (openTrade.qty || 1) : 0,
        marketValue: positionQty * bar.close,
      },
      // action helpers (last call wins for the bar):
      buy(size) { setIntent({ kind: 'delta', qty: Math.abs(Number(size) || 0) }); },
      sell(size) { setIntent({ kind: 'delta', qty: -Math.abs(Number(size) || 0) }); },
      short(size) { setIntent({ kind: 'delta', qty: -Math.abs(Number(size) || 0) }); },
      target(qty) { setIntent({ kind: 'target', qty: Number(qty) || 0 }); },
      targetPercent(frac) { setIntent({ kind: 'targetPct', frac: Number(frac) || 0 }); },
      close() { setIntent({ kind: 'target', qty: 0 }); },
      hold() { setIntent(null); },
      // indicator helpers (never read beyond the current bar i):
      sma(period, field) { return sma(data, i, period, field); },
      smaAt(idx, period, field) {
        if (typeof idx !== 'number' || idx > i) return null; // no future access
        return sma(data, idx, period, field);
      },
    };

    const ret = strategy(ctx);
    if (!decided) intent = parseReturn(ret);
    pendingOrder = normalizeIntent(intent);
  }

  // ---- terminal liquidation ----
  // Realize any open position at the final bar's close so trades close out and
  // the round-trip cost is charged. This uses the already-observed final close
  // (no future data) and overwrites the last equity point to the realized value.
  if (closeAtEnd && positionQty !== 0) {
    const last = data[n - 1];
    executeIntent({ kind: 'target', qty: 0 }, last.close, last.time, n - 1);
    const point = equityCurve[n - 1];
    point.cash = cash;
    point.positionQty = positionQty;
    point.equity = cash + positionQty * last.close;
  }

  const finalEquity = equityCurve.length
    ? equityCurve[equityCurve.length - 1].equity
    : initialCapital;

  // Time span for CAGR: real timestamps if usable, else the periods model.
  let years;
  const t0 = toMs(data[0].time);
  const tN = toMs(data[n - 1].time);
  if (t0 != null && tN != null && tN > t0) {
    years = (tN - t0) / MS_PER_YEAR;
  } else {
    years = n > 1 ? (n - 1) / periodsPerYear : 0;
  }

  return buildResult({
    initialCapital,
    finalEquity,
    equityCurve,
    tradeLog,
    inMarketBars,
    bars: n,
    periodsPerYear,
    rfPerPeriod,
    years,
    costCfg,
  });
}

/**
 * Assemble the final metrics object from accumulated state. Kept separate so
 * the empty-series and normal paths return an identically shaped result.
 */
function buildResult(s) {
  const {
    initialCapital, finalEquity, equityCurve, tradeLog,
    inMarketBars, bars, periodsPerYear, rfPerPeriod, years, costCfg,
  } = s;

  const equities = equityCurve.map((p) => p.equity);
  const pnls = tradeLog.map((t) => t.pnl);

  const numTrades = tradeLog.length;
  const wins = pnls.filter((p) => p > 0).length;
  const sumPnl = pnls.reduce((a, b) => a + b, 0);

  return {
    initialCapital,
    finalEquity: round2(finalEquity),
    totalReturn: computeTotalReturn(initialCapital, finalEquity),
    CAGR: computeCAGR(initialCapital, finalEquity, years),
    annualizedSharpe: computeSharpe(equities, periodsPerYear, rfPerPeriod),
    maxDrawdown: computeMaxDrawdown(equities),
    winRate: numTrades ? wins / numTrades : 0,
    profitFactor: computeProfitFactor(pnls),
    numTrades,
    avgTradePnl: numTrades ? round2(sumPnl / numTrades) : 0,
    exposure: bars ? inMarketBars / bars : 0,
    periodsPerYear,
    years,
    costModel: { broker: costCfg.broker, currency: costCfg.currency, accountCurrency: costCfg.accountCurrency },
    equityCurve,
    tradeLog,
  };
}

// ---- REFERENCE STRATEGIES ----

/**
 * Buy-and-hold: invest the full account on the first bar (the order fills at the
 * second bar's open), then hold. With closeAtEnd it is liquidated at the final
 * close, so the result reflects one round trip of costs.
 * @param {object} ctx
 * @returns {undefined}
 */
function buyAndHold(ctx) {
  if (ctx.index === 0 && ctx.position.quantity === 0) {
    return ctx.targetPercent(1);
  }
  return ctx.hold();
}

/**
 * Long-only SMA crossover. Goes fully long on a golden cross (fast SMA crossing
 * above slow) and flat on a death cross. Returns hold until both SMAs exist, so
 * insufficient indicator history never trades.
 * @param {number} fast - fast SMA period
 * @param {number} slow - slow SMA period (must exceed fast)
 * @returns {function}
 */
function smaCrossover(fast, slow) {
  if (!(fast > 0) || !(slow > 0) || fast >= slow) {
    throw new RangeError('smaCrossover: require 0 < fast < slow.');
  }
  return function strategy(ctx) {
    const i = ctx.index;
    const fNow = ctx.smaAt(i, fast);
    const sNow = ctx.smaAt(i, slow);
    if (fNow == null || sNow == null) return ctx.hold(); // insufficient history

    const fPrev = ctx.smaAt(i - 1, fast);
    const sPrev = ctx.smaAt(i - 1, slow);
    const prevAvailable = fPrev != null && sPrev != null;

    const crossedUp = fNow > sNow && (!prevAvailable || fPrev <= sPrev);
    const crossedDown = fNow < sNow && (!prevAvailable || fPrev >= sPrev);

    if (crossedUp) return ctx.targetPercent(1); // go fully long
    if (crossedDown) return ctx.close(); // exit to flat (long-only)
    return ctx.hold();
  };
}

// ---- EXPORTS (dual CommonJS / browser) ----

const Backtest = {
  runBacktest,
  strategies: { buyAndHold, smaCrossover },
  // pure helpers, exported for direct hand-verification and reuse:
  computeTotalReturn,
  computeCAGR,
  computeMaxDrawdown,
  computeSharpe,
  computeProfitFactor,
  sma,
  round2,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Backtest;
} else if (typeof window !== 'undefined') {
  window.Backtest = Backtest;
}
