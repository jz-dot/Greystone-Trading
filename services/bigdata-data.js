/* ============================================
   GREYSTONE TRADING PLATFORM - BigData.com
   Client-side service for premium data integration
   ============================================ */

const BigDataService = (function () {

  let _available = null; // null = unknown, true/false after check
  let _checking = false;
  let _pollIntervals = [];

  // ---- Status check ----
  async function checkAvailability() {
    if (_checking) return _available;
    _checking = true;
    try {
      const res = await fetch('/api/bigdata/status');
      const data = await res.json();
      _available = data.configured && data.connected;
      _checking = false;
      return _available;
    } catch (e) {
      _available = false;
      _checking = false;
      return false;
    }
  }

  function isAvailable() {
    return _available === true;
  }

  // ---- Data fetch helpers ----
  async function fetchJSON(url) {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      return null;
    }
  }

  // ---- Public API methods ----

  async function getOptionsFlow(symbol) {
    if (!_available) return null;
    return fetchJSON('/api/bigdata/flow/' + encodeURIComponent(symbol));
  }

  async function getDarkPool(symbol) {
    if (!_available) return null;
    return fetchJSON('/api/bigdata/darkpool/' + encodeURIComponent(symbol));
  }

  async function getSentiment(symbol) {
    if (!_available) return null;
    return fetchJSON('/api/bigdata/sentiment/' + encodeURIComponent(symbol));
  }

  async function getInsider(symbol) {
    if (!_available) return null;
    return fetchJSON('/api/bigdata/insider/' + encodeURIComponent(symbol));
  }

  async function getInstitutional(symbol) {
    if (!_available) return null;
    return fetchJSON('/api/bigdata/institutional/' + encodeURIComponent(symbol));
  }

  async function getMarketMovers() {
    if (!_available) return null;
    return fetchJSON('/api/bigdata/movers');
  }

  async function getSectors(period) {
    if (!_available) return null;
    const url = '/api/bigdata/sectors' + (period ? '?period=' + encodeURIComponent(period) : '');
    return fetchJSON(url);
  }

  // ---- Save API key ----
  async function saveApiKey(key) {
    try {
      const res = await fetch('/api/bigdata/key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: key })
      });
      const data = await res.json();
      if (data.status === 'ok') {
        localStorage.setItem('gs_bigdata_key', key);
        // Re-check availability
        _available = null;
        await checkAvailability();
        return { success: true };
      }
      return { success: false, error: data.error || 'Failed to save key' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // Restore key from localStorage to server on page load
  async function restoreApiKey() {
    const savedKey = localStorage.getItem('gs_bigdata_key');
    if (savedKey) {
      try {
        await fetch('/api/bigdata/key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey: savedKey })
        });
      } catch (e) { /* ignore */ }
    }
  }

  // ---- Test connection ----
  async function testConnection() {
    try {
      const res = await fetch('/api/bigdata/status');
      const data = await res.json();
      return data;
    } catch (e) {
      return { configured: false, connected: false, message: e.message };
    }
  }

  // ---- Flow feed integration ----
  // Returns formatted flow entries compatible with FlowEngine format
  function normalizeFlowEntry(raw) {
    return {
      time: raw.time || new Date(raw.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
      ticker: raw.symbol || raw.ticker,
      type: raw.option_type === 'call' || raw.isCall ? 'CALL' : 'PUT',
      isCall: raw.option_type === 'call' || raw.isCall === true,
      strike: raw.strike,
      exp: raw.expiration || raw.exp,
      side: raw.side || (raw.at_ask ? 'Ask' : raw.at_bid ? 'Bid' : 'Mid'),
      size: raw.volume || raw.size || raw.contracts,
      premium: raw.premium || raw.total_premium || 0,
      spot: raw.underlying_price || raw.spot || 0,
      iv: raw.iv ? Math.round(raw.iv * 100) : (raw.implied_volatility || 0),
      delta: raw.delta || 0,
      fillPrice: raw.fill_price || raw.price || 0,
      bid: raw.bid || 0,
      ask: raw.ask || 0,
      daysToExp: raw.dte || raw.daysToExp || 0,
      signal: raw.trade_type || raw.signal || null,
      sweepExchanges: raw.sweep_exchanges || raw.sweepExchanges || null,
      source: 'bigdata'
    };
  }

  // Normalize dark pool entry
  function normalizeDarkPoolEntry(raw) {
    return {
      time: raw.time || new Date(raw.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
      ticker: raw.symbol || raw.ticker,
      price: raw.price,
      size: raw.volume || raw.size || raw.shares,
      notional: raw.notional || (raw.price * (raw.volume || raw.size || raw.shares)),
      venue: raw.venue || raw.exchange || 'DARK',
      side: raw.side || 'N/A',
      source: 'bigdata'
    };
  }

  // Normalize sector data for heatmap
  function normalizeSectorData(raw) {
    if (!raw || !raw.sectors) return null;
    return raw.sectors.map(function (s) {
      return {
        name: s.name || s.sector,
        change: s.change_percent || s.change || s.performance || 0,
        marketCap: s.market_cap || 0,
        volume: s.volume || 0
      };
    });
  }

  // ---- Polling management ----
  function startPolling(callback, intervalMs) {
    const id = setInterval(callback, intervalMs || 5000);
    _pollIntervals.push(id);
    return id;
  }

  function stopAllPolling() {
    _pollIntervals.forEach(function (id) { clearInterval(id); });
    _pollIntervals = [];
  }

  // ---- Gather context for Grey Sankore enrichment ----
  async function gatherEnrichmentContext(ticker) {
    if (!_available || !ticker) return {};

    const context = {};

    try {
      const [sentiment, insider, institutional] = await Promise.all([
        getSentiment(ticker).catch(function () { return null; }),
        getInsider(ticker).catch(function () { return null; }),
        getInstitutional(ticker).catch(function () { return null; })
      ]);

      if (sentiment) {
        context.sentiment = sentiment;
      }
      if (insider) {
        context.insiderActivity = insider;
      }
      if (institutional) {
        context.institutionalOwnership = institutional;
      }
    } catch (e) {
      // Fail silently - enrichment is optional
    }

    return context;
  }

  // ---- Init ----
  async function init() {
    await restoreApiKey();
    await checkAvailability();
    return _available;
  }

  return {
    init: init,
    checkAvailability: checkAvailability,
    isAvailable: isAvailable,
    getOptionsFlow: getOptionsFlow,
    getDarkPool: getDarkPool,
    getSentiment: getSentiment,
    getInsider: getInsider,
    getInstitutional: getInstitutional,
    getMarketMovers: getMarketMovers,
    getSectors: getSectors,
    saveApiKey: saveApiKey,
    restoreApiKey: restoreApiKey,
    testConnection: testConnection,
    normalizeFlowEntry: normalizeFlowEntry,
    normalizeDarkPoolEntry: normalizeDarkPoolEntry,
    normalizeSectorData: normalizeSectorData,
    startPolling: startPolling,
    stopAllPolling: stopAllPolling,
    gatherEnrichmentContext: gatherEnrichmentContext
  };

})();
