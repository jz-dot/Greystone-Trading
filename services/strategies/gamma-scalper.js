/* ============================================
   GAMMA SCALPER STRATEGY
   Delta-neutral strategy that profits from
   gamma by rebalancing when underlying moves
   ============================================ */

class GammaScalper extends TradingAgent {
  constructor(config) {
    super({
      name: 'Gamma Scalper',
      strategy: 'Gamma Scalping',
      description: 'Delta-neutral options strategy that profits from gamma by continuously rebalancing. Targets high-IV names near expiration. Best in volatile, range-bound markets.',
      tickInterval: 5000,
      maxPositionSize: config?.maxPositionSize || 20000,
      dailyLossLimit: config?.dailyLossLimit || 1500,
      maxPositions: config?.maxPositions || 3,
      symbols: config?.symbols || ['SPY', 'QQQ', 'AAPL', 'NVDA', 'TSLA'],
      ...config,
    });

    // Strategy parameters
    this.rebalanceThreshold = config?.rebalanceThreshold || 0.50; // $ move before rebalance
    this.gammaTarget = config?.gammaTarget || 0.05; // target gamma exposure
    this.maxDelta = config?.maxDelta || 0.10; // max delta deviation before rebalance
    this.ivFloor = config?.ivFloor || 25; // minimum IV to enter

    // Simulated options positions
    this._optionsPositions = {};
    this._lastRebalancePrice = {};
    this._rebalanceCount = 0;
    this._thetaDecay = 0;
    this._gammaProfit = 0;
    this._priceHistory = {};
  }

  // Simplified Black-Scholes delta approximation
  _calcDelta(spotPrice, strikePrice, tte, iv, isCall) {
    if (tte <= 0) return isCall ? (spotPrice > strikePrice ? 1 : 0) : (spotPrice < strikePrice ? -1 : 0);
    const d1 = (Math.log(spotPrice / strikePrice) + (0.5 * iv * iv) * tte) / (iv * Math.sqrt(tte));
    const nd1 = this._normalCDF(d1);
    return isCall ? nd1 : nd1 - 1;
  }

  _calcGamma(spotPrice, strikePrice, tte, iv) {
    if (tte <= 0 || iv <= 0) return 0;
    const d1 = (Math.log(spotPrice / strikePrice) + (0.5 * iv * iv) * tte) / (iv * Math.sqrt(tte));
    const phi = Math.exp(-d1 * d1 / 2) / Math.sqrt(2 * Math.PI);
    return phi / (spotPrice * iv * Math.sqrt(tte));
  }

  _calcTheta(spotPrice, strikePrice, tte, iv, isCall) {
    if (tte <= 0 || iv <= 0) return 0;
    const d1 = (Math.log(spotPrice / strikePrice) + (0.5 * iv * iv) * tte) / (iv * Math.sqrt(tte));
    const phi = Math.exp(-d1 * d1 / 2) / Math.sqrt(2 * Math.PI);
    return -(spotPrice * phi * iv) / (2 * Math.sqrt(tte)) / 365;
  }

