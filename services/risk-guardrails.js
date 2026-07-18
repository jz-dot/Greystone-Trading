/* ============================================================================
   RISK GUARDRAILS + KILL SWITCH ENGINE
   ----------------------------------------------------------------------------
   THIS IS THE MANDATORY SAFETY LAYER for GSP Trading. Every order, whether it
   originates from a human click, a backtest replay, a paper run, or a fully
   autonomous strategy, MUST pass through checkOrder() before it is allowed to
   reach a broker. Nothing routes around this file. The long-term goal of this
   platform is autonomous, live execution; this engine is the thing that makes
   that survivable.

   DESIGN PRINCIPLES:
     1. FAIL CLOSED. Any unknown, missing, malformed, NaN, negative, or
        otherwise unusable input results in NOT ALLOWED plus an explicit
        violation. Silence, ambiguity, or "looks fine" never means "go".
     2. HARD limits, not advisory. checkOrder returns a boolean gate. A single
        breach of any hard limit denies the order.
     3. Report EVERYTHING. checkOrder returns ALL violations it finds, not just
        the first, so an operator sees the full picture in one pass.
     4. PURE + DETERMINISTIC. No network, no Date.now(), no Math.random(). If a
        function needs the current time or current equity, the caller injects
        it. This makes the engine identical in Node and the browser and fully
        unit-testable.
     5. TWO INDEPENDENT STOPS. A manual kill switch (engaged by a human or by an
        automated monitor) AND an automatic circuit breaker / daily-loss halt
        that trips on account state. Either one, once engaged, denies all
        orders until a human explicitly releases it.

   The engine holds no opinion about whether a trade is "good". It only decides
   whether a trade is SURVIVABLE under the configured limits. Alpha lives
   elsewhere; this file is the brake, not the accelerator.
   ============================================================================ */

'use strict';

/* ----------------------------------------------------------------------------
   DEFAULT LIMITS
   Conservative by design. These are the hard ceilings applied when the caller
   does not override them. Percentage fields are whole-number percents
   (20 means 20%, not 0.20). A production deployment can tighten these but
   should think hard before loosening them.
   ---------------------------------------------------------------------------- */
const DEFAULT_LIMITS = {
  // Max dollar notional (qty * price) of any SINGLE order. Caps a single
  // fat-finger or a single bad signal from deploying the whole book at once.
  maxOrderNotional: 10000,

  // Max size of any single position as a percent of total equity. Enforces
  // diversification so one name blowing up cannot take out the account.
  maxPositionPct: 20,

  // Max number of concurrently open positions. Keeps total exposure to a set
  // an operator can actually monitor and prevents a runaway loop from spawning
  // unbounded positions.
  maxConcurrentPositions: 10,

  // Daily loss stop. If today's realized + unrealized loss exceeds this percent
  // of START-OF-DAY equity, trading halts for the day. A classic hard daily
  // loss limit for automated systems: bound how bad a single day can get.
  maxDailyLossPct: 3,

  // Circuit breaker. If equity draws down more than this percent from its PEAK
  // (high-water mark), trading halts. Catches slow multi-day bleeds that a
  // single-day loss limit would never see.
  circuitBreakerDrawdownPct: 10,

  // Max gross leverage (gross exposure / equity). 1.0 = cash only, no margin.
  // Leverage must be a deliberate, explicit opt-in, never a default.
  maxLeverage: 1.0,

  // A strategy must be validated in paper trading before it may send a LIVE
  // order. Prevents an unproven strategy from touching real money.
  requirePaperConfirmedBeforeLive: true,
};

/* ----------------------------------------------------------------------------
   Severity levels used on returned violations.
     'critical' -> account-wide halt condition or a fail-closed rejection
                   (kill switch, circuit breaker, daily loss, malformed input,
                   unvalidated live order).
     'error'    -> a per-order hard limit breach (notional, position %,
                   concurrent count, buying power, leverage).
   Every violation, regardless of severity, denies the order.
   ---------------------------------------------------------------------------- */
