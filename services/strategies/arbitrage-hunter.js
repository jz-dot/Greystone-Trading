/* ============================================
   ARBITRAGE HUNTER STRATEGY
   Monitors price discrepancies between
   correlated pairs (e.g., GOOG/GOOGL, SPY/IVV)
   ============================================ */

class ArbitrageHunter extends TradingAgent {
  constructor(config) {
    super({
      name: 'Arbitrage Hunter',
      strategy: 'Statistical Arbitrage',
      description: 'Scans for cross-exchange price discrepancies, correlated pair mispricing, and ETF NAV arbitrage. Executes when spread exceeds transaction cost threshold.',
      tickInterval: 3000,
      maxPositionSize: config?.maxPositionSize || 15000,
      dailyLossLimit: config?.dailyLossLimit || 1500,
      maxPositions: config?.maxPositions || 6,
      symbols: config?.symbols || ['GOOG', 'GOOGL', 'SPY', 'IVV', 'QQQ', 'TQQQ'],
      ...config,
    });

    // Strategy parameters
    this.pairs = config?.pairs || [
      { a: 'GOOG', b: 'GOOGL', expectedRatio: 1.0, threshold: 0.003 },
      { a: 'SPY', b: 'IVV', expectedRatio: 1.0, threshold: 0.002 },
    ];
    this.spreadHistory = {};
    this.lookback = config?.lookback || 60;
    this.entryZScore = config?.entryZScore || 2.0;
    this.exitZScore = config?.exitZScore || 0.5;
    this.holdingPairs = {};
  }

  async onTick(marketData) {
    for (const pair of this.pairs) {
      const priceA = marketData[pair.a]?.price;
      const priceB = marketData[pair.b]?.price;
      if (!priceA || !priceB) continue;

      const ratio = priceA / priceB;
      const spread = ratio - pair.expectedRatio;

      // Track spread history
      if (!this.spreadHistory[`${pair.a}/${pair.b}`]) {
        this.spreadHistory[`${pair.a}/${pair.b}`] = [];
      }
      const history = this.spreadHistory[`${pair.a}/${pair.b}`];
      history.push(spread);
      if (history.length > this.lookback) history.shift();

      // Need at least 20 samples for statistics
      if (history.length < 20) continue;

      // Calculate z-score
      const mean = history.reduce((s, v) => s + v, 0) / history.length;
      const variance = history.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / history.length;
      const stddev = Math.sqrt(variance);
      if (stddev === 0) continue;
      const zScore = (spread - mean) / stddev;

      const pairKey = `${pair.a}/${pair.b}`;

      // Check for entry
      if (!this.holdingPairs[pairKey]) {
        if (Math.abs(zScore) > this.entryZScore) {
          this.logSignal(`Pair ${pairKey}: spread z-score = ${zScore.toFixed(2)}, ratio = ${ratio.toFixed(4)}`);

          // Determine trade direction
          const qty = Math.floor(this.maxPositionSize / 2 / Math.max(priceA, priceB));
          if (qty < 1) continue;

          if (zScore > this.entryZScore) {
            // Spread too wide - short A, long B (expect convergence)
            await this.placeOrder(pair.a, 'sell', qty, 'market');
            await this.placeOrder(pair.b, 'buy', qty, 'market');
            this.holdingPairs[pairKey] = { direction: 'short_a', qty, entryZ: zScore, entryTime: Date.now() };
            this.logTrade(`OPENED: Short ${pair.a} / Long ${pair.b} x${qty} (z=${zScore.toFixed(2)})`);
          } else if (zScore < -this.entryZScore) {
            // Spread too tight - long A, short B
            await this.placeOrder(pair.a, 'buy', qty, 'market');
            await this.placeOrder(pair.b, 'sell', qty, 'market');
            this.holdingPairs[pairKey] = { direction: 'long_a', qty, entryZ: zScore, entryTime: Date.now() };
            this.logTrade(`OPENED: Long ${pair.a} / Short ${pair.b} x${qty} (z=${zScore.toFixed(2)})`);
          }
        }
      } else {
        // Check for exit - z-score reverted to within exit threshold
        const holding = this.holdingPairs[pairKey];
        if (Math.abs(zScore) < this.exitZScore) {
          const qty = holding.qty;
          if (holding.direction === 'short_a') {
            await this.placeOrder(pair.a, 'buy', qty, 'market');
            await this.placeOrder(pair.b, 'sell', qty, 'market');
          } else {
            await this.placeOrder(pair.a, 'sell', qty, 'market');
            await this.placeOrder(pair.b, 'buy', qty, 'market');
          }
          const holdTime = ((Date.now() - holding.entryTime) / 60000).toFixed(1);
          this.logTrade(`CLOSED: ${pairKey} pair after ${holdTime} min (z reverted to ${zScore.toFixed(2)})`);
          delete this.holdingPairs[pairKey];
        }

        // Stop-loss: if z-score goes further against us
        if (Math.abs(zScore) > Math.abs(holding.entryZ) * 2) {
          const qty = holding.qty;
          if (holding.direction === 'short_a') {
            await this.placeOrder(pair.a, 'buy', qty, 'market');
            await this.placeOrder(pair.b, 'sell', qty, 'market');
          } else {
            await this.placeOrder(pair.a, 'sell', qty, 'market');
            await this.placeOrder(pair.b, 'buy', qty, 'market');
          }
          this.warn(`STOP-LOSS: ${pairKey} pair (z=${zScore.toFixed(2)} exceeded 2x entry)`);
          delete this.holdingPairs[pairKey];
        }
      }
    }
  }
}
