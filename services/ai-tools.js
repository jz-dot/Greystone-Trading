/* ============================================
   GREY SANKORE - AI TOOL DEFINITIONS + IMPLEMENTATIONS
   Server-side tools the copilot can call to ground its answers in real
   platform data. Pure orchestration: market-data access is injected by the
   caller (server.js Yahoo helpers); options Greeks come from the local
   Black-Scholes engine; broker-cost math comes from the local fee model.

   No network calls, no secrets, and no side effects live here. Every tool
   returns a small, JSON-serializable summary (never a whole options chain or
   a full candle series) so the model's context stays lean.

   Usage from server.js:
     const aiTools = require('./services/ai-tools');
     const tools = aiTools.getToolDefinitions();
     const result = await aiTools.executeTool(name, input, {
       getQuote, getChart, getOptions   // injected market-data functions
     });
   ============================================ */

const BlackScholes = require('./black-scholes');
const FeeModel = require('./fee-model');

// Risk-free rate used for Greeks. A single constant keeps the tool pure and
// deterministic; it is an educational approximation, not a live curve.
const RISK_FREE_RATE = 0.043;

// How many strikes around the money to summarize in an options-chain response.
const ATM_STRIKE_WINDOW = 5;

// How many downsampled close points to return from a price-history request.
const HISTORY_POINTS = 24;

const VALID_RANGES = ['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', 'ytd', 'max'];

function round(n, dp) {
  if (typeof n !== 'number' || !isFinite(n)) return null;
  const f = Math.pow(10, dp == null ? 4 : dp);
  const r = Math.round(n * f) / f;
  return r === 0 ? 0 : r;
}

function cleanSymbol(sym) {
  if (typeof sym !== 'string' || !sym.trim()) {
    throw new Error('A ticker symbol is required.');
  }
  // Yahoo symbols allow letters, digits, dot, dash, caret (indexes).
  const s = sym.trim().toUpperCase();
  if (!/^[A-Z0-9.\-^=]{1,15}$/.test(s)) {
    throw new Error('Invalid ticker symbol: ' + sym);
  }
  return s;
}

// ============================================
// TOOL DEFINITIONS (Anthropic tool schemas)
// ============================================

const TOOL_DEFINITIONS = [
  {
    name: 'get_quote',
    description:
      'Get the latest market quote (price, day change, volume, previous close) for a stock, ETF, or index ticker. Use this whenever a current price would ground the explanation. Supports Canadian symbols (e.g. RY.TO) and US symbols (e.g. AAPL).',
    input_schema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Ticker symbol, e.g. "AAPL" or "RY.TO".' },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'get_price_history',
    description:
      'Get a compact summary of historical price action over a range: period open/close, high/low, percent change, total volume, and a downsampled close series. Use for trend, momentum, and range context. Not tick data.',
    input_schema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Ticker symbol, e.g. "NVDA".' },
        range: {
          type: 'string',
          enum: VALID_RANGES,
          description: 'Look-back window. Defaults to "1mo".',
        },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'get_options_chain',
    description:
      'Get a compact options summary for a ticker at the nearest expiration: spot price, at-the-money implied volatility, and a few strikes around the money with call/put IV plus Black-Scholes Greeks (delta, gamma, theta, vega). Use for options mechanics, IV, and Greeks discussion. Returns a summary, never the full chain.',
    input_schema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Underlying ticker symbol, e.g. "SPY".' },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'compare_broker_costs',
    description:
      'Compare the total all-in cost of one trade across major Canadian retail brokers, including the hidden currency-conversion (FX) fee charged on cross-currency trades. Returns brokers cheapest first with an itemized breakdown (commission, options fee, FX cost, total). This is the core "what will this trade actually cost me and where is it cheapest" question.',
    input_schema: {
      type: 'object',
      properties: {
        side: { type: 'string', enum: ['buy', 'sell'], description: 'Trade side (cost is symmetric). Defaults to "buy".' },
        quantity: { type: 'number', description: 'Number of shares, for a stock/ETF trade.' },
        price: { type: 'number', description: 'Price per share, or the option premium per share.' },
        currency: { type: 'string', description: 'Currency the security trades in, e.g. "USD" or "CAD". Defaults to "CAD".' },
        accountCurrency: { type: 'string', description: 'Your account base currency, e.g. "CAD". Defaults to "CAD".' },
        isOption: { type: 'boolean', description: 'True for an options trade.' },
        contracts: { type: 'number', description: 'Number of option contracts (100 shares each), for an options trade.' },
      },
      required: ['price'],
    },
  },
  {
    name: 'estimate_fx_drag',
    description:
      'Estimate the annual cost (drag) of a broker currency-conversion fee, given how much USD a user converts per year and the broker FX rate. Makes the value of avoiding FX concrete.',
    input_schema: {
      type: 'object',
      properties: {
        usdTradingVolume: { type: 'number', description: 'Total USD converted per year.' },
        brokerFxRatePct: { type: 'number', description: 'Broker FX conversion rate as a percent, e.g. 1.5 for 1.5%.' },
      },
      required: ['usdTradingVolume', 'brokerFxRatePct'],
    },
  },
  {
    name: 'norberts_gambit_savings',
    description:
      'Estimate the savings from Norberts Gambit (converting currency at roughly spot via a dual-listed ETF) versus paying a broker percentage FX conversion fee. Provide either amountCAD or amountUSD.',
    input_schema: {
      type: 'object',
      properties: {
        amountCAD: { type: 'number', description: 'Amount being converted, CAD side.' },
        amountUSD: { type: 'number', description: 'Amount being converted, USD side.' },
        brokerFxRatePct: { type: 'number', description: 'The FX rate you would otherwise pay, as a percent, e.g. 1.5.' },
        journalingFee: { type: 'number', description: 'Cost of running the gambit (commissions + spread + journaling), if any. Defaults to 0.' },
      },
      required: ['brokerFxRatePct'],
    },
  },
];

