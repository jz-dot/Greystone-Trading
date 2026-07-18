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
const crypto = require('crypto');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');
const { createBigDataService } = require('./services/bigdata-client');
const aiTools = require('./services/ai-tools');
const { createPaperBroker } = require('./services/paper-broker');

// Official Anthropic SDK. Resolve the constructor across CJS export shapes.
const AnthropicSDK = require('@anthropic-ai/sdk');
const Anthropic = AnthropicSDK.Anthropic || AnthropicSDK.default || AnthropicSDK;

// Current Opus-tier model id (per the claude-api reference). One constant so
// every Grey Sankore call stays in sync.
const AI_MODEL = 'claude-opus-4-8';

const app = express();
const PORT = process.env.PORT || 3000;

// --- Alpaca Config ---
const ALPACA_API_KEY = process.env.ALPACA_API_KEY || '';
const ALPACA_API_SECRET = process.env.ALPACA_API_SECRET || '';
const ALPACA_PAPER_MODE = process.env.ALPACA_PAPER_MODE !== 'false'; // default true

// --- IBKR Config ---
const IBKR_GATEWAY_URL = process.env.IBKR_GATEWAY_URL || 'https://localhost:5000/v1/api';
const IBKR_ACCOUNT_ID = process.env.IBKR_ACCOUNT_ID || '';
const IBKR_MAX_ORDER_QTY = parseInt(process.env.IBKR_MAX_ORDER_QTY || '1000');

// --- Questrade Config ---
let questradeRefreshToken = process.env.QUESTRADE_REFRESH_TOKEN || '';
let questradeAccessToken = '';
let questradeApiServer = '';
const QUESTRADE_ACCOUNT_ID = process.env.QUESTRADE_ACCOUNT_ID || '';
const QUESTRADE_MAX_ORDER_QTY = parseInt(process.env.QUESTRADE_MAX_ORDER_QTY || '1000');

// --- Order Safety Guardrails ---
// Global max share/contract quantity and dollar-notional cap. These are
// server-side, coarse limits. True per-user position and exposure limits are a
// later item; see the change report.
const MAX_ORDER_QTY = parseInt(process.env.MAX_ORDER_QTY || '1000', 10);
const MAX_ORDER_NOTIONAL = parseFloat(process.env.MAX_ORDER_NOTIONAL || '50000');

// --- Live-trading server-side gates ---
// Alpaca is gated by ALPACA_PAPER_MODE above. IBKR and Questrade have no paper
// endpoint here, so live order placement is disabled unless the operator opts
// in server-side. The client-settable X-Confirm-Live-Trade header is only a UX
// confirmation flag, never the security gate.
const IBKR_LIVE_TRADING = process.env.IBKR_LIVE_TRADING === 'true';
const QUESTRADE_LIVE_TRADING = process.env.QUESTRADE_LIVE_TRADING === 'true';

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

// ============================================
// SECRET ENCRYPTION AT REST (AES-256-GCM)
// ============================================
// Per-user API credentials stored in Supabase (api_credentials) are encrypted
// with a server-held MASTER_KEY before they touch the database. The column was
// historically named "encrypted_*" but stored plaintext; these helpers make it
// real. Format of a ciphertext string:  v1:gcm:<ivB64>:<tagB64>:<cipherB64>.
const MASTER_KEY = process.env.MASTER_KEY || '';
const ENC_PREFIX = 'v1:gcm:';

// Resolve MASTER_KEY (hex or base64) to a 32-byte Buffer, or null if unusable.
function getMasterKeyBuffer() {
  if (!MASTER_KEY) return null;
  try {
    if (/^[0-9a-fA-F]{64}$/.test(MASTER_KEY)) return Buffer.from(MASTER_KEY, 'hex');
    const b = Buffer.from(MASTER_KEY, 'base64');
    if (b.length === 32) return b;
    // Last resort: derive a stable 32-byte key from an arbitrary passphrase.
    return crypto.createHash('sha256').update(MASTER_KEY).digest();
  } catch (e) {
    return null;
  }
}

// Encrypt a plaintext secret. Returns a self-describing ciphertext string. If
// no MASTER_KEY is configured, returns the plaintext unchanged and warns once,
// so the endpoint keeps working (encryption disabled) rather than failing.
let warnedNoMasterKey = false;
function encryptSecret(plaintext) {
  if (plaintext == null) return plaintext;
  const key = getMasterKeyBuffer();
  if (!key) {
    if (!warnedNoMasterKey) {
      console.warn('[Security] MASTER_KEY not set: API credentials are stored WITHOUT encryption. Set MASTER_KEY to enable encryption at rest.');
      warnedNoMasterKey = true;
    }
    return String(plaintext);
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ENC_PREFIX + iv.toString('base64') + ':' + tag.toString('base64') + ':' + ct.toString('base64');
}

// Decrypt a stored secret. A value that is not in our ciphertext format is
// treated as a legacy plaintext value and returned unchanged, so existing rows
// keep working. Returns null if a real ciphertext cannot be decrypted.
function decryptSecret(stored) {
  if (stored == null) return null;
  const s = String(stored);
  if (s.indexOf(ENC_PREFIX) !== 0) return s; // legacy plaintext passthrough
  const key = getMasterKeyBuffer();
  if (!key) {
    console.warn('[Security] Encrypted credential found but MASTER_KEY is not set; cannot decrypt.');
    return null;
  }
  try {
    const parts = s.slice(ENC_PREFIX.length).split(':');
    if (parts.length !== 3) return null;
    const iv = Buffer.from(parts[0], 'base64');
    const tag = Buffer.from(parts[1], 'base64');
    const ct = Buffer.from(parts[2], 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return pt.toString('utf8');
  } catch (e) {
    console.error('[Security] Credential decryption failed:', e.message);
    return null;
  }
}

// ============================================
// SECURITY HARDENING (helmet, CORS allowlist, rate limits)
// ============================================

// Security headers. CSP and COEP are left off so the existing single-page
// frontend (inline scripts, external resources) keeps working; a tuned CSP is
// a later item. All other protections (HSTS, X-Content-Type-Options,
// frameguard, etc.) stay on.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

// CORS allowlist. Default is same-origin only: browser cross-origin requests
// are blocked unless their Origin is listed in ALLOWED_ORIGINS (comma
// separated). Same-origin and non-browser requests (no Origin header) are
// always allowed so the co-hosted frontend keeps working.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(function (s) { return s.trim(); })
  .filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // same-origin or server-to-server
    if (ALLOWED_ORIGINS.length > 0 && ALLOWED_ORIGINS.indexOf(origin) !== -1) {
      return callback(null, true);
    }
    // Not allowed: respond without CORS headers so the browser blocks it.
    return callback(null, false);
  },
  credentials: true,
}));

app.use(express.json({ limit: '1mb' }));

// General rate limiter for all API routes, with stricter limits on the AI
// proxy (server-funded Anthropic calls) and the auth/credential routes.
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'RATE_LIMITED', message: 'Too many requests. Please slow down.' },
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'RATE_LIMITED', message: 'Too many AI requests. Please slow down.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'RATE_LIMITED', message: 'Too many attempts. Please try again later.' },
});

app.use('/api/', generalLimiter);
app.use('/api/ai/', aiLimiter);
app.use('/api/auth/', authLimiter);

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

// ============================================
// ORDER GUARDRAIL + UPSTREAM ERROR HELPERS
// ============================================

