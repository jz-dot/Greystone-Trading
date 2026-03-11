/* ============================================
   MEAN REVERSION STRATEGY
   Z-score + Bollinger Band extremes
   Enters on deviation, exits on normalization
   ============================================ */

class MeanReversion extends TradingAgent {
  constructor(config) {
    super({
      name: 'Mean Reversion',
      strategy: 'Mean Reversion',
      description: 'Identifies extreme deviations from statistical norms using z-score analysis, Bollinger Band compression, and pair correlation breakdowns. Profits from price normalization.',
      tickInterval: 8000,
      maxPositionSize: config?.maxPositionSize || 25000,
      dailyLossLimit: config?.dailyLossLimit || 2000,
      maxPositions: config?.maxPositions || 5,
      symbols: config?.symbols || ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'AMD', 'JPM'],
      ...config,
    });

    // Strategy parameters
    this.lookbackPeriod = config?.lookbackPeriod || 40;
    this.entryZScore = config?.entryZScore || 2.5;
    this.exitZScore = config?.exitZScore || 0.5;
    this.stopZScore = config?.stopZScore || 4.0;
    this.bbPeriod = config?.bbPeriod || 20;
    this.bbStdDev = config?.bbStdDev || 2.0;

    // Price history
    this._priceHistory = {};
    this._activeSignals = {};

