/* ============================================
   ALPACA API CLIENT
   Paper + Live trading via Alpaca Markets
   ============================================ */

const AlpacaClient = (function () {
  const PAPER_BASE = 'https://paper-api.alpaca.markets';
  const LIVE_BASE = 'https://api.alpaca.markets';
  const DATA_BASE = 'https://data.alpaca.markets';

  // --- Config ---
  function getConfig() {
    return {
      apiKey: localStorage.getItem('alpaca_api_key') || '',
      apiSecret: localStorage.getItem('alpaca_api_secret') || '',
      paperMode: localStorage.getItem('alpaca_paper_mode') !== 'false', // default true
    };
  }

  function isConfigured() {
    const cfg = getConfig();
    return cfg.apiKey.length > 0 && cfg.apiSecret.length > 0;
  }

  function getBaseUrl() {
    return getConfig().paperMode ? PAPER_BASE : LIVE_BASE;
  }

  function headers() {
    const cfg = getConfig();
    return {
      'APCA-API-KEY-ID': cfg.apiKey,
      'APCA-API-SECRET-KEY': cfg.apiSecret,
      'Content-Type': 'application/json',
    };
  }

  // --- Core request helper ---
  async function request(method, path, body, base) {
    if (!isConfigured()) {
      return { error: 'NOT_CONFIGURED', message: 'Alpaca API keys not configured. Set them in Settings.' };
    }
    const url = (base || getBaseUrl()) + path;
    const opts = {
      method,
      headers: headers(),
    };
    if (body) opts.body = JSON.stringify(body);

    try {
      const resp = await fetch(url, opts);
      const data = await resp.json();
      if (!resp.ok) {
        return { error: resp.status, message: data.message || JSON.stringify(data) };
      }
      return data;
    } catch (err) {
      return { error: 'NETWORK', message: err.message };
    }
  }

  // --- If server proxy is available, use it instead of direct calls ---
  async function proxyRequest(method, endpoint, body) {
    try {
      const opts = {
        method: method === 'GET' ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json' },
      };
      if (method === 'GET') {
        const resp = await fetch(`/api/alpaca${endpoint}`);
        return await resp.json();
      } else {
        opts.body = JSON.stringify({ method, endpoint, body });
        const resp = await fetch('/api/alpaca/proxy', opts);
        return await resp.json();
      }
    } catch {
      // Proxy not available - fall back to direct
      return null;
    }
  }

  // --- Public API ---

  async function getAccount() {
    const proxy = await proxyRequest('GET', '/account');
    if (proxy && !proxy.error) return proxy;
    return request('GET', '/v2/account');
  }

  async function getPositions() {
    const proxy = await proxyRequest('GET', '/positions');
    if (proxy && !proxy.error) return proxy;
    return request('GET', '/v2/positions');
  }

  async function getPosition(symbol) {
    return request('GET', `/v2/positions/${symbol}`);
  }

  async function placeOrder(params) {
    // params: { symbol, qty, side, type, time_in_force, limit_price, stop_price, ... }
    const orderBody = {
      symbol: params.symbol,
      qty: String(params.qty),
      side: params.side, // 'buy' or 'sell'
      type: params.type || 'market', // 'market', 'limit', 'stop', 'stop_limit'
      time_in_force: params.time_in_force || 'day',
    };
    if (params.limit_price) orderBody.limit_price = String(params.limit_price);
    if (params.stop_price) orderBody.stop_price = String(params.stop_price);
    if (params.trail_percent) orderBody.trail_percent = String(params.trail_percent);
    if (params.order_class) orderBody.order_class = params.order_class;
    if (params.take_profit) orderBody.take_profit = params.take_profit;
    if (params.stop_loss) orderBody.stop_loss = params.stop_loss;

    // Try proxy first
    try {
      const resp = await fetch('/api/alpaca/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderBody),
      });
      const data = await resp.json();
      if (!data.error) return data;
    } catch { /* proxy not available */ }

    return request('POST', '/v2/orders', orderBody);
  }

  async function cancelOrder(orderId) {
    return request('DELETE', `/v2/orders/${orderId}`);
  }

  async function cancelAllOrders() {
    return request('DELETE', '/v2/orders');
  }

  async function getOrders(status) {
    const qs = status ? `?status=${status}` : '';
    return request('GET', `/v2/orders${qs}`);
  }

  async function getOrder(orderId) {
    return request('GET', `/v2/orders/${orderId}`);
  }

  // --- Market data ---
  async function getLatestQuote(symbol) {
    return request('GET', `/v2/stocks/${symbol}/quotes/latest`, null, DATA_BASE);
  }

  async function getLatestTrade(symbol) {
    return request('GET', `/v2/stocks/${symbol}/trades/latest`, null, DATA_BASE);
  }

  async function getBars(symbol, timeframe, start, end, limit) {
    let qs = `?timeframe=${timeframe || '1Day'}`;
    if (start) qs += `&start=${start}`;
    if (end) qs += `&end=${end}`;
    if (limit) qs += `&limit=${limit}`;
    return request('GET', `/v2/stocks/${symbol}/bars${qs}`, null, DATA_BASE);
  }

  async function getSnapshot(symbol) {
    return request('GET', `/v2/stocks/${symbol}/snapshot`, null, DATA_BASE);
  }

  // --- Clock and calendar ---
  async function getClock() {
    return request('GET', '/v2/clock');
  }

  async function getCalendar(start, end) {
    let qs = '';
    if (start) qs += `?start=${start}`;
    if (end) qs += `&end=${end}`;
    return request('GET', `/v2/calendar${qs}`);
  }

  return {
    getConfig,
    isConfigured,
    getAccount,
    getPositions,
    getPosition,
    placeOrder,
    cancelOrder,
    cancelAllOrders,
    getOrders,
    getOrder,
    getLatestQuote,
    getLatestTrade,
    getBars,
    getSnapshot,
    getClock,
    getCalendar,
  };
})();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AlpacaClient;
}
