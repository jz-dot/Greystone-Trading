/* ============================================
   GREYSTONE TRADING PLATFORM - Flow Analytics
   Pattern detection and smart money alerts
   ============================================ */

const FlowAnalytics = (function() {

  const alerts = [];
  const sizzleIndex = {};
  const accumulationTracker = {}; // strike accumulation detection
  const ALERT_MAX = 50;

  // --- Track net premium over time windows ---
  function getNetPremiumWindows() {
    const series = FlowEngine.getNetFlowTimeSeries();
    const now = Date.now();
    const windows = {
      '5m': { callPremium: 0, putPremium: 0 },
      '15m': { callPremium: 0, putPremium: 0 },
      '1h': { callPremium: 0, putPremium: 0 },
    };

    const history = FlowEngine.flowHistory;
    history.forEach(entry => {
      const age = now - entry.timestamp;
      const prem = entry.premium;
      if (age <= 5 * 60 * 1000) {
        if (entry.isCall) windows['5m'].callPremium += prem; else windows['5m'].putPremium += prem;
      }
      if (age <= 15 * 60 * 1000) {
        if (entry.isCall) windows['15m'].callPremium += prem; else windows['15m'].putPremium += prem;
      }
      if (age <= 60 * 60 * 1000) {
        if (entry.isCall) windows['1h'].callPremium += prem; else windows['1h'].putPremium += prem;
      }
    });

    return Object.fromEntries(
      Object.entries(windows).map(([key, val]) => [key, {
        ...val,
        net: val.callPremium - val.putPremium,
        pcRatio: val.putPremium > 0 ? (val.callPremium / val.putPremium).toFixed(2) : 'N/A',
      }])
    );
  }

  // --- Detect unusual activity patterns ---
  function analyzeEntry(entry) {
    const detectedAlerts = [];

    // 1) Large premium sweep (>$500K single trade)
    if (entry.premium > 500000 && entry.signal === 'sweep') {
      detectedAlerts.push({
        type: 'large_sweep',
        severity: entry.premium > 2000000 ? 'critical' : 'high',
        ticker: entry.ticker,
        message: `Large ${entry.type} sweep on ${entry.ticker}: ${formatDollar(entry.premium)} at $${entry.strike} ${entry.exp}`,
        premium: entry.premium,
        timestamp: entry.timestamp,
      });
    }

    // 2) Large single block (>$1M)
    if (entry.premium > 1000000 && entry.signal === 'block') {
      detectedAlerts.push({
        type: 'mega_block',
        severity: 'high',
        ticker: entry.ticker,
        message: `Mega block print on ${entry.ticker}: ${formatDollar(entry.premium)} - ${entry.size.toLocaleString()} contracts`,
        premium: entry.premium,
        timestamp: entry.timestamp,
      });
    }

    // 3) Accumulation detection - repeated strikes being hit
    const strikeKey = `${entry.ticker}-${entry.strike}-${entry.isCall ? 'C' : 'P'}-${entry.exp}`;
    if (!accumulationTracker[strikeKey]) {
      accumulationTracker[strikeKey] = { count: 0, totalPremium: 0, totalSize: 0, firstSeen: entry.timestamp };
    }
    const acc = accumulationTracker[strikeKey];
    acc.count++;
    acc.totalPremium += entry.premium;
    acc.totalSize += entry.size;

    if (acc.count >= 5 && acc.count % 5 === 0) {
      detectedAlerts.push({
        type: 'accumulation',
        severity: 'medium',
        ticker: entry.ticker,
        message: `Strike accumulation detected: ${entry.ticker} $${entry.strike}${entry.isCall ? 'C' : 'P'} ${entry.exp} hit ${acc.count}x (${formatDollar(acc.totalPremium)} total)`,
        premium: acc.totalPremium,
        timestamp: entry.timestamp,
      });
    }

    // 4) Unusual activity flag
    if (entry.signal === 'unusual') {
      detectedAlerts.push({
        type: 'unusual_activity',
        severity: 'medium',
        ticker: entry.ticker,
        message: `Unusual ${entry.type} activity on ${entry.ticker}: ${entry.size.toLocaleString()} contracts at $${entry.strike} ${entry.exp}`,
        premium: entry.premium,
        timestamp: entry.timestamp,
      });
    }

    // Store alerts
    detectedAlerts.forEach(a => {
      a.id = Date.now() + Math.floor(Math.random() * 10000);
      alerts.push(a);
    });
    if (alerts.length > ALERT_MAX) alerts.splice(0, alerts.length - ALERT_MAX);

    return detectedAlerts;
  }

  // --- Put/Call ratio extremes by ticker ---
  function getPCRatioExtremes() {
    const tickers = FlowEngine.getTickerList();
    const extremes = [];

    tickers.forEach(ticker => {
      const nf = FlowEngine.getNetFlow(ticker);
      if (nf.callPremium === 0 && nf.putPremium === 0) return;

      const ratio = nf.putPremium > 0 ? nf.callPremium / nf.putPremium : 99;
      const putCallRatio = nf.callPremium > 0 ? nf.putPremium / nf.callPremium : 99;

      let signal = 'neutral';
      if (ratio > 3) signal = 'extreme_bullish';
      else if (ratio > 2) signal = 'bullish';
      else if (putCallRatio > 3) signal = 'extreme_bearish';
      else if (putCallRatio > 2) signal = 'bearish';

      extremes.push({
        ticker,
        callPremium: nf.callPremium,
        putPremium: nf.putPremium,
        ratio: parseFloat(ratio.toFixed(2)),
        signal,
        totalVolume: nf.totalVolume || 0,
      });
    });

    return extremes.sort((a, b) => Math.abs(b.ratio - 1) - Math.abs(a.ratio - 1));
  }

  // --- Sizzle Index: today's volume / 20-day avg ---
  function calculateSizzleIndex() {
    const tickers = FlowEngine.getTickerList();
    tickers.forEach(ticker => {
      const data = FlowEngine.getTickerData(ticker);
      const nf = FlowEngine.getNetFlow(ticker);
      const todayVol = nf.totalVolume || 0;
      // 20-day avg is from ticker data (scaled down since we're simulating a partial day)
      const avgDayVol = data.optionsAvgVol;
      // Scale: assume we're simulating about 2 hours of a 6.5-hour day
      const scaledAvg = avgDayVol * 0.3;
      const sizzle = scaledAvg > 0 ? todayVol / scaledAvg : 0;

      sizzleIndex[ticker] = {
        ticker,
        todayVolume: todayVol,
        avgVolume: avgDayVol,
        sizzle: parseFloat(Math.max(0.1, sizzle).toFixed(2)),
        isHot: sizzle > 1.5,
        isExtreme: sizzle > 3.0,
      };
    });

    return Object.values(sizzleIndex).sort((a, b) => b.sizzle - a.sizzle);
  }

  // --- Smart Money Alerts feed ---
  function getSmartMoneyAlerts(limit) {
    limit = limit || 10;
    return alerts.slice(-limit).reverse();
  }

  // --- Summary for Grey Sankore insights ---
  function generateInsightsSummary() {
    const summary = FlowEngine.getFlowSummary();
    const pcExtremes = getPCRatioExtremes().filter(e => e.signal !== 'neutral').slice(0, 3);
    const sizzle = calculateSizzleIndex().filter(s => s.isHot).slice(0, 3);
    const recentAlerts = getSmartMoneyAlerts(3);

    const insights = [];

    if (summary.netPremium > 0) {
      insights.push(`Net bullish flow: ${formatDollar(summary.netPremium)} call premium excess. ${summary.pcRatio}:1 call/put ratio.`);
    } else {
      insights.push(`Net bearish flow: ${formatDollar(Math.abs(summary.netPremium))} put premium excess.`);
    }

    if (summary.unusualCount > 5) {
      insights.push(`${summary.unusualCount} unusual activity flags detected today.`);
    }

    pcExtremes.forEach(e => {
      insights.push(`${e.ticker}: ${e.signal.replace('_', ' ')} P/C ratio at ${e.ratio}:1`);
    });

    sizzle.forEach(s => {
      insights.push(`${s.ticker} Sizzle Index at ${s.sizzle}x - ${s.isExtreme ? 'EXTREME' : 'elevated'} options activity`);
    });

    return insights;
  }

  // --- Dark pool analysis ---
  function analyzeDarkPool(print) {
    const detectedAlerts = [];

    if (print.sizeCategory === 'mega') {
      detectedAlerts.push({
        type: 'dark_pool_mega',
        severity: 'critical',
        ticker: print.ticker,
        message: `MEGA dark pool print: ${print.ticker} ${print.size.toLocaleString()} shares (${formatDollar(print.value)}) ${print.direction} spot at ${print.venue}`,
        premium: print.value,
        timestamp: print.timestamp,
      });
    } else if (print.pctADV > 0.5) {
      detectedAlerts.push({
        type: 'dark_pool_large_adv',
        severity: 'high',
        ticker: print.ticker,
        message: `Significant dark pool: ${print.ticker} ${print.pctADV}% of ADV at ${print.venue}`,
        premium: print.value,
        timestamp: print.timestamp,
      });
    }

    detectedAlerts.forEach(a => {
      a.id = Date.now() + Math.floor(Math.random() * 10000);
      alerts.push(a);
    });
    if (alerts.length > ALERT_MAX) alerts.splice(0, alerts.length - ALERT_MAX);

    return detectedAlerts;
  }

  // --- Helper ---
  function formatDollar(n) {
    if (n >= 1000000000) return '$' + (n / 1000000000).toFixed(1) + 'B';
    if (n >= 1000000) return '$' + (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return '$' + (n / 1000).toFixed(0) + 'K';
    return '$' + n.toFixed(0);
  }

  return {
    analyzeEntry,
    analyzeDarkPool,
    getNetPremiumWindows,
    getPCRatioExtremes,
    calculateSizzleIndex,
    getSmartMoneyAlerts,
    generateInsightsSummary,
    formatDollar,
  };

})();