    // Pair correlation tracking
    this._correlationPairs = config?.correlationPairs || [
      ['AAPL', 'MSFT'],
      ['GOOGL', 'META'],
      ['NVDA', 'AMD'],
    ];
    this._pairHistory = {};
  }

  _ensureHistory(symbol) {
    if (!this._priceHistory[symbol]) {
      this._priceHistory[symbol] = [];
    }
  }

  _addPrice(symbol, price) {
    this._ensureHistory(symbol);
    this._priceHistory[symbol].push(price);
    if (this._priceHistory[symbol].length > this.lookbackPeriod + 20) {
      this._priceHistory[symbol].shift();
    }
  }

  _calcZScore(prices) {
    if (prices.length < this.lookbackPeriod) return 0;
    const window = prices.slice(-this.lookbackPeriod);
    const mean = window.reduce((s, v) => s + v, 0) / window.length;
    const variance = window.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / window.length;
    const stddev = Math.sqrt(variance);
    if (stddev === 0) return 0;
    return (prices[prices.length - 1] - mean) / stddev;
  }

  _calcBollingerBands(prices, period, numStdDev) {
    if (prices.length < period) return null;
    const window = prices.slice(-period);
    const mean = window.reduce((s, v) => s + v, 0) / window.length;
    const variance = window.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / window.length;
    const stddev = Math.sqrt(variance);
    return {
      upper: mean + numStdDev * stddev,
      middle: mean,
      lower: mean - numStdDev * stddev,
      width: (2 * numStdDev * stddev) / mean, // bandwidth
      percentB: stddev > 0 ? (prices[prices.length - 1] - (mean - numStdDev * stddev)) / (2 * numStdDev * stddev) : 0.5,
    };
  }

  _calcCorrelation(pricesA, pricesB) {
    const n = Math.min(pricesA.length, pricesB.length, this.lookbackPeriod);
    if (n < 10) return 0;
    const a = pricesA.slice(-n);
    const b = pricesB.slice(-n);
    const meanA = a.reduce((s, v) => s + v, 0) / n;
    const meanB = b.reduce((s, v) => s + v, 0) / n;
    let cov = 0, varA = 0, varB = 0;
    for (let i = 0; i < n; i++) {
      const da = a[i] - meanA;
      const db = b[i] - meanB;
      cov += da * db;
      varA += da * da;
      varB += db * db;
    }
    const denom = Math.sqrt(varA * varB);
    return denom > 0 ? cov / denom : 0;
  }

  async onTick(marketData) {
    // Update price history
    for (const sym of this.symbols) {
      if (marketData[sym]) {
        this._addPrice(sym, marketData[sym].price);
      }
    }

    // Manage existing positions
    await this._managePositions(marketData);

    // Scan individual symbols for mean reversion
    await this._scanSymbols(marketData);

    // Scan pairs for correlation breakdown
    await this._scanPairs(marketData);
  }

  async _managePositions(marketData) {
    for (const [symbol, signal] of Object.entries(this._activeSignals)) {
      const prices = this._priceHistory[symbol];
      if (!prices || prices.length < this.lookbackPeriod) continue;
      const data = marketData[symbol];
      if (!data) continue;

      const zScore = this._calcZScore(prices);

      // Exit on mean reversion
      if (Math.abs(zScore) < this.exitZScore) {
        const side = signal.direction === 'long' ? 'sell' : 'buy';
        await this.placeOrder(symbol, side, signal.qty, 'market');
        const holdTime = ((Date.now() - signal.entryTime) / 60000).toFixed(1);
        this.logTrade(`EXIT ${symbol}: z-score reverted to ${zScore.toFixed(2)} after ${holdTime} min`);
        delete this._activeSignals[symbol];
        continue;
      }

      // Stop-loss on extreme deviation
      if (Math.abs(zScore) > this.stopZScore) {
        const side = signal.direction === 'long' ? 'sell' : 'buy';
        await this.placeOrder(symbol, side, signal.qty, 'market');
        this.warn(`STOP-LOSS ${symbol}: z-score reached ${zScore.toFixed(2)} (limit: ${this.stopZScore})`);
        delete this._activeSignals[symbol];
      }
    }
  }

  async _scanSymbols(marketData) {
    for (const sym of this.symbols) {
      if (this._activeSignals[sym]) continue;
      const prices = this._priceHistory[sym];
      if (!prices || prices.length < this.lookbackPeriod) continue;
      const data = marketData[sym];
      if (!data) continue;

      const zScore = this._calcZScore(prices);
      const bb = this._calcBollingerBands(prices, this.bbPeriod, this.bbStdDev);
      if (!bb) continue;

      // Entry: z-score extreme AND price outside Bollinger Bands
      if (zScore < -this.entryZScore && bb.percentB < 0) {
        // Oversold - go long
        const qty = Math.max(1, Math.floor(this.maxPositionSize / data.price));
        this.logSignal(`LONG signal: ${sym} z=${zScore.toFixed(2)}, BB%B=${bb.percentB.toFixed(2)}, bandwidth=${bb.width.toFixed(4)}`);
        await this.placeOrder(sym, 'buy', qty, 'market');
        this._activeSignals[sym] = {
          direction: 'long', qty, entryZ: zScore,
          entryPrice: data.price, entryTime: Date.now(),
        };
      } else if (zScore > this.entryZScore && bb.percentB > 1) {
        // Overbought - go short
        const qty = Math.max(1, Math.floor(this.maxPositionSize / data.price));
        this.logSignal(`SHORT signal: ${sym} z=${zScore.toFixed(2)}, BB%B=${bb.percentB.toFixed(2)}, bandwidth=${bb.width.toFixed(4)}`);
        await this.placeOrder(sym, 'sell', qty, 'market');
        this._activeSignals[sym] = {
          direction: 'short', qty, entryZ: zScore,
          entryPrice: data.price, entryTime: Date.now(),
        };
      }
    }
  }

  async _scanPairs(marketData) {
    for (const [symA, symB] of this._correlationPairs) {
      const pricesA = this._priceHistory[symA];
      const pricesB = this._priceHistory[symB];
      if (!pricesA || !pricesB) continue;
      if (pricesA.length < this.lookbackPeriod || pricesB.length < this.lookbackPeriod) continue;

      const correlation = this._calcCorrelation(pricesA, pricesB);
      const pairKey = `${symA}_${symB}`;

      // Track correlation history
      if (!this._pairHistory[pairKey]) this._pairHistory[pairKey] = [];
      this._pairHistory[pairKey].push(correlation);
      if (this._pairHistory[pairKey].length > 50) this._pairHistory[pairKey].shift();

      // Detect correlation breakdown (normally highly correlated pairs diverging)
      if (this._pairHistory[pairKey].length >= 10) {
        const avgCorr = this._pairHistory[pairKey].slice(0, -1).reduce((s, v) => s + v, 0) / (this._pairHistory[pairKey].length - 1);
        if (avgCorr > 0.7 && correlation < 0.3) {
          this.logSignal(`CORRELATION BREAKDOWN: ${symA}/${symB} dropped from ${avgCorr.toFixed(2)} to ${correlation.toFixed(2)}`);
        }
      }
    }
  }

  getStats() {
    const base = super.getStats();
    const pairCorrs = {};
    for (const [symA, symB] of this._correlationPairs) {
      const pricesA = this._priceHistory[symA];
      const pricesB = this._priceHistory[symB];
      if (pricesA && pricesB) {
        pairCorrs[`${symA}/${symB}`] = this._calcCorrelation(pricesA, pricesB);
      }
    }
    return {
      ...base,
      activePairCorrelations: pairCorrs,
      signalCount: Object.keys(this._activeSignals).length,
    };
  }
}
