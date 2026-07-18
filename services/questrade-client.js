/* ============================================
   QUESTRADE API CLIENT
   OAuth2-based REST API for Canadian equities.
   Handles TSX and TSXV execution.
   Data feeds come from IBKR - this client
   is for trade execution and account data only.
   ============================================ */

const QuestradeClient = (function () {

  // Questrade API uses a practice and live server
  // The actual base URL is returned during OAuth token exchange
  const AUTH_URL = 'https://login.questrade.com/oauth2/token';

  // --- Config ---
  function getConfig() {
    if (typeof process !== 'undefined' && process.env) {
      return {
        refreshToken: process.env.QUESTRADE_REFRESH_TOKEN || '',
        accessToken: process.env._QUESTRADE_ACCESS_TOKEN || '',
        apiServer: process.env._QUESTRADE_API_SERVER || '',
        accountId: process.env.QUESTRADE_ACCOUNT_ID || '',
        configured: !!(process.env.QUESTRADE_REFRESH_TOKEN && process.env.QUESTRADE_ACCOUNT_ID),
      };
    }
    return {
      refreshToken: localStorage.getItem('questrade_refresh_token') || '',
      accessToken: localStorage.getItem('questrade_access_token') || '',
      apiServer: localStorage.getItem('questrade_api_server') || '',
      accountId: localStorage.getItem('questrade_account_id') || '',
      configured: !!(localStorage.getItem('questrade_refresh_token') && localStorage.getItem('questrade_account_id')),
    };
  }

  function isConfigured() {
    return getConfig().configured;
  }

  // --- Core request helper ---
  async function request(method, path, body) {
    if (!isConfigured()) {
      return { error: 'NOT_CONFIGURED', message: 'Questrade not configured. Set refresh token and account ID in Settings.' };
    }
    var cfg = getConfig();
    if (!cfg.accessToken || !cfg.apiServer) {
      return { error: 'AUTH_REQUIRED', message: 'Questrade access token expired. Re-authenticate.' };
    }

    var url = cfg.apiServer + path;
    var opts = {
      method: method,
      headers: {
        'Authorization': 'Bearer ' + cfg.accessToken,
        'Content-Type': 'application/json',
      },
    };
    if (body) opts.body = JSON.stringify(body);

    try {
      var resp = await fetch(url, opts);
      if (resp.status === 401) {
        return { error: 'AUTH_EXPIRED', message: 'Questrade token expired. Refresh required.' };
      }
      var data = await resp.json();
      if (!resp.ok) {
        return { error: resp.status, message: data.message || JSON.stringify(data) };
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
        var resp = await fetch('/api/questrade' + endpoint);
        return await resp.json();
      }
      var resp = await fetch('/api/questrade/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: method, endpoint: endpoint, body: body }),
      });
      return await resp.json();
    } catch (e) {
      return null; // Proxy not available
    }
  }

  // ============================================
  // AUTHENTICATION (OAuth2)
  // ============================================

  // Exchange refresh token for access token + new refresh token
  // This is handled server-side since it requires the token endpoint
  async function refreshAuth() {
    try {
      var resp = await fetch('/api/questrade/auth/refresh', { method: 'POST' });
      var data = await resp.json();
      if (data.error) return data;
      // Server stores the new tokens
      return { success: true, apiServer: data.api_server };
    } catch (err) {
      return { error: 'AUTH_REFRESH_FAILED', message: err.message };
    }
  }

  async function getAuthStatus() {
    var proxy = await proxyRequest('GET', '/auth/status');
    if (proxy) return proxy;
    return { error: 'PROXY_UNAVAILABLE' };
  }

  // ============================================
  // ACCOUNT
  // ============================================

  async function getAccounts() {
    var proxy = await proxyRequest('GET', '/accounts');
    if (proxy && !proxy.error) return proxy;
    return request('GET', '/v1/accounts');
  }

  async function getAccountBalances() {
    var cfg = getConfig();
    var proxy = await proxyRequest('GET', '/account/balances');
    if (proxy && !proxy.error) return proxy;
    return request('GET', '/v1/accounts/' + cfg.accountId + '/balances');
  }

  // ============================================
  // POSITIONS
  // ============================================

  async function getPositions() {
    var cfg = getConfig();
    var proxy = await proxyRequest('GET', '/positions');
    if (proxy && !proxy.error) return proxy;
    return request('GET', '/v1/accounts/' + cfg.accountId + '/positions');
  }

  // ============================================
  // ORDERS
  // ============================================

  async function placeOrder(params) {
    var cfg = getConfig();

    // Questrade order format
    var orderBody = {
      accountNumber: cfg.accountId,
      symbolId: params.symbolId,
      quantity: params.qty,
      orderType: mapOrderType(params.type),
      timeInForce: mapTimeInForce(params.time_in_force),
      action: params.side.toUpperCase() === 'BUY' ? 'Buy' : 'Sell',
      primaryRoute: 'AUTO',
      secondaryRoute: 'AUTO',
    };

    if (params.limit_price) orderBody.limitPrice = params.limit_price;
    if (params.stop_price) orderBody.stopPrice = params.stop_price;

    // Try proxy first
    try {
      var resp = await fetch('/api/questrade/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderBody),
      });
      var data = await resp.json();
      if (!data.error) return data;
    } catch (e) { /* proxy not available */ }

    return request('POST', '/v1/accounts/' + cfg.accountId + '/orders', orderBody);
  }

  async function cancelOrder(orderId) {
    var cfg = getConfig();
    return request('DELETE', '/v1/accounts/' + cfg.accountId + '/orders/' + orderId);
  }

  async function getOrders(stateFilter) {
    var cfg = getConfig();
    var qs = stateFilter ? '?stateFilter=' + stateFilter : '';
    var proxy = await proxyRequest('GET', '/orders' + qs);
    if (proxy && !proxy.error) return proxy;
    return request('GET', '/v1/accounts/' + cfg.accountId + '/orders' + qs);
  }

  async function getOrder(orderId) {
    var cfg = getConfig();
    return request('GET', '/v1/accounts/' + cfg.accountId + '/orders/' + orderId);
  }

  // ============================================
  // SYMBOL LOOKUP
  // ============================================

  async function searchSymbol(query) {
    var proxy = await proxyRequest('GET', '/symbols/search?prefix=' + encodeURIComponent(query));
    if (proxy && !proxy.error) return proxy;
    return request('GET', '/v1/symbols/search?prefix=' + encodeURIComponent(query));
  }

  async function getSymbol(symbolId) {
    return request('GET', '/v1/symbols/' + symbolId);
  }

  async function getSymbolByName(symbol) {
    // Search and return the first exact match
    var results = await searchSymbol(symbol);
    if (results.error) return results;
    var symbols = results.symbols || [];
    var exact = symbols.find(function (s) {
      return s.symbol === symbol.toUpperCase();
    });
    return exact || (symbols.length > 0 ? symbols[0] : { error: 'NOT_FOUND', message: 'Symbol not found: ' + symbol });
  }

  // ============================================
  // EXECUTIONS (trade history)
  // ============================================

  async function getExecutions(startTime, endTime) {
    var cfg = getConfig();
    var qs = '';
    if (startTime) qs += '?startTime=' + encodeURIComponent(startTime);
    if (endTime) qs += (qs ? '&' : '?') + 'endTime=' + encodeURIComponent(endTime);
    return request('GET', '/v1/accounts/' + cfg.accountId + '/executions' + qs);
  }

  // ============================================
  // HELPERS
  // ============================================

  function mapOrderType(type) {
    var map = {
      'market': 'Market',
      'limit': 'Limit',
      'stop': 'StopMarket',
      'stop_limit': 'StopLimit',
      'trailing_stop': 'TrailStopInPercentage',
      // IBKR format compatibility
      'MKT': 'Market',
      'LMT': 'Limit',
      'STP': 'StopMarket',
      'STP_LMT': 'StopLimit',
    };
    return map[type] || type || 'Market';
  }

  function mapTimeInForce(tif) {
    var map = {
      'day': 'Day',
      'gtc': 'GoodTillCanceled',
      'ioc': 'ImmediateOrCancel',
      'fok': 'FillOrKill',
      // IBKR format
      'DAY': 'Day',
      'GTC': 'GoodTillCanceled',
    };
    return map[tif] || tif || 'Day';
  }

  // ============================================
  // PUBLIC API
  // ============================================

  return {
    // Config
    getConfig: getConfig,
    isConfigured: isConfigured,
    // Auth
    refreshAuth: refreshAuth,
    getAuthStatus: getAuthStatus,
    // Account
    getAccounts: getAccounts,
    getAccountBalances: getAccountBalances,
    // Positions
    getPositions: getPositions,
    // Orders
    placeOrder: placeOrder,
    cancelOrder: cancelOrder,
    getOrders: getOrders,
    getOrder: getOrder,
    // Symbols
    searchSymbol: searchSymbol,
    getSymbol: getSymbol,
    getSymbolByName: getSymbolByName,
    // History
    getExecutions: getExecutions,
  };
})();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = QuestradeClient;
}
