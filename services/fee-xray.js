/* ============================================
   GSP TRADING - FEE X-RAY (pure computation)

   Turns a real portfolio + a trading pattern into the number that makes
   hidden costs concrete: what each Canadian broker would charge PER YEAR
   for the same behaviour, split into commissions, FX drag, and options
   fees. Rendered by the Fee X-Ray view; all pricing comes from
   services/fee-model.js.

   STATED ASSUMPTIONS (also surfaced in the UI):
   - Trades are CAD-funded: a USD security purchase converts CAD at the
     broker's FX rate on every trade (the common retail pattern; holding
     a USD balance or journaling avoids this, which is exactly the point
     the X-Ray makes).
   - A representative trade is priced at $60/share; trade size defaults
     to 2% of portfolio value per trade (clamped $250 to $50,000) unless
     the user supplies their own.
   - The trade mix follows the portfolio's USD/CAD split by market value.
   - Norbert's Gambit friction is modeled conservatively: two $9.99
     commissions plus a 0.10% bid/ask spread on the converted amount.
   - Options fees use each broker's per-contract rate; premium FX is not
     modeled. Estimates, not advice.
   ============================================ */

'use strict';

const FeeXray = (function () {
  const feeModelLib = (typeof module !== 'undefined' && module.exports)
    ? require('./fee-model.js')
    : (typeof FeeModel !== 'undefined' ? FeeModel : null);

  const REP_SHARE_PRICE = 60;      // representative retail share price
  const TRADE_SIZE_PCT = 0.02;     // default trade = 2% of portfolio value
  const TRADE_SIZE_MIN = 250;
  const TRADE_SIZE_MAX = 50000;
  const GAMBIT_COMMISSIONS = 2 * 9.99; // buy DLR + sell DLR.U at a big bank
  const GAMBIT_SPREAD_PCT = 0.10;      // DLR bid/ask, conservative

  function num(v) { const n = Number(v); return isFinite(n) ? n : 0; }
  function round2(v) { return Math.round(v * 100) / 100; }

  // holdings: PortfolioManager.getHoldings() rows ({ marketValue CAD, currency })
  function portfolioStats(holdings) {
    const rows = Array.isArray(holdings) ? holdings : [];
    let totalValueCad = 0;
    let usdValueCad = 0;
    rows.forEach(function (h) {
      const mv = num(h && h.marketValue);
      if (mv <= 0) return;
      totalValueCad += mv;
      if (h.currency === 'USD') usdValueCad += mv;
    });
    return {
      totalValueCad: round2(totalValueCad),
      usdValueCad: round2(usdValueCad),
      usdShare: totalValueCad > 0 ? usdValueCad / totalValueCad : 0,
      positionCount: rows.filter(function (h) { return num(h && h.marketValue) > 0; }).length,
    };
  }

  function defaultTradeSize(totalValueCad) {
    const raw = totalValueCad * TRADE_SIZE_PCT;
    return Math.min(TRADE_SIZE_MAX, Math.max(TRADE_SIZE_MIN, round2(raw)));
  }

  // opts: { tradesPerYear, optionContractsPerYear, avgTradeSizeCad, usdCadRate }
  function buildProfile(holdings, opts) {
    opts = opts || {};
    const stats = portfolioStats(holdings);
    const tradesPerYear = Math.max(0, Math.round(num(opts.tradesPerYear !== undefined ? opts.tradesPerYear : 24)));
    const usdTrades = Math.round(tradesPerYear * stats.usdShare);
    return {
      stats: stats,
      tradesPerYear: tradesPerYear,
      usdTrades: usdTrades,
      cadTrades: tradesPerYear - usdTrades,
      optionContractsPerYear: Math.max(0, Math.round(num(opts.optionContractsPerYear))),
      avgTradeSizeCad: num(opts.avgTradeSizeCad) > 0 ? round2(num(opts.avgTradeSizeCad)) : defaultTradeSize(stats.totalValueCad),
      usdCadRate: num(opts.usdCadRate) > 0 ? num(opts.usdCadRate) : 1.36,
    };
  }

  // Annual cost of the profile's behaviour at one broker.
  function annualCostForBroker(brokerId, profile) {
    if (!feeModelLib) throw new Error('fee-model.js not loaded');
    const broker = feeModelLib.getBroker(brokerId);

    const cadQty = Math.max(1, Math.round(profile.avgTradeSizeCad / REP_SHARE_PRICE));
    const usdNotional = profile.avgTradeSizeCad / profile.usdCadRate;
    const usdQty = Math.max(1, Math.round(usdNotional / REP_SHARE_PRICE));

    const cadTrade = feeModelLib.estimateTradeCost({
      broker: broker.id, side: 'buy', quantity: cadQty, price: REP_SHARE_PRICE,
      currency: 'CAD', accountCurrency: 'CAD',
    });
    const usdTrade = feeModelLib.estimateTradeCost({
      broker: broker.id, side: 'buy', quantity: usdQty, price: REP_SHARE_PRICE,
      currency: 'USD', accountCurrency: 'CAD',
    });

    const commissionsYr = round2(profile.cadTrades * cadTrade.commission + profile.usdTrades * usdTrade.commission);
    const fxDragYr = round2(profile.usdTrades * usdTrade.fxCost);
    const optionsYr = round2(feeModelLib.optionsCommission(broker, profile.optionContractsPerYear));

    return {
      broker: broker.id,
      brokerName: broker.name,
      fxRatePct: broker.fx.ratePct,
      commissionsYr: commissionsYr,
      fxDragYr: fxDragYr,
      optionsYr: optionsYr,
      totalYr: round2(commissionsYr + fxDragYr + optionsYr),
      accountFees: broker.accountFees,
    };
  }

  // All brokers, cheapest first, each row carrying its delta to the cheapest.
  function compareAnnualCosts(profile, brokerIds) {
    if (!feeModelLib) throw new Error('fee-model.js not loaded');
    const ids = Array.isArray(brokerIds) && brokerIds.length ? brokerIds : Object.keys(feeModelLib.BROKERS);
    const rows = ids.map(function (id) { return annualCostForBroker(id, profile); });
    rows.sort(function (a, b) { return a.totalYr - b.totalYr; });
    const cheapest = rows.length ? rows[0].totalYr : 0;
    rows.forEach(function (r) { r.vsCheapest = round2(r.totalYr - cheapest); });
    return rows;
  }

  // The FX story for the hero card: annual USD conversion volume, what the
  // current broker skims, and what Norbert's Gambit (with honest friction)
  // or an at-cost converter leaves on the table.
  function fxStory(profile, brokerId) {
    if (!feeModelLib) throw new Error('fee-model.js not loaded');
    const broker = feeModelLib.getBroker(brokerId);
    const volumeCad = round2(profile.usdTrades * profile.avgTradeSizeCad);
    const dragAtBroker = round2((volumeCad * broker.fx.ratePct) / 100);
    const gambitCost = round2(GAMBIT_COMMISSIONS + (volumeCad * GAMBIT_SPREAD_PCT) / 100);
    const gambitSavings = round2(Math.max(0, dragAtBroker - gambitCost));
    return {
      volumeCad: volumeCad,
      brokerFxRatePct: broker.fx.ratePct,
      dragAtBroker: dragAtBroker,
      gambitCost: gambitCost,
      gambitSavings: gambitSavings,
      gambitWorthIt: gambitSavings > 0,
    };
  }

  return {
    portfolioStats: portfolioStats,
    defaultTradeSize: defaultTradeSize,
    buildProfile: buildProfile,
    annualCostForBroker: annualCostForBroker,
    compareAnnualCosts: compareAnnualCosts,
    fxStory: fxStory,
    REP_SHARE_PRICE: REP_SHARE_PRICE,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = FeeXray;
} else if (typeof window !== 'undefined') {
  window.FeeXray = FeeXray;
}
