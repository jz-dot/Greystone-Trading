/* ============================================
   GREYSTONE TRADING PLATFORM - Market Data Service
   Client-side module for fetching live market data
   ============================================ */

const MarketData = (function () {
  // Symbols for index/metric cards (map display name to ticker)
  const INDEX_SYMBOLS = ['SPY', 'QQQ', 'DIA', 'IWM', '^VIX'];

  // Watchlist symbols (must match data-ticker attributes in HTML)
  const WATCHLIST_SYMBOLS = [
    'AAPL', 'NVDA', 'MSFT', 'AMZN', 'TSLA', 'META',
    'GOOGL', 'JPM', 'AMD', 'COIN', 'DIS', 'PLTR'
  ];

  // Mapping from index ETF tickers to metric card display labels
  const INDEX_LABEL_MAP = {
    'SPY': 'S&P 500',
    'QQQ': 'NASDAQ',
    'DIA': 'DOW',
    'IWM': 'IWM',
    '^VIX': 'VIX'
  };

  // Mapping for ticker display in the market ticker bar
  const TICKER_DISPLAY_MAP = {
    '^VIX': 'VIX'
  };

  let _isConnected = false;
  let _pollInterval = null;
  let _chartPollInterval = null;

  // ---- Public API ----

  async function init() {
    try {
      const quotes = await fetchBatchQuotes([...INDEX_SYMBOLS, ...WATCHLIST_SYMBOLS]);
      if (quotes && Object.keys(quotes).length > 0) {
        _isConnected = true;
        updateConnectionStatus(true);
        applyQuotesToDOM(quotes);
        startPolling();
        // Load real chart data for the default symbol
        await loadChartData('AAPL');
      } else {
        throw new Error('No quote data returned');
      }
    } catch (err) {
      console.warn('[MarketData] Live data unavailable, using simulated data:', err.message);
      _isConnected = false;
      updateConnectionStatus(false);
    }
  }

  function isConnected() {
    return _isConnected;
  }

  function destroy() {
    if (_pollInterval) clearInterval(_pollInterval);
    if (_chartPollInterval) clearInterval(_chartPollInterval);
    _pollInterval = null;
    _chartPollInterval = null;
  }

  // ---- Data Fetching ----

  async function fetchBatchQuotes(symbols) {
    const symbolStr = symbols.join(',');
    const resp = await fetch('/api/quotes?symbols=' + encodeURIComponent(symbolStr));
    if (!resp.ok) throw new Error('API returned ' + resp.status);
    const data = await resp.json();
    return data; // { AAPL: { price, change, changePct, volume, prevClose }, ... }
  }

  async function fetchChartData(symbol, interval, range) {
    interval = interval || '5m';
    range = range || '1d';
    const resp = await fetch('/api/chart/' + encodeURIComponent(symbol) + '?interval=' + interval + '&range=' + range);
    if (!resp.ok) throw new Error('Chart API returned ' + resp.status);
    return await resp.json(); // { candles: [{time, open, high, low, close, volume}, ...], meta: {} }
  }

  // ---- DOM Updates ----

  function applyQuotesToDOM(quotes) {
    updateWatchlist(quotes);
    updateMetricCards(quotes);
    updateMarketTicker(quotes);
  }

  function updateWatchlist(quotes) {
    WATCHLIST_SYMBOLS.forEach(function (sym) {
      const q = quotes[sym];
      if (!q) return;
      const row = document.querySelector('.wl-row[data-ticker="' + sym + '"]');
      if (!row) return;

      const priceEl = row.querySelector('.wl-price');
      const changeEl = row.querySelector('.wl-change');
      const volEl = row.querySelector('.wl-vol');

      if (priceEl) priceEl.textContent = q.price.toFixed(2);
      if (changeEl) {
        const pct = q.changePct;
        const isUp = pct >= 0;
        changeEl.textContent = (isUp ? '+' : '') + pct.toFixed(2) + '%';
        changeEl.className = 'wl-change ' + (isUp ? 'profit' : 'loss');
      }
      if (volEl && q.volume) {
        volEl.textContent = formatVolume(q.volume);
      }

      // Update row class
      row.classList.remove('profit', 'loss');
      row.classList.add(q.changePct >= 0 ? 'profit' : 'loss');
    });
  }

  function updateMetricCards(quotes) {
    // Map metric card labels to index symbols
    var cardMap = {};
    INDEX_SYMBOLS.forEach(function (sym) {
      var label = INDEX_LABEL_MAP[sym];
      if (label) cardMap[label] = sym;
    });

    document.querySelectorAll('.metric-card').forEach(function (card) {
      var labelEl = card.querySelector('.metric-label');
      if (!labelEl) return;
      var label = labelEl.textContent.trim();

      // Special handling: 10Y YIELD doesn't come from our API
      if (label === '10Y YIELD') return;

      var sym = cardMap[label];
      if (!sym) return;
      var q = quotes[sym];
      if (!q) return;

      var valueEl = card.querySelector('.metric-value');
      var badgeEl = card.querySelector('.metric-badge');

      if (valueEl) {
        // Format differently based on the symbol
        if (sym === '^VIX') {
          valueEl.textContent = q.price.toFixed(2);
        } else {
          // For index ETFs, show the price (not the full index value)
          valueEl.textContent = q.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
      }
      if (badgeEl) {
        var isUp = q.changePct >= 0;
        if (sym === '^VIX') {
          // VIX up = bad (loss color), VIX down = good (profit color)
          badgeEl.textContent = (isUp ? '+' : '') + q.changePct.toFixed(2) + '%';
          badgeEl.className = 'metric-badge ' + (isUp ? 'loss' : 'profit');
        } else {
          badgeEl.textContent = (isUp ? '+' : '') + q.changePct.toFixed(2) + '%';
          badgeEl.className = 'metric-badge ' + (isUp ? 'profit' : 'loss');
        }
      }
    });
  }

  function updateMarketTicker(quotes) {
    // Update existing ticker items that match our symbols
    var tickerItems = document.querySelectorAll('.ticker-item');
    tickerItems.forEach(function (item) {
      var symEl = item.querySelector('.ticker-sym');
      if (!symEl) return;
      var displaySym = symEl.textContent.trim();

      // Map display symbol back to API symbol
      var apiSym = displaySym;
      if (displaySym === 'VIX') apiSym = '^VIX';

      var q = quotes[apiSym];
      if (!q) return;

      var priceEl = item.querySelector('.ticker-price');
      var chgEl = item.querySelector('.ticker-chg');

      if (priceEl) {
        priceEl.textContent = q.price.toFixed(2);
      }
      if (chgEl) {
        var isUp = q.changePct >= 0;
        chgEl.textContent = (isUp ? '+' : '') + q.changePct.toFixed(2) + '%';
        chgEl.className = 'ticker-chg ' + (isUp ? 'profit' : 'loss');
      }
    });
  }

  function updateConnectionStatus(connected) {
    var statusDot = document.querySelector('.market-status .status-dot');
    var statusText = document.querySelector('.market-status .status-text');
    if (!statusDot || !statusText) return;

    if (connected) {
      var isMarketOpen = checkMarketHours();
      if (isMarketOpen) {
        statusDot.className = 'status-dot live';
        statusText.textContent = 'MARKET OPEN';
      } else {
        statusDot.className = 'status-dot closed';
        statusText.textContent = 'MARKET CLOSED';
      }
      // Add a subtle indicator that we're connected to live data
      statusText.title = 'Connected to live market data';
    } else {
      statusDot.className = 'status-dot simulated';
      statusText.textContent = 'SIMULATED';
      statusText.title = 'Using simulated data - start server for live quotes';
    }
  }

  function checkMarketHours() {
    var now = new Date();
    // Convert to ET (Eastern Time)
    var etStr = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
    var et = new Date(etStr);
    var day = et.getDay(); // 0=Sun, 6=Sat
    var hours = et.getHours();
    var minutes = et.getMinutes();
    var timeMinutes = hours * 60 + minutes;

    // Market open: Mon-Fri, 9:30 AM - 4:00 PM ET
    if (day === 0 || day === 6) return false;
    if (timeMinutes >= 570 && timeMinutes < 960) return true; // 9:30=570, 16:00=960
    return false;
  }

  // ---- Chart Integration ----

  async function loadChartData(symbol) {
    try {
      var data = await fetchChartData(symbol, '5m', '1d');
      if (data && data.candles && data.candles.length > 0) {
        drawLiveCandlestickChart(data.candles);
        drawLiveVolumeChart(data.candles);
      }
    } catch (err) {
      console.warn('[MarketData] Chart data unavailable:', err.message);
    }
  }

  function drawLiveCandlestickChart(candles) {
    var canvas = document.getElementById('chartCanvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    var padding = { top: 50, right: 60, bottom: 10, left: 10 };
    var chartW = canvas.width - padding.left - padding.right;
    var chartH = canvas.height - padding.top - padding.bottom;

    // Find min/max
    var min = Infinity, max = -Infinity;
    candles.forEach(function (c) {
      min = Math.min(min, c.low);
      max = Math.max(max, c.high);
    });
    var range = max - min;
    min -= range * 0.05;
    max += range * 0.05;

    var barWidth = chartW / candles.length;

    // Grid lines
    ctx.strokeStyle = '#1A1A24';
    ctx.lineWidth = 0.5;
    for (var i = 0; i <= 5; i++) {
      var y = padding.top + (chartH / 5) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(canvas.width - padding.right, y);
      ctx.stroke();

      var price = max - ((max - min) / 5) * i;
      ctx.fillStyle = '#5C5C6E';
      ctx.font = '10px JetBrains Mono';
      ctx.textAlign = 'left';
      ctx.fillText(price.toFixed(2), canvas.width - padding.right + 5, y + 3);
    }

    // SMA line (20-period)
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    var smaData = [];
    for (var i = 0; i < candles.length; i++) {
      var start = Math.max(0, i - 19);
      var slice = candles.slice(start, i + 1);
      var avg = slice.reduce(function (s, c) { return s + c.close; }, 0) / slice.length;
      smaData.push(avg);
      var x = padding.left + i * barWidth + barWidth / 2;
      var y = padding.top + ((max - avg) / (max - min)) * chartH;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Bollinger Bands
    ctx.strokeStyle = 'rgba(139, 92, 246, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var i = 0; i < candles.length; i++) {
      var x = padding.left + i * barWidth + barWidth / 2;
      var y = padding.top + ((max - (smaData[i] + range * 0.15)) / (max - min)) * chartH;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.beginPath();
    for (var i = 0; i < candles.length; i++) {
      var x = padding.left + i * barWidth + barWidth / 2;
      var y = padding.top + ((max - (smaData[i] - range * 0.15)) / (max - min)) * chartH;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Draw candles
    candles.forEach(function (c, i) {
      var x = padding.left + i * barWidth;
      var bullish = c.close >= c.open;
      var color = bullish ? '#10B981' : '#EF4444';

      var bodyTop = padding.top + ((max - Math.max(c.open, c.close)) / (max - min)) * chartH;
      var bodyBottom = padding.top + ((max - Math.min(c.open, c.close)) / (max - min)) * chartH;
      var wickTop = padding.top + ((max - c.high) / (max - min)) * chartH;
      var wickBottom = padding.top + ((max - c.low) / (max - min)) * chartH;

      // Wick
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + barWidth / 2, wickTop);
      ctx.lineTo(x + barWidth / 2, wickBottom);
      ctx.stroke();

      // Body
      ctx.fillStyle = bullish ? 'rgba(16, 185, 129, 0.8)' : 'rgba(239, 68, 68, 0.8)';
      var bodyH = Math.max(1, bodyBottom - bodyTop);
      ctx.fillRect(x + 2, bodyTop, barWidth - 4, bodyH);
    });

    // Current price line
    var lastClose = candles[candles.length - 1].close;
    var priceY = padding.top + ((max - lastClose) / (max - min)) * chartH;
    ctx.strokeStyle = '#10B981';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padding.left, priceY);
    ctx.lineTo(canvas.width - padding.right, priceY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Price label
    ctx.fillStyle = '#10B981';
    ctx.fillRect(canvas.width - padding.right, priceY - 9, 56, 18);
    ctx.fillStyle = '#0D0D12';
    ctx.font = 'bold 10px JetBrains Mono';
    ctx.textAlign = 'left';
    ctx.fillText(lastClose.toFixed(2), canvas.width - padding.right + 4, priceY + 3);
  }

  function drawLiveVolumeChart(candles) {
    var canvas = document.getElementById('volumeCanvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    var maxVol = 0;
    candles.forEach(function (c) { maxVol = Math.max(maxVol, c.volume || 0); });
    if (maxVol === 0) return;

    var barWidth = canvas.width / candles.length;
    candles.forEach(function (c, i) {
      var bullish = c.close >= c.open;
      ctx.fillStyle = bullish ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)';
      var h = ((c.volume || 0) / maxVol) * canvas.height;
      ctx.fillRect(i * barWidth + 1, canvas.height - h, barWidth - 2, h);
    });
  }

  // ---- Polling ----

  function startPolling() {
    // Poll quotes every 15 seconds
    _pollInterval = setInterval(async function () {
      try {
        var quotes = await fetchBatchQuotes([...INDEX_SYMBOLS, ...WATCHLIST_SYMBOLS]);
        if (quotes && Object.keys(quotes).length > 0) {
          applyQuotesToDOM(quotes);
          if (!_isConnected) {
            _isConnected = true;
            updateConnectionStatus(true);
          }
        }
      } catch (err) {
        console.warn('[MarketData] Poll failed:', err.message);
        if (_isConnected) {
          _isConnected = false;
          updateConnectionStatus(false);
        }
      }
    }, 15000);

    // Poll chart data every 60 seconds
    _chartPollInterval = setInterval(function () {
      loadChartData('AAPL');
    }, 60000);

    // Also update market status every minute (for open/close transitions)
    setInterval(function () {
      if (_isConnected) updateConnectionStatus(true);
    }, 60000);
  }

  // ---- Utilities ----

  function formatVolume(vol) {
    if (vol >= 1000000000) return (vol / 1000000000).toFixed(1) + 'B';
    if (vol >= 1000000) return (vol / 1000000).toFixed(1) + 'M';
    if (vol >= 1000) return (vol / 1000).toFixed(1) + 'K';
    return vol.toString();
  }

  // ---- Public Interface ----
  return {
    init: init,
    isConnected: isConnected,
    destroy: destroy,
    fetchBatchQuotes: fetchBatchQuotes,
    fetchChartData: fetchChartData,
    loadChartData: loadChartData,
    checkMarketHours: checkMarketHours
  };
})();