// Validate an order's size before it is forwarded to a broker. Fails CLOSED:
// a missing, non-numeric, zero, or negative quantity is rejected. Dollar
// notional orders (Alpaca, no qty field) are capped by MAX_ORDER_NOTIONAL.
// Returns null when the order passes, otherwise { code, message }.
function checkOrderGuardrail(orderBody, maxQty, qtyFields) {
  orderBody = orderBody || {};
  qtyFields = qtyFields || ['qty'];

  function present(v) {
    return v !== undefined && v !== null && String(v).trim() !== '';
  }

  let rawQty;
  for (let i = 0; i < qtyFields.length; i++) {
    if (present(orderBody[qtyFields[i]])) { rawQty = orderBody[qtyFields[i]]; break; }
  }
  const hasQty = present(rawQty);
  const hasNotional = present(orderBody.notional);

  // Dollar-notional order with no quantity (e.g. Alpaca fractional/notional).
  if (hasNotional && !hasQty) {
    const notional = Number(orderBody.notional);
    if (!Number.isFinite(notional) || notional <= 0) {
      return { code: 'GUARDRAIL', message: 'Order notional must be a positive number.' };
    }
    if (notional > MAX_ORDER_NOTIONAL) {
      return { code: 'GUARDRAIL', message: 'Order notional ' + notional + ' exceeds server max of ' + MAX_ORDER_NOTIONAL + '.' };
    }
    return null;
  }

  // Quantity order: require a valid, positive number at or under the cap.
  const qty = Number(rawQty);
  if (!hasQty || !Number.isFinite(qty) || qty <= 0) {
    return { code: 'GUARDRAIL', message: 'Order quantity must be a positive number.' };
  }
  if (qty > maxQty) {
    return { code: 'GUARDRAIL', message: 'Order quantity ' + qty + ' exceeds server max of ' + maxQty + '.' };
  }
  // If a notional is ALSO present alongside a quantity, cap it too.
  if (hasNotional) {
    const notional = Number(orderBody.notional);
    if (Number.isFinite(notional) && notional > MAX_ORDER_NOTIONAL) {
      return { code: 'GUARDRAIL', message: 'Order notional ' + notional + ' exceeds server max of ' + MAX_ORDER_NOTIONAL + '.' };
    }
  }
  return null;
}

// Return a sanitized error to the client. The full upstream detail is logged
// server-side only; the client gets a generic message and status. Never echo
// raw provider error text or provider payloads to the response.
function respondUpstreamError(res, status, code, logLabel, detail) {
  console.error('[Upstream] ' + logLabel + ':', detail);
  res.status(status || 502).json({
    error: code,
    message: 'Upstream service error. Please try again later.',
  });
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

// ---- Yahoo v7 Quote (crumb-based, for fundamentals) ----
var yahooCrumb = { crumb: null, cookies: null, expiry: 0 };

function httpGetRaw(opts) {
  return new Promise(function (resolve, reject) {
    https.get(opts, function (res) {
      var cookies = (res.headers['set-cookie'] || []).map(function(c) { return c.split(';')[0]; }).join('; ');
      var data = '';
      res.on('data', function (c) { data += c; });
      res.on('end', function () { resolve({ status: res.statusCode, cookies: cookies, body: data }); });
    }).on('error', reject);
  });
}

async function refreshYahooCrumb() {
  if (yahooCrumb.crumb && Date.now() < yahooCrumb.expiry) return;
  try {
    var consent = await httpGetRaw({
      hostname: 'fc.yahoo.com', path: '/',
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }
    });
    var crumbResp = await httpGetRaw({
      hostname: 'query2.finance.yahoo.com', path: '/v1/test/getcrumb',
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36', 'Cookie': consent.cookies }
    });
    if (crumbResp.status === 200 && crumbResp.body.length > 0 && crumbResp.body.length < 50) {
      yahooCrumb.crumb = crumbResp.body.trim();
      yahooCrumb.cookies = [consent.cookies, crumbResp.cookies].filter(Boolean).join('; ');
      yahooCrumb.expiry = Date.now() + 3600000; // 1 hour
      console.log('[Yahoo] Crumb refreshed successfully');
    }
  } catch (e) {
    console.warn('[Yahoo] Crumb refresh failed:', e.message);
  }
}

async function yahooV7Quote(symbols) {
  await refreshYahooCrumb();
  if (!yahooCrumb.crumb) return {};

  var resp = await httpGetRaw({
    hostname: 'query2.finance.yahoo.com',
    path: '/v7/finance/quote?symbols=' + encodeURIComponent(symbols) + '&crumb=' + encodeURIComponent(yahooCrumb.crumb),
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'Cookie': yahooCrumb.cookies }
  });

  if (resp.status === 401) {
    // Crumb expired, force refresh
    yahooCrumb.expiry = 0;
    await refreshYahooCrumb();
    if (!yahooCrumb.crumb) return {};
    resp = await httpGetRaw({
      hostname: 'query2.finance.yahoo.com',
      path: '/v7/finance/quote?symbols=' + encodeURIComponent(symbols) + '&crumb=' + encodeURIComponent(yahooCrumb.crumb),
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'Cookie': yahooCrumb.cookies }
    });
  }

  if (resp.status !== 200) return {};
  try {
    var j = JSON.parse(resp.body);
    var results = j.quoteResponse && j.quoteResponse.result;
    if (!results || results.length === 0) return {};
    // Return first result (for single symbol) or map by symbol
    var map = {};
    results.forEach(function (q) { map[q.symbol] = q; });
    return map;
  } catch (e) {
    return {};
  }
}

// Pre-fetch crumb on startup
refreshYahooCrumb();

