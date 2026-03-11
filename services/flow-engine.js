/* ============================================
   GREYSTONE TRADING PLATFORM - Flow Engine
   Institutional-grade options flow generation
   ============================================ */

const FlowEngine = (function() {

  // --- Ticker universe with realistic base data ---
  const TICKERS = {
    NVDA:  { price: 924.00, avgDailyVol: 42000000, optionsAvgVol: 1200000, ivBase: 48, beta: 1.8, sector: 'Tech' },
    AAPL:  { price: 227.48, avgDailyVol: 58000000, optionsAvgVol: 900000,  ivBase: 22, beta: 1.1, sector: 'Tech' },
    TSLA:  { price: 249.30, avgDailyVol: 95000000, optionsAvgVol: 2800000, ivBase: 55, beta: 2.0, sector: 'Consumer' },
    MSFT:  { price: 419.20, avgDailyVol: 22000000, optionsAvgVol: 450000,  ivBase: 24, beta: 1.0, sector: 'Tech' },
    META:  { price: 513.40, avgDailyVol: 18000000, optionsAvgVol: 380000,  ivBase: 32, beta: 1.3, sector: 'Tech' },
    AMZN:  { price: 186.50, avgDailyVol: 47000000, optionsAvgVol: 620000,  ivBase: 30, beta: 1.2, sector: 'Consumer' },
    AMD:   { price: 179.20, avgDailyVol: 52000000, optionsAvgVol: 900000,  ivBase: 45, beta: 1.7, sector: 'Tech' },
    GOOGL: { price: 167.30, avgDailyVol: 28000000, optionsAvgVol: 350000,  ivBase: 26, beta: 1.1, sector: 'Tech' },
    SPY:   { price: 584.23, avgDailyVol: 75000000, optionsAvgVol: 8500000, ivBase: 16, beta: 1.0, sector: 'Index' },
    QQQ:   { price: 497.81, avgDailyVol: 45000000, optionsAvgVol: 3200000, ivBase: 20, beta: 1.1, sector: 'Index' },
    NFLX:  { price: 892.50, avgDailyVol: 8000000,  optionsAvgVol: 280000,  ivBase: 35, beta: 1.4, sector: 'Tech' },
    JPM:   { price: 242.80, avgDailyVol: 12000000, optionsAvgVol: 180000,  ivBase: 22, beta: 1.1, sector: 'Finance' },
    XOM:   { price: 108.60, avgDailyVol: 16000000, optionsAvgVol: 250000,  ivBase: 26, beta: 0.8, sector: 'Energy' },
    COIN:  { price: 267.40, avgDailyVol: 14000000, optionsAvgVol: 420000,  ivBase: 65, beta: 2.5, sector: 'Crypto' },
    PLTR:  { price: 78.90,  avgDailyVol: 55000000, optionsAvgVol: 1500000, ivBase: 52, beta: 1.9, sector: 'Tech' },
  };

  const TICKER_NAMES = Object.keys(TICKERS);

  // Expiration dates (Fridays going forward)
  const EXPIRATIONS = ['3/14', '3/21', '3/28', '4/4', '4/18', '5/16', '6/20', '9/19', '12/19', '1/16/26'];
  const EXPIRY_DAYS = [4, 11, 18, 25, 39, 67, 102, 193, 284, 312];

  // Exchange venues for sweep orders
  const EXCHANGES = ['CBOE', 'ISE', 'PHLX', 'AMEX', 'BOX', 'MIAX', 'PEARL', 'EMLD', 'EDGX', 'C2', 'BATS', 'ARCA'];

  // Dark pool venues
  const DP_VENUES = ['FADF', 'UBSS', 'CODA', 'JNST', 'BATS', 'IEXG', 'LTSE', 'MEMX', 'DRCT', 'SGMA', 'VIRX', 'CITD', 'GSCO', 'MSPL'];

  // --- Cumulative flow tracking ---
  const flowHistory = [];
  const netFlowByTicker = {};
  const contractVolume = {};
  const darkPoolHistory = [];
  let totalCallPremium = 0;
  let totalPutPremium = 0;
  let unusualCount = 0;
  let sweepCount = 0;
  let blockCount = 0;
  const netFlowTimeSeries = []; // { time, cumNet }

  // --- Power law distribution for realistic size generation ---
  // Many small trades, few large ones
  function powerLawSize(min, max, alpha) {
    const u = Math.random();
    const xMin = min;
    const xMax = max;
    // Inverse CDF of power law
    return Math.floor(Math.pow(
      (Math.pow(xMax, alpha + 1) - Math.pow(xMin, alpha + 1)) * u + Math.pow(xMin, alpha + 1),
      1 / (alpha + 1)
    ));
  }

  // --- Simplified Black-Scholes for option pricing ---
  function normalCDF(x) {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
    const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);
    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return 0.5 * (1.0 + sign * y);
  }

  function blackScholesPrice(spot, strike, T, r, sigma, isCall) {
    if (T <= 0) return Math.max(0, isCall ? spot - strike : strike - spot);
    const d1 = (Math.log(spot / strike) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    if (isCall) {
      return spot * normalCDF(d1) - strike * Math.exp(-r * T) * normalCDF(d2);
    } else {
      return strike * Math.exp(-r * T) * normalCDF(-d2) - spot * normalCDF(-d1);
    }
  }

  function blackScholesDelta(spot, strike, T, r, sigma, isCall) {
    if (T <= 0) return isCall ? (spot > strike ? 1 : 0) : (spot < strike ? -1 : 0);
    const d1 = (Math.log(spot / strike) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    return isCall ? normalCDF(d1) : normalCDF(d1) - 1;
  }

  // --- Generate a realistic strike price ---
  function generateStrike(ticker, isCall) {
    const data = TICKERS[ticker];
    const spot = data.price;
    // Skew toward OTM options (more common flow)
    // Normal distribution centered slightly OTM
    const otmBias = isCall ? 1.02 : 0.98;
    const spread = spot * 0.08; // 8% range
    const raw = spot * otmBias + (Math.random() + Math.random() + Math.random() - 1.5) * spread;
    // Round to standard strike intervals
    if (spot > 500) return Math.round(raw / 5) * 5;
    if (spot > 100) return Math.round(raw / 2.5) * 2.5;
    if (spot > 50) return Math.round(raw);
    return Math.round(raw * 2) / 2;
  }

  // --- Determine signal type ---
  function determineSignal(size, ticker, premium) {
    const data = TICKERS[ticker];
    const avgDailyOptVol = data.optionsAvgVol;
    // Power law: ~60% normal, ~20% sweep, ~12% block, ~8% unusual
    const rand = Math.random();

    // Unusual: volume > 3x 20-day avg OI approximation
    if (size > avgDailyOptVol * 0.003 || premium > 500000) {
      if (rand < 0.5) return 'unusual';
    }

    // Sweep: split across exchanges, typically medium-large
    if (size > 200 && premium > 50000 && rand < 0.35) {
      return 'sweep';
    }

    // Block: single large print
    if (size > 500 && premium > 100000 && rand < 0.25) {
      return 'block';
    }

    return '';
  }

  // --- Generate sweep exchange breakdown ---
  function generateSweepExchanges(totalSize) {
    const numExchanges = 2 + Math.floor(Math.random() * 4); // 2-5 exchanges
    const exchanges = [];
    let remaining = totalSize;
    const shuffled = [...EXCHANGES].sort(() => Math.random() - 0.5).slice(0, numExchanges);

    for (let i = 0; i < shuffled.length; i++) {
      const isLast = i === shuffled.length - 1;
      const portion = isLast ? remaining : Math.floor(remaining * (0.15 + Math.random() * 0.45));
      exchanges.push({ venue: shuffled[i], size: portion });
      remaining -= portion;
    }
    return exchanges;
  }

  // --- Core: Generate a single flow entry ---
  function generateFlowEntry() {
    // Weight selection toward higher-volume tickers
    const weights = TICKER_NAMES.map(t => Math.sqrt(TICKERS[t].optionsAvgVol));
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * totalWeight;
    let tickerIdx = 0;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) { tickerIdx = i; break; }
    }
    const ticker = TICKER_NAMES[tickerIdx];
    const data = TICKERS[ticker];

    const isCall = Math.random() > 0.44; // slight call bias (realistic)
    const strike = generateStrike(ticker, isCall);

    // Expiration: weight toward near-term
    const expWeights = [25, 20, 18, 12, 8, 6, 4, 3, 2, 2];
    let expR = Math.random() * expWeights.reduce((a, b) => a + b, 0);
    let expIdx = 0;
    for (let i = 0; i < expWeights.length; i++) {
      expR -= expWeights[i];
      if (expR <= 0) { expIdx = i; break; }
    }
    const exp = EXPIRATIONS[expIdx];
    const daysToExp = EXPIRY_DAYS[expIdx];
    const T = daysToExp / 365;

    // IV with skew (OTM puts have higher IV, smile curve)
    const moneyness = (data.price - strike) / data.price;
    const skew = isCall
      ? Math.max(0, moneyness * -15) // OTM calls slightly lower IV
      : Math.max(0, moneyness * 20);  // OTM puts higher IV
    const ivNoise = (Math.random() - 0.5) * 8;
    const iv = Math.max(10, data.ivBase + skew + ivNoise + (daysToExp < 10 ? 5 : 0));
    const sigma = iv / 100;

    // Price via Black-Scholes
    const riskFreeRate = 0.043; // ~4.3% fed funds
    let theoPrice = blackScholesPrice(data.price, strike, T, riskFreeRate, sigma, isCall);
    theoPrice = Math.max(0.01, theoPrice);

    // Bid/ask spread (tighter for liquid, wider for illiquid)
    const liquidityFactor = data.optionsAvgVol > 1000000 ? 0.015 : data.optionsAvgVol > 500000 ? 0.025 : 0.04;
    const halfSpread = Math.max(0.01, theoPrice * liquidityFactor * (0.8 + Math.random() * 0.4));
    const bid = Math.max(0.01, theoPrice - halfSpread);
    const ask = theoPrice + halfSpread;

    // Size: power law distribution
    const size = powerLawSize(10, 8000, -1.8);

    // Side: at Ask = bullish, at Bid = bearish, Mid = neutral
    const sideRand = Math.random();
    let side, fillPrice;
    if (sideRand < 0.42) {
      side = 'Ask';
      fillPrice = ask;
    } else if (sideRand < 0.78) {
      side = 'Bid';
      fillPrice = bid;
    } else {
      side = 'Mid';
      fillPrice = (bid + ask) / 2;
    }

    const premium = size * fillPrice * 100;
    const signal = determineSignal(size, ticker, premium);
    const delta = blackScholesDelta(data.price, strike, T, riskFreeRate, sigma, isCall);

    // Sweep details
    let sweepExchanges = null;
    if (signal === 'sweep') {
      sweepExchanges = generateSweepExchanges(size);
    }

    const now = new Date();
    // Generate realistic market hours time
    const hour = 9 + Math.floor(Math.random() * 6.5);
    const min = Math.floor(Math.random() * 60);
    const sec = Math.floor(Math.random() * 60);
    const timeStr = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;

    const entry = {
      id: Date.now() + Math.floor(Math.random() * 10000),
      time: timeStr,
      timestamp: now.getTime(),
      ticker,
      isCall,
      type: isCall ? 'Call' : 'Put',
      strike,
      exp,
      daysToExp,
      side,
      size,
      fillPrice: parseFloat(fillPrice.toFixed(2)),
      bid: parseFloat(bid.toFixed(2)),
      ask: parseFloat(ask.toFixed(2)),
      premium,
      iv: parseFloat(iv.toFixed(1)),
      delta: parseFloat(delta.toFixed(3)),
      signal,
      sweepExchanges,
      spot: data.price,
      sector: data.sector,
    };

    // Track cumulative stats
    _trackEntry(entry);

    return entry;
  }

  // --- Track entry in aggregates ---
  function _trackEntry(entry) {
    flowHistory.push(entry);
    if (flowHistory.length > 2000) flowHistory.shift();

    // Net flow per ticker
    if (!netFlowByTicker[entry.ticker]) {
      netFlowByTicker[entry.ticker] = { callPremium: 0, putPremium: 0, totalVolume: 0, entries: 0 };
    }
    const nf = netFlowByTicker[entry.ticker];
    if (entry.isCall) {
      nf.callPremium += entry.premium;
      totalCallPremium += entry.premium;
    } else {
      nf.putPremium += entry.premium;
      totalPutPremium += entry.premium;
    }
    nf.totalVolume += entry.size;
    nf.entries++;

    // Contract volume tracking
    const contractKey = `${entry.ticker} $${entry.strike}${entry.isCall ? 'C' : 'P'} ${entry.exp}`;
    if (!contractVolume[contractKey]) {
      contractVolume[contractKey] = { volume: 0, premium: 0, ticker: entry.ticker, strike: entry.strike, isCall: entry.isCall, exp: entry.exp };
    }
    contractVolume[contractKey].volume += entry.size;
    contractVolume[contractKey].premium += entry.premium;

    // Signal counts
    if (entry.signal === 'unusual') unusualCount++;
    if (entry.signal === 'sweep') sweepCount++;
    if (entry.signal === 'block') blockCount++;

    // Net flow time series
    const cumNet = totalCallPremium - totalPutPremium;
    netFlowTimeSeries.push({ time: entry.timestamp, cumNet, callPremium: totalCallPremium, putPremium: totalPutPremium });
    if (netFlowTimeSeries.length > 500) netFlowTimeSeries.shift();
  }

  // --- Get net flow for a ticker ---
  function getNetFlow(ticker) {
    if (ticker) {
      const nf = netFlowByTicker[ticker];
      if (!nf) return { callPremium: 0, putPremium: 0, net: 0, pcRatio: 0 };
      return {
        callPremium: nf.callPremium,
        putPremium: nf.putPremium,
        net: nf.callPremium - nf.putPremium,
        pcRatio: nf.putPremium > 0 ? nf.callPremium / nf.putPremium : Infinity,
        totalVolume: nf.totalVolume,
      };
    }
    return {
      callPremium: totalCallPremium,
      putPremium: totalPutPremium,
      net: totalCallPremium - totalPutPremium,
      pcRatio: totalPutPremium > 0 ? totalCallPremium / totalPutPremium : Infinity,
    };
  }

  // --- Hottest contracts by cumulative volume ---
  function getHottestContracts(limit) {
    limit = limit || 8;
    return Object.entries(contractVolume)
      .map(([key, data]) => ({
        contract: key,
        volume: data.volume,
        premium: data.premium,
        ticker: data.ticker,
        isCall: data.isCall,
      }))
      .sort((a, b) => b.premium - a.premium)
      .slice(0, limit);
  }

  // --- Dark pool block trade generation ---
  function generateDarkPoolPrint() {
    // Weight toward mega-cap / high-ADV tickers
    const dpTickers = ['NVDA', 'AAPL', 'TSLA', 'MSFT', 'META', 'AMZN', 'AMD', 'GOOGL', 'SPY', 'QQQ', 'JPM', 'XOM', 'NFLX'];
    const ticker = dpTickers[Math.floor(Math.random() * dpTickers.length)];
    const data = TICKERS[ticker];

    // Size follows power law: many small, few mega
    const shareSize = powerLawSize(5000, 500000, -1.5);

    // Price near spot with slight offset
    const priceOffset = (Math.random() - 0.5) * data.price * 0.003;
    const price = data.price + priceOffset;
    const value = shareSize * price;

    // Size category
    let sizeCategory = 'normal';
    if (value >= 50000000) sizeCategory = 'mega';
    else if (value >= 10000000) sizeCategory = 'large';

    // % of ADV
    const pctADV = (shareSize / data.avgDailyVol) * 100;

    const venue = DP_VENUES[Math.floor(Math.random() * DP_VENUES.length)];
    const now = new Date();
    const hour = 9 + Math.floor(Math.random() * 6.5);
    const min = Math.floor(Math.random() * 60);
    const sec = Math.floor(Math.random() * 60);
    const timeStr = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;

    // Infer direction from price vs spot
    const direction = priceOffset > 0 ? 'above' : priceOffset < 0 ? 'below' : 'at';

    const print = {
      id: Date.now() + Math.floor(Math.random() * 10000),
      time: timeStr,
      timestamp: now.getTime(),
      ticker,
      size: shareSize,
      price: parseFloat(price.toFixed(2)),
      value,
      venue,
      sizeCategory,
      pctADV: parseFloat(pctADV.toFixed(2)),
      direction,
      spot: data.price,
    };

    darkPoolHistory.push(print);
    if (darkPoolHistory.length > 200) darkPoolHistory.shift();

    return print;
  }

  function getDarkPoolPrints(limit) {
    limit = limit || 10;
    return darkPoolHistory.slice(-limit).reverse();
  }

  // --- Filter flow entries ---
  function filterFlow(filters) {
    let results = [...flowHistory];

    if (filters.ticker && filters.ticker !== 'all') {
      results = results.filter(e => e.ticker === filters.ticker);
    }
    if (filters.type === 'calls') {
      results = results.filter(e => e.isCall);
    } else if (filters.type === 'puts') {
      results = results.filter(e => !e.isCall);
    }
    if (filters.minPremium) {
      results = results.filter(e => e.premium >= filters.minPremium);
    }
    if (filters.signal && filters.signal !== 'all') {
      results = results.filter(e => e.signal === filters.signal);
    }

    return results;
  }

  // --- Flow summary stats ---
  function getFlowSummary() {
    const darkPoolValue = darkPoolHistory.reduce((sum, p) => sum + p.value, 0);
    const totalOptPremium = totalCallPremium + totalPutPremium;
    const darkPoolPct = totalOptPremium > 0 ? (darkPoolValue / (darkPoolValue + totalOptPremium)) * 100 : 0;

    return {
      netPremium: totalCallPremium - totalPutPremium,
      callPremium: totalCallPremium,
      putPremium: totalPutPremium,
      unusualCount,
      sweepCount,
      blockCount,
      totalEntries: flowHistory.length,
      darkPoolPct: Math.min(45, Math.max(25, darkPoolPct || 34.2)),
      pcRatio: totalPutPremium > 0 ? (totalCallPremium / totalPutPremium).toFixed(2) : 'N/A',
    };
  }

  // --- Net flow time series for charting ---
  function getNetFlowTimeSeries() {
    return netFlowTimeSeries;
  }

  // --- Ticker list ---
  function getTickerList() {
    return TICKER_NAMES;
  }

  function getTickerData(ticker) {
    return TICKERS[ticker] || null;
  }

  // --- Pre-populate with historical data ---
  function seedHistory(count) {
    count = count || 40;
    for (let i = 0; i < count; i++) {
      generateFlowEntry();
    }
    // Seed some dark pool prints too
    for (let i = 0; i < 8; i++) {
      generateDarkPoolPrint();
    }
  }

  return {
    generateFlowEntry,
    generateDarkPoolPrint,
    getNetFlow,
    getHottestContracts,
    getDarkPoolPrints,
    filterFlow,
    getFlowSummary,
    getNetFlowTimeSeries,
    getTickerList,
    getTickerData,
    seedHistory,
    flowHistory,
    darkPoolHistory,
    TICKERS,
  };

})();
