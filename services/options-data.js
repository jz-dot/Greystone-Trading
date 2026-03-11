/* ============================================
   OPTIONS DATA SERVICE
   Fetches real options chains, calculates Greeks,
   builds IV surfaces, and computes strategy P&L
   ============================================ */

// Use BlackScholes from global scope (browser) or require (Node)
const BS = (typeof BlackScholes !== 'undefined') ? BlackScholes :
           (typeof require !== 'undefined') ? require('./black-scholes') : null;

// Risk-free rate (10Y Treasury yield approximation)
const RISK_FREE_RATE = 0.043;

// API base: use local proxy when available, otherwise direct Yahoo Finance
const API_BASE = (() => {
  if (typeof window !== 'undefined' && window.location) {
    // In browser, try the proxy server first
    const port = window.location.port || (window.location.protocol === 'https:' ? '443' : '80');
    // If we're served from the Express server, use same origin
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return `${window.location.protocol}//${window.location.hostname}:3927`;
    }
  }
  return null;
})();

// In-memory cache
const _cache = {};
const CACHE_TTL = 30000; // 30 seconds

function getCached(key) {
  const entry = _cache[key];
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  return null;
}

function setCache(key, data) {
  _cache[key] = { data, ts: Date.now() };
}

// ---- DATA FETCHING ----

/**
 * Fetch options chain from proxy server or generate simulated data
 * @param {string} symbol - ticker symbol (e.g. 'AAPL')
 * @param {number|null} expirationDate - Unix timestamp for expiration, or null for all
 * @returns {Promise<object>} parsed chain with calls, puts, expirations, quote
 */
