/* ============================================
   INTERACTIVE BROKERS API CLIENT
   Web API (REST) for international markets,
   options data feeds, and advanced order types.
   Runs parallel to Alpaca for dual-broker setup.
   ============================================ */

const IBKRClient = (function () {
  // IBKR Web API base URLs
  const GATEWAY_BASE = 'https://localhost:5000/v1/api'; // IB Gateway (local)
  const PORTAL_BASE = 'https://localhost:5000/v1/api';  // Client Portal

  // --- Config ---
  function getConfig() {
    // Server-side: read from env. Client-side: read from localStorage.
    if (typeof process !== 'undefined' && process.env) {
      return {
        gatewayUrl: process.env.IBKR_GATEWAY_URL || GATEWAY_BASE,
        accountId: process.env.IBKR_ACCOUNT_ID || '',
        configured: !!(process.env.IBKR_ACCOUNT_ID),
      };
    }
    return {
      gatewayUrl: localStorage.getItem('ibkr_gateway_url') || GATEWAY_BASE,
      accountId: localStorage.getItem('ibkr_account_id') || '',
      configured: !!(localStorage.getItem('ibkr_account_id')),
    };
  }

  function isConfigured() {
    return getConfig().configured;
  }

  // --- Core request helper ---
  async function request(method, path, body) {
    if (!isConfigured()) {
      return { error: 'NOT_CONFIGURED', message: 'IBKR account not configured. Set account ID in Settings.' };
    }
    const cfg = getConfig();
    const url = cfg.gatewayUrl + path;
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (body) opts.body = JSON.stringify(body);

    try {
      const resp = await fetch(url, opts);
      if (resp.status === 401) {
        return { error: 'AUTH_REQUIRED', message: 'IBKR session expired. Re-authenticate via IB Gateway.' };
      }
      const data = await resp.json();
      if (!resp.ok) {
        return { error: resp.status, message: data.error || JSON.stringify(data) };
      }
      return data;
    } catch (err) {
      return { error: 'NETWORK', message: err.message };
    }
  }

  // --- Server proxy (routes through Express backend) ---
  async function proxyRequest(method, endpoint, body) {
    try {
      if (method === 'GET') {
        const resp = await fetch('/api/ibkr' + endpoint);
        return await resp.json();
      }
      const resp = await fetch('/api/ibkr/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, endpoint, body }),
      });
      return await resp.json();
    } catch {
      return null; // Proxy not available, fall back to direct
    }
  }

  // ============================================
  // AUTHENTICATION / SESSION
  // ============================================

  async function getAuthStatus() {
    const proxy = await proxyRequest('GET', '/auth/status');
    if (proxy && !proxy.error) return proxy;
    return request('GET', '/iserver/auth/status');
  }

  async function keepAlive() {
    return request('POST', '/tickle');
  }

  async function reauthenticate() {
    return request('POST', '/iserver/reauthenticate');
  }

  // ============================================
  // ACCOUNT
  // ============================================

  async function getAccounts() {
    const proxy = await proxyRequest('GET', '/accounts');
    if (proxy && !proxy.error) return proxy;
    return request('GET', '/iserver/accounts');
  }

  async function getAccountSummary() {
    const cfg = getConfig();
    const proxy = await proxyRequest('GET', '/account/summary');
    if (proxy && !proxy.error) return proxy;
    return request('GET', '/portfolio/' + cfg.accountId + '/summary');
  }

  async function getAccountLedger() {
    const cfg = getConfig();
    return request('GET', '/portfolio/' + cfg.accountId + '/ledger');
  }

  // ============================================
  // POSITIONS
  // ============================================

  async function getPositions(pageId) {
    const cfg = getConfig();
    const page = pageId || 0;
    const proxy = await proxyRequest('GET', '/positions?page=' + page);
    if (proxy && !proxy.error) return proxy;
    return request('GET', '/portfolio/' + cfg.accountId + '/positions/' + page);
  }

  async function getPositionByConId(conId) {
    const cfg = getConfig();
    return request('GET', '/portfolio/' + cfg.accountId + '/position/' + conId);
  }

  // ============================================
  // ORDERS
  // ============================================

  async function placeOrder(params) {
    const cfg = getConfig();
    // IBKR order format
    const orderBody = {
      acctId: cfg.accountId,
      conid: params.conid,             // IBKR contract ID
      secType: params.secType || 'STK', // STK, OPT, FUT, CASH
      orderType: params.type || 'MKT',  // MKT, LMT, STP, STP_LMT
      side: params.side.toUpperCase(),   // BUY, SELL
      quantity: params.qty,
      tif: params.time_in_force || 'DAY',
      outsideRTH: params.outsideRTH || false,
      listingExchange: params.exchange || 'SMART',
    };
    if (params.limit_price) orderBody.price = params.limit_price;
    if (params.stop_price) orderBody.auxPrice = params.stop_price;

    // Try proxy first
    try {
      const resp = await fetch('/api/ibkr/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderBody),
      });
      const data = await resp.json();
      if (!data.error) return data;
    } catch { /* proxy not available */ }

    return request('POST', '/iserver/account/' + cfg.accountId + '/orders', {
      orders: [orderBody],
    });
  }

  async function confirmOrder(replyId, confirmed) {
    // IBKR requires order confirmation for certain order types
    return request('POST', '/iserver/reply/' + replyId, {
      confirmed: confirmed,
    });
  }

  async function cancelOrder(orderId) {
    const cfg = getConfig();
    return request('DELETE', '/iserver/account/' + cfg.accountId + '/order/' + orderId);
  }

  async function getOrders(filters) {
    return request('GET', '/iserver/account/orders');
  }

  async function getOrderStatus(orderId) {
    return request('GET', '/iserver/account/order/status/' + orderId);
  }

  // ============================================
  // MARKET DATA
  // ============================================

  async function searchContract(symbol, secType, exchange) {
    // Search for contract by symbol - returns conid needed for trading
    const params = new URLSearchParams({ symbol });
    if (secType) params.append('secType', secType);
    return request('GET', '/iserver/secdef/search?' + params.toString());
  }

  async function getContractInfo(conId) {
    return request('GET', '/iserver/contract/' + conId + '/info');
  }

  async function getSnapshot(conIds) {
    // conIds: array of contract IDs
    const ids = Array.isArray(conIds) ? conIds.join(',') : conIds;
    return request('GET', '/iserver/marketdata/snapshot?conids=' + ids +
      '&fields=31,55,70,71,82,83,84,85,86,87,88');
    // Fields: last, symbol, high, low, bid, ask, volume, open, close, change, change%
  }

  async function getHistoricalData(conId, period, bar) {
    // period: e.g. '1d', '1w', '1m', '1y'
    // bar: e.g. '1min', '5min', '1h', '1d'
    const params = new URLSearchParams({
      conid: conId,
      period: period || '1d',
      bar: bar || '1d',
    });
    return request('GET', '/iserver/marketdata/history?' + params.toString());
  }

  async function unsubscribeMarketData(conId) {
    return request('GET', '/iserver/marketdata/' + conId + '/unsubscribe');
  }

  // ============================================
  // OPTIONS CHAIN
  // ============================================

  async function getOptionsChain(conId, month, exchange) {
    const params = new URLSearchParams({ conid: conId });
    if (month) params.append('month', month);
    if (exchange) params.append('exchange', exchange);
    return request('GET', '/iserver/secdef/strikes?' + params.toString());
  }

  async function getOptionsInfo(conId, month, right, strike) {
    // right: 'C' (call) or 'P' (put)
    return request('GET', '/iserver/secdef/info?conid=' + conId +
      '&sectype=OPT&month=' + month +
      '&right=' + right + '&strike=' + strike);
  }

  // ============================================
  // INTERNATIONAL MARKET SUPPORT
  // ============================================

  // Exchange identifiers for common international markets
  const EXCHANGES = {
    // North America
    'NYSE': { name: 'New York Stock Exchange', currency: 'USD' },
    'NASDAQ': { name: 'NASDAQ', currency: 'USD' },
    'TSE': { name: 'Toronto Stock Exchange', currency: 'CAD' },
    'VENTURE': { name: 'TSX Venture', currency: 'CAD' },
    // Europe
    'LSE': { name: 'London Stock Exchange', currency: 'GBP' },
    'FWB': { name: 'Frankfurt (Xetra)', currency: 'EUR' },
    'SBF': { name: 'Euronext Paris', currency: 'EUR' },
    'AEB': { name: 'Euronext Amsterdam', currency: 'EUR' },
    'SWX': { name: 'Swiss Exchange', currency: 'CHF' },
    // Asia-Pacific
    'TSEJ': { name: 'Tokyo Stock Exchange', currency: 'JPY' },
    'SEHK': { name: 'Hong Kong Stock Exchange', currency: 'HKD' },
    'ASX': { name: 'Australian Stock Exchange', currency: 'AUD' },
    'SGX': { name: 'Singapore Exchange', currency: 'SGD' },
  };

  function getExchangeInfo(exchangeCode) {
    return EXCHANGES[exchangeCode] || null;
  }

  function getSupportedExchanges() {
    return Object.keys(EXCHANGES).map(function (code) {
      return { code: code, name: EXCHANGES[code].name, currency: EXCHANGES[code].currency };
    });
  }

  // Search for international securities
  async function searchInternational(symbol, exchange) {
    const results = await searchContract(symbol);
    if (results.error) return results;

    // Filter by exchange if specified
    if (exchange && Array.isArray(results)) {
      return results.filter(function (r) {
        return r.exchange === exchange || (r.sections && r.sections.some(function (s) {
          return s.exchange === exchange;
        }));
      });
    }
    return results;
  }

  // ============================================
  // FOREX (for currency conversion)
  // ============================================

  async function getFxRate(from, to) {
    const pair = from + '.' + to;
    const results = await searchContract(pair, 'CASH');
    if (results.error || !results.length) {
      return { error: 'FX_NOT_FOUND', message: 'Currency pair ' + pair + ' not found' };
    }
    const conId = results[0].conid || results[0].conId;
    return getSnapshot(conId);
  }

  // ============================================
  // SCANNER (market scanners for discovery)
  // ============================================

  async function getScannerParams() {
    return request('GET', '/iserver/scanner/params');
  }

  async function runScanner(scanParams) {
    return request('POST', '/iserver/scanner/run', scanParams);
  }

  // ============================================
  // PUBLIC API
  // ============================================

  return {
    // Config
    getConfig,
    isConfigured,
    // Auth
    getAuthStatus,
    keepAlive,
    reauthenticate,
    // Account
    getAccounts,
    getAccountSummary,
    getAccountLedger,
    // Positions
    getPositions,
    getPositionByConId,
    // Orders
    placeOrder,
    confirmOrder,
    cancelOrder,
    getOrders,
    getOrderStatus,
    // Market Data
    searchContract,
    getContractInfo,
    getSnapshot,
    getHistoricalData,
    unsubscribeMarketData,
    // Options
    getOptionsChain,
    getOptionsInfo,
    // International
    getExchangeInfo,
    getSupportedExchanges,
    searchInternational,
    // Forex
    getFxRate,
    // Scanner
    getScannerParams,
    runScanner,
  };
})();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = IBKRClient;
}
