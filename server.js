/* ============================================
   GREYSTONE TRADING PLATFORM - Backend Server
   - Yahoo Finance proxy for market data (CORS)
   - Anthropic API proxy for Grey Sankore AI
   - Response caching for rate limit protection
   ============================================ */

const express = require('express');
const https = require('https');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Alpaca Config ---
const ALPACA_API_KEY = process.env.ALPACA_API_KEY || '';
const ALPACA_API_SECRET = process.env.ALPACA_API_SECRET || '';
const ALPACA_PAPER_MODE = process.env.ALPACA_PAPER_MODE !== 'false'; // default true

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

app.use(express.json({ limit: '1mb' }));

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

// --- Alpaca proxy: Place Order ---
app.post('/api/alpaca/order', async (req, res) => {
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

// --- Alpaca proxy: Cancel Order ---
app.delete('/api/alpaca/order/:id', async (req, res) => {
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

// --- Alpaca proxy: Generic proxy for any endpoint ---
app.post('/api/alpaca/proxy', async (req, res) => {
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
  console.log('  Alpaca Trading:');
  console.log('    Mode: ' + (ALPACA_PAPER_MODE ? 'PAPER' : 'LIVE'));
  console.log('    Configured: ' + (ALPACA_API_KEY ? 'Yes' : 'No (simulation only)'));
  console.log('    GET  /api/alpaca/account');
  console.log('    GET  /api/alpaca/positions');
  console.log('    POST /api/alpaca/order');
  console.log('    GET  /api/alpaca/orders');
  console.log('    GET  /api/health');
  console.log('');
});
