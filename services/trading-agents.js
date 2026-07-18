/* ============================================
   TRADING AGENT FRAMEWORK
   Base class + lifecycle + event system
   ============================================

   HONEST LABELING (read before relying on any output)
   ----------------------------------------------------
   These agents are SIMULATION strategies for research and
   education only. They are NOT validated for live trading.
   In simulation mode prices are a bounded random walk (see
   _getSimulatedData), not a market model, and there is NO
   backtest engine here: reported P&L, Sharpe, win rate and
   drawdown come from that random walk, not from historical
   or live data. Do not treat any statistic as evidence of a
   strategy edge. Paper-trading mode routes real (paper)
   orders through Alpaca but the signal logic is unchanged and
   remains unvalidated. Use for learning the mechanics only.
   ============================================ */

// --- Agent States ---
const AgentState = {
  STOPPED: 'stopped',
  RUNNING: 'running',
  PAUSED: 'paused',
  ERROR: 'error',
};

// --- Event Log Entry ---
class AgentLogEntry {
  constructor(level, message, data) {
    this.timestamp = new Date();
    this.level = level; // 'info', 'warn', 'error', 'trade', 'signal'
    this.message = message;
    this.data = data || null;
  }

  format() {
    const ts = this.timestamp.toLocaleTimeString('en-US', { hour12: false });
    const prefix = {
      info: '[INFO]',
      warn: '[WARN]',
      error: '[ERR ]',
      trade: '[TRADE]',
      signal: '[SIGNAL]',
    }[this.level] || '[LOG]';
    return `${ts} ${prefix} ${this.message}`;
  }
}

// --- Base Trading Agent ---
class TradingAgent {
  constructor(config) {
    this.id = config.id || `agent-${Date.now()}`;
    this.name = config.name || 'Unnamed Agent';
    this.strategy = config.strategy || 'Custom';
    this.description = config.description || '';

    // State
    this.state = AgentState.STOPPED;
    // Default to simulation whenever Alpaca is not present/configured
    // (also keeps the class constructable under Node for unit tests,
    // where the browser-global AlpacaClient does not exist).
    this.simulationMode = (typeof AlpacaClient === 'undefined') || !AlpacaClient.isConfigured();

    // Risk guardrails
    this.maxPositionSize = config.maxPositionSize || 10000;
    this.dailyLossLimit = config.dailyLossLimit || 2000;
    this.maxPositions = config.maxPositions || 5;

    // Tracking
    this.trades = [];
    this.positions = {};
    this.logs = [];
    this.maxLogs = 500;

    // P&L tracking
    this.realizedPnL = 0;
    this.unrealizedPnL = 0;
    this.dailyPnL = 0;
    this.dailyPnLHistory = [];
    // Number of ticks that make up one simulated trading day. When this
    // many ticks elapse the current dailyPnL is rolled into
    // dailyPnLHistory and reset, giving getStats() a real (simulated)
    // return series to compute Sharpe from. Purely a simulation artifact.
    this.ticksPerSimDay = config.ticksPerSimDay || 60;
    this.maxDailyHistory = config.maxDailyHistory || 252;
    this._tickCount = 0;
    this.peakEquity = 0;
    this.maxDrawdown = 0;
    this.wins = 0;
    this.losses = 0;
    this.startEquity = 0;

    // Timing
    this.tickInterval = config.tickInterval || 5000; // ms between ticks
    this._tickTimer = null;
    this._startTime = null;

    // Symbols this agent watches
    this.symbols = config.symbols || [];

    // Simulated price data for offline mode
    this._simPrices = {};

    // Last-known price per symbol, updated on every market-data fetch in
    // BOTH modes. Used to cost-check orders in the position-size guardrail
    // when no explicit order price is supplied (see placeOrder). In live
    // mode _simPrices is empty, so this is the only real reference price.
    this._lastPrices = {};

    // Event callbacks
    this._listeners = {};
  }