// Ticker search / autocomplete
app.get('/api/search', async function (req, res) {
  var query = (req.query.q || '').trim();
  if (!query || query.length < 1) {
    return res.json({ quotes: [] });
  }

  var cacheKey = 'search:' + query.toLowerCase();
  var cached = getCached(cacheKey);
  if (cached) return res.json(cached);

  try {
    var data = await yahooFetch('/v1/finance/search?q=' + encodeURIComponent(query) + '&quotesCount=8&newsCount=0&listsCount=0');
    var result = { quotes: (data.quotes || []).map(function(q) {
      return {
        symbol: q.symbol,
        shortname: q.shortname || q.longname || '',
        longname: q.longname || '',
        quoteType: q.quoteType || 'Equity',
        exchange: q.exchDisp || q.exchange || ''
      };
    })};
    setCache(cacheKey, result);
    res.json(result);
  } catch (err) {
    console.error('[API] Search error:', err.message);
    res.json({ quotes: [] });
  }
});

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
  var validRanges = ['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '3y', '5y', '10y', 'ytd', 'max'];

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

const GREY_SANKORE_SYSTEM = `You are Grey Sankore, the AI research analyst inside GSP Trading, an open-source trading and market-research platform. Your role is education and research, NOT investment advice. You explain how markets, instruments, and analytical techniques work so a user can do their own research and reach their own decisions.

WHAT YOU ARE AND ARE NOT:
- You are an educational research tool. You are NOT a registered investment dealer, adviser, or financial planner, and you do not provide personalized investment advice, suitability assessments, or recommendations.
- You do NOT tell the user what to do with their money. You explain concepts, methods, scenarios, and trade-offs so they can decide for themselves.
- When a user asks a personalized suitability question (for example "should I put my savings into X", "what should I buy", "is this a good investment for me", "how much should I invest"), decline to advise. Briefly explain that this is a suitability question that depends on their goals, risk tolerance, time horizon, and full financial picture, which only they or a licensed adviser can properly assess. Then offer to explain the relevant concepts, risks, and how one would analyze the question instead.

PERSONALITY AND COMMUNICATION STYLE:
- Precise, data-driven, and clear. Explain rather than instruct.
- Reference specific levels, percentages, and metrics to illustrate concepts, framed as observations and analysis rather than directives.
- Use structured analysis: what is being observed, what it can mean, what the counter-arguments and risks are, what an analyst would look at next.
- Confident about mechanics and methods, intellectually honest about uncertainty. Markets are uncertain and past behavior does not predict future results.
- NEVER use em dashes. Use hyphens, commas, semicolons, or restructure sentences instead.

ANALYTICAL CONCEPTS YOU CAN EXPLAIN:
- Anomaly detection: how unusual options flow, volume divergences, volatility skew anomalies, dark pool activity patterns, and institutional positioning signals are identified and what they can indicate.
- Valuation screening: how multi-factor views using forward P/E vs historical averages, FCF yield, EV/EBITDA, PEG ratio, and mean-reversion signals are constructed and read.
- Momentum analysis: how breakouts confirmed by volume, RSI divergences, moving average crossovers, and Bollinger Band dynamics are interpreted.
- Greeks: how delta exposure, gamma risk at key strikes, theta decay, and vega sensitivity to IV regime changes work.
- IV percentile analysis: IV rank vs 52-week range, term structure, and skew dynamics.
- Flow interpretation: sweep detection, block trade analysis, put/call premium ratios, and the difference between institutional and retail flow.
- Dark pool activity: how block prints and accumulation/distribution patterns are read.

UNIVERSE AWARENESS:
- Discuss Large Cap ($10B+), Mid Cap ($2B-$10B), Small Cap ($300M-$2B), and Micro Cap (<$300M) universes, and how liquidity, spread dynamics, and information edge differ across them.

DISCUSSING SCENARIOS (NOT RECOMMENDATIONS):
- You may walk through how one could analyze an instrument, including illustrative entry, target, and risk levels AS EDUCATIONAL SCENARIOS that explain a technique, clearly framed as examples of how analysis is done, not as a recommendation to trade or a personal position-sizing instruction.
- Do NOT prescribe entries, targets, stop-losses, or position sizes as things the user should do. If you show levels, present them as illustrative analysis and note that position sizing and risk management are personal decisions that depend on the individual's circumstances.
- Always surface key risks, catalysts, and counter-scenarios alongside any illustrative analysis.

RESPONSE FORMAT:
- Use HTML formatting: <strong>, <ul>/<li>, <p> tags for structure.
- Keep responses focused and educational. No unnecessary preamble.
- Lead with the most important insight or concept.
- Use bullet points for multi-factor analysis.

COMPLIANCE:
- GSP Trading is open-source software for research and education, is not investment advice, and GSP Trading Inc. is not a registered investment dealer or adviser.`;

// --- Grey Sankore tool-use plumbing -------------------------------------

// Minimal, education-first note appended to whatever system prompt is in play
// on the chat path, so the model knows its tools exist and keeps the
// not-advice stance even when tool-grounded numbers are involved.
const TOOL_USE_ADDENDUM = `

LIVE DATA TOOLS:
You can call server-side tools to ground your analysis in real platform data: get_quote and get_price_history for live and historical prices, get_options_chain for an options summary with implied volatility and Black-Scholes Greeks, and compare_broker_costs, estimate_fx_drag, and norberts_gambit_savings for all-in Canadian broker trading costs including the hidden currency-conversion fee. Prefer calling a tool over guessing whenever a concrete number would strengthen the explanation, and cite the figures you retrieve. Any tool-grounded number is still educational analysis, not investment advice, a price prediction, or a recommendation to trade; keep the not-advice framing in every answer. Portfolio or position details in the market context come from the user's own browser; treat them as background, never as a suitability mandate.`;

// Cap on server-side tool rounds per request. After this the model is forced
// to answer without further tool calls.
const MAX_TOOL_ROUNDS = 5;

const ANTHROPIC_CREDENTIAL_TYPE = 'anthropic';

// Internal market-data helpers the tools call. They reuse the same Yahoo
// fetch + parse + cache path as the public routes, so a tool call and a UI
// request share results and rate-limit protection.
async function aiFetchQuote(symbol) {
  symbol = String(symbol || '').toUpperCase();
  const cacheKey = 'quote:' + symbol;
  const cached = getCached(cacheKey);
  if (cached) return cached;
  const data = await yahooFetch('/v8/finance/chart/' + encodeURIComponent(symbol) + '?interval=1d&range=1d');
  const result = parseQuote(data, symbol);
  setCache(cacheKey, result);
  return result;
}

async function aiFetchChart(symbol, interval, range) {
  symbol = String(symbol || '').toUpperCase();
  const validIntervals = ['1m', '2m', '5m', '15m', '30m', '60m', '90m', '1h', '1d', '5d', '1wk', '1mo'];
  const validRanges = ['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '3y', '5y', '10y', 'ytd', 'max'];
  if (validIntervals.indexOf(interval) === -1) interval = '1d';
  if (validRanges.indexOf(range) === -1) range = '1mo';
  const cacheKey = 'chart:' + symbol + ':' + interval + ':' + range;
  const cached = getCached(cacheKey);
  if (cached) return cached;
  const data = await yahooFetch('/v8/finance/chart/' + encodeURIComponent(symbol) + '?interval=' + interval + '&range=' + range);
  const result = parseChart(data, symbol);
  setCache(cacheKey, result);
  return result;
}

// Dependencies injected into the tool layer (services/ai-tools.js).
const AI_TOOL_DEPS = {
  getQuote: aiFetchQuote,
  getChart: aiFetchChart,
  getOptions: getOptionsData,
};

// Resolve the caller's Anthropic key. Authenticated path: decrypt the user's
// stored BYO key from api_credentials. Guest/preview fallback: the server
// env/global key. Never throws; returns { key, source }.
async function resolveAnthropicKey(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.indexOf('Bearer ') === 0 && supabaseAdmin) {
    const token = authHeader.slice(7);
    try {
      const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
      if (!userErr && userData && userData.user) {
        const { data: cred } = await supabaseAdmin
          .from('api_credentials')
          .select('encrypted_key')
          .eq('user_id', userData.user.id)
          .eq('credential_type', ANTHROPIC_CREDENTIAL_TYPE)
          .maybeSingle();
        if (cred && cred.encrypted_key) {
          const key = decryptSecret(cred.encrypted_key);
          if (key && key.trim()) return { key: key.trim(), source: 'user' };
        }
      }
    } catch (e) {
      console.warn('[Grey Sankore] BYO key resolution failed; falling back to server key:', e.message);
    }
  }
  if (anthropicApiKey) return { key: anthropicApiKey, source: 'server' };
  return { key: null, source: 'none' };
}

function extractAssistantText(resp) {
  if (!resp || !Array.isArray(resp.content)) return '';
  return resp.content.filter(b => b.type === 'text').map(b => b.text).join('');
}

// Agentic tool loop. Runs the model, executes any tool calls server-side,
// feeds results back, and returns the final assistant text. Tool errors come
// back as tool_result blocks with is_error so the model can recover.
async function runToolLoop(client, system, messages, tools) {
  const convo = messages.slice();
  for (let round = 0; ; round++) {
    const allowTools = round < MAX_TOOL_ROUNDS;
    const params = {
      model: AI_MODEL,
      max_tokens: 2048,
      system: system,
      messages: convo,
      tools: tools,
    };
    // Past the cap, force a plain text answer (no further tool calls).
    if (!allowTools) params.tool_choice = { type: 'none' };

    const resp = await client.messages.create(params);

    if (resp.stop_reason === 'tool_use' && allowTools) {
      convo.push({ role: 'assistant', content: resp.content });
      const toolResults = [];
      for (const block of resp.content) {
        if (block.type !== 'tool_use') continue;
        let content;
        let isError = false;
        try {
          const result = await aiTools.executeTool(block.name, block.input, AI_TOOL_DEPS);
          content = JSON.stringify(result);
        } catch (e) {
          content = JSON.stringify({ error: (e && e.message) ? e.message : String(e) });
          isError = true;
        }
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: content, is_error: isError });
      }
      convo.push({ role: 'user', content: toolResults });
      continue;
    }

    // Terminal turn (end_turn / max_tokens / forced final): return its text.
    return extractAssistantText(resp);
  }
}