async function getOptionsChain(symbol, expirationDate) {
  const cacheKey = `chain:${symbol}:${expirationDate || 'all'}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    let data;
    if (API_BASE) {
      const url = expirationDate
        ? `${API_BASE}/api/options/${symbol}/${expirationDate}`
        : `${API_BASE}/api/options/${symbol}`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      data = await resp.json();
    } else {
      throw new Error('No API available');
    }

    if (data && data.calls && data.calls.length > 0) {
      // Enrich with calculated Greeks
      const enriched = enrichChainWithGreeks(data);
      setCache(cacheKey, enriched);
      return enriched;
    }
    throw new Error('Empty chain data');
  } catch (err) {
    console.warn('Options fetch failed, using simulated data:', err.message);
    const simulated = generateSimulatedChain(symbol, expirationDate);
    setCache(cacheKey, simulated);
    return simulated;
  }
}

/**
 * Get available expiration dates for a symbol
 * @param {string} symbol
 * @returns {Promise<Array<{date: string, timestamp: number, dte: number}>>}
 */
async function getExpirations(symbol) {
  const cacheKey = `exp:${symbol}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    if (API_BASE) {
      const resp = await fetch(`${API_BASE}/api/options/${symbol}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      if (data.expirations && data.expirations.length > 0) {
        const result = data.expirations.map(ts => {
          const d = new Date(ts * 1000);
          const now = new Date();
          const dte = Math.max(0, Math.ceil((d - now) / (1000 * 60 * 60 * 24)));
          return {
            date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
            timestamp: ts,
            dte: dte,
          };
        });
        setCache(cacheKey, result);
        return result;
      }
    }
    throw new Error('No API');
  } catch (err) {
    // Generate simulated expirations
    const result = generateSimulatedExpirations();
    setCache(cacheKey, result);
    return result;
  }
}

// ---- GREEKS CALCULATION ----

/**
 * Calculate Greeks for a single contract using Black-Scholes
 * @param {number} spot - current underlying price
 * @param {number} strike - option strike price
 * @param {number} tte - time to expiry in years
 * @param {number} rate - risk-free rate
 * @param {number} iv - implied volatility (decimal, e.g. 0.30 for 30%)
 * @param {string} type - 'call' or 'put'
 * @returns {object} { price, delta, gamma, theta, vega, rho }
 */
function calculateGreeks(spot, strike, tte, rate, iv, type) {
  if (!BS) return { price: 0, delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 };
  return BS.calculateAllGreeks(spot, strike, tte, rate, iv, type);
}

/**
 * Enrich a raw chain from the API with calculated Greeks
 */
function enrichChainWithGreeks(data) {
  const spot = data.quote ? data.quote.regularMarketPrice : data.spotPrice || 100;
  const enrichOption = (opt, type) => {
    const expDate = new Date(opt.expiration * 1000 || opt.expirationDate);
    const now = new Date();
    const tte = Math.max(0, (expDate - now) / (1000 * 60 * 60 * 24 * 365));
    const iv = opt.impliedVolatility || 0.30;

    const greeks = calculateGreeks(spot, opt.strike, tte, RISK_FREE_RATE, iv, type);
    return {
      ...opt,
      calculatedGreeks: greeks,
      tte: tte,
      dte: Math.max(0, Math.ceil(tte * 365)),
    };
  };

  return {
    ...data,
    spotPrice: spot,
    calls: (data.calls || []).map(c => enrichOption(c, 'call')),
    puts: (data.puts || []).map(p => enrichOption(p, 'put')),
  };
}

// ---- STRATEGY P&L ----

/**
 * Calculate P&L diagram data for any option strategy
 * @param {Array<object>} legs - array of strategy legs
 *   Each leg: { type: 'call'|'put', strike, premium, quantity, side: 'long'|'short' }
 * @param {object} opts - { minPrice, maxPrice, points, spotPrice }
 * @returns {object} { prices: [], pnl: [], breakevens: [], maxProfit, maxLoss, spotPrice }
 */
function calculatePnL(legs, opts) {
  const { minPrice, maxPrice, points = 200, spotPrice } = opts;
  const prices = [];
  const pnl = [];
  const step = (maxPrice - minPrice) / points;

  for (let i = 0; i <= points; i++) {
    const price = minPrice + step * i;
    prices.push(price);

    let totalPnl = 0;
    legs.forEach(leg => {
      const multiplier = (leg.side === 'long' ? 1 : -1) * (leg.quantity || 1);
      let intrinsicValue;
      if (leg.type === 'call') {
        intrinsicValue = Math.max(0, price - leg.strike);
      } else {
        intrinsicValue = Math.max(0, leg.strike - price);
      }
      // P&L = (intrinsic - premium) * multiplier * 100 (per contract)
      totalPnl += (intrinsicValue - leg.premium) * multiplier * 100;
    });
    pnl.push(totalPnl);
  }

  // Find breakevens (where P&L crosses zero)
  const breakevens = [];
  for (let i = 1; i < pnl.length; i++) {
    if ((pnl[i - 1] <= 0 && pnl[i] > 0) || (pnl[i - 1] >= 0 && pnl[i] < 0)) {
      // Linear interpolation for exact breakeven
      const ratio = Math.abs(pnl[i - 1]) / (Math.abs(pnl[i - 1]) + Math.abs(pnl[i]));
      breakevens.push(prices[i - 1] + ratio * step);
    }
  }

  const maxProfit = Math.max(...pnl);
  const maxLoss = Math.min(...pnl);

  return { prices, pnl, breakevens, maxProfit, maxLoss, spotPrice };
}

// ---- IMPLIED VOLATILITY SURFACE ----

/**
 * Build IV surface data from a chain across multiple expirations
 * @param {Array<object>} chains - array of enriched chain objects (one per expiration)
 * @returns {object} { strikes, expirations, callIV, putIV } - 2D grid data
 */
function getIVSurface(chains) {
  if (!chains || chains.length === 0) return null;

  // Collect all unique strikes
  const strikeSet = new Set();
  chains.forEach(chain => {
    (chain.calls || []).forEach(c => strikeSet.add(c.strike));
    (chain.puts || []).forEach(p => strikeSet.add(p.strike));
  });
  const strikes = Array.from(strikeSet).sort((a, b) => a - b);

  const expirations = chains.map(c => {
    const dte = c.calls && c.calls[0] ? c.calls[0].dte : 0;
    return { dte, label: `${dte}d` };
  });

  // Build 2D grids
  const callIV = [];
  const putIV = [];

  chains.forEach(chain => {
    const callMap = {};
    const putMap = {};
    (chain.calls || []).forEach(c => { callMap[c.strike] = c.impliedVolatility || 0; });
    (chain.puts || []).forEach(p => { putMap[p.strike] = p.impliedVolatility || 0; });

    callIV.push(strikes.map(s => (callMap[s] || 0) * 100));
    putIV.push(strikes.map(s => (putMap[s] || 0) * 100));
  });

  return { strikes, expirations, callIV, putIV };
}

// ---- EXPECTED MOVE ----

/**
 * Calculate expected move based on IV and DTE
 * Uses the straddle approximation: Expected Move ~ S * IV * sqrt(DTE/365)
 * @param {number} spot - current price
 * @param {number} iv - implied volatility (decimal)
 * @param {number} dte - days to expiration
 * @returns {object} { expectedMove, upperBound, lowerBound, oneSD, twoSD }
 */
function getExpectedMove(spot, iv, dte) {
  const sqrtT = Math.sqrt(dte / 365);
  const oneSD = spot * iv * sqrtT;
  const twoSD = oneSD * 2;

  return {
    expectedMove: oneSD,
    upperBound: spot + oneSD,
    lowerBound: spot - oneSD,
    oneSD: { upper: spot + oneSD, lower: spot - oneSD },
    twoSD: { upper: spot + twoSD, lower: spot - twoSD },
  };
}

// ---- SIMULATED DATA GENERATORS (fallback when API unavailable) ----

function generateSimulatedExpirations() {
  const exps = [];
  const now = new Date();
  // Weekly expirations for the next 2 months, monthly after that
  for (let i = 1; i <= 8; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i * 7);
    // Adjust to Friday
    const dayOfWeek = d.getDay();
    const diff = (5 - dayOfWeek + 7) % 7;
    d.setDate(d.getDate() + diff);
    const dte = Math.ceil((d - now) / (1000 * 60 * 60 * 24));
    exps.push({
      date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      timestamp: Math.floor(d.getTime() / 1000),
      dte: dte,
    });
  }
  // Add monthly expirations 3-6 months out
  for (let m = 3; m <= 6; m++) {
    const d = new Date(now);
    d.setMonth(d.getMonth() + m);
    // Third Friday
    d.setDate(1);
    const firstDay = d.getDay();
    const thirdFriday = 1 + ((5 - firstDay + 7) % 7) + 14;
    d.setDate(thirdFriday);
    const dte = Math.ceil((d - now) / (1000 * 60 * 60 * 24));
    exps.push({
      date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      timestamp: Math.floor(d.getTime() / 1000),
      dte: dte,
    });
  }
  return exps;
}

function generateSimulatedChain(symbol, expirationTimestamp) {
  // Simulated spot prices for common tickers
  const spotPrices = {
    AAPL: 227.48, MSFT: 419.32, NVDA: 924.15, TSLA: 249.80,
    META: 513.40, AMZN: 186.75, GOOGL: 167.22, AMD: 179.55,
    SPY: 584.23, QQQ: 497.81, IWM: 207.43,
  };
  const spot = spotPrices[symbol.toUpperCase()] || 100 + Math.random() * 200;

  // Calculate DTE
  let dte = 18;
  if (expirationTimestamp) {
    const expDate = new Date(expirationTimestamp * 1000);
    dte = Math.max(1, Math.ceil((expDate - new Date()) / (1000 * 60 * 60 * 24)));
  }
  const tte = dte / 365;

  // Generate strikes around spot
  const strikeStep = spot > 500 ? 5 : spot > 100 ? 2.5 : 1;
  const nearestStrike = Math.round(spot / strikeStep) * strikeStep;
  const strikes = [];
  for (let i = -12; i <= 12; i++) {
    strikes.push(nearestStrike + i * strikeStep);
  }

  const baseIV = 0.25 + Math.random() * 0.15; // 25-40% base IV

  const calls = [];
  const puts = [];
  const expirations = generateSimulatedExpirations();
  const expTimestamp = expirationTimestamp || expirations[2].timestamp;

  strikes.forEach(strike => {
    const moneyness = Math.log(spot / strike);
    // IV smile: higher IV for OTM options
    const skew = 0.02 * moneyness * moneyness * 100;
    const putSkew = moneyness < 0 ? 0.03 : 0; // Put skew
    const callIV = baseIV + skew;
    const putIV = baseIV + skew + putSkew;

    if (!BS) return;

    const callGreeks = BS.calculateAllGreeks(spot, strike, tte, RISK_FREE_RATE, callIV, 'call');
    const putGreeks = BS.calculateAllGreeks(spot, strike, tte, RISK_FREE_RATE, putIV, 'put');

    const callMid = Math.max(0.01, callGreeks.price);
    const putMid = Math.max(0.01, putGreeks.price);

    // Simulate bid/ask spread (tighter ATM, wider OTM)
    const spreadPct = 0.02 + 0.03 * Math.abs(moneyness);
    const callSpread = Math.max(0.01, callMid * spreadPct);
    const putSpread = Math.max(0.01, putMid * spreadPct);

    // Simulate volume and OI (higher ATM)
    const atmFactor = Math.exp(-moneyness * moneyness * 20);
    const callVol = Math.floor(200 + 8000 * atmFactor * Math.random());
    const callOI = Math.floor(500 + 25000 * atmFactor * Math.random());
    const putVol = Math.floor(150 + 6000 * atmFactor * Math.random());
    const putOI = Math.floor(400 + 20000 * atmFactor * Math.random());

    // Simulate daily change
    const callChg = (Math.random() - 0.45) * callMid * 0.1;
    const putChg = (Math.random() - 0.55) * putMid * 0.1;

    calls.push({
      strike,
      expiration: expTimestamp,
      last: callMid,
      change: callChg,
      bid: Math.max(0.01, callMid - callSpread / 2),
      ask: callMid + callSpread / 2,
      volume: callVol,
      openInterest: callOI,
      impliedVolatility: callIV,
      calculatedGreeks: callGreeks,
      tte: tte,
      dte: dte,
      inTheMoney: strike <= spot,
    });

    puts.push({
      strike,
      expiration: expTimestamp,
      last: putMid,
      change: putChg,
      bid: Math.max(0.01, putMid - putSpread / 2),
      ask: putMid + putSpread / 2,
      volume: putVol,
      openInterest: putOI,
      impliedVolatility: putIV,
      calculatedGreeks: putGreeks,
      tte: tte,
      dte: dte,
      inTheMoney: strike >= spot,
    });
  });

  // Calculate aggregate stats
  const totalCallVol = calls.reduce((s, c) => s + c.volume, 0);
  const totalPutVol = puts.reduce((s, p) => s + p.volume, 0);
  const totalCallOI = calls.reduce((s, c) => s + c.openInterest, 0);
  const totalPutOI = puts.reduce((s, p) => s + p.openInterest, 0);
  const avgIV = calls.reduce((s, c) => s + c.impliedVolatility, 0) / calls.length;
  const expectedMove = getExpectedMove(spot, avgIV, dte);

  return {
    symbol: symbol.toUpperCase(),
    spotPrice: spot,
    calls,
    puts,
    expirations: expirations.map(e => e.timestamp),
    quote: {
      symbol: symbol.toUpperCase(),
      regularMarketPrice: spot,
      regularMarketChange: (Math.random() - 0.45) * spot * 0.02,
      regularMarketChangePercent: (Math.random() - 0.45) * 2,
    },
    stats: {
      totalCallVolume: totalCallVol,
      totalPutVolume: totalPutVol,
      totalCallOI: totalCallOI,
      totalPutOI: totalPutOI,
      putCallRatio: totalPutVol / (totalCallVol || 1),
      avgIV: avgIV,
      ivRank: 30 + Math.random() * 40,
      ivPercentile: 25 + Math.random() * 50,
      expectedMove: expectedMove.expectedMove,
      sizzleIndex: 0.8 + Math.random() * 2.5,
    },
  };
}

// ---- PREDEFINED STRATEGIES ----

const STRATEGIES = {
  longCall: (strike, premium) => [
    { type: 'call', strike, premium, quantity: 1, side: 'long' },
  ],
  longPut: (strike, premium) => [
    { type: 'put', strike, premium, quantity: 1, side: 'long' },
  ],
  shortCall: (strike, premium) => [
    { type: 'call', strike, premium, quantity: 1, side: 'short' },
  ],
  shortPut: (strike, premium) => [
    { type: 'put', strike, premium, quantity: 1, side: 'short' },
  ],
  bullCallSpread: (buyStrike, buyPremium, sellStrike, sellPremium) => [
    { type: 'call', strike: buyStrike, premium: buyPremium, quantity: 1, side: 'long' },
    { type: 'call', strike: sellStrike, premium: sellPremium, quantity: 1, side: 'short' },
  ],
  bearPutSpread: (buyStrike, buyPremium, sellStrike, sellPremium) => [
    { type: 'put', strike: buyStrike, premium: buyPremium, quantity: 1, side: 'long' },
    { type: 'put', strike: sellStrike, premium: sellPremium, quantity: 1, side: 'short' },
  ],
  straddle: (strike, callPremium, putPremium) => [
    { type: 'call', strike, premium: callPremium, quantity: 1, side: 'long' },
    { type: 'put', strike, premium: putPremium, quantity: 1, side: 'long' },
  ],
  strangle: (callStrike, callPremium, putStrike, putPremium) => [
    { type: 'call', strike: callStrike, premium: callPremium, quantity: 1, side: 'long' },
    { type: 'put', strike: putStrike, premium: putPremium, quantity: 1, side: 'long' },
  ],
  ironCondor: (putBuyStrike, putBuyPrem, putSellStrike, putSellPrem, callSellStrike, callSellPrem, callBuyStrike, callBuyPrem) => [
    { type: 'put', strike: putBuyStrike, premium: putBuyPrem, quantity: 1, side: 'long' },
    { type: 'put', strike: putSellStrike, premium: putSellPrem, quantity: 1, side: 'short' },
    { type: 'call', strike: callSellStrike, premium: callSellPrem, quantity: 1, side: 'short' },
    { type: 'call', strike: callBuyStrike, premium: callBuyPrem, quantity: 1, side: 'long' },
  ],
  butterfly: (lowStrike, lowPrem, midStrike, midPrem, highStrike, highPrem) => [
    { type: 'call', strike: lowStrike, premium: lowPrem, quantity: 1, side: 'long' },
    { type: 'call', strike: midStrike, premium: midPrem, quantity: 2, side: 'short' },
    { type: 'call', strike: highStrike, premium: highPrem, quantity: 1, side: 'long' },
  ],
};

// Export
const OptionsData = {
  getOptionsChain,
  getExpirations,
  calculateGreeks,
  calculatePnL,
  getIVSurface,
  getExpectedMove,
  STRATEGIES,
  RISK_FREE_RATE,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = OptionsData;
} else if (typeof window !== 'undefined') {
  window.OptionsData = OptionsData;
}