const SEVERITY = { CRITICAL: 'critical', ERROR: 'error' };

/* ---------------------------- small pure helpers -------------------------- */

function isPlainObject(x) {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

function isFiniteNumber(x) {
  return typeof x === 'number' && Number.isFinite(x);
}

function isPositiveFinite(x) {
  return isFiniteNumber(x) && x > 0;
}

function isNonNegativeFinite(x) {
  return isFiniteNumber(x) && x >= 0;
}

function isNonEmptyString(x) {
  return typeof x === 'string' && x.length > 0;
}

// Merge caller-supplied limits over the conservative defaults. A missing or
// non-object limits argument falls back entirely to DEFAULT_LIMITS. Individual
// unspecified fields inherit their default.
function resolveLimits(limits) {
  if (!isPlainObject(limits)) return Object.assign({}, DEFAULT_LIMITS);
  return Object.assign({}, DEFAULT_LIMITS, limits);
}

// Signed market value of a position (negative for shorts). Prefers an explicit
// signed marketValue; falls back to qty * price. Unusable -> 0.
function positionValue(pos) {
  if (!isPlainObject(pos)) return 0;
  if (isFiniteNumber(pos.marketValue)) return pos.marketValue;
  if (isFiniteNumber(pos.qty) && isFiniteNumber(pos.price)) return pos.qty * pos.price;
  return 0;
}

// The price the order will transact at, for notional purposes. Accepts either
// `price` or a `limit_price` fallback so it fits the broker-router order shape.
function resolveOrderPrice(order) {
  if (!isPlainObject(order)) return undefined;
  if (isFiniteNumber(order.price)) return order.price;
  if (isFiniteNumber(order.limit_price)) return order.limit_price;
  return order.price; // return whatever was there (possibly bad) so validation flags it
}

/* --------------------------- risk state factory --------------------------- */

/**
 * Create fresh, mutable risk state. This object is threaded through
 * updateRiskState / checkOrder and mutated in place by the kill-switch and
 * day-boundary helpers.
 *
 *   peakEquity        - high-water mark of equity, used for the circuit breaker.
 *   startOfDayEquity  - baseline for the daily loss limit; reset by startNewDay.
 *   halted            - true when the kill switch is engaged (manual OR auto).
 *   haltReason        - human-readable reason the halt was engaged.
 *   dailyRealizedPnl  - running realized PnL for the day (informational; the
 *                       authoritative daily-loss test uses equity vs
 *                       startOfDayEquity so it captures unrealized loss too).
 */
function createRiskState() {
  return {
    peakEquity: 0,
    startOfDayEquity: 0,
    halted: false,
    haltReason: null,
    dailyRealizedPnl: 0,
  };
}

/* ------------------------------ kill switch ------------------------------- */

// Engage the kill switch. Once engaged, checkOrder denies EVERYTHING until a
// human explicitly calls releaseKillSwitch. Called both by operators and
// automatically by updateRiskState.
function engageKillSwitch(riskState, reason) {
  if (!isPlainObject(riskState)) return riskState;
  riskState.halted = true;
  riskState.haltReason = isNonEmptyString(reason) ? reason : 'Kill switch engaged';
  return riskState;
}

// Release the kill switch. This is a deliberate human action. It is never done
// automatically (startNewDay does NOT clear a halt); a person must decide the
// account is safe to trade again.
function releaseKillSwitch(riskState) {
  if (!isPlainObject(riskState)) return riskState;
  riskState.halted = false;
  riskState.haltReason = null;
  return riskState;
}

// Is trading halted? Fail closed: a missing or malformed riskState is treated
// as halted (safer to refuse than to trade blind).
function isHalted(riskState) {
  if (!isPlainObject(riskState)) return true;
  return riskState.halted === true;
}

/* ---------------------- state update / auto-halt logic -------------------- */

/**
 * Recompute risk state from the latest account snapshot and auto-engage the
 * kill switch if the circuit breaker (drawdown from peak) or the daily loss
 * limit is breached.
 *
 * Fail closed: if equity is missing/invalid we cannot verify safety, so we
 * engage the kill switch rather than assume all is well.
 */
function updateRiskState(riskState, accountState, limits) {
  const L = resolveLimits(limits);
  if (!isPlainObject(riskState)) return riskState;

  const equity = isPlainObject(accountState) ? accountState.equity : undefined;
  if (!isPositiveFinite(equity)) {
    return engageKillSwitch(
      riskState,
      'Invalid or missing equity in risk update; failing closed.'
    );
  }

  // Update the high-water mark BEFORE measuring drawdown, so a fresh all-time
  // high registers zero drawdown.
  if (!isPositiveFinite(riskState.peakEquity) || equity > riskState.peakEquity) {
    riskState.peakEquity = equity;
  }
  // Initialize the daily baseline the first time we see equity.
  if (!isPositiveFinite(riskState.startOfDayEquity)) {
    riskState.startOfDayEquity = equity;
  }

  // Circuit breaker: drawdown from peak.
  const drawdownPct =
    riskState.peakEquity > 0
      ? ((riskState.peakEquity - equity) / riskState.peakEquity) * 100
      : 0;
  if (drawdownPct > L.circuitBreakerDrawdownPct) {
    engageKillSwitch(
      riskState,
      'Circuit breaker: drawdown ' +
        drawdownPct.toFixed(2) +
        '% exceeds ' +
        L.circuitBreakerDrawdownPct +
        '% from peak equity.'
    );
  }

  // Daily loss limit: current equity vs start-of-day equity captures realized
  // AND unrealized loss.
  const dailyLossPct =
    riskState.startOfDayEquity > 0
      ? ((riskState.startOfDayEquity - equity) / riskState.startOfDayEquity) * 100
      : 0;
  if (dailyLossPct > L.maxDailyLossPct) {
    engageKillSwitch(
      riskState,
      'Daily loss ' +
        dailyLossPct.toFixed(2) +
        '% exceeds ' +
        L.maxDailyLossPct +
        '% of start-of-day equity.'
    );
  }

  return riskState;
}

/**
 * Reset the daily baseline at the start of a new trading day. Sets
 * startOfDayEquity to the supplied equity, advances the peak if this is a new
 * high, and clears the day's realized PnL. It does NOT release the kill switch:
 * if the account was halted, a human must decide to release it.
 */
function startNewDay(riskState, equity) {
  if (!isPlainObject(riskState)) return riskState;
  if (isPositiveFinite(equity)) {
    riskState.startOfDayEquity = equity;
    if (!isPositiveFinite(riskState.peakEquity) || equity > riskState.peakEquity) {
      riskState.peakEquity = equity;
    }
  }
  riskState.dailyRealizedPnl = 0;
  return riskState;
}

/* ------------------------------- checkOrder ------------------------------- */

/**
 * The gate. Decide whether an order is allowed under the hard limits and the
 * current halt state.
 *
 * @param {object} order        - { symbol, qty, price|limit_price, side, mode,
 *                                  paperConfirmed }. qty and price must be
 *                                  positive finite numbers; side is 'buy' or
 *                                  'sell'; mode 'live' or 'paper'.
 * @param {object} accountState - { equity, buyingPower, positions:[...],
 *                                  paperConfirmed }.
 * @param {object} limits       - partial or full limits; merged over defaults.
 * @param {object} riskState    - from createRiskState(), carrying halt state
 *                                  and equity baselines.
 * @returns {{ allowed: boolean, violations: Array<{rule,message,severity}> }}
 *          allowed is true ONLY when violations is empty.
 */
function checkOrder(order, accountState, limits, riskState) {
  const L = resolveLimits(limits);
  const violations = [];
  const deny = (rule, message, severity) =>
    violations.push({ rule, message, severity: severity || SEVERITY.ERROR });

  /* ---- 1. Kill switch (independent of order validity, highest priority) --- */
  if (isHalted(riskState)) {
    const reason =
      isPlainObject(riskState) && isNonEmptyString(riskState.haltReason)
        ? riskState.haltReason
        : 'no valid risk state supplied';
    deny(
      'kill_switch',
      'Kill switch engaged (' + reason + '). All orders denied.',
      SEVERITY.CRITICAL
    );
  }

  /* ---- 2. Structural / fail-closed input validation ---------------------- */
  const orderIsObject = isPlainObject(order);
  const acctIsObject = isPlainObject(accountState);

  if (!orderIsObject) {
    deny('malformed_input', 'Order is missing or not an object.', SEVERITY.CRITICAL);
  }
  if (!acctIsObject) {
    deny('malformed_input', 'Account state is missing or not an object.', SEVERITY.CRITICAL);
  }

  const qty = orderIsObject ? order.qty : undefined;
  const price = orderIsObject ? resolveOrderPrice(order) : undefined;
  const side = orderIsObject ? order.side : undefined;
  const symbol = orderIsObject ? order.symbol : undefined;
  const equity = acctIsObject ? accountState.equity : undefined;

  if (orderIsObject) {
    if (!isNonEmptyString(symbol)) {
      deny('malformed_input', 'Order symbol is missing or not a string.', SEVERITY.CRITICAL);
    }
    if (!isPositiveFinite(qty)) {
      deny('malformed_input', 'Order qty must be a positive finite number.', SEVERITY.CRITICAL);
    }
    if (!isPositiveFinite(price)) {
      deny('malformed_input', 'Order price must be a positive finite number.', SEVERITY.CRITICAL);
    }
    if (side !== 'buy' && side !== 'sell') {
      deny('malformed_input', "Order side must be 'buy' or 'sell'.", SEVERITY.CRITICAL);
    }
  }
  if (acctIsObject && !isPositiveFinite(equity)) {
    deny('malformed_input', 'Account equity must be a positive finite number.', SEVERITY.CRITICAL);
  }

  // What can we actually compute?
  const orderNumbersOk = isPositiveFinite(qty) && isPositiveFinite(price);
  const sideOk = side === 'buy' || side === 'sell';
  const equityOk = isPositiveFinite(equity);
  const notional = orderNumbersOk ? qty * price : NaN;

  /* ---- 3. State-based halts (defense in depth vs updateRiskState) -------- */
  // Even if updateRiskState was not called, checkOrder independently refuses to
  // trade an account that is already past its drawdown or daily-loss limit.
  if (isPlainObject(riskState) && equityOk) {
    if (isPositiveFinite(riskState.peakEquity)) {
      const drawdownPct = ((riskState.peakEquity - equity) / riskState.peakEquity) * 100;
      if (drawdownPct > L.circuitBreakerDrawdownPct) {
        deny(
          'circuit_breaker',
          'Circuit breaker: drawdown ' +
            drawdownPct.toFixed(2) +
            '% exceeds ' +
            L.circuitBreakerDrawdownPct +
            '% from peak equity.',
          SEVERITY.CRITICAL
        );
      }
    }
    if (isPositiveFinite(riskState.startOfDayEquity)) {
      const dailyLossPct =
        ((riskState.startOfDayEquity - equity) / riskState.startOfDayEquity) * 100;
      if (dailyLossPct > L.maxDailyLossPct) {
        deny(
          'daily_loss_limit',
          'Daily loss ' +
            dailyLossPct.toFixed(2) +
            '% exceeds ' +
            L.maxDailyLossPct +
            '% of start-of-day equity.',
          SEVERITY.CRITICAL
        );
      }
    }
  }

  /* ---- 4. Portfolio math (needs positions) ------------------------------- */
  const positions =
    acctIsObject && Array.isArray(accountState.positions) ? accountState.positions : [];
  const openSymbols = new Set();
  let grossExposure = 0;
  let existingSignedForSymbol = 0;
  for (let i = 0; i < positions.length; i++) {
    const p = positions[i];
    const v = positionValue(p);
    grossExposure += Math.abs(v);
    if (v !== 0 && isPlainObject(p) && isNonEmptyString(p.symbol)) {
      openSymbols.add(p.symbol);
      if (p.symbol === symbol) existingSignedForSymbol += v;
    }
  }

  /* ---- 5. Order notional cap --------------------------------------------- */
  if (orderNumbersOk && notional > L.maxOrderNotional) {
    deny(
      'order_notional',
      'Order notional $' +
        notional.toFixed(2) +
        ' exceeds max $' +
        L.maxOrderNotional +
        '.',
      SEVERITY.ERROR
    );
  }

  /* ---- 6. Resulting position as % of equity ------------------------------ */
  if (orderNumbersOk && sideOk && equityOk) {
    const signedOrderNotional = (side === 'buy' ? 1 : -1) * notional;
    const resultingPositionValue = Math.abs(existingSignedForSymbol + signedOrderNotional);
    const resultingPct = (resultingPositionValue / equity) * 100;
    if (resultingPct > L.maxPositionPct) {
      deny(
        'position_pct',
        'Resulting position ' +
          resultingPct.toFixed(2) +
          '% of equity exceeds max ' +
          L.maxPositionPct +
          '%.',
        SEVERITY.ERROR
      );
    }
  }

  /* ---- 7. Concurrent position count -------------------------------------- */
  if (isNonEmptyString(symbol)) {
    const isNewSymbol = !openSymbols.has(symbol);
    const resultingCount = openSymbols.size + (isNewSymbol ? 1 : 0);
    if (resultingCount > L.maxConcurrentPositions) {
      deny(
        'max_concurrent_positions',
        'Resulting ' +
          resultingCount +
          ' open positions exceeds max ' +
          L.maxConcurrentPositions +
          '.',
        SEVERITY.ERROR
      );
    }
  }

  /* ---- 8. Buying power (buys consume it) --------------------------------- */
  if (sideOk && side === 'buy' && orderNumbersOk) {
    const buyingPower = acctIsObject ? accountState.buyingPower : undefined;
    if (!isNonNegativeFinite(buyingPower)) {
      // Cannot verify funds -> fail closed.
      deny(
        'malformed_input',
        'Buying power is missing or invalid for a buy order; failing closed.',
        SEVERITY.CRITICAL
      );
    } else if (notional > buyingPower) {
      deny(
        'buying_power',
        'Order notional $' +
          notional.toFixed(2) +
          ' exceeds available buying power $' +
          buyingPower.toFixed(2) +
          '.',
        SEVERITY.ERROR
      );
    }
  }

  /* ---- 9. Gross leverage cap --------------------------------------------- */
  if (orderNumbersOk && equityOk) {
    const resultingGross = grossExposure + notional; // conservative: add the new notional
    const leverage = resultingGross / equity;
    if (leverage > L.maxLeverage) {
      deny(
        'leverage',
        'Resulting leverage ' +
          leverage.toFixed(2) +
          'x exceeds max ' +
          L.maxLeverage +
          'x.',
        SEVERITY.ERROR
      );
    }
  }

  /* ---- 10. Live order requires paper validation -------------------------- */
  if (orderIsObject && L.requirePaperConfirmedBeforeLive && order.mode === 'live') {
    const paperConfirmed =
      order.paperConfirmed === true || (acctIsObject && accountState.paperConfirmed === true);
    if (!paperConfirmed) {
      deny(
        'paper_confirmation',
        'Live order rejected: strategy has not been paper-validated (paperConfirmed !== true).',
        SEVERITY.CRITICAL
      );
    }
  }

  return { allowed: violations.length === 0, violations };
}

/* ------------------------------- exports ---------------------------------- */

const RiskGuardrails = {
  DEFAULT_LIMITS,
  SEVERITY,
  createRiskState,
  engageKillSwitch,
  releaseKillSwitch,
  isHalted,
  updateRiskState,
  startNewDay,
  checkOrder,
  // helpers exported for testing / reuse
  resolveLimits,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = RiskGuardrails;
} else if (typeof window !== 'undefined') {
  window.RiskGuardrails = RiskGuardrails;
}