// Write assistant text to the client as the existing SSE { type:'text' } events.
// Chunked so the payload streams rather than arriving as one large write; the
// client accumulates text events until the [DONE] sentinel.
function sseWriteText(res, text) {
  if (!text) return;
  const CHUNK = 240;
  for (let i = 0; i < text.length; i += CHUNK) {
    res.write('data: ' + JSON.stringify({ type: 'text', text: text.slice(i, i + CHUNK) }) + '\n\n');
  }
}

// POST /api/ai/chat - Server-side tool-use agent, streamed to the client.
// The browser contract is unchanged: an SSE stream of { type:'text' } events
// terminated by a [DONE] sentinel. Tool calls happen entirely server-side;
// only the final assistant text reaches the client.
app.post('/api/ai/chat', async (req, res) => {
  const { message, context, history, systemPrompt } = req.body || {};

  // Resolve the key BEFORE any SSE headers so the no-key path can return a
  // JSON 401 (the client uses that to fall back to clearly-marked demo output).
  const resolved = await resolveAnthropicKey(req);
  if (!resolved.key) {
    return res.status(401).json({
      error: 'no_api_key',
      message: 'AI is not configured. Add your Anthropic API key in Settings, or set one on the server.'
    });
  }

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'missing_message', message: 'Message is required.' });
  }

  // Honor a caller-supplied system prompt (quick-chat sends one); else default.
  const systemText = (systemPrompt && typeof systemPrompt === 'string' && systemPrompt.trim())
    ? systemPrompt
    : GREY_SANKORE_SYSTEM;

  const messages = [];
  if (Array.isArray(history)) {
    history.forEach(h => {
      if (h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string') {
        messages.push({ role: h.role, content: h.content });
      }
    });
  }

  let contextStr = '';
  if (context) {
    const parts = [];
    if (context.selectedTicker) parts.push(`Selected Ticker: ${context.selectedTicker}`);
    if (context.capSize) parts.push(`Active Universe: ${context.capSize} Cap`);
    if (context.marketData) parts.push(`Market Context: ${JSON.stringify(context.marketData)}`);
    if (context.recentPrices) parts.push(`Recent Prices: ${JSON.stringify(context.recentPrices)}`);
    // Portfolio / positions stay CONTEXT from the browser (the server cannot
    // read localStorage), never a server tool.
    if (context.portfolio) parts.push(`Portfolio (from the user's browser): ${JSON.stringify(context.portfolio)}`);
    if (context.positions) parts.push(`Positions (from the user's browser): ${JSON.stringify(context.positions)}`);

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

  try {
    const client = new Anthropic({ apiKey: resolved.key });
    // System as a cached block: it is re-sent on every tool round, so
    // cache_control avoids re-billing it each turn (once the prefix clears the
    // model's minimum cacheable size).
    const system = [{ type: 'text', text: systemText + TOOL_USE_ADDENDUM, cache_control: { type: 'ephemeral' } }];
    const tools = aiTools.getToolDefinitions();

    const finalText = await runToolLoop(client, system, messages, tools);
    sseWriteText(res, finalText || '');
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    // Log the detail server-side; stream a generic error event to the client.
    console.error('[Grey Sankore] chat error:', err && err.message ? err.message : err);
    res.write(`data: ${JSON.stringify({ type: 'error', error: 'AI service error. Please try again.' })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  }
});

// POST /api/ai/analyze - Non-streaming analysis (guest-accessible, rate limited)
app.post('/api/ai/analyze', async (req, res) => {
  const { prompt, type } = req.body || {};

  const resolved = await resolveAnthropicKey(req);
  if (!resolved.key) {
    return res.status(401).json({
      error: 'no_api_key',
      message: 'AI is not configured. Add your Anthropic API key in Settings, or set one on the server.'
    });
  }

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'missing_prompt', message: 'Prompt is required.' });
  }

  try {
    const client = new Anthropic({ apiKey: resolved.key });
    const resp = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 1024,
      system: [{ type: 'text', text: GREY_SANKORE_SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: prompt }],
    });
    const text = extractAssistantText(resp);
    res.json({ text: text, type: type });
  } catch (err) {
    // Log the detail server-side; return a generic error to the client.
    const status = (err && typeof err.status === 'number') ? err.status : 502;
    console.error('[Grey Sankore] analyze error ' + status + ':', err && err.message ? err.message : err);
    res.status(status || 502).json({ error: 'ai_error', message: 'AI service error. Please try again.' });
  }
});

// POST /api/ai/key - Set API key (authenticated: writes a server-global key)
app.post('/api/ai/key', authLimiter, requireAuth, (req, res) => {
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
    model: 'claude-opus-4-8',
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
        // Log upstream detail server-side; return a generic validation result.
        console.error('[Grey Sankore] Anthropic key validation error ' + apiRes.statusCode + ':', body);
        res.json({ valid: false, message: 'Key rejected by Anthropic API (status ' + apiRes.statusCode + ')' });
      }
    });
  });

  apiReq.on('error', (err) => {
    console.error('[Grey Sankore] Anthropic key validation request error:', err.message);
    res.json({ valid: false, message: 'Could not reach Anthropic API.' });
  });

  apiReq.write(postData);
  apiReq.end();
});

// GET /api/ai/status - Check if key is set (never reveals any part of the key)
app.get('/api/ai/status', (req, res) => {
  res.json({
    configured: !!anthropicApiKey
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
    ibkrConfigured: IBKR_ACCOUNT_ID.length > 0,
    ibkrGateway: IBKR_GATEWAY_URL,
    questradeConfigured: QUESTRADE_ACCOUNT_ID.length > 0,
    supabaseConfigured: !!SUPABASE_URL && !!SUPABASE_ANON_KEY,
    timestamp: new Date().toISOString(),
  });
});

// --- Broker status (both brokers) ---
app.get('/api/broker/status', (req, res) => {
  res.json({
    alpaca: {
      configured: ALPACA_API_KEY.length > 0 && ALPACA_API_SECRET.length > 0,
      mode: ALPACA_PAPER_MODE ? 'paper' : 'live',
    },
    questrade: {
      configured: QUESTRADE_ACCOUNT_ID.length > 0,
      accountId: QUESTRADE_ACCOUNT_ID || null,
      authenticated: !!questradeAccessToken,
    },
    ibkr: {
      configured: IBKR_ACCOUNT_ID.length > 0,
      accountId: IBKR_ACCOUNT_ID || null,
      gatewayUrl: IBKR_GATEWAY_URL,
    },
    routing: {
      usEquities: 'alpaca',
      usOptions: 'alpaca',
      canadianEquities: 'questrade',
      international: 'ibkr',
      futures: 'ibkr',
      forex: 'ibkr',
      dataFeed: 'ibkr (non-US), yahoo + alpaca (US)',
    },
  });
});

// --- Alpaca proxy: Account --- (account data requires auth)
app.get('/api/alpaca/account', requireAuth, async (req, res) => {
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

// --- Alpaca proxy: Positions --- (account data requires auth)
app.get('/api/alpaca/positions', requireAuth, async (req, res) => {
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

// --- Alpaca proxy: Place Order --- (requires auth)
app.post('/api/alpaca/order', requireAuth, async (req, res) => {
  if (!ALPACA_API_KEY) {
    return res.json({ error: 'NOT_CONFIGURED', message: 'Alpaca API keys not set on server.' });
  }

  // Live trading is gated server-side by ALPACA_PAPER_MODE. The
  // X-Confirm-Live-Trade header is only a UX confirmation flag, not the gate.
  if (!ALPACA_PAPER_MODE) {
    if (req.headers['x-confirm-live-trade'] !== 'true') {
      return res.status(403).json({
        error: 'LIVE_TRADE_UNCONFIRMED',
        message: 'Live trade not confirmed. Set X-Confirm-Live-Trade: true to confirm intent.',
      });
    }
  }

  const orderBody = req.body;

  // Server-side guardrails (fails closed: missing/NaN/zero/negative rejected)
  const guard = checkOrderGuardrail(orderBody, MAX_ORDER_QTY, ['qty']);
  if (guard) {
    return res.status(400).json({ error: guard.code, message: guard.message });
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

// --- Alpaca proxy: Cancel Order --- (requires auth)
app.delete('/api/alpaca/order/:id', requireAuth, async (req, res) => {
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

// --- Alpaca proxy: List Orders --- (account data requires auth)
app.get('/api/alpaca/orders', requireAuth, async (req, res) => {
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

// NOTE: The arbitrary POST /api/alpaca/proxy passthrough was removed. It
// forwarded any method + endpoint + body to Alpaca with server credentials,
// bypassing every guardrail. Use the specific endpoints above instead.

// ============================================
// IBKR TRADING API PROXY
// ============================================

// Helper: forward requests to IB Gateway
async function ibkrFetch(method, path, body) {
  const url = IBKR_GATEWAY_URL + path;
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
    // IB Gateway uses self-signed certs locally
  };
  if (body) opts.body = JSON.stringify(body);

  // For Node 18+, handle self-signed cert on localhost
  if (url.startsWith('https://localhost')) {
    const agent = new (require('https').Agent)({ rejectUnauthorized: false });
    opts.agent = agent;
  }

  const response = await fetch(url, opts);
  const data = await response.json();
  if (!response.ok) {
    const err = new Error(data.error || 'IBKR request failed');
    err.status = response.status;
    err.data = data;
    throw err;
  }
  return data;
}

// --- IBKR: Auth status ---
app.get('/api/ibkr/auth/status', async (req, res) => {
  if (!IBKR_ACCOUNT_ID) {
    return res.json({ error: 'NOT_CONFIGURED', message: 'IBKR account ID not set on server.' });
  }
  try {
    const data = await ibkrFetch('GET', '/iserver/auth/status');
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: 'IBKR_AUTH', message: err.message });
  }
});

// --- IBKR: Keep session alive ---
app.post('/api/ibkr/tickle', async (req, res) => {
  try {
    const data = await ibkrFetch('POST', '/tickle');
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'IBKR_TICKLE', message: err.message });
  }
});

// --- IBKR: Accounts --- (account data requires auth)
app.get('/api/ibkr/accounts', requireAuth, async (req, res) => {
  if (!IBKR_ACCOUNT_ID) {
    return res.json({ error: 'NOT_CONFIGURED', message: 'IBKR account ID not set on server.' });
  }
  try {
    const data = await ibkrFetch('GET', '/iserver/accounts');
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'NETWORK', message: err.message });
  }
});

// --- IBKR: Account summary --- (account data requires auth)
app.get('/api/ibkr/account/summary', requireAuth, async (req, res) => {
  if (!IBKR_ACCOUNT_ID) {
    return res.json({ error: 'NOT_CONFIGURED', message: 'IBKR account ID not set on server.' });
  }
  try {
    const data = await ibkrFetch('GET', '/portfolio/' + IBKR_ACCOUNT_ID + '/summary');
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'NETWORK', message: err.message });
  }
});

// --- IBKR: Positions --- (account data requires auth)
app.get('/api/ibkr/positions', requireAuth, async (req, res) => {
  if (!IBKR_ACCOUNT_ID) {
    return res.json({ error: 'NOT_CONFIGURED', message: 'IBKR account ID not set on server.' });
  }
  const page = req.query.page || 0;
  try {
    const data = await ibkrFetch('GET', '/portfolio/' + IBKR_ACCOUNT_ID + '/positions/' + page);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'NETWORK', message: err.message });
  }
});

// --- IBKR: Place Order --- (requires auth)
app.post('/api/ibkr/order', requireAuth, async (req, res) => {
  if (!IBKR_ACCOUNT_ID) {
    return res.json({ error: 'NOT_CONFIGURED', message: 'IBKR account ID not set on server.' });
  }

  // Live trading is gated server-side by IBKR_LIVE_TRADING (default off).
  if (!IBKR_LIVE_TRADING) {
    return res.status(403).json({
      error: 'LIVE_TRADE_DISABLED',
      message: 'IBKR live trading is disabled on this server. Set IBKR_LIVE_TRADING=true to enable.',
    });
  }

  // The X-Confirm-Live-Trade header is a UX confirmation flag, not the gate.
  if (req.headers['x-confirm-live-trade'] !== 'true') {
    return res.status(403).json({
      error: 'LIVE_TRADE_UNCONFIRMED',
      message: 'Live trade not confirmed. Set X-Confirm-Live-Trade: true to confirm intent.',
    });
  }

  const orderBody = req.body;

  // Server-side guardrails (fails closed: missing/NaN/zero/negative rejected)
  const guard = checkOrderGuardrail(orderBody, IBKR_MAX_ORDER_QTY, ['quantity', 'qty']);
  if (guard) {
    return res.status(400).json({ error: guard.code, message: guard.message });
  }

  try {
    const data = await ibkrFetch('POST', '/iserver/account/' + IBKR_ACCOUNT_ID + '/orders', {
      orders: [orderBody],
    });
    res.json(data);
  } catch (err) {
    // Do not echo the raw provider payload (err.data); log it, return generic.
    respondUpstreamError(res, err.status, 'ORDER_FAILED', 'IBKR order failed', err.data || err.message);
  }
});

// --- IBKR: Confirm order reply --- (requires auth)
app.post('/api/ibkr/order/reply/:replyId', requireAuth, async (req, res) => {
  try {
    const data = await ibkrFetch('POST', '/iserver/reply/' + req.params.replyId, {
      confirmed: req.body.confirmed !== false,
    });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'CONFIRM_FAILED', message: err.message });
  }
});

// --- IBKR: Cancel Order --- (requires auth)
app.delete('/api/ibkr/order/:id', requireAuth, async (req, res) => {
  if (!IBKR_ACCOUNT_ID) {
    return res.json({ error: 'NOT_CONFIGURED', message: 'IBKR account ID not set on server.' });
  }
  try {
    const data = await ibkrFetch('DELETE', '/iserver/account/' + IBKR_ACCOUNT_ID + '/order/' + req.params.id);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'NETWORK', message: err.message });
  }
});

// --- IBKR: List Orders --- (account data requires auth)
app.get('/api/ibkr/orders', requireAuth, async (req, res) => {
  if (!IBKR_ACCOUNT_ID) {
    return res.json({ error: 'NOT_CONFIGURED', message: 'IBKR account ID not set on server.' });
  }
  try {
    const data = await ibkrFetch('GET', '/iserver/account/orders');
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'NETWORK', message: err.message });
  }
});

// --- IBKR: Contract search (for international symbols) ---
app.get('/api/ibkr/search', async (req, res) => {
  const symbol = req.query.symbol;
  if (!symbol) return res.status(400).json({ error: 'Missing symbol parameter' });
  try {
    const data = await ibkrFetch('GET', '/iserver/secdef/search?symbol=' + encodeURIComponent(symbol));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'SEARCH_FAILED', message: err.message });
  }
});

// --- IBKR: Market data snapshot ---
app.get('/api/ibkr/snapshot', async (req, res) => {
  const conids = req.query.conids;
  if (!conids) return res.status(400).json({ error: 'Missing conids parameter' });
  try {
    const fields = '31,55,70,71,82,83,84,85,86,87,88';
    const data = await ibkrFetch('GET', '/iserver/marketdata/snapshot?conids=' + conids + '&fields=' + fields);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'SNAPSHOT_FAILED', message: err.message });
  }
});

// --- IBKR: Historical data ---
app.get('/api/ibkr/history', async (req, res) => {
  const { conid, period, bar } = req.query;
  if (!conid) return res.status(400).json({ error: 'Missing conid parameter' });
  try {
    const params = new URLSearchParams({ conid, period: period || '1d', bar: bar || '1d' });
    const data = await ibkrFetch('GET', '/iserver/marketdata/history?' + params.toString());
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'HISTORY_FAILED', message: err.message });
  }
});

// --- IBKR: Options chain ---
app.get('/api/ibkr/options/strikes', async (req, res) => {
  const { conid, month, exchange } = req.query;
  if (!conid) return res.status(400).json({ error: 'Missing conid parameter' });
  try {
    const params = new URLSearchParams({ conid });
    if (month) params.append('month', month);
    if (exchange) params.append('exchange', exchange);
    const data = await ibkrFetch('GET', '/iserver/secdef/strikes?' + params.toString());
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'OPTIONS_FAILED', message: err.message });
  }
});

// --- IBKR: FX rates ---
app.get('/api/ibkr/fx', async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'Missing from/to parameters' });
  try {
    const pair = from + '.' + to;
    const search = await ibkrFetch('GET', '/iserver/secdef/search?symbol=' + encodeURIComponent(pair));
    if (!search || !search.length) {
      return res.status(404).json({ error: 'FX pair not found: ' + pair });
    }
    const conid = search[0].conid || search[0].conId;
    const fields = '31,55,84,85,86';
    const data = await ibkrFetch('GET', '/iserver/marketdata/snapshot?conids=' + conid + '&fields=' + fields);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'FX_FAILED', message: err.message });
  }
});

// NOTE: The arbitrary POST /api/ibkr/proxy passthrough was removed. It
// forwarded any method + endpoint + body to the IB Gateway, bypassing every
// guardrail. Use the specific endpoints above instead.

// ============================================
// QUESTRADE TRADING API PROXY
// ============================================

// Helper: exchange refresh token for access token
async function questradeRefresh() {
  if (!questradeRefreshToken) {
    throw new Error('No Questrade refresh token configured');
  }
  const resp = await fetch('https://login.questrade.com/oauth2/token?grant_type=refresh_token&refresh_token=' + encodeURIComponent(questradeRefreshToken), {
    method: 'GET',
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error('Questrade auth failed: ' + text);
  }
  const data = await resp.json();
  questradeAccessToken = data.access_token;
  questradeRefreshToken = data.refresh_token; // Questrade issues a new refresh token each time
  questradeApiServer = data.api_server; // e.g., https://api01.iq.questrade.com/
  console.log('[Questrade] Authenticated. API server: ' + questradeApiServer);
  return data;
}

// Helper: forward requests to Questrade API
async function questradeFetch(method, path, body) {
  if (!questradeAccessToken || !questradeApiServer) {
    // Try to authenticate first
    await questradeRefresh();
  }

  var url = questradeApiServer + path;
  var opts = {
    method: method,
    headers: {
      'Authorization': 'Bearer ' + questradeAccessToken,
      'Content-Type': 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);

  var response = await fetch(url, opts);

  // If 401, try refreshing token once
  if (response.status === 401) {
    await questradeRefresh();
    opts.headers['Authorization'] = 'Bearer ' + questradeAccessToken;
    url = questradeApiServer + path;
    response = await fetch(url, opts);
  }

  var data = await response.json();
  if (!response.ok) {
    var err = new Error(data.message || 'Questrade request failed');
    err.status = response.status;
    err.data = data;
    throw err;
  }
  return data;
}

// Auto-authenticate on startup if refresh token is configured
if (questradeRefreshToken) {
  questradeRefresh().catch(function (err) {
    console.warn('[Questrade] Auto-auth failed:', err.message);
  });
}

// --- Questrade: Auth status ---
app.get('/api/questrade/auth/status', (req, res) => {
  res.json({
    configured: !!questradeRefreshToken,
    authenticated: !!questradeAccessToken,
    accountId: QUESTRADE_ACCOUNT_ID || null,
    apiServer: questradeApiServer || null,
  });
});

// --- Questrade: Refresh auth ---
app.post('/api/questrade/auth/refresh', async (req, res) => {
  if (!questradeRefreshToken) {
    return res.status(400).json({ error: 'No refresh token configured' });
  }
  try {
    var data = await questradeRefresh();
    res.json({ success: true, api_server: data.api_server });
  } catch (err) {
    res.status(401).json({ error: 'AUTH_FAILED', message: err.message });
  }
});

// --- Questrade: Accounts --- (account data requires auth)
app.get('/api/questrade/accounts', requireAuth, async (req, res) => {
  if (!QUESTRADE_ACCOUNT_ID) {
    return res.json({ error: 'NOT_CONFIGURED', message: 'Questrade account ID not set.' });
  }
  try {
    var data = await questradeFetch('GET', '/v1/accounts');
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: 'NETWORK', message: err.message });
  }
});

// --- Questrade: Account balances --- (account data requires auth)
app.get('/api/questrade/account/balances', requireAuth, async (req, res) => {
  if (!QUESTRADE_ACCOUNT_ID) {
    return res.json({ error: 'NOT_CONFIGURED', message: 'Questrade account ID not set.' });
  }
  try {
    var data = await questradeFetch('GET', '/v1/accounts/' + QUESTRADE_ACCOUNT_ID + '/balances');
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: 'NETWORK', message: err.message });
  }
});

// --- Questrade: Positions --- (account data requires auth)
app.get('/api/questrade/positions', requireAuth, async (req, res) => {
  if (!QUESTRADE_ACCOUNT_ID) {
    return res.json({ error: 'NOT_CONFIGURED', message: 'Questrade account ID not set.' });
  }
  try {
    var data = await questradeFetch('GET', '/v1/accounts/' + QUESTRADE_ACCOUNT_ID + '/positions');
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: 'NETWORK', message: err.message });
  }
});

// --- Questrade: Place Order --- (requires auth)
app.post('/api/questrade/order', requireAuth, async (req, res) => {
  if (!QUESTRADE_ACCOUNT_ID) {
    return res.json({ error: 'NOT_CONFIGURED', message: 'Questrade account ID not set.' });
  }

  // Live trading is gated server-side by QUESTRADE_LIVE_TRADING (default off).
  if (!QUESTRADE_LIVE_TRADING) {
    return res.status(403).json({
      error: 'LIVE_TRADE_DISABLED',
      message: 'Questrade live trading is disabled on this server. Set QUESTRADE_LIVE_TRADING=true to enable.',
    });
  }

  // The X-Confirm-Live-Trade header is a UX confirmation flag, not the gate.
  if (req.headers['x-confirm-live-trade'] !== 'true') {
    return res.status(403).json({
      error: 'LIVE_TRADE_UNCONFIRMED',
      message: 'Live trade not confirmed. Set X-Confirm-Live-Trade: true to confirm intent.',
    });
  }

  var orderBody = req.body;

  // Server-side guardrails (fails closed: missing/NaN/zero/negative rejected)
  var guard = checkOrderGuardrail(orderBody, QUESTRADE_MAX_ORDER_QTY, ['quantity', 'qty']);
  if (guard) {
    return res.status(400).json({ error: guard.code, message: guard.message });
  }

  try {
    var data = await questradeFetch('POST', '/v1/accounts/' + QUESTRADE_ACCOUNT_ID + '/orders', orderBody);
    res.json(data);
  } catch (err) {
    // Do not echo the raw provider payload (err.data); log it, return generic.
    respondUpstreamError(res, err.status, 'ORDER_FAILED', 'Questrade order failed', err.data || err.message);
  }
});

// --- Questrade: Cancel Order --- (requires auth)
app.delete('/api/questrade/order/:id', requireAuth, async (req, res) => {
  if (!QUESTRADE_ACCOUNT_ID) {
    return res.json({ error: 'NOT_CONFIGURED', message: 'Questrade account ID not set.' });
  }
  try {
    var data = await questradeFetch('DELETE', '/v1/accounts/' + QUESTRADE_ACCOUNT_ID + '/orders/' + req.params.id);
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: 'NETWORK', message: err.message });
  }
});

// --- Questrade: List Orders --- (account data requires auth)
app.get('/api/questrade/orders', requireAuth, async (req, res) => {
  if (!QUESTRADE_ACCOUNT_ID) {
    return res.json({ error: 'NOT_CONFIGURED', message: 'Questrade account ID not set.' });
  }
  var stateFilter = req.query.state || 'All';
  try {
    var data = await questradeFetch('GET', '/v1/accounts/' + QUESTRADE_ACCOUNT_ID + '/orders?stateFilter=' + stateFilter);
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: 'NETWORK', message: err.message });
  }
});

// --- Questrade: Symbol search ---
app.get('/api/questrade/symbols/search', async (req, res) => {
  var prefix = req.query.prefix;
  if (!prefix) return res.status(400).json({ error: 'Missing prefix parameter' });
  try {
    var data = await questradeFetch('GET', '/v1/symbols/search?prefix=' + encodeURIComponent(prefix));
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: 'SEARCH_FAILED', message: err.message });
  }
});

// --- Questrade: Executions (trade history) --- (account data requires auth)
app.get('/api/questrade/executions', requireAuth, async (req, res) => {
  if (!QUESTRADE_ACCOUNT_ID) {
    return res.json({ error: 'NOT_CONFIGURED', message: 'Questrade account ID not set.' });
  }
  try {
    var qs = '';
    if (req.query.startTime) qs += '?startTime=' + encodeURIComponent(req.query.startTime);
    if (req.query.endTime) qs += (qs ? '&' : '?') + 'endTime=' + encodeURIComponent(req.query.endTime);
    var data = await questradeFetch('GET', '/v1/accounts/' + QUESTRADE_ACCOUNT_ID + '/executions' + qs);
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: 'NETWORK', message: err.message });
  }
});

// NOTE: The arbitrary POST /api/questrade/proxy passthrough was removed. It
// forwarded any method + endpoint + body to Questrade with server credentials,
// bypassing every guardrail. Use the specific endpoints above instead.

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
      message: test.message
      // keyPrefix intentionally omitted: never reveal any part of the key.
    });
  } catch (err) {
    res.json({ configured: true, connected: false, message: 'Connection test failed.' });
  }
});

// POST /api/bigdata/key - Save BigData API key (authenticated: server-global key)
app.post('/api/bigdata/key', authLimiter, requireAuth, (req, res) => {
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
    // Encrypt at rest with the server MASTER_KEY (AES-256-GCM). The client
    // sends the raw secret in these fields; the column stores real ciphertext.
    const { data, error } = await supabaseAdmin
      .from('api_credentials')
      .upsert({
        user_id: req.user.id,
        credential_type: credential_type,
        encrypted_key: encryptSecret(encrypted_key),
        encrypted_secret: encrypted_secret ? encryptSecret(encrypted_secret) : null,
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

// No news provider is configured. This endpoint used to return invented
// headlines attributed to real outlets (Reuters, Bloomberg, WSJ, CNBC), which
// is fabricated content. It now returns an empty, clearly-flagged result. To
// enable real news, wire a licensed provider here and populate `articles`.
app.get('/api/news', (req, res) => {
  res.json({
    news: [],
    articles: [],
    source: 'none',
    note: 'No news provider configured'
  });
});

// ============================================
// FUNDAMENTALS - Quote Summary Proxy
// ============================================

app.get('/api/fundamentals/:symbol', async function (req, res) {
  var symbol = req.params.symbol.toUpperCase();
  var cacheKey = 'fundamentals:' + symbol;
  var cached = getCached(cacheKey);
  if (cached) return res.json(cached);

  try {
    // Fetch v8 chart meta (always works, no auth) + v7 quote (crumb-based, has fundamentals)
    var chartPromise = yahooFetch('/v8/finance/chart/' + encodeURIComponent(symbol) + '?interval=1d&range=1y');
    var quotePromise = yahooV7Quote(symbol);

    var chartData = await chartPromise;
    var meta = (chartData.chart && chartData.chart.result && chartData.chart.result[0] && chartData.chart.result[0].meta) || {};

    var v7Map = await quotePromise;
    var q = v7Map[symbol] || {};

    var result = {
      longName: q.longName || q.shortName || meta.longName || meta.shortName || '',
      shortName: q.shortName || meta.shortName || '',
      exchange: q.fullExchangeName || q.exchange || meta.fullExchangeName || meta.exchangeName || '',
      exchangeSymbol: meta.exchangeName || q.exchange || '',
      quoteType: q.quoteType || 'EQUITY',
      marketCap: q.marketCap || null,
      fiftyTwoWeekHigh: q.fiftyTwoWeekHigh || meta.fiftyTwoWeekHigh || null,
      fiftyTwoWeekLow: q.fiftyTwoWeekLow || meta.fiftyTwoWeekLow || null,
      bid: q.bid || null,
      ask: q.ask || null,
      volume: q.regularMarketVolume || meta.regularMarketVolume || null,
      averageVolume: q.averageDailyVolume10Day || q.averageDailyVolume3Month || null,
      trailingPE: q.trailingPE || null,
      forwardPE: q.forwardPE || null,
      dividendYield: q.trailingAnnualDividendYield || q.dividendYield || null,
      eps: q.epsTrailingTwelveMonths || null,
      beta: q.beta || null,
      open: q.regularMarketOpen || meta.regularMarketPrice || null,
      previousClose: q.regularMarketPreviousClose || meta.chartPreviousClose || meta.previousClose || null
    };
    setCache(cacheKey, result);
    res.json(result);
  } catch (err) {
    console.error('[API] Fundamentals error for ' + symbol + ':', err.message);
    res.status(502).json({ error: 'Failed to fetch fundamentals' });
  }
});

// ============================================
// PAPER TRADING (SIMULATED EXECUTION)
// ============================================
// The safe default execution path: fake money against REAL Yahoo quotes.
// These routes deliberately require NO Supabase auth so guests and the
// self-hosted preview can paper trade. State is keyed by an optional
// X-Session-Id header (else a single shared default in-memory account) and
// lives only in this process. The general rate limiter (app.use('/api/', ...))
// already covers these paths. The paper broker never sees real broker
// credentials: it is constructed with only the Yahoo quote function.
//
// server.js owns the two real-world couplings the pure engine avoids: it
// injects the live quote function and stamps every order with the real time.
const paperBroker = createPaperBroker({
  quoteFn: aiFetchQuote,
  initialCash: parseFloat(process.env.PAPER_INITIAL_CASH || '100000'),
  baseCurrency: process.env.PAPER_BASE_CURRENCY || 'CAD',
  feeBrokerId: process.env.PAPER_FEE_BROKER || 'wealthsimple',
  // Interim per-order notional cap. The canonical hard risk layer is
  // services/risk-guardrails.js; a later wave should route paper AND live
  // orders through it and retire the inline checks in paper-broker.js.
  maxOrderNotional: parseFloat(process.env.PAPER_MAX_ORDER_NOTIONAL || '500000'),
});

function paperSessionId(req) {
  const id = req.headers['x-session-id'];
  return (id && String(id).trim()) ? String(id).trim() : null;
}

// POST /api/paper/order
// body { symbol, side:'buy'|'sell', qty, type:'market'|'limit', limitPrice? }
// -> { orderId, status:'filled'|'working'|'rejected', fillPrice, cost, message, account }
app.post('/api/paper/order', async function (req, res) {
  const body = req.body || {};
  try {
    const result = await paperBroker.placeOrder(
      { symbol: body.symbol, side: body.side, qty: body.qty, type: body.type, limitPrice: body.limitPrice },
      { sessionId: paperSessionId(req), timestamp: Date.now() }
    );
    // Rejections (bad input, unknown symbol, insufficient funds, halt, cap)
    // come back as a clean 400 carrying the same response shape.
    if (result.status === 'rejected') return res.status(400).json(result);
    res.json(result);
  } catch (err) {
    console.error('[Paper] order error:', err && err.stack ? err.stack : err);
    res.status(500).json({ error: 'PAPER_ERROR', message: 'Paper order failed.' });
  }
});

// GET /api/paper/account -> { cash, equity, buyingPower, currency, positions:[...] }
app.get('/api/paper/account', async function (req, res) {
  try {
    const account = await paperBroker.getAccount(paperSessionId(req));
    res.json(account);
  } catch (err) {
    console.error('[Paper] account error:', err && err.stack ? err.stack : err);
    res.status(500).json({ error: 'PAPER_ERROR', message: 'Could not load paper account.' });
  }
});

// GET /api/paper/orders -> { orders:[...] }
app.get('/api/paper/orders', function (req, res) {
  try {
    res.json(paperBroker.getOrders(paperSessionId(req)));
  } catch (err) {
    console.error('[Paper] orders error:', err && err.stack ? err.stack : err);
    res.status(500).json({ error: 'PAPER_ERROR', message: 'Could not load paper orders.' });
  }
});

// POST /api/paper/reset  body { initialCash? } -> { ok:true, account }
app.post('/api/paper/reset', async function (req, res) {
  const body = req.body || {};
  try {
    const result = await paperBroker.reset(paperSessionId(req), { initialCash: body.initialCash });
    res.json(result);
  } catch (err) {
    console.error('[Paper] reset error:', err && err.stack ? err.stack : err);
    res.status(500).json({ error: 'PAPER_ERROR', message: 'Could not reset paper account.' });
  }
});

// ============================================
// STATIC FILES & SERVER START
// ============================================

app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ============================================
// GLOBAL ERROR HANDLING
// ============================================

// Express error-handling middleware (must be last, 4-arg signature). Logs the
// full error server-side and returns a generic message. Never leaks stack
// traces or internals to the client.
app.use(function (err, req, res, next) {
  console.error('[Server] Unhandled route error:', err && err.stack ? err.stack : err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'INTERNAL', message: 'An unexpected error occurred.' });
});

// Keep the process alive on unexpected async failures; log for diagnosis.
process.on('unhandledRejection', function (reason) {
  console.error('[Server] Unhandled promise rejection:', reason);
});
process.on('uncaughtException', function (err) {
  console.error('[Server] Uncaught exception:', err && err.stack ? err.stack : err);
});

app.listen(PORT, function () {
  console.log('');
  console.log('  GREYSTONE TRADING PLATFORM');
  console.log('  Server running at http://localhost:' + PORT);
  console.log('');
  console.log('  Market Data:');
  console.log('    GET /api/search?q=AAPL');
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
  console.log('  Alpaca Trading (US equities + options):');
  console.log('    Mode: ' + (ALPACA_PAPER_MODE ? 'PAPER' : 'LIVE'));
  console.log('    Configured: ' + (ALPACA_API_KEY ? 'Yes' : 'No (simulation only)'));
  console.log('    GET  /api/alpaca/account');
  console.log('    GET  /api/alpaca/positions');
  console.log('    POST /api/alpaca/order');
  console.log('    GET  /api/alpaca/orders');
  console.log('');
  console.log('  Questrade Trading (Canadian equities):');
  console.log('    Configured: ' + (QUESTRADE_ACCOUNT_ID ? 'Yes (Account: ' + QUESTRADE_ACCOUNT_ID + ')' : 'No'));
  console.log('    Authenticated: ' + (questradeAccessToken ? 'Yes' : 'No'));
  console.log('    GET  /api/questrade/auth/status');
  console.log('    POST /api/questrade/auth/refresh');
  console.log('    GET  /api/questrade/positions');
  console.log('    POST /api/questrade/order');
  console.log('    GET  /api/questrade/orders');
  console.log('    GET  /api/questrade/symbols/search?prefix=RY');
  console.log('');
  console.log('  IBKR Trading (international + futures + forex):');
  console.log('    Configured: ' + (IBKR_ACCOUNT_ID ? 'Yes (Account: ' + IBKR_ACCOUNT_ID + ')' : 'No'));
  console.log('    Gateway: ' + IBKR_GATEWAY_URL);
  console.log('    GET  /api/ibkr/accounts');
  console.log('    GET  /api/ibkr/positions');
  console.log('    POST /api/ibkr/order');
  console.log('    GET  /api/ibkr/orders');
  console.log('    GET  /api/ibkr/search?symbol=RY');
  console.log('    GET  /api/ibkr/snapshot?conids=...');
  console.log('    GET  /api/ibkr/options/strikes?conid=...');
  console.log('    GET  /api/ibkr/fx?from=CAD&to=USD');
  console.log('');
  console.log('  Broker Router:');
  console.log('    GET  /api/broker/status');
  console.log('    GET  /api/health');
  console.log('');
  console.log('  Paper Trading (simulated, fake money, no auth):');
  console.log('    POST /api/paper/order');
  console.log('    GET  /api/paper/account');
  console.log('    GET  /api/paper/orders');
  console.log('    POST /api/paper/reset');
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