  // --- Event system ---
  on(event, callback) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(callback);
  }

  off(event, callback) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(cb => cb !== callback);
  }

  emit(event, data) {
    if (this._listeners[event]) {
      this._listeners[event].forEach(cb => cb(data));
    }
  }

  // --- Logging ---
  log(level, message, data) {
    const entry = new AgentLogEntry(level, message, data);
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) this.logs.shift();
    this.emit('log', entry);
    return entry;
  }

  info(msg, data) { return this.log('info', msg, data); }
  warn(msg, data) { return this.log('warn', msg, data); }
  error(msg, data) { return this.log('error', msg, data); }
  logTrade(msg, data) { return this.log('trade', msg, data); }
  logSignal(msg, data) { return this.log('signal', msg, data); }

  // --- Lifecycle ---
  async start() {
    if (this.state === AgentState.RUNNING) return;

    this.simulationMode = (typeof AlpacaClient === 'undefined') || !AlpacaClient.isConfigured();
    this.state = AgentState.RUNNING;
    this._startTime = Date.now();

    if (this.simulationMode) {
      this.info('Starting in SIMULATION mode (no Alpaca API key configured)');
      this._initSimPrices();
    } else {
      this.info('Starting in PAPER TRADING mode via Alpaca');
      const acct = await AlpacaClient.getAccount();
      if (acct.error) {
        this.error(`Failed to connect to Alpaca: ${acct.message}`);
        this.state = AgentState.ERROR;
        this.emit('stateChange', this.state);
        return;
      }
      this.startEquity = parseFloat(acct.equity) || 0;
      this.info(`Connected. Account equity: $${this.startEquity.toLocaleString()}`);
    }

    this.info(`${this.name} started. Watching: ${this.symbols.join(', ')}`);
    this.emit('stateChange', this.state);

    // Start tick loop
    this._scheduleTick();
  }

  stop() {
    if (this.state === AgentState.STOPPED) return;
    this.state = AgentState.STOPPED;
    if (this._tickTimer) {
      clearTimeout(this._tickTimer);
      this._tickTimer = null;
    }
    this.info(`${this.name} stopped`);
    this.emit('stateChange', this.state);
  }

  pause() {
    if (this.state !== AgentState.RUNNING) return;
    this.state = AgentState.PAUSED;
    if (this._tickTimer) {
      clearTimeout(this._tickTimer);
      this._tickTimer = null;
    }
    this.info(`${this.name} paused`);
    this.emit('stateChange', this.state);
  }

  resume() {
    if (this.state !== AgentState.PAUSED) return;
    this.state = AgentState.RUNNING;
    this.info(`${this.name} resumed`);
    this.emit('stateChange', this.state);
    this._scheduleTick();
  }

  // --- Tick loop ---
  _scheduleTick() {
    if (this.state !== AgentState.RUNNING) return;
    this._tickTimer = setTimeout(async () => {
      try {
        const marketData = await this._getMarketData();
        await this.onTick(marketData);
        this._checkGuardrails();
        // Advance the simulated clock. Once a full simulated day of ticks
        // has elapsed, snapshot the day's realized P&L into the return
        // series and start a fresh day (see rolloverDay / getStats Sharpe).
        this._tickCount++;
        if (this._tickCount >= this.ticksPerSimDay) {
          this.rolloverDay();
          this._tickCount = 0;
        }
      } catch (err) {
        this.error(`Tick error: ${err.message}`);
      }
      this._scheduleTick();
    }, this.tickInterval);
  }

  // --- Market data ---
  async _getMarketData() {
    let data;
    if (this.simulationMode) {
      data = this._getSimulatedData();
    } else {
      data = {};
      for (const sym of this.symbols) {
        try {
          const snapshot = await AlpacaClient.getSnapshot(sym);
          if (!snapshot.error) {
            data[sym] = {
              price: parseFloat(snapshot.latestTrade?.p || 0),
              bid: parseFloat(snapshot.latestQuote?.bp || 0),
              ask: parseFloat(snapshot.latestQuote?.ap || 0),
              volume: snapshot.dailyBar?.v || 0,
              open: parseFloat(snapshot.dailyBar?.o || 0),
              high: parseFloat(snapshot.dailyBar?.h || 0),
              low: parseFloat(snapshot.dailyBar?.l || 0),
              close: parseFloat(snapshot.dailyBar?.c || 0),
              prevClose: parseFloat(snapshot.prevDailyBar?.c || 0),
            };
          }
        } catch { /* skip */ }
      }
    }

    // Record last-known prices so the position-size guardrail can cost
    // market orders off a real reference price (works in live mode where
    // _simPrices is empty).
    for (const sym of Object.keys(data)) {
      const p = data[sym] && data[sym].price;
      if (typeof p === 'number' && isFinite(p) && p > 0) {
        this._lastPrices[sym] = p;
      }
    }
    return data;
  }

  // --- Simulated data ---
  _initSimPrices() {
    const basePrices = {
      SPY: 584.23, QQQ: 497.81, AAPL: 227.48, MSFT: 419.32,
      NVDA: 924.15, TSLA: 249.67, AMZN: 186.42, GOOGL: 167.89,
      META: 513.24, AMD: 179.56, JPM: 199.87, PLTR: 23.42,
      COIN: 254.18, GOOG: 168.12, IWM: 207.43,
    };
    this.symbols.forEach(sym => {
      this._simPrices[sym] = basePrices[sym] || 100 + Math.random() * 200;
    });
  }

  _getSimulatedData() {
    const data = {};
    this.symbols.forEach(sym => {
      if (!this._simPrices[sym]) this._simPrices[sym] = 100 + Math.random() * 200;
      const price = this._simPrices[sym];
      // Random walk with mean-reversion tendency
      const change = (Math.random() - 0.5) * price * 0.003;
      const newPrice = Math.max(price * 0.95, Math.min(price * 1.05, price + change));
      this._simPrices[sym] = newPrice;

      const spread = newPrice * 0.0005;
      data[sym] = {
        price: newPrice,
        bid: newPrice - spread,
        ask: newPrice + spread,
        volume: Math.floor(Math.random() * 5000000 + 500000),
        open: newPrice * (1 + (Math.random() - 0.5) * 0.01),
        high: newPrice * (1 + Math.random() * 0.01),
        low: newPrice * (1 - Math.random() * 0.01),
        close: newPrice,
        prevClose: newPrice * (1 + (Math.random() - 0.5) * 0.005),
      };
    });
    return data;
  }

  // --- Order execution ---
  async placeOrder(symbol, side, qty, type, limitPrice) {
    // Guardrail: check position size limit.
    // Cost the order off a REAL price: the explicit order price if given,
    // else the last-known market price, else the simulated price. Never
    // assume an arbitrary $100/share, which would silently defeat the
    // guardrail in live mode (where _simPrices is empty). If no price is
    // known at all, reject rather than trade blind.
    const refPrice =
      (limitPrice != null && isFinite(limitPrice)) ? Number(limitPrice)
      : (this._lastPrices[symbol] != null ? this._lastPrices[symbol]
      : (this._simPrices[symbol] != null ? this._simPrices[symbol] : null));

    if (refPrice == null || !isFinite(refPrice) || refPrice <= 0) {
      this.warn(`Order rejected: no known price for ${symbol} to size the position`);
      return { error: 'GUARDRAIL', message: 'No known price to estimate cost' };
    }

    const estimatedCost = refPrice * qty;
    if (estimatedCost > this.maxPositionSize) {
      this.warn(`Order rejected: $${estimatedCost.toFixed(0)} exceeds max position size $${this.maxPositionSize}`);
      return { error: 'GUARDRAIL', message: 'Exceeds max position size' };
    }

    // Guardrail: check daily loss limit
    if (this.dailyPnL <= -this.dailyLossLimit) {
      this.warn(`Order rejected: daily loss limit reached ($${this.dailyPnL.toFixed(2)})`);
      return { error: 'GUARDRAIL', message: 'Daily loss limit reached' };
    }

    // Guardrail: check max positions
    const posCount = Object.keys(this.positions).length;
    if (side === 'buy' && posCount >= this.maxPositions && !this.positions[symbol]) {
      this.warn(`Order rejected: max positions (${this.maxPositions}) reached`);
      return { error: 'GUARDRAIL', message: 'Max positions reached' };
    }

    const orderParams = {
      symbol,
      qty,
      side,
      type: type || 'market',
      time_in_force: 'day',
    };
    if (limitPrice && (type === 'limit' || type === 'stop_limit')) {
      orderParams.limit_price = limitPrice;
    }

    if (this.simulationMode) {
      return this._simulateOrder(orderParams);
    }

    const result = await AlpacaClient.placeOrder(orderParams);
    if (result.error) {
      this.error(`Order failed: ${result.message}`);
    } else {
      this.logTrade(`${side.toUpperCase()} ${qty} ${symbol} @ ${type}${limitPrice ? ' $' + limitPrice : ''}`, result);
    }
    return result;
  }

  _simulateOrder(params) {
    const price = this._simPrices[params.symbol] || 100;
    const fillPrice = params.type === 'limit' ? parseFloat(params.limit_price) : price;

    const order = {
      id: `sim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      symbol: params.symbol,
      qty: parseInt(params.qty),
      side: params.side,
      type: params.type,
      filled_avg_price: fillPrice.toFixed(2),
      status: 'filled',
      filled_at: new Date().toISOString(),
      simulated: true,
    };

    // Update positions with side-aware accounting (handles cover/close and
    // crossing through zero). See _applyFill.
    this._applyFill(params.symbol, params.side, order.qty, fillPrice);

    this.trades.push(order);
    this.logTrade(
      `SIM ${params.side.toUpperCase()} ${params.qty} ${params.symbol} @ $${fillPrice.toFixed(2)}`,
      order
    );
    this.emit('trade', order);
    return order;
  }

  // Record a realized close into P&L and win/loss counters.
  _realizeClose(pnl) {
    this.realizedPnL += pnl;
    this.dailyPnL += pnl;
    if (pnl > 0) this.wins++; else if (pnl < 0) this.losses++;
  }

  // Side-aware position update for a single fill.
  //   buy  -> adds to a long, or COVERS a short (realizing P&L on the
  //           covered portion); if the buy exceeds the short it closes the
  //           short and flips the remainder to a long.
  //   sell -> adds to a short, or CLOSES a long (realizing P&L on the closed
  //           portion); if the sell exceeds the long it closes the long and
  //           flips the remainder to a short.
  // Short P&L = (entry - exit) * qty; long P&L = (exit - entry) * qty.
  _applyFill(symbol, side, qty, fillPrice) {
    const pos = this.positions[symbol];

    if (side === 'buy') {
      if (!pos) {
        this.positions[symbol] = {
          symbol, qty, avgPrice: fillPrice, side: 'long', entryTime: new Date(),
        };
      } else if (pos.side === 'long') {
        // Average up the long.
        const totalQty = pos.qty + qty;
        pos.avgPrice = (pos.avgPrice * pos.qty + fillPrice * qty) / totalQty;
        pos.qty = totalQty;
      } else {
        // Short position: buying covers it.
        const covered = Math.min(qty, pos.qty);
        this._realizeClose((pos.avgPrice - fillPrice) * covered);
        pos.qty -= covered;
        const remainder = qty - covered;
        if (pos.qty <= 0) {
          delete this.positions[symbol];
          if (remainder > 0) {
            // Crossed through zero: leftover opens a fresh long.
            this.positions[symbol] = {
              symbol, qty: remainder, avgPrice: fillPrice, side: 'long', entryTime: new Date(),
            };
          }
        }
      }
    } else {
      // side === 'sell'
      if (!pos) {
        this.positions[symbol] = {
          symbol, qty, avgPrice: fillPrice, side: 'short', entryTime: new Date(),
        };
      } else if (pos.side === 'short') {
        // Average up the short.
        const totalQty = pos.qty + qty;
        pos.avgPrice = (pos.avgPrice * pos.qty + fillPrice * qty) / totalQty;
        pos.qty = totalQty;
      } else {
        // Long position: selling closes it.
        const closed = Math.min(qty, pos.qty);
        this._realizeClose((fillPrice - pos.avgPrice) * closed);
        pos.qty -= closed;
        const remainder = qty - closed;
        if (pos.qty <= 0) {
          delete this.positions[symbol];
          if (remainder > 0) {
            // Crossed through zero: leftover opens a fresh short.
            this.positions[symbol] = {
              symbol, qty: remainder, avgPrice: fillPrice, side: 'short', entryTime: new Date(),
            };
          }
        }
      }
    }
  }

  // Close out a simulated trading day: push the day's realized P&L into the
  // return series (used for Sharpe) and reset the daily accumulator. Called
  // from the tick loop on a simulated-day boundary; also callable directly.
  rolloverDay() {
    this.dailyPnLHistory.push(this.dailyPnL);
    if (this.dailyPnLHistory.length > this.maxDailyHistory) {
      this.dailyPnLHistory.shift();
    }
    this.dailyPnL = 0;
  }

  // --- Position management ---
  getPositions() {
    return Object.values(this.positions);
  }

  // --- P&L ---
  getPnL() {
    // Calculate unrealized from current sim prices
    let unrealized = 0;
    Object.values(this.positions).forEach(pos => {
      const currentPrice = this._simPrices[pos.symbol] || pos.avgPrice;
      if (pos.side === 'long') {
        unrealized += (currentPrice - pos.avgPrice) * pos.qty;
      } else {
        unrealized += (pos.avgPrice - currentPrice) * pos.qty;
      }
    });
    this.unrealizedPnL = unrealized;

    return {
      realized: this.realizedPnL,
      unrealized: this.unrealizedPnL,
      total: this.realizedPnL + this.unrealizedPnL,
      daily: this.dailyPnL + this.unrealizedPnL,
    };
  }

  // --- Stats ---
  getStats() {
    const totalTrades = this.wins + this.losses;
    const winRate = totalTrades > 0 ? (this.wins / totalTrades * 100) : 0;
    const pnl = this.getPnL();

    // Sharpe calculation from the simulated daily P&L return series.
    // Needs at least two samples to have a variance; a zero-variance
    // (all-equal) or non-finite series yields 0 rather than NaN/Infinity.
    let sharpe = 0;
    if (this.dailyPnLHistory.length > 1) {
      const n = this.dailyPnLHistory.length;
      const mean = this.dailyPnLHistory.reduce((s, v) => s + v, 0) / n;
      const variance = this.dailyPnLHistory.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / n;
      const stddev = Math.sqrt(variance);
      if (stddev > 0 && isFinite(stddev) && isFinite(mean)) {
        sharpe = (mean / stddev) * Math.sqrt(252);
      }
    }

    // Update max drawdown
    const equity = this.startEquity + pnl.total;
    if (equity > this.peakEquity) this.peakEquity = equity;
    if (this.peakEquity > 0) {
      const drawdown = (this.peakEquity - equity) / this.peakEquity;
      if (drawdown > this.maxDrawdown) this.maxDrawdown = drawdown;
    }

    const runTimeMs = this._startTime ? Date.now() - this._startTime : 0;

    return {
      totalTrades,
      wins: this.wins,
      losses: this.losses,
      winRate,
      realizedPnL: pnl.realized,
      unrealizedPnL: pnl.unrealized,
      totalPnL: pnl.total,
      dailyPnL: pnl.daily,
      sharpe,
      maxDrawdown: this.maxDrawdown * 100,
      positionCount: Object.keys(this.positions).length,
      runTimeMs,
    };
  }

  // --- Guardrails ---
  _checkGuardrails() {
    const pnl = this.getPnL();
    if (pnl.daily <= -this.dailyLossLimit) {
      this.warn(`DAILY LOSS LIMIT HIT: $${pnl.daily.toFixed(2)}. Auto-pausing.`);
      this.pause();
      this.emit('guardrailTriggered', { type: 'dailyLoss', value: pnl.daily });
    }
  }

  // --- Override in subclasses ---
  async onTick(marketData) {
    // Override in strategy subclasses
  }

  // --- Serialization ---
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      strategy: this.strategy,
      state: this.state,
      simulationMode: this.simulationMode,
      stats: this.getStats(),
      positions: this.getPositions(),
      symbols: this.symbols,
      config: {
        maxPositionSize: this.maxPositionSize,
        dailyLossLimit: this.dailyLossLimit,
        maxPositions: this.maxPositions,
        tickInterval: this.tickInterval,
      },
    };
  }
}

// --- Agent Manager (singleton) ---
const AgentManager = (function () {
  const agents = {};
  const listeners = {};

  function register(agent) {
    agents[agent.id] = agent;
    emit('agentRegistered', agent);
    return agent;
  }

  function unregister(id) {
    if (agents[id]) {
      agents[id].stop();
      delete agents[id];
      emit('agentUnregistered', id);
    }
  }

  function get(id) { return agents[id]; }
  function getAll() { return Object.values(agents); }
  function getRunning() { return getAll().filter(a => a.state === AgentState.RUNNING); }

  function stopAll() {
    getAll().forEach(a => a.stop());
  }

  function pauseAll() {
    getRunning().forEach(a => a.pause());
  }

  function on(event, cb) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(cb);
  }

  function emit(event, data) {
    if (listeners[event]) listeners[event].forEach(cb => cb(data));
  }

  return { register, unregister, get, getAll, getRunning, stopAll, pauseAll, on };
})();

// Export for both Node.js (unit tests) and the browser. In the browser the
// top-level class/const bindings above already live in the shared global
// lexical scope, so the strategy scripts that load after this file continue
// to see TradingAgent directly; the window assignments below are additive.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TradingAgent, AgentState, AgentLogEntry, AgentManager };
} else if (typeof window !== 'undefined') {
  window.TradingAgent = TradingAgent;
  window.AgentState = AgentState;
  window.AgentLogEntry = AgentLogEntry;
  window.AgentManager = AgentManager;
}
