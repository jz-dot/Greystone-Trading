/* ============================================
   GREYSTONE TRADING PLATFORM - BigData.com Client
   Server-side service for institutional-grade
   financial data from BigData.com REST API
   ============================================ */

const https = require('https');

// --- Cache with configurable TTL ---
const bdCache = new Map();
const CACHE_TTL_REALTIME = 30000;   // 30 seconds for real-time data
const CACHE_TTL_EXTENDED = 300000;  // 5 minutes for sentiment, insider, institutional

function getCachedBD(key) {
  const entry = bdCache.get(key);
  if (entry && Date.now() - entry.timestamp < entry.ttl) {
    return entry.data;
  }
  bdCache.delete(key);
  return null;
}

function setCacheBD(key, data, ttl) {
  bdCache.set(key, { data, timestamp: Date.now(), ttl: ttl || CACHE_TTL_REALTIME });
}

// --- BigData.com API request helper ---
function bigdataFetch(apiKey, endpoint, params) {
  return new Promise(function (resolve, reject) {
    let path = '/v1' + endpoint;
    if (params && Object.keys(params).length > 0) {
      const qs = Object.entries(params)
        .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v))
        .join('&');
      path += '?' + qs;
    }

    const options = {
      hostname: 'api.bigdata.com',
      port: 443,
      path: path,
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Accept': 'application/json',
        'User-Agent': 'GreystoneTradingPlatform/1.0'
      }
    };

    const req = https.request(options, function (res) {
      let body = '';
      res.on('data', function (chunk) { body += chunk; });
      res.on('end', function () {
        if (res.statusCode === 401) {
          reject(new Error('BIGDATA_AUTH_FAILED'));
          return;
        }
        if (res.statusCode === 429) {
          reject(new Error('BIGDATA_RATE_LIMIT'));
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error('BigData API returned ' + res.statusCode + ': ' + body.slice(0, 200)));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error('Failed to parse BigData response'));
        }
      });
    });

    req.on('error', function (err) {
      reject(new Error('BigData connection error: ' + err.message));
    });

    req.setTimeout(10000, function () {
      req.destroy();
      reject(new Error('BigData request timeout'));
    });

    req.end();
  });
}

// --- Service methods ---