function getToolDefinitions() {
  return TOOL_DEFINITIONS;
}

// ============================================
// TOOL IMPLEMENTATIONS
// ============================================

function intervalForRange(range) {
  switch (range) {
    case '1d': return '5m';
    case '5d': return '30m';
    case '1mo':
    case '3mo':
    case '6mo':
    case '1y':
    case 'ytd': return '1d';
    case '2y':
    case '5y': return '1wk';
    case 'max': return '1mo';
    default: return '1d';
  }
}

async function toolGetQuote(input, deps) {
  const symbol = cleanSymbol(input && input.symbol);
  const q = await deps.getQuote(symbol);
  if (!q || !q.price) {
    return { symbol: symbol, available: false, note: 'No quote data returned for this symbol.' };
  }
  return {
    symbol: symbol,
    price: q.price,
    change: q.change,
    changePct: q.changePct,
    volume: q.volume,
    previousClose: q.prevClose,
    currency: q.currency || 'USD',
    marketState: q.marketState || 'UNKNOWN',
    exchange: q.exchangeName || '',
  };
}

async function toolGetPriceHistory(input, deps) {
  const symbol = cleanSymbol(input && input.symbol);
  let range = (input && input.range) || '1mo';
  if (VALID_RANGES.indexOf(range) === -1) range = '1mo';
  const interval = intervalForRange(range);

  const chart = await deps.getChart(symbol, interval, range);
  const candles = (chart && chart.candles) || [];
  if (!candles.length) {
    return { symbol: symbol, range: range, available: false, note: 'No historical data returned for this range.' };
  }

  let high = -Infinity;
  let low = Infinity;
  let totalVolume = 0;
  for (let i = 0; i < candles.length; i++) {
    if (candles[i].high > high) high = candles[i].high;
    if (candles[i].low < low) low = candles[i].low;
    totalVolume += candles[i].volume || 0;
  }
  const first = candles[0];
  const last = candles[candles.length - 1];
  const changePct = first.open ? ((last.close - first.open) / first.open) * 100 : 0;

  // Downsample the close series to keep the payload small.
  const step = Math.max(1, Math.ceil(candles.length / HISTORY_POINTS));
  const series = [];
  for (let i = 0; i < candles.length; i += step) {
    series.push({
      t: new Date(candles[i].time * 1000).toISOString().slice(0, 10),
      c: round(candles[i].close, 4),
    });
  }
  // Always include the final point.
  const lastPoint = { t: new Date(last.time * 1000).toISOString().slice(0, 10), c: round(last.close, 4) };
  if (!series.length || series[series.length - 1].t !== lastPoint.t) series.push(lastPoint);

  return {
    symbol: symbol,
    range: range,
    interval: interval,
    open: round(first.open, 4),
    close: round(last.close, 4),
    high: round(high, 4),
    low: round(low, 4),
    changePct: round(changePct, 2),
    totalVolume: totalVolume,
    points: candles.length,
    closeSeries: series,
    currency: (chart.meta && chart.meta.currency) || 'USD',
  };
}

