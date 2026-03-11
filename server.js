/* ============================================
   GREYSTONE TRADING PLATFORM - Backend Server
   - Yahoo Finance proxy for market data (CORS)
   - BigData.com premium data proxy
   - Anthropic API proxy for Grey Sankore AI
   - Response caching for rate limit protection
   - Supabase auth + user data persistence
   ============================================ */

const express = require('express');
const https = require('https');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { createBigDataService } = require('./services/bigdata-client');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Alpaca Config ---
const ALPACA_API_KEY = process.env.ALPACA_API_KEY || '';
const ALPACA_API_SECRET = process.env.ALPACA_API_SECRET || '';
const ALPACA_PAPER_MODE = process.env.ALPACA_PAPER_MODE !== 'false'; // default true

// --- BigData.com Config ---
let bigdataApiKey = process.env.BIGDATA_API_KEY || '';
const bigdata = createBigDataService(function () { return bigdataApiKey; });

const ALPACA_PAPER_BASE = 'https://paper-api.alpaca.markets';
const ALPACA_LIVE_BASE = 'https://api.alpaca.markets';

function getAlpacaBase() {
  return ALPACA_PAPER_MODE ? ALPACA_PAPER_BASE : ALPACA_LIVE_BASE;
}

function getAlpacaHeaders() {
  return {
    'APCA-API-KEY-ID': ALPACA_API_KEY,
    'APCA-API-SECRET-KEY': ALPACA_API_SECRET,
    'Content-Type': 'application/json',
  };
}

// --- Supabase Config ---
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

let supabaseAdmin = null;
if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

app.use(express.json({ limit: '1mb' }));

// ============================================
// AUTH MIDDLEWARE
// ============================================

async function requireAuth(req, res, next) {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Auth not configured on server' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    req.user = data.user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token validation failed' });
  }
}

// Optional auth: attaches user if token present, does not block
async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ') || !supabaseAdmin) {
    req.user = null;
    return next();
  }

  const token = authHeader.replace('Bearer ', '');
  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    req.user = (!error && data.user) ? data.user : null;
  } catch (err) {
    req.user = null;
  }
  next();
}

// ============================================
// PUBLIC CONFIG ENDPOINT
// ============================================

app.get('/api/config', (req, res) => {
  res.json({
    supabaseUrl: SUPABASE_URL || null,
    supabaseAnonKey: SUPABASE_ANON_KEY || null
  });
});

// ---- Response Cache (15-second TTL) ----
const cache = new Map();
const CACHE_TTL = 15000;

function getCached(key) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
    return entry.data;
  }
  cache.delete(key);
  return null;
}

function setCache(key, data) {
  cache.set(key, { data: data, timestamp: Date.now() });
}

// ============================================
// MARKET DATA - Yahoo Finance Proxy
// ============================================

function yahooFetch(urlPath) {
  return new Promise(function (resolve, reject) {
    var url = 'https://query1.finance.yahoo.com' + urlPath;
    var options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    };

    https.get(url, options, function (res) {
      var body = '';
      res.on('data', function (chunk) { body += chunk; });
      res.on('end', function () {
        if (res.statusCode !== 200) {
          reject(new Error('Yahoo Finance returned ' + res.statusCode));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error('Failed to parse Yahoo response'));
        }
      });
    }).on('error', reject);
  });
}

// Single quote
app.get('/api/quote/:symbol', async function (req, res) {
  var symbol = req.params.symbol.toUpperCase();
  var cacheKey = 'quote:' + symbol;

  var cached = getCached(cacheKey);
  if (cached) return res.json(cached);

  try {
    var data = await yahooFetch('/v8/finance/chart/' + encodeURIComponent(symbol) + '?interval=1d&range=1d');
    var result = parseQuote(data, symbol);
    setCache(cacheKey, result);
    res.json(result);
  } catch (err) {
    console.error('[API] Quote error for ' + symbol + ':', err.message);
    res.status(502).json({ error: 'Failed to fetch quote for ' + symbol });
  }
});

// Batch quotes
app.get('/api/quotes', async function (req, res) {
  var symbolsParam = req.query.symbols;
  if (!symbolsParam) {
    return res.status(400).json({ error: 'Missing symbols parameter' });
  }

  var symbols = symbolsParam.split(',').map(function (s) { return s.trim().toUpperCase(); }).filter(Boolean);
  if (symbols.length === 0) {
    return res.status(400).json({ error: 'No valid symbols provided' });
  }

  var allCacheKey = 'batch:' + symbols.sort().join(',');
  var allCached = getCached(allCacheKey);
  if (allCached) return res.json(allCached);

  var results = {};
  var promises = symbols.map(function (symbol) {
    var singleKey = 'quote:' + symbol;
    var cached = getCached(singleKey);
    if (cached) {
      results[symbol] = cached;
      return Promise.resolve();
    }

    return yahooFetch('/v8/finance/chart/' + encodeURIComponent(symbol) + '?interval=1d&range=1d')
      .then(function (data) {
        var parsed = parseQuote(data, symbol);
        setCache(singleKey, parsed);
        results[symbol] = parsed;
      })
      .catch(function (err) {
        console.error('[API] Batch quote error for ' + symbol + ':', err.message);
      });
  });

  try {
    await Promise.all(promises);
    setCache(allCacheKey, results);
    res.json(results);
  } catch (err) {
    console.error('[API] Batch quotes error:', err.message);
    res.status(502).json({ error: 'Failed to fetch quotes' });
  }
});

