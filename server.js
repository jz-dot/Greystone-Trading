/* ============================================
   GREYSTONE TRADING PLATFORM - API Server
   Proxies Yahoo Finance API to avoid CORS,
   with 15-second response caching.
   ============================================ */

const express = require('express');
const https = require('https');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ---- Response Cache (15-second TTL) ----
const cache = new Map();
const CACHE_TTL = 15000; // 15 seconds

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

// ---- Yahoo Finance Proxy ----

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

// ---- API Endpoints ----

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

  // Check if we have all symbols cached
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
        // Skip failed symbols rather than failing the whole request
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

  // Validate interval and range
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

// ---- Response Parsers ----

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

  // Get volume from the indicators
  var volume = 0;
  if (chartResult.indicators && chartResult.indicators.quote && chartResult.indicators.quote[0]) {
    var volumes = chartResult.indicators.quote[0].volume;
    if (volumes && volumes.length > 0) {
      // Sum all volume bars for total day volume
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
    // Skip null data points
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

// ---- Static File Serving ----
app.use(express.static(path.join(__dirname)));

// ---- Start Server ----
app.listen(PORT, function () {
  console.log('');
  console.log('  GREYSTONE TRADING PLATFORM');
  console.log('  Server running at http://localhost:' + PORT);
  console.log('  API endpoints:');
  console.log('    GET /api/quote/:symbol');
  console.log('    GET /api/quotes?symbols=AAPL,NVDA,...');
  console.log('    GET /api/chart/:symbol?interval=5m&range=1d');
  console.log('');
});