async function toolGetOptionsChain(input, deps) {
  const symbol = cleanSymbol(input && input.symbol);
  const data = await deps.getOptions(symbol);

  const spot = data.spotPrice || (data.quote && data.quote.regularMarketPrice) || 0;
  const calls = data.calls || [];
  const puts = data.puts || [];
  if (!spot || (!calls.length && !puts.length)) {
    return { symbol: symbol, available: false, note: 'No options data returned for this symbol.' };
  }

  // The default chain is a single nearest expiration; read it off a contract.
  const sample = calls[0] || puts[0];
  const expUnix = sample && sample.expiration ? sample.expiration : (data.expirations && data.expirations[0]);
  const nowUnix = Math.floor(Date.now() / 1000);
  const secondsToExp = expUnix ? Math.max(expUnix - nowUnix, 0) : 0;
  const T = secondsToExp / (365.25 * 24 * 3600);
  const daysToExpiry = Math.round(secondsToExp / 86400);

  function byStrike(list) {
    const m = {};
    list.forEach(function (c) { m[c.strike] = c; });
    return m;
  }
  const callMap = byStrike(calls);
  const putMap = byStrike(puts);

  // Union of strikes, then the ATM_STRIKE_WINDOW nearest to spot.
  const strikeSet = {};
  calls.forEach(function (c) { strikeSet[c.strike] = true; });
  puts.forEach(function (p) { strikeSet[p.strike] = true; });
  const allStrikes = Object.keys(strikeSet).map(Number).sort(function (a, b) { return a - b; });
  const nearest = allStrikes
    .slice()
    .sort(function (a, b) { return Math.abs(a - spot) - Math.abs(b - spot); })
    .slice(0, ATM_STRIKE_WINDOW)
    .sort(function (a, b) { return a - b; });

  function greeksFor(contract, type) {
    if (!contract) return null;
    const iv = contract.impliedVolatility || 0;
    const out = { iv: round(iv, 4), bid: contract.bid || 0, ask: contract.ask || 0, last: contract.last || 0, openInterest: contract.openInterest || 0 };
    if (T > 0 && iv > 0) {
      const g = BlackScholes.calculateAllGreeks(spot, contract.strike, T, RISK_FREE_RATE, iv, type);
      out.delta = round(g.delta, 4);
      out.gamma = round(g.gamma, 5);
      out.theta = round(g.theta, 4);
      out.vega = round(g.vega, 4);
    }
    return out;
  }

  const strikes = nearest.map(function (k) {
    return {
      strike: k,
      call: greeksFor(callMap[k], 'call'),
      put: greeksFor(putMap[k], 'put'),
    };
  });

  // ATM implied vol: contract with strike closest to spot.
  const atmStrike = allStrikes.reduce(function (best, k) {
    return Math.abs(k - spot) < Math.abs(best - spot) ? k : best;
  }, allStrikes[0]);
  const atmCall = callMap[atmStrike];
  const atmPut = putMap[atmStrike];

  return {
    symbol: symbol,
    spot: round(spot, 4),
    expiration: expUnix ? new Date(expUnix * 1000).toISOString().slice(0, 10) : null,
    daysToExpiry: daysToExpiry,
    riskFreeRate: RISK_FREE_RATE,
    atmStrike: atmStrike,
    atmCallIV: atmCall ? round(atmCall.impliedVolatility, 4) : null,
    atmPutIV: atmPut ? round(atmPut.impliedVolatility, 4) : null,
    strikes: strikes,
    note: 'Greeks computed via Black-Scholes at the shown risk-free rate using each contract implied volatility. Educational estimates.',
  };
}

