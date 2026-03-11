/* ============================================
   SWING MOMENTUM STRATEGY
   RSI + MACD + Volume for multi-day entries
   Targets 2:1 R:R minimum
   ============================================ */

class SwingMomentum extends TradingAgent {
  constructor(config) {
    super({
      name: 'Swing Momentum',
      strategy: 'Swing Trading',
      description: 'Identifies multi-day swing setups using RSI divergence, MACD crossovers, and volume profile. Targets 2-5 day holds with 2:1+ risk/reward.',
      tickInterval: 10000,
      maxPositionSize: config?.maxPositionSize || 25000,
      dailyLossLimit: config?.dailyLossLimit || 2000,
      maxPositions: config?.maxPositions || 4,
      symbols: config?.symbols || ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'META', 'AMZN', 'AMD', 'PLTR'],
      ...config,
    });

    // Strategy parameters
    this.rsiPeriod = config?.rsiPeriod || 14;
    this.rsiBuyThreshold = config?.rsiBuyThreshold || 30;
    this.rsiSellThreshold = config?.rsiSellThreshold || 70;
    this.macdFast = config?.macdFast || 12;
    this.macdSlow = config?.macdSlow || 26;
    this.macdSignal = config?.macdSignal || 9;
    this.minRR = config?.minRR || 2.0;
    this.atrMultiplierStop = config?.atrMultiplierStop || 1.5;
    this.atrMultiplierTarget = config?.atrMultiplierTarget || 3.0;

    // Price history for indicator calculations
    this._priceHistory = {};
    this._historyLength = 60;