function createBigDataService(getApiKey) {

  function isConfigured() {
    const key = getApiKey();
    return !!key && key.length > 10;
  }

  // Real-time quote with extended data
  async function getQuote(ticker) {
    const key = getApiKey();
    if (!key) return null;

    const cacheKey = 'bd:quote:' + ticker;
    const cached = getCachedBD(cacheKey);
    if (cached) return cached;

    try {
      const data = await bigdataFetch(key, '/stocks/' + encodeURIComponent(ticker) + '/quote');
      setCacheBD(cacheKey, data, CACHE_TTL_REALTIME);
      return data;
    } catch (err) {
      console.error('[BigData] Quote error for ' + ticker + ':', err.message);
      return null;
    }
  }

  // Institutional options flow
  async function getOptionsFlow(ticker) {
    const key = getApiKey();
    if (!key) return null;

    const cacheKey = 'bd:flow:' + ticker;
    const cached = getCachedBD(cacheKey);
    if (cached) return cached;

    try {
      const data = await bigdataFetch(key, '/stocks/' + encodeURIComponent(ticker) + '/options/flow');
      setCacheBD(cacheKey, data, CACHE_TTL_REALTIME);
      return data;
    } catch (err) {
      console.error('[BigData] Options flow error for ' + ticker + ':', err.message);
      return null;
    }
  }

  // Dark pool prints
  async function getDarkPool(ticker) {
    const key = getApiKey();
    if (!key) return null;

    const cacheKey = 'bd:darkpool:' + ticker;
    const cached = getCachedBD(cacheKey);
    if (cached) return cached;

    try {
      const data = await bigdataFetch(key, '/stocks/' + encodeURIComponent(ticker) + '/darkpool');
      setCacheBD(cacheKey, data, CACHE_TTL_REALTIME);
      return data;
    } catch (err) {
      console.error('[BigData] Dark pool error for ' + ticker + ':', err.message);
      return null;
    }
  }

  // Insider trading data
  async function getInsider(ticker) {
    const key = getApiKey();
    if (!key) return null;

    const cacheKey = 'bd:insider:' + ticker;
    const cached = getCachedBD(cacheKey);
    if (cached) return cached;

    try {
      const data = await bigdataFetch(key, '/stocks/' + encodeURIComponent(ticker) + '/insider');
      setCacheBD(cacheKey, data, CACHE_TTL_EXTENDED);
      return data;
    } catch (err) {
      console.error('[BigData] Insider error for ' + ticker + ':', err.message);
      return null;
    }
  }

  // Social/news sentiment scores
  async function getSentiment(ticker) {
    const key = getApiKey();
    if (!key) return null;

    const cacheKey = 'bd:sentiment:' + ticker;
    const cached = getCachedBD(cacheKey);
    if (cached) return cached;

    try {
      const data = await bigdataFetch(key, '/stocks/' + encodeURIComponent(ticker) + '/sentiment');
      setCacheBD(cacheKey, data, CACHE_TTL_EXTENDED);
      return data;
    } catch (err) {
      console.error('[BigData] Sentiment error for ' + ticker + ':', err.message);
      return null;
    }
  }

  // Institutional ownership changes
  async function getInstitutional(ticker) {
    const key = getApiKey();
    if (!key) return null;

    const cacheKey = 'bd:institutional:' + ticker;
    const cached = getCachedBD(cacheKey);
    if (cached) return cached;

    try {
      const data = await bigdataFetch(key, '/stocks/' + encodeURIComponent(ticker) + '/institutional');
      setCacheBD(cacheKey, data, CACHE_TTL_EXTENDED);
      return data;
    } catch (err) {
      console.error('[BigData] Institutional error for ' + ticker + ':', err.message);
      return null;
    }
  }

  // Market movers - top gainers/losers/volume leaders
  async function getMarketMovers() {
    const key = getApiKey();
    if (!key) return null;

    const cacheKey = 'bd:movers';
    const cached = getCachedBD(cacheKey);
    if (cached) return cached;

    try {
      const data = await bigdataFetch(key, '/market/movers');
      setCacheBD(cacheKey, data, CACHE_TTL_REALTIME);
      return data;
    } catch (err) {
      console.error('[BigData] Movers error:', err.message);
      return null;
    }
  }

  // Sector performance
  async function getSectorPerformance(period) {
    const key = getApiKey();
    if (!key) return null;

    const cacheKey = 'bd:sectors:' + (period || '1D');
    const cached = getCachedBD(cacheKey);
    if (cached) return cached;

    const params = period ? { period: period } : {};
    try {
      const data = await bigdataFetch(key, '/market/sectors', params);
      setCacheBD(cacheKey, data, CACHE_TTL_REALTIME);
      return data;
    } catch (err) {
      console.error('[BigData] Sectors error:', err.message);
      return null;
    }
  }

  // Key financials for Grey Sankore analysis
  async function getFinancials(ticker) {
    const key = getApiKey();
    if (!key) return null;

    const cacheKey = 'bd:financials:' + ticker;
    const cached = getCachedBD(cacheKey);
    if (cached) return cached;

    try {
      const data = await bigdataFetch(key, '/stocks/' + encodeURIComponent(ticker) + '/financials');
      setCacheBD(cacheKey, data, CACHE_TTL_EXTENDED);
      return data;
    } catch (err) {
      console.error('[BigData] Financials error for ' + ticker + ':', err.message);
      return null;
    }
  }

  // Test API connection
  async function testConnection() {
    const key = getApiKey();
    if (!key) return { success: false, message: 'No API key configured' };

    try {
      await bigdataFetch(key, '/market/movers');
      return { success: true, message: 'Connected to BigData.com API' };
    } catch (err) {
      if (err.message === 'BIGDATA_AUTH_FAILED') {
        return { success: false, message: 'Invalid API key' };
      }
      if (err.message === 'BIGDATA_RATE_LIMIT') {
        return { success: false, message: 'Rate limit exceeded - key is valid but throttled' };
      }
      return { success: false, message: err.message };
    }
  }

  return {
    isConfigured,
    getQuote,
    getOptionsFlow,
    getDarkPool,
    getInsider,
    getSentiment,
    getInstitutional,
    getMarketMovers,
    getSectorPerformance,
    getFinancials,
    testConnection
  };
}

module.exports = { createBigDataService };
