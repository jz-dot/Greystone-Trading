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

   SAFETY (INTERIM)
   placeOrder runs two minimal, clearly-marked inline checks: a global halt
   flag and a max-order-notional cap. These are a stopgap. The CANONICAL hard
   risk layer is services/risk-guardrails.js (being built in parallel). A
   later wave should route every order (paper and live) through that module
   and delete the inline checks here. Keep the checks here minimal on purpose.

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

// ---- Defaults (all overridable via the factory config) ----
const DEFAULT_INITIAL_CASH = 100000; // fake dollars
const DEFAULT_BASE_CURRENCY = 'CAD';
// Fee model broker used to simulate transaction costs. Wealthsimple is
// commission-free with a 1.5% FX spread, which cleanly surfaces the FX line
// (the whole point of the platform) on USD trades from a CAD account.
const DEFAULT_FEE_BROKER = 'wealthsimple';
// Interim per-order notional cap (fake money, so generous). Server may tighten.
const DEFAULT_MAX_ORDER_NOTIONAL = 500000;
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
   * @param {number}   [opts.maxOrderNotional] - interim per-order cap (default 500000)
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
    this.maxOrderNotional = typeof opts.maxOrderNotional === 'number' ? opts.maxOrderNotional : DEFAULT_MAX_ORDER_NOTIONAL;
    this.nowFn = typeof opts.nowFn === 'function' ? opts.nowFn : function () { return Date.now(); };

    // sessionId -> account
    this.accounts = new Map();
    // Global kill switch (INTERIM safety; see services/risk-guardrails.js).
    this.halted = false;
    // Monotonic order id counter (shared across sessions; ids are unique).
    this._orderSeq = 0;
  }

  // ---- Global halt (interim safety) ----
  setHalt(flag) { this.halted = !!flag; }
  isHalted() { return this.halted; }

  // ---- Account lifecycle ----

  _freshAccount(sessionId, initialCash) {
    const cash = typeof initialCash === 'number' ? initialCash : this.initialCash;
    return {
      sessionId: sessionId,
      currency: this.baseCurrency,
      initialCash: cash,
      cash: cash,
      realizedPnl: 0,
      feesPaid: 0,
      positions: new Map(), // symbol -> { qty, avgCost }
      orders: [],           // full history (filled / working / rejected / canceled)
    };
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
    this.accounts.set(id, this._freshAccount(id, initialCash));
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

    const reject = (message) => this._record(account, {
      orderId: this._nextOrderId(), sessionId, symbol, side, qty: Number.isFinite(qty) ? qty : null,
      type, limitPrice, status: 'rejected', fillPrice: null,
      cost: { commission: 0, fxCost: 0, total: 0 }, currency: account.currency,
      createdAt: timestamp, message,
    });

    // ---- Input validation (clean rejects; server maps to 400) ----
    if (!symbol) return reject('Missing symbol.');
    if (side !== 'buy' && side !== 'sell') return reject("Side must be 'buy' or 'sell'.");
    if (type !== 'market' && type !== 'limit') return reject("Type must be 'market' or 'limit'.");
    if (!isPositiveFiniteNumber(qty)) return reject('Quantity must be a positive number.');
    if (type === 'limit' && !isPositiveFiniteNumber(limitPrice)) {
      return reject('A limit order requires a positive limitPrice.');
    }

    // ---- INTERIM SAFETY (canonical layer: services/risk-guardrails.js) ----
    if (this.halted) return reject('Trading is halted (global paper halt is set).');

    // ---- Live quote (unknown symbol -> clean reject) ----
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

    // Reference price for the notional cap: intended limit for limits, else last.
    const refPrice = type === 'limit' ? limitPrice : last;
    const notional = qty * refPrice;

    // ---- INTERIM SAFETY: max order notional ----
    if (notional > this.maxOrderNotional) {
      return reject('Order notional ' + round2(notional) + ' exceeds the max of ' + this.maxOrderNotional + '.');
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
    return filled;
  }

  // Push an order record onto history and return the client-facing shape.
  _record(account, rec) {
    account.orders.push(rec);
    // Client-facing response includes an account snapshot for convenience.
    return {
      orderId: rec.orderId,
      status: rec.status,
      fillPrice: rec.fillPrice,
      cost: rec.cost,
      message: rec.message,
      account: this._accountSnapshotSync(account),
    };
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
    const equity = account.cash + positionsValue;
    return {
      cash: round2(account.cash),
      equity: round2(equity),
      buyingPower: round2(account.cash), // 1:1, no margin (simplification #4)
      currency: account.currency,
      initialCash: round2(account.initialCash),
      realizedPnl: round2(account.realizedPnl),
      feesPaid: round2(account.feesPaid),
      positions: positions,
    };
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