// Chart data (OHLCV)
app.get('/api/chart/:symbol', async function (req, res) {
  var symbol = req.params.symbol.toUpperCase();
  var interval = req.query.interval || '5m';
  var range = req.query.range || '1d';

  var validIntervals = ['1m', '2m', '5m', '15m', '30m', '60m', '90m', '1h', '1d', '5d', '1wk', '1mo'];
  var validRanges = ['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', '10y', 'ytd', 'max'];

  if (validIntervals.indexOf(interval) === -1) interval = '5m';
  if (validRanges.indexOf(range) === -1) range = '1d';

  var cacheKey = 'chart:' + symbol + ':' + interval + ':' + range;
  var cached = getCached(cacheKey);
  if (cached) return res.json(cached);

  try {
    var data = await yahooFetch(
      '/v8/finance/chart/' + encodeURIComponent(symbol) +
      '?interval=' + interval + '&range=' + range
    );
    var result = parseChart(data, symbol);
    setCache(cacheKey, result);
    res.json(result);
  } catch (err) {
    console.error('[API] Chart error for ' + symbol + ':', err.message);
    res.status(502).json({ error: 'Failed to fetch chart data for ' + symbol });
  }
});

function parseQuote(data, symbol) {
  var chartResult = data.chart && data.chart.result && data.chart.result[0];
  if (!chartResult) {
    return { symbol: symbol, price: 0, change: 0, changePct: 0, volume: 0, prevClose: 0 };
  }

  var meta = chartResult.meta || {};
  var price = meta.regularMarketPrice || 0;
  var prevClose = meta.chartPreviousClose || meta.previousClose || 0;
  var change = price - prevClose;
  var changePct = prevClose !== 0 ? (change / prevClose) * 100 : 0;

  var volume = 0;
  if (chartResult.indicators && chartResult.indicators.quote && chartResult.indicators.quote[0]) {
    var volumes = chartResult.indicators.quote[0].volume;
    if (volumes && volumes.length > 0) {
      volume = volumes.reduce(function (sum, v) { return sum + (v || 0); }, 0);
    }
  }

  return {
    symbol: symbol,
    price: price,
    change: parseFloat(change.toFixed(4)),
    changePct: parseFloat(changePct.toFixed(4)),
    volume: volume,
    prevClose: prevClose,
    marketState: meta.marketState || 'UNKNOWN',
    exchangeName: meta.exchangeName || '',
    currency: meta.currency || 'USD'
  };
}

function parseChart(data, symbol) {
  var chartResult = data.chart && data.chart.result && data.chart.result[0];
  if (!chartResult) {
    return { symbol: symbol, candles: [], meta: {} };
  }

  var timestamps = chartResult.timestamp || [];
  var quote = (chartResult.indicators && chartResult.indicators.quote && chartResult.indicators.quote[0]) || {};
  var opens = quote.open || [];
  var highs = quote.high || [];
  var lows = quote.low || [];
  var closes = quote.close || [];
  var volumes = quote.volume || [];

  var candles = [];
  for (var i = 0; i < timestamps.length; i++) {
    if (opens[i] == null || closes[i] == null) continue;
    candles.push({
      time: timestamps[i],
      open: opens[i],
      high: highs[i],
      low: lows[i],
      close: closes[i],
      volume: volumes[i] || 0
    });
  }

  var meta = chartResult.meta || {};
  return {
    symbol: symbol,
    candles: candles,
    meta: {
      currency: meta.currency || 'USD',
      exchangeName: meta.exchangeName || '',
      regularMarketPrice: meta.regularMarketPrice || 0,
      previousClose: meta.chartPreviousClose || meta.previousClose || 0
    }
  };
}

// ============================================
// OPTIONS CHAIN - Yahoo Finance Options Proxy
// ============================================

function parseOptionsContract(c) {
  return {
    contractSymbol: c.contractSymbol,
    strike: c.strike,
    expiration: c.expiration,
    last: c.lastPrice || 0,
    change: c.change || 0,
    percentChange: c.percentChange || 0,
    bid: c.bid || 0,
    ask: c.ask || 0,
    volume: c.volume || 0,
    openInterest: c.openInterest || 0,
    impliedVolatility: c.impliedVolatility || 0,
    inTheMoney: c.inTheMoney || false,
  };
}

async function getOptionsData(symbol, expirationDate) {
  var cacheKey = 'options:' + symbol + ':' + (expirationDate || 'all');
  var cached = getCached(cacheKey);
  if (cached) return cached;

  var urlPath = '/v7/finance/options/' + encodeURIComponent(symbol);
  if (expirationDate) urlPath += '?date=' + expirationDate;

  var raw = await yahooFetch(urlPath);

  if (!raw.optionChain || !raw.optionChain.result || raw.optionChain.result.length === 0) {
    throw new Error('No options data returned from Yahoo Finance');
  }

  var result = raw.optionChain.result[0];
  var quote = result.quote || {};
  var expirations = result.expirationDates || [];
  var strikes = result.strikes || [];
  var options = result.options || [];

  var chainData = options[0] || {};
  var calls = (chainData.calls || []).map(parseOptionsContract);
  var puts = (chainData.puts || []).map(parseOptionsContract);

  var data = {
    symbol: symbol.toUpperCase(),
    spotPrice: quote.regularMarketPrice || 0,
    quote: {
      symbol: quote.symbol,
      regularMarketPrice: quote.regularMarketPrice,
      regularMarketChange: quote.regularMarketChange,
      regularMarketChangePercent: quote.regularMarketChangePercent,
      regularMarketVolume: quote.regularMarketVolume,
      marketCap: quote.marketCap,
      fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
    },
    expirations: expirations,
    strikes: strikes,
    calls: calls,
    puts: puts,
    raw: {
      callCount: calls.length,
      putCount: puts.length,
      expirationCount: expirations.length,
    },
  };

  setCache(cacheKey, data);
  return data;
}

