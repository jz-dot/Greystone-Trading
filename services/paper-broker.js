/* ============================================
   PAPER-TRADING (SIMULATED EXECUTION) BROKER
   In-memory, fake-money execution against REAL prices.

   WHAT THIS IS
   The safe default execution path for GSP Trading. Users and strategies
   trade simulated money against live quotes before anything touches a real
   brokerage account. This module deliberately MIRRORS the real broker
   adapter surface (placeOrder / getPositions / getOrders / getAccount /
   cancelOrder / reset) so a later wave can route paper AND live orders
   through the same code path and the same risk layer.

   PURITY / TIME
   The fill + position math is pure: it is handed a quote and a timestamp and
   never calls Date.now() itself. server.js stamps each order with the real
   time and injects the real Yahoo quote function. The only place a wall
   clock is read is a thin default at the manager boundary (nowFn), used only
   when the caller does not supply a timestamp.

   SAFETY (CANONICAL RISK LAYER, NOW WIRED IN)
   Every order routes through services/risk-guardrails.checkOrder() before it
   can fill. placeOrder builds a per-session accountState (equity, buyingPower,
   positions marked to market) and evaluates the order against that session's
   hard limits and kill-switch / auto-halt risk state. The old interim inline
   checks (a global halt flag and a single notional cap) have been retired in
   favour of this engine. Each session carries its own riskState + limits (see
   _freshAccount); halt()/resume() drive the kill switch and getRisk() reports
   the posture. This is the exact pattern live execution will reuse.

   MODELING SIMPLIFICATIONS (documented so nobody mistakes this for a matching
   engine):
   1. NO BID/ASK SPREAD. The injected quote exposes a single last price. That
      last stands in for both bid and ask. Market orders fill at last with no
      slippage. A marketable buy limit (limit >= last) and a marketable sell
      limit (limit <= last) fill at last (i.e. at or better than the limit).
   2. WORKING ORDERS ARE INERT. A non-marketable limit is recorded with status
      'working' and simply sits: there is no background matching loop, so it
      never auto-fills and reserves no cash. A future wave should re-evaluate
      working orders on each quote refresh.
   3. NO CURRENCY CONVERSION OF PRINCIPAL. The account base currency is CAD but
      the trade principal (qty * price) is booked into the cash balance at face
      value even for a USD security. On top of that, the fee model's costs,
      INCLUDING its FX line for cross-currency trades, are deducted. This
      mirrors the fee model's own simplification (everything in trade currency;
      FX is the material number). A later wave should pull a real FX rate to
      convert cross-currency principal.
   4. NO MARGIN MODEL. buyingPower == cash (1:1). Shorting is allowed and
      brings in proceeds, but margin requirements and borrow costs are not
      modeled; the max-notional cap is the only interim brake on short size.
   5. AVERAGE COST is a simple share-weighted average of fill prices and does
      NOT fold in commissions (fees flow through cash separately). Reported
      realized P&L is therefore gross of fees; fees are visible in the cash
      balance and in each order's cost breakdown. (For Canadian ACB / tax-basis
      accounting with commissions folded in and superficial-loss handling, see
      services/acb.js; that is a separate, tax-grade calculation.)
   ============================================ */

const FeeModel = require('./fee-model');
// CANONICAL hard risk layer. Every order routes through checkOrder() before it
// can fill; each session carries its own riskState (kill switch + auto-halt
// baselines) and limits derived from its starting equity.
const RiskGuardrails = require('./risk-guardrails');

// ---- Defaults (all overridable via the factory config) ----
const DEFAULT_INITIAL_CASH = 100000; // fake dollars
const DEFAULT_BASE_CURRENCY = 'CAD';
// Fee model broker used to simulate transaction costs. Wealthsimple is
// commission-free with a 1.5% FX spread, which cleanly surfaces the FX line
// (the whole point of the platform) on USD trades from a CAD account.
const DEFAULT_FEE_BROKER = 'wealthsimple';
// Fraction of a session's STARTING equity used as the canonical single-order
// notional ceiling. 0.30 means a $100,000 paper account caps any single order
// at $30,000 (so ordinary trades pass, fat-fingers are blocked). Every other
// hard limit (position %, daily-loss %, circuit-breaker %, concurrent count,
// leverage) keeps the conservative risk-guardrails DEFAULT_LIMITS value.
const DEFAULT_ORDER_NOTIONAL_PCT = 0.30;
const DEFAULT_SESSION = '__default__';