  _normalCDF(x) {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
    const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);
    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return 0.5 * (1.0 + sign * y);
  }

  _getSimIV(symbol) {
    // Simulated IV based on symbol volatility profile
    const ivMap = { SPY: 18, QQQ: 22, AAPL: 28, NVDA: 45, TSLA: 55 };
    const base = ivMap[symbol] || 30;
    return (base + (Math.random() - 0.5) * 5) / 100;
  }

  async onTick(marketData) {
    for (const symbol of this.symbols) {
      const data = marketData[symbol];
      if (!data) continue;

      // Track price history
      if (!this._priceHistory[symbol]) this._priceHistory[symbol] = [];
      this._priceHistory[symbol].push(data.price);
      if (this._priceHistory[symbol].length > 100) this._priceHistory[symbol].shift();

      const iv = this._getSimIV(symbol);

      // Check if we should enter a new position
      if (!this._optionsPositions[symbol] && iv * 100 >= this.ivFloor) {
        await this._enterPosition(symbol, data.price, iv);
      }

      // If in position, check for rebalance
      if (this._optionsPositions[symbol]) {
        await this._checkRebalance(symbol, data.price, iv);
      }
    }
  }

  async _enterPosition(symbol, price, iv) {
    // Only enter if we have room
    if (Object.keys(this._optionsPositions).length >= this.maxPositions) return;

    const tte = 14 / 365; // ~2 weeks to expiration
    const strikePrice = Math.round(price / 5) * 5; // ATM rounded to nearest $5

    // Simulate buying a straddle (long call + long put at same strike)
    const callDelta = this._calcDelta(price, strikePrice, tte, iv, true);
    const putDelta = this._calcDelta(price, strikePrice, tte, iv, false);
    const netDelta = callDelta + putDelta;
    const gamma = this._calcGamma(price, strikePrice, tte, iv) * 2; // straddle gamma
    const theta = this._calcTheta(price, strikePrice, tte, iv, true) + this._calcTheta(price, strikePrice, tte, iv, false);

    // Cost of straddle (simplified)
    const straddleCost = price * iv * Math.sqrt(tte) * 0.8;
    const contracts = Math.max(1, Math.floor(this.maxPositionSize / (straddleCost * 100)));

    this._optionsPositions[symbol] = {
      strike: strikePrice,
      contracts,
      tte,
      entryPrice: price,
      entryIV: iv,
      entryTime: Date.now(),
      netDelta: netDelta * contracts * 100,
      gamma: gamma * contracts * 100,
      theta: theta * contracts * 100,
      hedgeShares: 0,
      straddleCost: straddleCost * contracts * 100,
    };

    this._lastRebalancePrice[symbol] = price;

    // Hedge initial delta
    const hedgeQty = Math.round(-netDelta * contracts * 100);
    if (Math.abs(hedgeQty) > 0) {
      const side = hedgeQty > 0 ? 'buy' : 'sell';
      await this.placeOrder(symbol, side, Math.abs(hedgeQty), 'market');
      this._optionsPositions[symbol].hedgeShares = hedgeQty;
    }

    this.logTrade(`ENTERED straddle: ${symbol} ${strikePrice} strike x${contracts}, delta-hedged ${hedgeQty} shares. IV=${(iv * 100).toFixed(1)}%`);
  }

  async _checkRebalance(symbol, currentPrice, iv) {
    const pos = this._optionsPositions[symbol];
    const lastPrice = this._lastRebalancePrice[symbol];
    const priceDiff = Math.abs(currentPrice - lastPrice);

    if (priceDiff < this.rebalanceThreshold) return;

    // Recalculate Greeks
    const elapsed = (Date.now() - pos.entryTime) / (365.25 * 24 * 60 * 60 * 1000);
    const remainingTTE = Math.max(0.001, pos.tte - elapsed);

    const callDelta = this._calcDelta(currentPrice, pos.strike, remainingTTE, iv, true);
    const putDelta = this._calcDelta(currentPrice, pos.strike, remainingTTE, iv, false);
    const newNetDelta = (callDelta + putDelta) * pos.contracts * 100;
    const gamma = this._calcGamma(currentPrice, pos.strike, remainingTTE, iv) * 2 * pos.contracts * 100;

    // Calculate delta change and required hedge adjustment
    const currentTotalDelta = newNetDelta + pos.hedgeShares;

    if (Math.abs(currentTotalDelta) < 5) return; // close enough to neutral

    // Rebalance: trade shares to neutralize delta
    const hedgeAdj = -Math.round(currentTotalDelta);
    if (Math.abs(hedgeAdj) < 1) return;

    const side = hedgeAdj > 0 ? 'buy' : 'sell';
    await this.placeOrder(symbol, side, Math.abs(hedgeAdj), 'market');

    // Track gamma profit from the move
    const gammaProfit = 0.5 * pos.gamma * Math.pow(priceDiff, 2);
    this._gammaProfit += gammaProfit;

    // Track theta decay
    const thetaDecay = Math.abs(pos.theta) * (priceDiff / currentPrice); // approximate
    this._thetaDecay += thetaDecay;

    pos.hedgeShares += hedgeAdj;
    pos.netDelta = newNetDelta;
    pos.gamma = gamma;
    this._lastRebalancePrice[symbol] = currentPrice;
    this._rebalanceCount++;

    this.info(`REBALANCE ${symbol}: ${side} ${Math.abs(hedgeAdj)} shares. Move=$${priceDiff.toFixed(2)}, gamma P&L=+$${gammaProfit.toFixed(0)}`);

    // Check if option is expired (simplified)
    if (remainingTTE <= 0.001) {
      this._closePosition(symbol, currentPrice);
    }
  }

  async _closePosition(symbol, price) {
    const pos = this._optionsPositions[symbol];
    if (!pos) return;

    // Close hedge shares
    if (pos.hedgeShares !== 0) {
      const side = pos.hedgeShares > 0 ? 'sell' : 'buy';
      await this.placeOrder(symbol, side, Math.abs(pos.hedgeShares), 'market');
    }

    const holdMinutes = ((Date.now() - pos.entryTime) / 60000).toFixed(0);
    this.logTrade(`CLOSED ${symbol} straddle after ${holdMinutes} min. Rebalances: ${this._rebalanceCount}. Gamma P&L: $${this._gammaProfit.toFixed(0)}`);

    delete this._optionsPositions[symbol];
    delete this._lastRebalancePrice[symbol];
  }

  getStats() {
    const base = super.getStats();
    return {
      ...base,
      rebalanceCount: this._rebalanceCount,
      gammaProfit: this._gammaProfit,
      thetaDecay: this._thetaDecay,
      netGammaPnL: this._gammaProfit - this._thetaDecay,
      activeStraddles: Object.keys(this._optionsPositions).length,
    };
  }
}