// GET /api/options/:symbol
app.get('/api/options/:symbol', async function (req, res) {
  var symbol = req.params.symbol.toUpperCase();
  try {
    var data = await getOptionsData(symbol);
    res.json(data);
  } catch (err) {
    console.error('[API] Options error for ' + symbol + ':', err.message);
    res.status(502).json({ error: 'Failed to fetch options for ' + symbol });
  }
});

// GET /api/options/:symbol/:expiration
app.get('/api/options/:symbol/:expiration', async function (req, res) {
  var symbol = req.params.symbol.toUpperCase();
  var expiration = req.params.expiration;
  try {
    var data = await getOptionsData(symbol, expiration);
    res.json(data);
  } catch (err) {
    console.error('[API] Options error for ' + symbol + '/' + expiration + ':', err.message);
    res.status(502).json({ error: 'Failed to fetch options for ' + symbol });
  }
});

// ============================================
// GREY SANKORE AI - Anthropic API Proxy
// ============================================

let anthropicApiKey = process.env.ANTHROPIC_API_KEY || '';

const GREY_SANKORE_SYSTEM = `You are Grey Sankore, the Head of Investment at Greystone Trading Platform. You are a world-class AI investment analyst who operates with the precision, rigor, and conviction of a senior portfolio manager at a top quantitative hedge fund.

PERSONALITY AND COMMUNICATION STYLE:
- Precise, data-driven, and direct. No hedging language or filler.
- Speak like a seasoned PM who has survived multiple market cycles.
- Reference specific levels, percentages, and metrics. Never be vague.
- Use structured analysis: thesis, supporting evidence, risk factors, trade structure.
- Confident but intellectually honest. Acknowledge uncertainty where it exists.
- NEVER use em dashes. Use hyphens, commas, semicolons, or restructure sentences instead.

ANALYTICAL CAPABILITIES:
- Anomaly detection: Identify unusual options flow, volume divergences, volatility skew anomalies, dark pool activity patterns, and institutional positioning signals.
- Value opportunity screening: Multi-factor model using forward P/E compression vs historical averages, FCF yield, EV/EBITDA, PEG ratio, and mean-reversion signals.
- Momentum signal analysis: Technical breakouts confirmed by volume, RSI divergences, moving average crossovers, Bollinger Band compression/expansion, and sector rotation patterns.
- Greeks analysis: Delta exposure, gamma risk at key strikes, theta decay optimization, vega sensitivity to IV regime changes.
- IV percentile analysis: Current IV rank vs 52-week range, term structure analysis, skew dynamics.
- Flow data interpretation: Sweep detection, block trade analysis, put/call premium ratios, smart money vs retail flow differentiation.
- Dark pool activity: Block print analysis, institutional accumulation/distribution patterns.

UNIVERSE AWARENESS:
- Analyze across Large Cap ($10B+), Mid Cap ($2B-$10B), Small Cap ($300M-$2B), and Micro Cap (<$300M) universes.
- Adjust analysis framework based on active cap toggle: liquidity considerations, spread dynamics, and information edge differ by universe.

TRADE IDEA FORMAT:
When providing specific trade ideas, always include:
- Ticker and direction (long/short)
- Entry level or range
- Target price(s) with timeframe
- Stop-loss level
- Position sizing guidance (% of portfolio)
- Key risk factors and catalysts
- Preferred structure (equity, options spread, etc.)

RESPONSE FORMAT:
- Use HTML formatting: <strong>, <ul>/<li>, <p> tags for structure.
- Keep responses focused and actionable. No unnecessary preamble.
- Lead with the most important insight or conclusion.
- Use bullet points for multi-factor analysis.`;