// Snap money to cents; kill negative zero.
function round2(n) {
  const r = Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  return r === 0 ? 0 : r;
}

function isPositiveFiniteNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0;
}

function isPlainObject(x) {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

/**
 * Derive a session's canonical hard limits from its starting equity.
 * Starts from risk-guardrails DEFAULT_LIMITS, sizes maxOrderNotional to a
 * percent of starting equity, then applies any caller overrides (deployment
 * defaults and/or a per-session reset). Only known, well-typed fields are
 * honored; anything else is ignored (fail safe, never widen blindly).
 */
function deriveSessionLimits(initialCash, orderNotionalPct, overrides) {
  const cash = isPositiveFiniteNumber(initialCash) ? Number(initialCash) : DEFAULT_INITIAL_CASH;
  const pct = isPositiveFiniteNumber(orderNotionalPct) ? Number(orderNotionalPct) : DEFAULT_ORDER_NOTIONAL_PCT;
  const limits = Object.assign({}, RiskGuardrails.DEFAULT_LIMITS, {
    maxOrderNotional: round2(cash * pct),
  });
  if (isPlainObject(overrides)) {
    const numericKeys = [
      'maxOrderNotional', 'maxPositionPct', 'maxConcurrentPositions',
      'maxDailyLossPct', 'circuitBreakerDrawdownPct', 'maxLeverage',
    ];
    for (let i = 0; i < numericKeys.length; i++) {
      const k = numericKeys[i];
      if (isPositiveFiniteNumber(overrides[k])) limits[k] = Number(overrides[k]);
    }
    if (typeof overrides.requirePaperConfirmedBeforeLive === 'boolean') {
      limits.requirePaperConfirmedBeforeLive = overrides.requirePaperConfirmedBeforeLive;
    }
  }
  return limits;
}

/**
 * Apply a fill to a position and return the new position plus realized P&L.
 * PURE: no I/O, no clock. qty is always a positive share count; direction is
 * carried by `side`. A position is { qty, avgCost } where qty > 0 is long,
 * qty < 0 is short, and avgCost is the average entry PRICE (always positive).
 *
 * Long/short transitions are handled: a sell larger than a long flips to short
 * (and vice versa), realizing P&L on the closed portion and opening the
 * remainder at the fill price.
 *
 * @returns {{ position: {qty:number, avgCost:number}, realized:number }}
 */
function applyFill(prev, side, qty, fillPrice) {
  let posQty = prev ? prev.qty : 0;
  let avgCost = prev ? prev.avgCost : 0;
  const signed = side === 'buy' ? qty : -qty;
  let realized = 0;

  if (posQty === 0 || (posQty > 0 && signed > 0) || (posQty < 0 && signed < 0)) {
    // Opening or increasing in the same direction: share-weighted average cost.
    const newQty = posQty + signed;
    const totalCost = Math.abs(posQty) * avgCost + Math.abs(signed) * fillPrice;
    avgCost = Math.abs(newQty) > 0 ? totalCost / Math.abs(newQty) : 0;
    posQty = newQty;
  } else {
    // Reducing, closing, or flipping the existing position.
    const closingQty = Math.min(Math.abs(signed), Math.abs(posQty));
    if (posQty > 0) {
      // Closing part/all of a long by selling.
      realized += (fillPrice - avgCost) * closingQty;
    } else {
      // Covering part/all of a short by buying.
      realized += (avgCost - fillPrice) * closingQty;
    }
    const newQty = posQty + signed;
    if (newQty === 0) {
      avgCost = 0;
    } else if ((posQty > 0) !== (newQty > 0)) {
      // Flipped through zero: the remainder opens a fresh position at fill.
      avgCost = fillPrice;
    }
    // else: still same side, avgCost unchanged on a reduce.
    posQty = newQty;
  }

  return { position: { qty: posQty, avgCost }, realized };
}

/**
 * PaperBroker: an in-memory multi-account simulated broker. Accounts are keyed
 * by a session id so guest / preview / multiple strategies each get an
 * isolated fake book without any auth.
 */
class PaperBroker {
  /**
   * @param {object} opts
   * @param {function} opts.quoteFn        - async (symbol) => { price, currency, ... }. REQUIRED. Real Yahoo quotes injected by server.js.
   * @param {number}   [opts.initialCash]  - starting cash per account (default 100000)
   * @param {string}   [opts.baseCurrency] - account base currency (default 'CAD')
   * @param {string}   [opts.feeBrokerId]  - fee-model broker id for cost sim (default 'wealthsimple')
   * @param {number}   [opts.orderNotionalPct] - single-order notional ceiling as a fraction of a session's starting equity (default 0.30)
   * @param {object}   [opts.limits]       - deployment-wide partial hard-limit overrides applied to every new session
   * @param {object}   [opts.feeModel]     - fee model override (default services/fee-model)
   * @param {function} [opts.nowFn]        - clock for the default timestamp (default Date.now)
   */
  constructor(opts) {
    opts = opts || {};
    if (typeof opts.quoteFn !== 'function') {
      throw new Error('PaperBroker requires a quoteFn (async symbol -> quote).');
    }
    this.quoteFn = opts.quoteFn;
    this.feeModel = opts.feeModel || FeeModel;
    this.initialCash = typeof opts.initialCash === 'number' ? opts.initialCash : DEFAULT_INITIAL_CASH;
    this.baseCurrency = opts.baseCurrency || DEFAULT_BASE_CURRENCY;
    this.feeBrokerId = opts.feeBrokerId || DEFAULT_FEE_BROKER;
    // Fraction of a session's starting equity used as the canonical single-order
    // notional ceiling (see DEFAULT_ORDER_NOTIONAL_PCT).
    this.orderNotionalPct = isPositiveFiniteNumber(opts.orderNotionalPct)
      ? Number(opts.orderNotionalPct)
      : DEFAULT_ORDER_NOTIONAL_PCT;
    // Optional deployment-wide partial hard-limit overrides applied to EVERY new
    // session. A per-session reset can override further.
    this.defaultLimitOverrides = isPlainObject(opts.limits) ? opts.limits : null;
    this.nowFn = typeof opts.nowFn === 'function' ? opts.nowFn : function () { return Date.now(); };

    // sessionId -> account (each carries its own canonical riskState + limits).
    this.accounts = new Map();
    // Monotonic order id counter (shared across sessions; ids are unique).
    this._orderSeq = 0;
  }

  // ---- Account lifecycle ----

  _freshAccount(sessionId, initialCash, limitOverrides) {
    const cash = typeof initialCash === 'number' ? initialCash : this.initialCash;
    // Merge deployment-wide overrides under any per-session (reset) overrides.
    const overrides = Object.assign(
      {},
      isPlainObject(this.defaultLimitOverrides) ? this.defaultLimitOverrides : {},
      isPlainObject(limitOverrides) ? limitOverrides : {}
    );
    const riskState = RiskGuardrails.createRiskState();
    // Seed the daily baseline and high-water mark at the starting equity so
    // drawdown / daily-loss are meaningful from the very first order.
    RiskGuardrails.startNewDay(riskState, cash);
    return {
      sessionId: sessionId,
      currency: this.baseCurrency,
      initialCash: cash,
      cash: cash,
      realizedPnl: 0,
      feesPaid: 0,
      positions: new Map(), // symbol -> { qty, avgCost }
      orders: [],           // full history (filled / working / rejected / canceled)
      // ---- canonical risk layer, per session ----
      limits: deriveSessionLimits(cash, this.orderNotionalPct, overrides),
      riskState: riskState,
      lastViolations: [],   // violations from the most recent checkOrder (for /risk)
      lastActivityDay: null, // UTC date string of last activity, for the day boundary
    };
  }

  // ---- Durability (serverless hosts recycle processes) ----
  // Plain-JSON snapshot of every session (positions Map flattened) and its
  // inverse. Restoring preserves risk state, kill switches, and order history.
  snapshot() {
    const sessions = {};
    this.accounts.forEach((acct, id) => {
      sessions[id] = Object.assign({}, acct, { positions: Array.from(acct.positions.entries()) });
    });
    return { orderSeq: this._orderSeq, sessions: sessions };
  }

  restore(data) {
    if (!data || typeof data !== 'object' || !data.sessions) return 0;
    if (typeof data.orderSeq === 'number' && data.orderSeq > this._orderSeq) this._orderSeq = data.orderSeq;
    let n = 0;
    Object.keys(data.sessions).forEach(id => {
      const s = data.sessions[id];
      if (!s || typeof s !== 'object') return;
      const acct = Object.assign({}, s, { positions: new Map(Array.isArray(s.positions) ? s.positions : []) });
      this.accounts.set(id, acct);
      n++;
    });
    return n;
  }

  // Roll the daily-loss baseline forward when the calendar day advances. Does
  // NOT release a kill switch (a human must do that deliberately).
  _maybeStartNewDay(account, equity, timestamp) {
    let day = null;
    try {
      day = new Date(timestamp || this.nowFn()).toISOString().slice(0, 10);
    } catch (e) {
      day = null;
    }
    if (day && account.lastActivityDay && account.lastActivityDay !== day) {
      RiskGuardrails.startNewDay(account.riskState, equity);
    }
    if (day) account.lastActivityDay = day;
  }

  _account(sessionId) {
    const id = sessionId || DEFAULT_SESSION;
    if (!this.accounts.has(id)) {
      this.accounts.set(id, this._freshAccount(id));
    }
    return this.accounts.get(id);
  }

  _nextOrderId() {
    this._orderSeq += 1;
    return 'pap_' + this._orderSeq.toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  /**
   * Reset (or create) a session account to a fresh book.
   * @returns {{ ok:true, account: object }}
   */
  async reset(sessionId, options) {
    options = options || {};
    const id = sessionId || DEFAULT_SESSION;
    const initialCash = isPositiveFiniteNumber(options.initialCash)
      ? Number(options.initialCash)
      : this.initialCash;
    // Optional per-session hard-limit overrides (e.g. tighten maxOrderNotional
    // or maxPositionPct). Only known numeric fields are honored.
    const limitOverrides = isPlainObject(options.limits) ? options.limits : null;
    this.accounts.set(id, this._freshAccount(id, initialCash, limitOverrides));
    const account = await this.getAccount(id);
    return { ok: true, account };
  }

  // ---- Order placement ----

  /**
   * Place a simulated order. Mirrors the real adapter shape.
   * @param {object} order - { symbol, side:'buy'|'sell', qty, type:'market'|'limit', limitPrice? }
   * @param {object} [ctx] - { sessionId, timestamp } injected by server.js
   * @returns {Promise<{orderId, status, fillPrice, cost, message, account}>}
   */
  async placeOrder(order, ctx) {
    order = order || {};
    ctx = ctx || {};
    const sessionId = ctx.sessionId || order.sessionId || DEFAULT_SESSION;
    const timestamp = ctx.timestamp || order.timestamp || this.nowFn();
    const account = this._account(sessionId);

    const symbol = String(order.symbol || '').trim().toUpperCase();
    const side = String(order.side || '').trim().toLowerCase();
    const type = String(order.type || 'market').trim().toLowerCase();
    const qty = Number(order.qty);
    const hasLimit = order.limitPrice !== undefined && order.limitPrice !== null && String(order.limitPrice).trim() !== '';
    const limitPrice = hasLimit ? Number(order.limitPrice) : null;

    const reject = (message, violations) => this._record(account, {
      orderId: this._nextOrderId(), sessionId, symbol, side, qty: Number.isFinite(qty) ? qty : null,
      type, limitPrice, status: 'rejected', fillPrice: null,
      cost: { commission: 0, fxCost: 0, total: 0 }, currency: account.currency,
      createdAt: timestamp, message,
      violations: Array.isArray(violations) && violations.length ? violations : undefined,
    });

    // ---- Input validation (clean rejects; server maps to 400) ----
    if (!symbol) return reject('Missing symbol.');
    if (side !== 'buy' && side !== 'sell') return reject("Side must be 'buy' or 'sell'.");
    if (type !== 'market' && type !== 'limit') return reject("Type must be 'market' or 'limit'.");
    if (!isPositiveFiniteNumber(qty)) return reject('Quantity must be a positive number.');
    if (type === 'limit' && !isPositiveFiniteNumber(limitPrice)) {
      return reject('A limit order requires a positive limitPrice.');
    }

    // ---- Live quote (unknown symbol -> clean reject) ----
    // Fetched first: the canonical risk gate needs a real transaction price to
    // compute notional, position %, buying power and leverage.
    let quote;
    try {
      quote = await this.quoteFn(symbol);
    } catch (e) {
      return reject('Could not fetch a quote for ' + symbol + '.');
    }
    const last = quote ? Number(quote.price) : NaN;
    if (!isPositiveFiniteNumber(last)) {
      return reject('Unknown symbol or no market price available for ' + symbol + '.');
    }
    const currency = (quote && quote.currency) || account.currency;

    // Reference (transaction) price for risk checks: intended limit for a limit
    // order, else the live last. notional is retained below for the fill math.
    const refPrice = type === 'limit' ? limitPrice : last;
    const notional = qty * refPrice;

    // ---- CANONICAL RISK GATE (services/risk-guardrails.checkOrder) ----------
    // Every paper order routes through the hard risk layer before it can fill.
    // Build a per-session accountState (equity, buyingPower, positions marked to
    // market) and evaluate the order against this session's hard limits and its
    // kill-switch / auto-halt risk state. getAccount() also refreshes the risk
    // state (day boundary + circuit breaker / daily-loss auto-halt) from the
    // freshly marked snapshot, so a breach engages the kill switch before this
    // order is even judged. Nothing routes around this gate.
    const accountState = await this.getAccount(sessionId);
    const check = RiskGuardrails.checkOrder(
      { symbol, side, qty, price: refPrice, mode: 'paper' },
      accountState,
      account.limits,
      account.riskState
    );
    account.lastViolations = check.violations;
    if (!check.allowed) {
      const summary = 'Order rejected by risk guardrails: ' +
        check.violations.map((v) => v.message).join(' ');
      return reject(summary, check.violations);
    }

    // ---- Marketability ----
    // Market: fills at last. Limit: marketable buy (limit >= last) / sell
    // (limit <= last) fills at last; otherwise it rests as a working order.
    let fillPrice = null;
    if (type === 'market') {
      fillPrice = last;
    } else if (side === 'buy' && limitPrice >= last) {
      fillPrice = last;
    } else if (side === 'sell' && limitPrice <= last) {
      fillPrice = last;
    }

    if (fillPrice === null) {
      // Non-marketable limit: rests, inert (see simplification #2).
      return this._record(account, {
        orderId: this._nextOrderId(), sessionId, symbol, side, qty, type, limitPrice,
        status: 'working', fillPrice: null,
        cost: { commission: 0, fxCost: 0, total: 0 }, currency,
        createdAt: timestamp,
        message: 'Limit order resting (not marketable at ' + round2(last) + ').',
      });
    }

    // ---- Transaction cost via the fee model ----
    const est = this.feeModel.estimateTradeCost({
      broker: this.feeBrokerId,
      side,
      quantity: qty,
      price: fillPrice,
      currency,
      accountCurrency: account.currency,
      isOption: false,
    });
    const cost = { commission: round2(est.commission), fxCost: round2(est.fxCost), total: round2(est.total) };

    const principal = qty * fillPrice;

    // ---- Buying-power check (buys deduct principal + cost from cash) ----
    if (side === 'buy') {
      const needed = principal + cost.total;
      if (needed > account.cash + 1e-9) {
        return reject('Insufficient buying power: need ' + round2(needed) + ' but cash is ' + round2(account.cash) + '.');
      }
    }

    // ---- Apply the fill: position, realized P&L, cash ----
    const prevPos = account.positions.get(symbol) || null;
    const { position, realized } = applyFill(prevPos, side, qty, fillPrice);

    if (side === 'buy') {
      account.cash -= principal;      // pay for shares (also covers buy-to-cover)
    } else {
      account.cash += principal;      // receive proceeds (also opens shorts)
    }
    account.cash -= cost.total;       // fees always reduce cash
    account.feesPaid += cost.total;
    account.realizedPnl += realized;

    // Guard: a sell whose fees exceed proceeds must not silently overdraw.
    if (account.cash < -1e-9) {
      // Roll back and reject (extremely unlikely; defensive).
      account.cash += cost.total;
      if (side === 'buy') account.cash += principal; else account.cash -= principal;
      account.feesPaid -= cost.total;
      account.realizedPnl -= realized;
      return reject('Order would overdraw cash after costs.');
    }

    // Persist the position (drop it when flat).
    if (Math.abs(position.qty) < 1e-9) {
      account.positions.delete(symbol);
    } else {
      account.positions.set(symbol, position);
    }

    const filled = this._record(account, {
      orderId: this._nextOrderId(), sessionId, symbol, side, qty, type, limitPrice,
      status: 'filled', fillPrice: round2(fillPrice), cost, currency,
      realizedPnl: round2(realized), createdAt: timestamp,
      message: 'Filled ' + qty + ' ' + symbol + ' @ ' + round2(fillPrice) + '.',
    });

    // Refresh this session's risk state from the POST-fill snapshot so a
    // drawdown / daily-loss breach auto-halts before the next order (getAccount
    // internally calls updateRiskState against the freshly marked equity).
    // Best-effort: a transient quote failure must not unwind a booked fill.
    try {
      await this.getAccount(sessionId);
    } catch (e) {
      /* non-fatal risk refresh */
    }

    return filled;
  }

  // Push an order record onto history and return the client-facing shape.
  _record(account, rec) {
    account.orders.push(rec);
    // Client-facing response includes an account snapshot for convenience.
    const out = {
      orderId: rec.orderId,
      status: rec.status,
      fillPrice: rec.fillPrice,
      cost: rec.cost,
      message: rec.message,
      account: this._accountSnapshotSync(account),
    };
    // Additive: rejects carrying risk-guardrail violations surface WHY.
    if (Array.isArray(rec.violations) && rec.violations.length) {
      out.violations = rec.violations;
    }
    return out;
  }

  // ---- Reads ----

  /**
   * Positions marked to market against the injected live quote function.
   * @returns {Promise<Array<{symbol,qty,avgCost,marketValue,unrealizedPnl,side}>>}
   */
  async getPositions(sessionId) {
    const account = this._account(sessionId);
    const symbols = Array.from(account.positions.keys());
    const marks = await Promise.all(symbols.map(async (sym) => {
      try {
        const q = await this.quoteFn(sym);
        const p = q ? Number(q.price) : NaN;
        return isPositiveFiniteNumber(p) ? p : null;
      } catch (e) {
        return null;
      }
    }));

    return symbols.map((sym, i) => {
      const pos = account.positions.get(sym);
      // Fall back to avgCost when a live mark is unavailable (unrealized = 0).
      const mark = marks[i] === null ? pos.avgCost : marks[i];
      const marketValue = pos.qty * mark;
      const unrealizedPnl = (mark - pos.avgCost) * pos.qty; // sign works for long and short
      return {
        symbol: sym,
        qty: round2(pos.qty),
        avgCost: round2(pos.avgCost),
        marketValue: round2(marketValue),
        unrealizedPnl: round2(unrealizedPnl),
        side: pos.qty >= 0 ? 'long' : 'short',
      };
    });
  }

  /**
   * Full account view, positions marked to market.
   * @returns {Promise<{cash,equity,buyingPower,currency,positions:Array}>}
   */
  async getAccount(sessionId) {
    const account = this._account(sessionId);
    const positions = await this.getPositions(sessionId);
    const positionsValue = positions.reduce((sum, p) => sum + p.marketValue, 0);
    const equity = round2(account.cash + positionsValue);
    // On every account read, roll the daily baseline forward if the calendar day
    // advanced, then recompute the per-session risk state from this snapshot so
    // the circuit breaker / daily-loss auto-halt stays current (fail-closed: an
    // unusable equity would engage the kill switch inside updateRiskState).
    this._maybeStartNewDay(account, equity, this.nowFn());
    RiskGuardrails.updateRiskState(account.riskState, { equity: equity }, account.limits);
    return {
      cash: round2(account.cash),
      equity: equity,
      buyingPower: round2(account.cash), // 1:1, no margin (simplification #4)
      currency: account.currency,
      initialCash: round2(account.initialCash),
      realizedPnl: round2(account.realizedPnl),
      feesPaid: round2(account.feesPaid),
      positions: positions,
    };
  }

  // ---- Per-session risk posture (canonical guardrails) ----

  /**
   * Engage the session kill switch. A halted session then rejects ALL orders
   * via checkOrder's kill_switch rule until resume() is called.
   * @returns {{ halted:true, reason:string }}
   */
  halt(sessionId, reason) {
    const account = this._account(sessionId);
    RiskGuardrails.engageKillSwitch(account.riskState, reason);
    return { halted: true, reason: account.riskState.haltReason };
  }

  /**
   * Release the session kill switch. Deliberate human action; never automatic.
   * @returns {{ halted:false }}
   */
  resume(sessionId) {
    const account = this._account(sessionId);
    RiskGuardrails.releaseKillSwitch(account.riskState);
    return { halted: false };
  }

  /**
   * Current risk posture for the session, from a freshly marked snapshot.
   * @returns {Promise<{halted,haltReason,limits,equity,peakEquity,startOfDayEquity,drawdownPct,dailyPnl,lastViolations?}>}
   */
  async getRisk(sessionId) {
    const account = this._account(sessionId);
    const acct = await this.getAccount(sessionId); // marks to market + refreshes risk state
    const rs = account.riskState;
    const equity = acct.equity;
    const peakEquity = round2(rs.peakEquity);
    const startOfDayEquity = round2(rs.startOfDayEquity);
    const drawdownPct = peakEquity > 0 ? round2(((peakEquity - equity) / peakEquity) * 100) : 0;
    const dailyPnl = round2(equity - startOfDayEquity);
    const out = {
      halted: RiskGuardrails.isHalted(rs),
      haltReason: rs.haltReason || null,
      limits: Object.assign({}, account.limits),
      equity: equity,
      peakEquity: peakEquity,
      startOfDayEquity: startOfDayEquity,
      drawdownPct: drawdownPct,
      dailyPnl: dailyPnl,
    };
    if (Array.isArray(account.lastViolations) && account.lastViolations.length) {
      out.lastViolations = account.lastViolations;
    }
    return out;
  }

  // Cheap, quote-free account snapshot for embedding in an order response.
  // Positions are marked at avgCost here (no awaited quotes); callers wanting a
  // live mark should call getAccount().
  _accountSnapshotSync(account) {
    const positions = Array.from(account.positions.entries()).map(([sym, pos]) => ({
      symbol: sym,
      qty: round2(pos.qty),
      avgCost: round2(pos.avgCost),
      marketValue: round2(pos.qty * pos.avgCost),
      unrealizedPnl: 0,
      side: pos.qty >= 0 ? 'long' : 'short',
    }));
    const positionsValue = positions.reduce((sum, p) => sum + p.marketValue, 0);
    return {
      cash: round2(account.cash),
      equity: round2(account.cash + positionsValue),
      buyingPower: round2(account.cash),
      currency: account.currency,
      initialCash: round2(account.initialCash),
      realizedPnl: round2(account.realizedPnl),
      feesPaid: round2(account.feesPaid),
      positions: positions,
    };
  }

  /**
   * Order history for a session, most recent first.
   * @returns {{ orders: Array }}
   */
  getOrders(sessionId) {
    const account = this._account(sessionId);
    const orders = account.orders.slice().reverse().map((o) => ({
      orderId: o.orderId,
      symbol: o.symbol,
      side: o.side,
      qty: o.qty,
      type: o.type,
      limitPrice: o.limitPrice,
      status: o.status,
      fillPrice: o.fillPrice,
      cost: o.cost,
      currency: o.currency,
      realizedPnl: typeof o.realizedPnl === 'number' ? o.realizedPnl : null,
      createdAt: o.createdAt,
      message: o.message,
    }));
    return { orders };
  }

  /**
   * Cancel a resting (working) order. Filled orders cannot be canceled.
   * @returns {{ ok:boolean, status?:string, message:string }}
   */
  cancelOrder(orderId, sessionId) {
    const account = this._account(sessionId);
    const rec = account.orders.find((o) => o.orderId === orderId);
    if (!rec) return { ok: false, message: 'Order not found.' };
    if (rec.status !== 'working') {
      return { ok: false, status: rec.status, message: 'Only working orders can be canceled (order is ' + rec.status + ').' };
    }
    rec.status = 'canceled';
    rec.message = 'Canceled by user.';
    return { ok: true, status: 'canceled', message: 'Order canceled.' };
  }
}

/**
 * Factory: create a PaperBroker. Mirrors how the real adapters are constructed
 * and keeps server.js wiring a one-liner.
 */
function createPaperBroker(opts) {
  return new PaperBroker(opts);
}

module.exports = { PaperBroker, createPaperBroker, applyFill, round2 };
