/* ============================================
   BROKER ROUTER
   Routes orders and data requests to the right
   broker based on market, product, and rules.

   Alpaca:    US equities + US options (free)
   Questrade: Canadian equities (TSX/TSXV, $9.95 cap)
   IBKR:      International + futures + forex + data
   ============================================ */

const BrokerRouter = (function () {

  // Broker identifiers
  const BROKER = {
    ALPACA: 'alpaca',
    QUESTRADE: 'questrade',
    IBKR: 'ibkr',
  };

  // --- Market detection patterns ---

  // Canadian exchanges route to Questrade for execution
  // All other international exchanges route to IBKR
  const SUFFIX_MAP = {
    // Canadian - Questrade execution, IBKR data
    '.TO': { exchange: 'TSE', broker: BROKER.QUESTRADE, currency: 'CAD', market: 'canadian' },
    '.V': { exchange: 'VENTURE', broker: BROKER.QUESTRADE, currency: 'CAD', market: 'canadian' },
    '.CN': { exchange: 'CSE', broker: BROKER.QUESTRADE, currency: 'CAD', market: 'canadian' },
    // International - IBKR execution + data
    '.L': { exchange: 'LSE', broker: BROKER.IBKR, currency: 'GBP', market: 'international' },
    '.DE': { exchange: 'FWB', broker: BROKER.IBKR, currency: 'EUR', market: 'international' },
    '.PA': { exchange: 'SBF', broker: BROKER.IBKR, currency: 'EUR', market: 'international' },
    '.AS': { exchange: 'AEB', broker: BROKER.IBKR, currency: 'EUR', market: 'international' },
    '.SW': { exchange: 'SWX', broker: BROKER.IBKR, currency: 'CHF', market: 'international' },
    '.T': { exchange: 'TSEJ', broker: BROKER.IBKR, currency: 'JPY', market: 'international' },
    '.HK': { exchange: 'SEHK', broker: BROKER.IBKR, currency: 'HKD', market: 'international' },
    '.AX': { exchange: 'ASX', broker: BROKER.IBKR, currency: 'AUD', market: 'international' },
    '.SI': { exchange: 'SGX', broker: BROKER.IBKR, currency: 'SGD', market: 'international' },
  };

  // Product type routing
  const PRODUCT_ROUTES = {
    'equity': null,       // Determined by market
    'option': BROKER.ALPACA, // US options default to Alpaca (free)
    'future': BROKER.IBKR,
    'forex': BROKER.IBKR,
    'crypto': BROKER.ALPACA,
  };

  // User overrides (e.g., force a specific trade through IBKR for better execution)
  var userOverrides = {};

  // ============================================
  // ROUTING LOGIC
  // ============================================

  function detectMarket(symbol) {
    // Check for exchange suffix
    var suffixes = Object.keys(SUFFIX_MAP);
    // Sort by length descending so .HK matches before .K, etc.
    suffixes.sort(function (a, b) { return b.length - a.length; });

    for (var i = 0; i < suffixes.length; i++) {
      if (symbol.toUpperCase().endsWith(suffixes[i].toUpperCase())) {
        var info = SUFFIX_MAP[suffixes[i]];
        return {
          broker: info.broker,
          exchange: info.exchange,
          currency: info.currency,
          market: info.market,
          baseSymbol: symbol.substring(0, symbol.length - suffixes[i].length),
          suffix: suffixes[i],
        };
      }
    }

    // Default: US market via Alpaca
    return {
      broker: BROKER.ALPACA,
      exchange: 'US',
      currency: 'USD',
      market: 'us',
      baseSymbol: symbol,
      suffix: null,
    };
  }

  function routeBroker(symbol, productType) {
    // Check user overrides first
    var overrideKey = (productType || 'equity') + ':' + (symbol || '*');
    if (userOverrides[overrideKey]) return userOverrides[overrideKey];

    // Check wildcard product override (e.g., 'equity:*' to force all equities somewhere)
    var wildcardKey = (productType || 'equity') + ':*';
    if (userOverrides[wildcardKey]) return userOverrides[wildcardKey];

    // Product-level routing (futures, forex always IBKR)
    if (productType && PRODUCT_ROUTES[productType]) {
      return PRODUCT_ROUTES[productType];
    }

    // Market-level routing
    var market = detectMarket(symbol);
    return market.broker;
  }

  // Data always comes from IBKR for non-US markets (even if execution goes through Questrade)
  function routeDataBroker(symbol) {
    var market = detectMarket(symbol);
    if (market.market === 'us') return BROKER.ALPACA;
    return BROKER.IBKR; // All non-US data from IBKR
  }

  // ============================================
  // UNIFIED ORDER PLACEMENT
  // ============================================

  async function placeOrder(params) {
    // params: { symbol, qty, side, type, time_in_force, limit_price, stop_price, productType, conid, symbolId }
    var broker = routeBroker(params.symbol, params.productType);
    var market = detectMarket(params.symbol);

    // Validate broker availability
    if (broker === BROKER.QUESTRADE && !QuestradeClient.isConfigured()) {
      return {
        error: 'BROKER_NOT_CONFIGURED',
        message: 'This trade routes to Questrade (Canadian market: ' + market.exchange + ') but Questrade is not configured.',
        suggestedBroker: broker,
        fallbackBroker: BROKER.IBKR,
      };
    }
    if (broker === BROKER.IBKR && !IBKRClient.isConfigured()) {
      return {
        error: 'BROKER_NOT_CONFIGURED',
        message: 'This trade routes to IBKR (international market: ' + market.exchange + ') but IBKR is not configured.',
        suggestedBroker: broker,
      };
    }
    if (broker === BROKER.ALPACA && !AlpacaClient.isConfigured()) {
      return {
        error: 'BROKER_NOT_CONFIGURED',
        message: 'This trade routes to Alpaca (US market) but Alpaca is not configured.',
        suggestedBroker: broker,
      };
    }

    var result;

    if (broker === BROKER.QUESTRADE) {
      // Questrade needs symbolId - look it up if not provided
      var symbolId = params.symbolId;
      if (!symbolId) {
        var symData = await QuestradeClient.getSymbolByName(market.baseSymbol);
        if (symData.error || !symData.symbolId) {
          return { error: 'SYMBOL_NOT_FOUND', message: 'Could not find Questrade symbol for ' + params.symbol };
        }
        symbolId = symData.symbolId;
      }

      result = await QuestradeClient.placeOrder({
        symbolId: symbolId,
        qty: params.qty,
        side: params.side,
        type: params.type || 'market',
        time_in_force: params.time_in_force || 'day',
        limit_price: params.limit_price,
        stop_price: params.stop_price,
      });

    } else if (broker === BROKER.IBKR) {
      // IBKR needs contract ID (conid)
      var conid = params.conid;
      if (!conid) {
        var search = await IBKRClient.searchContract(market.baseSymbol);
        if (search.error || !search.length) {
          return { error: 'CONTRACT_NOT_FOUND', message: 'Could not find IBKR contract for ' + params.symbol };
        }
        conid = search[0].conid || search[0].conId;
      }

      result = await IBKRClient.placeOrder({
        conid: conid,
        secType: params.productType === 'option' ? 'OPT' : 'STK',
        qty: params.qty,
        side: params.side,
        type: mapOrderType(params.type, BROKER.IBKR),
        time_in_force: params.time_in_force,
        limit_price: params.limit_price,
        stop_price: params.stop_price,
        exchange: market.exchange !== 'US' ? market.exchange : 'SMART',
      });

    } else {
      // Alpaca
      result = await AlpacaClient.placeOrder({
        symbol: market.baseSymbol,
        qty: params.qty,
        side: params.side,
        type: params.type || 'market',
        time_in_force: params.time_in_force || 'day',
        limit_price: params.limit_price,
        stop_price: params.stop_price,
      });
    }

    // Tag the result with routing metadata
    if (!result.error) {
      result._broker = broker;
      result._market = market;
    }
    return result;
  }

  // Map order types between brokers
  function mapOrderType(type, targetBroker) {
    if (targetBroker === BROKER.IBKR) {
      var toIBKR = {
        'market': 'MKT', 'limit': 'LMT', 'stop': 'STP',
        'stop_limit': 'STP_LMT', 'trailing_stop': 'TRAIL',
      };
      return toIBKR[type] || type || 'MKT';
    }
    if (targetBroker === BROKER.QUESTRADE) {
      var toQT = {
        'market': 'Market', 'limit': 'Limit', 'stop': 'StopMarket',
        'stop_limit': 'StopLimit', 'MKT': 'Market', 'LMT': 'Limit',
      };
      return toQT[type] || type || 'Market';
    }
    // Alpaca (default format)
    var toAlpaca = { 'MKT': 'market', 'LMT': 'limit', 'STP': 'stop', 'STP_LMT': 'stop_limit' };
    return toAlpaca[type] || type || 'market';
  }

  // ============================================
  // UNIFIED CANCEL
  // ============================================

  async function cancelOrder(orderId, broker) {
    if (broker === BROKER.QUESTRADE) {
      return QuestradeClient.cancelOrder(orderId);
    }
    if (broker === BROKER.IBKR) {
      return IBKRClient.cancelOrder(orderId);
    }
    return AlpacaClient.cancelOrder(orderId);
  }

  // ============================================
  // UNIFIED POSITIONS (merged from all brokers)
  // ============================================

  async function getAllPositions() {
    var results = { alpaca: [], questrade: [], ibkr: [], merged: [] };

    // Fetch from all three in parallel
    var promises = [
      AlpacaClient.isConfigured() ? AlpacaClient.getPositions() : Promise.resolve([]),
      QuestradeClient.isConfigured() ? QuestradeClient.getPositions() : Promise.resolve({ positions: [] }),
      IBKRClient.isConfigured() ? IBKRClient.getPositions() : Promise.resolve([]),
    ];

    var settled = await Promise.allSettled(promises);

    // Process Alpaca positions
    var alpacaData = settled[0].status === 'fulfilled' ? settled[0].value : [];
    if (Array.isArray(alpacaData)) {
      results.alpaca = alpacaData;
      alpacaData.forEach(function (pos) {
        results.merged.push(normalizePosition(pos, BROKER.ALPACA));
      });
    }

    // Process Questrade positions
    var qtData = settled[1].status === 'fulfilled' ? settled[1].value : { positions: [] };
    var qtPositions = qtData.positions || qtData || [];
    if (Array.isArray(qtPositions)) {
      results.questrade = qtPositions;
      qtPositions.forEach(function (pos) {
        results.merged.push(normalizePosition(pos, BROKER.QUESTRADE));
      });
    }

    // Process IBKR positions
    var ibkrData = settled[2].status === 'fulfilled' ? settled[2].value : [];
    if (Array.isArray(ibkrData)) {
      results.ibkr = ibkrData;
      ibkrData.forEach(function (pos) {
        results.merged.push(normalizePosition(pos, BROKER.IBKR));
      });
    }

    // Sort merged by market value descending
    results.merged.sort(function (a, b) {
      return Math.abs(b.marketValue) - Math.abs(a.marketValue);
    });

    return results;
  }

  // Normalize position format across brokers
  function normalizePosition(pos, broker) {
    if (broker === BROKER.ALPACA) {
      return {
        broker: BROKER.ALPACA,
        symbol: pos.symbol,
        qty: parseFloat(pos.qty),
        side: parseFloat(pos.qty) > 0 ? 'long' : 'short',
        avgCost: parseFloat(pos.avg_entry_price),
        currentPrice: parseFloat(pos.current_price),
        marketValue: parseFloat(pos.market_value),
        unrealizedPL: parseFloat(pos.unrealized_pl),
        unrealizedPLPct: parseFloat(pos.unrealized_plpc) * 100,
        currency: 'USD',
        exchange: 'US',
        productType: pos.asset_class === 'us_option' ? 'option' : 'equity',
      };
    }

    if (broker === BROKER.QUESTRADE) {
      return {
        broker: BROKER.QUESTRADE,
        symbol: pos.symbol,
        symbolId: pos.symbolId,
        qty: pos.openQuantity || 0,
        side: (pos.openQuantity || 0) > 0 ? 'long' : 'short',
        avgCost: pos.averageEntryPrice || 0,
        currentPrice: pos.currentPrice || 0,
        marketValue: pos.currentMarketValue || 0,
        unrealizedPL: pos.openPnl || 0,
        unrealizedPLPct: pos.averageEntryPrice
          ? ((pos.currentPrice - pos.averageEntryPrice) / pos.averageEntryPrice) * 100
          : 0,
        currency: 'CAD',
        exchange: pos.listingExchange || 'TSE',
        productType: 'equity',
      };
    }

    // IBKR format
    return {
      broker: BROKER.IBKR,
      symbol: pos.contractDesc || pos.ticker || pos.symbol || 'Unknown',
      conid: pos.conid,
      qty: pos.position || pos.pos || 0,
      side: (pos.position || pos.pos || 0) > 0 ? 'long' : 'short',
      avgCost: pos.avgCost || pos.avgPrice || 0,
      currentPrice: pos.mktPrice || 0,
      marketValue: pos.mktValue || 0,
      unrealizedPL: pos.unrealizedPnl || 0,
      unrealizedPLPct: pos.unrealizedPnl && pos.avgCost
        ? ((pos.mktPrice - pos.avgCost) / pos.avgCost) * 100
        : 0,
      currency: pos.currency || 'USD',
      exchange: pos.listingExchange || 'SMART',
      productType: pos.assetClass || 'equity',
    };
  }

  // ============================================
  // UNIFIED ORDERS (merged from all brokers)
  // ============================================

  async function getAllOrders() {
    var results = { alpaca: [], questrade: [], ibkr: [], merged: [] };

    var promises = [
      AlpacaClient.isConfigured() ? AlpacaClient.getOrders() : Promise.resolve([]),
      QuestradeClient.isConfigured() ? QuestradeClient.getOrders('All') : Promise.resolve({ orders: [] }),
      IBKRClient.isConfigured() ? IBKRClient.getOrders() : Promise.resolve({ orders: [] }),
    ];

    var settled = await Promise.allSettled(promises);

    // Alpaca orders
    var alpacaOrders = settled[0].status === 'fulfilled' ? settled[0].value : [];
    if (Array.isArray(alpacaOrders)) {
      results.alpaca = alpacaOrders;
      alpacaOrders.forEach(function (o) {
        results.merged.push(normalizeOrder(o, BROKER.ALPACA));
      });
    }

    // Questrade orders
    var qtResult = settled[1].status === 'fulfilled' ? settled[1].value : { orders: [] };
    var qtOrders = qtResult.orders || qtResult || [];
    if (Array.isArray(qtOrders)) {
      results.questrade = qtOrders;
      qtOrders.forEach(function (o) {
        results.merged.push(normalizeOrder(o, BROKER.QUESTRADE));
      });
    }

    // IBKR orders
    var ibkrResult = settled[2].status === 'fulfilled' ? settled[2].value : { orders: [] };
    var ibkrOrders = ibkrResult.orders || ibkrResult || [];
    if (Array.isArray(ibkrOrders)) {
      results.ibkr = ibkrOrders;
      ibkrOrders.forEach(function (o) {
        results.merged.push(normalizeOrder(o, BROKER.IBKR));
      });
    }

    return results;
  }

  function normalizeOrder(order, broker) {
    if (broker === BROKER.ALPACA) {
      return {
        broker: BROKER.ALPACA,
        id: order.id,
        symbol: order.symbol,
        qty: parseFloat(order.qty),
        filledQty: parseFloat(order.filled_qty || 0),
        side: order.side,
        type: order.type,
        status: order.status,
        limitPrice: order.limit_price ? parseFloat(order.limit_price) : null,
        stopPrice: order.stop_price ? parseFloat(order.stop_price) : null,
        filledAvgPrice: order.filled_avg_price ? parseFloat(order.filled_avg_price) : null,
        createdAt: order.created_at,
        currency: 'USD',
      };
    }

    if (broker === BROKER.QUESTRADE) {
      return {
        broker: BROKER.QUESTRADE,
        id: order.id,
        symbol: order.symbol,
        symbolId: order.symbolId,
        qty: order.totalQuantity || 0,
        filledQty: order.filledQuantity || 0,
        side: (order.side || '').toLowerCase(),
        type: order.orderType || order.type,
        status: (order.state || '').toLowerCase(),
        limitPrice: order.limitPrice || null,
        stopPrice: order.stopPrice || null,
        filledAvgPrice: order.avgExecPrice || null,
        createdAt: order.creationTime || null,
        currency: 'CAD',
      };
    }

    // IBKR
    return {
      broker: BROKER.IBKR,
      id: order.orderId || order.order_id,
      symbol: order.ticker || order.symbol,
      conid: order.conid,
      qty: order.totalSize || order.quantity || 0,
      filledQty: order.filledQuantity || 0,
      side: (order.side || '').toLowerCase(),
      type: order.orderType || order.type,
      status: order.status,
      limitPrice: order.price || null,
      stopPrice: order.auxPrice || null,
      filledAvgPrice: order.avgPrice || null,
      createdAt: order.lastExecutionTime || null,
      currency: order.cashCcy || 'USD',
      exchange: order.listingExchange,
    };
  }

  // ============================================
  // UNIFIED ACCOUNT SUMMARY
  // ============================================

  async function getAccountSummary() {
    var summary = {
      totalEquity: 0,
      totalCash: 0,
      totalMarketValue: 0,
      totalUnrealizedPL: 0,
      accounts: [],
    };

    var promises = [
      AlpacaClient.isConfigured() ? AlpacaClient.getAccount() : Promise.resolve(null),
      QuestradeClient.isConfigured() ? QuestradeClient.getAccountBalances() : Promise.resolve(null),
      IBKRClient.isConfigured() ? IBKRClient.getAccountSummary() : Promise.resolve(null),
    ];

    var settled = await Promise.allSettled(promises);

    // Alpaca account
    var alpacaAcct = settled[0].status === 'fulfilled' ? settled[0].value : null;
    if (alpacaAcct && !alpacaAcct.error) {
      var alpacaEquity = parseFloat(alpacaAcct.equity || 0);
      var alpacaCash = parseFloat(alpacaAcct.cash || 0);
      summary.accounts.push({
        broker: BROKER.ALPACA,
        equity: alpacaEquity,
        cash: alpacaCash,
        buyingPower: parseFloat(alpacaAcct.buying_power || 0),
        currency: 'USD',
      });
      summary.totalEquity += alpacaEquity;
      summary.totalCash += alpacaCash;
    }

    // Questrade account
    var qtAcct = settled[1].status === 'fulfilled' ? settled[1].value : null;
    if (qtAcct && !qtAcct.error) {
      // Questrade returns balances grouped by currency
      var qtBalances = qtAcct.combinedBalances || qtAcct.perCurrencyBalances || [];
      var cadBalance = qtBalances.find(function (b) { return b.currency === 'CAD'; }) || {};
      var qtEquity = parseFloat(cadBalance.totalEquity || 0);
      var qtCash = parseFloat(cadBalance.cash || 0);
      summary.accounts.push({
        broker: BROKER.QUESTRADE,
        equity: qtEquity,
        cash: qtCash,
        buyingPower: parseFloat(cadBalance.buyingPower || 0),
        currency: 'CAD',
      });
      summary.totalEquity += qtEquity;
      summary.totalCash += qtCash;
    }

    // IBKR account
    var ibkrAcct = settled[2].status === 'fulfilled' ? settled[2].value : null;
    if (ibkrAcct && !ibkrAcct.error) {
      var ibkrEquity = parseFloat(ibkrAcct.totalcashvalue || ibkrAcct.netliquidation || 0);
      var ibkrCash = parseFloat(ibkrAcct.totalcashvalue || 0);
      summary.accounts.push({
        broker: BROKER.IBKR,
        equity: ibkrEquity,
        cash: ibkrCash,
        buyingPower: parseFloat(ibkrAcct.buyingpower || 0),
        currency: 'USD',
      });
      summary.totalEquity += ibkrEquity;
      summary.totalCash += ibkrCash;
    }

    return summary;
  }

  // ============================================
  // MARKET DATA ROUTING (always IBKR for non-US)
  // ============================================

  async function getQuote(symbol) {
    var dataBroker = routeDataBroker(symbol);
    var market = detectMarket(symbol);

    if (dataBroker === BROKER.IBKR) {
      var search = await IBKRClient.searchContract(market.baseSymbol);
      if (search.error || !search.length) return search;
      var conid = search[0].conid || search[0].conId;
      return IBKRClient.getSnapshot(conid);
    }
    return AlpacaClient.getLatestQuote(symbol);
  }

  async function getBars(symbol, timeframe, start, end, limit) {
    var dataBroker = routeDataBroker(symbol);
    var market = detectMarket(symbol);

    if (dataBroker === BROKER.IBKR) {
      var search = await IBKRClient.searchContract(market.baseSymbol);
      if (search.error || !search.length) return search;
      var conid = search[0].conid || search[0].conId;
      return IBKRClient.getHistoricalData(conid, timeframe, start);
    }
    return AlpacaClient.getBars(symbol, timeframe, start, end, limit);
  }

  // ============================================
  // CONFIGURATION
  // ============================================

  function setOverride(productType, symbol, broker) {
    var key = productType + ':' + (symbol || '*');
    userOverrides[key] = broker;
  }

  function clearOverride(productType, symbol) {
    var key = productType + ':' + (symbol || '*');
    delete userOverrides[key];
  }

  function clearOverrides() {
    userOverrides = {};
  }

  function getBrokerStatus() {
    return {
      alpaca: {
        configured: AlpacaClient.isConfigured(),
        mode: AlpacaClient.getConfig().paperMode ? 'paper' : 'live',
        handles: 'US equities, US options',
      },
      questrade: {
        configured: QuestradeClient.isConfigured(),
        accountId: QuestradeClient.getConfig().accountId || null,
        handles: 'Canadian equities (TSX, TSXV, CSE)',
      },
      ibkr: {
        configured: IBKRClient.isConfigured(),
        accountId: IBKRClient.getConfig().accountId || null,
        handles: 'International equities, futures, forex, data feeds',
      },
      routing: {
        usEquities: BROKER.ALPACA,
        usOptions: BROKER.ALPACA,
        canadianEquities: BROKER.QUESTRADE,
        international: BROKER.IBKR,
        futures: BROKER.IBKR,
        forex: BROKER.IBKR,
        dataFeed: BROKER.IBKR + ' (non-US), Yahoo Finance + Alpaca (US)',
        overrides: Object.keys(userOverrides).length,
      },
    };
  }

  // ============================================
  // PUBLIC API
  // ============================================

  return {
    BROKER: BROKER,
    // Routing
    detectMarket: detectMarket,
    routeBroker: routeBroker,
    routeDataBroker: routeDataBroker,
    getBrokerStatus: getBrokerStatus,
    // Trading
    placeOrder: placeOrder,
    cancelOrder: cancelOrder,
    // Unified views
    getAllPositions: getAllPositions,
    getAllOrders: getAllOrders,
    getAccountSummary: getAccountSummary,
    // Market data
    getQuote: getQuote,
    getBars: getBars,
    // Config
    setOverride: setOverride,
    clearOverride: clearOverride,
    clearOverrides: clearOverrides,
  };
})();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BrokerRouter;
}
