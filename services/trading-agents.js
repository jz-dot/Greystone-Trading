/* ============================================
   TRADING AGENT FRAMEWORK
   Base class + lifecycle + event system
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
    this.simulationMode = !AlpacaClient.isConfigured();

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

    this.simulationMode = !AlpacaClient.isConfigured();
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
      } catch (err) {
        this.error(`Tick error: ${err.message}`);
      }
      this._scheduleTick();
    }, this.tickInterval);
  }

  // --- Market data ---
  async _getMarketData() {
    if (this.simulationMode) {
      return this._getSimulatedData();
    }

    const data = {};
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
    // Guardrail: check position size limit
    const estimatedCost = (limitPrice || this._simPrices[symbol] || 100) * qty;
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

    // Update positions
    if (params.side === 'buy') {
      if (this.positions[params.symbol]) {
        // Add to position
        const pos = this.positions[params.symbol];
        const totalQty = pos.qty + order.qty;
        pos.avgPrice = (pos.avgPrice * pos.qty + fillPrice * order.qty) / totalQty;
        pos.qty = totalQty;
      } else {
        this.positions[params.symbol] = {
          symbol: params.symbol,
          qty: order.qty,
          avgPrice: fillPrice,
          side: 'long',
          entryTime: new Date(),
        };
      }
    } else {
      // sell
      if (this.positions[params.symbol]) {
        const pos = this.positions[params.symbol];
        const pnl = (fillPrice - pos.avgPrice) * Math.min(order.qty, pos.qty);
        this.realizedPnL += pnl;
        this.dailyPnL += pnl;
        if (pnl > 0) this.wins++; else this.losses++;

        pos.qty -= order.qty;
        if (pos.qty <= 0) {
          delete this.positions[params.symbol];
        }
      } else {
        // Short position
        this.positions[params.symbol] = {
          symbol: params.symbol,
          qty: order.qty,
          avgPrice: fillPrice,
          side: 'short',
          entryTime: new Date(),
        };
      }
    }

    this.trades.push(order);
    this.logTrade(
      `SIM ${params.side.toUpperCase()} ${params.qty} ${params.symbol} @ $${fillPrice.toFixed(2)}`,
      order
    );
    this.emit('trade', order);
    return order;
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

    // Sharpe calculation from daily P&L history
    let sharpe = 0;
    if (this.dailyPnLHistory.length > 1) {
      const mean = this.dailyPnLHistory.reduce((s, v) => s + v, 0) / this.dailyPnLHistory.length;
      const variance = this.dailyPnLHistory.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / this.dailyPnLHistory.length;
      const stddev = Math.sqrt(variance);
      sharpe = stddev > 0 ? (mean / stddev) * Math.sqrt(252) : 0;
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