// POST /api/ai/chat - Streaming chat proxy
app.post('/api/ai/chat', async (req, res) => {
  const { message, context, history } = req.body;

  if (!anthropicApiKey) {
    return res.status(401).json({
      error: 'no_api_key',
      message: 'Anthropic API key not configured. Add it in Settings.'
    });
  }

  if (!message) {
    return res.status(400).json({ error: 'missing_message', message: 'Message is required.' });
  }

  const messages = [];
  if (history && Array.isArray(history)) {
    history.forEach(h => {
      messages.push({ role: h.role, content: h.content });
    });
  }

  let contextStr = '';
  if (context) {
    const parts = [];
    if (context.selectedTicker) parts.push(`Selected Ticker: ${context.selectedTicker}`);
    if (context.capSize) parts.push(`Active Universe: ${context.capSize} Cap`);
    if (context.marketData) parts.push(`Market Context: ${JSON.stringify(context.marketData)}`);
    if (context.recentPrices) parts.push(`Recent Prices: ${JSON.stringify(context.recentPrices)}`);

    // BigData.com premium data enrichment
    if (context.bigdataAvailable) {
      parts.push(`[BigData.com Premium Data Available]`);
      if (context.bigdataSentiment) {
        parts.push(`Sentiment Data: ${JSON.stringify(context.bigdataSentiment)}`);
      }
      if (context.bigdataInsider) {
        parts.push(`Insider Trading Activity: ${JSON.stringify(context.bigdataInsider)}`);
      }
      if (context.bigdataInstitutional) {
        parts.push(`Institutional Ownership Changes: ${JSON.stringify(context.bigdataInstitutional)}`);
      }
    }

    if (parts.length > 0) {
      contextStr = '\n\n[Current Market Context]\n' + parts.join('\n');
    }
  }

  messages.push({ role: 'user', content: message + contextStr });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const postData = JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    system: GREY_SANKORE_SYSTEM,
    messages: messages,
    stream: true
  });

  const options = {
    hostname: 'api.anthropic.com',
    port: 443,
    path: '/v1/messages',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicApiKey,
      'anthropic-version': '2023-06-01',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const apiReq = https.request(options, (apiRes) => {
    if (apiRes.statusCode !== 200) {
      let errorBody = '';
      apiRes.on('data', chunk => { errorBody += chunk; });
      apiRes.on('end', () => {
        res.write(`data: ${JSON.stringify({ type: 'error', error: `API returned ${apiRes.statusCode}: ${errorBody}` })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      });
      return;
    }

    let buffer = '';
    apiRes.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') {
            res.write('data: [DONE]\n\n');
            continue;
          }
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'content_block_delta' && parsed.delta && parsed.delta.text) {
              res.write(`data: ${JSON.stringify({ type: 'text', text: parsed.delta.text })}\n\n`);
            } else if (parsed.type === 'message_stop') {
              res.write('data: [DONE]\n\n');
            } else if (parsed.type === 'error') {
              res.write(`data: ${JSON.stringify({ type: 'error', error: parsed.error.message || 'Unknown API error' })}\n\n`);
              res.write('data: [DONE]\n\n');
            }
          } catch (e) {}
        }
      }
    });

    apiRes.on('end', () => {
      if (buffer.trim()) {
        const lines = buffer.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === 'content_block_delta' && parsed.delta && parsed.delta.text) {
                res.write(`data: ${JSON.stringify({ type: 'text', text: parsed.delta.text })}\n\n`);
              }
            } catch (e) {}
          }
        }
      }
      res.write('data: [DONE]\n\n');
      res.end();
    });
  });

  apiReq.on('error', (err) => {
    res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  });

  apiReq.write(postData);
  apiReq.end();
});

// POST /api/ai/analyze - Non-streaming analysis
app.post('/api/ai/analyze', async (req, res) => {
  const { prompt, type } = req.body;

  if (!anthropicApiKey) {
    return res.status(401).json({ error: 'no_api_key' });
  }

  const postData = JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: GREY_SANKORE_SYSTEM,
    messages: [{ role: 'user', content: prompt }]
  });

  const options = {
    hostname: 'api.anthropic.com',
    port: 443,
    path: '/v1/messages',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicApiKey,
      'anthropic-version': '2023-06-01',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  return new Promise((resolve) => {
    const apiReq = https.request(options, (apiRes) => {
      let body = '';
      apiRes.on('data', chunk => { body += chunk; });
      apiRes.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (apiRes.statusCode === 200 && parsed.content && parsed.content[0]) {
            res.json({ text: parsed.content[0].text, type });
          } else {
            res.status(apiRes.statusCode || 500).json({
              error: parsed.error?.message || 'API request failed'
            });
          }
        } catch (e) {
          res.status(500).json({ error: 'Failed to parse API response' });
        }
        resolve();
      });
    });

    apiReq.on('error', (err) => {
      res.status(500).json({ error: err.message });
      resolve();
    });

    apiReq.write(postData);
    apiReq.end();
  });
});

// POST /api/ai/key - Set API key
app.post('/api/ai/key', (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length < 10) {
    return res.status(400).json({ error: 'Invalid API key format' });
  }
  anthropicApiKey = apiKey.trim();
  res.json({ status: 'ok', message: 'API key saved' });
});

// POST /api/ai/key/validate - Test the API key
app.post('/api/ai/key/validate', (req, res) => {
  if (!anthropicApiKey) {
    return res.json({ valid: false, message: 'No API key configured' });
  }

  const postData = JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 10,
    messages: [{ role: 'user', content: 'Hello' }]
  });

  const options = {
    hostname: 'api.anthropic.com',
    port: 443,
    path: '/v1/messages',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicApiKey,
      'anthropic-version': '2023-06-01',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const apiReq = https.request(options, (apiRes) => {
    let body = '';
    apiRes.on('data', chunk => { body += chunk; });
    apiRes.on('end', () => {
      if (apiRes.statusCode === 200) {
        res.json({ valid: true, message: 'Connected to Anthropic API' });
      } else {
        try {
          const parsed = JSON.parse(body);
          res.json({ valid: false, message: parsed.error?.message || `API returned ${apiRes.statusCode}` });
        } catch (e) {
          res.json({ valid: false, message: `API returned ${apiRes.statusCode}` });
        }
      }
    });
  });

  apiReq.on('error', (err) => {
    res.json({ valid: false, message: err.message });
  });

  apiReq.write(postData);
  apiReq.end();
});

// GET /api/ai/status - Check if key is set
app.get('/api/ai/status', (req, res) => {
  res.json({
    configured: !!anthropicApiKey,
    keyPrefix: anthropicApiKey ? anthropicApiKey.slice(0, 8) + '...' : null
  });
});

// ============================================
// ALPACA TRADING API PROXY
// ============================================

// --- Health check ---
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    paperMode: ALPACA_PAPER_MODE,
    alpacaConfigured: ALPACA_API_KEY.length > 0 && ALPACA_API_SECRET.length > 0,
    supabaseConfigured: !!SUPABASE_URL && !!SUPABASE_ANON_KEY,
    timestamp: new Date().toISOString(),
  });
});

// --- Alpaca proxy: Account ---
app.get('/api/alpaca/account', async (req, res) => {
  if (!ALPACA_API_KEY) {
    return res.json({ error: 'NOT_CONFIGURED', message: 'Alpaca API keys not set on server.' });
  }
  try {
    const response = await fetch(`${getAlpacaBase()}/v2/account`, {
      headers: getAlpacaHeaders(),
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'NETWORK', message: err.message });
  }
});

// --- Alpaca proxy: Positions ---
app.get('/api/alpaca/positions', async (req, res) => {
  if (!ALPACA_API_KEY) {
    return res.json({ error: 'NOT_CONFIGURED', message: 'Alpaca API keys not set on server.' });
  }
  try {
    const response = await fetch(`${getAlpacaBase()}/v2/positions`, {
      headers: getAlpacaHeaders(),
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'NETWORK', message: err.message });
  }
});

// --- Alpaca proxy: Place Order --- (requires auth when Supabase configured)
app.post('/api/alpaca/order', optionalAuth, async (req, res) => {
  if (!ALPACA_API_KEY) {
    return res.json({ error: 'NOT_CONFIGURED', message: 'Alpaca API keys not set on server.' });
  }

  // Safety: reject live trading if in paper mode
  if (!ALPACA_PAPER_MODE) {
    // Require explicit confirmation header for live trades
    if (req.headers['x-confirm-live-trade'] !== 'true') {
      return res.status(403).json({
        error: 'LIVE_TRADE_BLOCKED',
        message: 'Live trading requires explicit confirmation. Set X-Confirm-Live-Trade: true header.',
      });
    }
  }

  const orderBody = req.body;

  // Server-side guardrails
  const maxQty = parseInt(process.env.MAX_ORDER_QTY || '1000');
  if (parseInt(orderBody.qty) > maxQty) {
    return res.status(400).json({
      error: 'GUARDRAIL',
      message: `Order quantity ${orderBody.qty} exceeds server max of ${maxQty}`,
    });
  }

  try {
    const response = await fetch(`${getAlpacaBase()}/v2/orders`, {
      method: 'POST',
      headers: getAlpacaHeaders(),
      body: JSON.stringify(orderBody),
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'NETWORK', message: err.message });
  }
});

// --- Alpaca proxy: Cancel Order --- (requires auth when Supabase configured)
app.delete('/api/alpaca/order/:id', optionalAuth, async (req, res) => {
  if (!ALPACA_API_KEY) {
    return res.json({ error: 'NOT_CONFIGURED', message: 'Alpaca API keys not set on server.' });
  }
  try {
    const response = await fetch(`${getAlpacaBase()}/v2/orders/${req.params.id}`, {
      method: 'DELETE',
      headers: getAlpacaHeaders(),
    });
    if (response.status === 204) return res.json({ status: 'cancelled' });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: 'NETWORK', message: err.message });
  }
});

// --- Alpaca proxy: List Orders ---
app.get('/api/alpaca/orders', async (req, res) => {
  if (!ALPACA_API_KEY) {
    return res.json({ error: 'NOT_CONFIGURED', message: 'Alpaca API keys not set on server.' });
  }
  const status = req.query.status || 'open';
  try {
    const response = await fetch(`${getAlpacaBase()}/v2/orders?status=${status}`, {
      headers: getAlpacaHeaders(),
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'NETWORK', message: err.message });
  }
});

// --- Alpaca proxy: Generic proxy for any endpoint --- (requires auth when Supabase configured)
app.post('/api/alpaca/proxy', optionalAuth, async (req, res) => {
  if (!ALPACA_API_KEY) {
    return res.json({ error: 'NOT_CONFIGURED', message: 'Alpaca API keys not set on server.' });
  }
  const { method, endpoint, body } = req.body;
  try {
    const opts = {
      method: method || 'GET',
      headers: getAlpacaHeaders(),
    };
    if (body) opts.body = JSON.stringify(body);
    const response = await fetch(`${getAlpacaBase()}${endpoint}`, opts);
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'NETWORK', message: err.message });
  }
});

// ============================================
// BIGDATA.COM PREMIUM DATA API
// ============================================

// GET /api/bigdata/status - Check if BigData API is configured and working
app.get('/api/bigdata/status', async (req, res) => {
  const configured = bigdata.isConfigured();
  if (!configured) {
    return res.json({ configured: false, connected: false, message: 'No API key configured' });
  }
  try {
    const test = await bigdata.testConnection();
    res.json({
      configured: true,
      connected: test.success,
      message: test.message,
      keyPrefix: bigdataApiKey ? bigdataApiKey.slice(0, 8) + '...' : null
    });
  } catch (err) {
    res.json({ configured: true, connected: false, message: err.message });
  }
});

// POST /api/bigdata/key - Save BigData API key
app.post('/api/bigdata/key', (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length < 10) {
    return res.status(400).json({ error: 'Invalid API key format' });
  }
  bigdataApiKey = apiKey.trim();
  res.json({ status: 'ok', message: 'BigData API key saved' });
});

// GET /api/bigdata/flow/:symbol - Options flow data
app.get('/api/bigdata/flow/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  try {
    const data = await bigdata.getOptionsFlow(symbol);
    if (!data) {
      return res.status(503).json({ error: 'BigData unavailable', fallback: true });
    }
    res.json(data);
  } catch (err) {
    console.error('[BigData] Flow endpoint error:', err.message);
    res.status(502).json({ error: 'Failed to fetch flow data', fallback: true });
  }
});

// GET /api/bigdata/darkpool/:symbol - Dark pool prints
app.get('/api/bigdata/darkpool/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  try {
    const data = await bigdata.getDarkPool(symbol);
    if (!data) {
      return res.status(503).json({ error: 'BigData unavailable', fallback: true });
    }
    res.json(data);
  } catch (err) {
    console.error('[BigData] Dark pool endpoint error:', err.message);
    res.status(502).json({ error: 'Failed to fetch dark pool data', fallback: true });
  }
});

// GET /api/bigdata/sentiment/:symbol - Sentiment analysis
app.get('/api/bigdata/sentiment/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  try {
    const data = await bigdata.getSentiment(symbol);
    if (!data) {
      return res.status(503).json({ error: 'BigData unavailable', fallback: true });
    }
    res.json(data);
  } catch (err) {
    console.error('[BigData] Sentiment endpoint error:', err.message);
    res.status(502).json({ error: 'Failed to fetch sentiment data', fallback: true });
  }
});

// GET /api/bigdata/insider/:symbol - Insider trades
app.get('/api/bigdata/insider/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  try {
    const data = await bigdata.getInsider(symbol);
    if (!data) {
      return res.status(503).json({ error: 'BigData unavailable', fallback: true });
    }
    res.json(data);
  } catch (err) {
    console.error('[BigData] Insider endpoint error:', err.message);
    res.status(502).json({ error: 'Failed to fetch insider data', fallback: true });
  }
});

// GET /api/bigdata/institutional/:symbol - Institutional ownership
app.get('/api/bigdata/institutional/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  try {
    const data = await bigdata.getInstitutional(symbol);
    if (!data) {
      return res.status(503).json({ error: 'BigData unavailable', fallback: true });
    }
    res.json(data);
  } catch (err) {
    console.error('[BigData] Institutional endpoint error:', err.message);
    res.status(502).json({ error: 'Failed to fetch institutional data', fallback: true });
  }
});

// GET /api/bigdata/movers - Market movers
app.get('/api/bigdata/movers', async (req, res) => {
  try {
    const data = await bigdata.getMarketMovers();
    if (!data) {
      return res.status(503).json({ error: 'BigData unavailable', fallback: true });
    }
    res.json(data);
  } catch (err) {
    console.error('[BigData] Movers endpoint error:', err.message);
    res.status(502).json({ error: 'Failed to fetch market movers', fallback: true });
  }
});

// GET /api/bigdata/sectors - Sector performance
app.get('/api/bigdata/sectors', async (req, res) => {
  const period = req.query.period || '1D';
  try {
    const data = await bigdata.getSectorPerformance(period);
    if (!data) {
      return res.status(503).json({ error: 'BigData unavailable', fallback: true });
    }
    res.json(data);
  } catch (err) {
    console.error('[BigData] Sectors endpoint error:', err.message);
    res.status(502).json({ error: 'Failed to fetch sector data', fallback: true });
  }
});

// ============================================
// USER DATA PERSISTENCE (Supabase)
// ============================================

// --- Auth Profile ---
app.get('/api/auth/profile', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('user_profiles')
      .select('*')
      .eq('user_id', req.user.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        const meta = req.user.user_metadata || {};
        const { data: newProfile, error: insertErr } = await supabaseAdmin
          .from('user_profiles')
          .insert({
            user_id: req.user.id,
            display_name: meta.display_name || meta.name || req.user.email.split('@')[0]
          })
          .select()
          .single();

        if (insertErr) return res.status(500).json({ error: insertErr.message });
        return res.json(newProfile);
      }
      return res.status(500).json({ error: error.message });
    }
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/profile', requireAuth, async (req, res) => {
  const { display_name, avatar_url, timezone } = req.body;
  const updates = {};
  if (display_name !== undefined) updates.display_name = display_name;
  if (avatar_url !== undefined) updates.avatar_url = avatar_url;
  if (timezone !== undefined) updates.timezone = timezone;
  updates.updated_at = new Date().toISOString();

  try {
    const { data, error } = await supabaseAdmin
      .from('user_profiles')
      .upsert({ user_id: req.user.id, ...updates })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Watchlists ---
app.get('/api/user/watchlists', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('watchlists')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/user/watchlists', requireAuth, async (req, res) => {
  const { id, name, tickers, is_default } = req.body;

  try {
    if (id) {
      const { data, error } = await supabaseAdmin
        .from('watchlists')
        .update({
          name: name,
          tickers: tickers,
          is_default: is_default || false,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .eq('user_id', req.user.id)
        .select()
        .single();

      if (error) return res.status(500).json({ error: error.message });
      return res.json(data);
    }

    const { data, error } = await supabaseAdmin
      .from('watchlists')
      .insert({
        user_id: req.user.id,
        name: name || 'Watchlist',
        tickers: tickers || [],
        is_default: is_default || false
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/user/watchlists/:id', requireAuth, async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('watchlists')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ status: 'deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- User Settings ---
app.get('/api/user/settings', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('user_settings')
      .select('settings')
      .eq('user_id', req.user.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return res.json({});
      return res.status(500).json({ error: error.message });
    }
    res.json(data ? data.settings : {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/user/settings', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('user_settings')
      .upsert({
        user_id: req.user.id,
        settings: req.body,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json(data ? data.settings : req.body);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- API Credentials ---
app.get('/api/user/api-keys', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('api_credentials')
      .select('id, credential_type, metadata, created_at, updated_at')
      .eq('user_id', req.user.id);

    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/user/api-keys', requireAuth, async (req, res) => {
  const { credential_type, encrypted_key, encrypted_secret, metadata } = req.body;

  if (!credential_type || !encrypted_key) {
    return res.status(400).json({ error: 'credential_type and encrypted_key are required' });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('api_credentials')
      .upsert({
        user_id: req.user.id,
        credential_type: credential_type,
        encrypted_key: encrypted_key,
        encrypted_secret: encrypted_secret || null,
        metadata: metadata || {},
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,credential_type' })
      .select('id, credential_type, metadata, created_at, updated_at')
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/user/api-keys/:id', requireAuth, async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('api_credentials')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ status: 'deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// NEWS FEED ENDPOINT
// ============================================

const newsCache = { data: null, timestamp: 0 };
const NEWS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function generateMockNews(symbols) {
  const now = Date.now();
  const allNews = [
    { headline: 'NVIDIA Surges on Record Data Center Revenue, AI Demand Accelerates', source: 'Reuters', time: now - 120000, sentiment: 'bullish', tickers: ['NVDA'], category: 'top' },
    { headline: 'Federal Reserve Signals Patience on Rate Cuts Amid Sticky Inflation', source: 'Bloomberg', time: now - 300000, sentiment: 'bearish', tickers: ['SPY','QQQ'], category: 'top' },
    { headline: 'Apple Announces New AI Features Coming to iPhone 17 Lineup', source: 'CNBC', time: now - 480000, sentiment: 'bullish', tickers: ['AAPL'], category: 'top' },
    { headline: 'Tesla Deliveries Miss Estimates for Q1, Shares Under Pressure', source: 'MarketWatch', time: now - 720000, sentiment: 'bearish', tickers: ['TSLA'], category: 'top' },
    { headline: 'Microsoft Azure Growth Reaccelerates, Cloud Spending Cycle Intact', source: 'The Information', time: now - 900000, sentiment: 'bullish', tickers: ['MSFT'], category: 'top' },
    { headline: 'Amazon Web Services Wins Major Government Cloud Contract', source: 'WSJ', time: now - 1200000, sentiment: 'bullish', tickers: ['AMZN'], category: 'top' },
    { headline: 'Meta Platforms Increases Capital Expenditure Guidance for AI Infrastructure', source: 'Reuters', time: now - 1500000, sentiment: 'neutral', tickers: ['META'], category: 'top' },
    { headline: 'Palantir Secures $480M Pentagon Contract for AI Defense Platform', source: 'Defense News', time: now - 1800000, sentiment: 'bullish', tickers: ['PLTR'], category: 'top' },
    { headline: 'JPMorgan Warns of Rising Credit Card Delinquencies in Consumer Banking', source: 'Financial Times', time: now - 2100000, sentiment: 'bearish', tickers: ['JPM'], category: 'top' },
    { headline: 'Coinbase Volume Surges as Bitcoin Breaks New All-Time Highs', source: 'CoinDesk', time: now - 2400000, sentiment: 'bullish', tickers: ['COIN'], category: 'top' },
    { headline: 'AMD Unveils Next-Gen MI400 AI Chip to Challenge NVIDIA Dominance', source: 'Tom\'s Hardware', time: now - 2700000, sentiment: 'bullish', tickers: ['AMD'], category: 'top' },
    { headline: 'Disney Streaming Subscriber Growth Slows, Ad Tier Shows Promise', source: 'Variety', time: now - 3000000, sentiment: 'neutral', tickers: ['DIS'], category: 'top' },
    { headline: 'Google Cloud Revenue Crosses $40B Annual Run Rate', source: 'TechCrunch', time: now - 3300000, sentiment: 'bullish', tickers: ['GOOGL'], category: 'top' },
    { headline: 'VIX Spikes Above 20 Amid Geopolitical Uncertainty in Middle East', source: 'Bloomberg', time: now - 3600000, sentiment: 'bearish', tickers: ['SPY'], category: 'top' },
    { headline: 'Semiconductor Equipment Orders Surge, Signaling Capacity Build-Out', source: 'SEMI', time: now - 4200000, sentiment: 'bullish', tickers: ['NVDA','AMD'], category: 'top' },
    // Earnings-specific news
    { headline: 'NVIDIA Q4 Earnings Preview: Street Expects Massive Beat on AI Momentum', source: 'Seeking Alpha', time: now - 600000, sentiment: 'bullish', tickers: ['NVDA'], category: 'earnings' },
    { headline: 'Apple Earnings This Week: Services Revenue Key to Beating Estimates', source: 'Barron\'s', time: now - 900000, sentiment: 'neutral', tickers: ['AAPL'], category: 'earnings' },
    { headline: 'AMD Earnings: Can Data Center Segment Offset PC Weakness?', source: 'Motley Fool', time: now - 1400000, sentiment: 'neutral', tickers: ['AMD'], category: 'earnings' },
    { headline: 'Meta Earnings Expected to Show Strong Reels Monetization Progress', source: 'The Verge', time: now - 2000000, sentiment: 'bullish', tickers: ['META'], category: 'earnings' },
  ];

  let filtered = allNews;
  if (symbols && symbols.length > 0) {
    const symSet = new Set(symbols.map(s => s.toUpperCase()));
    filtered = allNews.filter(n => n.tickers.some(t => symSet.has(t)));
  }
  return filtered;
}

app.get('/api/news', (req, res) => {
  const symbols = req.query.symbols ? req.query.symbols.split(',') : [];
  const category = req.query.category || 'all';

  // Check cache
  const now = Date.now();
  if (newsCache.data && (now - newsCache.timestamp) < NEWS_CACHE_TTL && !symbols.length) {
    let data = newsCache.data;
    if (category !== 'all') data = data.filter(n => n.category === category);
    return res.json({ news: data, cached: true });
  }

  // Generate fresh mock news
  const news = generateMockNews(symbols);
  if (!symbols.length) {
    newsCache.data = news;
    newsCache.timestamp = now;
  }

  let result = news;
  if (category !== 'all') result = result.filter(n => n.category === category);

  res.json({ news: result, cached: false });
});

// ============================================
// STATIC FILES & SERVER START
// ============================================

app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, function () {
  console.log('');
  console.log('  GREYSTONE TRADING PLATFORM');
  console.log('  Server running at http://localhost:' + PORT);
  console.log('');
  console.log('  Market Data:');
  console.log('    GET /api/quote/:symbol');
  console.log('    GET /api/quotes?symbols=AAPL,NVDA,...');
  console.log('    GET /api/chart/:symbol?interval=5m&range=1d');
  console.log('');
  console.log('  Options Chain:');
  console.log('    GET /api/options/:symbol');
  console.log('    GET /api/options/:symbol/:expiration');
  console.log('');
  console.log('  Grey Sankore AI:');
  console.log('    POST /api/ai/chat');
  console.log('    POST /api/ai/analyze');
  console.log('    POST /api/ai/key');
  console.log('    GET  /api/ai/status');
  console.log('');
  if (anthropicApiKey) {
    console.log('  Anthropic API key loaded (' + anthropicApiKey.slice(0, 8) + '...)');
  } else {
    console.log('  No AI API key. Set via Settings or ANTHROPIC_API_KEY env var.');
  }
  console.log('');
  console.log('  BigData.com Premium Data:');
  if (bigdataApiKey) {
    console.log('    API key loaded (' + bigdataApiKey.slice(0, 8) + '...)');
  } else {
    console.log('    No API key. Set via Settings or BIGDATA_API_KEY env var.');
    console.log('    Platform will use Yahoo Finance + simulated data as fallback.');
  }
  console.log('    GET  /api/bigdata/status');
  console.log('    GET  /api/bigdata/flow/:symbol');
  console.log('    GET  /api/bigdata/darkpool/:symbol');
  console.log('    GET  /api/bigdata/sentiment/:symbol');
  console.log('    GET  /api/bigdata/insider/:symbol');
  console.log('    GET  /api/bigdata/institutional/:symbol');
  console.log('    GET  /api/bigdata/movers');
  console.log('    GET  /api/bigdata/sectors');
  console.log('    POST /api/bigdata/key');
  console.log('');
  console.log('  Alpaca Trading:');
  console.log('    Mode: ' + (ALPACA_PAPER_MODE ? 'PAPER' : 'LIVE'));
  console.log('    Configured: ' + (ALPACA_API_KEY ? 'Yes' : 'No (simulation only)'));
  console.log('    GET  /api/alpaca/account');
  console.log('    GET  /api/alpaca/positions');
  console.log('    POST /api/alpaca/order');
  console.log('    GET  /api/alpaca/orders');
  console.log('    GET  /api/health');
  console.log('');
  console.log('  News Feed:');
  console.log('    GET /api/news?symbols=AAPL,NVDA&category=top');
  console.log('');
  console.log('  Supabase Auth:');
  console.log('    Configured: ' + (SUPABASE_URL ? 'Yes' : 'No (guest mode only)'));
  console.log('    GET  /api/config');
  console.log('    GET  /api/auth/profile');
  console.log('    POST /api/auth/profile');
  console.log('    GET  /api/user/watchlists');
  console.log('    POST /api/user/watchlists');
  console.log('    GET  /api/user/settings');
  console.log('    POST /api/user/settings');
  console.log('    GET  /api/user/api-keys');
  console.log('    POST /api/user/api-keys');
  console.log('');
});