function toolCompareBrokerCosts(input) {
  const args = input || {};
  const isOption = !!args.isOption;
  if (typeof args.price !== 'number' || args.price < 0) {
    throw new Error('A non-negative "price" (per share or option premium) is required.');
  }
  const trade = {
    side: args.side === 'sell' ? 'sell' : 'buy',
    quantity: typeof args.quantity === 'number' ? args.quantity : 0,
    price: args.price,
    currency: (args.currency || 'CAD').toUpperCase(),
    accountCurrency: (args.accountCurrency || 'CAD').toUpperCase(),
    isOption: isOption,
    contracts: typeof args.contracts === 'number' ? args.contracts : 0,
  };
  if (isOption && trade.contracts <= 0) {
    throw new Error('An options trade needs a positive "contracts" count.');
  }
  if (!isOption && trade.quantity <= 0) {
    throw new Error('A stock trade needs a positive "quantity" of shares.');
  }

  const results = FeeModel.compareBrokers(trade);
  const crossCurrency = trade.currency !== trade.accountCurrency;
  return {
    trade: {
      side: trade.side,
      instrument: isOption ? 'option' : 'stock',
      quantity: isOption ? trade.contracts : trade.quantity,
      price: trade.price,
      currency: trade.currency,
      accountCurrency: trade.accountCurrency,
      crossCurrency: crossCurrency,
    },
    cheapest: results.length ? { broker: results[0].brokerName, total: results[0].total } : null,
    results: results.map(function (r) {
      return {
        broker: r.brokerName,
        commission: r.commission,
        optionsFee: r.optionsFee,
        fxCost: r.fxCost,
        total: r.total,
        currency: r.currency,
        notional: r.notional,
      };
    }),
    note: crossCurrency
      ? 'Costs include the broker FX conversion fee because this is a cross-currency trade. Fee figures are as-of mid-2026 and several are unverified; educational only.'
      : 'Same-currency trade, so no FX conversion fee applies. Fee figures are as-of mid-2026 and several are unverified; educational only.',
  };
}

function toolEstimateFxDrag(input) {
  const args = input || {};
  const out = FeeModel.annualFxDrag({
    usdTradingVolume: args.usdTradingVolume,
    brokerFxRatePct: args.brokerFxRatePct,
  });
  return {
    usdTradingVolume: out.usdTradingVolume,
    brokerFxRatePct: out.brokerFxRatePct,
    annualFxDrag: out.annualDrag,
    note: 'Annual cost of the broker FX conversion fee at this volume. Avoidable with a USD account or Norberts Gambit. Educational estimate.',
  };
}

function toolNorbertsGambitSavings(input) {
  const args = input || {};
  const out = FeeModel.norbertsGambitSavings({
    amountCAD: typeof args.amountCAD === 'number' ? args.amountCAD : undefined,
    amountUSD: typeof args.amountUSD === 'number' ? args.amountUSD : undefined,
    brokerFxRatePct: args.brokerFxRatePct,
    journalingFee: typeof args.journalingFee === 'number' ? args.journalingFee : 0,
  });
  return {
    amount: out.amount,
    currency: out.currency,
    brokerFxCost: out.brokerFxCost,
    gambitCost: out.gambitCost,
    savings: out.savings,
    savingsPct: out.savingsPct,
    note: 'Savings versus paying the broker percentage FX conversion. Norberts Gambit carries settlement and price risk during the journaling window. Educational estimate.',
  };
}

/**
 * Execute a tool by name. Returns a JSON-serializable result. Throws on bad
 * input or upstream failure; the caller converts throws into a tool_result
 * with is_error: true so the model can recover and continue.
 *
 * @param {string} name - tool name
 * @param {object} input - tool input (already parsed by the SDK)
 * @param {object} deps - { getQuote, getChart, getOptions } market-data fns
 */
async function executeTool(name, input, deps) {
  deps = deps || {};
  switch (name) {
    case 'get_quote':
      return toolGetQuote(input, deps);
    case 'get_price_history':
      return toolGetPriceHistory(input, deps);
    case 'get_options_chain':
      return toolGetOptionsChain(input, deps);
    case 'compare_broker_costs':
      return toolCompareBrokerCosts(input);
    case 'estimate_fx_drag':
      return toolEstimateFxDrag(input);
    case 'norberts_gambit_savings':
      return toolNorbertsGambitSavings(input);
    default:
      throw new Error('Unknown tool: ' + name);
  }
}

module.exports = {
  getToolDefinitions: getToolDefinitions,
  executeTool: executeTool,
  TOOL_DEFINITIONS: TOOL_DEFINITIONS,
};