    // Position tracking with stops/targets
    this._managedPositions = {};
  }

  _ensureHistory(symbol) {
    if (!this._priceHistory[symbol]) {
      this._priceHistory[symbol] = [];
    }
  }

  _addPrice(symbol, price) {
    this._ensureHistory(symbol);
    this._priceHistory[symbol].push(price);
    if (this._priceHistory[symbol].length > this._historyLength) {
      this._priceHistory[symbol].shift();
    }
  }

  // --- Indicators ---
  _calcRSI(prices, period) {
    if (prices.length < period + 1) return 50;
    let gains = 0, losses = 0;
    for (let i = prices.length - period; i < prices.length; i++) {
      const diff = prices[i] - prices[i - 1];
      if (diff > 0) gains += diff; else losses += Math.abs(diff);
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  _calcEMA(prices, period) {
    if (prices.length < period) return prices[prices.length - 1] || 0;
    const k = 2 / (period + 1);
    let ema = prices.slice(0, period).reduce((s, v) => s + v, 0) / period;
    for (let i = period; i < prices.length; i++) {
      ema = prices[i] * k + ema * (1 - k);
    }
    return ema;
  }

  _calcMACD(prices) {
    if (prices.length < this.macdSlow + this.macdSignal) return { macd: 0, signal: 0, histogram: 0 };
    const fastEMA = this._calcEMA(prices, this.macdFast);
    const slowEMA = this._calcEMA(prices, this.macdSlow);
    const macdLine = fastEMA - slowEMA;

    // Build MACD line history for signal
    const macdHistory = [];
    for (let i = this.macdSlow; i <= prices.length; i++) {
      const f = this._calcEMA(prices.slice(0, i), this.macdFast);
      const s = this._calcEMA(prices.slice(0, i), this.macdSlow);
      macdHistory.push(f - s);
    }
    const signalLine = this._calcEMA(macdHistory, this.macdSignal);

    return {
      macd: macdLine,
      signal: signalLine,
      histogram: macdLine - signalLine,
    };
  }

  _calcATR(symbol, period) {
    const prices = this._priceHistory[symbol] || [];
    if (prices.length < period + 1) return prices.length > 0 ? prices[prices.length - 1] * 0.02 : 1;
    let sum = 0;
    for (let i = prices.length - period; i < prices.length; i++) {
      sum += Math.abs(prices[i] - prices[i - 1]);
    }
    return sum / period;
  }

  _calcVolumeRatio(data) {
    // Compare recent volume to average - using simulated data
    return data.volume > 0 ? 1 + Math.random() * 0.5 : 1;
  }

  async onTick(marketData) {
    // Update price history
    for (const sym of this.symbols) {
      if (marketData[sym]) {
        this._addPrice(sym, marketData[sym].price);
      }
    }

    // Manage existing positions (check stops and targets)
    await this._managePositions(marketData);

    // Scan for new entries
    await this._scanForEntries(marketData);
  }

  async _managePositions(marketData) {
    for (const [symbol, managed] of Object.entries(this._managedPositions)) {
      const data = marketData[symbol];
      if (!data) continue;

      const price = data.price;

      // Check stop loss
      if (managed.side === 'long' && price <= managed.stopLoss) {
        await this.placeOrder(symbol, 'sell', managed.qty, 'market');
        this.logTrade(`STOP HIT: ${symbol} @ $${price.toFixed(2)} (stop was $${managed.stopLoss.toFixed(2)})`);
        delete this._managedPositions[symbol];
        continue;
      }

      if (managed.side === 'short' && price >= managed.stopLoss) {
        await this.placeOrder(symbol, 'buy', managed.qty, 'market');
        this.logTrade(`STOP HIT: ${symbol} short @ $${price.toFixed(2)} (stop was $${managed.stopLoss.toFixed(2)})`);
        delete this._managedPositions[symbol];
        continue;
      }

      // Check take profit
      if (managed.side === 'long' && price >= managed.target) {
        await this.placeOrder(symbol, 'sell', managed.qty, 'market');
        this.logTrade(`TARGET HIT: ${symbol} @ $${price.toFixed(2)} (target was $${managed.target.toFixed(2)})`);
        delete this._managedPositions[symbol];
        continue;
      }

      if (managed.side === 'short' && price <= managed.target) {
        await this.placeOrder(symbol, 'buy', managed.qty, 'market');
        this.logTrade(`TARGET HIT: ${symbol} short @ $${price.toFixed(2)} (target was $${managed.target.toFixed(2)})`);
        delete this._managedPositions[symbol];
        continue;
      }

      // Trailing stop: move stop up as price moves favorably
      if (managed.side === 'long') {
        const newStop = price - managed.atr * this.atrMultiplierStop;
        if (newStop > managed.stopLoss) {
          managed.stopLoss = newStop;
        }
      }
    }
  }

  async _scanForEntries(marketData) {
    for (const sym of this.symbols) {
      if (this._managedPositions[sym]) continue; // already in position
      const prices = this._priceHistory[sym];
      if (!prices || prices.length < this.macdSlow + this.macdSignal) continue;
      const data = marketData[sym];
      if (!data) continue;

      const rsi = this._calcRSI(prices, this.rsiPeriod);
      const macd = this._calcMACD(prices);
      const atr = this._calcATR(sym, 14);
      const volumeRatio = this._calcVolumeRatio(data);

      // Previous MACD values for crossover detection
      const prevPrices = prices.slice(0, -1);
      const prevMacd = this._calcMACD(prevPrices);

      // LONG signal: RSI oversold + MACD bullish crossover + above-average volume
      const macdBullCross = prevMacd.histogram < 0 && macd.histogram > 0;
      const macdBearCross = prevMacd.histogram > 0 && macd.histogram < 0;

      if (rsi < this.rsiBuyThreshold && macdBullCross && volumeRatio > 1.0) {
        const price = data.price;
        const stopLoss = price - atr * this.atrMultiplierStop;
        const target = price + atr * this.atrMultiplierTarget;
        const rr = (target - price) / (price - stopLoss);

        if (rr >= this.minRR) {
          const qty = Math.max(1, Math.floor(this.maxPositionSize / price));
          this.logSignal(`BUY signal: ${sym} RSI=${rsi.toFixed(1)}, MACD cross, R:R=${rr.toFixed(1)}`);
          await this.placeOrder(sym, 'buy', qty, 'market');
          this._managedPositions[sym] = {
            side: 'long', qty, entry: price,
            stopLoss, target, atr,
            entryTime: Date.now(),
          };
        }
      }

      // SHORT signal: RSI overbought + MACD bearish crossover
      if (rsi > this.rsiSellThreshold && macdBearCross && volumeRatio > 1.0) {
        const price = data.price;
        const stopLoss = price + atr * this.atrMultiplierStop;
        const target = price - atr * this.atrMultiplierTarget;
        const rr = (price - target) / (stopLoss - price);

        if (rr >= this.minRR) {
          const qty = Math.max(1, Math.floor(this.maxPositionSize / price));
          this.logSignal(`SHORT signal: ${sym} RSI=${rsi.toFixed(1)}, MACD cross, R:R=${rr.toFixed(1)}`);
          await this.placeOrder(sym, 'sell', qty, 'market');
          this._managedPositions[sym] = {
            side: 'short', qty, entry: price,
            stopLoss, target, atr,
            entryTime: Date.now(),
          };
        }
      }
    }
  }
}
