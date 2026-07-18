/* ============================================
   GSP TRADING - BROKER POSITION IMPORT (read-only)

   Normalizes raw position payloads from broker APIs into one shape the
   portfolio tracker can preview and import:

     { broker, account, positions: [
         { symbol, description, qty, avgPrice, currency, marketPrice, marketValue }
       ],
       skipped: [ { symbol, reason } ] }

   Import is strictly READ: these functions never place, modify, or cancel
   anything. Short and zero positions are skipped (the tracker models long
   lots only) and reported in `skipped` rather than dropped silently.

   ACB caveat: a broker's average entry price is that account's average
   cost, not necessarily your CRA adjusted cost base (ACB pools identical
   property across ALL accounts and applies the superficial-loss rule).
   Imported lots are therefore flagged source:'broker-import' so the user
   knows the cost basis is an approximation until they backfill history.
   ============================================ */

'use strict';

const BrokerImport = (function () {

  function num(v) {
    const n = Number(v);
    return isFinite(n) ? n : 0;
  }

  // Mirror of the tracker's listing-suffix heuristic: TSX (.TO),
  // TSX Venture (.V), CSE (.CN) and NEO (.NE) list in CAD; else USD.
  function inferCurrency(sym) {
    sym = String(sym || '').toUpperCase();
    if (/\.(TO|V|CN|NE)$/.test(sym)) return 'CAD';
    return 'USD';
  }

  // Questrade GET /v1/accounts/{id}/positions -> { positions: [...] }
  // Relevant fields: symbol, description, openQuantity, averageEntryPrice,
  // currentPrice, currentMarketValue.
  function normalizeQuestrade(raw, accountId) {
    const list = (raw && Array.isArray(raw.positions)) ? raw.positions : [];
    const positions = [];
    const skipped = [];
    list.forEach(function (p) {
      if (!p || !p.symbol) return;
      const symbol = String(p.symbol).toUpperCase();
      const qty = num(p.openQuantity);
      if (qty === 0) {
        skipped.push({ symbol: symbol, reason: 'closed position' });
        return;
      }
      if (qty < 0) {
        skipped.push({ symbol: symbol, reason: 'short position (tracker models long lots only)' });
        return;
      }
      positions.push({
        symbol: symbol,
        description: p.description || null,
        qty: qty,
        avgPrice: num(p.averageEntryPrice),
        currency: inferCurrency(symbol),
        marketPrice: num(p.currentPrice) || null,
        marketValue: num(p.currentMarketValue) || null,
      });
    });
    return { broker: 'questrade', account: accountId || null, positions: positions, skipped: skipped };
  }

  // IBKR Client Portal GET /portfolio/{acct}/positions/{page} -> [ ... ]
  // Relevant fields: ticker (or contractDesc), position, avgPrice (per share;
  // avgCost as fallback), mktPrice, mktValue, currency, assetClass,
  // listingExchange.
  function normalizeIbkr(raw, accountId) {
    const list = Array.isArray(raw) ? raw : [];
    const positions = [];
    const skipped = [];
    list.forEach(function (p) {
      if (!p) return;
      let symbol = String(p.ticker || p.contractDesc || '').toUpperCase().trim();
      if (!symbol) return;
      const qty = num(p.position);
      if (p.assetClass && p.assetClass !== 'STK') {
        skipped.push({ symbol: symbol, reason: 'non-stock asset (' + p.assetClass + ')' });
        return;
      }
      if (qty === 0) {
        skipped.push({ symbol: symbol, reason: 'closed position' });
        return;
      }
      if (qty < 0) {
        skipped.push({ symbol: symbol, reason: 'short position (tracker models long lots only)' });
        return;
      }
      const currency = p.currency || inferCurrency(symbol);
      // IBKR returns bare TSX tickers; align to the tracker's Yahoo-style
      // suffix so quotes and currency inference line up.
      if (currency === 'CAD' && !/\.(TO|V|CN|NE)$/.test(symbol)) {
        const exch = String(p.listingExchange || '').toUpperCase();
        if (exch === 'TSE' || exch === 'TSX') symbol += '.TO';
        else if (exch === 'VENTURE' || exch === 'TSXV') symbol += '.V';
      }
      positions.push({
        symbol: symbol,
        description: p.contractDesc || null,
        qty: qty,
        avgPrice: num(p.avgPrice) || num(p.avgCost),
        currency: currency,
        marketPrice: num(p.mktPrice) || null,
        marketValue: num(p.mktValue) || null,
      });
    });
    return { broker: 'ibkr', account: accountId || null, positions: positions, skipped: skipped };
  }

  return {
    normalizeQuestrade: normalizeQuestrade,
    normalizeIbkr: normalizeIbkr,
    inferCurrency: inferCurrency,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = BrokerImport;
} else if (typeof window !== 'undefined') {
  window.BrokerImport = BrokerImport;
}
