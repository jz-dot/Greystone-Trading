/* ============================================
   GREYSTONE TRADING PLATFORM - Core Engine
   ============================================ */

// ---- LANDING PAGE ----
(function initLanding() {
  const landing = document.getElementById('landing');
  const loadingScreen = document.getElementById('loadingScreen');
  const enterBtn = document.getElementById('enterPlatform');
  if (!landing || !enterBtn) return;

  // Spawn floating particles
  const particleContainer = document.getElementById('landingParticles');
  if (particleContainer) {
    for (let i = 0; i < 50; i++) {
      const p = document.createElement('div');
      p.className = 'landing-particle';
      p.style.left = Math.random() * 100 + '%';
      p.style.animationDelay = Math.random() * 7 + 's';
      p.style.animationDuration = (5 + Math.random() * 5) + 's';
      particleContainer.appendChild(p);
    }
  }

  // Landing stat tiles are static, honest capability labels (no fabricated
  // metrics), so there is no counter to animate here.

  // Returning users with a restored session skip the landing and the scripted
  // loading sequence entirely (theatre on visit one, friction on visit fifty).
  window.gsSkipSplash = function () {
    if (landing && document.body.contains(landing)) { landing.classList.add('hidden'); setTimeout(() => landing.remove(), 100); }
    if (loadingScreen && document.body.contains(loadingScreen)) loadingScreen.remove();
  };

  enterBtn.addEventListener('click', () => {
    landing.classList.add('hidden');
    if (loadingScreen) {
      loadingScreen.classList.add('active');
      const fill = document.getElementById('loadingBarFill');
      const status = document.getElementById('loadingStatus');
      const steps = [
        { pct: 15, text: 'Connecting to market feeds...' },
        { pct: 35, text: 'Loading options chain data...' },
        { pct: 55, text: 'Initializing Grey Sankore AI...' },
        { pct: 75, text: 'Calibrating trading agents...' },
        { pct: 90, text: 'Syncing portfolio positions...' },
        { pct: 100, text: 'Ready.' },
      ];
      let i = 0;
      function nextStep() {
        if (i >= steps.length) {
          setTimeout(() => {
            loadingScreen.style.transition = 'opacity 0.4s ease';
            loadingScreen.style.opacity = '0';
            setTimeout(() => loadingScreen.remove(), 400);
          }, 300);
          return;
        }
        if (fill) fill.style.width = steps[i].pct + '%';
        if (status) status.textContent = steps[i].text;
        i++;
        setTimeout(nextStep, 350 + Math.random() * 200);
      }
      setTimeout(nextStep, 200);
    }
    setTimeout(() => landing.remove(), 700);
  });
})();

// ---- NAVIGATION ----
let optionsChainLoaded = false;
document.querySelectorAll('.nav-btn[data-view]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const view = document.getElementById('view-' + btn.dataset.view);
    if (view) view.classList.add('active');

    // Auto-load options chain when navigating to Options view
    if (btn.dataset.view === 'options' && !optionsChainLoaded) {
      optionsChainLoaded = true;
      if (typeof populateOptionsChain === 'function') populateOptionsChain();
    }
  });
});

// Keyboard shortcuts for view switching
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  const viewMap = { '1': 'dashboard', '2': 'portfolio', '3': 'options', '4': 'greysankore', '5': 'flow', '6': 'agents', '7': 'journal', '8': 'risk' };
  if (viewMap[e.key]) {
    const btn = document.querySelector(`[data-view="${viewMap[e.key]}"]`);
    if (btn) btn.click();
  }
  if (e.key === '?' || (e.key === '/' && !e.ctrlKey)) {
    document.getElementById('kbdOverlay').classList.toggle('active');
  }
  if (e.key === 'Escape') {
    document.getElementById('kbdOverlay').classList.remove('active');
  }
  if (e.ctrlKey && e.key === 'k') {
    e.preventDefault();
    document.getElementById('tickerSearch').focus();
  }
  if (e.ctrlKey && e.key === 'g') {
    e.preventDefault();
    document.querySelector('[data-view="greysankore"]').click();
    setTimeout(() => document.getElementById('gsChatInput').focus(), 100);
  }
});

// ---- CLOCK ----
function updateClock() {
  const now = new Date();
  const opts = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
  document.getElementById('clockDisplay').textContent = now.toLocaleTimeString('en-US', opts) + ' ET';
}
setInterval(updateClock, 1000);
updateClock();

// ---- MARKET TICKER ----
const TICKER_TAPE_SYMBOLS = [
  { sym: 'SPY', label: 'SPY' },
  { sym: 'QQQ', label: 'QQQ' },
  { sym: 'DIA', label: 'DIA' },
  { sym: 'IWM', label: 'IWM' },
  { sym: '^GSPTSE', label: 'TSX' },
  { sym: '^JN0U.TO', label: 'TSX-V' },
  { sym: '^VIX', label: 'VIX' },
  { sym: 'GLD', label: 'GLD' },
  { sym: 'TLT', label: 'TLT' },
  { sym: 'BTC-USD', label: 'BTC' },
  { sym: 'ETH-USD', label: 'ETH' },
  { sym: 'CADUSD=X', label: 'CAD/USD' },
  { sym: 'USDCAD=X', label: 'USD/CAD' },
  { sym: 'EURUSD=X', label: 'EUR/USD' },
  { sym: 'CL=F', label: 'OIL' },
  { sym: 'GC=F', label: 'GOLD' },
];

const tickerEl = document.getElementById('marketTicker');
const tickerInner = document.createElement('div');
tickerInner.className = 'topbar-ticker-inner';

function buildTickerTape(data) {
  tickerInner.innerHTML = '';
  const items = [...data, ...data]; // duplicate for seamless scroll
  items.forEach(t => {
    const item = document.createElement('div');
    item.className = 'ticker-item';
    item.innerHTML = '<span class="ticker-sym">' + t.label + '</span><span class="ticker-price">' + t.price + '</span><span class="ticker-chg ' + t.dir + '">' + t.chg + '</span>';
    tickerInner.appendChild(item);
  });
}

// Render placeholder tape immediately
buildTickerTape(TICKER_TAPE_SYMBOLS.map(t => ({ label: t.label, price: '--', chg: '--', dir: '' })));
tickerEl.appendChild(tickerInner);

// Fetch live ticker tape data
async function refreshTickerTape() {
  try {
    const symbols = TICKER_TAPE_SYMBOLS.map(t => t.sym).join(',');
    const resp = await fetch('/api/quotes?symbols=' + encodeURIComponent(symbols));
    if (!resp.ok) return;
    const quotes = await resp.json();
    const tapeData = TICKER_TAPE_SYMBOLS.map(t => {
      const q = quotes[t.sym] || quotes[t.sym.toUpperCase()] || {};
      const price = q.price != null ? (Math.abs(q.price) < 10 ? q.price.toFixed(4) : q.price >= 1000 ? q.price.toLocaleString('en-US', {maximumFractionDigits: 0}) : q.price.toFixed(2)) : '--';
      const chgPct = q.changePct != null ? (q.changePct >= 0 ? '+' : '') + q.changePct.toFixed(2) + '%' : '--';
      const dir = q.changePct != null ? (q.changePct >= 0 ? 'profit' : 'loss') : '';
      return { label: t.label, price: price, chg: chgPct, dir: dir };
    });
    buildTickerTape(tapeData);
  } catch (e) {
    console.warn('[Ticker] Tape refresh failed:', e.message);
  }
}
refreshTickerTape();
setInterval(refreshTickerTape, 30000);

// ---- CAP SIZE TOGGLE ----
document.querySelectorAll('.cap-toggle').forEach(group => {
  group.querySelectorAll('.cap-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      group.querySelectorAll('.cap-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
});

// ---- CANDLESTICK CHART ----
function drawCandlestickChart() {
  const canvas = document.getElementById('chartCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;

  const candles = generateCandleData(80, 224, 228);
  const padding = { top: 50, right: 60, bottom: 10, left: 10 };
  const chartW = canvas.width - padding.left - padding.right;
  const chartH = canvas.height - padding.top - padding.bottom;

  // Find min/max
  let min = Infinity, max = -Infinity;
  candles.forEach(c => { min = Math.min(min, c.low); max = Math.max(max, c.high); });
  const range = max - min;
  min -= range * 0.05;
  max += range * 0.05;

  const barWidth = chartW / candles.length;

  // Grid lines
  ctx.strokeStyle = '#1A1A24';
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= 5; i++) {
    const y = padding.top + (chartH / 5) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(canvas.width - padding.right, y);
    ctx.stroke();

    const price = max - ((max - min) / 5) * i;
    ctx.fillStyle = '#5C5C6E';
    ctx.font = '10px JetBrains Mono';
    ctx.textAlign = 'left';
    ctx.fillText(price.toFixed(2), canvas.width - padding.right + 5, y + 3);
  }

  // SMA line
  ctx.strokeStyle = 'rgba(59, 130, 246, 0.5)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  const smaData = [];
  for (let i = 0; i < candles.length; i++) {
    const start = Math.max(0, i - 19);
    const slice = candles.slice(start, i + 1);
    const avg = slice.reduce((s, c) => s + c.close, 0) / slice.length;
    smaData.push(avg);
    const x = padding.left + i * barWidth + barWidth / 2;
    const y = padding.top + ((max - avg) / (max - min)) * chartH;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Bollinger Bands (simplified)
  ctx.strokeStyle = 'rgba(139, 92, 246, 0.2)';
  ctx.lineWidth = 1;
  // Upper band
  ctx.beginPath();
  for (let i = 0; i < candles.length; i++) {
    const x = padding.left + i * barWidth + barWidth / 2;
    const y = padding.top + ((max - (smaData[i] + range * 0.15)) / (max - min)) * chartH;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  // Lower band
  ctx.beginPath();
  for (let i = 0; i < candles.length; i++) {
    const x = padding.left + i * barWidth + barWidth / 2;
    const y = padding.top + ((max - (smaData[i] - range * 0.15)) / (max - min)) * chartH;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Draw candles
  candles.forEach((c, i) => {
    const x = padding.left + i * barWidth;
    const bullish = c.close >= c.open;
    const color = bullish ? '#10B981' : '#EF4444';

    const bodyTop = padding.top + ((max - Math.max(c.open, c.close)) / (max - min)) * chartH;
    const bodyBottom = padding.top + ((max - Math.min(c.open, c.close)) / (max - min)) * chartH;
    const wickTop = padding.top + ((max - c.high) / (max - min)) * chartH;
    const wickBottom = padding.top + ((max - c.low) / (max - min)) * chartH;

    // Wick
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + barWidth / 2, wickTop);
    ctx.lineTo(x + barWidth / 2, wickBottom);
    ctx.stroke();

    // Body
    ctx.fillStyle = bullish ? 'rgba(16, 185, 129, 0.8)' : 'rgba(239, 68, 68, 0.8)';
    const bodyH = Math.max(1, bodyBottom - bodyTop);
    ctx.fillRect(x + 2, bodyTop, barWidth - 4, bodyH);
  });

  // Current price line
  const lastClose = candles[candles.length - 1].close;
  const priceY = padding.top + ((max - lastClose) / (max - min)) * chartH;
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

function generateCandleData(count, startPrice, endPrice) {
  const candles = [];
  let price = startPrice;
  const trend = (endPrice - startPrice) / count;
  // Generate timestamps: 5-min intervals ending at now
  const now = Math.floor(Date.now() / 1000);
  const intervalSec = 5 * 60;
  const startTime = now - (count * intervalSec);

  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.45) * 2.5 + trend;
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) + Math.random() * 1.5;
    const low = Math.min(open, close) - Math.random() * 1.5;
    candles.push({ time: startTime + (i * intervalSec), open, close, high, low, volume: Math.random() * 5000000 + 1000000 });
    price = close;
  }
  return candles;
}

// ---- VOLUME CHART ----
function drawVolumeChart() {
  const canvas = document.getElementById('volumeCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;

  const bars = 80;
  const barWidth = canvas.width / bars;

  for (let i = 0; i < bars; i++) {
    const vol = Math.random() * 0.7 + 0.1;
    const bullish = Math.random() > 0.45;
    ctx.fillStyle = bullish ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)';
    const h = vol * canvas.height;
    ctx.fillRect(i * barWidth + 1, canvas.height - h, barWidth - 2, h);
  }
}

// ---- OPTIONS CHAIN ENGINE (Real Data) ----

// Global options state
const optionsState = {
  symbol: 'AAPL',
  currentChain: null,
  selectedExpiration: null,
  selectedContract: null,   // { type: 'call'|'put', strike, data }
  strategyLegs: [],         // for strategy builder
  isLoading: false,
};

function formatK(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toString();
}

function formatDollar(n) {
  if (Math.abs(n) >= 1000000) return '$' + (n / 1000000).toFixed(1) + 'M';
  if (Math.abs(n) >= 1000) return '$' + (n / 1000).toFixed(1) + 'K';
  return '$' + n.toFixed(2);
}

/**
 * Decide whether a rendered options chain is simulated/generated rather than
 * real market data. The client falls back to a generated chain whenever the
 * options API is unavailable. Real Yahoo data carries a `raw` summary block;
 * the generated fallback carries a `stats` block and no `raw`. If a `source`
 * flag is ever provided we honour it. Default to "simulated" when unsure so we
 * never present generated data as if it were real.
 */
function isChainSimulated(chain) {
  if (!chain) return true;
  if (chain.source) {
    return /sim|mock|sample|fallback|generated/i.test(String(chain.source));
  }
  if (chain.raw) return false;
  if (chain.stats) return true;
  return true;
}

/** Show or hide the persistent "Simulated Chain" badge in the options header. */
function setOptionsDataBadge(simulated) {
  var badge = document.getElementById('optionsDataBadge');
  if (!badge) return;
  badge.style.display = simulated ? 'inline-block' : 'none';
}

/**
 * Main entry: load options chain for current symbol/expiration
 */
async function populateOptionsChain() {
  const callsBody = document.getElementById('callsChain');
  const putsBody = document.getElementById('putsChain');
  const strikeCol = document.getElementById('strikeColumn');
  if (!callsBody || !putsBody || !strikeCol) return;

  if (optionsState.isLoading) return;
  optionsState.isLoading = true;

  // Show loading state
  callsBody.innerHTML = '<tr><td colspan="11" class="options-loading">Loading options chain...</td></tr>';
  putsBody.innerHTML = '<tr><td colspan="11" class="options-loading"></td></tr>';

  try {
    // Load expirations first if needed
    await loadExpirations(optionsState.symbol);

    // Fetch chain data
    const chain = await OptionsData.getOptionsChain(
      optionsState.symbol,
      optionsState.selectedExpiration
    );
    optionsState.currentChain = chain;

    // Persistent honesty badge: mark generated chains as simulated.
    setOptionsDataBadge(isChainSimulated(chain));

    // Clear old data
    callsBody.innerHTML = '';
    putsBody.innerHTML = '';
    // Keep the "Strike" header, remove old strike rows
    const existingStrikes = strikeCol.querySelectorAll('.strike-row');
    existingStrikes.forEach(s => s.remove());

    // Update subtitle
    const subtitle = document.getElementById('optionsSubtitle');
    if (subtitle) subtitle.textContent = `${chain.symbol} - $${chain.spotPrice.toFixed(2)}`;

    // Update stats bar
    updateOptionsStats(chain);

    const spot = chain.spotPrice;
    const calls = chain.calls || [];
    const puts = chain.puts || [];

    // Build strike-indexed maps
    const callMap = {};
    const putMap = {};
    calls.forEach(c => { callMap[c.strike] = c; });
    puts.forEach(p => { putMap[p.strike] = p; });

    // Collect all strikes
    const allStrikes = new Set();
    calls.forEach(c => allStrikes.add(c.strike));
    puts.forEach(p => allStrikes.add(p.strike));
    const strikes = Array.from(allStrikes).sort((a, b) => a - b);

    // Find ATM strike (closest to spot)
    let atmStrike = strikes[0];
    let minDist = Infinity;
    strikes.forEach(s => {
      const dist = Math.abs(s - spot);
      if (dist < minDist) { minDist = dist; atmStrike = s; }
    });

    // Determine strike step for ATM threshold
    const strikeStep = strikes.length > 1 ? strikes[1] - strikes[0] : 1;

    strikes.forEach(strike => {
      const isATM = Math.abs(strike - spot) <= strikeStep * 0.6;
      const callITM = strike < spot;
      const putITM = strike > spot;

      const call = callMap[strike] || {};
      const put = putMap[strike] || {};
      const cg = call.calculatedGreeks || {};
      const pg = put.calculatedGreeks || {};

      // Call row
      const callRow = document.createElement('tr');
      if (isATM) callRow.className = 'atm-row';
      else if (callITM) callRow.className = 'itm';
      else callRow.className = 'otm';

      callRow.dataset.strike = strike;
      callRow.dataset.type = 'call';
      callRow.innerHTML = `
        <td class="highlight">${(call.last || 0).toFixed(2)}</td>
        <td style="color: ${(call.change || 0) >= 0 ? 'var(--profit)' : 'var(--loss)'}">${(call.change || 0) >= 0 ? '+' : ''}${(call.change || 0).toFixed(2)}</td>
        <td>${(call.bid || 0).toFixed(2)}</td>
        <td>${(call.ask || 0).toFixed(2)}</td>
        <td>${formatK(call.volume || 0)}</td>
        <td>${formatK(call.openInterest || 0)}</td>
        <td>${((call.impliedVolatility || 0) * 100).toFixed(1)}%</td>
        <td class="greek">${(cg.delta || 0).toFixed(3)}</td>
        <td class="greek">${(cg.gamma || 0).toFixed(4)}</td>
        <td class="greek" style="color: var(--loss)">${(cg.theta || 0).toFixed(3)}</td>
        <td class="greek">${(cg.vega || 0).toFixed(3)}</td>
      `;
      callRow.addEventListener('click', () => selectContract('call', strike, call));
      callsBody.appendChild(callRow);

      // Strike column
      const strikeDiv = document.createElement('div');
      strikeDiv.className = 'strike-row' + (isATM ? ' atm' : '');
      strikeDiv.textContent = strike.toFixed(strike % 1 === 0 ? 0 : 1);
      strikeCol.appendChild(strikeDiv);

      // Put row
      const putRow = document.createElement('tr');
      if (isATM) putRow.className = 'atm-row';
      else if (putITM) putRow.className = 'itm';
      else putRow.className = 'otm';

      putRow.dataset.strike = strike;
      putRow.dataset.type = 'put';
      putRow.innerHTML = `
        <td class="greek">${(pg.vega || 0).toFixed(3)}</td>
        <td class="greek" style="color: var(--loss)">${(pg.theta || 0).toFixed(3)}</td>
        <td class="greek">${(pg.gamma || 0).toFixed(4)}</td>
        <td class="greek">${(pg.delta || 0).toFixed(3)}</td>
        <td>${((put.impliedVolatility || 0) * 100).toFixed(1)}%</td>
        <td>${formatK(put.openInterest || 0)}</td>
        <td>${formatK(put.volume || 0)}</td>
        <td>${(put.ask || 0).toFixed(2)}</td>
        <td>${(put.bid || 0).toFixed(2)}</td>
        <td style="color: ${(put.change || 0) >= 0 ? 'var(--profit)' : 'var(--loss)'}">${(put.change || 0) >= 0 ? '+' : ''}${(put.change || 0).toFixed(2)}</td>
        <td class="highlight">${(put.last || 0).toFixed(2)}</td>
      `;
      putRow.addEventListener('click', () => selectContract('put', strike, put));
      putsBody.appendChild(putRow);
    });

    // Scroll to ATM row
    const atmRow = callsBody.querySelector('.atm-row');
    if (atmRow) {
      setTimeout(() => atmRow.scrollIntoView({ block: 'center', behavior: 'smooth' }), 100);
    }

    // Draw default P&L (ATM call)
    const atmCall = callMap[atmStrike];
    if (atmCall) {
      selectContract('call', atmStrike, atmCall);
    }

  } catch (err) {
    console.error('Failed to populate options chain:', err);
    setOptionsDataBadge(true);
    callsBody.innerHTML = '<tr><td colspan="11" style="color: var(--loss); padding: 20px;">Failed to load data. Showing simulated chain.</td></tr>';
  } finally {
    optionsState.isLoading = false;
  }
}

/**
 * Load expiration dates into the dropdown
 */
async function loadExpirations(symbol) {
  const select = document.getElementById('optExpirySelect');
  if (!select) return;

  try {
    const exps = await OptionsData.getExpirations(symbol);
    select.innerHTML = '';
    exps.forEach((exp, i) => {
      const opt = document.createElement('option');
      opt.value = exp.timestamp;
      opt.textContent = `${exp.date} (${exp.dte}d)`;
      if (i === 2) opt.selected = true; // Default to ~3rd expiration
      select.appendChild(opt);
    });

    // Set selected expiration
    if (!optionsState.selectedExpiration && exps.length > 2) {
      optionsState.selectedExpiration = exps[2].timestamp;
    }
  } catch (err) {
    console.warn('Failed to load expirations:', err);
  }
}

/**
 * Update the options stats bar
 */
function updateOptionsStats(chain) {
  if (!chain || !chain.stats) return;
  const s = chain.stats;
  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  setEl('statIVRank', s.ivRank ? s.ivRank.toFixed(1) + '%' : '--');
  setEl('statIVPctile', s.ivPercentile ? s.ivPercentile.toFixed(1) + '%' : '--');
  setEl('statPCRatio', s.putCallRatio ? s.putCallRatio.toFixed(2) : '--');
  setEl('statExpMove', s.expectedMove ? '+/- $' + s.expectedMove.toFixed(2) : '--');
  setEl('statTotalOI', formatK((s.totalCallOI || 0) + (s.totalPutOI || 0)));
  setEl('statTotalVol', formatK((s.totalCallVolume || 0) + (s.totalPutVolume || 0)));
  setEl('statSizzle', s.sizzleIndex ? s.sizzleIndex.toFixed(1) + 'x' : '--');
}

/**
 * Handle contract selection in the chain
 */
function selectContract(type, strike, contractData) {
  const chain = optionsState.currentChain;
  if (!chain) return;

  optionsState.selectedContract = { type, strike, data: contractData };

  // Highlight selected row
  document.querySelectorAll('#callsChain tr, #putsChain tr').forEach(r => r.classList.remove('selected'));
  const table = type === 'call' ? 'callsChain' : 'putsChain';
  const rows = document.querySelectorAll(`#${table} tr`);
  rows.forEach(r => {
    if (parseFloat(r.dataset.strike) === strike) r.classList.add('selected');
  });

  // Update Greeks panel
  const greeks = contractData.calculatedGreeks || {};
  updateGreeksPanel(greeks, type);

  // Update P&L chart for this contract
  const premium = contractData.last || contractData.ask || 0;
  const legs = [{ type, strike, premium, quantity: 1, side: 'long' }];
  const spot = chain.spotPrice;

  drawPnLChart(legs, spot, {
    name: `Long ${type === 'call' ? 'Call' : 'Put'} $${strike}`,
    cost: `Debit: $${premium.toFixed(2)}`,
    dte: contractData.dte || 18,
  });
}

/**
 * Update the Greeks display panel
 */
function updateGreeksPanel(greeks, type) {
  const setGreek = (id, val, gaugeId, gaugeMax) => {
    const el = document.getElementById(id);
    const gauge = document.getElementById(gaugeId);
    if (el) {
      el.textContent = val.toFixed(val < 1 && val > -1 ? 3 : 2);
      if (val < 0) el.className = 'greek-value loss';
      else el.className = 'greek-value';
    }
    if (gauge) {
      gauge.style.width = Math.min(100, Math.abs(val / gaugeMax) * 100) + '%';
    }
  };

  setGreek('greekDelta', greeks.delta || 0, 'greekDeltaGauge', 1);
  setGreek('greekGamma', greeks.gamma || 0, 'greekGammaGauge', 0.05);
  setGreek('greekTheta', greeks.theta || 0, 'greekThetaGauge', 0.5);
  setGreek('greekVega', greeks.vega || 0, 'greekVegaGauge', 0.5);
  setGreek('greekRho', greeks.rho || 0, 'greekRhoGauge', 0.5);
}

// ---- P&L CHART (Data-Driven) ----

/**
 * Draw P&L chart for given strategy legs
 * @param {Array} legs - strategy legs
 * @param {number} spotPrice - current spot price
 * @param {object} info - { name, cost, dte }
 */
function drawPnLChart(legs, spotPrice, info) {
  const canvas = document.getElementById('pnlCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;

  if (!legs || legs.length === 0) {
    // Default display
    legs = [{ type: 'call', strike: 230, premium: 4.85, quantity: 1, side: 'long' }];
    spotPrice = spotPrice || 227.48;
    info = info || { name: 'Long Call $230', cost: 'Debit: $4.85', dte: 18 };
  }

  // Compute price range: 15% around spot, centered
  const range = spotPrice * 0.15;
  const minPrice = spotPrice - range;
  const maxPrice = spotPrice + range;

  // Calculate P&L using OptionsData
  const pnlData = OptionsData.calculatePnL(legs, {
    minPrice, maxPrice, points: 300, spotPrice
  });

  // Update info labels
  const nameEl = document.getElementById('pnlStratName');
  const costEl = document.getElementById('pnlStratCost');
  if (nameEl && info) nameEl.textContent = info.name || '';
  if (costEl && info) costEl.textContent = info.cost || '';

  // Update stats
  const maxProfitEl = document.getElementById('pnlMaxProfit');
  const maxLossEl = document.getElementById('pnlMaxLoss');
  const breakevenEl = document.getElementById('pnlBreakeven');
  const dteEl = document.getElementById('pnlDTE');
  const probProfitEl = document.getElementById('pnlProbProfit');

  if (maxProfitEl) {
    if (pnlData.maxProfit > 100000) maxProfitEl.textContent = 'Unlimited';
    else maxProfitEl.textContent = formatDollar(pnlData.maxProfit);
    maxProfitEl.className = 'pnl-stat-value profit';
  }
  if (maxLossEl) {
    if (pnlData.maxLoss < -100000) maxLossEl.textContent = 'Unlimited';
    else maxLossEl.textContent = '-' + formatDollar(Math.abs(pnlData.maxLoss));
    maxLossEl.className = 'pnl-stat-value loss';
  }
  if (breakevenEl) {
    breakevenEl.textContent = pnlData.breakevens.map(b => '$' + b.toFixed(2)).join(', ') || '--';
  }
  if (dteEl && info) dteEl.textContent = info.dte || '--';

  // Estimate probability of profit (using normal distribution if we have IV)
  if (probProfitEl && pnlData.breakevens.length > 0 && optionsState.currentChain) {
    const chain = optionsState.currentChain;
    const avgIV = chain.stats ? chain.stats.avgIV : 0.30;
    const dte = info.dte || 18;
    const sqrtT = Math.sqrt(dte / 365);
    let probProfit = 0;
    if (pnlData.breakevens.length === 1) {
      const be = pnlData.breakevens[0];
      const lastPnl = pnlData.pnl[pnlData.pnl.length - 1];
      const d = Math.log(spotPrice / be) / (avgIV * sqrtT);
      if (lastPnl > 0) {
        probProfit = BlackScholes.normalCDF(d) * 100;
      } else {
        probProfit = (1 - BlackScholes.normalCDF(d)) * 100;
      }
    } else if (pnlData.breakevens.length === 2) {
      const be1 = pnlData.breakevens[0];
      const be2 = pnlData.breakevens[1];
      const midPnl = pnlData.pnl[Math.floor(pnlData.pnl.length / 2)];
      const d1 = Math.log(spotPrice / be1) / (avgIV * sqrtT);
      const d2 = Math.log(spotPrice / be2) / (avgIV * sqrtT);
      if (midPnl > 0) {
        probProfit = (BlackScholes.normalCDF(d1) - BlackScholes.normalCDF(d2)) * 100;
      } else {
        probProfit = (1 - BlackScholes.normalCDF(d1) + BlackScholes.normalCDF(d2)) * 100;
      }
    }
    probProfitEl.textContent = Math.abs(probProfit).toFixed(1) + '%';
  }

  // ---- DRAW THE CHART ----
  const padding = { top: 20, right: 40, bottom: 30, left: 55 };
  const w = canvas.width - padding.left - padding.right;
  const h = canvas.height - padding.top - padding.bottom;

  const pnlValues = pnlData.pnl;
  const displayMax = Math.min(pnlData.maxProfit, Math.abs(pnlData.maxLoss) * 5);
  const displayMin = Math.max(pnlData.maxLoss, -Math.abs(pnlData.maxProfit) * 5);
  const pnlMax = displayMax * 1.1;
  const pnlMin = displayMin * 1.1;
  const pnlRange = pnlMax - pnlMin;

  const zeroY = padding.top + ((pnlMax - 0) / pnlRange) * h;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Grid lines
  ctx.strokeStyle = '#1A1A24';
  ctx.lineWidth = 0.5;
  const gridSteps = 5;
  for (let i = 0; i <= gridSteps; i++) {
    const y = padding.top + (h / gridSteps) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + w, y);
    ctx.stroke();

    const val = pnlMax - (pnlRange / gridSteps) * i;
    ctx.fillStyle = '#5C5C6E';
    ctx.font = '10px JetBrains Mono';
    ctx.textAlign = 'right';
    ctx.fillText(formatDollar(val), padding.left - 5, y + 3);
  }

  // Zero line (emphasized)
  if (zeroY >= padding.top && zeroY <= padding.top + h) {
    ctx.strokeStyle = '#2A2A38';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, zeroY);
    ctx.lineTo(padding.left + w, zeroY);
    ctx.stroke();
    ctx.fillStyle = '#5C5C6E';
    ctx.textAlign = 'right';
    ctx.fillText('$0', padding.left - 5, zeroY + 3);
  }

  // Price axis labels
  ctx.fillStyle = '#5C5C6E';
  ctx.font = '10px JetBrains Mono';
  ctx.textAlign = 'center';
  const priceStep = (maxPrice - minPrice) / 6;
  for (let p = minPrice; p <= maxPrice; p += priceStep) {
    const x = padding.left + ((p - minPrice) / (maxPrice - minPrice)) * w;
    ctx.fillText('$' + p.toFixed(0), x, canvas.height - padding.bottom + 15);
  }

  // Build point array
  const points = [];
  for (let i = 0; i < pnlData.prices.length; i++) {
    const price = pnlData.prices[i];
    const pnl = Math.max(pnlMin, Math.min(pnlMax, pnlValues[i]));
    const x = padding.left + ((price - minPrice) / (maxPrice - minPrice)) * w;
    const y = padding.top + ((pnlMax - pnl) / pnlRange) * h;
    points.push({ x, y, pnl: pnlValues[i], price });
  }

  // Fill profit area (green)
  ctx.beginPath();
  let inProfit = false;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const clampedY = Math.max(padding.top, Math.min(padding.top + h, p.y));
    const effectiveZeroY = Math.max(padding.top, Math.min(padding.top + h, zeroY));

    if (p.pnl > 0) {
      if (!inProfit) {
        ctx.moveTo(p.x, effectiveZeroY);
        inProfit = true;
      }
      ctx.lineTo(p.x, clampedY);
    } else if (inProfit) {
      ctx.lineTo(p.x, effectiveZeroY);
      ctx.closePath();
      ctx.fillStyle = 'rgba(16, 185, 129, 0.12)';
      ctx.fill();
      ctx.beginPath();
      inProfit = false;
    }
  }
  if (inProfit) {
    const effectiveZeroY = Math.max(padding.top, Math.min(padding.top + h, zeroY));
    ctx.lineTo(points[points.length - 1].x, effectiveZeroY);
    ctx.closePath();
    ctx.fillStyle = 'rgba(16, 185, 129, 0.12)';
    ctx.fill();
  }

  // Fill loss area (red)
  ctx.beginPath();
  let inLoss = false;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const clampedY = Math.max(padding.top, Math.min(padding.top + h, p.y));
    const effectiveZeroY = Math.max(padding.top, Math.min(padding.top + h, zeroY));

    if (p.pnl < 0) {
      if (!inLoss) {
        ctx.moveTo(p.x, effectiveZeroY);
        inLoss = true;
      }
      ctx.lineTo(p.x, clampedY);
    } else if (inLoss) {
      ctx.lineTo(p.x, effectiveZeroY);
      ctx.closePath();
      ctx.fillStyle = 'rgba(239, 68, 68, 0.12)';
      ctx.fill();
      ctx.beginPath();
      inLoss = false;
    }
  }
  if (inLoss) {
    const effectiveZeroY = Math.max(padding.top, Math.min(padding.top + h, zeroY));
    ctx.lineTo(points[points.length - 1].x, effectiveZeroY);
    ctx.closePath();
    ctx.fillStyle = 'rgba(239, 68, 68, 0.12)';
    ctx.fill();
  }

  // P&L curve line
  ctx.beginPath();
  points.forEach((p, i) => {
    const clampedY = Math.max(padding.top, Math.min(padding.top + h, p.y));
    if (i === 0) ctx.moveTo(p.x, clampedY);
    else ctx.lineTo(p.x, clampedY);
  });
  ctx.strokeStyle = '#8B5CF6';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Current price marker (vertical dashed line)
  if (spotPrice >= minPrice && spotPrice <= maxPrice) {
    const spotX = padding.left + ((spotPrice - minPrice) / (maxPrice - minPrice)) * w;
    ctx.strokeStyle = '#3B82F6';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(spotX, padding.top);
    ctx.lineTo(spotX, padding.top + h);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#3B82F6';
    ctx.font = '10px JetBrains Mono';
    ctx.textAlign = 'center';
    ctx.fillText('Spot: $' + spotPrice.toFixed(2), spotX, padding.top - 5);
  }

  // Breakeven dots
  pnlData.breakevens.forEach(be => {
    if (be >= minPrice && be <= maxPrice) {
      const beX = padding.left + ((be - minPrice) / (maxPrice - minPrice)) * w;
      const effectiveZeroY = Math.max(padding.top, Math.min(padding.top + h, zeroY));
      ctx.beginPath();
      ctx.arc(beX, effectiveZeroY, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#F59E0B';
      ctx.fill();
      ctx.fillStyle = '#F59E0B';
      ctx.font = '10px JetBrains Mono';
      ctx.textAlign = 'center';
      ctx.fillText('BE: $' + be.toFixed(2), beX, effectiveZeroY - 10);
    }
  });

  // Max profit/loss zone labels
  const maxProfitPoint = points.reduce((best, p) => p.pnl > best.pnl ? p : best, points[0]);
  if (maxProfitPoint.pnl > 0) {
    ctx.fillStyle = 'rgba(16, 185, 129, 0.7)';
    ctx.font = 'bold 9px JetBrains Mono';
    ctx.textAlign = 'center';
    const mpY = Math.max(padding.top + 15, Math.min(padding.top + h - 5, maxProfitPoint.y - 8));
    if (pnlData.maxProfit < 100000) {
      ctx.fillText('Max: ' + formatDollar(pnlData.maxProfit), maxProfitPoint.x, mpY);
    }
  }
}

// ---- TICKER INPUT & EXPIRATION HANDLERS ----

function setupOptionsControls() {
  const tickerInput = document.getElementById('optTickerInput');
  const expirySelect = document.getElementById('optExpirySelect');

  if (tickerInput) {
    let debounceTimer;
    tickerInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const symbol = tickerInput.value.trim().toUpperCase();
        if (symbol && symbol !== optionsState.symbol) {
          optionsState.symbol = symbol;
          optionsState.selectedExpiration = null;
          optionsState.selectedContract = null;
          populateOptionsChain();
        }
      }
    });
    tickerInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const symbol = tickerInput.value.trim().toUpperCase();
        if (symbol.length >= 1 && symbol.length <= 5 && symbol !== optionsState.symbol) {
          optionsState.symbol = symbol;
          optionsState.selectedExpiration = null;
          populateOptionsChain();
        }
      }, 800);
    });
  }

  if (expirySelect) {
    expirySelect.addEventListener('change', () => {
      optionsState.selectedExpiration = parseInt(expirySelect.value);
      optionsState.selectedContract = null;
      populateOptionsChain();
    });
  }

  // View toggle (Chain / Strategy / Vol Surface)
  document.querySelectorAll('.ovt-btn[data-optview]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ovt-btn[data-optview]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const view = btn.dataset.optview;
      const chainContainer = document.querySelector('.options-chain-container');
      const stratBuilder = document.getElementById('strategyBuilder');

      if (view === 'chain') {
        if (chainContainer) chainContainer.style.display = '';
        if (stratBuilder) stratBuilder.style.display = 'none';
      } else if (view === 'strategy') {
        if (chainContainer) chainContainer.style.display = '';
        if (stratBuilder) stratBuilder.style.display = '';
      } else if (view === 'volsurface') {
        if (chainContainer) chainContainer.style.display = '';
        if (stratBuilder) stratBuilder.style.display = 'none';
      }
    });
  });
}

// ---- STRATEGY BUILDER ----

function setupStrategyBuilder() {
  const addBtn = document.getElementById('addLegBtn');
  const clearBtn = document.getElementById('clearStrategy');
  const presetSelect = document.getElementById('strategyPreset');

  if (addBtn) {
    addBtn.addEventListener('click', () => addStrategyLeg());
  }
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      optionsState.strategyLegs = [];
      renderStrategyLegs();
      updateStrategyPnL();
    });
  }
  if (presetSelect) {
    presetSelect.addEventListener('change', () => {
      applyStrategyPreset(presetSelect.value);
    });
  }
}

function addStrategyLeg(defaults) {
  const chain = optionsState.currentChain;
  const spot = chain ? chain.spotPrice : 227;
  const nearestStrike = Math.round(spot);

  const leg = {
    id: Date.now() + Math.random(),
    side: 'long',
    type: 'call',
    strike: nearestStrike,
    premium: 0,
    quantity: 1,
    ...defaults,
  };

  // Auto-fill premium from chain if available
  if (chain && leg.premium === 0) {
    const source = leg.type === 'call' ? chain.calls : chain.puts;
    const match = source.find(c => c.strike === leg.strike);
    if (match) leg.premium = match.last || match.ask || 0;
  }

  optionsState.strategyLegs.push(leg);
  renderStrategyLegs();
  updateStrategyPnL();
}

function removeStrategyLeg(id) {
  optionsState.strategyLegs = optionsState.strategyLegs.filter(l => l.id !== id);
  renderStrategyLegs();
  updateStrategyPnL();
}

function renderStrategyLegs() {
  const container = document.getElementById('strategyLegs');
  if (!container) return;

  const header = container.querySelector('.strategy-legs-header');
  container.innerHTML = '';
  if (header) container.appendChild(header);
  else {
    const h = document.createElement('div');
    h.className = 'strategy-legs-header';
    h.innerHTML = '<span>Side</span><span>Type</span><span>Strike</span><span>Premium</span><span>Qty</span><span></span>';
    container.appendChild(h);
  }

  optionsState.strategyLegs.forEach(leg => {
    const row = document.createElement('div');
    row.className = 'strategy-leg-row';
    row.innerHTML = `
      <select class="leg-side" data-id="${leg.id}">
        <option value="long" ${leg.side === 'long' ? 'selected' : ''}>Long</option>
        <option value="short" ${leg.side === 'short' ? 'selected' : ''}>Short</option>
      </select>
      <select class="leg-type" data-id="${leg.id}">
        <option value="call" ${leg.type === 'call' ? 'selected' : ''}>Call</option>
        <option value="put" ${leg.type === 'put' ? 'selected' : ''}>Put</option>
      </select>
      <input type="number" class="leg-strike" data-id="${leg.id}" value="${leg.strike}" step="0.5">
      <input type="number" class="leg-premium" data-id="${leg.id}" value="${leg.premium.toFixed(2)}" step="0.01">
      <input type="number" class="leg-qty" data-id="${leg.id}" value="${leg.quantity}" min="1" max="100" step="1">
      <button class="leg-remove" data-id="${leg.id}">x</button>
    `;
    container.appendChild(row);

    row.querySelector('.leg-side').addEventListener('change', (e) => {
      leg.side = e.target.value;
      updateStrategyPnL();
    });
    row.querySelector('.leg-type').addEventListener('change', (e) => {
      leg.type = e.target.value;
      const chain = optionsState.currentChain;
      if (chain) {
        const source = leg.type === 'call' ? chain.calls : chain.puts;
        const match = source.find(c => c.strike === leg.strike);
        if (match) {
          leg.premium = match.last || match.ask || 0;
          row.querySelector('.leg-premium').value = leg.premium.toFixed(2);
        }
      }
      updateStrategyPnL();
    });
    row.querySelector('.leg-strike').addEventListener('change', (e) => {
      leg.strike = parseFloat(e.target.value);
      const chain = optionsState.currentChain;
      if (chain) {
        const source = leg.type === 'call' ? chain.calls : chain.puts;
        const match = source.find(c => Math.abs(c.strike - leg.strike) < 0.01);
        if (match) {
          leg.premium = match.last || match.ask || 0;
          row.querySelector('.leg-premium').value = leg.premium.toFixed(2);
        }
      }
      updateStrategyPnL();
    });
    row.querySelector('.leg-premium').addEventListener('change', (e) => {
      leg.premium = parseFloat(e.target.value);
      updateStrategyPnL();
    });
    row.querySelector('.leg-qty').addEventListener('change', (e) => {
      leg.quantity = parseInt(e.target.value) || 1;
      updateStrategyPnL();
    });
    row.querySelector('.leg-remove').addEventListener('click', () => {
      removeStrategyLeg(leg.id);
    });
  });
}

function updateStrategyPnL() {
  const legs = optionsState.strategyLegs;
  if (legs.length === 0) {
    if (optionsState.selectedContract) {
      const c = optionsState.selectedContract;
      selectContract(c.type, c.strike, c.data);
    }
    return;
  }

  const chain = optionsState.currentChain;
  const spot = chain ? chain.spotPrice : 227;
  const dte = chain && chain.calls && chain.calls[0] ? chain.calls[0].dte : 18;

  let netCost = 0;
  legs.forEach(l => {
    const mult = (l.side === 'long' ? -1 : 1) * l.quantity;
    netCost += mult * l.premium * 100;
  });

  const legDescriptions = legs.map(l =>
    `${l.side === 'short' ? 'Short' : 'Long'} ${l.type === 'call' ? 'C' : 'P'} $${l.strike}`
  );
  const stratName = legDescriptions.join(' / ');

  drawPnLChart(legs, spot, {
    name: stratName,
    cost: netCost >= 0 ? `Credit: $${netCost.toFixed(0)}` : `Debit: $${Math.abs(netCost).toFixed(0)}`,
    dte: dte,
  });

  let aggGreeks = { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 };
  legs.forEach(l => {
    if (chain) {
      const source = l.type === 'call' ? chain.calls : chain.puts;
      const match = source.find(c => Math.abs(c.strike - l.strike) < 0.01);
      if (match && match.calculatedGreeks) {
        const mult = (l.side === 'long' ? 1 : -1) * l.quantity;
        aggGreeks.delta += match.calculatedGreeks.delta * mult;
        aggGreeks.gamma += match.calculatedGreeks.gamma * mult;
        aggGreeks.theta += match.calculatedGreeks.theta * mult;
        aggGreeks.vega += match.calculatedGreeks.vega * mult;
        aggGreeks.rho += match.calculatedGreeks.rho * mult;
      }
    }
  });
  updateGreeksPanel(aggGreeks);

  const rangeVal = spot * 0.15;
  const pnlData = OptionsData.calculatePnL(legs, { minPrice: spot - rangeVal, maxPrice: spot + rangeVal, points: 300, spotPrice: spot });

  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setEl('stratNetCost', netCost >= 0 ? '+$' + netCost.toFixed(0) : '-$' + Math.abs(netCost).toFixed(0));
  setEl('stratMaxRisk', pnlData.maxLoss < -100000 ? 'Unlimited' : '-' + formatDollar(Math.abs(pnlData.maxLoss)));
  setEl('stratMaxReward', pnlData.maxProfit > 100000 ? 'Unlimited' : formatDollar(pnlData.maxProfit));
  setEl('stratBreakevens', pnlData.breakevens.map(b => '$' + b.toFixed(2)).join(', ') || '--');
}

function applyStrategyPreset(preset) {
  const chain = optionsState.currentChain;
  if (!chain) return;

  const spot = chain.spotPrice;
  const step = chain.calls.length > 1 ? chain.calls[1].strike - chain.calls[0].strike : 5;

  let atmStrike = chain.calls[0].strike;
  let minDist = Infinity;
  chain.calls.forEach(c => {
    if (Math.abs(c.strike - spot) < minDist) { minDist = Math.abs(c.strike - spot); atmStrike = c.strike; }
  });

  const findPrem = (type, strike) => {
    const source = type === 'call' ? chain.calls : chain.puts;
    const match = source.find(c => Math.abs(c.strike - strike) < 0.01);
    return match ? (match.last || match.ask || 0) : 0;
  };

  optionsState.strategyLegs = [];

  switch (preset) {
    case 'longCall':
      addStrategyLeg({ side: 'long', type: 'call', strike: atmStrike, premium: findPrem('call', atmStrike) });
      break;
    case 'longPut':
      addStrategyLeg({ side: 'long', type: 'put', strike: atmStrike, premium: findPrem('put', atmStrike) });
      break;
    case 'shortCall':
      addStrategyLeg({ side: 'short', type: 'call', strike: atmStrike + step * 2, premium: findPrem('call', atmStrike + step * 2) });
      break;
    case 'shortPut':
      addStrategyLeg({ side: 'short', type: 'put', strike: atmStrike - step * 2, premium: findPrem('put', atmStrike - step * 2) });
      break;
    case 'bullCallSpread':
      addStrategyLeg({ side: 'long', type: 'call', strike: atmStrike, premium: findPrem('call', atmStrike) });
      addStrategyLeg({ side: 'short', type: 'call', strike: atmStrike + step * 2, premium: findPrem('call', atmStrike + step * 2) });
      break;
    case 'bearPutSpread':
      addStrategyLeg({ side: 'long', type: 'put', strike: atmStrike, premium: findPrem('put', atmStrike) });
      addStrategyLeg({ side: 'short', type: 'put', strike: atmStrike - step * 2, premium: findPrem('put', atmStrike - step * 2) });
      break;
    case 'straddle':
      addStrategyLeg({ side: 'long', type: 'call', strike: atmStrike, premium: findPrem('call', atmStrike) });
      addStrategyLeg({ side: 'long', type: 'put', strike: atmStrike, premium: findPrem('put', atmStrike) });
      break;
    case 'strangle':
      addStrategyLeg({ side: 'long', type: 'call', strike: atmStrike + step * 2, premium: findPrem('call', atmStrike + step * 2) });
      addStrategyLeg({ side: 'long', type: 'put', strike: atmStrike - step * 2, premium: findPrem('put', atmStrike - step * 2) });
      break;
    case 'ironCondor': {
      const ps = atmStrike - step * 3;
      const pbs = atmStrike - step * 2;
      const css = atmStrike + step * 2;
      const cbs = atmStrike + step * 3;
      addStrategyLeg({ side: 'long', type: 'put', strike: ps, premium: findPrem('put', ps) });
      addStrategyLeg({ side: 'short', type: 'put', strike: pbs, premium: findPrem('put', pbs) });
      addStrategyLeg({ side: 'short', type: 'call', strike: css, premium: findPrem('call', css) });
      addStrategyLeg({ side: 'long', type: 'call', strike: cbs, premium: findPrem('call', cbs) });
      break;
    }
    case 'butterfly': {
      const low = atmStrike - step * 2;
      const high = atmStrike + step * 2;
      addStrategyLeg({ side: 'long', type: 'call', strike: low, premium: findPrem('call', low) });
      addStrategyLeg({ side: 'short', type: 'call', strike: atmStrike, premium: findPrem('call', atmStrike), quantity: 2 });
      addStrategyLeg({ side: 'long', type: 'call', strike: high, premium: findPrem('call', high) });
      break;
    }
    default:
      break;
  }
}

// ---- ORDER FLOW FEED (Engine-Powered) ----

// Flow state
let flowLivePaused = false;
let flowSortColumn = null;
let flowSortDirection = 'desc';
let flowDisplayedEntries = []; // tracked for sorting

// Track whether BigData is powering the flow view
let flowUsingBigData = false;
let bigdataFlowPollId = null;

function populateFlowFeed() {
  const feed = document.getElementById('flowFeed');
  if (!feed) return;

  // Check BigData availability and decide data source
  initFlowDataSource().then(function () {
    if (!flowUsingBigData) {
      // Fall back to simulated data
      FlowEngine.seedHistory(40);

      const tickerSelect = document.getElementById('flowFilterTicker');
      if (tickerSelect) {
        FlowEngine.getTickerList().forEach(t => {
          const opt = document.createElement('option');
          opt.value = t;
          opt.textContent = t;
          tickerSelect.appendChild(opt);
        });
      }

      const history = FlowEngine.flowHistory.slice(-30).reverse();
      history.forEach(entry => {
        const row = createFlowRow(entry);
        feed.appendChild(row);
        flowDisplayedEntries.push(entry);
      });
    }

    // Initial dark pool render
    renderDarkPoolFeed();

    // Initial hottest contracts
    renderHottestContracts();

    // Initial stats
    updateFlowSummaryStats();

    // Initial net flow chart
    drawNetFlowChart();
  });

  // Set up filter listeners
  setupFlowFilters();

  // Set up sort listeners
  setupFlowSorting();

  // Set up live toggle
  setupLiveToggle();

  // Set up tooltip close
  document.getElementById('fdtClose')?.addEventListener('click', () => {
    document.getElementById('flowDetailTooltip')?.classList.remove('active');
  });
  document.addEventListener('click', (e) => {
    const tooltip = document.getElementById('flowDetailTooltip');
    if (tooltip && tooltip.classList.contains('active') && !tooltip.contains(e.target) && !e.target.closest('.flow-row')) {
      tooltip.classList.remove('active');
    }
  });
}

async function initFlowDataSource() {
  const badge = document.getElementById('flowDataBadge');

  if (typeof BigDataService !== 'undefined') {
    const available = await BigDataService.checkAvailability();
    if (available) {
      flowUsingBigData = true;
      if (badge) {
        badge.textContent = 'LIVE';
        badge.classList.add('live');
        badge.classList.remove('simulated');
      }
      // Load initial BigData flow for all tickers
      await loadBigDataFlow();
      // Show sentiment widget
      loadFlowSentiment();
      return;
    }
  }

  // Simulated mode
  flowUsingBigData = false;
  if (badge) {
    badge.textContent = 'SIMULATED';
    badge.classList.add('simulated');
    badge.classList.remove('live');
  }
}

async function loadBigDataFlow() {
  if (typeof BigDataService === 'undefined' || !BigDataService.isAvailable()) return;

  const feed = document.getElementById('flowFeed');
  if (!feed) return;

  // Fetch flow for a default set of tickers
  const tickers = ['SPY', 'QQQ', 'AAPL', 'NVDA', 'TSLA', 'MSFT', 'META', 'AMD', 'AMZN', 'GOOGL'];

  try {
    const results = await Promise.all(
      tickers.map(function (t) { return BigDataService.getOptionsFlow(t).catch(function () { return null; }); })
    );

    const allEntries = [];
    results.forEach(function (data) {
      if (data && data.trades && Array.isArray(data.trades)) {
        data.trades.forEach(function (trade) {
          allEntries.push(BigDataService.normalizeFlowEntry(trade));
        });
      } else if (data && Array.isArray(data)) {
        data.forEach(function (trade) {
          allEntries.push(BigDataService.normalizeFlowEntry(trade));
        });
      }
    });

    // Sort by time descending and take latest 30
    allEntries.sort(function (a, b) { return b.time.localeCompare(a.time); });
    const toShow = allEntries.slice(0, 30);

    toShow.forEach(function (entry) {
      const row = createFlowRow(entry);
      feed.appendChild(row);
      flowDisplayedEntries.push(entry);
    });

    // Populate ticker filter from real data
    const tickerSelect = document.getElementById('flowFilterTicker');
    if (tickerSelect) {
      const uniqueTickers = [...new Set(allEntries.map(function (e) { return e.ticker; }))].sort();
      uniqueTickers.forEach(function (t) {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        tickerSelect.appendChild(opt);
      });
    }
  } catch (err) {
    console.error('[BigData] Flow load error:', err);
  }
}

async function loadFlowSentiment() {
  if (typeof BigDataService === 'undefined' || !BigDataService.isAvailable()) return;

  const widget = document.getElementById('flowSentimentWidget');
  if (!widget) return;

  try {
    const data = await BigDataService.getSentiment('SPY');
    if (data && (data.score !== undefined || data.overall !== undefined)) {
      const score = data.score !== undefined ? data.score : data.overall;
      const pct = typeof score === 'number' ? Math.round(score * 100) : parseInt(score);

      const scoreEl = document.getElementById('flowSentimentScore');
      const barEl = document.getElementById('flowSentimentBar');

      if (scoreEl) {
        scoreEl.textContent = pct + '/100';
        if (pct >= 60) scoreEl.style.color = 'var(--profit)';
        else if (pct <= 40) scoreEl.style.color = 'var(--loss)';
        else scoreEl.style.color = 'var(--warning)';
      }
      if (barEl) {
        barEl.style.width = pct + '%';
        if (pct >= 60) barEl.style.background = 'var(--profit)';
        else if (pct <= 40) barEl.style.background = 'var(--loss)';
        else barEl.style.background = 'var(--warning)';
      }
      widget.style.display = 'flex';
    }
  } catch (err) {
    // Silently fail - sentiment is supplementary
  }
}

async function pollBigDataFlow() {
  if (!flowUsingBigData || flowLivePaused) return;
  if (typeof BigDataService === 'undefined' || !BigDataService.isAvailable()) return;

  const feed = document.getElementById('flowFeed');
  if (!feed) return;

  // Poll a few active tickers
  const pollTickers = ['SPY', 'QQQ', 'NVDA', 'AAPL', 'TSLA'];
  const randomTicker = pollTickers[Math.floor(Math.random() * pollTickers.length)];

  try {
    const data = await BigDataService.getOptionsFlow(randomTicker);
    if (!data) return;

    const trades = data.trades || data;
    if (!Array.isArray(trades) || trades.length === 0) return;

    // Take the most recent trade
    const latest = trades[0];
    const entry = BigDataService.normalizeFlowEntry(latest);

    const row = createFlowRow(entry);
    row.classList.add('flow-row-enter');

    const headerRow = feed.querySelector('#flowHeaderRow');
    if (headerRow && headerRow.nextSibling) {
      feed.insertBefore(row, headerRow.nextSibling);
    } else {
      feed.appendChild(row);
    }

    requestAnimationFrame(function () {
      requestAnimationFrame(function () { row.classList.add('flow-row-enter-active'); });
    });
    setTimeout(function () { row.classList.remove('flow-row-enter', 'flow-row-enter-active'); }, 600);

    flowDisplayedEntries.unshift(entry);

    const rows = feed.querySelectorAll('.flow-row');
    if (rows.length > 50) {
      rows[rows.length - 1].remove();
      flowDisplayedEntries.pop();
    }

    updateFlowSummaryStats();
  } catch (err) {
    // Silently fail on poll
  }
}

function createFlowRow(entry) {
  const row = document.createElement('div');
  row.className = 'flow-row';

  const sideClass = entry.side === 'Ask' ? 'bullish' : entry.side === 'Bid' ? 'bearish' : '';
  const signalLabels = { sweep: 'SWEEP', block: 'BLOCK', unusual: 'UNUSUAL' };
  const signalHtml = entry.signal ? `<span class="${entry.signal}">${signalLabels[entry.signal]}</span>` : '<span class="flow-signal-dash">-</span>';

  row.innerHTML = `
    <span>${entry.time}</span>
    <span style="font-weight:600">${entry.ticker}</span>
    <span style="color: ${entry.isCall ? 'var(--profit)' : 'var(--loss)'}">${entry.type}</span>
    <span>$${entry.strike}</span>
    <span>${entry.exp}</span>
    <span class="${sideClass}">${entry.side}</span>
    <span>${formatK(entry.size)}</span>
    <span style="font-weight:500">$${formatPremium(entry.premium)}</span>
    <span>$${entry.spot.toFixed(2)}</span>
    <span>${entry.iv}%</span>
    ${signalHtml}
  `;

  // Store entry data on the row for tooltip
  row._flowEntry = entry;
  row.addEventListener('click', (e) => showFlowDetailTooltip(entry, e));

  // Pulse effect for sweep/unusual
  if (entry.signal === 'sweep') {
    row.classList.add('pulse-sweep');
  } else if (entry.signal === 'unusual') {
    row.classList.add('pulse-unusual');
  }

  return row;
}

function showFlowDetailTooltip(entry, event) {
  const tooltip = document.getElementById('flowDetailTooltip');
  if (!tooltip) return;

  document.getElementById('fdtContract').textContent =
    `${entry.ticker} $${entry.strike}${entry.isCall ? 'C' : 'P'} ${entry.exp}`;

  const body = document.getElementById('fdtBody');
  let html = `
    <div class="fdt-row"><span class="fdt-label">Time</span><span class="fdt-val">${entry.time}</span></div>
    <div class="fdt-row"><span class="fdt-label">Type</span><span class="fdt-val" style="color:${entry.isCall ? 'var(--profit)' : 'var(--loss)'}">${entry.type}</span></div>
    <div class="fdt-row"><span class="fdt-label">Side</span><span class="fdt-val">${entry.side}</span></div>
    <div class="fdt-row"><span class="fdt-label">Size</span><span class="fdt-val">${entry.size.toLocaleString()} contracts</span></div>
    <div class="fdt-row"><span class="fdt-label">Fill Price</span><span class="fdt-val">$${entry.fillPrice.toFixed(2)}</span></div>
    <div class="fdt-row"><span class="fdt-label">Bid / Ask</span><span class="fdt-val">$${entry.bid.toFixed(2)} / $${entry.ask.toFixed(2)}</span></div>
    <div class="fdt-row"><span class="fdt-label">Premium</span><span class="fdt-val" style="font-weight:700">$${formatPremium(entry.premium)}</span></div>
    <div class="fdt-row"><span class="fdt-label">Spot Price</span><span class="fdt-val">$${entry.spot.toFixed(2)}</span></div>
    <div class="fdt-row"><span class="fdt-label">IV</span><span class="fdt-val">${entry.iv}%</span></div>
    <div class="fdt-row"><span class="fdt-label">Delta</span><span class="fdt-val">${entry.delta.toFixed(3)}</span></div>
    <div class="fdt-row"><span class="fdt-label">Days to Exp</span><span class="fdt-val">${entry.daysToExp}</span></div>
    <div class="fdt-row"><span class="fdt-label">Signal</span><span class="fdt-val">${entry.signal ? entry.signal.toUpperCase() : 'NONE'}</span></div>
  `;

  if (entry.sweepExchanges) {
    html += `<div class="fdt-sweep-title">Sweep Exchange Breakdown</div>`;
    entry.sweepExchanges.forEach(ex => {
      html += `<div class="fdt-sweep-row"><span>${ex.venue}</span><span>${ex.size.toLocaleString()} contracts</span></div>`;
    });
  }

  body.innerHTML = html;

  // Position tooltip near click
  const x = Math.min(event.clientX + 10, window.innerWidth - 400);
  const y = Math.min(event.clientY - 20, window.innerHeight - 400);
  tooltip.style.left = x + 'px';
  tooltip.style.top = y + 'px';
  tooltip.classList.add('active');
}

function setupFlowFilters() {
  const ids = ['flowFilterTicker', 'flowFilterType', 'flowFilterPremium', 'flowFilterSignal'];
  ids.forEach(id => {
    document.getElementById(id)?.addEventListener('change', applyFlowFilters);
  });
}

function applyFlowFilters() {
  const ticker = document.getElementById('flowFilterTicker')?.value || 'all';
  const type = document.getElementById('flowFilterType')?.value || 'all';
  const minPremium = parseFloat(document.getElementById('flowFilterPremium')?.value) || 0;
  const signal = document.getElementById('flowFilterSignal')?.value || 'all';

  const filtered = FlowEngine.filterFlow({ ticker, type, minPremium, signal });

  const feed = document.getElementById('flowFeed');
  if (!feed) return;

  // Keep header
  const rows = feed.querySelectorAll('.flow-row');
  rows.forEach(r => r.remove());

  flowDisplayedEntries = [];
  const toShow = filtered.slice(-50).reverse();
  toShow.forEach(entry => {
    const row = createFlowRow(entry);
    feed.appendChild(row);
    flowDisplayedEntries.push(entry);
  });
}

function setupFlowSorting() {
  document.querySelectorAll('.flow-sortable').forEach(header => {
    header.addEventListener('click', () => {
      const col = header.dataset.sort;
      if (flowSortColumn === col) {
        flowSortDirection = flowSortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        flowSortColumn = col;
        flowSortDirection = 'desc';
      }

      // Update header visuals
      document.querySelectorAll('.flow-sortable').forEach(h => h.classList.remove('sort-asc', 'sort-desc'));
      header.classList.add(flowSortDirection === 'asc' ? 'sort-asc' : 'sort-desc');

      sortFlowFeed();
    });
  });
}

function sortFlowFeed() {
  if (!flowSortColumn || flowDisplayedEntries.length === 0) return;

  const sortFn = {
    time: (a, b) => a.time.localeCompare(b.time),
    ticker: (a, b) => a.ticker.localeCompare(b.ticker),
    type: (a, b) => a.type.localeCompare(b.type),
    strike: (a, b) => a.strike - b.strike,
    size: (a, b) => a.size - b.size,
    premium: (a, b) => a.premium - b.premium,
    iv: (a, b) => a.iv - b.iv,
  };

  const fn = sortFn[flowSortColumn];
  if (!fn) return;

  flowDisplayedEntries.sort((a, b) => {
    const result = fn(a, b);
    return flowSortDirection === 'asc' ? result : -result;
  });

  const feed = document.getElementById('flowFeed');
  if (!feed) return;
  feed.querySelectorAll('.flow-row').forEach(r => r.remove());
  flowDisplayedEntries.forEach(entry => {
    feed.appendChild(createFlowRow(entry));
  });
}

function setupLiveToggle() {
  const toggle = document.getElementById('flowLiveToggle');
  const indicator = document.getElementById('flowLiveIndicator');
  if (!toggle) return;

  toggle.addEventListener('change', () => {
    flowLivePaused = !toggle.checked;
    if (indicator) {
      if (flowLivePaused) {
        indicator.classList.remove('live');
        indicator.classList.add('paused');
        // Actually stop the intervals when paused
        stopFlowIntervals();
      } else {
        indicator.classList.remove('paused');
        indicator.classList.add('live');
        // Restart intervals when un-paused
        startFlowIntervals();
      }
    }
  });
}

function updateFlowSummaryStats() {
  const summary = FlowEngine.getFlowSummary();
  const fmt = FlowAnalytics.formatDollar;

  const netEl = document.getElementById('flowStatNet');
  if (netEl) {
    const net = summary.netPremium;
    netEl.textContent = (net >= 0 ? '+' : '') + fmt(Math.abs(net));
    netEl.className = 'flow-stat-value ' + (net >= 0 ? 'profit' : 'loss');
  }

  const callEl = document.getElementById('flowStatCalls');
  if (callEl) callEl.textContent = fmt(summary.callPremium);

  const putEl = document.getElementById('flowStatPuts');
  if (putEl) putEl.textContent = fmt(summary.putPremium);

  const unusualEl = document.getElementById('flowStatUnusual');
  if (unusualEl) unusualEl.textContent = summary.unusualCount;

  const dpEl = document.getElementById('flowStatDP');
  if (dpEl) dpEl.textContent = summary.darkPoolPct.toFixed(1) + '%';

  const pcrEl = document.getElementById('flowStatPCR');
  if (pcrEl) pcrEl.textContent = summary.pcRatio + ':1';
}

function renderHottestContracts() {
  const container = document.getElementById('hotContracts');
  if (!container) return;

  const hot = FlowEngine.getHottestContracts(6);
  container.innerHTML = '';

  hot.forEach((item, i) => {
    const row = document.createElement('div');
    row.className = 'hc-row';
    const sentimentClass = item.isCall ? 'bullish' : 'bearish';
    const premClass = item.isCall ? 'profit' : 'loss';
    row.innerHTML = `
      <span class="hc-rank">${i + 1}</span>
      <span class="hc-contract">${item.contract}</span>
      <span class="hc-vol">${formatK(item.volume)}</span>
      <span class="hc-premium ${premClass}">${FlowAnalytics.formatDollar(item.premium)}</span>
      <span class="hc-sentiment ${sentimentClass}">${item.isCall ? 'Bullish' : 'Bearish'}</span>
    `;
    container.appendChild(row);
  });
}

function renderDarkPoolFeed() {
  const container = document.getElementById('darkPoolFeed');
  if (!container) return;

  // Keep the header row
  const headerRow = container.querySelector('.dp-header-row');
  container.innerHTML = '';
  if (headerRow) container.appendChild(headerRow);

  const prints = FlowEngine.getDarkPoolPrints(8);
  prints.forEach(print => {
    const row = document.createElement('div');
    row.className = 'dp-row' + (print.sizeCategory === 'mega' ? ' mega' : print.sizeCategory === 'large' ? ' large' : '');

    const sizeBadge = print.sizeCategory === 'mega'
      ? '<span class="dp-size-badge mega">MEGA</span>'
      : print.sizeCategory === 'large'
        ? '<span class="dp-size-badge large">LARGE</span>'
        : '';

    const advClass = print.pctADV > 0.3 ? 'high' : '';

    row.innerHTML = `
      <span class="dp-time">${print.time}</span>
      <span class="dp-ticker">${print.ticker}</span>
      <span class="dp-size">${print.size.toLocaleString()}${sizeBadge}</span>
      <span class="dp-price">$${print.price.toFixed(2)}</span>
      <span class="dp-value">${FlowAnalytics.formatDollar(print.value)}</span>
      <span class="dp-adv ${advClass}">${print.pctADV.toFixed(2)}%</span>
      <span class="dp-venue">${print.venue}</span>
    `;
    container.appendChild(row);
  });
}

// ---- NET FLOW CHART ----
function drawNetFlowChart() {
  const canvas = document.getElementById('netFlowCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const container = canvas.parentElement;
  canvas.width = container.offsetWidth;
  canvas.height = container.offsetHeight;

  const series = FlowEngine.getNetFlowTimeSeries();
  if (series.length < 2) return;

  const padding = { top: 15, right: 50, bottom: 10, left: 10 };
  const w = canvas.width - padding.left - padding.right;
  const h = canvas.height - padding.top - padding.bottom;

  const values = series.map(s => s.cumNet);
  let maxVal = Math.max(...values.map(Math.abs), 1);
  maxVal *= 1.15;

  const zeroY = padding.top + h / 2;

  // Grid
  ctx.strokeStyle = '#1A1A24';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(padding.left, zeroY);
  ctx.lineTo(canvas.width - padding.right, zeroY);
  ctx.stroke();

  // Zero label
  ctx.fillStyle = '#5C5C6E';
  ctx.font = '9px JetBrains Mono';
  ctx.textAlign = 'left';
  ctx.fillText('$0', canvas.width - padding.right + 4, zeroY + 3);

  // Draw the area chart
  if (series.length < 2) return;

  // Draw positive (green) and negative (red) fills separately
  ctx.beginPath();
  for (let i = 0; i < series.length; i++) {
    const x = padding.left + (i / (series.length - 1)) * w;
    const normalized = series[i].cumNet / maxVal;
    const y = zeroY - normalized * (h / 2);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }

  // Stroke the line
  ctx.strokeStyle = '#8B5CF6';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Fill above zero (green)
  ctx.beginPath();
  for (let i = 0; i < series.length; i++) {
    const x = padding.left + (i / (series.length - 1)) * w;
    const normalized = series[i].cumNet / maxVal;
    const y = zeroY - normalized * (h / 2);
    const clampedY = Math.min(y, zeroY);
    if (i === 0) ctx.moveTo(x, clampedY); else ctx.lineTo(x, clampedY);
  }
  ctx.lineTo(padding.left + w, zeroY);
  ctx.lineTo(padding.left, zeroY);
  ctx.closePath();
  const gradGreen = ctx.createLinearGradient(0, padding.top, 0, zeroY);
  gradGreen.addColorStop(0, 'rgba(16, 185, 129, 0.25)');
  gradGreen.addColorStop(1, 'rgba(16, 185, 129, 0.02)');
  ctx.fillStyle = gradGreen;
  ctx.fill();

  // Fill below zero (red)
  ctx.beginPath();
  for (let i = 0; i < series.length; i++) {
    const x = padding.left + (i / (series.length - 1)) * w;
    const normalized = series[i].cumNet / maxVal;
    const y = zeroY - normalized * (h / 2);
    const clampedY = Math.max(y, zeroY);
    if (i === 0) ctx.moveTo(x, clampedY); else ctx.lineTo(x, clampedY);
  }
  ctx.lineTo(padding.left + w, zeroY);
  ctx.lineTo(padding.left, zeroY);
  ctx.closePath();
  const gradRed = ctx.createLinearGradient(0, zeroY, 0, padding.top + h);
  gradRed.addColorStop(0, 'rgba(239, 68, 68, 0.02)');
  gradRed.addColorStop(1, 'rgba(239, 68, 68, 0.25)');
  ctx.fillStyle = gradRed;
  ctx.fill();

  // Current value label
  const lastVal = series[series.length - 1].cumNet;
  const lastY = zeroY - (lastVal / maxVal) * (h / 2);
  ctx.fillStyle = lastVal >= 0 ? '#10B981' : '#EF4444';
  ctx.font = 'bold 10px JetBrains Mono';
  ctx.textAlign = 'left';
  ctx.fillText(FlowAnalytics.formatDollar(Math.abs(lastVal)), canvas.width - padding.right + 4, lastY + 3);

  // Update label
  const label = document.getElementById('netFlowLabel');
  if (label) {
    label.textContent = lastVal >= 0 ? 'Net Bullish' : 'Net Bearish';
    label.style.color = lastVal >= 0 ? 'var(--profit)' : 'var(--loss)';
  }
}

function formatPremium(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(0) + 'K';
  return n.toFixed(0);
}

// ---- AGENT PERFORMANCE CHART ----
function drawAgentPerfChart() {
  const canvas = document.getElementById('agentPerfCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;

  const padding = { top: 20, right: 20, bottom: 30, left: 60 };
  const w = canvas.width - padding.left - padding.right;
  const h = canvas.height - padding.top - padding.bottom;
  const days = 30;

  // Generate cumulative P&L for each agent
  const agents = [
    { color: '#3B82F6', data: generateCumPnL(days, 150, 0.65) },
    { color: '#10B981', data: generateCumPnL(days, 200, 0.58) },
    { color: '#8B5CF6', data: generateCumPnL(days, 120, 0.55) },
    { color: '#F59E0B', data: generateCumPnL(days, 100, 0.60) },
  ];

  // Find overall min/max
  let min = 0, max = 0;
  agents.forEach(a => { a.data.forEach(v => { min = Math.min(min, v); max = Math.max(max, v); }); });
  max *= 1.1;
  min = Math.min(min, -max * 0.1);

  // Grid
  ctx.strokeStyle = '#1A1A24';
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (h / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(canvas.width - padding.right, y);
    ctx.stroke();

    const val = max - ((max - min) / 4) * i;
    ctx.fillStyle = '#5C5C6E';
    ctx.font = '10px JetBrains Mono';
    ctx.textAlign = 'right';
    ctx.fillText('$' + val.toFixed(0), padding.left - 8, y + 3);
  }

  // Zero line
  const zeroY = padding.top + (max / (max - min)) * h;
  ctx.strokeStyle = '#2A2A38';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding.left, zeroY);
  ctx.lineTo(canvas.width - padding.right, zeroY);
  ctx.stroke();

  // Draw lines
  agents.forEach(agent => {
    ctx.beginPath();
    agent.data.forEach((val, i) => {
      const x = padding.left + (i / (days - 1)) * w;
      const y = padding.top + ((max - val) / (max - min)) * h;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = agent.color;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Gradient fill
    const lastX = padding.left + w;
    const lastY = padding.top + ((max - agent.data[agent.data.length - 1]) / (max - min)) * h;
    ctx.lineTo(lastX, zeroY);
    ctx.lineTo(padding.left, zeroY);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, padding.top, 0, padding.top + h);
    grad.addColorStop(0, agent.color + '15');
    grad.addColorStop(1, agent.color + '00');
    ctx.fillStyle = grad;
    ctx.fill();
  });

  // Day labels
  ctx.fillStyle = '#5C5C6E';
  ctx.font = '10px JetBrains Mono';
  ctx.textAlign = 'center';
  for (let d = 0; d < days; d += 5) {
    const x = padding.left + (d / (days - 1)) * w;
    ctx.fillText('D' + (d + 1), x, canvas.height - 8);
  }
}

function generateCumPnL(days, avgDailyPnl, winRate) {
  const data = [0];
  for (let i = 1; i < days; i++) {
    const win = Math.random() < winRate;
    const change = win ? avgDailyPnl * (0.5 + Math.random()) : -avgDailyPnl * (0.3 + Math.random() * 0.5);
    data.push(data[i - 1] + change);
  }
  return data;
}

// ---- SPARKLINES ----
function drawSparklines() {
  const sparks = {
    'spark-sp500': { trend: 'up', color: '#10B981' },
    'spark-nasdaq': { trend: 'up', color: '#10B981' },
    'spark-dow': { trend: 'down', color: '#EF4444' },
    'spark-vix': { trend: 'up', color: '#EF4444' },
    'spark-yield': { trend: 'flat', color: '#F59E0B' },
  };

  Object.entries(sparks).forEach(([id, config]) => {
    const container = document.getElementById(id);
    if (!container) return;

    const canvas = document.createElement('canvas');
    container.appendChild(canvas);
    canvas.width = container.offsetWidth || 160;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');

    const points = 30;
    const data = [];
    let val = 50;
    for (let i = 0; i < points; i++) {
      const trendBias = config.trend === 'up' ? 0.6 : config.trend === 'down' ? -0.6 : 0;
      val += (Math.random() - 0.5 + trendBias * 0.1) * 8;
      val = Math.max(10, Math.min(90, val));
      data.push(val);
    }

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    // Gradient fill
    ctx.beginPath();
    data.forEach((v, i) => {
      const x = (i / (points - 1)) * canvas.width;
      const y = ((max - v) / range) * (canvas.height - 4) + 2;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    const lastX = canvas.width;
    ctx.lineTo(lastX, canvas.height);
    ctx.lineTo(0, canvas.height);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, config.color + '20');
    grad.addColorStop(1, config.color + '00');
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    data.forEach((v, i) => {
      const x = (i / (points - 1)) * canvas.width;
      const y = ((max - v) / range) * (canvas.height - 4) + 2;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = config.color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });
}

// ---- GS CHAT (AI-Powered) ----
document.getElementById('gsChatSend')?.addEventListener('click', sendGsChat);
document.getElementById('gsChatInput')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) sendGsChat();
});

async function sendGsChat() {
  const input = document.getElementById('gsChatInput');
  const body = document.getElementById('gsChatBody');
  if (!input || !body || !input.value.trim()) return;
  if (typeof GreySankore !== 'undefined' && GreySankore.isCurrentlyStreaming()) return;

  const msg = input.value.trim();
  input.value = '';

  // Escape HTML in user message
  const escapedMsg = msg.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // User message
  const userDiv = document.createElement('div');
  userDiv.className = 'gs-chat-message user';
  userDiv.innerHTML = `<div class="gs-chat-avatar" style="background: var(--bg-tertiary); color: var(--text-secondary);">ZJ</div><div class="gs-chat-content"><p>${escapedMsg}</p></div>`;
  body.appendChild(userDiv);
  body.scrollTop = body.scrollHeight;

  // Thinking indicator
  const thinkingDiv = document.createElement('div');
  thinkingDiv.className = 'gs-chat-message ai gs-thinking';
  thinkingDiv.innerHTML = `<div class="gs-chat-avatar"><svg width="16" height="16" viewBox="0 0 24 24" fill="#0D0D12"><path d="M12 2C12 2 12.8 5.6 13.6 7.2C14.4 8.8 16 10.4 17.6 11.2C19.2 12 22 12 22 12C22 12 19.2 12 17.6 12.8C16 13.6 14.4 15.2 13.6 16.8C12.8 18.4 12 22 12 22C12 22 11.2 18.4 10.4 16.8C9.6 15.2 8 13.6 6.4 12.8C4.8 12 2 12 2 12C2 12 4.8 12 6.4 11.2C8 10.4 9.6 8.8 10.4 7.2C11.2 5.6 12 2 12 2Z"/></svg></div><div class="gs-chat-content"><div class="gs-thinking-dots"><span></span><span></span><span></span></div></div>`;
  body.appendChild(thinkingDiv);
  body.scrollTop = body.scrollHeight;

  // Disable input during response
  input.disabled = true;
  const sendBtn = document.getElementById('gsChatSend');
  if (sendBtn) sendBtn.disabled = true;

  try {
    // Use enriched context (with BigData sentiment/insider/institutional) when available
    let context = {};
    if (typeof GreySankore !== 'undefined') {
      if (typeof GreySankore.gatherEnrichedContext === 'function') {
        context = await GreySankore.gatherEnrichedContext();
      } else {
        context = GreySankore.gatherContext();
      }
    }
    const result = await GreySankore.chat(msg, context);

    // Remove thinking indicator
    if (thinkingDiv.parentNode) thinkingDiv.remove();

    if (!result) {
      input.disabled = false;
      if (sendBtn) sendBtn.disabled = false;
      return;
    }

    if (result.type === 'error') {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'gs-chat-message ai';
      let errorHtml;
      if (result.error === 'no_api_key') {
        errorHtml = `<p style="color: var(--warning);">No API key configured.</p><p>Go to <strong>Settings</strong> and enter your Anthropic API key to enable live AI analysis. Using fallback responses in the meantime.</p>`;
      } else {
        errorHtml = `<p style="color: var(--loss);">Error: ${result.message}</p>`;
      }
      errorDiv.innerHTML = `<div class="gs-chat-avatar"><svg width="16" height="16" viewBox="0 0 24 24" fill="#0D0D12"><path d="M12 2C12 2 12.8 5.6 13.6 7.2C14.4 8.8 16 10.4 17.6 11.2C19.2 12 22 12 22 12C22 12 19.2 12 17.6 12.8C16 13.6 14.4 15.2 13.6 16.8C12.8 18.4 12 22 12 22C12 22 11.2 18.4 10.4 16.8C9.6 15.2 8 13.6 6.4 12.8C4.8 12 2 12 2 12C2 12 4.8 12 6.4 11.2C8 10.4 9.6 8.8 10.4 7.2C11.2 5.6 12 2 12 2Z"/></svg></div><div class="gs-chat-content">${errorHtml}</div>`;
      body.appendChild(errorDiv);
      body.scrollTop = body.scrollHeight;
    } else if (result.type === 'mock') {
      // Mock fallback response with typing effect
      const aiDiv = document.createElement('div');
      aiDiv.className = 'gs-chat-message ai';
      aiDiv.innerHTML = `<div class="gs-chat-avatar"><svg width="16" height="16" viewBox="0 0 24 24" fill="#0D0D12"><path d="M12 2C12 2 12.8 5.6 13.6 7.2C14.4 8.8 16 10.4 17.6 11.2C19.2 12 22 12 22 12C22 12 19.2 12 17.6 12.8C16 13.6 14.4 15.2 13.6 16.8C12.8 18.4 12 22 12 22C12 22 11.2 18.4 10.4 16.8C9.6 15.2 8 13.6 6.4 12.8C4.8 12 2 12 2 12C2 12 4.8 12 6.4 11.2C8 10.4 9.6 8.8 10.4 7.2C11.2 5.6 12 2 12 2Z"/></svg></div><div class="gs-chat-content"></div>`;
      body.appendChild(aiDiv);
      const contentDiv = aiDiv.querySelector('.gs-chat-content');
      await typewriteHtml(contentDiv, result.html, body);
      // Mock output must be visibly distinguishable from a real model answer.
      prependGsDemoBadge(contentDiv);
      appendGsResponseNote(contentDiv);
      body.scrollTop = body.scrollHeight;
    } else if (result.type === 'stream') {
      // Streaming AI response
      const aiDiv = document.createElement('div');
      aiDiv.className = 'gs-chat-message ai';
      aiDiv.innerHTML = `<div class="gs-chat-avatar"><svg width="16" height="16" viewBox="0 0 24 24" fill="#0D0D12"><path d="M12 2C12 2 12.8 5.6 13.6 7.2C14.4 8.8 16 10.4 17.6 11.2C19.2 12 22 12 22 12C22 12 19.2 12 17.6 12.8C16 13.6 14.4 15.2 13.6 16.8C12.8 18.4 12 22 12 22C12 22 11.2 18.4 10.4 16.8C9.6 15.2 8 13.6 6.4 12.8C4.8 12 2 12 2 12C2 12 4.8 12 6.4 11.2C8 10.4 9.6 8.8 10.4 7.2C11.2 5.6 12 2 12 2Z"/></svg></div><div class="gs-chat-content"><span class="gs-stream-cursor"></span></div>`;
      body.appendChild(aiDiv);
      const contentDiv = aiDiv.querySelector('.gs-chat-content');
      let accumulatedText = '';

      await result.read(
        // onChunk
        function (chunk, fullText) {
          accumulatedText = fullText;
          contentDiv.innerHTML = formatStreamText(fullText) + '<span class="gs-stream-cursor"></span>';
          body.scrollTop = body.scrollHeight;
        },
        // onDone
        function (fullText, error) {
          const cursor = contentDiv.querySelector('.gs-stream-cursor');
          if (cursor) cursor.remove();
          if (error) {
            contentDiv.innerHTML += `<p style="color: var(--loss); font-size: 0.8rem; margin-top: 8px;">Stream interrupted: ${error}</p>`;
          }
          if (fullText) {
            contentDiv.innerHTML = formatStreamText(fullText);
          }
          appendGsResponseNote(contentDiv);
          body.scrollTop = body.scrollHeight;
        }
      );
    }
  } catch (e) {
    if (thinkingDiv.parentNode) thinkingDiv.remove();
    const errorDiv = document.createElement('div');
    errorDiv.className = 'gs-chat-message ai';
    errorDiv.innerHTML = `<div class="gs-chat-avatar"><svg width="16" height="16" viewBox="0 0 24 24" fill="#0D0D12"><path d="M12 2C12 2 12.8 5.6 13.6 7.2C14.4 8.8 16 10.4 17.6 11.2C19.2 12 22 12 22 12C22 12 19.2 12 17.6 12.8C16 13.6 14.4 15.2 13.6 16.8C12.8 18.4 12 22 12 22C12 22 11.2 18.4 10.4 16.8C9.6 15.2 8 13.6 6.4 12.8C4.8 12 2 12 2 12C2 12 4.8 12 6.4 11.2C8 10.4 9.6 8.8 10.4 7.2C11.2 5.6 12 2 12 2Z"/></svg></div><div class="gs-chat-content"><p style="color: var(--loss);">Connection error. Make sure the server is running (npm start).</p></div>`;
    body.appendChild(errorDiv);
  }

  // Re-enable input
  input.disabled = false;
  if (sendBtn) sendBtn.disabled = false;
  input.focus();
  body.scrollTop = body.scrollHeight;
}

// Format streamed text (may contain raw text or HTML)
function formatStreamText(text) {
  // If the AI already returned HTML tags, use as-is
  if (/<[a-z][\s\S]*>/i.test(text)) {
    return text;
  }
  // Otherwise, convert plain text to basic HTML
  return text
    .split('\n\n').map(p => `<p>${p}</p>`).join('')
    .replace(/\n/g, '<br>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

// Typewrite effect for mock/fallback HTML responses
async function typewriteHtml(container, html, scrollParent) {
  return new Promise(resolve => {
    // Parse the HTML and insert it piece by piece
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    const fullText = tempDiv.textContent || tempDiv.innerText;
    const words = fullText.split(/(\s+)/);
    let wordIndex = 0;

    // Just render the full HTML with a fade-in effect for mock responses
    container.style.opacity = '0';
    container.innerHTML = html;
    container.style.transition = 'opacity 0.4s ease';
    requestAnimationFrame(() => {
      container.style.opacity = '1';
      if (scrollParent) scrollParent.scrollTop = scrollParent.scrollHeight;
    });
    setTimeout(resolve, 500);
  });
}

// Compact per-response disclaimer appended beneath each AI answer.
function appendGsResponseNote(contentDiv) {
  if (!contentDiv) return;
  var note = document.createElement('div');
  note.className = 'ai-response-note';
  note.textContent = 'Educational information, not advice.';
  contentDiv.appendChild(note);
}

// "Demo Response" marker for mock answers rendered when no API key is set.
function prependGsDemoBadge(contentDiv) {
  if (!contentDiv) return;
  var wrap = document.createElement('div');
  var span = document.createElement('span');
  span.className = 'demo-response-badge';
  span.textContent = 'Demo Response';
  wrap.appendChild(span);
  contentDiv.insertBefore(wrap, contentDiv.firstChild);
}

// ---- GS QUICK ACTION BUTTONS ----
// Wire up quick-action buttons in the GS chat to send pre-built queries
document.querySelectorAll('.gs-quick-action').forEach(btn => {
  btn.addEventListener('click', () => {
    const query = btn.dataset.query;
    if (query) {
      const input = document.getElementById('gsChatInput');
      if (input) {
        input.value = query;
        sendGsChat();
      }
    }
  });
});

// Wire up alert action buttons in the Grey Sankore view to send queries to chat
document.querySelectorAll('.alert-action-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const alertEl = btn.closest('.gs-alert');
    if (!alertEl) return;
    const tickerEl = alertEl.querySelector('.alert-ticker');
    const ticker = tickerEl ? tickerEl.textContent.trim() : '';
    const action = btn.textContent.trim();
    let query = '';

    if (action === 'Analyze Position') {
      query = `Analyze ${ticker} - what's the best position to take?`;
    } else if (action === 'View Flow') {
      query = `Analyze the flow for ${ticker}`;
    } else if (action === 'View Skew Chart') {
      query = `Analyze the volatility skew for ${ticker}`;
    } else if (action === 'Deep Dive') {
      query = `Deep dive analysis on ${ticker}`;
    } else if (action === 'Set Alert') {
      return; // Set Alert is a different action - not a chat query
    }

    if (query) {
      // Navigate to chat input area if not already there
      const input = document.getElementById('gsChatInput');
      if (input) {
        input.value = query;
        // Scroll to chat panel
        const chatPanel = document.querySelector('.gs-chat-panel');
        if (chatPanel) chatPanel.scrollIntoView({ behavior: 'smooth' });
        sendGsChat();
      }
    }
  });
});

// ---- DASHBOARD INSIGHT CARDS (AI-powered) ----
async function refreshInsightCards() {
  if (typeof GreySankore === 'undefined') return;

  const insightsBody = document.querySelector('.gs-insights-body');
  if (!insightsBody) return;

  const context = GreySankore.gatherContext();
  const result = await GreySankore.generateInsights(context.marketData);

  if (!result || !result.insights || result.insights.length === 0) return;

  // SVG icons by type
  const icons = {
    anomaly: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    value: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>',
    momentum: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>'
  };

  const timeLabels = ['Just now', '3 min ago', '7 min ago'];

  insightsBody.innerHTML = '';
  result.insights.forEach((insight, i) => {
    const card = document.createElement('div');
    card.className = `gs-insight-card ${insight.type || 'anomaly'}`;
    const icon = icons[insight.type] || icons.anomaly;
    const typeLabel = insight.typeLabel || insight.type?.toUpperCase() || 'INSIGHT';
    const confidenceClass = insight.confidence || 'medium';
    const confidenceLabel = insight.label || (confidenceClass === 'high' ? 'High Conviction' : confidenceClass === 'medium' ? 'Medium Conviction' : 'Low Conviction');

    card.innerHTML = `
      <div class="insight-type">
        ${icon}
        ${typeLabel}
      </div>
      <div class="insight-content">
        <strong>${insight.ticker || ''}</strong>${insight.ticker ? ' - ' : ''}${insight.content || ''}
      </div>
      <div class="insight-meta">
        <span class="insight-time">${timeLabels[i] || 'Just now'}</span>
        <span class="insight-confidence ${confidenceClass}">${confidenceLabel}</span>
      </div>
    `;
    insightsBody.appendChild(card);
  });
}

// ---- SETTINGS: API KEY MANAGEMENT ----
function initSettingsApiKey() {
  const input = document.getElementById('anthropicApiKeyInput');
  const saveBtn = document.getElementById('saveApiKeyBtn');
  const statusEl = document.getElementById('apiKeyStatus');
  const indicatorEl = document.getElementById('apiKeyStatusIndicator');

  if (!input || !saveBtn) return;

  // Load saved key display
  const savedKey = localStorage.getItem('gs_anthropic_key');
  if (savedKey) {
    input.placeholder = savedKey.slice(0, 10) + '...' + savedKey.slice(-4);
  }

  // Save button handler
  saveBtn.addEventListener('click', async () => {
    const key = input.value.trim();
    if (!key) return;

    saveBtn.textContent = 'Saving...';
    saveBtn.disabled = true;

    const result = await GreySankore.saveApiKey(key);

    if (result.success) {
      input.value = '';
      input.placeholder = key.slice(0, 10) + '...' + key.slice(-4);
      saveBtn.textContent = 'Saved';

      // Validate the key
      const validation = await GreySankore.validateApiKey();
      updateApiStatus(statusEl, indicatorEl, validation);
      refreshAiActiveBadge();

      // Refresh insights with new key
      refreshInsightCards();
    } else {
      saveBtn.textContent = 'Error';
      if (statusEl) {
        statusEl.textContent = result.error || 'Failed to save key';
        statusEl.style.color = 'var(--loss)';
      }
    }

    setTimeout(() => {
      saveBtn.textContent = 'Save';
      saveBtn.disabled = false;
    }, 2000);
  });

  // Check initial status
  checkAndDisplayApiStatus(statusEl, indicatorEl);
}

// Reflects whether AI calls will actually hit Claude or fall back to sample
// responses. Runs on load and again after any key save, so the badge never
// claims "Active" while the chat is really in fallback mode (or vice versa).
async function refreshAiActiveBadge() {
  const badge = document.querySelector('.gs-chat-panel .panel-badge');
  if (!badge || typeof GreySankore === 'undefined') return;
  const configured = await GreySankore.checkApiStatus().catch(() => false);
  badge.textContent = configured ? 'AI Active' : 'Sample Mode';
  badge.classList.toggle('live', configured);
}

async function checkAndDisplayApiStatus(statusEl, indicatorEl) {
  if (typeof GreySankore === 'undefined') return;

  // First, restore key from localStorage to server
  await GreySankore.restoreApiKey();

  const configured = await GreySankore.checkApiStatus();
  refreshAiActiveBadge();

  if (configured) {
    const validation = await GreySankore.validateApiKey();
    updateApiStatus(statusEl, indicatorEl, validation);
  } else {
    updateApiStatus(statusEl, indicatorEl, { valid: false, message: 'No API key configured. Using mock responses.' });
  }
}

function updateApiStatus(statusEl, indicatorEl, validation) {
  if (!statusEl) return;

  if (validation.valid) {
    statusEl.textContent = 'Connected - ' + (validation.message || 'API key valid');
    statusEl.style.color = 'var(--profit)';
    if (indicatorEl) {
      indicatorEl.className = 'api-status-indicator connected';
      indicatorEl.textContent = 'LIVE';
    }
  } else {
    statusEl.textContent = validation.message || 'Not connected';
    statusEl.style.color = 'var(--warning)';
    if (indicatorEl) {
      indicatorEl.className = 'api-status-indicator disconnected';
      indicatorEl.textContent = 'OFFLINE';
    }
  }
}

// ---- LIVE FLOW SIMULATION (Engine-Powered) ----
let flowIntervalId = null;
let darkPoolIntervalId = null;
let smartMoneyIntervalId = null;

function simulateLiveFlow() {
  if (flowLivePaused) return;

  const feed = document.getElementById('flowFeed');
  if (!feed) return;

  // Check if filters would exclude this entry
  const ticker = document.getElementById('flowFilterTicker')?.value || 'all';
  const type = document.getElementById('flowFilterType')?.value || 'all';
  const minPremium = parseFloat(document.getElementById('flowFilterPremium')?.value) || 0;
  const signal = document.getElementById('flowFilterSignal')?.value || 'all';

  // Generate new entry
  const entry = FlowEngine.generateFlowEntry();

  // Run analytics on it
  FlowAnalytics.analyzeEntry(entry);

  // Check if it passes current filters
  const passesFilter =
    (ticker === 'all' || entry.ticker === ticker) &&
    (type === 'all' || (type === 'calls' && entry.isCall) || (type === 'puts' && !entry.isCall)) &&
    (entry.premium >= minPremium) &&
    (signal === 'all' || entry.signal === signal);

  if (passesFilter && !flowSortColumn) {
    const row = createFlowRow(entry);
    row.classList.add('flow-row-enter');

    const headerRow = feed.querySelector('#flowHeaderRow');
    if (headerRow && headerRow.nextSibling) {
      feed.insertBefore(row, headerRow.nextSibling);
    } else {
      feed.appendChild(row);
    }
    // Trigger slide-in animation
    requestAnimationFrame(() => {
      requestAnimationFrame(() => { row.classList.add('flow-row-enter-active'); });
    });
    // Clean up animation class after transition
    setTimeout(() => { row.classList.remove('flow-row-enter', 'flow-row-enter-active'); }, 600);

    flowDisplayedEntries.unshift(entry);

    // Remove old rows to prevent memory buildup
    const rows = feed.querySelectorAll('.flow-row');
    if (rows.length > 50) {
      rows[rows.length - 1].remove();
      flowDisplayedEntries.pop();
    }
  }

  // Update summary stats
  updateFlowSummaryStats();

  // Periodically update hottest contracts
  if (FlowEngine.flowHistory.length % 5 === 0) {
    renderHottestContracts();
  }

  // Periodically update net flow chart
  if (FlowEngine.flowHistory.length % 3 === 0) {
    drawNetFlowChart();
  }

  // Periodically update smart money alerts
  if (FlowEngine.flowHistory.length % 4 === 0) {
    renderSmartMoneyAlerts();
  }
}

// Periodically generate dark pool prints
function simulateDarkPool() {
  if (flowLivePaused) return;
  const print = FlowEngine.generateDarkPoolPrint();
  FlowAnalytics.analyzeDarkPool(print);
  renderDarkPoolFeed();
  updateFlowSummaryStats();
  renderSmartMoneyAlerts();
}

// Render smart money alerts panel
function renderSmartMoneyAlerts() {
  const container = document.getElementById('smartMoneyAlerts');
  if (!container) return;
  if (typeof FlowAnalytics === 'undefined' || typeof FlowAnalytics.getSmartMoneyAlerts !== 'function') return;

  const alerts = FlowAnalytics.getSmartMoneyAlerts(5);
  if (alerts.length === 0) {
    container.innerHTML = '<div class="sma-empty">No alerts yet. Monitoring flow...</div>';
    return;
  }

  container.innerHTML = '';
  alerts.forEach(alert => {
    const div = document.createElement('div');
    div.className = 'sma-alert sma-' + (alert.severity || 'low');
    const time = alert.timestamp ? new Date(alert.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '';
    div.innerHTML = `
      <div class="sma-header">
        <span class="sma-ticker">${alert.ticker || ''}</span>
        <span class="sma-severity ${alert.severity || 'low'}">${(alert.severity || 'LOW').toUpperCase()}</span>
        <span class="sma-time">${time}</span>
      </div>
      <div class="sma-message">${alert.message || ''}</div>
    `;
    container.appendChild(div);
  });
}

// Start/stop flow intervals
function startFlowIntervals() {
  if (flowUsingBigData) {
    // Use BigData polling instead of simulation
    if (bigdataFlowPollId) clearInterval(bigdataFlowPollId);
    bigdataFlowPollId = setInterval(pollBigDataFlow, 5000);
    // Still run dark pool from BigData or simulation
    if (darkPoolIntervalId) clearInterval(darkPoolIntervalId);
    darkPoolIntervalId = setInterval(simulateDarkPool, 6000);
  } else {
    // Simulated mode
    if (flowIntervalId) clearInterval(flowIntervalId);
    if (darkPoolIntervalId) clearInterval(darkPoolIntervalId);
    flowIntervalId = setInterval(simulateLiveFlow, 1800);
    darkPoolIntervalId = setInterval(simulateDarkPool, 6000);
  }
}

function stopFlowIntervals() {
  if (flowIntervalId) { clearInterval(flowIntervalId); flowIntervalId = null; }
  if (darkPoolIntervalId) { clearInterval(darkPoolIntervalId); darkPoolIntervalId = null; }
  if (bigdataFlowPollId) { clearInterval(bigdataFlowPollId); bigdataFlowPollId = null; }
}

// Start intervals on load
startFlowIntervals();

// ---- DASHBOARD STATE ----
let activeIndicators = {};
let currentChartSymbol = 'AAPL';
let currentChartType = 'line'; // 'candlestick' | 'line' | 'area' - line is the default, easiest to read at a glance
let currentTimeframe = '1Y';
let currentTimeframeRange = '1y';
let currentChartCandles = null; // cached candle data for redraws
let currentCapSize = 'large';
let currentWatchlistTab = 'favorites';

const CAP_SIZE_TICKERS = {
  large: ['AAPL','NVDA','MSFT','AMZN','GOOGL','META','TSLA','JPM','BRK-B','UNH','V','JNJ'],
  mid: ['COIN','PLTR','SNAP','ROKU','DKNG','HOOD','RBLX','ABNB','DASH','PINS','NET','CRWD'],
  small: ['SOFI','IONQ','RIVN','LCID','MARA','DNA','PATH','AI','JOBY','OPEN','VLD','STEM'],
  micro: ['BBAI','MYPS','SOUN','ASTS','GSAT','LUNR','RKLB','RDW','MNTS','BKSY','ASTR','SPIR'],
};

const WATCHLIST_TAB_TICKERS = {
  favorites: null, // uses current cap-size list
  tech: ['AAPL','NVDA','MSFT','AMD','GOOGL','META','AVGO','TSM','INTC','CRM','ORCL','ADBE'],
  earnings: ['NKE','FDX','MU','LEN','ACN','GIS','WBA','RAD','BB','KMX','STZ','CTAS'],
};

const TIMEFRAME_MAP = {
  '1m':  { interval: '1m',  range: '1d' },
  '5m':  { interval: '5m',  range: '1d' },
  '15m': { interval: '15m', range: '1d' },
  '1H':  { interval: '60m', range: '5d' },
  '4H':  { interval: '60m', range: '1mo' },
  '1D':  { interval: '1d',  range: '5d' },
  '1W':  { interval: '1d',  range: '5d' },
  '1M':  { interval: '1d',  range: '1mo' },
  '3M':  { interval: '1d',  range: '3mo' },
  '6M':  { interval: '1d',  range: '6mo' },
  '1Y':  { interval: '1d',  range: '1y' },
  '2Y':  { interval: '1wk', range: '2y' },
  '3Y':  { interval: '1wk', range: '3y' },
  '5Y':  { interval: '1wk', range: '5y' },
  'MAX': { interval: '1mo', range: 'max' },
};

// ---- CHART DATA FETCHING ----

async function fetchAndDrawChart(symbol, interval, range) {
  symbol = symbol || currentChartSymbol;
  interval = interval || currentTimeframe;
  const tfEntry = TIMEFRAME_MAP[interval] || { interval: interval, range: range || '1d' };
  const actualInterval = tfEntry.interval;
  const actualRange = range || tfEntry.range;

  try {
    const resp = await fetch(`/api/chart/${encodeURIComponent(symbol)}?interval=${actualInterval}&range=${actualRange}`);
    if (!resp.ok) throw new Error('API returned ' + resp.status);
    const data = await resp.json();
    if (data && data.candles && data.candles.length > 0) {
      currentChartCandles = data.candles;
      drawChartWithType(data.candles, currentChartType);
      drawVolumeChartFromCandles(data.candles);
      updateChartOverlay(data.candles);
      updateChartTitle(symbol, data.candles);
      return;
    }
  } catch (err) {
    console.warn('[Chart] Failed to fetch chart data for ' + symbol + ':', err.message);
  }
  // Fallback to generated data
  const candles = generateCandleData(80, 224, 228);
  currentChartCandles = candles;
  drawChartWithType(candles, currentChartType);
  drawVolumeChart();
}

function updateChartOverlay(candles) {
  if (!candles || candles.length === 0) return;
  const last = candles[candles.length - 1];
  const overlayItems = document.querySelectorAll('.chart-overlay-data .overlay-item');
  if (overlayItems.length >= 5) {
    overlayItems[0].textContent = 'O: ' + last.open.toFixed(2);
    overlayItems[1].textContent = 'H: ' + last.high.toFixed(2);
    overlayItems[2].textContent = 'L: ' + last.low.toFixed(2);
    overlayItems[3].textContent = 'C: ' + last.close.toFixed(2);
    const vol = last.volume || 0;
    overlayItems[4].textContent = 'V: ' + (vol >= 1e6 ? (vol/1e6).toFixed(1) + 'M' : vol >= 1e3 ? (vol/1e3).toFixed(1) + 'K' : vol.toString());
  }
}

function updateChartTitle(symbol, candles) {
  const titleEl = document.querySelector('.chart-panel .panel-title');
  const priceEl = document.querySelector('.chart-panel .panel-price');
  if (titleEl) titleEl.textContent = symbol.toUpperCase();
  if (priceEl && candles && candles.length > 0) {
    const last = candles[candles.length - 1];
    const first = candles[0];
    const change = last.close - first.open;
    const changePct = (change / first.open) * 100;
    const isUp = change >= 0;
    priceEl.className = 'panel-price ' + (isUp ? 'profit' : 'loss');
    priceEl.innerHTML = `$${last.close.toFixed(2)} <small>${isUp ? '+' : ''}${change.toFixed(2)} (${isUp ? '+' : ''}${changePct.toFixed(2)}%)</small>`;
  }
}

// ---- MULTI-TYPE CHART DRAWING ----

function drawChartWithType(candles, chartType) {
  if (!candles || candles.length === 0) return;
  const canvas = document.getElementById('chartCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = rect.height + 'px';
  ctx.scale(dpr, dpr);

  // Price axis reads on the LEFT (classic financial-chart convention, and
  // easier to scan than a right-side axis): most of the padding budget
  // moves there, the right edge keeps just enough room to breathe.
  const padding = { top: 50, right: 14, bottom: 44, left: 64 };
  const chartW = rect.width - padding.left - padding.right;
  const chartH = rect.height - padding.top - padding.bottom;

  let min = Infinity, max = -Infinity;
  candles.forEach(c => { min = Math.min(min, c.low); max = Math.max(max, c.high); });
  const range = max - min;
  min -= range * 0.05;
  max += range * 0.05;

  const barWidth = chartW / candles.length;

  const W = rect.width;
  const H = rect.height;

  // Grid lines
  ctx.strokeStyle = '#1A1A24';
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= 5; i++) {
    const y = padding.top + (chartH / 5) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(W - padding.right, y);
    ctx.stroke();
    const price = max - ((max - min) / 5) * i;
    ctx.fillStyle = '#8A8FA3'; // AA-contrast muted text, not the old sub-3:1 dim gray
    ctx.font = '11px JetBrains Mono';
    ctx.textAlign = 'right';
    ctx.fillText(price.toFixed(2), padding.left - 8, y + 3);
  }

  // ---- X-AXIS DATE/YEAR LABELS ----
  if (candles[0].time != null) {
    // Determine the total time span to decide label format
    const firstTime = candles[0].time * 1000;
    const lastTime = candles[candles.length - 1].time * 1000;
    const spanDays = (lastTime - firstTime) / (1000 * 60 * 60 * 24);

    // Build year boundary markers for multi-year charts
    const yearBoundaries = [];
    if (spanDays > 180) {
      let prevYear = new Date(firstTime).getFullYear();
      for (let i = 1; i < candles.length; i++) {
        const yr = new Date(candles[i].time * 1000).getFullYear();
        if (yr !== prevYear) {
          yearBoundaries.push({ index: i, year: yr });
          prevYear = yr;
        }
      }
    }

    // Draw year boundary lines and labels
    if (yearBoundaries.length > 0) {
      yearBoundaries.forEach(yb => {
        const x = padding.left + yb.index * barWidth;
        // Vertical dashed line
        ctx.strokeStyle = 'rgba(92, 92, 110, 0.3)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(x, padding.top);
        ctx.lineTo(x, padding.top + chartH);
        ctx.stroke();
        ctx.setLineDash([]);
        // Year label below chart
        ctx.fillStyle = '#8A8A9A';
        ctx.font = 'bold 11px JetBrains Mono';
        ctx.textAlign = 'center';
        ctx.fillText(String(yb.year), x, padding.top + chartH + 14);
      });
    }

    // Date tick marks along x-axis
    // Choose ~6-10 evenly spaced labels depending on span
    const targetTicks = Math.min(10, Math.max(5, Math.floor(chartW / 90)));
    const step = Math.max(1, Math.floor(candles.length / targetTicks));
    ctx.fillStyle = '#5C5C6E';
    ctx.font = '9px JetBrains Mono';
    ctx.textAlign = 'center';
    const yLabelPos = yearBoundaries.length > 0 ? padding.top + chartH + 28 : padding.top + chartH + 14;
    for (let i = 0; i < candles.length; i += step) {
      const d = new Date(candles[i].time * 1000);
      const x = padding.left + i * barWidth + barWidth / 2;
      let label;
      if (spanDays <= 2) {
        // Intraday: show HH:MM
        label = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
      } else if (spanDays <= 90) {
        // Short term: MM/DD
        label = (d.getMonth() + 1) + '/' + d.getDate();
      } else if (yearBoundaries.length > 0) {
        // Multi-year: show month abbreviation only (year shown by boundary labels)
        label = d.toLocaleDateString('en-US', { month: 'short' });
      } else {
        // Medium term (6mo-1yr): MM/DD/YY
        label = (d.getMonth() + 1) + '/' + d.getDate() + '/' + String(d.getFullYear()).slice(2);
      }
      ctx.fillText(label, x, yLabelPos);
      // Small tick mark
      ctx.strokeStyle = 'rgba(92, 92, 110, 0.2)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, padding.top + chartH);
      ctx.lineTo(x, padding.top + chartH + 4);
      ctx.stroke();
    }
  }

  if (chartType === 'candlestick') {
    // Draw candles - adapt padding for bar count
    const gap = barWidth > 6 ? 2 : (barWidth > 3 ? 1 : 0);
    candles.forEach((c, i) => {
      const x = padding.left + i * barWidth;
      const bullish = c.close >= c.open;
      const color = bullish ? '#10B981' : '#EF4444';

      const bodyTop = padding.top + ((max - Math.max(c.open, c.close)) / (max - min)) * chartH;
      const bodyBottom = padding.top + ((max - Math.min(c.open, c.close)) / (max - min)) * chartH;
      const wickTop = padding.top + ((max - c.high) / (max - min)) * chartH;
      const wickBottom = padding.top + ((max - c.low) / (max - min)) * chartH;

      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + barWidth / 2, wickTop);
      ctx.lineTo(x + barWidth / 2, wickBottom);
      ctx.stroke();

      ctx.fillStyle = bullish ? 'rgba(16, 185, 129, 0.8)' : 'rgba(239, 68, 68, 0.8)';
      const bodyH = Math.max(1, bodyBottom - bodyTop);
      ctx.fillRect(x + gap, bodyTop, Math.max(1, barWidth - gap * 2), bodyH);
    });
  } else if (chartType === 'line') {
    // Line chart - close prices
    ctx.beginPath();
    candles.forEach((c, i) => {
      const x = padding.left + i * barWidth + barWidth / 2;
      const y = padding.top + ((max - c.close) / (max - min)) * chartH;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#3B82F6';
    ctx.lineWidth = 2;
    ctx.stroke();
  } else if (chartType === 'area') {
    // Area chart - close prices with gradient fill
    const points = [];
    candles.forEach((c, i) => {
      const x = padding.left + i * barWidth + barWidth / 2;
      const y = padding.top + ((max - c.close) / (max - min)) * chartH;
      points.push({ x, y });
    });

    // Fill
    ctx.beginPath();
    points.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
    ctx.lineTo(points[points.length - 1].x, padding.top + chartH);
    ctx.lineTo(points[0].x, padding.top + chartH);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
    const isUp = candles[candles.length - 1].close >= candles[0].open;
    if (isUp) {
      grad.addColorStop(0, 'rgba(16, 185, 129, 0.25)');
      grad.addColorStop(1, 'rgba(16, 185, 129, 0.02)');
    } else {
      grad.addColorStop(0, 'rgba(239, 68, 68, 0.25)');
      grad.addColorStop(1, 'rgba(239, 68, 68, 0.02)');
    }
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    points.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
    ctx.strokeStyle = isUp ? '#10B981' : '#EF4444';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Current price line
  const lastClose = candles[candles.length - 1].close;
  const priceY = padding.top + ((max - lastClose) / (max - min)) * chartH;
  ctx.strokeStyle = lastClose >= candles[0].open ? '#10B981' : '#EF4444';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(padding.left, priceY);
  ctx.lineTo(W - padding.right, priceY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Price label
  ctx.fillStyle = lastClose >= candles[0].open ? '#10B981' : '#EF4444';
  ctx.fillRect(W - padding.right, priceY - 9, 56, 18);
  ctx.fillStyle = '#0D0D12';
  ctx.font = 'bold 10px JetBrains Mono';
  ctx.textAlign = 'left';
  ctx.fillText(lastClose.toFixed(2), W - padding.right + 4, priceY + 3);

  // Draw indicator overlays (SMA, EMA, BB, VWAP)
  if (typeof drawIndicatorOverlays === 'function' && typeof activeIndicators !== 'undefined') {
    drawIndicatorOverlays(ctx, candles, padding, chartW, chartH, min, max, barWidth);
  }

  // Draw RSI/MACD sub-panels if active
  if (typeof activeIndicators !== 'undefined') {
    if (activeIndicators.rsi) {
      const rsiPanel = document.getElementById('rsiPanel');
      if (rsiPanel) rsiPanel.style.display = 'block';
      if (typeof drawRSIPanel === 'function') drawRSIPanel(candles);
    }
    if (activeIndicators.macd) {
      const macdPanel = document.getElementById('macdPanel');
      if (macdPanel) macdPanel.style.display = 'block';
      if (typeof drawMACDPanel === 'function') drawMACDPanel(candles);
    }
  }
}

// ---- CROSSHAIR OVERLAY ----
let crosshairCanvas = null;
let crosshairTooltip = null;
let crosshairInitialized = false;

function setupCrosshair() {
  const chartArea = document.getElementById('mainChart');
  const mainCanvas = document.getElementById('chartCanvas');
  if (!chartArea || !mainCanvas) return;

  // Create overlay canvas if it doesn't exist
  if (!crosshairCanvas) {
    crosshairCanvas = document.createElement('canvas');
    crosshairCanvas.id = 'chartCrosshairCanvas';
    chartArea.appendChild(crosshairCanvas);
  }

  // Create tooltip if it doesn't exist
  if (!crosshairTooltip) {
    crosshairTooltip = document.createElement('div');
    crosshairTooltip.className = 'crosshair-tooltip';
    chartArea.appendChild(crosshairTooltip);
  }

  if (crosshairInitialized) return;
  crosshairInitialized = true;

  // Mouse events go on the chart area (since overlay canvas has pointer-events: none)
  chartArea.addEventListener('mousemove', onCrosshairMove);
  chartArea.addEventListener('mouseleave', onCrosshairLeave);
}

function syncCrosshairCanvasSize() {
  if (!crosshairCanvas) return;
  const mainCanvas = document.getElementById('chartCanvas');
  if (!mainCanvas) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = mainCanvas.getBoundingClientRect();
  crosshairCanvas.width = rect.width * dpr;
  crosshairCanvas.height = rect.height * dpr;
  crosshairCanvas.style.width = rect.width + 'px';
  crosshairCanvas.style.height = rect.height + 'px';
}

function onCrosshairMove(e) {
  if (!currentChartCandles || currentChartCandles.length === 0) return;
  if (!crosshairCanvas) return;

  const mainCanvas = document.getElementById('chartCanvas');
  if (!mainCanvas) return;

  syncCrosshairCanvasSize();

  const rect = mainCanvas.getBoundingClientRect();
  // Mouse position in CSS pixels (matches our drawing coords after DPR scale)
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  // Must mirror drawChartWithType's padding exactly (crosshair hit-testing
  // and the hover price bubble align to the same left-axis chart area).
  const padding = { top: 50, right: 14, bottom: 44, left: 64 };
  const chartW = rect.width - padding.left - padding.right;
  const chartH = rect.height - padding.top - padding.bottom;

  // Only show crosshair within chart area
  if (mouseX < padding.left || mouseX > rect.width - padding.right ||
      mouseY < padding.top || mouseY > padding.top + chartH) {
    clearCrosshair();
    return;
  }

  const candles = currentChartCandles;
  const barWidth = chartW / candles.length;

  // Find nearest candle by X
  const candleIdx = Math.floor((mouseX - padding.left) / barWidth);
  const clampedIdx = Math.max(0, Math.min(candles.length - 1, candleIdx));
  const candle = candles[clampedIdx];

  // Compute price range (same logic as drawChartWithType)
  let min = Infinity, max = -Infinity;
  candles.forEach(c => { min = Math.min(min, c.low); max = Math.max(max, c.high); });
  const range = max - min;
  min -= range * 0.05;
  max += range * 0.05;

  // Price at mouse Y
  const priceAtMouse = max - ((mouseY - padding.top) / chartH) * (max - min);

  // Draw crosshair on overlay canvas (scale for DPR)
  const dpr = window.devicePixelRatio || 1;
  const ctx = crosshairCanvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  ctx.strokeStyle = '#5C5C6E';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);

  // Vertical line
  const candleCenterX = padding.left + clampedIdx * barWidth + barWidth / 2;
  ctx.beginPath();
  ctx.moveTo(candleCenterX, padding.top);
  ctx.lineTo(candleCenterX, padding.top + chartH);
  ctx.stroke();

  // Horizontal line
  ctx.beginPath();
  ctx.moveTo(padding.left, mouseY);
  ctx.lineTo(rect.width - padding.right, mouseY);
  ctx.stroke();

  ctx.setLineDash([]);

  // Price label on Y-axis (left edge, matches the chart's axis)
  ctx.fillStyle = '#2A2A38';
  ctx.fillRect(padding.left - 60, mouseY - 9, 56, 18);
  ctx.fillStyle = '#A0A0B8';
  ctx.font = '10px JetBrains Mono';
  ctx.textAlign = 'right';
  ctx.fillText(priceAtMouse.toFixed(2), padding.left - 8, mouseY + 3);

  // Time/index label on X-axis (bottom)
  let timeLabel = '' + (clampedIdx + 1);
  if (candle.time) {
    const d = new Date(candle.time * 1000);
    const hours = d.getHours().toString().padStart(2, '0');
    const mins = d.getMinutes().toString().padStart(2, '0');
    timeLabel = hours + ':' + mins;
    // If daily+ timeframe, show date with year
    if (['1D','1W','1M','3M','6M','1Y','2Y','3Y','5Y','MAX'].includes(currentTimeframe)) {
      const mon = (d.getMonth() + 1).toString().padStart(2, '0');
      const day = d.getDate().toString().padStart(2, '0');
      const yr = String(d.getFullYear()).slice(2);
      timeLabel = mon + '/' + day + '/' + yr;
    }
  }
  const timeLabelWidth = ctx.measureText(timeLabel).width + 10;
  ctx.fillStyle = '#2A2A38';
  ctx.fillRect(candleCenterX - timeLabelWidth / 2, padding.top + chartH + 1, timeLabelWidth, 20);
  ctx.fillStyle = '#A0A0B8';
  ctx.textAlign = 'center';
  ctx.fillText(timeLabel, candleCenterX, padding.top + chartH + 14);

  // Update the overlay data to show hovered candle
  updateChartOverlay([candle]);

  // Position and show tooltip
  if (crosshairTooltip) {
    const vol = candle.volume || 0;
    const volStr = vol >= 1e6 ? (vol / 1e6).toFixed(1) + 'M' : vol >= 1e3 ? (vol / 1e3).toFixed(1) + 'K' : vol.toString();

    crosshairTooltip.innerHTML =
      '<div class="ct-row"><span><span class="ct-label">O:</span> <span class="ct-val">' + candle.open.toFixed(2) + '</span></span>' +
      '<span><span class="ct-label">H:</span> <span class="ct-val">' + candle.high.toFixed(2) + '</span></span></div>' +
      '<div class="ct-row"><span><span class="ct-label">L:</span> <span class="ct-val">' + candle.low.toFixed(2) + '</span></span>' +
      '<span><span class="ct-label">C:</span> <span class="ct-val">' + candle.close.toFixed(2) + '</span></span></div>' +
      '<div class="ct-row ct-vol"><span><span class="ct-label">V:</span> <span class="ct-val">' + volStr + '</span></span></div>';

    // Position tooltip: 15px right and 15px above cursor, in CSS pixels (not canvas coords)
    const tooltipX = (e.clientX - rect.left) + 15;
    const tooltipY = (e.clientY - rect.top) - 15;

    // Clamp to stay within the chart area
    const maxX = rect.width - crosshairTooltip.offsetWidth - 5;
    const minY = 5;

    crosshairTooltip.style.left = Math.min(tooltipX, maxX) + 'px';
    crosshairTooltip.style.top = Math.max(tooltipY - crosshairTooltip.offsetHeight, minY) + 'px';
    crosshairTooltip.style.display = 'block';
  }
}

function onCrosshairLeave() {
  clearCrosshair();
  // Revert overlay to last candle
  if (currentChartCandles && currentChartCandles.length > 0) {
    updateChartOverlay(currentChartCandles);
  }
}

function clearCrosshair() {
  if (crosshairCanvas) {
    const ctx = crosshairCanvas.getContext('2d');
    ctx.clearRect(0, 0, crosshairCanvas.width, crosshairCanvas.height);
  }
  if (crosshairTooltip) {
    crosshairTooltip.style.display = 'none';
  }
}

function drawVolumeChartFromCandles(candles) {
  const canvas = document.getElementById('volumeCanvas');
  if (!canvas || !candles || candles.length === 0) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = rect.height + 'px';
  ctx.scale(dpr, dpr);

  let maxVol = 0;
  candles.forEach(c => { maxVol = Math.max(maxVol, c.volume || 0); });
  if (maxVol === 0) return;

  const barWidth = rect.width / candles.length;
  candles.forEach((c, i) => {
    const bullish = c.close >= c.open;
    ctx.fillStyle = bullish ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)';
    const h = ((c.volume || 0) / maxVol) * rect.height;
    ctx.fillRect(i * barWidth + 1, rect.height - h, barWidth - 2, h);
  });
}

// ---- TIMEFRAME BUTTONS ----
function setupTimeframeButtons() {
  document.querySelectorAll('.tf-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tf = btn.textContent.trim();
      currentTimeframe = tf;
      const mapping = TIMEFRAME_MAP[tf];
      if (mapping) {
        currentTimeframeRange = mapping.range;
      }
      fetchAndDrawChart(currentChartSymbol, tf);
    });
  });
}

// ---- CHART TYPE BUTTONS ----
function setupChartTypeButtons() {
  document.querySelectorAll('.ct-btn').forEach((btn, idx) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ct-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const types = ['candlestick', 'line', 'area'];
      currentChartType = types[idx] || 'candlestick';
      if (currentChartCandles) {
        drawChartWithType(currentChartCandles, currentChartType);
      } else {
        fetchAndDrawChart(currentChartSymbol, currentTimeframe);
      }
    });
  });
}

// ---- WATCHLIST CLICK-TO-CHART ----
function setupWatchlistClickToChart() {
  document.querySelectorAll('.wl-row[data-ticker]').forEach(row => {
    // Prevent duplicate handlers from stacking on repeated calls
    if (row._chartClickBound) return;
    row._chartClickBound = true;
    row.addEventListener('click', () => {
      const ticker = row.dataset.ticker;
      if (!ticker) return;

      // Highlight active row
      document.querySelectorAll('.wl-row').forEach(r => {
        r.style.background = '';
        r.classList.remove('wl-active');
      });
      row.style.background = 'var(--bg-tertiary)';
      row.classList.add('wl-active');

      // Update chart
      currentChartSymbol = ticker;
      fetchAndDrawChart(ticker, currentTimeframe);
      if (typeof fetchAndDisplayFundamentals === 'function') fetchAndDisplayFundamentals(ticker);
      // Clear metric card active state
      document.querySelectorAll('.metric-card').forEach(c => c.classList.remove('metric-active'));
    });
  });
}

// ---- CAP SIZE TOGGLE ----
function setupCapSizeToggle() {
  document.querySelectorAll('.cap-toggle .cap-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const cap = btn.dataset.cap;
      if (!cap) return;
      currentCapSize = cap;

      // Update active state (handled by existing code, but we also do logic here)
      const tickers = getActiveWatchlistTickers();
      updateWatchlistWithTickers(tickers);
    });
  });
}

function getActiveWatchlistTickers() {
  if (currentWatchlistTab === 'favorites' || !WATCHLIST_TAB_TICKERS[currentWatchlistTab]) {
    // Favorites = the user's OWN watchlist (built in onboarding and via every
    // Add-to-Watchlist button). Defaults only when they have none yet.
    if (typeof PortfolioManager !== 'undefined') {
      const mine = PortfolioManager.getWatchlist();
      if (Array.isArray(mine) && mine.length) return mine.slice(0, 20);
    }
    return CAP_SIZE_TICKERS[currentCapSize] || CAP_SIZE_TICKERS.large;
  }
  return WATCHLIST_TAB_TICKERS[currentWatchlistTab];
}

async function updateWatchlistWithTickers(tickers) {
  const tableEl = document.querySelector('.watchlist-table');
  if (!tableEl) return;

  // Keep header row
  const headerRow = tableEl.querySelector('.wl-header-row');
  const existingRows = tableEl.querySelectorAll('.wl-row');
  existingRows.forEach(r => r.remove());

  // Create placeholder rows for each ticker
  tickers.forEach(ticker => {
    const row = document.createElement('div');
    row.className = 'wl-row';
    row.setAttribute('data-ticker', ticker);
    row.innerHTML = `
      <span class="wl-ticker">${ticker}</span>
      <span class="wl-price">--</span>
      <span class="wl-change">--</span>
      <span class="wl-vol">--</span>
    `;
    tableEl.appendChild(row);
  });

  // Re-attach click handlers
  setupWatchlistClickToChart();

  // Fetch real quotes
  try {
    const resp = await fetch('/api/quotes?symbols=' + encodeURIComponent(tickers.join(',')));
    if (!resp.ok) throw new Error('Quote fetch failed');
    const quotes = await resp.json();
    tickers.forEach(ticker => {
      const q = quotes[ticker];
      if (!q) return;
      const row = tableEl.querySelector(`.wl-row[data-ticker="${ticker}"]`);
      if (!row) return;

      const priceEl = row.querySelector('.wl-price');
      const changeEl = row.querySelector('.wl-change');
      const volEl = row.querySelector('.wl-vol');

      if (priceEl) priceEl.textContent = q.price.toFixed(2);
      if (changeEl) {
        const isUp = q.changePct >= 0;
        changeEl.textContent = (isUp ? '+' : '') + q.changePct.toFixed(2) + '%';
        changeEl.className = 'wl-change ' + (isUp ? 'profit' : 'loss');
      }
      if (volEl && q.volume) {
        volEl.textContent = q.volume >= 1e6 ? (q.volume/1e6).toFixed(1) + 'M' : q.volume >= 1e3 ? (q.volume/1e3).toFixed(1) + 'K' : q.volume.toString();
      }
      row.classList.remove('profit', 'loss');
      row.classList.add(q.changePct >= 0 ? 'profit' : 'loss');
    });
  } catch (err) {
    console.warn('[Watchlist] Failed to fetch quotes:', err.message);
  }
}

// ---- WATCHLIST TABS ----
function setupWatchlistTabs() {
  document.querySelectorAll('.wl-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.wl-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tabName = btn.textContent.trim().toLowerCase();
      currentWatchlistTab = tabName;
      const tickers = getActiveWatchlistTickers();
      updateWatchlistWithTickers(tickers);
    });
  });
}

// ---- SECTOR HEATMAP PERIOD BUTTONS ----
function setupHeatmapPeriodButtons() {
  document.querySelectorAll('.hp-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.hp-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // If BigData is available, fetch real sector data for the selected period
      const period = btn.textContent.trim() || btn.dataset.period || '1D';
      fetchBigDataSectors(period);
    });
  });
}

async function fetchBigDataSectors(period) {
  if (typeof BigDataService === 'undefined' || !BigDataService.isAvailable()) return;

  try {
    const data = await BigDataService.getSectors(period);
    if (!data) return;

    const sectors = BigDataService.normalizeSectorData(data);
    if (!sectors || sectors.length === 0) return;

    updateHeatmapWithRealData(sectors);
  } catch (err) {
    console.error('[BigData] Sector heatmap error:', err);
  }
}

function updateHeatmapWithRealData(sectors) {
  // Find all heatmap cells and update them
  const heatmapCells = document.querySelectorAll('.hm-cell');
  if (!heatmapCells || heatmapCells.length === 0) return;

  // Map sector names to cells
  const sectorMap = {};
  sectors.forEach(function (s) { sectorMap[s.name.toUpperCase()] = s; });

  heatmapCells.forEach(function (cell) {
    const nameEl = cell.querySelector('.hm-name');
    const changeEl = cell.querySelector('.hm-change');
    if (!nameEl || !changeEl) return;

    const cellName = nameEl.textContent.trim().toUpperCase();
    // Try to match sector
    const match = sectorMap[cellName] ||
      Object.values(sectorMap).find(function (s) {
        return cellName.includes(s.name.toUpperCase()) || s.name.toUpperCase().includes(cellName);
      });

    if (match) {
      const change = match.change;
      const isUp = change >= 0;
      changeEl.textContent = (isUp ? '+' : '') + change.toFixed(2) + '%';

      // Update cell color based on performance
      cell.classList.remove('profit', 'loss');
      cell.classList.add(isUp ? 'profit' : 'loss');
      cell.style.background = isUp
        ? 'rgba(16, 185, 129, ' + Math.min(0.3, Math.abs(change) * 0.05) + ')'
        : 'rgba(239, 68, 68, ' + Math.min(0.3, Math.abs(change) * 0.05) + ')';
    }
  });
}

// ---- TICKER SEARCH (with autocomplete) ----
function setupTickerSearch() {
  const input = document.getElementById('tickerSearch');
  const dropdown = document.getElementById('searchDropdown');
  if (!input) return;

  let searchTimeout = null;
  let highlightIdx = -1;
  let currentResults = [];

  function closeDropdown() {
    if (dropdown) {
      dropdown.classList.remove('visible');
      dropdown.innerHTML = '';
    }
    highlightIdx = -1;
    currentResults = [];
  }

  function selectTicker(ticker) {
    ticker = ticker.toUpperCase().trim();
    if (!ticker) return;
    closeDropdown();
    input.value = '';

    // Show all watchlist rows again
    document.querySelectorAll('.wl-row[data-ticker]').forEach(row => { row.style.display = ''; });

    // Add to watchlist if not present
    let existingRow = document.querySelector('.wl-row[data-ticker="' + ticker + '"]');
    if (!existingRow) {
      const tableEl = document.querySelector('.watchlist-table');
      if (tableEl) {
        const row = document.createElement('div');
        row.className = 'wl-row';
        row.setAttribute('data-ticker', ticker);
        row.innerHTML =
          '<span class="wl-ticker">' + ticker + '</span>' +
          '<span class="wl-price">--</span>' +
          '<span class="wl-change">--</span>' +
          '<span class="wl-vol">--</span>';
        tableEl.appendChild(row);
        if (typeof setupWatchlistClickToChart === 'function') setupWatchlistClickToChart();

        // Fetch quote
        fetch('/api/quotes?symbols=' + encodeURIComponent(ticker))
          .then(function(r) { return r.ok ? r.json() : null; })
          .then(function(quotes) {
            if (!quotes) return;
            var q = quotes[ticker];
            if (!q) return;
            var priceEl = row.querySelector('.wl-price');
            var changeEl = row.querySelector('.wl-change');
            if (priceEl) priceEl.textContent = q.price.toFixed(2);
            if (changeEl) {
              var isUp = q.changePct >= 0;
              changeEl.textContent = (isUp ? '+' : '') + q.changePct.toFixed(2) + '%';
              changeEl.className = 'wl-change ' + (isUp ? 'profit' : 'loss');
            }
            row.classList.add(q.changePct >= 0 ? 'profit' : 'loss');
          })
          .catch(function() {});

        existingRow = row;
      }
    }

    // Highlight in watchlist
    document.querySelectorAll('.wl-row').forEach(function(r) {
      r.style.background = '';
      r.classList.remove('wl-active');
    });
    if (existingRow) {
      existingRow.style.background = 'var(--bg-tertiary)';
      existingRow.classList.add('wl-active');
    }
    currentChartSymbol = ticker;
    fetchAndDrawChart(ticker, currentTimeframe);
    if (typeof fetchAndDisplayFundamentals === 'function') fetchAndDisplayFundamentals(ticker);
    document.querySelectorAll('.metric-card').forEach(c => c.classList.remove('metric-active'));
  }

  function renderDropdown(results) {
    if (!dropdown) return;
    currentResults = results;
    highlightIdx = -1;
    if (!results || results.length === 0) {
      dropdown.innerHTML = '<div class="search-dropdown-empty">No results found</div>';
      dropdown.classList.add('visible');
      return;
    }
    dropdown.innerHTML = results.map(function(r, i) {
      return '<div class="search-dropdown-item" data-idx="' + i + '">' +
        '<span class="search-dd-ticker">' + (r.symbol || r.ticker || '') + '</span>' +
        '<span class="search-dd-name">' + (r.shortname || r.longname || r.name || '') + '</span>' +
        '<span class="search-dd-type">' + (r.quoteType || r.type || 'Equity') + '</span>' +
        '</div>';
    }).join('');
    dropdown.classList.add('visible');

    // Click handlers
    dropdown.querySelectorAll('.search-dropdown-item').forEach(function(item) {
      item.addEventListener('mousedown', function(e) {
        e.preventDefault();
        var idx = parseInt(item.dataset.idx);
        var r = currentResults[idx];
        if (r) selectTicker(r.symbol || r.ticker);
      });
    });
  }

  function updateHighlight() {
    var items = dropdown ? dropdown.querySelectorAll('.search-dropdown-item') : [];
    items.forEach(function(el, i) {
      el.classList.toggle('highlighted', i === highlightIdx);
    });
    if (items[highlightIdx]) {
      items[highlightIdx].scrollIntoView({ block: 'nearest' });
    }
  }

  async function doSearch(query) {
    if (!dropdown) return;
    dropdown.innerHTML = '<div class="search-dropdown-loading">Searching...</div>';
    dropdown.classList.add('visible');

    try {
      // Try Yahoo Finance search API through our proxy
      var resp = await fetch('/api/search?q=' + encodeURIComponent(query));
      if (resp.ok) {
        var data = await resp.json();
        var results = data.quotes || data.results || data;
        if (Array.isArray(results) && results.length > 0) {
          renderDropdown(results.slice(0, 8));
          return;
        }
      }
    } catch(e) { /* fallback below */ }

    // Fallback: search local watchlist + known tickers
    var q = query.toUpperCase();
    var nameMap = (typeof PortfolioManager !== 'undefined') ? {
      AAPL:'Apple Inc.', NVDA:'NVIDIA Corp.', MSFT:'Microsoft Corp.', TSLA:'Tesla Inc.',
      AMZN:'Amazon.com', GOOGL:'Alphabet Inc.', META:'Meta Platforms', AMD:'AMD Inc.',
      PLTR:'Palantir Tech', AI:'C3.ai Inc.', SOUN:'SoundHound AI', IONQ:'IonQ Inc.',
      JPM:'JPMorgan Chase', GS:'Goldman Sachs', BAC:'Bank of America', V:'Visa Inc.',
      MA:'Mastercard', SQ:'Block Inc.', COIN:'Coinbase', MARA:'Marathon Digital',
      RIOT:'Riot Platforms', MSTR:'MicroStrategy', SPY:'SPDR S&P 500', QQQ:'Invesco QQQ',
      IWM:'iShares Russell', DIA:'SPDR Dow Jones', GLD:'SPDR Gold', TLT:'iShares 20+ Yr'
    } : {};
    var matches = Object.keys(nameMap).filter(function(sym) {
      return sym.includes(q) || nameMap[sym].toUpperCase().includes(q);
    }).map(function(sym) {
      return { symbol: sym, shortname: nameMap[sym], quoteType: 'Equity' };
    });
    if (matches.length > 0) {
      renderDropdown(matches.slice(0, 8));
    } else if (q.length >= 1 && q.length <= 5 && /^[A-Z]+$/.test(q)) {
      // Show the raw ticker as a direct option
      renderDropdown([{ symbol: q, shortname: 'Search for ' + q, quoteType: 'Ticker' }]);
    } else {
      renderDropdown([]);
    }
  }

  // Input handler - autocomplete after 2 chars
  input.addEventListener('input', function() {
    var query = input.value.trim();
    if (searchTimeout) clearTimeout(searchTimeout);

    // Also filter watchlist while typing
    var q = query.toUpperCase();
    document.querySelectorAll('.wl-row[data-ticker]').forEach(function(row) {
      var ticker = row.dataset.ticker;
      row.style.display = (!q || ticker.includes(q)) ? '' : 'none';
    });

    if (query.length < 2) {
      closeDropdown();
      return;
    }
    searchTimeout = setTimeout(function() { doSearch(query); }, 300);
  });

  // Keyboard navigation
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      closeDropdown();
      input.blur();
      // Restore watchlist
      document.querySelectorAll('.wl-row[data-ticker]').forEach(function(row) { row.style.display = ''; });
      return;
    }

    var items = dropdown ? dropdown.querySelectorAll('.search-dropdown-item') : [];
    if (e.key === 'ArrowDown' && items.length > 0) {
      e.preventDefault();
      highlightIdx = Math.min(highlightIdx + 1, items.length - 1);
      updateHighlight();
      return;
    }
    if (e.key === 'ArrowUp' && items.length > 0) {
      e.preventDefault();
      highlightIdx = Math.max(highlightIdx - 1, 0);
      updateHighlight();
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightIdx >= 0 && currentResults[highlightIdx]) {
        selectTicker(currentResults[highlightIdx].symbol || currentResults[highlightIdx].ticker);
      } else {
        var ticker = input.value.trim().toUpperCase();
        if (ticker && ticker.length <= 6) {
          selectTicker(ticker);
        }
      }
    }
  });

  // Close on blur
  input.addEventListener('blur', function() {
    setTimeout(closeDropdown, 200);
  });
}

// ---- SPARKLINES (REAL DATA) ----
async function drawSparklinesReal() {
  const sparkConfig = {
    'spark-sp500': { symbol: 'SPY', fallbackTrend: 'up', upColor: '#10B981', downColor: '#EF4444' },
    'spark-nasdaq': { symbol: 'QQQ', fallbackTrend: 'up', upColor: '#10B981', downColor: '#EF4444' },
    'spark-dow': { symbol: 'DIA', fallbackTrend: 'down', upColor: '#10B981', downColor: '#EF4444' },
    'spark-russell': { symbol: 'IWM', fallbackTrend: 'up', upColor: '#10B981', downColor: '#EF4444' },
    'spark-vix': { symbol: '^VIX', fallbackTrend: 'up', upColor: '#EF4444', downColor: '#10B981' },
    'spark-yield': { symbol: 'TLT', fallbackTrend: 'flat', upColor: '#F59E0B', downColor: '#F59E0B' },
    'spark-tsx': { symbol: '^GSPTSE', fallbackTrend: 'up', upColor: '#10B981', downColor: '#EF4444' },
    'spark-cadusd': { symbol: 'CADUSD=X', fallbackTrend: 'flat', upColor: '#10B981', downColor: '#EF4444' },
  };

  for (const [id, config] of Object.entries(sparkConfig)) {
    const container = document.getElementById(id);
    if (!container) continue;
    container.innerHTML = ''; // clear old sparkline

    let data = null;
    try {
      const resp = await fetch(`/api/chart/${encodeURIComponent(config.symbol)}?interval=5m&range=1d`);
      if (resp.ok) {
        const chartData = await resp.json();
        if (chartData && chartData.candles && chartData.candles.length > 0) {
          data = chartData.candles.map(c => c.close);
        }
      }
    } catch (err) { /* fallback to generated */ }

    if (!data || data.length < 2) {
      // Generate fallback data
      data = [];
      let val = 50;
      const trendBias = config.fallbackTrend === 'up' ? 0.6 : config.fallbackTrend === 'down' ? -0.6 : 0;
      for (let i = 0; i < 30; i++) {
        val += (Math.random() - 0.5 + trendBias * 0.1) * 8;
        val = Math.max(10, Math.min(90, val));
        data.push(val);
      }
    }

    const isUp = data[data.length - 1] >= data[0];
    const color = isUp ? config.upColor : config.downColor;

    const canvas = document.createElement('canvas');
    container.appendChild(canvas);
    canvas.width = container.offsetWidth || 160;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    // Gradient fill
    ctx.beginPath();
    data.forEach((v, i) => {
      const x = (i / (data.length - 1)) * canvas.width;
      const y = ((max - v) / range) * (canvas.height - 4) + 2;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.lineTo(canvas.width, canvas.height);
    ctx.lineTo(0, canvas.height);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, color + '20');
    grad.addColorStop(1, color + '00');
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    data.forEach((v, i) => {
      const x = (i / (data.length - 1)) * canvas.width;
      const y = ((max - v) / range) * (canvas.height - 4) + 2;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

// ---- WATCHLIST HIGHLIGHTING (updated) ----
// Initial click handlers are set up by setupWatchlistClickToChart()

// ---- SIMULATED LIVE PRICE UPDATES ----
function simulatePriceUpdate() {
  // Only run simulated updates if MarketData is not connected
  if (typeof MarketData !== 'undefined' && MarketData.isConnected()) return;

  const rows = document.querySelectorAll('.wl-row');
  if (!rows.length) return;
  const row = rows[Math.floor(Math.random() * rows.length)];
  const priceEl = row.querySelector('.wl-price');
  const changeEl = row.querySelector('.wl-change');
  if (!priceEl || priceEl.textContent === '--') return;

  const oldPrice = parseFloat(priceEl.textContent);
  if (isNaN(oldPrice)) return;
  const delta = (Math.random() - 0.48) * oldPrice * 0.002;
  const newPrice = oldPrice + delta;
  priceEl.textContent = newPrice.toFixed(2);

  const pctChange = (delta / oldPrice) * 100;
  const totalChange = parseFloat(changeEl.textContent) + pctChange;

  if (delta > 0) {
    changeEl.textContent = '+' + Math.abs(totalChange).toFixed(2) + '%';
    changeEl.className = 'wl-change profit';
    row.classList.remove('flash-down', 'loss', 'profit');
    row.classList.add('flash-up', 'profit');
  } else {
    changeEl.textContent = '-' + Math.abs(totalChange).toFixed(2) + '%';
    changeEl.className = 'wl-change loss';
    row.classList.remove('flash-up', 'loss', 'profit');
    row.classList.add('flash-down', 'loss');
  }
  setTimeout(() => row.classList.remove('flash-up', 'flash-down'), 600);

  // If the updated ticker matches the chart, update chart overlay price
  const ticker = row.dataset.ticker;
  if (ticker === currentChartSymbol && currentChartCandles && currentChartCandles.length > 0) {
    const last = currentChartCandles[currentChartCandles.length - 1];
    last.close = newPrice;
    updateChartOverlay(currentChartCandles);
  }
}
setInterval(simulatePriceUpdate, 1500);

// ---- CLICKABLE METRIC CARDS ----
function setupMetricCardClicks() {
  document.querySelectorAll('.metric-card[data-symbol]').forEach(card => {
    card.addEventListener('click', () => {
      const symbol = card.dataset.symbol;
      if (!symbol) return;
      // Highlight active card
      document.querySelectorAll('.metric-card').forEach(c => c.classList.remove('metric-active'));
      card.classList.add('metric-active');
      // Update chart
      currentChartSymbol = symbol;
      fetchAndDrawChart(symbol, currentTimeframe);
      fetchAndDisplayFundamentals(symbol);
    });
  });
}

// ---- FUNDAMENTALS STRIP ----
function formatMarketCap(val) {
  if (val == null) return '--';
  if (val >= 1e12) return '$' + (val / 1e12).toFixed(2) + 'T';
  if (val >= 1e9) return '$' + (val / 1e9).toFixed(1) + 'B';
  if (val >= 1e6) return '$' + (val / 1e6).toFixed(0) + 'M';
  return '$' + val.toLocaleString();
}

function formatVolume(val) {
  if (val == null) return '--';
  if (val >= 1e9) return (val / 1e9).toFixed(1) + 'B';
  if (val >= 1e6) return (val / 1e6).toFixed(1) + 'M';
  if (val >= 1e3) return (val / 1e3).toFixed(1) + 'K';
  return val.toString();
}

function formatPrice(val) {
  if (val == null) return '--';
  return '$' + val.toFixed(2);
}

async function fetchAndDisplayFundamentals(symbol) {
  const ids = {
    fundMktCap: '--', fund52H: '--', fund52L: '--', fundOpen: '--',
    fundPrevClose: '--', fundVolume: '--', fundAvgVol: '--',
    fundPE: '--', fundEPS: '--', fundYield: '--', fundBeta: '--'
  };
  // Set loading state
  Object.keys(ids).forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '...';
  });

  try {
    const resp = await fetch('/api/fundamentals/' + encodeURIComponent(symbol));
    if (!resp.ok) throw new Error('API returned ' + resp.status);
    const d = await resp.json();

    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setVal('fundMktCap', formatMarketCap(d.marketCap));
    setVal('fund52H', formatPrice(d.fiftyTwoWeekHigh));
    setVal('fund52L', formatPrice(d.fiftyTwoWeekLow));
    setVal('fundOpen', formatPrice(d.open));
    setVal('fundPrevClose', formatPrice(d.previousClose));
    setVal('fundVolume', formatVolume(d.volume));
    setVal('fundAvgVol', formatVolume(d.averageVolume));
    setVal('fundPE', d.trailingPE != null ? d.trailingPE.toFixed(1) + 'x' : '--');
    setVal('fundEPS', d.eps != null ? '$' + d.eps.toFixed(2) : '--');
    setVal('fundYield', d.dividendYield != null ? (d.dividendYield * 100).toFixed(2) + '%' : '--');
    setVal('fundBeta', d.beta != null ? d.beta.toFixed(2) : '--');

    // Update company name and exchange in chart title
    const nameEl = document.getElementById('companyName');
    const exchEl = document.getElementById('companyExchange');
    if (nameEl) nameEl.textContent = d.longName || d.shortName || '';
    const exchMap = { NMS: 'NASDAQ', NGM: 'NASDAQ', NYQ: 'NYSE', PCX: 'ARCA', BTS: 'BATS', ASE: 'AMEX', OPR: 'OTC', PNK: 'OTC' };
    const exchDisplay = exchMap[d.exchangeSymbol] || d.exchangeSymbol || d.exchange || '';
    if (exchEl) exchEl.textContent = exchDisplay ? exchDisplay + ':' + symbol : symbol;

    // Populate SEC filings links
    populateFilingsLinks(symbol);
    // Populate news links
    populateNewsLinks(symbol);

  } catch (err) {
    console.warn('[Fundamentals] Failed for ' + symbol + ':', err.message);
    Object.keys(ids).forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '--';
    });
  }
}

function populateFilingsLinks(symbol) {
  const el = document.getElementById('companyFilings');
  if (!el) return;
  const secBase = 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=&CIK=' + encodeURIComponent(symbol) + '&type=';
  el.innerHTML =
    '<a href="' + secBase + '10-K&dateb=&owner=include&count=5&search_text=&action=getcompany" target="_blank"><span class="filing-type">10-K</span> Annual Report</a>' +
    '<a href="' + secBase + '10-Q&dateb=&owner=include&count=5&search_text=&action=getcompany" target="_blank"><span class="filing-type">10-Q</span> Quarterly Report</a>' +
    '<a href="' + secBase + '8-K&dateb=&owner=include&count=10&search_text=&action=getcompany" target="_blank"><span class="filing-type">8-K</span> Current Report</a>' +
    '<a href="' + secBase + 'DEF+14A&dateb=&owner=include&count=5&search_text=&action=getcompany" target="_blank"><span class="filing-type">DEF 14A</span> Proxy Statement</a>' +
    '<a href="https://finance.yahoo.com/quote/' + encodeURIComponent(symbol) + '/financials/" target="_blank"><span class="filing-type">YF</span> Financial Statements</a>' +
    '<a href="https://finance.yahoo.com/quote/' + encodeURIComponent(symbol) + '/analysis/" target="_blank"><span class="filing-type">YF</span> Analyst Estimates</a>';
}

async function populateNewsLinks(symbol) {
  const el = document.getElementById('companyNews');
  if (!el) return;
  el.innerHTML = '<span class="filings-placeholder">Loading news...</span>';

  try {
    const resp = await fetch('/api/news?symbols=' + encodeURIComponent(symbol));
    if (!resp.ok) throw new Error('API error');
    const data = await resp.json();
    const articles = (data.news || []).slice(0, 6);
    if (articles.length === 0) {
      el.innerHTML = '<span class="filings-placeholder">No recent news found</span>';
      return;
    }
    el.innerHTML = articles.map(a => {
      const date = a.providerPublishTime ? new Date(a.providerPublishTime * 1000) : null;
      const dateStr = date ? (date.getMonth() + 1) + '/' + date.getDate() : '';
      const title = (a.title || 'Untitled').replace(/</g, '&lt;');
      const link = a.link || '#';
      return '<a href="' + link + '" target="_blank"><span class="news-date">' + dateStr + '</span>' + title + '</a>';
    }).join('');
  } catch (err) {
    el.innerHTML = '<a href="https://finance.yahoo.com/quote/' + encodeURIComponent(symbol) + '/news/" target="_blank"><span class="news-date"></span>View news on Yahoo Finance</a>';
  }
}

// ---- INDICATORS SYSTEM ----

function loadIndicatorPrefs() {
  try {
    const saved = localStorage.getItem('greystone_indicators');
    if (saved) activeIndicators = JSON.parse(saved);
  } catch (e) { activeIndicators = {}; }
}

function saveIndicatorPrefs() {
  try {
    localStorage.setItem('greystone_indicators', JSON.stringify(activeIndicators));
  } catch (e) {}
}

function setupIndicatorDropdown() {
  const btn = document.getElementById('indicatorToggleBtn');
  const dropdown = document.getElementById('indicatorDropdown');
  if (!btn || !dropdown) return;

  // Load saved prefs and set checkboxes
  loadIndicatorPrefs();
  dropdown.querySelectorAll('input[data-indicator]').forEach(cb => {
    cb.checked = !!activeIndicators[cb.dataset.indicator];
  });

  // Set initial visibility of sub-panels
  const rsiPanel = document.getElementById('rsiPanel');
  const macdPanel = document.getElementById('macdPanel');
  if (rsiPanel) rsiPanel.style.display = activeIndicators.rsi ? 'block' : 'none';
  if (macdPanel) macdPanel.style.display = activeIndicators.macd ? 'block' : 'none';

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('open');
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target) && e.target !== btn) {
      dropdown.classList.remove('open');
    }
  });

  // Handle checkbox toggles
  dropdown.querySelectorAll('input[data-indicator]').forEach(cb => {
    cb.addEventListener('change', () => {
      activeIndicators[cb.dataset.indicator] = cb.checked;
      saveIndicatorPrefs();
      // Redraw chart with indicators
      if (currentChartCandles) {
        drawChartWithType(currentChartCandles, currentChartType);
        drawVolumeChartFromCandles(currentChartCandles);
      }
      // Show/hide RSI and MACD sub-panels
      const rsiPanel = document.getElementById('rsiPanel');
      const macdPanel = document.getElementById('macdPanel');
      if (rsiPanel) rsiPanel.style.display = activeIndicators.rsi ? 'block' : 'none';
      if (macdPanel) macdPanel.style.display = activeIndicators.macd ? 'block' : 'none';
      if (activeIndicators.rsi && currentChartCandles) drawRSIPanel(currentChartCandles);
      if (activeIndicators.macd && currentChartCandles) drawMACDPanel(currentChartCandles);
    });
  });
}

// ---- INDICATOR CALCULATIONS ----
function calcSMA(candles, period) {
  const result = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += candles[j].close;
    result.push(sum / period);
  }
  return result;
}

function calcEMA(candles, period) {
  const result = [];
  const k = 2 / (period + 1);
  let ema = null;
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    if (ema === null) {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += candles[j].close;
      ema = sum / period;
    } else {
      ema = candles[i].close * k + ema * (1 - k);
    }
    result.push(ema);
  }
  return result;
}

function calcRSI(candles, period) {
  const result = [];
  if (candles.length < period + 1) return candles.map(() => null);
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff > 0) avgGain += diff; else avgLoss += Math.abs(diff);
  }
  avgGain /= period;
  avgLoss /= period;
  for (let i = 0; i < period; i++) result.push(null);
  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  result.push(100 - 100 / (1 + rs));
  for (let i = period + 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const r = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result.push(100 - 100 / (1 + r));
  }
  return result;
}

function calcMACD(candles) {
  const ema12 = calcEMA(candles, 12);
  const ema26 = calcEMA(candles, 26);
  const macdLine = [];
  for (let i = 0; i < candles.length; i++) {
    if (ema12[i] == null || ema26[i] == null) { macdLine.push(null); continue; }
    macdLine.push(ema12[i] - ema26[i]);
  }
  // Signal line (9-period EMA of MACD)
  const signal = [];
  const k = 2 / 10;
  let sigEma = null;
  for (let i = 0; i < macdLine.length; i++) {
    if (macdLine[i] == null) { signal.push(null); continue; }
    if (sigEma === null) { sigEma = macdLine[i]; }
    else { sigEma = macdLine[i] * k + sigEma * (1 - k); }
    signal.push(sigEma);
  }
  const histogram = [];
  for (let i = 0; i < macdLine.length; i++) {
    if (macdLine[i] == null || signal[i] == null) { histogram.push(null); continue; }
    histogram.push(macdLine[i] - signal[i]);
  }
  return { macdLine, signal, histogram };
}

function calcVWAP(candles) {
  const result = [];
  let cumTPV = 0, cumVol = 0;
  for (let i = 0; i < candles.length; i++) {
    const tp = (candles[i].high + candles[i].low + candles[i].close) / 3;
    const vol = candles[i].volume || 0;
    cumTPV += tp * vol;
    cumVol += vol;
    result.push(cumVol > 0 ? cumTPV / cumVol : null);
  }
  return result;
}

function drawIndicatorOverlays(ctx, candles, padding, chartW, chartH, min, max, barWidth) {
  const indicators = activeIndicators;
  const drawLine = (data, color, lineWidth) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth || 1.5;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < data.length; i++) {
      if (data[i] == null) continue;
      const x = padding.left + i * barWidth + barWidth / 2;
      const y = padding.top + ((max - data[i]) / (max - min)) * chartH;
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  };

  if (indicators.sma20) drawLine(calcSMA(candles, 20), 'rgba(59, 130, 246, 0.7)');
  if (indicators.sma50) drawLine(calcSMA(candles, 50), 'rgba(249, 115, 22, 0.7)');
  if (indicators.sma200) drawLine(calcSMA(candles, 200), 'rgba(239, 68, 68, 0.7)');
  if (indicators.ema9) drawLine(calcEMA(candles, 9), 'rgba(6, 182, 212, 0.7)');
  if (indicators.ema21) drawLine(calcEMA(candles, 21), 'rgba(217, 70, 239, 0.7)');
  if (indicators.vwap) drawLine(calcVWAP(candles), 'rgba(148, 163, 184, 0.7)');

  // Bollinger Bands
  if (indicators.bb) {
    const sma20 = calcSMA(candles, 20);
    // Calculate standard deviation
    const upper = [], lower = [];
    for (let i = 0; i < candles.length; i++) {
      if (sma20[i] == null || i < 19) { upper.push(null); lower.push(null); continue; }
      let sumSq = 0;
      for (let j = i - 19; j <= i; j++) {
        sumSq += Math.pow(candles[j].close - sma20[i], 2);
      }
      const stdDev = Math.sqrt(sumSq / 20);
      upper.push(sma20[i] + 2 * stdDev);
      lower.push(sma20[i] - 2 * stdDev);
    }
    drawLine(upper, 'rgba(139, 92, 246, 0.3)');
    drawLine(lower, 'rgba(139, 92, 246, 0.3)');
    // Fill between bands
    ctx.fillStyle = 'rgba(139, 92, 246, 0.04)';
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < upper.length; i++) {
      if (upper[i] == null) continue;
      const x = padding.left + i * barWidth + barWidth / 2;
      const y = padding.top + ((max - upper[i]) / (max - min)) * chartH;
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    }
    for (let i = lower.length - 1; i >= 0; i--) {
      if (lower[i] == null) continue;
      const x = padding.left + i * barWidth + barWidth / 2;
      const y = padding.top + ((max - lower[i]) / (max - min)) * chartH;
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }

  // Update indicator overlay tags
  updateIndicatorTags(candles);
}

function updateIndicatorTags(candles) {
  const overlay = document.querySelector('.chart-indicators-overlay');
  if (!overlay) return;
  overlay.innerHTML = '';
  const last = candles[candles.length - 1];
  if (!last) return;
  const tags = [];
  if (activeIndicators.sma20) { const v = calcSMA(candles, 20); tags.push('SMA(20): ' + (v[v.length-1] || 0).toFixed(2)); }
  if (activeIndicators.sma50) { const v = calcSMA(candles, 50); const val = v[v.length-1]; if (val) tags.push('SMA(50): ' + val.toFixed(2)); }
  if (activeIndicators.sma200) { const v = calcSMA(candles, 200); const val = v[v.length-1]; if (val) tags.push('SMA(200): ' + val.toFixed(2)); }
  if (activeIndicators.ema9) { const v = calcEMA(candles, 9); const val = v[v.length-1]; if (val) tags.push('EMA(9): ' + val.toFixed(2)); }
  if (activeIndicators.ema21) { const v = calcEMA(candles, 21); const val = v[v.length-1]; if (val) tags.push('EMA(21): ' + val.toFixed(2)); }
  if (activeIndicators.rsi) { const v = calcRSI(candles, 14); const val = v[v.length-1]; if (val) tags.push('RSI(14): ' + val.toFixed(1)); }
  if (activeIndicators.macd) { const m = calcMACD(candles); const val = m.macdLine[m.macdLine.length-1]; if (val) tags.push('MACD: ' + val.toFixed(2)); }
  if (activeIndicators.bb) { const s = calcSMA(candles, 20); if (s[s.length-1]) tags.push('BB: ' + (s[s.length-1] - 10).toFixed(1) + ' / ' + (s[s.length-1] + 10).toFixed(1)); }
  if (activeIndicators.vwap) { const v = calcVWAP(candles); const val = v[v.length-1]; if (val) tags.push('VWAP: ' + val.toFixed(2)); }

  tags.forEach(t => {
    const span = document.createElement('span');
    span.className = 'ind-tag';
    span.textContent = t;
    overlay.appendChild(span);
  });
}

function drawRSIPanel(candles) {
  const canvas = document.getElementById('rsiCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const rsi = calcRSI(candles, 14);
  const pad = { left: 10, right: 60, top: 4, bottom: 4 };
  const w = canvas.width - pad.left - pad.right;
  const h = canvas.height - pad.top - pad.bottom;

  // Reference lines at 30 and 70
  [30, 70].forEach(level => {
    const y = pad.top + ((100 - level) / 100) * h;
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.15)';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(canvas.width - pad.right, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#5C5C6E';
    ctx.font = '9px JetBrains Mono';
    ctx.textAlign = 'left';
    ctx.fillText(level.toString(), canvas.width - pad.right + 4, y + 3);
  });

  // Draw RSI line
  const barWidth = w / candles.length;
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.8)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  let started = false;
  rsi.forEach((val, i) => {
    if (val == null) return;
    const x = pad.left + i * barWidth + barWidth / 2;
    const y = pad.top + ((100 - val) / 100) * h;
    if (!started) { ctx.moveTo(x, y); started = true; }
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function drawMACDPanel(candles) {
  const canvas = document.getElementById('macdCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const { macdLine, signal, histogram } = calcMACD(candles);
  const pad = { left: 10, right: 60, top: 4, bottom: 4 };
  const w = canvas.width - pad.left - pad.right;
  const h = canvas.height - pad.top - pad.bottom;

  // Find min/max for scaling
  let mn = Infinity, mx = -Infinity;
  macdLine.forEach(v => { if (v != null) { mn = Math.min(mn, v); mx = Math.max(mx, v); } });
  signal.forEach(v => { if (v != null) { mn = Math.min(mn, v); mx = Math.max(mx, v); } });
  histogram.forEach(v => { if (v != null) { mn = Math.min(mn, v); mx = Math.max(mx, v); } });
  if (mn === Infinity) return;
  const range = mx - mn || 1;
  mn -= range * 0.1;
  mx += range * 0.1;

  const barWidth = w / candles.length;

  // Zero line
  const zeroY = pad.top + ((mx - 0) / (mx - mn)) * h;
  ctx.strokeStyle = 'rgba(92, 92, 110, 0.3)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(pad.left, zeroY);
  ctx.lineTo(canvas.width - pad.right, zeroY);
  ctx.stroke();

  // Histogram bars
  histogram.forEach((val, i) => {
    if (val == null) return;
    const x = pad.left + i * barWidth;
    const barH = (Math.abs(val) / (mx - mn)) * h;
    const y = val >= 0 ? zeroY - barH : zeroY;
    ctx.fillStyle = val >= 0 ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)';
    ctx.fillRect(x + 1, y, barWidth - 2, barH);
  });

  // MACD line
  ctx.strokeStyle = 'rgba(59, 130, 246, 0.8)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  let started = false;
  macdLine.forEach((val, i) => {
    if (val == null) return;
    const x = pad.left + i * barWidth + barWidth / 2;
    const y = pad.top + ((mx - val) / (mx - mn)) * h;
    if (!started) { ctx.moveTo(x, y); started = true; }
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Signal line
  ctx.strokeStyle = 'rgba(249, 115, 22, 0.8)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  started = false;
  signal.forEach((val, i) => {
    if (val == null) return;
    const x = pad.left + i * barWidth + barWidth / 2;
    const y = pad.top + ((mx - val) / (mx - mn)) * h;
    if (!started) { ctx.moveTo(x, y); started = true; }
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

// ---- INIT ----
function init() {
  // Set up all dashboard interactivity
  setupTimeframeButtons();
  setupChartTypeButtons();
  setupWatchlistClickToChart();
  setupCapSizeToggle();
  setupWatchlistTabs();
  setupHeatmapPeriodButtons();
  setupTickerSearch();
  setupMetricCardClicks();
  setupIndicatorDropdown();

  // Set up crosshair overlay
  setupCrosshair();

  // Draw charts with real data (fallback to generated)
  fetchAndDrawChart(currentChartSymbol, currentTimeframe);
  fetchAndDisplayFundamentals(currentChartSymbol);
  drawSparklinesReal();
  if (typeof refreshAiActiveBadge === 'function') refreshAiActiveBadge();

  // Options, flow, agents
  populateOptionsChain();
  populateFlowFeed();
  drawAgentPerfChart();
  initSettingsApiKey();
  setupOptionsControls();
  setupStrategyBuilder();

  // Initialize MarketData service for live quotes
  if (typeof MarketData !== 'undefined') {
    MarketData.init();
  }

  // Initialize BigData.com service
  initBigDataService();
  initBigDataSettings();

  // Refresh AI insight cards on load (async, non-blocking)
  setTimeout(() => refreshInsightCards(), 1500);
}

// Redraw on resize
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (currentChartCandles) {
      drawChartWithType(currentChartCandles, currentChartType);
      drawVolumeChartFromCandles(currentChartCandles);
    }
    drawAgentPerfChart();
    drawNetFlowChart();
    // Redraw P&L if we have an active selection
    if (optionsState.selectedContract) {
      const c = optionsState.selectedContract;
      selectContract(c.type, c.strike, c.data);
    } else if (optionsState.strategyLegs.length > 0) {
      updateStrategyPnL();
    }
  }, 200);
});

document.addEventListener('DOMContentLoaded', init);
// Also run immediately in case DOM is already loaded
if (document.readyState !== 'loading') init();

/* ============================================
   TRADING AGENT UI INTEGRATION
   Signal Queue, Agent Cards, Execution Log, Perf Chart
   ============================================ */

// --- Modal helpers ---
function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('active');
}
function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('active');
}
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.remove('active');
  });
});

/* ============================================
   SIGNAL QUEUE SYSTEM
   ============================================ */

const SignalQueue = {
  signals: [],
  executionLog: [],
  _filterAgent: 'all',

  init() {
    this.signals = this._generateSampleSignals();
    this.executionLog = this._generateSampleExecutions();
    this.render();
    this.renderExecutionLog();
    this._startFreshnessTimer();
    this._wireEvents();
  },

  _generateSampleSignals() {
    const now = Date.now();
    return [
      {
        id: 's_1', ticker: 'NVDA', direction: 'BUY', entry: 878.50, stop: 865.00, target: 920.00,
        confidence: 82, thesis: 'Breakout above consolidation with volume confirmation. AI flow analysis shows institutional accumulation.',
        timestamp: now - 1800000, agent: 'Momentum Alpha', status: 'pending'
      },
      {
        id: 's_2', ticker: 'TSLA', direction: 'SELL', entry: 262.30, stop: 275.00, target: 240.00,
        confidence: 67, thesis: 'Bearish engulfing at resistance with declining momentum. Options flow heavily skewed to puts.',
        timestamp: now - 3600000, agent: 'Swing Trader', status: 'pending'
      },
      {
        id: 's_3', ticker: 'AAPL', direction: 'BUY', entry: 218.40, stop: 212.00, target: 235.00,
        confidence: 74, thesis: 'Mean reversion setup after 3-day pullback to 50-day MA. RSI at 35 with bullish divergence.',
        timestamp: now - 900000, agent: 'Value Scanner', status: 'pending'
      },
      {
        id: 's_4', ticker: 'META', direction: 'BUY', entry: 495.20, stop: 480.00, target: 530.00,
        confidence: 88, thesis: 'Strong earnings beat catalyst with raised guidance. Multiple analyst upgrades today.',
        timestamp: now - 300000, agent: 'Momentum Alpha', status: 'pending'
      },
      {
        id: 's_5', ticker: 'AMD', direction: 'SELL', entry: 172.80, stop: 180.00, target: 158.00,
        confidence: 59, thesis: 'Head and shoulders pattern completion. Volume declining on rallies, increasing on drops.',
        timestamp: now - 7200000, agent: 'Swing Trader', status: 'pending'
      }
    ];
  },

  _generateSampleExecutions() {
    const now = Date.now();
    return [
      { id: 'e_1', timestamp: now - 180000, agent: 'Momentum Alpha', action: 'ENTRY', ticker: 'MSFT', direction: 'BUY', price: 425.30, shares: 50, pnl: null },
      { id: 'e_2', timestamp: now - 600000, agent: 'Swing Trader', action: 'TARGET HIT', ticker: 'GOOGL', direction: 'BUY', price: 178.50, shares: 80, pnl: 1240 },
      { id: 'e_3', timestamp: now - 1200000, agent: 'Value Scanner', action: 'ENTRY', ticker: 'AMZN', direction: 'BUY', price: 185.20, shares: 60, pnl: null },
      { id: 'e_4', timestamp: now - 1800000, agent: 'Momentum Alpha', action: 'EXIT', ticker: 'NFLX', direction: 'SELL', price: 892.00, shares: 25, pnl: -380 },
      { id: 'e_5', timestamp: now - 2400000, agent: 'Swing Trader', action: 'STOP HIT', ticker: 'COIN', direction: 'BUY', price: 245.80, shares: 40, pnl: -720 },
      { id: 'e_6', timestamp: now - 3000000, agent: 'Value Scanner', action: 'TARGET HIT', ticker: 'JPM', direction: 'BUY', price: 202.40, shares: 100, pnl: 1850 },
      { id: 'e_7', timestamp: now - 3600000, agent: 'Momentum Alpha', action: 'ENTRY', ticker: 'PLTR', direction: 'BUY', price: 23.42, shares: 200, pnl: null },
      { id: 'e_8', timestamp: now - 5400000, agent: 'Swing Trader', action: 'EXIT', ticker: 'ROKU', direction: 'SELL', price: 78.30, shares: 60, pnl: 540 },
      { id: 'e_9', timestamp: now - 7200000, agent: 'Value Scanner', action: 'ENTRY', ticker: 'DIS', direction: 'BUY', price: 112.50, shares: 90, pnl: null },
      { id: 'e_10', timestamp: now - 9000000, agent: 'Momentum Alpha', action: 'TARGET HIT', ticker: 'SMCI', direction: 'BUY', price: 920.00, shares: 15, pnl: 2100 },
      { id: 'e_11', timestamp: now - 10800000, agent: 'Swing Trader', action: 'STOP HIT', ticker: 'RIVN', direction: 'BUY', price: 14.20, shares: 300, pnl: -450 },
      { id: 'e_12', timestamp: now - 14400000, agent: 'Value Scanner', action: 'EXIT', ticker: 'V', direction: 'BUY', price: 282.90, shares: 45, pnl: 675 },
      { id: 'e_13', timestamp: now - 18000000, agent: 'Momentum Alpha', action: 'ENTRY', ticker: 'CRM', direction: 'BUY', price: 298.50, shares: 35, pnl: null },
      { id: 'e_14', timestamp: now - 21600000, agent: 'Swing Trader', action: 'TARGET HIT', ticker: 'UBER', direction: 'BUY', price: 78.90, shares: 120, pnl: 960 },
    ];
  },

  _wireEvents() {
    const agentFilter = document.getElementById('signalAgentFilter');
    if (agentFilter) {
      agentFilter.addEventListener('change', () => {
        this._filterAgent = agentFilter.value;
        this.render();
      });
    }
    const clearBtn = document.getElementById('signalClearExpired');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        this.signals = this.signals.filter(s => s.status !== 'expired');
        this.render();
      });
    }
    // Execution log filter
    const execFilter = document.getElementById('execLogAgentFilter');
    if (execFilter) {
      execFilter.addEventListener('change', () => this.renderExecutionLog());
    }
    // Collapse toggle
    const collapseBtn = document.getElementById('execLogCollapseBtn');
    const logBody = document.getElementById('executionLogBody');
    if (collapseBtn && logBody) {
      collapseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        collapseBtn.classList.toggle('collapsed');
        logBody.classList.toggle('collapsed');
      });
    }
    // Also allow header click to collapse
    const logHeader = document.getElementById('executionLogHeader');
    if (logHeader) {
      logHeader.addEventListener('click', () => {
        if (collapseBtn) collapseBtn.classList.toggle('collapsed');
        if (logBody) logBody.classList.toggle('collapsed');
      });
    }
  },

  _startFreshnessTimer() {
    setInterval(() => {
      // Update freshness bars and expire old signals
      this.signals.forEach(s => {
        if (s.status !== 'pending') return;
        const age = Date.now() - s.timestamp;
        if (age > 14400000) { // 4 hours
          s.status = 'expired';
        }
      });
      // Update DOM freshness without full re-render
      document.querySelectorAll('.signal-row[data-signal-id]').forEach(row => {
        const sig = this.signals.find(s => s.id === row.dataset.signalId);
        if (!sig || sig.status !== 'pending') return;
        const bar = row.querySelector('.signal-freshness-bar');
        const timeEl = row.querySelector('.signal-time');
        if (bar) {
          const age = Date.now() - sig.timestamp;
          const pct = Math.max(0, 100 - (age / 14400000) * 100);
          bar.style.width = pct + '%';
          bar.className = 'signal-freshness-bar ' + (pct > 60 ? 'fresh' : pct > 30 ? 'aging' : pct > 0 ? 'stale' : 'expired');
        }
        if (timeEl) timeEl.textContent = this._formatAge(sig.timestamp);
      });
    }, 5000);
  },

  _formatAge(ts) {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ' + (mins % 60) + 'm';
    return Math.floor(hrs / 24) + 'd ago';
  },

  _getConfidenceClass(conf) {
    if (conf >= 75) return 'high';
    if (conf >= 55) return 'medium';
    return 'low';
  },

  approveSignal(id) {
    const sig = this.signals.find(s => s.id === id);
    if (!sig) return;
    sig.status = 'approved';
    // Add to execution log
    this.executionLog.unshift({
      id: 'e_' + Date.now(),
      timestamp: Date.now(),
      agent: sig.agent,
      action: 'ENTRY',
      ticker: sig.ticker,
      direction: sig.direction,
      price: sig.entry,
      shares: Math.floor(10000 / sig.entry),
      pnl: null
    });
    // Animate out
    const row = document.querySelector(`[data-signal-id="${id}"]`);
    if (row) {
      row.classList.add('signal-approved');
      setTimeout(() => this.render(), 400);
    }
    this.renderExecutionLog();
  },

  rejectSignal(id) {
    const sig = this.signals.find(s => s.id === id);
    if (!sig) return;
    sig.status = 'rejected';
    const row = document.querySelector(`[data-signal-id="${id}"]`);
    if (row) {
      row.classList.add('signal-rejected');
      setTimeout(() => this.render(), 400);
    }
  },

  modifySignal(id) {
    const sig = this.signals.find(s => s.id === id);
    if (!sig) return;
    // Simple inline modify: prompt for new entry price
    const newEntry = prompt(`Modify entry price for ${sig.ticker} (current: $${sig.entry.toFixed(2)}):`, sig.entry.toFixed(2));
    if (newEntry && !isNaN(parseFloat(newEntry))) {
      sig.entry = parseFloat(newEntry);
      this.render();
    }
  },

  filterByAgent(agentName) {
    this._filterAgent = agentName;
    const select = document.getElementById('signalAgentFilter');
    if (select) select.value = agentName;
    this.render();
  },

  render() {
    const body = document.getElementById('signalQueueBody');
    const countEl = document.getElementById('signalQueueCount');
    if (!body) return;

    const pending = this.signals.filter(s => s.status === 'pending');
    const filtered = this._filterAgent === 'all'
      ? pending
      : pending.filter(s => s.agent === this._filterAgent);

    if (countEl) countEl.textContent = pending.length + ' pending';

    // Update agent filter dropdown
    const select = document.getElementById('signalAgentFilter');
    if (select) {
      const agents = [...new Set(this.signals.map(s => s.agent))];
      const currentVal = select.value;
      select.innerHTML = '<option value="all">All Agents</option>';
      agents.forEach(a => {
        select.innerHTML += `<option value="${a}"${currentVal === a ? ' selected' : ''}>${a}</option>`;
      });
    }

    if (filtered.length === 0) {
      body.innerHTML = '<div class="signal-queue-empty">No pending signals. Agents are scanning for opportunities.</div>';
      return;
    }

    body.innerHTML = filtered.map(sig => {
      const age = Date.now() - sig.timestamp;
      const freshPct = Math.max(0, 100 - (age / 14400000) * 100);
      const freshClass = freshPct > 60 ? 'fresh' : freshPct > 30 ? 'aging' : freshPct > 0 ? 'stale' : 'expired';
      const confClass = this._getConfidenceClass(sig.confidence);
      const dirClass = sig.direction.toLowerCase();

      return `<div class="signal-row direction-${dirClass}" data-signal-id="${sig.id}">
        <span class="signal-ticker">${sig.ticker}</span>
        <span class="signal-direction ${dirClass}">${sig.direction}</span>
        <span class="signal-price">$${sig.entry.toFixed(2)}</span>
        <span class="signal-stop">$${sig.stop.toFixed(2)}</span>
        <span class="signal-target">$${sig.target.toFixed(2)}</span>
        <span class="signal-confidence-badge ${confClass}">${sig.confidence}%</span>
        <span class="signal-thesis" title="${sig.thesis}">${sig.thesis}</span>
        <span class="signal-meta">
          <span class="signal-time">${this._formatAge(sig.timestamp)}</span>
          <span class="signal-freshness"><span class="signal-freshness-bar ${freshClass}" style="width:${freshPct}%"></span></span>
        </span>
        <span class="signal-actions">
          <button class="signal-action-btn approve" onclick="SignalQueue.approveSignal('${sig.id}')">Approve</button>
          <button class="signal-action-btn reject" onclick="SignalQueue.rejectSignal('${sig.id}')">Reject</button>
          <button class="signal-action-btn modify" onclick="SignalQueue.modifySignal('${sig.id}')">Modify</button>
        </span>
      </div>`;
    }).join('');
  },

  renderExecutionLog() {
    const rows = document.getElementById('execLogRows');
    const countEl = document.getElementById('execLogCount');
    const filterVal = document.getElementById('execLogAgentFilter')?.value || 'all';
    if (!rows) return;

    // Update exec filter dropdown
    const execSelect = document.getElementById('execLogAgentFilter');
    if (execSelect) {
      const agents = [...new Set(this.executionLog.map(e => e.agent))];
      const currentVal = execSelect.value;
      execSelect.innerHTML = '<option value="all">All Agents</option>';
      agents.forEach(a => {
        execSelect.innerHTML += `<option value="${a}"${currentVal === a ? ' selected' : ''}>${a}</option>`;
      });
    }

    let entries = this.executionLog;
    if (filterVal !== 'all') {
      entries = entries.filter(e => e.agent === filterVal);
    }
    entries = entries.slice(0, 50);

    if (countEl) countEl.textContent = entries.length + ' entries';

    if (entries.length === 0) {
      rows.innerHTML = '<div class="signal-queue-empty">No execution history yet.</div>';
      return;
    }

    rows.innerHTML = entries.map(e => {
      const actionClass = e.action === 'ENTRY' ? 'entry' :
                           e.action === 'STOP HIT' ? 'stop-hit' :
                           e.action === 'TARGET HIT' ? 'target-hit' : 'exit';
      const pnlClass = e.pnl === null ? 'neutral' : e.pnl >= 0 ? 'profit' : 'loss';
      const pnlText = e.pnl === null ? '-' : (e.pnl >= 0 ? '+' : '') + '$' + Math.abs(e.pnl).toLocaleString();
      const time = new Date(e.timestamp);
      const timeStr = time.getHours().toString().padStart(2, '0') + ':' +
                      time.getMinutes().toString().padStart(2, '0') + ':' +
                      time.getSeconds().toString().padStart(2, '0');

      return `<div class="exec-log-row">
        <span class="el-time">${timeStr}</span>
        <span class="el-agent">${e.agent}</span>
        <span class="el-action ${actionClass}">${e.action}</span>
        <span class="el-ticker">${e.ticker}</span>
        <span class="el-dir">${e.direction}</span>
        <span class="el-price">$${e.price.toFixed(2)}</span>
        <span class="el-shares">${e.shares}</span>
        <span class="el-pnl ${pnlClass}">${pnlText}</span>
      </div>`;
    }).join('');
  }
};

/* ============================================
   DEFAULT AGENTS (enhanced with signal counts)
   ============================================ */

const DEFAULT_AGENTS_DATA = [
  { id: 'agent_momentum', name: 'Momentum Alpha', strategy: 'Momentum', status: 'running', todayPnl: 1250, totalPnl: 18420, winRate: 62, tradesToday: 3, maxDrawdown: -4200, signals: 12 },
  { id: 'agent_swing', name: 'Swing Trader', strategy: 'Mean Reversion', status: 'running', todayPnl: -380, totalPnl: 8750, winRate: 55, tradesToday: 1, maxDrawdown: -2800, signals: 5 },
  { id: 'agent_gamma', name: 'Gamma Scalper', strategy: 'Options', status: 'paused', todayPnl: 0, totalPnl: 5200, winRate: 71, tradesToday: 0, maxDrawdown: -1500, signals: 0 },
  { id: 'agent_value', name: 'Value Scanner', strategy: 'Value', status: 'running', todayPnl: 420, totalPnl: 12100, winRate: 58, tradesToday: 2, maxDrawdown: -3100, signals: 8 }
];

// In-memory store for standalone agent data (used when AgentManager is not loaded)
let _standaloneAgents = [];

function getAgentsList() {
  // Try AgentManager first, fall back to standalone
  if (typeof AgentManager !== 'undefined') {
    const managed = AgentManager.getAll();
    if (managed.length > 0) return { source: 'manager', agents: managed };
  }
  return { source: 'standalone', agents: _standaloneAgents };
}

// --- Default agent instances ---
const defaultAgents = {
  arb: null,
  swing: null,
  gamma: null,
  meanrev: null,
};

function initDefaultAgents() {
  if (typeof ArbitrageHunter !== 'undefined') {
    defaultAgents.arb = new ArbitrageHunter({ id: 'arb-hunter' });
    defaultAgents.swing = new SwingMomentum({ id: 'swing-momentum' });
    defaultAgents.gamma = new GammaScalper({ id: 'gamma-scalper' });
    defaultAgents.meanrev = new MeanReversion({ id: 'mean-reversion' });

    AgentManager.register(defaultAgents.arb);
    AgentManager.register(defaultAgents.swing);
    AgentManager.register(defaultAgents.gamma);
    AgentManager.register(defaultAgents.meanrev);
  }
  // Always init standalone agents from default data
  const saved = localStorage.getItem('gst_custom_agents');
  const customAgents = saved ? JSON.parse(saved) : [];
  _standaloneAgents = [...DEFAULT_AGENTS_DATA, ...customAgents];
}

// --- Render agent cards ---
function renderAgentCards() {
  const grid = document.getElementById('agentsGrid');
  if (!grid) return;
  grid.innerHTML = '';

  const { source, agents } = getAgentsList();

  if (source === 'manager') {
    agents.forEach(agent => {
      grid.appendChild(createAgentCard(agent));
    });
  } else {
    agents.forEach(agent => {
      grid.appendChild(createStandaloneAgentCard(agent));
    });
  }

  // Deploy new agent card
  const deployCard = document.createElement('div');
  deployCard.className = 'agent-card new-agent';
  deployCard.innerHTML = `
    <div class="new-agent-inner">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M12 5v14M5 12h14"/></svg>
      <h3>Deploy New Agent</h3>
      <p>Configure strategy, sizing, and risk parameters</p>
      <div class="new-agent-templates">
        <span class="template-tag">Momentum</span>
        <span class="template-tag">Mean Reversion</span>
        <span class="template-tag">Breakout</span>
        <span class="template-tag">Value</span>
        <span class="template-tag">Options</span>
        <span class="template-tag">AI Signal</span>
      </div>
    </div>
  `;
  deployCard.addEventListener('click', () => openModal('deployAgentModal'));
  grid.appendChild(deployCard);
}

function createStandaloneAgentCard(agent) {
  const isRunning = agent.status === 'running';
  const isPaused = agent.status === 'paused';
  const isStopped = agent.status === 'stopped';
  const stateClass = isRunning ? 'running' : isPaused ? 'paused' : 'stopped';
  const stateLabel = isRunning ? 'RUNNING' : isPaused ? 'PAUSED' : 'STOPPED';

  const card = document.createElement('div');
  card.className = `agent-card${isRunning ? ' active' : ''}`;
  card.id = `card-${agent.id}`;

  const todayClass = agent.todayPnl >= 0 ? 'profit' : 'loss';
  const todaySign = agent.todayPnl >= 0 ? '+' : '';
  const totalClass = agent.totalPnl >= 0 ? 'profit' : 'loss';
  const totalSign = agent.totalPnl >= 0 ? '+' : '';
  const ddClass = agent.maxDrawdown < 0 ? 'loss' : '';

  card.innerHTML = `
    <div class="agent-header">
      <div class="agent-status-dot ${stateClass}"></div>
      <h3 class="agent-name">${agent.name}</h3>
      ${agent.signals > 0 ? `<span class="agent-signals-count">${agent.signals} signals</span>` : ''}
      <span class="agent-badge ${stateClass}">${stateLabel}</span>
    </div>
    <div class="agent-stats">
      <div class="agent-stat">
        <span class="as-label">Strategy</span>
        <span class="as-value">${agent.strategy}</span>
      </div>
      <div class="agent-stat">
        <span class="as-label">Today's P&L</span>
        <span class="as-value ${todayClass}">${todaySign}$${Math.abs(agent.todayPnl).toLocaleString()}</span>
      </div>
      <div class="agent-stat">
        <span class="as-label">Total P&L</span>
        <span class="as-value ${totalClass}">${totalSign}$${Math.abs(agent.totalPnl).toLocaleString()}</span>
      </div>
      <div class="agent-stat">
        <span class="as-label">Win Rate</span>
        <span class="as-value">${agent.winRate}%</span>
      </div>
      <div class="agent-stat">
        <span class="as-label">Trades Today</span>
        <span class="as-value">${agent.tradesToday}</span>
      </div>
      <div class="agent-stat">
        <span class="as-label">Max Drawdown</span>
        <span class="as-value ${ddClass}">$${Math.abs(agent.maxDrawdown).toLocaleString()}</span>
      </div>
    </div>
    <div class="agent-controls">
      ${isRunning
        ? `<button class="agent-btn pause" data-action="toggle" data-agent="${agent.id}">Pause</button>`
        : `<button class="agent-btn start" data-action="toggle" data-agent="${agent.id}">${isPaused ? 'Resume' : 'Start'}</button>`
      }
      ${agent.signals > 0 ? `<button class="agent-btn agent-view-signals-btn" data-action="viewSignals" data-agent-name="${agent.name}">View Signals</button>` : ''}
      <button class="agent-btn" data-action="configure" data-agent="${agent.id}">Configure</button>
      <button class="agent-btn" data-action="logs" data-agent="${agent.id}">Logs</button>
    </div>
  `;

  card.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      if (action === 'toggle') {
        agent.status = isRunning ? 'paused' : 'running';
        renderAgentCards();
      } else if (action === 'viewSignals') {
        SignalQueue.filterByAgent(btn.dataset.agentName);
        document.querySelector('.signal-queue-panel')?.scrollIntoView({ behavior: 'smooth' });
      } else if (action === 'configure') {
        if (typeof AgentManager !== 'undefined') {
          const managed = AgentManager.get(agent.id);
          if (managed) { openConfigModal(managed); return; }
        }
        alert('Agent configuration: ' + agent.name + ' - ' + agent.strategy);
      } else if (action === 'logs') {
        if (typeof AgentManager !== 'undefined') {
          const managed = AgentManager.get(agent.id);
          if (managed) { openLogsModal(managed); return; }
        }
        alert('Agent logs for ' + agent.name + ' - no log data in standalone mode.');
      }
    });
  });

  return card;
}

/* ============================================
   AGENT BACKTEST GATE (safety prerequisite)
   An agent may not start until it has PASSED a real backtest. The backtest runs
   the deterministic services/backtest.js engine on real historical bars pulled
   from /api/chart, then hands the result to agent.setBacktestResult(result),
   which returns { passed, reasons }. The engine owns the pass/fail decision;
   this UI never fabricates a passing result. Agents whose tick-based strategy
   has no faithful bar-based equivalent show "bridge pending" and stay gated.
   ============================================ */

function btEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

// Map an agent to a backtestable, bar-based strategy ONLY where it is honest to
// do so. A momentum/swing agent maps to the SMA-crossover proving strategy.
// Everything else (mean reversion, statistical arbitrage, gamma scalping) has
// no faithful single-symbol bar backtest yet -> null (bridge pending, gated).
function backtestPlanForAgent(agent) {
  var hay = (
    String((agent && agent.id) || '') + ' ' +
    String((agent && agent.name) || '') + ' ' +
    String((agent && agent.strategy) || '')
  ).toLowerCase();
  if (/swing|momentum|trend|breakout/.test(hay)) {
    return { strategyKind: 'smaCrossover', fast: 20, slow: 50, label: 'SMA 20/50 crossover (momentum proxy)' };
  }
  return null;
}

// Resolve the current gate for an agent. Prefers the engine contract
// (agent.canStart / agent.validation); falls back fail-closed when the engine
// build is not present in this runtime (Start stays disabled).
function agentGateState(agent) {
  var v = (agent && agent.validation) || {};
  var passedFromUi = !!(agent && agent._btUi && agent._btUi.gate && agent._btUi.gate.passed);
  var backtested = !!v.backtested || passedFromUi;
  if (agent && typeof agent.canStart === 'function') {
    try {
      var g = agent.canStart() || {};
      return {
        ok: !!g.ok,
        reason: g.reason || (g.ok ? '' : 'Backtest required before running'),
        backtested: backtested,
        paperValidated: !!v.paperValidated,
      };
    } catch (e) { /* fall through to fail-closed */ }
  }
  return {
    ok: passedFromUi,
    reason: passedFromUi ? '' : 'Backtest required before running',
    backtested: backtested,
    paperValidated: !!v.paperValidated,
  };
}

// Build the in-card backtest block from the agent's last run (agent._btUi).
function renderBacktestBlockHtml(agent) {
  var ui = agent && agent._btUi;
  var body;

  if (!ui) {
    body = '<div class="bt-msg bt-idle">No backtest yet. Run a real backtest to unlock Start.</div>';
  } else if (ui.running) {
    body = '<div class="bt-msg">Running backtest on ' + btEsc(ui.symbol) + '...</div>';
  } else if (ui.bridgePending) {
    body = '<div class="bt-msg bt-pending">Backtest bridge pending. This tick-based strategy has no faithful bar-based backtest yet, so the agent stays gated (fail-closed).</div>';
  } else if (ui.error) {
    body = '<div class="bt-msg bt-error">Backtest could not run: ' + btEsc(ui.error) + '. Agent stays gated.</div>';
  } else if (ui.result) {
    var r = ui.result;
    var g = ui.gate || { passed: false, reasons: [] };
    var mkMetric = function (label, value, cls) {
      return '<div class="bt-metric"><span class="bt-m-label">' + label + '</span>' +
        '<span class="bt-m-value ' + (cls || '') + '">' + value + '</span></div>';
    };
    var tr = (typeof r.totalReturn === 'number') ? r.totalReturn * 100 : null;
    var sh = (typeof r.annualizedSharpe === 'number') ? r.annualizedSharpe : null;
    var dd = (typeof r.maxDrawdown === 'number') ? r.maxDrawdown * 100 : null;
    var wr = (typeof r.winRate === 'number') ? r.winRate * 100 : null;
    var nt = (typeof r.numTrades === 'number') ? r.numTrades : null;
    var metrics =
      mkMetric('Total Return', tr == null ? '-' : (tr >= 0 ? '+' : '') + tr.toFixed(2) + '%', tr == null ? '' : (tr >= 0 ? 'profit' : 'loss')) +
      mkMetric('Ann. Sharpe', sh == null ? '-' : sh.toFixed(2), (sh != null && sh < 0) ? 'loss' : '') +
      mkMetric('Max Drawdown', dd == null ? '-' : '-' + dd.toFixed(2) + '%', 'loss') +
      mkMetric('Trades', nt == null ? '-' : String(nt), '') +
      mkMetric('Win Rate', wr == null ? '-' : wr.toFixed(1) + '%', '');
    var badge = '<span class="bt-badge ' + (g.passed ? 'pass' : 'fail') + '">' + (g.passed ? 'PASS' : 'FAIL') + '</span>';
    var reasons = '';
    if (Array.isArray(g.reasons) && g.reasons.length) {
      reasons = '<ul class="bt-reasons ' + (g.passed ? 'pass' : 'fail') + '">' + g.reasons.map(function (rz) {
        return '<li>' + btEsc(rz) + '</li>';
      }).join('') + '</ul>';
    }
    body =
      '<div class="bt-result-head">' + badge +
      '<span class="bt-meta">' + btEsc(ui.symbol) + ' &middot; ' + btEsc(ui.label) + '</span></div>' +
      '<div class="bt-metrics">' + metrics + '</div>' +
      reasons;
  } else {
    body = '<div class="bt-msg bt-idle">No backtest yet.</div>';
  }

  var running = !!(ui && ui.running);
  var btnLabel = running ? 'Running...' : ((ui && (ui.result || ui.error || ui.bridgePending)) ? 'Re-run Backtest' : 'Run Backtest');
  var runBtn = '<button class="agent-btn bt-run-btn" data-action="backtest" data-agent="' + btEsc(agent.id) + '"' +
    (running ? ' disabled' : '') + '>' + btnLabel + '</button>';

  return '<div class="agent-backtest">' +
    '<div class="bt-head"><span class="bt-title">Backtest Gate</span></div>' +
    '<div class="bt-result">' + body + '</div>' +
    '<div class="bt-actions">' + runBtn + '</div>' +
    '</div>';
}

// Run a REAL backtest for an agent, wire the result through the engine gate, and
// re-render so the Start gate re-evaluates. Never fabricates a passing result.
async function runAgentBacktest(agent) {
  if (!agent) return;
  var plan = backtestPlanForAgent(agent);

  // Fail-closed: no faithful bar-based strategy for this agent. Record the
  // pending state and keep the agent gated. Do NOT call setBacktestResult.
  if (!plan) {
    agent._btUi = { bridgePending: true, ranAt: Date.now() };
    renderAgentCards();
    if (typeof showToast === 'function') showToast(agent.name + ': backtest bridge pending. Strategy stays gated.', 'info');
    return;
  }

  if (typeof Backtest === 'undefined' || !Backtest || typeof Backtest.runBacktest !== 'function') {
    agent._btUi = { error: 'Backtest engine not loaded', ranAt: Date.now() };
    renderAgentCards();
    if (typeof showToast === 'function') showToast('Backtest engine not loaded. Agent stays gated.', 'error');
    return;
  }

  var symbol = (agent.symbols && agent.symbols.length) ? String(agent.symbols[0]).toUpperCase() : 'SPY';
  agent._btUi = { running: true, symbol: symbol, label: plan.label };
  renderAgentCards();

  try {
    var resp = await fetch('/api/chart/' + encodeURIComponent(symbol) + '?interval=1d&range=2y');
    if (!resp.ok) throw new Error('chart API returned ' + resp.status);
    var data = await resp.json();
    var candles = (data && Array.isArray(data.candles)) ? data.candles : [];
    var minBars = plan.slow + 5;
    if (candles.length < minBars) throw new Error('insufficient history (' + candles.length + ' bars, need >= ' + minBars + ')');

    var bars = candles.map(function (c) {
      // /api/chart returns Yahoo epoch SECONDS; the engine treats numbers >= 1e6
      // as ms, so convert seconds -> ms for a correct time span / annualization.
      var t = (typeof c.time === 'number' && c.time < 1e12) ? c.time * 1000 : c.time;
      return { time: t, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume };
    });

    var strategy = Backtest.strategies.smaCrossover(plan.fast, plan.slow);
    var result = Backtest.runBacktest({ bars: bars, strategy: strategy, initialCapital: 100000, options: { periodsPerYear: 252 } });

    // The engine owns pass/fail. If the contract is absent in this runtime, stay
    // fail-closed (never self-declare a pass).
    var gate = { passed: false, reasons: ['Gate engine (setBacktestResult) unavailable; strategy stays gated.'] };
    if (typeof agent.setBacktestResult === 'function') {
      var gr = agent.setBacktestResult(result) || {};
      gate = { passed: !!gr.passed, reasons: Array.isArray(gr.reasons) ? gr.reasons : [] };
    }

    agent._btUi = { symbol: symbol, label: plan.label, result: result, gate: gate, ranAt: Date.now() };
    renderAgentCards();

    if (typeof showToast === 'function') {
      if (gate.passed) showToast(agent.name + ': backtest PASSED on ' + symbol + '. Start unlocked.', 'success');
      else showToast(agent.name + ': backtest FAILED on ' + symbol + '. ' + (gate.reasons[0] || 'See card for details.'), 'error');
    }
  } catch (e) {
    agent._btUi = { error: (e && e.message) || 'backtest failed', symbol: symbol, label: plan.label, ranAt: Date.now() };
    renderAgentCards();
    if (typeof showToast === 'function') showToast('Backtest could not run for ' + symbol + ': ' + ((e && e.message) || 'error') + '. Agent stays gated.', 'error');
  }
}

function createAgentCard(agent) {
  const stats = agent.getStats();
  const pnl = agent.getPnL();
  const isRunning = agent.state === AgentState.RUNNING;
  const isPaused = agent.state === AgentState.PAUSED;
  const isStopped = agent.state === AgentState.STOPPED;
  const gate = agentGateState(agent);
  const startGated = isStopped && !gate.ok;
  const stateClass = isRunning ? 'running' : isPaused ? 'paused' : 'stopped';
  const stateLabel = isRunning ? 'RUNNING' : isPaused ? 'PAUSED' : 'STOPPED';
  const simLabel = agent.simulationMode ? ' (SIM)' : '';

  const card = document.createElement('div');
  card.className = `agent-card${isRunning ? ' active' : ''}`;
  card.id = `card-${agent.id}`;

  const pnlClass = pnl.total >= 0 ? 'profit' : 'loss';
  const pnlSign = pnl.total >= 0 ? '+' : '';

  let positionsHtml = '';
  const positions = agent.getPositions();
  if (positions.length > 0) {
    positionsHtml = `<div class="agent-positions"><div class="ap-header">Open Positions</div>`;
    positions.forEach(pos => {
      const currentPrice = agent._simPrices?.[pos.symbol] || pos.avgPrice;
      const pctChange = pos.side === 'long'
        ? ((currentPrice - pos.avgPrice) / pos.avgPrice * 100)
        : ((pos.avgPrice - currentPrice) / pos.avgPrice * 100);
      const posClass = pctChange >= 0 ? 'profit' : 'loss';
      const posSign = pctChange >= 0 ? '+' : '';
      positionsHtml += `
        <div class="ap-row ${posClass}">
          <span>${pos.symbol} ${pos.side === 'long' ? 'Long' : 'Short'} @ $${pos.avgPrice.toFixed(2)}</span>
          <span class="${posClass}">${posSign}${pctChange.toFixed(1)}%</span>
          <span>Qty: ${pos.qty}</span>
        </div>`;
    });
    positionsHtml += '</div>';
  }

  // Count signals for this agent
  const agentSignals = SignalQueue.signals.filter(s => s.agent === agent.name && s.status === 'pending').length;

  card.innerHTML = `
    <div class="agent-header">
      <div class="agent-status-dot ${stateClass}"></div>
      <h3 class="agent-name">${agent.name}</h3>
      ${agentSignals > 0 ? `<span class="agent-signals-count">${agentSignals} signals</span>` : ''}
      <span class="agent-badge ${stateClass}">${stateLabel}${simLabel}</span>
      <span class="bt-valid-pill ${gate.backtested ? 'ok' : 'none'}" title="${gate.backtested ? 'A passing backtest is on record' : 'No passing backtest yet'}">${gate.backtested ? 'Backtested' : 'Not backtested'}</span>
    </div>
    <div class="agent-desc">${agent.description}</div>
    <div class="agent-stats">
      <div class="agent-stat">
        <span class="as-label">Strategy</span>
        <span class="as-value">${agent.strategy}</span>
      </div>
      <div class="agent-stat">
        <span class="as-label">Total P&L</span>
        <span class="as-value ${pnlClass}">${pnlSign}$${Math.abs(pnl.total).toFixed(0)}</span>
      </div>
      <div class="agent-stat">
        <span class="as-label">Win Rate</span>
        <span class="as-value">${stats.winRate.toFixed(1)}%</span>
      </div>
      <div class="agent-stat">
        <span class="as-label">Trades</span>
        <span class="as-value">${stats.totalTrades}</span>
      </div>
      <div class="agent-stat">
        <span class="as-label">Positions</span>
        <span class="as-value">${stats.positionCount}</span>
      </div>
      <div class="agent-stat">
        <span class="as-label">Max Drawdown</span>
        <span class="as-value ${stats.maxDrawdown > 0 ? 'loss' : ''}">${stats.maxDrawdown > 0 ? '-' : ''}${stats.maxDrawdown.toFixed(1)}%</span>
      </div>
    </div>
    ${positionsHtml}
    ${renderBacktestBlockHtml(agent)}
    <div class="agent-controls">
      ${isRunning
        ? `<button class="agent-btn pause" data-action="pause" data-agent="${agent.id}">Pause</button>`
        : `<button class="agent-btn start${startGated ? ' gated' : ''}" data-action="start" data-agent="${agent.id}"${startGated ? ` disabled title="${btEsc(gate.reason)}"` : ''}>${isPaused ? 'Resume' : 'Start'}</button>`
      }
      ${agentSignals > 0 ? `<button class="agent-btn agent-view-signals-btn" data-action="viewSignals" data-agent-name="${agent.name}">View Signals</button>` : ''}
      <button class="agent-btn" data-action="configure" data-agent="${agent.id}">Configure</button>
      <button class="agent-btn" data-action="logs" data-agent="${agent.id}">Logs</button>
      ${isStopped ? `<button class="agent-btn" data-action="remove" data-agent="${agent.id}" style="color:var(--loss)">Remove</button>` : ''}
    </div>
  `;

  card.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      if (action === 'viewSignals') {
        SignalQueue.filterByAgent(btn.dataset.agentName);
        document.querySelector('.signal-queue-panel')?.scrollIntoView({ behavior: 'smooth' });
      } else {
        handleAgentAction(action, btn.dataset.agent);
      }
    });
  });

  return card;
}

function handleAgentAction(action, agentId) {
  if (typeof AgentManager === 'undefined') return;
  const agent = AgentManager.get(agentId);
  if (!agent) return;

  switch (action) {
    case 'start':
      // Defense in depth: the button is disabled when the gate is closed, and
      // agent.start() also refuses if the agent is not backtested.
      if (agent.state === AgentState.PAUSED) { agent.resume(); break; }
      var gate = agentGateState(agent);
      if (!gate.ok) {
        showToast(agent.name + ': ' + (gate.reason || 'Backtest required before running') + '.', 'error');
        break;
      }
      agent.start();
      break;
    case 'backtest':
      runAgentBacktest(agent);
      break;
    case 'pause':
      agent.pause();
      break;
    case 'configure':
      openConfigModal(agent);
      break;
    case 'logs':
      openLogsModal(agent);
      break;
    case 'remove':
      if (agent.state !== AgentState.STOPPED) agent.stop();
      AgentManager.unregister(agentId);
      renderAgentCards();
      break;
  }
}

// --- Logs Modal ---
let _currentLogsAgent = null;
let _logsRefreshTimer = null;

function openLogsModal(agent) {
  _currentLogsAgent = agent;
  const title = document.getElementById('logsModalTitle');
  if (title) title.textContent = `${agent.name} - Logs`;

  document.querySelectorAll('.log-filter-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.log-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderLogs(btn.dataset.level);
    };
  });

  renderLogs('all');
  openModal('agentLogsModal');

  if (_logsRefreshTimer) clearInterval(_logsRefreshTimer);
  _logsRefreshTimer = setInterval(() => {
    if (!document.getElementById('agentLogsModal').classList.contains('active')) {
      clearInterval(_logsRefreshTimer);
      return;
    }
    const activeFilter = document.querySelector('.log-filter-btn.active')?.dataset.level || 'all';
    renderLogs(activeFilter);
  }, 2000);
}

function renderLogs(filter) {
  const container = document.getElementById('logsContainer');
  if (!container || !_currentLogsAgent) return;

  let logs = _currentLogsAgent.logs;
  if (filter !== 'all') {
    logs = logs.filter(l => l.level === filter);
  }

  if (logs.length === 0) {
    container.innerHTML = '<div class="log-empty">No logs matching filter. Start the agent to see activity.</div>';
    return;
  }

  container.innerHTML = logs.slice(-200).reverse().map(log => {
    const levelClass = {
      info: 'log-info', warn: 'log-warn', error: 'log-error',
      trade: 'log-trade', signal: 'log-signal',
    }[log.level] || 'log-info';
    return `<div class="log-entry ${levelClass}">${log.format()}</div>`;
  }).join('');
}

// --- Configure Modal ---
let _currentConfigAgent = null;

function openConfigModal(agent) {
  _currentConfigAgent = agent;
  const title = document.getElementById('configModalTitle');
  if (title) title.textContent = `Configure: ${agent.name}`;

  const body = document.getElementById('configModalBody');
  if (!body) return;

  body.innerHTML = `
    <div class="config-grid">
      <div class="setting-row">
        <div class="setting-info"><span class="setting-name">Max Position Size ($)</span></div>
        <input type="number" class="setting-input" id="cfgMaxPos" value="${agent.maxPositionSize}">
      </div>
      <div class="setting-row">
        <div class="setting-info"><span class="setting-name">Daily Loss Limit ($)</span></div>
        <input type="number" class="setting-input" id="cfgDailyLoss" value="${agent.dailyLossLimit}">
      </div>
      <div class="setting-row">
        <div class="setting-info"><span class="setting-name">Max Positions</span></div>
        <input type="number" class="setting-input" id="cfgMaxPositions" value="${agent.maxPositions}">
      </div>
      <div class="setting-row">
        <div class="setting-info"><span class="setting-name">Tick Interval (ms)</span></div>
        <input type="number" class="setting-input" id="cfgTickInterval" value="${agent.tickInterval}">
      </div>
      <div class="setting-row">
        <div class="setting-info"><span class="setting-name">Symbols (comma-separated)</span></div>
        <input type="text" class="setting-input" id="cfgSymbols" value="${agent.symbols.join(', ')}">
      </div>
    </div>
  `;

  document.getElementById('saveConfigBtn').onclick = () => {
    if (!_currentConfigAgent) return;
    const wasRunning = _currentConfigAgent.state === AgentState.RUNNING;
    if (wasRunning) _currentConfigAgent.pause();

    _currentConfigAgent.maxPositionSize = parseInt(document.getElementById('cfgMaxPos').value) || 10000;
    _currentConfigAgent.dailyLossLimit = parseInt(document.getElementById('cfgDailyLoss').value) || 2000;
    _currentConfigAgent.maxPositions = parseInt(document.getElementById('cfgMaxPositions').value) || 5;
    _currentConfigAgent.tickInterval = parseInt(document.getElementById('cfgTickInterval').value) || 5000;
    _currentConfigAgent.symbols = document.getElementById('cfgSymbols').value.split(',').map(s => s.trim()).filter(Boolean);

    if (wasRunning) _currentConfigAgent.resume();
    closeModal('agentConfigModal');
    renderAgentCards();
  };

  openModal('agentConfigModal');
}

// --- Deploy Agent Modal (enhanced form) ---
document.getElementById('newAgentBtn')?.addEventListener('click', () => {
  openModal('deployAgentModal');
});

// Paper/Live toggle label
document.getElementById('deployPaperMode')?.addEventListener('change', function() {
  const label = document.getElementById('deployModeLabel');
  if (label) {
    label.textContent = this.checked ? 'PAPER' : 'LIVE';
    label.style.color = this.checked ? 'var(--profit)' : 'var(--loss)';
  }
});

document.getElementById('deploySubmitBtn')?.addEventListener('click', () => {
  const name = document.getElementById('deployAgentName')?.value?.trim() || ('Agent ' + Date.now());
  const strategy = document.getElementById('deployStrategyType')?.value || 'Momentum';
  const universe = document.getElementById('deployUniverse')?.value || 'All';
  const posSizing = document.getElementById('deployPosSizing')?.value || 'fixed';
  const posSize = parseInt(document.getElementById('deployPosSize')?.value) || 10000;
  const maxPos = parseInt(document.getElementById('deployMaxPos')?.value) || 5;
  const stopLoss = parseFloat(document.getElementById('deployStopLoss')?.value) || 5;
  const takeProfit = parseFloat(document.getElementById('deployTakeProfit')?.value) || 15;
  const paperMode = document.getElementById('deployPaperMode')?.checked !== false;

  const newAgent = {
    id: 'agent_' + Date.now(),
    name: name,
    strategy: strategy,
    status: 'paused',
    todayPnl: 0,
    totalPnl: 0,
    winRate: 0,
    tradesToday: 0,
    maxDrawdown: 0,
    signals: 0,
    config: { universe, posSizing, posSize, maxPos, stopLoss, takeProfit, paperMode }
  };

  _standaloneAgents.push(newAgent);

  // Save custom agents to localStorage
  const customAgents = _standaloneAgents.filter(a => !DEFAULT_AGENTS_DATA.find(d => d.id === a.id));
  localStorage.setItem('gst_custom_agents', JSON.stringify(customAgents));

  // Also try to register with AgentManager if available
  if (typeof AgentManager !== 'undefined' && typeof ArbitrageHunter !== 'undefined') {
    let agentInstance;
    const id = newAgent.id;
    switch (strategy) {
      case 'Momentum': case 'Breakout': case 'AI Signal':
        agentInstance = new SwingMomentum({ id, name }); break;
      case 'Mean Reversion':
        agentInstance = new MeanReversion({ id, name }); break;
      case 'Options':
        agentInstance = new GammaScalper({ id, name }); break;
      case 'Value':
        agentInstance = new ArbitrageHunter({ id, name }); break;
      default:
        agentInstance = new SwingMomentum({ id, name }); break;
    }
    AgentManager.register(agentInstance);
  }

  closeModal('deployAgentModal');
  renderAgentCards();
});

// --- Settings: Alpaca ---
function loadAlpacaSettings() {
  const key = localStorage.getItem('alpaca_api_key') || '';
  const secret = localStorage.getItem('alpaca_api_secret') || '';
  const mode = localStorage.getItem('alpaca_paper_mode') !== 'false' ? 'paper' : 'live';

  const keyEl = document.getElementById('settingAlpacaKey');
  const secretEl = document.getElementById('settingAlpacaSecret');
  const modeEl = document.getElementById('settingAlpacaMode');

  if (keyEl) keyEl.value = key;
  if (secretEl) secretEl.value = secret;
  if (modeEl) modeEl.value = mode;

  updateAlpacaStatus(key && secret);
}

function updateAlpacaStatus(connected) {
  const desc = document.getElementById('alpacaStatusDesc');
  if (!desc) return;
  if (connected) {
    desc.textContent = 'API keys saved. Click Test to verify.';
    desc.style.color = 'var(--accent-gold)';
  } else {
    desc.textContent = 'Not configured - agents will run in simulation mode';
    desc.style.color = 'var(--text-muted)';
  }
}

document.getElementById('saveAlpacaBtn')?.addEventListener('click', () => {
  const key = document.getElementById('settingAlpacaKey')?.value?.trim() || '';
  const secret = document.getElementById('settingAlpacaSecret')?.value?.trim() || '';
  const mode = document.getElementById('settingAlpacaMode')?.value || 'paper';

  if (mode === 'live') {
    openModal('liveTradeConfirmModal');
    const check = document.getElementById('liveTradeConfirmCheck');
    const btn = document.getElementById('confirmLiveBtn');
    if (check) check.checked = false;
    if (btn) btn.disabled = true;

    check.onchange = () => { btn.disabled = !check.checked; };
    btn.onclick = () => {
      localStorage.setItem('alpaca_api_key', key);
      localStorage.setItem('alpaca_api_secret', secret);
      localStorage.setItem('alpaca_paper_mode', 'false');
      closeModal('liveTradeConfirmModal');
      updateAlpacaStatus(key && secret);
    };
    return;
  }

  localStorage.setItem('alpaca_api_key', key);
  localStorage.setItem('alpaca_api_secret', secret);
  localStorage.setItem('alpaca_paper_mode', 'true');
  updateAlpacaStatus(key && secret);
});

document.getElementById('testAlpacaBtn')?.addEventListener('click', async () => {
  const desc = document.getElementById('alpacaStatusDesc');
  if (!desc) return;
  desc.textContent = 'Testing connection...';
  desc.style.color = 'var(--accent-gold)';

  const key = document.getElementById('settingAlpacaKey')?.value?.trim() || '';
  const secret = document.getElementById('settingAlpacaSecret')?.value?.trim() || '';
  if (!key || !secret) {
    desc.textContent = 'Enter API key and secret first';
    desc.style.color = 'var(--loss)';
    return;
  }

  localStorage.setItem('alpaca_api_key', key);
  localStorage.setItem('alpaca_api_secret', secret);

  if (typeof AlpacaClient !== 'undefined') {
    const result = await AlpacaClient.getAccount();
    if (result.error) {
      desc.textContent = `Connection failed: ${result.message}`;
      desc.style.color = 'var(--loss)';
    } else {
      const equity = parseFloat(result.equity || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
      const bp = parseFloat(result.buying_power || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
      desc.textContent = `Connected. Equity: ${equity}, Buying Power: ${bp}`;
      desc.style.color = 'var(--profit)';
    }
  } else {
    desc.textContent = 'AlpacaClient not loaded';
    desc.style.color = 'var(--loss)';
  }
});

// --- Live P&L refresh for agent cards + chart ---
let _agentUITimer = null;

function startAgentUIUpdates() {
  if (_agentUITimer) clearInterval(_agentUITimer);
  _agentUITimer = setInterval(() => {
    if (typeof AgentManager === 'undefined') return;
    AgentManager.getAll().forEach(agent => {
      const card = document.getElementById(`card-${agent.id}`);
      if (!card) return;

      const stats = agent.getStats();
      const pnl = agent.getPnL();
      const stateClass = agent.state === AgentState.RUNNING ? 'running' : agent.state === AgentState.PAUSED ? 'paused' : 'stopped';
      const stateLabel = agent.state === AgentState.RUNNING ? 'RUNNING' : agent.state === AgentState.PAUSED ? 'PAUSED' : 'STOPPED';
      const simLabel = agent.simulationMode ? ' (SIM)' : '';

      const badge = card.querySelector('.agent-badge');
      if (badge) {
        badge.className = `agent-badge ${stateClass}`;
        badge.textContent = stateLabel + simLabel;
      }

      const dot = card.querySelector('.agent-status-dot');
      if (dot) dot.className = `agent-status-dot ${stateClass}`;

      card.className = `agent-card${agent.state === AgentState.RUNNING ? ' active' : ''}`;

      const statValues = card.querySelectorAll('.as-value');
      if (statValues.length >= 6) {
        const pnlClass = pnl.total >= 0 ? 'profit' : 'loss';
        const pnlSign = pnl.total >= 0 ? '+' : '';
        statValues[1].className = `as-value ${pnlClass}`;
        statValues[1].textContent = `${pnlSign}$${Math.abs(pnl.total).toFixed(0)}`;
        statValues[2].textContent = `${stats.winRate.toFixed(1)}%`;
        statValues[3].textContent = stats.totalTrades;
        statValues[4].textContent = stats.positionCount;
        statValues[5].className = `as-value${stats.maxDrawdown > 0 ? ' loss' : ''}`;
        statValues[5].textContent = `${stats.maxDrawdown > 0 ? '-' : ''}${stats.maxDrawdown.toFixed(1)}%`;
      }
    });
  }, 3000);
}

// --- Agent perf chart with real data ---
function drawAgentPerfChartLive() {
  const canvas = document.getElementById('agentPerfCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;

  const padding = { top: 20, right: 20, bottom: 40, left: 60 };
  const w = canvas.width - padding.left - padding.right;
  const h = canvas.height - padding.top - padding.bottom;

  const agentColors = ['#F59E0B', '#3B82F6', '#10B981', '#8B5CF6', '#EF4444', '#14B8A6'];
  const agentNames = ['Momentum Alpha', 'Swing Trader', 'Gamma Scalper', 'Value Scanner'];

  // Use AgentManager data if available, otherwise generate sample
  let agentData = [];
  if (typeof AgentManager !== 'undefined') {
    const agents = AgentManager.getAll();
    agentData = agents.map((agent, i) => {
      if (agent.dailyPnLHistory && agent.dailyPnLHistory.length > 1) {
        const cum = [0];
        agent.dailyPnLHistory.forEach(d => cum.push(cum[cum.length - 1] + d));
        return { color: agentColors[i % agentColors.length], data: cum, name: agent.name };
      }
      return { color: agentColors[i % agentColors.length], data: generateCumPnL(30, 100 + i * 30, 0.55 + i * 0.03), name: agent.name };
    });
  }

  if (agentData.length === 0) {
    // Generate sample equity curves for each default agent
    agentData = DEFAULT_AGENTS_DATA.map((agent, i) => {
      const seed = agent.totalPnl / 30;
      const wr = agent.winRate / 100;
      return {
        color: agentColors[i % agentColors.length],
        data: generateCumPnL(30, seed, wr),
        name: agent.name
      };
    });
  }

  // Update legend
  const legendEl = document.getElementById('agentPerfLegend');
  if (legendEl) {
    legendEl.innerHTML = agentData.map(a =>
      `<span class="legend-item"><span class="legend-dot" style="background: ${a.color}"></span>${a.name}</span>`
    ).join('');
  }

  let min = 0, max = 0;
  agentData.forEach(a => { a.data.forEach(v => { min = Math.min(min, v); max = Math.max(max, v); }); });
  max = max * 1.1 || 100;
  min = Math.min(min, -max * 0.1);

  // Grid lines
  ctx.strokeStyle = '#1A1A24';
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (h / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(canvas.width - padding.right, y);
    ctx.stroke();
    const val = max - ((max - min) / 4) * i;
    ctx.fillStyle = '#5C5C6E';
    ctx.font = '10px JetBrains Mono';
    ctx.textAlign = 'right';
    ctx.fillText('$' + val.toFixed(0), padding.left - 8, y + 3);
  }

  // X-axis labels (days)
  ctx.fillStyle = '#3A3A48';
  ctx.font = '9px JetBrains Mono';
  ctx.textAlign = 'center';
  for (let d = 0; d <= 30; d += 5) {
    const x = padding.left + (d / 30) * w;
    ctx.fillText('D' + (d - 30 || '0'), x, canvas.height - 8);
  }

  // Zero line
  const zeroY = padding.top + (max / (max - min)) * h;
  ctx.strokeStyle = '#2A2A38';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding.left, zeroY);
  ctx.lineTo(canvas.width - padding.right, zeroY);
  ctx.stroke();

  // Draw lines
  agentData.forEach(agentLine => {
    const lineLen = agentLine.data.length;
    ctx.beginPath();
    agentLine.data.forEach((val, i) => {
      const x = padding.left + (i / (Math.max(lineLen - 1, 1))) * w;
      const y = padding.top + ((max - val) / (max - min)) * h;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = agentLine.color;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Fill under curve
    const lastX = padding.left + w;
    ctx.lineTo(lastX, zeroY);
    ctx.lineTo(padding.left, zeroY);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, padding.top, 0, padding.top + h);
    grad.addColorStop(0, agentLine.color + '15');
    grad.addColorStop(1, agentLine.color + '00');
    ctx.fillStyle = grad;
    ctx.fill();
  });
}

// --- Initialize agent system on load ---
function initAgentSystem() {
  initDefaultAgents();
  loadAlpacaSettings();
  renderAgentCards();
  startAgentUIUpdates();
  SignalQueue.init();

  setInterval(() => {
    if (document.querySelector('[data-view="agents"]')?.classList?.contains('active') ||
        document.getElementById('view-agents')?.classList?.contains('active')) {
      drawAgentPerfChartLive();
    }
  }, 5000);

  if (typeof AgentManager !== 'undefined') {
    AgentManager.getAll().forEach(agent => {
      agent.on('stateChange', () => renderAgentCards());
      agent.on('guardrailTriggered', () => renderAgentCards());
    });
  }

  // Draw initial chart
  setTimeout(() => drawAgentPerfChartLive(), 500);
}

/* ============================================
   RISK ANALYTICS ENGINE
   Populates Risk View with simulated portfolio data
   ============================================ */

/* ---- TICKER BETAS ---- */
var TICKER_BETAS = {
  AAPL: 1.2, NVDA: 1.7, MSFT: 1.1, AMZN: 1.3, GOOGL: 1.1, META: 1.4, TSLA: 2.0,
  JPM: 1.1, JNJ: 0.6, V: 0.9, PLTR: 1.8, COIN: 2.5, SOFI: 1.6, IONQ: 2.2,
  SOUN: 2.5, RKLB: 2.3, SPY: 1.0, QQQ: 1.2, AMD: 1.65, DIS: 0.95, GS: 1.3,
  BAC: 1.2, MA: 0.95, SQ: 1.8, MARA: 2.8, RIOT: 2.7, MSTR: 2.4
};

var DEFAULT_PORTFOLIO = [
  { symbol: 'NVDA', shares: 50, avgCost: 875.00 },
  { symbol: 'AAPL', shares: 100, avgCost: 142.50 },
  { symbol: 'MSFT', shares: 75, avgCost: 410.00 },
  { symbol: 'TSLA', shares: 30, avgCost: 245.00 },
  { symbol: 'JPM', shares: 60, avgCost: 198.50 },
  { symbol: 'PLTR', shares: 200, avgCost: 22.50 }
];

/* NOTE: We intentionally do NOT seed gs_portfolio here. A new user starts with
   an empty portfolio and sees the empty state in the Portfolio view. The Risk
   Analytics view (which carries its own "Sample Data" badge) falls back to
   DEFAULT_PORTFOLIO in memory only, without writing to gs_portfolio, so the
   Portfolio and Risk views no longer collide on the same storage key. */

/* Generate or retrieve equity curve for drawdown chart */
function getEquityCurve() {
  var key = 'gs_equity_curve';
  var existing = null;
  try { existing = JSON.parse(localStorage.getItem(key)); } catch(e) {}
  if (existing && Array.isArray(existing) && existing.length > 0) return existing;

  // Generate 90-day simulated equity curve
  var curve = [];
  var startVal = 100000;
  var val = startVal;
  var now = Date.now();
  var dayMs = 86400000;
  for (var i = 89; i >= 0; i--) {
    var date = new Date(now - i * dayMs);
    // Create realistic drawdown periods
    var dayNum = 90 - i;
    var dailyReturn;
    if (dayNum > 15 && dayNum < 30) {
      dailyReturn = -0.005 + Math.random() * 0.003; // drawdown period 1
    } else if (dayNum > 55 && dayNum < 68) {
      dailyReturn = -0.008 + Math.random() * 0.005; // drawdown period 2 (deeper)
    } else {
      dailyReturn = 0.001 + (Math.random() - 0.4) * 0.012; // slight upward bias
    }
    val = val * (1 + dailyReturn);
    curve.push({
      date: date.toISOString().split('T')[0],
      value: Math.round(val * 100) / 100
    });
  }
  localStorage.setItem(key, JSON.stringify(curve));
  return curve;
}

function getRiskPortfolioData() {
  // Load portfolio from localStorage
  var stored = null;
  try { stored = JSON.parse(localStorage.getItem('gs_portfolio')); } catch(e) {}
  if (!stored || !Array.isArray(stored) || stored.length === 0) {
    stored = DEFAULT_PORTFOLIO;
  }

  // Get watchlist prices for live price lookup
  var watchlistPrices = {};
  document.querySelectorAll('.wl-row').forEach(function(row) {
    var sym = row.querySelector('.wl-sym');
    var price = row.querySelector('.wl-price');
    if (sym && price) {
      var s = sym.textContent;
      var p = parseFloat(price.textContent);
      if (s && !isNaN(p)) watchlistPrices[s] = p;
    }
  });

  var positions = stored.map(function(item) {
    var sym = item.symbol || item.ticker;
    var qty = item.shares || item.qty || 0;
    var avg = item.avgCost || item.avg_cost || item.costBasis || 0;
    var beta = TICKER_BETAS[sym] || 1.0;
    return { symbol: sym, qty: qty, avgCost: avg, beta: beta };
  });

  var totalValue = 0;
  var totalCost = 0;
  positions.forEach(function(p) {
    p.current = watchlistPrices[p.symbol] || p.avgCost * (1 + (Math.random() * 0.08 - 0.02));
    p.marketValue = p.qty * p.current;
    p.costBasis = p.qty * p.avgCost;
    p.pnl = p.marketValue - p.costBasis;
    p.pnlPct = p.avgCost > 0 ? ((p.current - p.avgCost) / p.avgCost) * 100 : 0;
    totalValue += p.marketValue;
    totalCost += p.costBasis;
  });

  positions.forEach(function(p) {
    p.weight = totalValue > 0 ? (p.marketValue / totalValue) * 100 : 0;
    p.deltaContrib = p.marketValue * p.beta;
  });

  var weightedBeta = positions.reduce(function(s, p) { return s + (p.weight / 100) * p.beta; }, 0);
  var netDelta = positions.reduce(function(s, p) { return s + p.marketValue; }, 0);
  var betaWeightedDelta = positions.reduce(function(s, p) { return s + p.deltaContrib; }, 0);
  var dailyVol = 0.015 * weightedBeta;
  var var95 = totalValue * dailyVol * 1.645;

  // Calculate max drawdown from equity curve
  var curve = getEquityCurve();
  var maxDD = 0;
  var peak = 0;
  curve.forEach(function(pt) {
    if (pt.value > peak) peak = pt.value;
    var dd = ((pt.value - peak) / peak) * 100;
    if (dd < maxDD) maxDD = dd;
  });

  // Sharpe ratio: (portfolio return - risk free) / std dev
  var portfolioReturn = totalCost > 0 ? (totalValue - totalCost) / totalCost : 0;
  var annualReturn = portfolioReturn * (252 / 90); // annualized estimate
  var riskFree = 0.05; // 5% risk-free rate
  var annualVol = dailyVol * Math.sqrt(252);
  var sharpe = annualVol > 0 ? (annualReturn - riskFree) / annualVol : 0;

  return {
    positions: positions,
    totalValue: totalValue,
    totalCost: totalCost,
    weightedBeta: weightedBeta,
    netDelta: netDelta,
    betaWeightedDelta: betaWeightedDelta,
    var95: var95,
    maxDrawdown: maxDD,
    sharpe: sharpe,
    dailyVol: dailyVol
  };
}

function riskFormatCurrency(val, decimals) {
  var d = decimals !== undefined ? decimals : 0;
  var abs = Math.abs(val);
  var formatted = abs >= 1000000 ? '$' + (abs / 1000000).toFixed(2) + 'M'
    : abs >= 1000 ? '$' + abs.toLocaleString('en-US', { maximumFractionDigits: d })
    : '$' + abs.toFixed(d);
  return val < 0 ? '-' + formatted : formatted;
}

function populateRiskSummary(data) {
  var el = function(id, val) { var e = document.getElementById(id); if (e) e.textContent = val; };
  el('riskTotalExposure', riskFormatCurrency(data.totalValue));
  el('riskNetDelta', riskFormatCurrency(data.netDelta));
  el('riskPortBeta', data.weightedBeta.toFixed(2));
  el('riskSharpe', data.sharpe.toFixed(2));
  el('riskVaR', '-' + riskFormatCurrency(data.var95));
  el('riskMaxDD', data.maxDrawdown.toFixed(1) + '%');
}

/* ---- RISK POSITION TABLE SORT STATE ---- */
var riskTableSortKey = 'weight';
var riskTableSortAsc = false;
var riskTableLastData = null;

function populatePositionTable(data) {
  riskTableLastData = data;
  var tbody = document.getElementById('riskPositionBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  // Sort positions
  var sorted = data.positions.slice().sort(function(a, b) {
    var va = a[riskTableSortKey];
    var vb = b[riskTableSortKey];
    if (typeof va === 'string') {
      return riskTableSortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
    }
    return riskTableSortAsc ? va - vb : vb - va;
  });

  // Find max weight for bar scaling
  var maxWeight = Math.max.apply(null, sorted.map(function(p) { return p.weight; }));

  sorted.forEach(function(p) {
    var tr = document.createElement('tr');
    tr.className = p.pnl >= 0 ? 'row-profit' : 'row-loss';
    var barWidth = maxWeight > 0 ? (p.weight / maxWeight) * 100 : 0;
    tr.innerHTML =
      '<td>' + p.symbol + '</td>' +
      '<td>' + p.qty + '</td>' +
      '<td>$' + p.avgCost.toFixed(2) + '</td>' +
      '<td>$' + p.current.toFixed(2) + '</td>' +
      '<td>' + (p.pnl >= 0 ? '+' : '') + riskFormatCurrency(p.pnl) + '</td>' +
      '<td>' + (p.pnlPct >= 0 ? '+' : '') + p.pnlPct.toFixed(2) + '%</td>' +
      '<td>' + p.weight.toFixed(1) + '%</td>' +
      '<td><div class="weight-bar-cell"><div class="weight-bar-track"><div class="weight-bar-fill" style="width:' + barWidth + '%"></div></div><span class="weight-bar-label">' + p.weight.toFixed(1) + '%</span></div></td>' +
      '<td>' + p.beta.toFixed(2) + '</td>' +
      '<td>' + riskFormatCurrency(p.deltaContrib) + '</td>';
    tbody.appendChild(tr);
  });

  // Update sort indicators on headers
  document.querySelectorAll('.risk-position-table thead th[data-sort]').forEach(function(th) {
    th.classList.remove('sort-active');
    var arrow = th.querySelector('.sort-arrow');
    if (!arrow) {
      arrow = document.createElement('span');
      arrow.className = 'sort-arrow';
      th.appendChild(arrow);
    }
    if (th.dataset.sort === riskTableSortKey) {
      th.classList.add('sort-active');
      arrow.textContent = riskTableSortAsc ? ' \u25B2' : ' \u25BC';
    } else {
      arrow.textContent = '';
    }
  });
}

function populateVaRGauge(data) {
  var pct = (data.var95 / data.totalValue) * 100;
  var fillEl = document.getElementById('varGaugeFill');
  var markerEl = document.getElementById('varGaugeMarker');
  var labelEl = document.getElementById('varGaugeLabel');
  var pctEl = document.getElementById('varGaugePct');
  var portValEl = document.getElementById('varGaugePortVal');

  var fillWidth = Math.min((pct / 5) * 100, 100);
  if (fillEl) fillEl.style.width = fillWidth + '%';
  if (markerEl) markerEl.style.left = fillWidth + '%';
  if (labelEl) labelEl.textContent = '-' + riskFormatCurrency(data.var95);
  if (pctEl) pctEl.textContent = pct.toFixed(2) + '%';
  if (portValEl) portValEl.textContent = riskFormatCurrency(data.totalValue);
}

function populateConcentrationChart(data) {
  var container = document.getElementById('concentrationChart');
  if (!container) return;
  container.innerHTML = '';

  var colors = ['var(--accent-blue)', 'var(--profit)', 'var(--accent-purple)', 'var(--accent-gold)', 'var(--loss)', 'var(--accent-teal)', 'var(--text-muted)'];
  var sorted = data.positions.slice().sort(function(a, b) { return b.weight - a.weight; });
  var top5 = sorted.slice(0, 5);
  var otherWeight = sorted.slice(5).reduce(function(s, p) { return s + p.weight; }, 0);

  top5.forEach(function(p, i) {
    var group = document.createElement('div');
    group.className = 'conc-bar-group';
    group.innerHTML =
      '<span class="conc-label">' + p.symbol + '</span>' +
      '<div class="conc-bar-track">' +
        '<div class="conc-bar" style="width: ' + p.weight + '%; background: ' + colors[i] + ';">' + p.weight.toFixed(1) + '%</div>' +
      '</div>';
    container.appendChild(group);
  });

  if (otherWeight > 0) {
    var group = document.createElement('div');
    group.className = 'conc-bar-group';
    group.innerHTML =
      '<span class="conc-label">Other</span>' +
      '<div class="conc-bar-track">' +
        '<div class="conc-bar" style="width: ' + otherWeight + '%; background: var(--text-muted);">' + otherWeight.toFixed(1) + '%</div>' +
      '</div>';
    container.appendChild(group);
  }
}

function populateCorrelationHeatmap(data) {
  var table = document.getElementById('corrHeatmap');
  if (!table) return;

  var top5 = data.positions.slice().sort(function(a, b) { return b.weight - a.weight; }).slice(0, 5).map(function(p) { return p.symbol; });

  var corrData = {
    'NVDA-AAPL': 0.62, 'NVDA-MSFT': 0.71, 'NVDA-AMZN': 0.58, 'NVDA-META': 0.65,
    'AAPL-MSFT': 0.78, 'AAPL-AMZN': 0.65, 'AAPL-META': 0.60,
    'MSFT-AMZN': 0.72, 'MSFT-META': 0.68, 'AMZN-META': 0.55,
    'NVDA-TSLA': 0.48, 'NVDA-GOOGL': 0.67, 'NVDA-JPM': 0.22, 'NVDA-AMD': 0.82, 'NVDA-COIN': 0.35, 'NVDA-DIS': 0.31, 'NVDA-PLTR': 0.52,
    'AAPL-TSLA': 0.41, 'AAPL-GOOGL': 0.75, 'AAPL-JPM': 0.35, 'AAPL-AMD': 0.58, 'AAPL-COIN': 0.25, 'AAPL-DIS': 0.42, 'AAPL-PLTR': 0.38,
    'MSFT-TSLA': 0.38, 'MSFT-GOOGL': 0.80, 'MSFT-JPM': 0.40, 'MSFT-AMD': 0.65, 'MSFT-COIN': 0.20, 'MSFT-DIS': 0.45, 'MSFT-PLTR': 0.42,
    'AMZN-TSLA': 0.45, 'AMZN-GOOGL': 0.70, 'AMZN-JPM': 0.30, 'AMZN-AMD': 0.50, 'AMZN-COIN': 0.28, 'AMZN-DIS': 0.48, 'AMZN-PLTR': 0.35,
    'META-TSLA': 0.36, 'META-GOOGL': 0.72, 'META-JPM': 0.28, 'META-AMD': 0.55, 'META-COIN': 0.22, 'META-DIS': 0.40, 'META-PLTR': 0.33,
    'TSLA-GOOGL': 0.32, 'TSLA-JPM': 0.15, 'TSLA-AMD': 0.45, 'TSLA-COIN': 0.50, 'TSLA-DIS': 0.20, 'TSLA-PLTR': 0.40,
    'GOOGL-JPM': 0.38, 'GOOGL-AMD': 0.60, 'GOOGL-COIN': 0.18, 'GOOGL-DIS': 0.50, 'GOOGL-PLTR': 0.42,
    'JPM-AMD': 0.25, 'JPM-COIN': 0.12, 'JPM-DIS': 0.55, 'JPM-PLTR': 0.18,
    'AMD-COIN': 0.38, 'AMD-DIS': 0.28, 'AMD-PLTR': 0.55, 'COIN-DIS': 0.10, 'COIN-PLTR': 0.42, 'DIS-PLTR': 0.22
  };

  function getCorr(a, b) {
    if (a === b) return 1.00;
    return corrData[a + '-' + b] || corrData[b + '-' + a] || 0.40;
  }
  function corrClass(val) {
    if (val >= 0.99) return 'corr-self';
    if (val >= 0.7) return 'corr-high';
    if (val >= 0.5) return 'corr-med-high';
    if (val >= 0.3) return 'corr-med';
    return 'corr-low';
  }

  var html = '<thead><tr><th></th>';
  top5.forEach(function(s) { html += '<th>' + s + '</th>'; });
  html += '</tr></thead><tbody>';
  top5.forEach(function(row) {
    html += '<tr><th>' + row + '</th>';
    top5.forEach(function(col) {
      var val = getCorr(row, col);
      html += '<td class="' + corrClass(val) + '">' + val.toFixed(2) + '</td>';
    });
    html += '</tr>';
  });
  html += '</tbody>';
  table.innerHTML = html;
}

function populateStressTests(data) {
  var grid = document.getElementById('stressTestGrid');
  if (!grid) return;

  var techSymbols = ['NVDA', 'AAPL', 'MSFT', 'AMZN', 'META', 'GOOGL', 'AMD', 'PLTR', 'IONQ', 'SOUN', 'RKLB'];
  var growthSymbols = ['NVDA', 'TSLA', 'PLTR', 'COIN', 'IONQ', 'SOUN', 'RKLB', 'SOFI', 'AMD', 'META'];
  var techWeight = data.positions
    .filter(function(p) { return techSymbols.indexOf(p.symbol) !== -1; })
    .reduce(function(sum, p) { return sum + p.weight; }, 0) / 100;
  var growthWeight = data.positions
    .filter(function(p) { return growthSymbols.indexOf(p.symbol) !== -1; })
    .reduce(function(sum, p) { return sum + p.weight; }, 0) / 100;

  var scenarios = [
    { icon: '&#x1F4C9;', title: 'Market Crash -20%', factor: -0.20, detail: 'Broad equity selloff', useBeta: true, severity: 'severe' },
    { icon: '&#x1F4C8;', title: 'Rate Hike +100bp', factor: -0.06, detail: 'Growth stocks hit harder', useGrowth: true, severity: 'high' },
    { icon: '&#x26A1;', title: 'VIX Spike to 40', factor: -0.08, detail: 'Volatility regime change', useBeta: true, severity: 'high' },
    { icon: '&#x1F4BB;', title: 'Tech Crash -30%', factor: -0.30, detail: 'Tech sector rotation', useTech: true, severity: 'severe' },
    { icon: '&#x1F4B5;', title: 'Dollar Surge +10%', factor: -0.015, detail: 'Minimal domestic impact', useBeta: false, severity: 'low' }
  ];

  grid.innerHTML = '';
  scenarios.forEach(function(s) {
    var impact;
    if (s.useTech) {
      impact = data.totalValue * s.factor * techWeight;
    } else if (s.useGrowth) {
      impact = data.totalValue * s.factor * growthWeight;
    } else if (s.useBeta) {
      impact = data.totalValue * s.factor * data.weightedBeta;
    } else {
      impact = data.totalValue * s.factor;
    }

    var impactPct = data.totalValue > 0 ? (impact / data.totalValue) * 100 : 0;
    var isLoss = impact < 0;
    var card = document.createElement('div');
    card.className = 'stress-card severity-' + s.severity;
    card.innerHTML =
      '<div class="stress-card-icon">' + s.icon + '</div>' +
      '<div class="stress-card-title">' + s.title + '</div>' +
      '<div class="stress-card-impact ' + (isLoss ? 'loss' : 'profit') + '">' + (impact >= 0 ? '+' : '') + riskFormatCurrency(impact) + '</div>' +
      '<div class="stress-card-pct">' + (impactPct >= 0 ? '+' : '') + impactPct.toFixed(1) + '% portfolio</div>' +
      '<div class="stress-card-detail">' + s.detail + '</div>';
    grid.appendChild(card);
  });
}

/* ---- DRAWDOWN CHART ---- */
function renderDrawdownChart() {
  var canvas = document.getElementById('drawdownCanvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var wrap = canvas.parentElement;

  // Set canvas size for sharp rendering
  var dpr = window.devicePixelRatio || 1;
  var w = wrap.clientWidth;
  var h = wrap.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.scale(dpr, dpr);

  var curve = getEquityCurve();
  if (curve.length < 2) return;

  // Compute drawdown series
  var peak = 0;
  var ddSeries = [];
  var maxDD = 0;
  var maxDDIdx = 0;
  curve.forEach(function(pt, i) {
    if (pt.value > peak) peak = pt.value;
    var dd = ((pt.value - peak) / peak) * 100;
    ddSeries.push({ date: pt.date, dd: dd });
    if (dd < maxDD) { maxDD = dd; maxDDIdx = i; }
  });

  var currentDD = ddSeries[ddSeries.length - 1].dd;

  // Update header label
  var label = document.getElementById('drawdownCurrentLabel');
  if (label) {
    label.textContent = 'Current: ' + currentDD.toFixed(2) + '% | Max: ' + maxDD.toFixed(2) + '%';
    label.style.color = currentDD < -3 ? '#EF4444' : currentDD < -1 ? '#F59E0B' : '#10B981';
  }

  // Chart dimensions
  var padL = 50, padR = 16, padT = 16, padB = 28;
  var chartW = w - padL - padR;
  var chartH = h - padT - padB;
  var minDD = Math.min(maxDD * 1.1, -1);

  function xPos(i) { return padL + (i / (ddSeries.length - 1)) * chartW; }
  function yPos(dd) { return padT + (dd / minDD) * chartH; }

  // Clear
  ctx.clearRect(0, 0, w, h);

  // Grid lines
  ctx.strokeStyle = 'rgba(42,42,58,0.5)';
  ctx.lineWidth = 0.5;
  var gridSteps = [0, minDD * 0.25, minDD * 0.5, minDD * 0.75, minDD];
  gridSteps.forEach(function(val) {
    var y = yPos(val);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
    // Y-axis label
    ctx.fillStyle = '#6B7280';
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(val.toFixed(1) + '%', padL - 6, y + 3);
  });

  // Zero line
  ctx.strokeStyle = 'rgba(107,114,128,0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(padL, padT); ctx.lineTo(w - padR, padT); ctx.stroke();

  // Fill gradient
  var grad = ctx.createLinearGradient(0, padT, 0, padT + chartH);
  grad.addColorStop(0, 'rgba(239, 68, 68, 0.05)');
  grad.addColorStop(1, 'rgba(239, 68, 68, 0.35)');

  // Draw filled area
  ctx.beginPath();
  ctx.moveTo(xPos(0), padT); // start at 0% line
  ddSeries.forEach(function(pt, i) { ctx.lineTo(xPos(i), yPos(pt.dd)); });
  ctx.lineTo(xPos(ddSeries.length - 1), padT);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Draw line
  ctx.beginPath();
  ddSeries.forEach(function(pt, i) {
    if (i === 0) ctx.moveTo(xPos(i), yPos(pt.dd));
    else ctx.lineTo(xPos(i), yPos(pt.dd));
  });
  ctx.strokeStyle = '#EF4444';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Max drawdown point marker
  if (maxDDIdx > 0) {
    var mx = xPos(maxDDIdx);
    var my = yPos(maxDD);
    ctx.beginPath();
    ctx.arc(mx, my, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#EF4444';
    ctx.fill();
    ctx.strokeStyle = '#1A1A24';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Label
    ctx.fillStyle = '#EF4444';
    ctx.font = 'bold 10px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Max: ' + maxDD.toFixed(1) + '%', mx, my + 14);
  }

  // Current drawdown marker
  var cx = xPos(ddSeries.length - 1);
  var cy = yPos(currentDD);
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#F59E0B';
  ctx.fill();
  ctx.strokeStyle = '#1A1A24';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#F59E0B';
  ctx.font = 'bold 10px JetBrains Mono, monospace';
  ctx.textAlign = 'right';
  ctx.fillText('Now: ' + currentDD.toFixed(1) + '%', cx - 8, cy - 8);

  // X-axis date labels
  ctx.fillStyle = '#6B7280';
  ctx.font = '9px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  var labelCount = 6;
  for (var li = 0; li < labelCount; li++) {
    var idx = Math.round(li * (ddSeries.length - 1) / (labelCount - 1));
    var dateStr = ddSeries[idx].date.substring(5); // MM-DD
    ctx.fillText(dateStr, xPos(idx), h - 6);
  }
}

/* ---- POSITION SIZING CALCULATOR ---- */
function setupPositionSizer() {
  var calcBtn = document.getElementById('sizerCalcBtn');
  if (!calcBtn) return;

  function calculate() {
    var account = parseFloat(document.getElementById('sizerAccount').value) || 0;
    var riskPct = parseFloat(document.getElementById('sizerRiskPct').value) || 0;
    var entry = parseFloat(document.getElementById('sizerEntry').value) || 0;
    var stop = parseFloat(document.getElementById('sizerStop').value) || 0;
    var target = parseFloat(document.getElementById('sizerTarget').value) || 0;

    var sharesEl = document.getElementById('sizerShares');
    var valueEl = document.getElementById('sizerValue');
    var dollarRiskEl = document.getElementById('sizerDollarRisk');
    var pctPortEl = document.getElementById('sizerPctPort');
    var rrCard = document.getElementById('sizerRRCard');
    var rrEl = document.getElementById('sizerRR');
    var rrBarRisk = document.getElementById('sizerRRBarRisk');
    var rrBarReward = document.getElementById('sizerRRBarReward');

    var hintEl = document.getElementById('sizerHint');
    if (account <= 0 || entry <= 0 || stop <= 0 || riskPct <= 0) {
      if (sharesEl) sharesEl.textContent = '--';
      if (valueEl) valueEl.textContent = '--';
      if (dollarRiskEl) dollarRiskEl.textContent = '--';
      if (pctPortEl) pctPortEl.textContent = '--';
      if (rrCard) rrCard.style.display = 'none';
      if (hintEl) {
        var missing = [];
        if (account <= 0) missing.push('Account Size');
        if (entry <= 0) missing.push('Entry Price');
        if (stop <= 0) missing.push('Stop Loss');
        if (riskPct <= 0) missing.push('Risk Per Trade');
        hintEl.textContent = 'Enter ' + missing.join(', ') + ' to calculate.';
        hintEl.style.display = '';
      }
      return;
    }
    if (hintEl) hintEl.style.display = 'none';

    var dollarRisk = account * (riskPct / 100);
    var riskPerShare = Math.abs(entry - stop);
    if (riskPerShare <= 0) return;

    var shares = Math.floor(dollarRisk / riskPerShare);
    var posValue = shares * entry;
    var pctOfPort = (posValue / account) * 100;

    if (sharesEl) sharesEl.textContent = shares.toLocaleString();
    if (valueEl) valueEl.textContent = riskFormatCurrency(posValue);
    if (dollarRiskEl) dollarRiskEl.textContent = '-' + riskFormatCurrency(dollarRisk);
    if (pctPortEl) pctPortEl.textContent = pctOfPort.toFixed(1) + '%';

    // Risk/Reward
    if (target > 0 && rrCard) {
      var reward = Math.abs(target - entry);
      var rr = riskPerShare > 0 ? reward / riskPerShare : 0;
      rrCard.style.display = '';
      if (rrEl) {
        rrEl.textContent = '1 : ' + rr.toFixed(1);
        rrEl.style.color = rr >= 2 ? '#10B981' : rr >= 1 ? '#F59E0B' : '#EF4444';
      }
      var total = riskPerShare + reward;
      if (rrBarRisk) rrBarRisk.style.width = ((riskPerShare / total) * 100) + '%';
      if (rrBarReward) rrBarReward.style.width = ((reward / total) * 100) + '%';
    } else if (rrCard) {
      rrCard.style.display = 'none';
    }
  }

  calcBtn.addEventListener('click', calculate);

  // Auto-calculate on input change
  ['sizerAccount', 'sizerRiskPct', 'sizerEntry', 'sizerStop', 'sizerTarget'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('input', calculate);
  });
}

/* ---- TABLE SORT HANDLER ---- */
(function setupRiskTableSort() {
  document.addEventListener('click', function(e) {
    var th = e.target.closest('.risk-position-table thead th[data-sort]');
    if (!th) return;
    var key = th.dataset.sort;
    if (riskTableSortKey === key) {
      riskTableSortAsc = !riskTableSortAsc;
    } else {
      riskTableSortKey = key;
      riskTableSortAsc = key === 'symbol'; // alpha ascending by default
    }
    if (riskTableLastData) populatePositionTable(riskTableLastData);
  });
})();

function loadRiskView() {
  var data = getRiskPortfolioData();
  populateRiskSummary(data);
  populatePositionTable(data);
  populateVaRGauge(data);
  populateConcentrationChart(data);
  populateCorrelationHeatmap(data);
  populateStressTests(data);
  renderDrawdownChart();
  setupPositionSizer();
}

/* ============================================
   TOAST NOTIFICATION SYSTEM
   ============================================ */

function showToast(message, type) {
  type = type || 'info';
  var container = document.getElementById('toastContainer');
  if (!container) return;
  var toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(function() { if (toast.parentNode) toast.remove(); }, 3100);
}

/* ============================================
   SETTINGS ENHANCEMENTS
   ============================================ */

(function enhanceSettingsSaveFeedback() {
  var origSaveAlpaca = document.getElementById('saveAlpacaBtn');
  if (origSaveAlpaca) {
    origSaveAlpaca.addEventListener('click', function() {
      setTimeout(function() { showToast('Alpaca settings saved', 'success'); }, 200);
    });
  }
  var origSaveApi = document.getElementById('saveApiKeyBtn');
  if (origSaveApi) {
    origSaveApi.addEventListener('click', function() {
      setTimeout(function() {
        var statusEl = document.getElementById('apiKeyStatus');
        if (statusEl && statusEl.style.color !== 'var(--loss)') {
          showToast('API key saved successfully', 'success');
        }
      }, 500);
    });
  }
})();

(function initDataPreferences() {
  var refreshEl = document.getElementById('settingRefreshInterval');
  var tfEl = document.getElementById('settingDefaultTimeframe');
  var savedRefresh = localStorage.getItem('gs_refresh_interval');
  var savedTf = localStorage.getItem('gs_default_timeframe');
  if (savedRefresh && refreshEl) refreshEl.value = savedRefresh;
  if (savedTf && tfEl) tfEl.value = savedTf;

  if (refreshEl) {
    refreshEl.addEventListener('change', function() {
      localStorage.setItem('gs_refresh_interval', refreshEl.value);
      showToast('Refresh interval updated to ' + (parseInt(refreshEl.value) / 1000) + 's', 'success');
    });
  }
  if (tfEl) {
    tfEl.addEventListener('change', function() {
      localStorage.setItem('gs_default_timeframe', tfEl.value);
      showToast('Default timeframe set to ' + tfEl.value, 'success');
    });
  }
})();

document.querySelectorAll('.accent-swatch').forEach(function(swatch) {
  swatch.addEventListener('click', function() {
    document.querySelectorAll('.accent-swatch').forEach(function(s) { s.classList.remove('active'); });
    swatch.classList.add('active');
    showToast('Accent color updated', 'info');
  });
});

// ---- BIGDATA.COM SERVICE INITIALIZATION ----

async function initBigDataService() {
  if (typeof BigDataService === 'undefined') return;

  try {
    const available = await BigDataService.init();
    if (available) {
      console.log('[BigData] Premium data service connected');
      // If flow view already loaded, switch to live data
      if (flowUsingBigData) {
        stopFlowIntervals();
        startFlowIntervals();
      }
      // Load real sector data for heatmap
      fetchBigDataSectors('1D');
    } else {
      console.log('[BigData] Not configured - using simulated data');
    }
  } catch (err) {
    console.log('[BigData] Init error:', err.message);
  }
}

function initBigDataSettings() {
  var input = document.getElementById('bigdataApiKeyInput');
  var saveBtn = document.getElementById('saveBigdataKeyBtn');
  var statusEl = document.getElementById('bigdataKeyStatus');
  var indicatorEl = document.getElementById('bigdataKeyStatusIndicator');

  if (!input || !saveBtn) return;

  // Load saved key display
  var savedKey = localStorage.getItem('gs_bigdata_key');
  if (savedKey) {
    input.placeholder = savedKey.slice(0, 10) + '...' + savedKey.slice(-4);
  }

  // Save button handler
  saveBtn.addEventListener('click', async function () {
    var key = input.value.trim();
    if (!key) return;

    saveBtn.textContent = 'Saving...';
    saveBtn.disabled = true;

    if (typeof BigDataService !== 'undefined') {
      var result = await BigDataService.saveApiKey(key);

      if (result.success) {
        input.value = '';
        input.placeholder = key.slice(0, 10) + '...' + key.slice(-4);
        saveBtn.textContent = 'Saved';
        showToast('BigData.com API key saved', 'success');

        // Test connection and update status
        var test = await BigDataService.testConnection();
        updateBigDataStatus(statusEl, indicatorEl, test);

        // Re-initialize flow with live data
        await initBigDataService();
        if (BigDataService.isAvailable()) {
          // Reinit flow view with live data
          stopFlowIntervals();
          await initFlowDataSource();
          startFlowIntervals();
        }
      } else {
        saveBtn.textContent = 'Error';
        if (statusEl) {
          statusEl.textContent = result.error || 'Failed to save key';
          statusEl.style.color = 'var(--loss)';
        }
      }
    } else {
      saveBtn.textContent = 'Error';
      if (statusEl) {
        statusEl.textContent = 'BigData service not loaded';
        statusEl.style.color = 'var(--loss)';
      }
    }

    setTimeout(function () {
      saveBtn.textContent = 'Save';
      saveBtn.disabled = false;
    }, 2000);
  });

  // Check initial status
  checkBigDataStatus(statusEl, indicatorEl);
}

async function checkBigDataStatus(statusEl, indicatorEl) {
  if (typeof BigDataService === 'undefined') {
    updateBigDataStatus(statusEl, indicatorEl, { configured: false, connected: false, message: 'Service not loaded' });
    return;
  }

  try {
    var test = await BigDataService.testConnection();
    updateBigDataStatus(statusEl, indicatorEl, test);
  } catch (e) {
    updateBigDataStatus(statusEl, indicatorEl, { configured: false, connected: false, message: e.message });
  }
}

function updateBigDataStatus(statusEl, indicatorEl, status) {
  if (!statusEl) return;

  if (status.connected) {
    statusEl.textContent = 'Connected - ' + (status.message || 'BigData.com API active');
    statusEl.style.color = 'var(--profit)';
    if (indicatorEl) {
      indicatorEl.className = 'api-status-indicator connected';
      indicatorEl.textContent = 'LIVE';
    }
  } else if (status.configured) {
    statusEl.textContent = status.message || 'Configured but not connected';
    statusEl.style.color = 'var(--warning)';
    if (indicatorEl) {
      indicatorEl.className = 'api-status-indicator disconnected';
      indicatorEl.textContent = 'ERROR';
    }
  } else {
    statusEl.textContent = status.message || 'No API key configured. Platform uses simulated data.';
    statusEl.style.color = 'var(--text-tertiary)';
    if (indicatorEl) {
      indicatorEl.className = 'api-status-indicator disconnected';
      indicatorEl.textContent = 'OFF';
    }
  }
}

/* ============================================
   RISK VIEW NAV HOOK + REFRESH
   ============================================ */

document.getElementById('riskRefreshBtn')?.addEventListener('click', function() {
  loadRiskView();
  showToast('Risk analytics refreshed', 'success');
});

// Hook into nav to load risk view when selected
(function hookRiskNav() {
  document.querySelectorAll('.nav-btn[data-view]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      if (btn.dataset.view === 'risk') {
        setTimeout(loadRiskView, 50);
      }
    });
  });
})();

/* ============================================
   GREY SANKORE INSIGHT ACTION BUTTONS
   ============================================ */

document.addEventListener('click', function(e) {
  var btn = e.target.closest('.insight-action-btn');
  if (!btn) return;

  var action = btn.dataset.action;
  var ticker = btn.dataset.ticker;

  if (action === 'analyze') {
    var gsBtn = document.querySelector('[data-view="greysankore"]');
    if (gsBtn) gsBtn.click();
    setTimeout(function() {
      var gsInput = document.getElementById('gsInput') || document.querySelector('.gs-input input');
      if (gsInput) {
        gsInput.value = 'Analyze ' + ticker + ' - full technical and fundamental breakdown';
        gsInput.focus();
      }
    }, 100);
  } else if (action === 'alert') {
    showToast('Alert set for ' + ticker + ' - you will be notified of significant moves', 'success');
  }
});

// Patch refreshInsightCards to inject action buttons on dynamic cards
(function patchInsightCards() {
  if (typeof refreshInsightCards !== 'function') return;
  var origFn = refreshInsightCards;
  refreshInsightCards = async function() {
    await origFn.call(this);
    document.querySelectorAll('.gs-insight-card').forEach(function(card) {
      if (card.querySelector('.insight-actions')) return;
      var tickerEl = card.querySelector('.insight-content strong');
      var ticker = tickerEl ? tickerEl.textContent : '';
      if (!ticker) return;
      var actionsDiv = document.createElement('div');
      actionsDiv.className = 'insight-actions';
      actionsDiv.innerHTML =
        '<button class="insight-action-btn" data-action="analyze" data-ticker="' + ticker + '">View Analysis</button>' +
        '<button class="insight-action-btn" data-action="alert" data-ticker="' + ticker + '">Set Alert</button>';
      card.appendChild(actionsDiv);
    });
  };
})();

// Load settings from localStorage for risk guardrails
function loadRiskSettings() {
  const maxPos = localStorage.getItem('setting_max_position');
  const dailyLoss = localStorage.getItem('setting_daily_loss');
  const maxAgents = localStorage.getItem('setting_max_agents');
  const maxOrderQty = localStorage.getItem('setting_max_order_qty');

  if (maxPos && document.getElementById('settingMaxPosition')) document.getElementById('settingMaxPosition').value = maxPos;
  if (dailyLoss && document.getElementById('settingDailyLoss')) document.getElementById('settingDailyLoss').value = dailyLoss;
  if (maxAgents && document.getElementById('settingMaxAgents')) document.getElementById('settingMaxAgents').value = maxAgents;
  if (maxOrderQty && document.getElementById('settingMaxOrderQty')) document.getElementById('settingMaxOrderQty').value = maxOrderQty;
}

// Save risk settings when inputs change
['settingMaxPosition', 'settingDailyLoss', 'settingMaxAgents', 'settingMaxOrderQty'].forEach(id => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener('change', () => {
      localStorage.setItem(`setting_${id.replace('setting', '').toLowerCase()}`, el.value);
    });
  }
});

// Run agent system init when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initAgentSystem();
    loadRiskSettings();
  });
} else {
  initAgentSystem();
  loadRiskSettings();
}

// ============================================
//  CLAUDE QUICK CHAT - Topbar Assistant
// ============================================
(function initClaudeQuickChat() {
  const CLAUDE_MAX_MESSAGES = 20;
  const STORAGE_KEY = 'claudeQuickChatHistory';

  const wrapper = document.getElementById('claudeChatWrapper');
  const toggleBtn = document.getElementById('claudeChatToggle');
  const panel = document.getElementById('claudeChatPanel');
  const closeBtn = document.getElementById('claudePanelClose');
  const messagesEl = document.getElementById('claudePanelMessages');
  const inputEl = document.getElementById('claudePanelInput');
  const sendBtn = document.getElementById('claudePanelSend');
  const chipsEl = document.getElementById('claudePanelChips');

  if (!toggleBtn || !panel) return;

  let isOpen = false;
  let isStreaming = false;
  let chatHistory = [];

  // ---- Session persistence ----
  function saveHistory() {
    try {
      const slim = chatHistory.slice(-CLAUDE_MAX_MESSAGES);
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
    } catch (e) { /* quota */ }
  }

  function loadHistory() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        chatHistory = JSON.parse(raw);
        chatHistory.forEach(function(m) {
          appendMessage(m.role, m.content, true);
        });
      }
    } catch (e) { /* ignore */ }
  }

  // ---- Toggle open/close ----
  function openPanel() {
    isOpen = true;
    panel.classList.add('open');
    toggleBtn.classList.add('active');
    setTimeout(function() { inputEl.focus(); }, 220);
    scrollToBottom();
  }

  function closePanel() {
    isOpen = false;
    panel.classList.remove('open');
    toggleBtn.classList.remove('active');
  }

  function togglePanel() {
    if (isOpen) closePanel(); else openPanel();
  }

  toggleBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    togglePanel();
  });

  closeBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    closePanel();
  });

  // Close on click outside
  document.addEventListener('click', function(e) {
    if (isOpen && !wrapper.contains(e.target)) {
      closePanel();
    }
  });

  // Prevent panel clicks from closing
  panel.addEventListener('click', function(e) { e.stopPropagation(); });

  // ---- Keyboard shortcuts ----
  document.addEventListener('keydown', function(e) {
    // Ctrl+J to toggle
    if (e.ctrlKey && e.key === 'j') {
      e.preventDefault();
      togglePanel();
      return;
    }
    // Ctrl+Shift+C to toggle (avoid conflict with copy)
    if (e.ctrlKey && e.shiftKey && e.key === 'C') {
      e.preventDefault();
      togglePanel();
      return;
    }
    // Escape to close
    if (e.key === 'Escape' && isOpen) {
      closePanel();
    }
  });

  // ---- Gather dashboard context ----
  function gatherQuickContext() {
    var ctx = {};

    // Active view
    var activeNav = document.querySelector('.nav-btn.active');
    if (activeNav) ctx.activeView = activeNav.dataset.view || activeNav.textContent.trim();

    // Selected ticker
    var tickerInput = document.getElementById('tickerSearch');
    if (tickerInput && tickerInput.value.trim()) {
      ctx.currentSymbol = tickerInput.value.trim().toUpperCase();
    }
    var activeWl = document.querySelector('.wl-row.wl-active .wl-ticker');
    if (activeWl && !ctx.currentSymbol) {
      ctx.currentSymbol = activeWl.textContent.trim();
    }

    // Watchlist tickers
    var wlTickers = [];
    document.querySelectorAll('.wl-row .wl-ticker').forEach(function(el) {
      wlTickers.push(el.textContent.trim());
    });
    if (wlTickers.length) ctx.watchlist = wlTickers;

    // Options contract (if on options view)
    var selectedContract = document.querySelector('.option-row.selected .opt-strike');
    if (selectedContract) ctx.selectedContract = selectedContract.textContent.trim();

    // Flow stats
    var flowNet = document.getElementById('flowNetPremium');
    if (flowNet) ctx.flowNetPremium = flowNet.textContent.trim();

    return ctx;
  }

  // ---- Render helpers ----
  function appendMessage(role, html, silent) {
    var div = document.createElement('div');
    div.className = 'claude-msg ' + (role === 'user' ? 'claude-msg-user' : 'claude-msg-ai');
    var inner = document.createElement('div');
    inner.className = 'claude-msg-content';
    if (role === 'user') {
      inner.textContent = html;
    } else {
      inner.innerHTML = html;
    }
    div.appendChild(inner);
    // Every AI answer carries a compact educational-use disclaimer. It is a
    // sibling of the content node so streamed updates to inner do not wipe it.
    if (role !== 'user') {
      var note = document.createElement('div');
      note.className = 'ai-response-note';
      note.textContent = 'Educational information, not advice.';
      div.appendChild(note);
    }
    messagesEl.appendChild(div);
    if (!silent) scrollToBottom();
    return inner;
  }

  function addTypingIndicator() {
    var div = document.createElement('div');
    div.className = 'claude-msg claude-msg-ai';
    div.id = 'claudeTyping';
    div.innerHTML = '<div class="claude-typing"><span></span><span></span><span></span></div>';
    messagesEl.appendChild(div);
    scrollToBottom();
  }

  function removeTypingIndicator() {
    var el = document.getElementById('claudeTyping');
    if (el) el.remove();
  }

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // ---- System prompt (different from Grey Sankore) ----
  var QUICK_SYSTEM_PROMPT = 'You are a quick trading assistant embedded in the Greystone Trading Platform topbar. ' +
    'You have access to the user\'s current view context. ' +
    'Be concise, actionable, and data-driven. Keep responses SHORT (2-4 bullet points max). ' +
    'Format responses with bullet points and bold key figures using HTML tags (<strong>, <ul>, <li>). ' +
    'Do NOT write long paragraphs. This is a quick-access helper, not a deep analysis tool.';

  // Marker prepended to mock answers so demo fiction is not mistaken for a
  // real model response.
  var QUICK_DEMO_BADGE = '<span class="demo-response-badge">Demo Response</span>';

  // ---- Send message ----
  async function sendMessage(text) {
    if (!text || !text.trim() || isStreaming) return;
    text = text.trim();

    // Add user message
    chatHistory.push({ role: 'user', content: text });
    appendMessage('user', text);
    inputEl.value = '';
    saveHistory();

    // Hide chips after first real message
    if (chipsEl) chipsEl.style.display = 'none';

    addTypingIndicator();
    isStreaming = true;

    var context = gatherQuickContext();

    // Build API history (last messages for context window)
    var apiHistory = chatHistory.slice(-10).map(function(h) {
      return { role: h.role, content: h.content };
    });

    try {
      var aiHeaders = { 'Content-Type': 'application/json' };
      try {
        var aiTok = (typeof SupabaseClient !== 'undefined' && SupabaseClient.getAccessToken) ? SupabaseClient.getAccessToken() : null;
        if (aiTok) aiHeaders['Authorization'] = 'Bearer ' + aiTok;
      } catch (e) {}
      var response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: aiHeaders,
        body: JSON.stringify({
          message: text,
          context: context,
          history: apiHistory,
          systemPrompt: QUICK_SYSTEM_PROMPT
        })
      });

      removeTypingIndicator();

      if (!response.ok) {
        var errData = {};
        try { errData = await response.json(); } catch(e) {}

        if (errData.error === 'no_api_key') {
          // Fall back to mock responses. Mark them clearly as demo output.
          var mockHtml = getQuickMockResponse(text);
          chatHistory.push({ role: 'assistant', content: mockHtml });
          appendMessage('assistant', QUICK_DEMO_BADGE + mockHtml);
          saveHistory();
          isStreaming = false;
          return;
        }

        appendMessage('assistant', '<em>Something went wrong. Try again.</em>');
        isStreaming = false;
        return;
      }

      // Stream the response
      var reader = response.body.getReader();
      var decoder = new TextDecoder();
      var fullText = '';
      var msgContent = appendMessage('assistant', '', false);
      var buffer = '';

      while (true) {
        var chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });

        var lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (var i = 0; i < lines.length; i++) {
          var line = lines[i].trim();
          if (!line.startsWith('data: ')) continue;
          var data = line.slice(6);
          if (data === '[DONE]') continue;
          try {
            var parsed = JSON.parse(data);
            if (parsed.type === 'content_block_delta' && parsed.delta && parsed.delta.text) {
              fullText += parsed.delta.text;
            } else if (parsed.text) {
              fullText += parsed.text;
            }
          } catch (e) {
            // Might be plain text chunk
            if (data && data !== '[DONE]') fullText += data;
          }
        }

        msgContent.innerHTML = fullText;
        scrollToBottom();
      }

      if (!fullText) {
        msgContent.innerHTML = '<em>No response received.</em>';
      }

      chatHistory.push({ role: 'assistant', content: fullText || msgContent.innerHTML });
      // Trim history
      if (chatHistory.length > CLAUDE_MAX_MESSAGES) {
        chatHistory = chatHistory.slice(-CLAUDE_MAX_MESSAGES);
      }
      saveHistory();

    } catch (err) {
      removeTypingIndicator();
      // Network error - use mock, clearly marked as demo output.
      var mockHtml = getQuickMockResponse(text);
      chatHistory.push({ role: 'assistant', content: mockHtml });
      appendMessage('assistant', QUICK_DEMO_BADGE + mockHtml);
      saveHistory();
    }

    isStreaming = false;
  }

  // ---- Mock response fallback ----
  function getQuickMockResponse(query) {
    var q = query.toLowerCase();
    if (q.includes('chart') || q.includes('explain')) {
      return '<ul><li><strong>Current view:</strong> Price consolidating in a tight range</li><li>Volume is below 20-day average, suggesting indecision</li><li>Watch for a breakout above resistance with volume confirmation</li></ul>';
    }
    if (q.includes('buy') || q.includes('trade')) {
      return '<ul><li><strong>Top idea:</strong> Look for defined-risk spreads in names with upcoming catalysts</li><li>IV percentile matters - buy options when IV is low, sell when high</li><li>Size positions at 2-3% of portfolio max</li></ul>';
    }
    if (q.includes('portfolio') || q.includes('summarize')) {
      return '<ul><li><strong>Watchlist focus:</strong> Check your top holdings for earnings dates in the next 2 weeks</li><li>Review position sizing - no single name should exceed 10%</li><li>Consider hedging with index puts if net delta is too long</li></ul>';
    }
    if (q.includes('news') || q.includes('market')) {
      return '<ul><li><strong>Market tone:</strong> Cautiously bullish with sector rotation into tech</li><li>10Y yield watch: above 4.35% puts pressure on growth names</li><li>VIX at moderate levels - options are fairly priced for hedging</li></ul>';
    }
    if (q.includes('flow') || q.includes('option')) {
      return '<ul><li><strong>Flow read:</strong> Call premium exceeding puts, bullish skew</li><li>Watch for sweeps at the ask - that signals urgency</li><li>Dark pool prints above $10M are the institutional footprint to track</li></ul>';
    }
    return '<ul><li>I can help with chart analysis, trade ideas, portfolio review, and market context</li><li>Try asking about a specific ticker or your current view</li><li>For deep analysis, use Grey Sankore (Ctrl+G)</li></ul>';
  }

  // ---- Event bindings ----
  sendBtn.addEventListener('click', function() {
    sendMessage(inputEl.value);
  });

  inputEl.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputEl.value);
    }
  });

  // Chip clicks
  chipsEl.addEventListener('click', function(e) {
    var chip = e.target.closest('.claude-chip');
    if (chip) {
      sendMessage(chip.dataset.prompt);
    }
  });

  // Load persisted history
  loadHistory();
})();

/* ============================================
   FEATURE 1: PRICE ALERTS SYSTEM
   ============================================ */

(function initPriceAlerts() {
  var STORAGE_KEY = 'greystone_price_alerts';
  var HISTORY_KEY = 'greystone_price_alerts_history';

  var bellBtn = document.getElementById('alertsBellBtn');
  var dropdown = document.getElementById('alertsDropdown');
  var badge = document.getElementById('alertsBellBadge');
  var addBtn = document.getElementById('alertsAddBtn');
  var activeList = document.getElementById('alertsActiveList');
  var historyList = document.getElementById('alertsHistoryList');
  var createBtn = document.getElementById('createAlertBtn');

  if (!bellBtn) return;

  // State
  var alerts = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  var alertHistory = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');

  function saveAlerts() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts));
    localStorage.setItem(HISTORY_KEY, JSON.stringify(alertHistory));
  }

  function updateBadge() {
    if (alerts.length > 0) {
      badge.textContent = alerts.length;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  }

  function formatCondition(alert) {
    var typeLabels = {
      above: 'Price Above $',
      below: 'Price Below $',
      pct_up: '% Change Up ',
      pct_down: '% Change Down ',
      volume: 'Volume Spike '
    };
    var prefix = typeLabels[alert.type] || '';
    if (alert.type === 'pct_up' || alert.type === 'pct_down') {
      return prefix + alert.value + '%';
    }
    if (alert.type === 'volume') {
      return prefix + alert.value + 'x avg';
    }
    return prefix + alert.value;
  }

  function renderActiveAlerts() {
    if (alerts.length === 0) {
      activeList.innerHTML = '<div class="alerts-empty">No active alerts. Click + to create one.</div>';
      return;
    }
    var html = '';
    alerts.forEach(function(a, i) {
      html += '<div class="alert-item" data-index="' + i + '">';
      html += '<div class="alert-item-info">';
      html += '<div class="alert-item-ticker">' + a.ticker + '</div>';
      html += '<div class="alert-item-condition">' + formatCondition(a) + '</div>';
      html += '</div>';
      html += '<button class="alert-item-dismiss" data-action="dismiss" data-index="' + i + '" title="Remove">&times;</button>';
      html += '</div>';
    });
    activeList.innerHTML = html;
  }

  function renderHistoryAlerts() {
    if (alertHistory.length === 0) {
      historyList.innerHTML = '<div class="alerts-empty">No triggered alerts yet.</div>';
      return;
    }
    var html = '';
    alertHistory.slice(0, 20).forEach(function(a) {
      html += '<div class="alert-item triggered">';
      html += '<div class="alert-item-info">';
      html += '<div class="alert-item-ticker">' + a.ticker + '</div>';
      html += '<div class="alert-item-condition">Triggered: ' + formatCondition(a) + '</div>';
      html += '</div>';
      html += '</div>';
    });
    historyList.innerHTML = html;
  }

  function render() {
    updateBadge();
    renderActiveAlerts();
    renderHistoryAlerts();
  }

  // Toggle dropdown
  bellBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    dropdown.classList.toggle('active');
  });

  document.addEventListener('click', function(e) {
    if (!dropdown.contains(e.target) && !bellBtn.contains(e.target)) {
      dropdown.classList.remove('active');
    }
  });

  // Tabs
  document.querySelectorAll('.alerts-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      document.querySelectorAll('.alerts-tab').forEach(function(t) { t.classList.remove('active'); });
      tab.classList.add('active');
      var which = tab.dataset.alertsTab;
      activeList.style.display = which === 'active' ? 'block' : 'none';
      historyList.style.display = which === 'history' ? 'block' : 'none';
    });
  });

  // Dismiss alert
  activeList.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-action="dismiss"]');
    if (!btn) return;
    var idx = parseInt(btn.dataset.index);
    alerts.splice(idx, 1);
    saveAlerts();
    render();
  });

  // Open create modal from dropdown
  addBtn.addEventListener('click', function() {
    dropdown.classList.remove('active');
    openAlertModal('');
  });

  function openAlertModal(ticker) {
    var tickerInput = document.getElementById('alertConfigTicker');
    var valueInput = document.getElementById('alertConfigValue');
    var typeSelect = document.getElementById('alertConfigType');
    if (tickerInput) tickerInput.value = ticker || '';
    if (valueInput) valueInput.value = '';
    if (typeSelect) typeSelect.value = 'above';
    var modal = document.getElementById('alertConfigModal');
    if (modal) modal.classList.add('active');
  }

  // Create alert
  if (createBtn) {
    createBtn.addEventListener('click', function() {
      var ticker = (document.getElementById('alertConfigTicker').value || '').toUpperCase().trim();
      var type = document.getElementById('alertConfigType').value;
      var value = parseFloat(document.getElementById('alertConfigValue').value);
      var sound = document.getElementById('alertConfigSound').checked;
      if (!ticker || isNaN(value)) {
        showToast('Please fill in ticker and value', 'error');
        return;
      }
      alerts.push({ ticker: ticker, type: type, value: value, sound: sound, created: Date.now() });
      saveAlerts();
      render();
      closeModal('alertConfigModal');
      showToast('Alert created for ' + ticker, 'success');
    });
  }

  // Watchlist alert buttons - add bell icons to watchlist rows
  function addWatchlistAlertButtons() {
    document.querySelectorAll('.wl-row[data-ticker]').forEach(function(row) {
      if (row.querySelector('.wl-alert-btn')) return;
      var ticker = row.dataset.ticker;
      var btn = document.createElement('button');
      btn.className = 'wl-alert-btn';
      btn.title = 'Set Alert for ' + ticker;
      btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>';
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        openAlertModal(ticker);
      });
      row.appendChild(btn);
    });
  }

  // Alert sound - simple oscillator beep
  function playAlertSound() {
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    } catch (e) { /* silent fail */ }
  }

  // Check alerts against current prices (called from refresh cycle)
  function checkAlerts(priceMap) {
    var triggered = [];
    var remaining = [];

    alerts.forEach(function(a) {
      var price = priceMap[a.ticker];
      if (!price) { remaining.push(a); return; }

      var hit = false;
      if (a.type === 'above' && price.last >= a.value) hit = true;
      if (a.type === 'below' && price.last <= a.value) hit = true;
      if (a.type === 'pct_up' && price.changePercent >= a.value) hit = true;
      if (a.type === 'pct_down' && price.changePercent <= -a.value) hit = true;
      if (a.type === 'volume' && price.volume && price.avgVolume && (price.volume / price.avgVolume) >= a.value) hit = true;

      if (hit) {
        triggered.push(a);
        alertHistory.unshift(a);
      } else {
        remaining.push(a);
      }
    });

    if (triggered.length > 0) {
      alerts = remaining;
      saveAlerts();
      render();

      triggered.forEach(function(a) {
        showToast(a.ticker + ' Alert: ' + formatCondition(a) + ' triggered!', 'success');
        if (a.sound) playAlertSound();
      });

      bellBtn.classList.add('flash');
      setTimeout(function() { bellBtn.classList.remove('flash'); }, 2000);
    }
  }

  // Expose for external use
  window.PriceAlerts = {
    openModal: openAlertModal,
    checkAlerts: checkAlerts,
    getAlerts: function() { return alerts; }
  };

  // Initialize
  render();
  addWatchlistAlertButtons();

  // Re-add buttons after potential DOM changes (observer)
  var watchlistObserver = new MutationObserver(function() {
    addWatchlistAlertButtons();
  });
  var watchlistPanel = document.querySelector('.watchlist-table');
  if (watchlistPanel) {
    watchlistObserver.observe(watchlistPanel, { childList: true, subtree: true });
  }

  // Piggyback on existing price refresh (every 15 seconds)
  setInterval(function() {
    if (alerts.length === 0) return;
    // Build price map from watchlist DOM
    var priceMap = {};
    document.querySelectorAll('.wl-row[data-ticker]').forEach(function(row) {
      var ticker = row.dataset.ticker;
      var priceEl = row.querySelector('.wl-price');
      var changeEl = row.querySelector('.wl-change');
      if (priceEl) {
        var last = parseFloat(priceEl.textContent.replace(/,/g, ''));
        var chgText = changeEl ? changeEl.textContent : '0%';
        var changePercent = parseFloat(chgText.replace(/[%+]/g, ''));
        priceMap[ticker] = { last: last, changePercent: changePercent };
      }
    });
    checkAlerts(priceMap);
  }, 15000);
})();

/* ============================================
   FEATURE 2: NEWS FEED
   ============================================ */

(function initNewsFeed() {
  var newsFeed = document.getElementById('newsFeed');
  var refreshBtn = document.getElementById('newsRefreshBtn');
  if (!newsFeed) return;

  var currentTab = 'top';

  function formatTimeAgo(timestamp) {
    var diff = Date.now() - timestamp;
    var mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return mins + 'm ago';
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    return Math.floor(hrs / 24) + 'd ago';
  }

  function renderNoNewsState() {
    newsFeed.innerHTML = '<div class="news-empty-state">' +
      '<div class="news-empty-title">No news provider connected</div>' +
      '<div class="news-empty-sub">Connect a news API to see live headlines. This preview build does not show sample or placeholder news.</div>' +
      '</div>';
  }

  function renderNews(items) {
    if (!items || items.length === 0) {
      renderNoNewsState();
      return;
    }
    var html = '';
    items.forEach(function(item) {
      html += '<div class="news-item">';
      html += '<a class="news-headline" href="#" onclick="return false;">' + item.headline + '</a>';
      html += '<div class="news-meta">';
      html += '<span class="news-source">' + item.source + '</span>';
      html += '<span>' + formatTimeAgo(item.time) + '</span>';
      if (item.tickers) html += '<span>' + item.tickers.join(', ') + '</span>';
      html += '<span class="news-sentiment ' + item.sentiment + '">' + item.sentiment + '</span>';
      html += '</div>';
      html += '</div>';
    });
    newsFeed.innerHTML = html;
  }

  function fetchNews() {
    newsFeed.innerHTML = '<div class="news-loading">Loading news...</div>';

    // Get watchlist tickers for filtered views
    var watchlistTickers = [];
    document.querySelectorAll('.wl-row[data-ticker]').forEach(function(row) {
      watchlistTickers.push(row.dataset.ticker);
    });

    var url = '/api/news';
    var params = [];
    if (currentTab === 'watchlist' && watchlistTickers.length) {
      params.push('symbols=' + watchlistTickers.join(','));
    }
    if (currentTab === 'earnings') {
      params.push('category=earnings');
      // Scope to the user's own watchlist when they have one; the server
      // falls back to a market basket if no symbols are sent.
      if (watchlistTickers.length) params.push('symbols=' + watchlistTickers.join(','));
    }
    if (params.length) url += '?' + params.join('&');

    fetch(url)
      .then(function(r) { return r.json(); })
      .then(function(data) {
        renderNews(data.news || []);
      })
      .catch(function() {
        // No news provider reachable. Show an honest empty state.
        // We deliberately do NOT fabricate placeholder headlines here.
        renderNoNewsState();
      });
  }

  // Tab clicks
  document.querySelectorAll('.news-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      document.querySelectorAll('.news-tab').forEach(function(t) { t.classList.remove('active'); });
      tab.classList.add('active');
      currentTab = tab.dataset.newsTab;
      fetchNews();
    });
  });

  // Refresh
  if (refreshBtn) {
    refreshBtn.addEventListener('click', fetchNews);
  }

  // Initial load
  fetchNews();

  // Auto-refresh every 5 minutes
  setInterval(fetchNews, 300000);
})();

/* ============================================
   FEATURE 3: EARNINGS CALENDAR
   ============================================ */

(function initEarningsCalendar() {
  var calendarEl = document.getElementById('earningsCalendar');
  if (!calendarEl) return;

  // Generate realistic mock earnings data based on watchlist tickers
  function getEarningsData() {
    var today = new Date();
    var data = [
      { ticker: 'AAPL', date: addDays(today, 2), time: 'AMC', epsEst: '$2.14', revEst: '$94.2B' },
      { ticker: 'NVDA', date: addDays(today, 5), time: 'AMC', epsEst: '$5.42', revEst: '$28.5B' },
      { ticker: 'MSFT', date: addDays(today, 1), time: 'AMC', epsEst: '$3.18', revEst: '$62.1B' },
      { ticker: 'AMZN', date: addDays(today, 3), time: 'AMC', epsEst: '$1.24', revEst: '$155.7B' },
      { ticker: 'META', date: addDays(today, 8), time: 'AMC', epsEst: '$5.38', revEst: '$41.2B' },
      { ticker: 'GOOGL', date: addDays(today, 9), time: 'AMC', epsEst: '$1.98', revEst: '$85.3B' },
      { ticker: 'TSLA', date: addDays(today, 0), time: 'AMC', epsEst: '$0.78', revEst: '$25.8B' },
      { ticker: 'AMD', date: addDays(today, 4), time: 'AMC', epsEst: '$0.92', revEst: '$6.8B' },
      { ticker: 'JPM', date: addDays(today, 6), time: 'BMO', epsEst: '$4.62', revEst: '$42.1B' },
      { ticker: 'COIN', date: addDays(today, 11), time: 'AMC', epsEst: '$1.87', revEst: '$1.8B' },
      { ticker: 'DIS', date: addDays(today, 12), time: 'BMO', epsEst: '$1.21', revEst: '$23.4B' },
    ];
    // Sort by date
    data.sort(function(a, b) { return a.date - b.date; });
    return data;
  }

  function addDays(date, days) {
    var d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  function formatDate(d) {
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return months[d.getMonth()] + ' ' + d.getDate();
  }

  function getDateClass(d) {
    var today = new Date();
    today.setHours(0,0,0,0);
    var target = new Date(d);
    target.setHours(0,0,0,0);
    var diff = (target - today) / (1000 * 60 * 60 * 24);
    if (diff === 0) return 'today';
    if (diff > 0 && diff <= 7) return 'this-week';
    return 'next-week';
  }

  function renderCalendar() {
    var data = getEarningsData();
    var html = '<div class="earnings-header"><span>Date</span><span>Ticker</span><span>Time</span><span>EPS Est.</span><span>Rev Est.</span></div>';

    data.forEach(function(e) {
      var dateClass = getDateClass(e.date);
      html += '<div class="earnings-row">';
      html += '<span class="earnings-date ' + dateClass + '">' + formatDate(e.date) + (dateClass === 'today' ? ' (Today)' : '') + '</span>';
      html += '<span class="earnings-ticker">' + e.ticker + '</span>';
      html += '<span class="earnings-time ' + e.time.toLowerCase() + '">' + e.time + '</span>';
      html += '<span class="earnings-est">' + e.epsEst + '</span>';
      html += '<span class="earnings-est">' + e.revEst + '</span>';
      html += '</div>';
    });

    calendarEl.innerHTML = html;
  }

  // Add earnings badges to watchlist
  function addEarningsBadges() {
    var data = getEarningsData();
    var earningsMap = {};
    var today = new Date();
    today.setHours(0,0,0,0);

    data.forEach(function(e) {
      var target = new Date(e.date);
      target.setHours(0,0,0,0);
      var diff = (target - today) / (1000 * 60 * 60 * 24);
      if (diff >= 0 && diff <= 7) {
        earningsMap[e.ticker] = e;
      }
    });

    document.querySelectorAll('.wl-row[data-ticker]').forEach(function(row) {
      if (row.querySelector('.wl-earnings-badge')) return;
      var ticker = row.dataset.ticker;
      if (earningsMap[ticker]) {
        var badge = document.createElement('span');
        badge.className = 'wl-earnings-badge';
        badge.textContent = 'E';
        badge.title = 'Earnings ' + formatDate(earningsMap[ticker].date) + ' ' + earningsMap[ticker].time + ' - EPS Est: ' + earningsMap[ticker].epsEst;
        var symEl = row.querySelector('.wl-sym');
        if (symEl) symEl.after(badge);
      }
    });
  }

  renderCalendar();
  addEarningsBadges();

  // Observe watchlist for changes
  var wlObserver = new MutationObserver(addEarningsBadges);
  var wlTable = document.querySelector('.watchlist-table');
  if (wlTable) wlObserver.observe(wlTable, { childList: true, subtree: true });
})();

/* ============================================
   FEATURE 4: TRADE JOURNAL (Full Implementation)
   ============================================ */

(function initTradeJournal() {
  var STORAGE_KEY = 'gs_journal_entries';
  var entries = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');

  // Seed sample data on first load
  if (entries.length === 0) {
    entries = generateSampleEntries();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }

  var newEntryBtn = document.getElementById('newJournalEntryBtn');
  var saveBtn = document.getElementById('saveJournalEntryBtn');
  var entriesList = document.getElementById('journalEntriesList');
  var filterOutcome = document.getElementById('journalFilterOutcome');
  var filterStrategy = document.getElementById('journalFilterStrategy');

  var editingId = null;
  var selectedRating = 0;
  var selectedEmotion = '';
  var calYear = 2026;
  var calMonth = 2; // 0-indexed, March=2
  var calFilterDate = null; // YYYY-MM-DD string to filter trade log
  var sortColumn = 'date';
  var sortDesc = true;

  if (!newEntryBtn) return;

  function saveEntriesToStorage() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }

  function calcPnL(e) {
    if (!e.exit || !e.entry || !e.shares) return null;
    var diff = (e.direction === 'long' || e.direction === 'Long')
      ? (e.exit - e.entry) : (e.entry - e.exit);
    return diff * e.shares;
  }

  function calcRMultiple(e) {
    if (!e.exit || !e.entry || !e.stopLoss) return null;
    var risk = (e.direction === 'long' || e.direction === 'Long')
      ? (e.entry - e.stopLoss) : (e.stopLoss - e.entry);
    if (risk <= 0) return null;
    var reward = (e.direction === 'long' || e.direction === 'Long')
      ? (e.exit - e.entry) : (e.entry - e.exit);
    return reward / risk;
  }

  function fmtPnl(pnl) {
    if (pnl === null || pnl === undefined) return '--';
    return pnl >= 0 ? '+$' + Math.abs(pnl).toLocaleString('en-US', {maximumFractionDigits:0}) : '-$' + Math.abs(pnl).toLocaleString('en-US', {maximumFractionDigits:0});
  }

  // ---- STATS ----
  function updateJournalStats() {
    var wins = 0, losses = 0, totalWin = 0, totalLoss = 0;
    var best = -Infinity, worst = Infinity;
    var monthlyPnl = {};

    entries.forEach(function(e) {
      var pnl = e.pnl !== undefined ? e.pnl : calcPnL(e);
      if (pnl === null) return;
      if (pnl > 0) { wins++; totalWin += pnl; if (pnl > best) best = pnl; }
      if (pnl < 0) { losses++; totalLoss += Math.abs(pnl); if (pnl < worst) worst = pnl; }
      if (pnl === 0) { wins++; } // breakeven = win
      var month = e.date ? e.date.substring(0, 7) : 'Unknown';
      monthlyPnl[month] = (monthlyPnl[month] || 0) + pnl;
    });

    var total = wins + losses;
    var winRate = total > 0 ? ((wins / total) * 100).toFixed(1) + '%' : '--%';
    var winRateNum = total > 0 ? (wins / total) : 0;
    var avgWin = wins > 0 ? '$' + (totalWin / wins).toLocaleString('en-US', {maximumFractionDigits:0}) : '--';
    var avgLoss = losses > 0 ? '-$' + (totalLoss / losses).toLocaleString('en-US', {maximumFractionDigits:0}) : '--';
    var profitFactor = totalLoss > 0 ? (totalWin / totalLoss).toFixed(2) : '--';
    var bestStr = best > -Infinity ? '+$' + best.toLocaleString('en-US', {maximumFractionDigits:0}) : '--';
    var worstStr = worst < Infinity ? '-$' + Math.abs(worst).toLocaleString('en-US', {maximumFractionDigits:0}) : '--';

    var now = new Date();
    var curMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    var curPnl = monthlyPnl[curMonth] || 0;

    setText('journalWinRate', winRate);
    var wrEl = document.getElementById('journalWinRate');
    if (wrEl) wrEl.className = 'journal-stat-value ' + (winRateNum >= 0.5 ? 'profit' : 'loss');
    setText('journalAvgWin', avgWin);
    setText('journalAvgLoss', avgLoss);
    setText('journalProfitFactor', profitFactor);
    setText('journalBestTrade', bestStr);
    setText('journalWorstTrade', worstStr);
    setText('journalTotalTrades', entries.length.toString());
    var monthEl = document.getElementById('journalMonthlyPnl');
    if (monthEl) {
      monthEl.textContent = fmtPnl(curPnl);
      monthEl.className = 'journal-stat-value ' + (curPnl >= 0 ? 'profit' : 'loss');
    }

    renderStrategyBreakdown();
    renderMonthlyPnlBars(monthlyPnl);
    renderCalendarHeatmap();
  }

  function setText(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  // ---- STRATEGY BREAKDOWN (win rate bars) ----
  function renderStrategyBreakdown() {
    var stratData = {};
    entries.forEach(function(e) {
      var s = e.setup || e.strategy || 'Other';
      if (!stratData[s]) stratData[s] = { wins: 0, total: 0 };
      var pnl = e.pnl !== undefined ? e.pnl : calcPnL(e);
      if (pnl === null) return;
      stratData[s].total++;
      if (pnl >= 0) stratData[s].wins++;
    });
    var container = document.getElementById('journalStrategyBars');
    if (!container) return;

    var keys = Object.keys(stratData);
    if (keys.length === 0) {
      container.innerHTML = '<div class="journal-strategy-empty">No trade data yet.</div>';
      return;
    }

    keys.sort(function(a, b) { return stratData[b].total - stratData[a].total; });
    var html = '';
    keys.forEach(function(k) {
      var d = stratData[k];
      var wr = d.total > 0 ? (d.wins / d.total * 100) : 0;
      var barClass = wr > 55 ? 'win-high' : (wr < 45 ? 'win-low' : 'win-neutral');
      html += '<div class="journal-strategy-row">';
      html += '<span class="journal-strategy-name">' + k + '</span>';
      html += '<div class="journal-strategy-bar-wrap"><div class="journal-strategy-bar ' + barClass + '" style="width:' + wr.toFixed(0) + '%"></div></div>';
      html += '<span class="journal-strategy-winrate" style="color:' + (wr >= 50 ? 'var(--profit)' : 'var(--loss)') + '">' + wr.toFixed(0) + '%</span>';
      html += '<span class="journal-strategy-count">' + d.total + ' trades</span>';
      html += '</div>';
    });
    container.innerHTML = html;
  }

  // ---- MONTHLY P&L BARS ----
  function renderMonthlyPnlBars(monthlyPnl) {
    var container = document.getElementById('journalMonthlyTable');
    if (!container) return;
    if (!monthlyPnl) {
      monthlyPnl = {};
      entries.forEach(function(e) {
        var pnl = e.pnl !== undefined ? e.pnl : calcPnL(e);
        if (pnl === null) return;
        var month = e.date ? e.date.substring(0, 7) : 'Unknown';
        monthlyPnl[month] = (monthlyPnl[month] || 0) + pnl;
      });
    }

    var months = Object.keys(monthlyPnl).sort().reverse();
    if (months.length === 0) {
      container.innerHTML = '<div class="journal-strategy-empty">No trade data yet.</div>';
      return;
    }

    var maxAbs = Math.max.apply(null, months.map(function(m) { return Math.abs(monthlyPnl[m]); }));
    var html = '';
    months.slice(0, 12).forEach(function(m) {
      var pnl = monthlyPnl[m];
      var pct = maxAbs > 0 ? (Math.abs(pnl) / maxAbs * 100).toFixed(0) : 0;
      var cls = pnl >= 0 ? 'profit' : 'loss';
      html += '<div class="journal-monthly-row">';
      html += '<span class="journal-monthly-month">' + m + '</span>';
      html += '<div class="journal-monthly-bar-wrap"><div class="journal-monthly-bar ' + cls + '" style="width:' + pct + '%"></div></div>';
      html += '<span class="journal-monthly-pnl ' + cls + '">' + fmtPnl(pnl) + '</span>';
      html += '</div>';
    });
    container.innerHTML = html;
  }

  // ---- CALENDAR HEATMAP ----
  function renderCalendarHeatmap() {
    var container = document.getElementById('journalCalendarGrid');
    var monthLabel = document.getElementById('journalCalMonth');
    var totalLabel = document.getElementById('journalCalTotal');
    if (!container) return;

    var monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    if (monthLabel) monthLabel.textContent = monthNames[calMonth] + ' ' + calYear;

    // Aggregate daily P&L for this month
    var prefix = calYear + '-' + String(calMonth + 1).padStart(2, '0');
    var dailyPnl = {};
    var monthTotal = 0;
    entries.forEach(function(e) {
      if (!e.date || !e.date.startsWith(prefix)) return;
      var pnl = e.pnl !== undefined ? e.pnl : calcPnL(e);
      if (pnl === null) return;
      var day = parseInt(e.date.substring(8, 10));
      dailyPnl[day] = (dailyPnl[day] || 0) + pnl;
      monthTotal += pnl;
    });

    if (totalLabel) {
      totalLabel.textContent = fmtPnl(monthTotal);
      totalLabel.className = 'journal-cal-total ' + (monthTotal >= 0 ? 'profit' : 'loss');
    }

    // Determine max absolute for color scaling
    var vals = Object.values(dailyPnl);
    var maxAbs = vals.length > 0 ? Math.max.apply(null, vals.map(function(v) { return Math.abs(v); })) : 1;

    var firstDay = new Date(calYear, calMonth, 1).getDay(); // 0=Sun
    var daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

    var html = '';
    var dayLabels = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    dayLabels.forEach(function(d) {
      html += '<div class="journal-cal-header">' + d + '</div>';
    });

    // Empty cells before first day
    for (var i = 0; i < firstDay; i++) {
      html += '<div class="journal-cal-cell empty"></div>';
    }

    for (var d = 1; d <= daysInMonth; d++) {
      var pnl = dailyPnl[d];
      var dateStr = prefix + '-' + String(d).padStart(2, '0');
      var cls = 'journal-cal-cell';
      var pnlLabel = '';
      if (pnl !== undefined) {
        cls += ' has-trades';
        var intensity = Math.min(Math.abs(pnl) / maxAbs, 1);
        var level = intensity < 0.33 ? 1 : (intensity < 0.66 ? 2 : 3);
        cls += pnl >= 0 ? ' cal-profit-' + level : ' cal-loss-' + level;
        pnlLabel = '<span class="cal-pnl">' + fmtPnl(pnl) + '</span>';
        if (calFilterDate === dateStr) cls += ' selected';
      }
      html += '<div class="' + cls + '" data-cal-date="' + dateStr + '">';
      html += '<span class="cal-day">' + d + '</span>';
      html += pnlLabel;
      html += '</div>';
    }

    container.innerHTML = html;
  }

  // Calendar navigation
  var calPrev = document.getElementById('journalCalPrev');
  var calNext = document.getElementById('journalCalNext');
  if (calPrev) calPrev.addEventListener('click', function() {
    calMonth--;
    if (calMonth < 0) { calMonth = 11; calYear--; }
    renderCalendarHeatmap();
  });
  if (calNext) calNext.addEventListener('click', function() {
    calMonth++;
    if (calMonth > 11) { calMonth = 0; calYear++; }
    renderCalendarHeatmap();
  });

  // Calendar click to filter
  var calGrid = document.getElementById('journalCalendarGrid');
  if (calGrid) calGrid.addEventListener('click', function(ev) {
    var cell = ev.target.closest('.journal-cal-cell.has-trades');
    if (!cell) return;
    var dateStr = cell.dataset.calDate;
    if (calFilterDate === dateStr) {
      calFilterDate = null; // toggle off
    } else {
      calFilterDate = dateStr;
    }
    renderCalendarHeatmap();
    renderJournalTable();
  });

  // ---- TRADE LOG TABLE ----
  function filterEntries() {
    var outcomeVal = filterOutcome ? filterOutcome.value : 'all';
    var strategyVal = filterStrategy ? filterStrategy.value : 'all';

    return entries.filter(function(e) {
      // Calendar date filter
      if (calFilterDate && e.date !== calFilterDate) return false;

      // Outcome filter
      if (outcomeVal !== 'all') {
        var pnl = e.pnl !== undefined ? e.pnl : calcPnL(e);
        if (outcomeVal === 'win' && (pnl === null || pnl <= 0)) return false;
        if (outcomeVal === 'loss' && (pnl === null || pnl >= 0)) return false;
        if (outcomeVal === 'open' && pnl !== null) return false;
      }
      // Strategy filter
      var setup = e.setup || e.strategy || 'Other';
      if (strategyVal !== 'all' && setup !== strategyVal) return false;
      return true;
    });
  }

  function sortEntries(arr) {
    var col = sortColumn;
    var desc = sortDesc;
    arr.sort(function(a, b) {
      var va, vb;
      switch (col) {
        case 'date': va = a.date || ''; vb = b.date || ''; break;
        case 'ticker': va = a.ticker || ''; vb = b.ticker || ''; break;
        case 'direction': va = a.direction || ''; vb = b.direction || ''; break;
        case 'entry': va = a.entry || 0; vb = b.entry || 0; break;
        case 'exit': va = a.exit || 0; vb = b.exit || 0; break;
        case 'shares': va = a.shares || 0; vb = b.shares || 0; break;
        case 'pnl': va = (a.pnl !== undefined ? a.pnl : calcPnL(a)) || 0; vb = (b.pnl !== undefined ? b.pnl : calcPnL(b)) || 0; break;
        case 'rMultiple': va = a.rMultiple || calcRMultiple(a) || 0; vb = b.rMultiple || calcRMultiple(b) || 0; break;
        case 'holdTime': va = a.holdTime || ''; vb = b.holdTime || ''; break;
        case 'setup': va = a.setup || a.strategy || ''; vb = b.setup || b.strategy || ''; break;
        case 'rating': va = a.rating || 0; vb = b.rating || 0; break;
        default: va = a.date || ''; vb = b.date || '';
      }
      if (typeof va === 'string') {
        var cmp = va.localeCompare(vb);
        return desc ? -cmp : cmp;
      }
      return desc ? (vb - va) : (va - vb);
    });
    return arr;
  }

  function renderJournalTable() {
    if (!entriesList) return;
    var filtered = filterEntries();
    filtered = sortEntries(filtered);

    if (filtered.length === 0) {
      var msg = calFilterDate ? 'No trades on ' + calFilterDate + '.' : 'No journal entries match your filters.';
      entriesList.innerHTML = '<div class="journal-entries-empty">' + msg + '</div>';
      return;
    }

    var columns = [
      { key: 'date', label: 'Date' },
      { key: 'ticker', label: 'Ticker' },
      { key: 'direction', label: 'Dir' },
      { key: 'entry', label: 'Entry' },
      { key: 'exit', label: 'Exit' },
      { key: 'shares', label: 'Size' },
      { key: 'pnl', label: 'P&L ($)' },
      { key: 'rMultiple', label: 'P&L (R)' },
      { key: 'holdTime', label: 'Hold' },
      { key: 'setup', label: 'Setup' },
      { key: 'rating', label: 'Rating' },
      { key: 'notes', label: 'Notes' }
    ];

    var html = '<div class="journal-entries-header">';
    columns.forEach(function(c) {
      var cls = sortColumn === c.key ? 'sort-active' + (sortDesc ? ' sort-desc' : '') : '';
      html += '<span class="' + cls + '" data-sort-col="' + c.key + '">' + c.label + '</span>';
    });
    html += '</div>';

    filtered.forEach(function(e) {
      var pnl = e.pnl !== undefined ? e.pnl : calcPnL(e);
      var pnlStr = fmtPnl(pnl);
      var pnlClass = pnl !== null ? (pnl >= 0 ? 'profit' : 'loss') : '';

      var rMult = e.rMultiple !== undefined ? e.rMultiple : calcRMultiple(e);
      var rStr = rMult !== null ? (rMult >= 0 ? '+' : '') + rMult.toFixed(2) + 'R' : '--';

      var dir = e.direction || '--';
      var dirDisplay = dir.charAt(0).toUpperCase() + dir.slice(1).toLowerCase();
      var dirClass = (dir.toLowerCase() === 'long') ? 'Long' : 'Short';

      var stars = '';
      for (var s = 1; s <= 5; s++) {
        stars += '<span class="' + (s <= (e.rating || 0) ? 'star-filled' : '') + '">&#9733;</span>';
      }

      html += '<div class="journal-entry-row" data-entry-id="' + e.id + '">';
      html += '<span class="journal-entry-date">' + (e.date || '--') + '</span>';
      html += '<span class="journal-entry-ticker">' + (e.ticker || '--') + '</span>';
      html += '<span class="journal-entry-dir ' + dirClass + '">' + dirDisplay + '</span>';
      html += '<span class="journal-entry-price">$' + (e.entry ? e.entry.toFixed(2) : '--') + '</span>';
      html += '<span class="journal-entry-price">$' + (e.exit ? e.exit.toFixed(2) : '--') + '</span>';
      html += '<span class="journal-entry-size">' + (e.shares || '--') + '</span>';
      html += '<span class="journal-entry-pnl ' + pnlClass + '">' + pnlStr + '</span>';
      html += '<span class="journal-entry-rmult">' + rStr + '</span>';
      html += '<span class="journal-entry-holdtime">' + (e.holdTime || '--') + '</span>';
      html += '<span class="journal-entry-tag">' + (e.setup || e.strategy || '--') + '</span>';
      html += '<span class="journal-entry-stars">' + stars + '</span>';
      html += '<span class="journal-entry-notes-cell">' + (e.notes || '').substring(0, 50) + '</span>';
      html += '</div>';

      // Expandable detail row
      html += '<div class="journal-entry-detail" data-detail-id="' + e.id + '">';
      html += '<div class="journal-detail-grid">';
      html += '<div><span class="journal-detail-label">Ticker</span><span class="journal-detail-value">' + (e.ticker || '--') + '</span></div>';
      html += '<div><span class="journal-detail-label">Direction</span><span class="journal-detail-value">' + dirDisplay + '</span></div>';
      html += '<div><span class="journal-detail-label">Stop Loss</span><span class="journal-detail-value">' + (e.stopLoss ? '$' + e.stopLoss.toFixed(2) : '--') + '</span></div>';
      html += '<div><span class="journal-detail-label">R-Multiple</span><span class="journal-detail-value">' + rStr + '</span></div>';
      html += '</div>';
      if (e.emotion) {
        html += '<div class="journal-detail-emotion"><span class="journal-emotion-tag selected">' + e.emotion + '</span></div>';
      }
      if (e.notes) {
        html += '<div class="journal-detail-notes">' + e.notes + '</div>';
      }
      html += '</div>';
    });

    entriesList.innerHTML = html;
  }

  // Sort by column click
  if (entriesList) {
    entriesList.addEventListener('click', function(ev) {
      var headerSpan = ev.target.closest('.journal-entries-header span[data-sort-col]');
      if (headerSpan) {
        var col = headerSpan.dataset.sortCol;
        if (sortColumn === col) { sortDesc = !sortDesc; }
        else { sortColumn = col; sortDesc = true; }
        renderJournalTable();
        return;
      }

      // Toggle detail row
      var row = ev.target.closest('.journal-entry-row');
      if (!row) return;
      var id = row.dataset.entryId;
      var detail = entriesList.querySelector('.journal-entry-detail[data-detail-id="' + id + '"]');
      if (detail) {
        detail.classList.toggle('active');
      }
    });
  }

  // ---- MODAL: New Entry ----
  function resetModal() {
    editingId = null;
    selectedRating = 0;
    selectedEmotion = '';
    var today = new Date().toISOString().split('T')[0];
    document.getElementById('journalEntryDate').value = today;
    document.getElementById('journalEntryTicker').value = '';
    document.getElementById('journalEntryDirection').value = 'Long';
    document.getElementById('journalEntryPrice').value = '';
    document.getElementById('journalExitPrice').value = '';
    document.getElementById('journalEntryShares').value = '';
    document.getElementById('journalEntryStopLoss').value = '';
    document.getElementById('journalEntryStrategy').value = 'Momentum';
    document.getElementById('journalEntryHoldTime').value = '';
    document.getElementById('journalEntryNotes').value = '';
    document.getElementById('journalModalTitle').textContent = 'New Trade Entry';
    updateStarDisplay();
    updateEmotionDisplay();
    recalcModal();
  }

  newEntryBtn.addEventListener('click', function() {
    resetModal();
    var modal = document.getElementById('journalEntryModal');
    if (modal) modal.classList.add('active');
  });

  // Star rating
  var starContainer = document.getElementById('journalStarRating');
  if (starContainer) {
    starContainer.addEventListener('click', function(ev) {
      var star = ev.target.closest('.journal-star');
      if (!star) return;
      selectedRating = parseInt(star.dataset.star);
      updateStarDisplay();
    });
    starContainer.addEventListener('mouseover', function(ev) {
      var star = ev.target.closest('.journal-star');
      if (!star) return;
      var val = parseInt(star.dataset.star);
      starContainer.querySelectorAll('.journal-star').forEach(function(s) {
        s.classList.toggle('hovered', parseInt(s.dataset.star) <= val);
      });
    });
    starContainer.addEventListener('mouseout', function() {
      starContainer.querySelectorAll('.journal-star').forEach(function(s) {
        s.classList.remove('hovered');
      });
    });
  }

  function updateStarDisplay() {
    if (!starContainer) return;
    starContainer.querySelectorAll('.journal-star').forEach(function(s) {
      s.classList.toggle('active', parseInt(s.dataset.star) <= selectedRating);
    });
  }

  // Emotion tags
  var emotionContainer = document.getElementById('journalEmotionTags');
  if (emotionContainer) {
    emotionContainer.addEventListener('click', function(ev) {
      var tag = ev.target.closest('.journal-emotion-tag');
      if (!tag) return;
      var emotion = tag.dataset.emotion;
      selectedEmotion = (selectedEmotion === emotion) ? '' : emotion;
      updateEmotionDisplay();
    });
  }

  function updateEmotionDisplay() {
    if (!emotionContainer) return;
    emotionContainer.querySelectorAll('.journal-emotion-tag').forEach(function(t) {
      t.classList.toggle('selected', t.dataset.emotion === selectedEmotion);
    });
  }

  // Auto-calculate R-Multiple and P&L in modal
  function recalcModal() {
    var entryPrice = parseFloat(document.getElementById('journalEntryPrice').value);
    var exitPrice = parseFloat(document.getElementById('journalExitPrice').value);
    var stopLoss = parseFloat(document.getElementById('journalEntryStopLoss').value);
    var shares = parseInt(document.getElementById('journalEntryShares').value) || 0;
    var direction = document.getElementById('journalEntryDirection').value;

    var rDisplay = document.getElementById('journalRMultipleDisplay');
    var pnlDisplay = document.getElementById('journalPnlDisplay');

    if (rDisplay) {
      if (!isNaN(entryPrice) && !isNaN(exitPrice) && !isNaN(stopLoss) && stopLoss > 0) {
        var isLong = direction === 'Long';
        var risk = isLong ? (entryPrice - stopLoss) : (stopLoss - entryPrice);
        if (risk > 0) {
          var reward = isLong ? (exitPrice - entryPrice) : (entryPrice - exitPrice);
          var rMult = reward / risk;
          rDisplay.textContent = (rMult >= 0 ? '+' : '') + rMult.toFixed(2) + 'R';
          rDisplay.className = 'journal-calc-display ' + (rMult >= 0 ? 'profit' : 'loss');
        } else {
          rDisplay.textContent = '--';
          rDisplay.className = 'journal-calc-display';
        }
      } else {
        rDisplay.textContent = '--';
        rDisplay.className = 'journal-calc-display';
      }
    }

    if (pnlDisplay) {
      if (!isNaN(entryPrice) && !isNaN(exitPrice) && shares > 0) {
        var isLong2 = direction === 'Long';
        var diff = isLong2 ? (exitPrice - entryPrice) : (entryPrice - exitPrice);
        var pnl = diff * shares;
        pnlDisplay.textContent = fmtPnl(pnl);
        pnlDisplay.className = 'journal-calc-display ' + (pnl >= 0 ? 'profit' : 'loss');
      } else {
        pnlDisplay.textContent = '--';
        pnlDisplay.className = 'journal-calc-display';
      }
    }
  }

  // Attach recalc listeners
  ['journalEntryPrice', 'journalExitPrice', 'journalEntryStopLoss', 'journalEntryShares', 'journalEntryDirection'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('input', recalcModal);
    if (el) el.addEventListener('change', recalcModal);
  });

  // Save entry
  if (saveBtn) {
    saveBtn.addEventListener('click', function() {
      var date = document.getElementById('journalEntryDate').value;
      var ticker = (document.getElementById('journalEntryTicker').value || '').toUpperCase().trim();
      var direction = document.getElementById('journalEntryDirection').value.toLowerCase();
      var entryPrice = parseFloat(document.getElementById('journalEntryPrice').value);
      var exitPrice = parseFloat(document.getElementById('journalExitPrice').value) || null;
      var shares = parseInt(document.getElementById('journalEntryShares').value) || 0;
      var stopLoss = parseFloat(document.getElementById('journalEntryStopLoss').value) || null;
      var strategy = document.getElementById('journalEntryStrategy').value;
      var holdTime = document.getElementById('journalEntryHoldTime').value || '';
      var notes = document.getElementById('journalEntryNotes').value;

      if (!ticker || isNaN(entryPrice)) {
        showToast('Please fill in ticker and entry price', 'error');
        return;
      }

      var pnl = null;
      var rMultiple = null;
      if (exitPrice && shares) {
        var diff = direction === 'long' ? (exitPrice - entryPrice) : (entryPrice - exitPrice);
        pnl = diff * shares;
      }
      if (exitPrice && stopLoss) {
        var risk = direction === 'long' ? (entryPrice - stopLoss) : (stopLoss - entryPrice);
        if (risk > 0) {
          var reward = direction === 'long' ? (exitPrice - entryPrice) : (entryPrice - exitPrice);
          rMultiple = parseFloat((reward / risk).toFixed(2));
        }
      }

      var entry = {
        id: editingId || ('j_' + Date.now()),
        date: date,
        ticker: ticker,
        direction: direction,
        entry: entryPrice,
        exit: exitPrice,
        shares: shares,
        stopLoss: stopLoss,
        pnl: pnl,
        rMultiple: rMultiple,
        holdTime: holdTime,
        setup: strategy,
        rating: selectedRating,
        notes: notes,
        emotion: selectedEmotion || null
      };

      if (editingId) {
        var idx = entries.findIndex(function(e) { return e.id === editingId; });
        if (idx >= 0) entries[idx] = entry;
        else entries.push(entry);
      } else {
        entries.push(entry);
      }

      saveEntriesToStorage();
      updateJournalStats();
      renderJournalTable();
      closeModal('journalEntryModal');
      showToast('Trade entry saved for ' + ticker, 'success');
    });
  }

  // Filters
  if (filterOutcome) filterOutcome.addEventListener('change', renderJournalTable);
  if (filterStrategy) filterStrategy.addEventListener('change', renderJournalTable);

  // ---- SAMPLE DATA GENERATOR ----
  function generateSampleEntries() {
    var samples = [
      { date:'2026-01-06', ticker:'NVDA', direction:'long', entry:875.50, exit:892.30, shares:20, stopLoss:865.00, holdTime:'2h 15m', setup:'Momentum', rating:4, notes:'Entered on breakout above consolidation. Strong volume confirmed the move.', emotion:'Confident' },
      { date:'2026-01-10', ticker:'AAPL', direction:'long', entry:242.80, exit:238.40, shares:50, stopLoss:240.00, holdTime:'1d 4h', setup:'Value', rating:2, notes:'Bought the dip but it kept dipping. Should have waited for support confirmation.', emotion:'FOMO' },
      { date:'2026-01-15', ticker:'TSLA', direction:'short', entry:410.25, exit:395.80, shares:15, stopLoss:420.00, holdTime:'3h 45m', setup:'Breakout', rating:5, notes:'Clean breakdown below support with high volume. Textbook setup.', emotion:'Disciplined' },
      { date:'2026-01-22', ticker:'AMD', direction:'long', entry:168.40, exit:175.90, shares:40, stopLoss:164.00, holdTime:'2d', setup:'Momentum', rating:4, notes:'Rode the semiconductor rally. Took profits at resistance.', emotion:'Confident' },
      { date:'2026-01-28', ticker:'META', direction:'long', entry:612.30, exit:605.10, shares:10, stopLoss:605.00, holdTime:'45m', setup:'Scalp', rating:2, notes:'Stopped out just before reversal. Frustrating.', emotion:'Fearful' },
      { date:'2026-02-03', ticker:'AMZN', direction:'long', entry:228.50, exit:241.20, shares:30, stopLoss:222.00, holdTime:'5d', setup:'Earnings Play', rating:5, notes:'Held through earnings beat. Great risk/reward.', emotion:'Disciplined' },
      { date:'2026-02-07', ticker:'MSFT', direction:'long', entry:445.00, exit:442.80, shares:25, stopLoss:440.00, holdTime:'1h 20m', setup:'Momentum', rating:3, notes:'Weak momentum, cut losses early. Right call.', emotion:'Disciplined' },
      { date:'2026-02-12', ticker:'SPY', direction:'short', entry:598.40, exit:591.20, shares:100, stopLoss:602.00, holdTime:'4h', setup:'Breakout', rating:4, notes:'Shorted the breakdown of the daily range. Clean execution.', emotion:'Confident' },
      { date:'2026-02-18', ticker:'GOOGL', direction:'long', entry:185.20, exit:192.40, shares:60, stopLoss:182.00, holdTime:'3d', setup:'Value', rating:4, notes:'Bought at moving average support. Patient entry.', emotion:'Disciplined' },
      { date:'2026-02-21', ticker:'COIN', direction:'long', entry:265.00, exit:248.30, shares:20, stopLoss:255.00, holdTime:'2d', setup:'Momentum', rating:2, notes:'Caught in crypto selloff. Position sizing was too large.', emotion:'FOMO' },
      { date:'2026-02-26', ticker:'NFLX', direction:'long', entry:935.00, exit:952.80, shares:8, stopLoss:920.00, holdTime:'1d 6h', setup:'Breakout', rating:4, notes:'Breakout above previous highs. Strong volume.', emotion:'Confident' },
      { date:'2026-03-03', ticker:'QQQ', direction:'short', entry:520.40, exit:525.10, shares:50, stopLoss:524.00, holdTime:'30m', setup:'Scalp', rating:2, notes:'Tried to catch the top. Bad timing.', emotion:'Revenge' },
      { date:'2026-03-04', ticker:'PLTR', direction:'long', entry:98.50, exit:105.20, shares:80, stopLoss:95.00, holdTime:'2d', setup:'Momentum', rating:5, notes:'Strong AI sector momentum. Added on pullback and held.', emotion:'Confident' },
      { date:'2026-03-06', ticker:'BA', direction:'long', entry:182.00, exit:178.50, shares:30, stopLoss:178.00, holdTime:'6h', setup:'Value', rating:3, notes:'Value trap. Need to be more selective with industrials.', emotion:'Fearful' },
      { date:'2026-03-07', ticker:'SQ', direction:'long', entry:88.20, exit:94.60, shares:50, stopLoss:85.00, holdTime:'1d 2h', setup:'Breakout', rating:4, notes:'Fintech rally. Clean breakout with follow through.', emotion:'Confident' },
      { date:'2026-03-10', ticker:'SMCI', direction:'short', entry:42.80, exit:38.90, shares:100, stopLoss:45.00, holdTime:'5h', setup:'Momentum', rating:4, notes:'Shorted the continued weakness. Good risk management.', emotion:'Disciplined' },
      { date:'2026-03-10', ticker:'AVGO', direction:'long', entry:1685.00, exit:1702.50, shares:5, stopLoss:1670.00, holdTime:'3h 30m', setup:'Options', rating:3, notes:'Bought calls ahead of product announcement. Modest win.', emotion:'Confident' },
      { date:'2026-03-11', ticker:'CRWD', direction:'long', entry:345.20, exit:338.90, shares:15, stopLoss:340.00, holdTime:'2h', setup:'Scalp', rating:2, notes:'Whipsawed in choppy tape. Shouldnt have traded into lunch.', emotion:'Revenge' }
    ];

    return samples.map(function(s, i) {
      var isLong = s.direction === 'long';
      var diff = isLong ? (s.exit - s.entry) : (s.entry - s.exit);
      var pnl = parseFloat((diff * s.shares).toFixed(2));
      var risk = isLong ? (s.entry - s.stopLoss) : (s.stopLoss - s.entry);
      var rMult = risk > 0 ? parseFloat(((isLong ? (s.exit - s.entry) : (s.entry - s.exit)) / risk).toFixed(2)) : null;
      return {
        id: 'j_sample_' + (i + 1),
        date: s.date,
        ticker: s.ticker,
        direction: s.direction,
        entry: s.entry,
        exit: s.exit,
        shares: s.shares,
        stopLoss: s.stopLoss,
        pnl: pnl,
        rMultiple: rMult,
        holdTime: s.holdTime,
        setup: s.setup,
        rating: s.rating,
        notes: s.notes,
        emotion: s.emotion
      };
    });
  }

  // ---- INITIALIZE ----
  updateJournalStats();
  renderJournalTable();
})();

/* Journal shortcut (7) is handled by the main viewMap */

// ============================================
// PORTFOLIO MANAGER
// ============================================
const PortfolioManager = (function() {
  const STORAGE_KEY = 'gs_portfolio';
  const WATCHLIST_KEY = 'gs_watchlist';
  const PROFILE_KEY = 'gs_user_profile';
  const ACTIVITY_KEY = 'gs_portfolio_activity';

  function _load(key) {
    try {
      const d = localStorage.getItem(key);
      return d ? JSON.parse(d) : null;
    } catch(e) { return null; }
  }
  function _save(key, data) {
    try { localStorage.setItem(key, JSON.stringify(data)); } catch(e) {}
    // Any write to a synced slice stamps the local copy and schedules a cloud
    // push (no-ops for guests and while a cloud document is being applied).
    if (!applyingCloudDoc && SYNCED_KEYS.indexOf(key) !== -1) {
      try { localStorage.setItem(META_KEY, JSON.stringify({ savedAt: new Date().toISOString() })); } catch(e) {}
      scheduleCloudPush();
    }
  }

  // ---- REAL QUOTES + MULTI-CURRENCY + ACB ----
  const REALIZED_KEY = 'gs_portfolio_realized';
  const INCOME_KEY = 'gs_portfolio_income';
  const BASE_CURRENCY = 'CAD';
  // Fallback used only until the live USDCAD quote loads. Not a fabricated
  // price: it just keeps a USD trade convertible before the fetch returns.
  const DEFAULT_USDCAD = 1.36;

  // Live quote snapshot: symbol -> { price, changePct, currency, ts }.
  // Populated by refreshQuotes() from the real /api/quotes endpoint.
  let quoteCache = {};
  let usdCadRate = null;
  let quotesInFlight = null;

  function todayISO() { return new Date().toISOString().slice(0, 10); }

  // Heuristic: TSX (.TO), TSX Venture (.V), CSE (.CN) and NEO (.NE) list in CAD;
  // everything else defaults to USD. The user can override on add.
  function inferCurrency(sym) {
    sym = String(sym || '').toUpperCase();
    if (/\.(TO|V|CN|NE)$/.test(sym)) return 'CAD';
    return 'USD';
  }

  function getUsdCadRate() {
    return (usdCadRate && usdCadRate > 0) ? usdCadRate : DEFAULT_USDCAD;
  }

  // Fetch real quotes for every held symbol plus USDCAD, into quoteCache.
  function refreshQuotes() {
    if (quotesInFlight) return quotesInFlight;
    const positions = _load(STORAGE_KEY) || [];
    const syms = [];
    positions.forEach(p => { if (p.symbol && p.status !== 'closed' && syms.indexOf(p.symbol) === -1) syms.push(p.symbol); });
    syms.push('USDCAD=X');
    const url = '/api/quotes?symbols=' + encodeURIComponent(syms.join(','));
    quotesInFlight = fetch(url)
      .then(r => r.ok ? r.json() : {})
      .then(quotes => {
        Object.keys(quotes || {}).forEach(k => {
          const q = quotes[k];
          if (q && typeof q.price === 'number' && q.price > 0) {
            quoteCache[k.toUpperCase()] = {
              price: q.price,
              changePct: (typeof q.changePct === 'number') ? q.changePct : 0,
              currency: q.currency || 'USD',
              ts: Date.now()
            };
          }
        });
        const fx = quoteCache['USDCAD=X'];
        if (fx && fx.price > 0) usdCadRate = fx.price;
        return quoteCache;
      })
      .catch(() => quoteCache)
      .then(v => { quotesInFlight = null; return v; });
    return quotesInFlight;
  }

  function getQuote(sym) { return quoteCache[String(sym || '').toUpperCase()] || null; }

  // Map a position's transactions to ACB-engine input. Native = same-currency
  // (fxRate 1). Base = converted to CAD using each transaction's own fxRate.
  function nativeTxns(pos) {
    return (pos.txns || []).map(t => t.type === 'roc'
      ? { type: 'roc', date: t.date || todayISO(), amount: t.amount, fxRate: 1 }
      : { type: t.type, date: t.date || todayISO(), shares: t.shares,
          price: t.price, commission: t.commission || 0, fxRate: 1 });
  }
  function baseTxns(pos) {
    const fxOf = t => (pos.currency === 'USD') ? (t.fxRate || getUsdCadRate()) : 1;
    return (pos.txns || []).map(t => t.type === 'roc'
      ? { type: 'roc', date: t.date || todayISO(), amount: t.amount, fxRate: fxOf(t) }
      : { type: t.type, date: t.date || todayISO(), shares: t.shares,
          price: t.price, commission: t.commission || 0, fxRate: fxOf(t) });
  }

  // Pooled average cost in the position's OWN currency (for the Avg Cost column).
  function acbNative(pos) {
    if (typeof ACB !== 'undefined') return ACB.currentACB(nativeTxns(pos));
    let sh = 0, cost = 0;
    (pos.txns || []).forEach(t => {
      if (t.type === 'buy') { sh += t.shares; cost += t.shares * t.price + (t.commission || 0); }
      else if (t.type === 'sell') { const per = sh > 0 ? cost / sh : 0; cost -= per * t.shares; sh -= t.shares; }
    });
    return { shares: sh, totalACB: cost, acbPerShare: sh > 0 ? cost / sh : 0 };
  }

  // Full ACB run in CAD (base): book value, per-share ACB, realized gains, ledger.
  function acbBaseSummary(pos) {
    if (typeof ACB !== 'undefined') {
      const r = ACB.computeACB(baseTxns(pos));
      return {
        currentShares: r.summary.currentShares,
        currentBookValue: r.summary.currentBookValue,
        currentACBPerShare: r.summary.currentACBPerShare,
        totalRealizedGain: r.summary.totalRealizedGain,
        ledger: r.ledger
      };
    }
    let sh = 0, cost = 0, realized = 0;
    (pos.txns || []).forEach(t => {
      const fx = (pos.currency === 'USD') ? (t.fxRate || getUsdCadRate()) : 1;
      if (t.type === 'buy') { sh += t.shares; cost += (t.shares * t.price + (t.commission || 0)) * fx; }
      else if (t.type === 'sell') {
        const per = sh > 0 ? cost / sh : 0;
        realized += (t.shares * t.price - (t.commission || 0)) * fx - per * t.shares;
        cost -= per * t.shares; sh -= t.shares;
      }
    });
    return { currentShares: sh, currentBookValue: cost, currentACBPerShare: sh > 0 ? cost / sh : 0, totalRealizedGain: realized, ledger: [] };
  }

  function recomputeAggregate(pos) {
    const nat = acbNative(pos);
    pos.shares = nat.shares;
    pos.avgCost = nat.acbPerShare;
    return pos;
  }

  // Upgrade a legacy aggregate position ({symbol, shares, avgCost}) in place to
  // the transaction-series model so ACB has something to compute from.
  function normalizePosition(pos) {
    if (!pos.currency) pos.currency = inferCurrency(pos.symbol);
    if (!pos.account) pos.account = 'non-registered';
    if (!Array.isArray(pos.txns) || pos.txns.length === 0) {
      const dateISO = pos.addedAt ? new Date(pos.addedAt).toISOString().slice(0, 10) : todayISO();
      pos.txns = [{
        type: 'buy', shares: pos.shares || 0, price: pos.avgCost || 0,
        commission: 0, date: dateISO,
        fxRate: (pos.currency === 'USD') ? getUsdCadRate() : 1
      }];
    }
    recomputeAggregate(pos);
    return pos;
  }

  // Company name lookup (subset)
  const nameMap = {
    AAPL:'Apple Inc.', NVDA:'NVIDIA Corp.', MSFT:'Microsoft Corp.', TSLA:'Tesla Inc.',
    AMZN:'Amazon.com', GOOGL:'Alphabet Inc.', META:'Meta Platforms', AMD:'AMD Inc.',
    PLTR:'Palantir Tech', AI:'C3.ai Inc.', SOUN:'SoundHound AI', IONQ:'IonQ Inc.',
    JPM:'JPMorgan Chase', GS:'Goldman Sachs', BAC:'Bank of America', V:'Visa Inc.',
    MA:'Mastercard', SQ:'Block Inc.', COIN:'Coinbase', MARA:'Marathon Digital',
    RIOT:'Riot Platforms', MSTR:'MicroStrategy', SPY:'SPDR S&P 500', QQQ:'Invesco QQQ',
    IWM:'iShares Russell', DIA:'SPDR Dow Jones', GLD:'SPDR Gold', TLT:'iShares 20+ Yr'
  };

  // Sector lookup
  const sectorMap = {
    AAPL:'Technology', NVDA:'Technology', MSFT:'Technology', TSLA:'Consumer',
    AMZN:'Consumer', GOOGL:'Technology', META:'Technology', AMD:'Technology',
    PLTR:'Technology', AI:'Technology', SOUN:'Technology', IONQ:'Technology',
    JPM:'Finance', GS:'Finance', BAC:'Finance', V:'Finance',
    MA:'Finance', SQ:'Finance', COIN:'Crypto', MARA:'Crypto',
    RIOT:'Crypto', MSTR:'Crypto', SPY:'ETF', QQQ:'ETF',
    IWM:'ETF', DIA:'ETF', GLD:'Commodities', TLT:'Fixed Income'
  };

  // ---- CLOUD SYNC (Supabase-backed, guest-safe) ----
  // The tracker stays localStorage-first: guests lose nothing, and a signed-in
  // user's account copy follows them across devices. Direction (push vs pull)
  // is decided by the pure PortfolioSync.decide() table; when the account copy
  // replaces a local copy that had data, the local copy is snapshotted to
  // BACKUP_KEY first so nothing is ever silently destroyed.
  const META_KEY = 'gs_portfolio_meta';
  const BACKUP_KEY = 'gs_portfolio_presync_backup';
  const SYNCED_KEYS = [STORAGE_KEY, REALIZED_KEY, ACTIVITY_KEY];
  const PUSH_DEBOUNCE_MS = 2000;
  let cloudPushTimer = null;
  let cloudSyncBusy = false;
  let applyingCloudDoc = false;

  function canCloudSync() {
    return typeof PortfolioSync !== 'undefined' &&
           typeof SupabaseClient !== 'undefined' &&
           SupabaseClient.isAuthenticated && SupabaseClient.isAuthenticated();
  }

  function localSavedAt() {
    const meta = _load(META_KEY);
    return (meta && meta.savedAt) || null;
  }

  function assembleCloudDoc() {
    return PortfolioSync.buildDoc(
      _load(STORAGE_KEY) || [],
      _load(REALIZED_KEY) || [],
      _load(ACTIVITY_KEY) || [],
      localSavedAt() || new Date().toISOString()
    );
  }

  function applyCloudDoc(doc) {
    applyingCloudDoc = true;
    try {
      _save(STORAGE_KEY, doc.positions);
      _save(REALIZED_KEY, doc.realized);
      _save(ACTIVITY_KEY, doc.activity);
      _save(META_KEY, { savedAt: doc.savedAt || new Date().toISOString() });
    } finally {
      applyingCloudDoc = false;
    }
    document.dispatchEvent(new CustomEvent('gs:portfolio-synced'));
  }

  function scheduleCloudPush() {
    if (!canCloudSync()) return;
    if (cloudPushTimer) clearTimeout(cloudPushTimer);
    cloudPushTimer = setTimeout(pushToCloud, PUSH_DEBOUNCE_MS);
  }

  async function pushToCloud() {
    if (!canCloudSync()) return false;
    if (cloudPushTimer) { clearTimeout(cloudPushTimer); cloudPushTimer = null; }
    try {
      const res = await SupabaseClient.fetchWithAuth('/api/user/portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(assembleCloudDoc())
      });
      return res.ok;
    } catch (e) {
      console.warn('[PortfolioSync] push failed:', e);
      return false;
    }
  }

  async function syncFromCloud() {
    if (!canCloudSync() || cloudSyncBusy) return;
    cloudSyncBusy = true;
    try {
      const res = await SupabaseClient.fetchWithAuth('/api/user/portfolio');
      if (!res.ok) return;
      const body = await res.json();
      const remoteDoc = body && body.data;
      const remoteValid = !!(remoteDoc && PortfolioSync.isValidDoc(remoteDoc));
      const localDoc = assembleCloudDoc();
      const decision = PortfolioSync.decide(
        { savedAt: localSavedAt(), hasData: PortfolioSync.hasContent(localDoc) },
        {
          savedAt: remoteValid ? (remoteDoc.savedAt || body.updated_at) : null,
          hasData: remoteValid && PortfolioSync.hasContent(remoteDoc)
        }
      );
      if (decision.action === 'pull') {
        if (decision.backupLocal) {
          _save(BACKUP_KEY, { backedUpAt: new Date().toISOString(), doc: localDoc });
        }
        applyCloudDoc(remoteDoc);
        if (typeof showToast === 'function') showToast('Portfolio loaded from your account', 'success');
      } else if (decision.action === 'push') {
        await pushToCloud();
      }
    } catch (e) {
      console.warn('[PortfolioSync] sync failed:', e);
    } finally {
      cloudSyncBusy = false;
    }
  }

  // Resolve the TRUE transaction-date BoC rate for any USD txn whose stored
  // rate is missing or flagged estimated, via /api/fx/usdcad. Persists once
  // and announces via gs:portfolio-synced so open views re-render. Dates the
  // BoC series cannot cover (pre-2017, network down) freeze at the live rate,
  // flagged fxEstimated so the approximation stays visible.
  let fxRepairRun = false;
  async function repairFxRates(force) {
    if (fxRepairRun && !force) return; fxRepairRun = true;
    const positions = _load(STORAGE_KEY);
    if (!Array.isArray(positions) || !positions.length) return;
    const need = [];
    positions.forEach(p => {
      if (p.currency !== 'USD') return;
      (p.txns || []).forEach(t => { if (!(t.fxRate > 0) || t.fxEstimated) need.push(t); });
    });
    if (!need.length) return;
    const dates = Array.from(new Set(need.map(t => t.date).filter(Boolean)));
    const rates = {};
    await Promise.all(dates.map(d =>
      fetch('/api/fx/usdcad?date=' + encodeURIComponent(d))
        .then(r => r.ok ? r.json() : null)
        .then(j => { if (j && j.rate > 0) rates[d] = j.rate; })
        .catch(() => {})
    ));
    let changed = 0;
    need.forEach(t => {
      const r = rates[t.date];
      if (r > 0) { t.fxRate = r; delete t.fxEstimated; changed++; }
      else if (!(t.fxRate > 0)) { t.fxRate = getUsdCadRate(); t.fxEstimated = true; changed++; }
    });
    if (changed) {
      _save(STORAGE_KEY, positions);
      document.dispatchEvent(new CustomEvent('gs:portfolio-synced'));
    }
  }

  return {
    getPositions: function() { return _load(STORAGE_KEY) || []; },
    savePositions: function(positions) { _save(STORAGE_KEY, positions); },

    refreshQuotes: refreshQuotes,
    getQuote: getQuote,
    getUsdCadRate: getUsdCadRate,
    getBaseCurrency: function() { return BASE_CURRENCY; },
    inferCurrency: inferCurrency,

    syncFromCloud: syncFromCloud,
    pushToCloud: pushToCloud,
    repairFxRates: repairFxRates,

    // opts: { currency, fxRate, commission, date, source }
    addPosition: function(sym, shares, avgCost, opts) {
      opts = opts || {};
      sym = String(sym || '').toUpperCase().trim();
      shares = Number(shares); avgCost = Number(avgCost);
      if (!sym || !(shares > 0) || !(avgCost >= 0)) return false;
      const acct = opts.account || 'non-registered';
      const positions = (_load(STORAGE_KEY) || []).map(normalizePosition);
      let pos = positions.find(p => p.symbol === sym && (p.account || 'non-registered') === acct);
      const currency = pos ? pos.currency : (opts.currency || inferCurrency(sym));
      const fxRate = (currency === 'USD') ? (Number(opts.fxRate) || getUsdCadRate()) : 1;
      const txn = {
        type: 'buy', shares: shares, price: avgCost,
        commission: Number(opts.commission) || 0,
        date: opts.date || todayISO(), fxRate: fxRate
      };
      // Flags lots whose cost basis is a broker's average cost (approximate
      // ACB) rather than a user-entered transaction.
      if (opts.source) txn.source = opts.source;
      if (opts.fxEstimated) txn.fxEstimated = true;
      if (pos) {
        pos.txns.push(txn);
        // A rebuy reopens a closed ledger; the retained prior sell is what
        // lets the superficial-loss window recomputation see the pattern.
        pos.status = 'open';
        recomputeAggregate(pos);
      } else {
        pos = { symbol: sym, currency: currency, account: acct, addedAt: Date.now(), txns: [txn] };
        recomputeAggregate(pos);
        positions.push(pos);
      }
      _save(STORAGE_KEY, positions);
      this.addActivity('BUY', sym, shares, avgCost, { currency: pos.currency });
      return true;
    },

    // Sell realizes a capital gain/loss via the ACB engine and reduces (or
    // closes) the position. Supports partial sells. opts: { fxRate, commission, date }
    sellPosition: function(sym, shares, price, opts) {
      opts = opts || {};
      sym = String(sym || '').toUpperCase().trim();
      shares = Number(shares); price = Number(price);
      const positions = (_load(STORAGE_KEY) || []).map(normalizePosition);
      const pos = opts.account
        ? positions.find(p => p.symbol === sym && (p.account || 'non-registered') === opts.account)
        : positions.find(p => p.symbol === sym && (p.shares || 0) > 1e-9);
      if (!pos) return { ok: false, error: 'Position not found' };
      if (!(shares > 0) || !(price >= 0)) return { ok: false, error: 'Invalid sell input' };
      if (shares > pos.shares + 1e-9) shares = pos.shares; // cap at shares held
      const currency = pos.currency;
      const fxRate = (currency === 'USD') ? (Number(opts.fxRate) || getUsdCadRate()) : 1;
      // Realized gain = the DELTA of the full ACB run before vs after this
      // sell, so a backdated sell that lands mid-ledger attributes its own
      // gain, not the last row's, and superficial-loss effects are included.
      const beforeGain = acbBaseSummary(pos).totalRealizedGain;
      const txn = {
        type: 'sell', shares: shares, price: price,
        commission: Number(opts.commission) || 0,
        date: opts.date || todayISO(), fxRate: fxRate
      };
      if (opts.fxEstimated) txn.fxEstimated = true;
      pos.txns.push(txn);
      const realized = acbBaseSummary(pos).totalRealizedGain - beforeGain;
      recomputeAggregate(pos);
      const registered = (pos.account || 'non-registered') !== 'non-registered';
      // Closed positions are RETAINED (status 'closed'), never deleted: the
      // ledger must survive so a rebuy within the 30-day window denies the
      // loss on recomputation and realized totals stay auditable.
      if ((pos.shares || 0) <= 1e-9) pos.status = 'closed';
      _save(STORAGE_KEY, positions);
      this.addRealized({ symbol: sym, shares: shares, price: price, currency: currency, realized: realized, account: pos.account, registered: registered, date: txn.date });
      this.addActivity('SELL', sym, shares, price, { currency: currency, realized: realized });
      return { ok: true, realized: realized, currency: currency, shares: shares, account: pos.account, registered: registered };
    },

    // Forget a position without realizing a gain (for correcting a bad entry).
    removePosition: function(sym, account) {
      const positions = (_load(STORAGE_KEY) || []).filter(p =>
        p.symbol !== sym || (account && (p.account || 'non-registered') !== account));
      _save(STORAGE_KEY, positions);
      return true;
    },

    getHoldings: function() {
      const rate = getUsdCadRate();
      const positions = (_load(STORAGE_KEY) || []).map(normalizePosition).filter(p => (p.shares || 0) > 1e-9);
      let totalBaseMV = 0;
      const rows = positions.map(pos => {
        const q = getQuote(pos.symbol);
        const hasQuote = !!(q && typeof q.price === 'number' && q.price > 0);
        const nativePrice = hasQuote ? q.price : pos.avgCost; // cost-basis fallback, never a fake price
        const fx = (pos.currency === 'USD') ? rate : 1;
        const base = acbBaseSummary(pos);
        const approxBasis = (pos.txns || []).some(t => t.source === 'broker-import' || t.fxEstimated);
        const shares = pos.shares;
        const mvNative = nativePrice * shares;
        const mvBase = mvNative * fx;
        const bookBase = base.currentBookValue;
        const unrealBase = mvBase - bookBase;
        const plPct = bookBase > 0 ? (unrealBase / bookBase) * 100 : 0;
        totalBaseMV += mvBase;
        return {
          symbol: pos.symbol,
          name: nameMap[pos.symbol] || pos.symbol,
          sector: sectorMap[pos.symbol] || 'Other',
          currency: pos.currency,
          account: pos.account || 'non-registered',
          approxBasis: approxBasis,
          shares: shares,
          avgCost: pos.avgCost,                    // native ACB per share
          acbPerShareBase: base.currentACBPerShare, // CAD ACB per share
          currentPrice: nativePrice,               // native
          hasQuote: hasQuote,
          marketValue: mvBase,                     // CAD (base currency)
          marketValueNative: mvNative,
          bookValueBase: bookBase,                 // CAD ACB book value
          dayChange: hasQuote ? q.changePct : 0,
          totalPL: unrealBase,                     // CAD unrealized gain/loss
          plPct: plPct,
          realizedPL: base.totalRealizedGain,      // CAD realized within this lot
          fxRate: fx,
          weight: 0
        };
      });
      rows.forEach(h => { h.weight = totalBaseMV > 0 ? (h.marketValue / totalBaseMV) * 100 : 0; });
      return rows;
    },

    getSummary: function() {
      const holdings = this.getHoldings();
      const totalValue = holdings.reduce((s, h) => s + h.marketValue, 0);   // CAD
      const totalCost = holdings.reduce((s, h) => s + h.bookValueBase, 0);  // CAD
      const totalReturn = totalValue - totalCost;                          // unrealized CAD
      const dayPL = holdings.reduce((s, h) => s + (h.marketValue * h.dayChange / 100), 0);
      const dayPLPct = totalValue > 0 ? (dayPL / totalValue) * 100 : 0;
      return {
        totalValue, totalReturn, dayPL, dayPLPct,
        bookCost: totalCost,
        realized: this.getRealizedTotal(),
        realizedRegistered: this.getRealizedRegisteredTotal(),
        baseCurrency: BASE_CURRENCY,
        positionCount: holdings.length,
        quotesReady: holdings.length > 0 && holdings.every(h => h.hasQuote)
      };
    },

    getWatchlist: function() { return _load(WATCHLIST_KEY) || []; },
    saveWatchlist: function(list) { _save(WATCHLIST_KEY, list); },

    getProfile: function() { return _load(PROFILE_KEY) || {}; },
    saveProfile: function(profile) { _save(PROFILE_KEY, profile); },

    // Persistent realized-gains ledger (survives position closure).
    addRealized: function(entry) {
      const arr = _load(REALIZED_KEY) || [];
      arr.unshift(Object.assign({ time: new Date().toISOString() }, entry));
      if (arr.length > 200) arr.length = 200;
      _save(REALIZED_KEY, arr);
    },
    getRealized: function() { return _load(REALIZED_KEY) || []; },

    // Realized capital gains recomputed from the RETAINED ledgers, never from
    // frozen sale-time snapshots: a rebuy inside the 30-day window
    // retroactively denies the loss, and only recomputation shows that.
    // CRA view: taxable (non-registered) positions only, identical property
    // POOLED across taxable accounts per symbol.
    getRealizedTotal: function() {
      const positions = (_load(STORAGE_KEY) || []).map(normalizePosition);
      const taxable = positions.filter(p => (p.account || 'non-registered') === 'non-registered');
      const bySym = {};
      taxable.forEach(p => { (bySym[p.symbol] = bySym[p.symbol] || []).push(p); });
      let total = 0;
      Object.keys(bySym).forEach(sym => {
        const group = bySym[sym];
        if (typeof ACB !== 'undefined') {
          const merged = [];
          group.forEach(p => { merged.push.apply(merged, baseTxns(p)); });
          if (merged.length) total += ACB.computeACB(merged).summary.totalRealizedGain;
        } else {
          group.forEach(p => { total += acbBaseSummary(p).totalRealizedGain; });
        }
      });
      return total;
    },
    // Gains inside registered accounts (TFSA/RRSP/FHSA): shown for interest,
    // never part of the taxable realized figure.
    getRealizedRegisteredTotal: function() {
      const positions = (_load(STORAGE_KEY) || []).map(normalizePosition);
      return positions
        .filter(p => (p.account || 'non-registered') !== 'non-registered')
        .reduce((s, p) => s + acbBaseSummary(p).totalRealizedGain, 0);
    },

    addActivity: function(action, sym, shares, price, meta) {
      meta = meta || {};
      const activities = _load(ACTIVITY_KEY) || [];
      activities.unshift({
        time: new Date().toISOString(),
        action: action,
        symbol: sym,
        shares: shares,
        price: price,
        total: shares * price,
        currency: meta.currency || null,
        realized: (typeof meta.realized === 'number') ? meta.realized : null
      });
      if (activities.length > 50) activities.length = 50;
      _save(ACTIVITY_KEY, activities);
    },
    getActivities: function() { return _load(ACTIVITY_KEY) || []; },

    // ---- INCOME & CORPORATE ACTIONS ----
    addIncome: function(entry) {
      const arr = _load(INCOME_KEY) || [];
      arr.unshift(entry);
      if (arr.length > 500) arr.length = 500;
      _save(INCOME_KEY, arr);
    },
    getIncome: function() { return _load(INCOME_KEY) || []; },
    getIncomeTotalCad: function() { return (_load(INCOME_KEY) || []).reduce((s, e) => s + (Number(e.amountCad) || 0), 0); },

    // Cash dividend: income only, ACB untouched.
    recordDividend: function(sym, account, opts) {
      opts = opts || {};
      const positions = (_load(STORAGE_KEY) || []).map(normalizePosition);
      const pos = positions.find(p => p.symbol === sym && (p.account || 'non-registered') === (account || 'non-registered'));
      if (!pos) return { ok: false, error: 'Position not found' };
      try {
        const fx = (pos.currency === 'USD') ? (Number(opts.fxRate) || getUsdCadRate()) : 1;
        const entry = CorporateActions.incomeEntry({
          symbol: sym, account: pos.account, currency: pos.currency, kind: 'dividend',
          date: opts.date, amount: opts.amount, fxRate: fx, fxEstimated: opts.fxEstimated
        });
        this.addIncome(entry);
        this.addActivity('DIV', sym, 0, Number(opts.amount) || 0, { currency: pos.currency });
        return { ok: true, amountCad: entry.amountCad };
      } catch (e) { return { ok: false, error: e.message }; }
    },

    // DRIP: zero-commission buy at amount/shares, plus an income entry.
    recordDrip: function(sym, account, opts) {
      opts = opts || {};
      const positions = (_load(STORAGE_KEY) || []).map(normalizePosition);
      const pos = positions.find(p => p.symbol === sym && (p.account || 'non-registered') === (account || 'non-registered'));
      if (!pos) return { ok: false, error: 'Position not found' };
      try {
        const fx = (pos.currency === 'USD') ? (Number(opts.fxRate) || getUsdCadRate()) : 1;
        const txn = CorporateActions.dripTxn({
          date: opts.date, shares: opts.shares, amount: opts.amount,
          fxRate: fx, fxEstimated: opts.fxEstimated
        });
        pos.txns.push(txn);
        pos.status = 'open';
        recomputeAggregate(pos);
        _save(STORAGE_KEY, positions);
        this.addIncome(CorporateActions.incomeEntry({
          symbol: sym, account: pos.account, currency: pos.currency, kind: 'drip',
          date: opts.date, amount: opts.amount, fxRate: fx, fxEstimated: opts.fxEstimated
        }));
        this.addActivity('DRIP', sym, Number(opts.shares) || 0, txn.price, { currency: pos.currency });
        return { ok: true, price: txn.price };
      } catch (e) { return { ok: false, error: e.message }; }
    },

    // Return of capital (T3 box 42): reduces ACB; excess realizes a gain.
    recordRoc: function(sym, account, opts) {
      opts = opts || {};
      const positions = (_load(STORAGE_KEY) || []).map(normalizePosition);
      const pos = positions.find(p => p.symbol === sym && (p.account || 'non-registered') === (account || 'non-registered'));
      if (!pos) return { ok: false, error: 'Position not found' };
      try {
        const fx = (pos.currency === 'USD') ? (Number(opts.fxRate) || getUsdCadRate()) : 1;
        const beforeGain = acbBaseSummary(pos).totalRealizedGain;
        pos.txns.push(CorporateActions.rocTxn({
          date: opts.date, amount: opts.amount, fxRate: fx, fxEstimated: opts.fxEstimated
        }));
        const excessGain = acbBaseSummary(pos).totalRealizedGain - beforeGain;
        recomputeAggregate(pos);
        _save(STORAGE_KEY, positions);
        this.addActivity('ROC', sym, 0, Number(opts.amount) || 0, { currency: pos.currency, realized: excessGain > 0.005 ? excessGain : null });
        return { ok: true, excessGain: excessGain };
      } catch (e) { return { ok: false, error: e.message }; }
    },

    // Stock split: adjusts pre-split lots; total ACB invariant.
    recordSplit: function(sym, account, opts) {
      opts = opts || {};
      const positions = (_load(STORAGE_KEY) || []).map(normalizePosition);
      const pos = positions.find(p => p.symbol === sym && (p.account || 'non-registered') === (account || 'non-registered'));
      if (!pos) return { ok: false, error: 'Position not found' };
      try {
        const r = CorporateActions.applySplit(pos.txns, opts.date, opts.ratio);
        pos.txns = r.txns;
        recomputeAggregate(pos);
        _save(STORAGE_KEY, positions);
        this.addActivity('SPLIT', sym, Number(opts.ratio) || 0, 0, { currency: pos.currency });
        return { ok: true, affected: r.affected, shares: pos.shares };
      } catch (e) { return { ok: false, error: e.message }; }
    },

    getNameMap: function() { return nameMap; },
    getSectorMap: function() { return sectorMap; }
  };
})();

// Kick off portfolio cloud sync when a session appears. app.js loads before
// auth-ui.js calls SupabaseClient.init(), so this listener is registered in
// time to catch the initial session event. One sync per session; sign-out
// re-arms it.
(function initPortfolioCloudSync() {
  if (typeof SupabaseClient === 'undefined' || !SupabaseClient.onAuthChange) return;
  let syncedThisSession = false;
  SupabaseClient.onAuthChange(function(event, session) {
    if (event === 'SIGNED_OUT') { syncedThisSession = false; return; }
    const signedIn = (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') && session;
    if (signedIn && !syncedThisSession) {
      syncedThisSession = true;
      PortfolioManager.syncFromCloud();
    }
  });
})();


// ============================================
// PORTFOLIO VIEW RENDERER
// ============================================

(function initPortfolioView() {
  let sortCol = 'marketValue';
  let sortDir = 'desc';
  let portfolioLoaded = false;

  function fmt$(v) {
    const sign = v < 0 ? '-' : '';
    return sign + '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtPct(v) {
    const sign = v > 0 ? '+' : '';
    return sign + v.toFixed(2) + '%';
  }

  function renderSummary() {
    const s = PortfolioManager.getSummary();
    const setVal = (id, val, cls) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = val;
      el.className = 'pf-card-value' + (cls ? ' ' + cls : '');
    };
    setVal('pfTotalValue', fmt$(s.totalValue));
    setVal('pfDayPL', fmt$(s.dayPL), s.dayPL >= 0 ? 'profit' : 'loss');
    setVal('pfDayPLPct', fmtPct(s.dayPLPct), s.dayPLPct >= 0 ? 'profit' : 'loss');
    setVal('pfTotalReturn', fmt$(s.totalReturn), s.totalReturn >= 0 ? 'profit' : 'loss');
    // Repurposed cards: Realized P&L and Book Cost (ACB), all in CAD.
    setVal('pfCashBalance', fmt$(s.realized), s.realized >= 0 ? 'profit' : 'loss');
    setVal('pfBuyingPower', fmt$(s.bookCost));
  }

  function renderHoldings() {
    const holdings = PortfolioManager.getHoldings();
    const tbody = document.getElementById('pfHoldingsBody');
    const countEl = document.getElementById('pfHoldingsCount');
    if (!tbody) return;

    if (countEl) countEl.textContent = holdings.length + ' position' + (holdings.length !== 1 ? 's' : '');

    if (holdings.length === 0) {
      tbody.innerHTML = '<tr class="pf-empty-row"><td colspan="11"><div class="pf-empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" stroke-width="1"><path d="M21 12V7H5a2 2 0 010-4h14v4"/><path d="M3 5v14a2 2 0 002 2h16v-5"/><path d="M18 12a2 2 0 000 4h4v-4h-4z"/></svg><p>No positions yet. Add your first holding to start tracking.</p><button class="agent-btn" onclick="gsLoadSamplePortfolio()" style="margin-top:12px;">Load sample portfolio</button></div></td></tr>';
      return;
    }

    // Sort
    holdings.sort((a, b) => {
      let va = a[sortCol], vb = b[sortCol];
      if (typeof va === 'string') { va = va.toLowerCase(); vb = vb.toLowerCase(); }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    const ccyTag = (c) => `<span style="font-size:9px;color:var(--text-dim);margin-left:5px;letter-spacing:0.04em;">${c}</span>`;
    const ACCT_LABELS = { 'non-registered': 'NON-REG', 'TFSA': 'TFSA', 'RRSP': 'RRSP', 'FHSA': 'FHSA', 'other-registered': 'REG' };
    const acctTag = (a) => `<span class="pf-acct-tag">${ACCT_LABELS[a] || a}</span>`;
    tbody.innerHTML = holdings.map(h => {
      const plCls = h.totalPL >= 0 ? 'pf-profit' : 'pf-loss';
      const dayCls = h.dayChange >= 0 ? 'pf-profit' : 'pf-loss';
      const priceStr = h.hasQuote ? fmt$(h.currentPrice) : fmt$(h.currentPrice) + '<span style="font-size:9px;color:var(--text-dim);margin-left:3px;" title="Live quote unavailable; showing book cost">n/a</span>';
      return `<tr>
        <td class="pf-sym">${h.symbol}${ccyTag(h.currency)}${acctTag(h.account)}</td>
        <td class="pf-name">${h.name}</td>
        <td class="pf-right">${h.shares.toLocaleString('en-US', {maximumFractionDigits: 2})}</td>
        <td class="pf-right">${fmt$(h.avgCost)}${h.approxBasis ? ' <span title="Approximate cost basis: broker average cost or estimated FX, not exact ACB. Backfill the real transactions for filing-grade numbers." style="color:var(--accent-gold);cursor:help;">&asymp;</span>' : ''}</td>
        <td class="pf-right">${priceStr}</td>
        <td class="pf-right">${fmt$(h.marketValue)}</td>
        <td class="pf-right ${dayCls}">${fmtPct(h.dayChange)}</td>
        <td class="pf-right ${plCls}">${fmt$(h.totalPL)}</td>
        <td class="pf-right ${plCls}">${fmtPct(h.plPct)}</td>
        <td class="pf-right">${h.weight.toFixed(1)}%</td>
        <td class="pf-right"><div class="pf-actions-cell">
          <button class="pf-action-btn trade" data-sym="${h.symbol}" title="Open the order ticket (paper)">Trade</button>
          <button class="pf-action-btn sell" data-sym="${h.symbol}" data-acct="${h.account}" title="Sell / record disposition">Sell</button>
          <button class="pf-action-btn event" data-sym="${h.symbol}" data-acct="${h.account}" title="Record dividend / DRIP / return of capital / split">Div+</button>
          <button class="pf-action-btn delete" data-sym="${h.symbol}" data-acct="${h.account}" title="Remove (forget entry, no realized gain)">&#x2715;</button>
        </div></td>
      </tr>`;
    }).join('');

    // Trade buttons (open the paper order ticket for this symbol)
    tbody.querySelectorAll('.pf-action-btn.trade').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof window.openOrderTicket === 'function') window.openOrderTicket(btn.dataset.sym, 'buy');
      });
    });

    // Sell buttons
    tbody.querySelectorAll('.pf-action-btn.sell').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openSellModal(btn.dataset.sym, btn.dataset.acct);
      });
    });

    // Event buttons (dividend / DRIP / ROC / split)
    tbody.querySelectorAll('.pf-action-btn.event').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof window.gsOpenEventModal === 'function') window.gsOpenEventModal(btn.dataset.sym, btn.dataset.acct);
      });
    });

    // Delete (forget) buttons
    tbody.querySelectorAll('.pf-action-btn.delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const sym = btn.dataset.sym;
        const ok = (typeof confirm === 'function') ? confirm('Remove ' + sym + ' from your portfolio? This forgets the entry without recording a realized gain. Use Sell to record a disposition.') : true;
        if (!ok) return;
        PortfolioManager.removePosition(sym, btn.dataset.acct);
        renderPortfolio();
      });
    });
  }

  // ---- REAL PERFORMANCE CHART (current holdings vs SPY) ----
  // Reconstructs the value of the CURRENT holdings over the selected window
  // using real historical closes from /api/chart, converted to CAD, and plots
  // it against the real SPY series. This is an illustrative "current-holdings"
  // valuation (today's share counts held constant across the period), clearly
  // labeled as such, not a fabricated realized track record.
  const perfCache = {};

  function perfRangeParams(range) {
    switch (range) {
      case '1D': return { interval: '5m', range: '1d' };
      case '1W': return { interval: '30m', range: '5d' };
      case '1M': return { interval: '1d', range: '1mo' };
      case '3M': return { interval: '1d', range: '3mo' };
      case '6M': return { interval: '1d', range: '6mo' };
      case '1Y': return { interval: '1d', range: '1y' };
      case 'ALL': return { interval: '1wk', range: '5y' };
      default: return { interval: '1d', range: '1mo' };
    }
  }

  function fetchChart(sym, rp) {
    return fetch('/api/chart/' + encodeURIComponent(sym) + '?interval=' + rp.interval + '&range=' + rp.range)
      .then(r => r.ok ? r.json() : null)
      .catch(() => null);
  }

  // Forward-fill a symbol's closes onto the benchmark time axis.
  function alignCloses(baseTimes, candles) {
    const out = new Array(baseTimes.length).fill(null);
    let j = 0;
    let last = candles.length ? candles[0].close : null;
    for (let i = 0; i < baseTimes.length; i++) {
      const t = baseTimes[i];
      while (j < candles.length && candles[j].time <= t) { last = candles[j].close; j++; }
      out[i] = last;
    }
    return out;
  }

  async function buildPerfSeries(holdings, range) {
    const rp = perfRangeParams(range);
    const rate = PortfolioManager.getUsdCadRate();
    const symbols = holdings.map(h => h.symbol);
    const results = await Promise.all([fetchChart('SPY', rp)].concat(symbols.map(s => fetchChart(s, rp))));
    const spyData = results[0];
    const symData = results.slice(1);
    if (!spyData || !spyData.candles || !spyData.candles.length) return null;
    const spyCandles = spyData.candles.filter(c => c.close != null);
    if (!spyCandles.length) return null;
    const baseTimes = spyCandles.map(c => c.time);
    const spyCloses = spyCandles.map(c => c.close);

    const portValues = new Array(baseTimes.length).fill(0);
    let anyData = false;
    holdings.forEach((h, idx) => {
      const data = symData[idx];
      if (!data || !data.candles || !data.candles.length) return;
      anyData = true;
      const cndl = data.candles.filter(c => c.close != null);
      const aligned = alignCloses(baseTimes, cndl);
      const fx = (h.currency === 'USD') ? rate : 1;
      for (let i = 0; i < baseTimes.length; i++) {
        if (aligned[i] != null) portValues[i] += aligned[i] * h.shares * fx;
      }
    });
    if (!anyData) return null;
    return {
      port: baseTimes.map((t, i) => ({ t: t, v: portValues[i] })),
      spy: baseTimes.map((t, i) => ({ t: t, v: spyCloses[i] }))
    };
  }

  function drawPerfMessage(ctx, w, h, msg) {
    ctx.fillStyle = '#5C5C6E';
    ctx.font = '12px Inter';
    ctx.textAlign = 'center';
    ctx.fillText(msg, w / 2, h / 2);
  }

  function drawPerfSeries(ctx, w, h, series, mode) {
    const port = series.port, spy = series.spy;
    const n = port.length;
    if (!n) return;
    const p0 = port[0].v || 1;
    const s0 = spy[0].v || 1;
    let pArr, bArr, yLabelFmt;
    if (mode === 'percent') {
      pArr = port.map(d => (d.v / p0) * 100);
      bArr = spy.map(d => (d.v / s0) * 100);
      yLabelFmt = (v) => v.toFixed(0);
    } else {
      pArr = port.map(d => d.v);
      bArr = spy.map(d => (d.v / s0) * p0); // SPY rebased to portfolio starting CAD value
      yLabelFmt = (v) => v >= 1000 ? '$' + (v / 1000).toFixed(1) + 'k' : '$' + v.toFixed(0);
    }
    const all = pArr.concat(bArr);
    let minV = Math.min.apply(null, all);
    let maxV = Math.max.apply(null, all);
    if (minV === maxV) { minV -= 1; maxV += 1; }
    const padV = (maxV - minV) * 0.08;
    minV -= padV; maxV += padV;
    const pad = { top: 22, right: 16, bottom: 26, left: 56 };
    const xPos = (i) => pad.left + (i / Math.max(n - 1, 1)) * (w - pad.left - pad.right);
    const yPos = (v) => pad.top + (1 - (v - minV) / (maxV - minV)) * (h - pad.top - pad.bottom);

    // Grid + y-axis labels
    ctx.strokeStyle = 'rgba(120,120,140,0.15)';
    ctx.lineWidth = 0.5;
    ctx.font = '10px "JetBrains Mono"';
    ctx.textAlign = 'right';
    for (let i = 0; i < 5; i++) {
      const y = pad.top + i * ((h - pad.top - pad.bottom) / 4);
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
      const val = maxV - i * ((maxV - minV) / 4);
      ctx.fillStyle = '#7A818E';
      ctx.fillText(yLabelFmt(val), pad.left - 8, y + 3);
    }

    // Benchmark (SPY) dashed blue
    ctx.beginPath();
    ctx.strokeStyle = '#3B82F6';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    bArr.forEach((v, i) => { i === 0 ? ctx.moveTo(xPos(i), yPos(v)) : ctx.lineTo(xPos(i), yPos(v)); });
    ctx.stroke();
    ctx.setLineDash([]);

    // Portfolio gold
    ctx.beginPath();
    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = 2;
    pArr.forEach((v, i) => { i === 0 ? ctx.moveTo(xPos(i), yPos(v)) : ctx.lineTo(xPos(i), yPos(v)); });
    ctx.stroke();

    // Fill under portfolio
    ctx.lineTo(xPos(n - 1), h - pad.bottom);
    ctx.lineTo(xPos(0), h - pad.bottom);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, pad.top, 0, h - pad.bottom);
    grad.addColorStop(0, 'rgba(245,158,11,0.12)');
    grad.addColorStop(1, 'rgba(245,158,11,0)');
    ctx.fillStyle = grad;
    ctx.fill();

    // Honesty label
    ctx.fillStyle = '#7A818E';
    ctx.font = '9px Inter';
    ctx.textAlign = 'left';
    ctx.fillText('Current holdings valued over the period at today\'s share counts. Illustrative, not a realized track record.', pad.left, h - 6);
  }

  async function renderPerfChart() {
    const canvas = document.getElementById('pfPerfChart');
    if (!canvas || !canvas.parentElement) return;
    const ctx = canvas.getContext('2d');
    let w = canvas.width = canvas.parentElement.clientWidth;
    let h = canvas.height = 260;
    ctx.clearRect(0, 0, w, h);

    const holdings = PortfolioManager.getHoldings();
    const rangeBtn = document.querySelector('.pf-tf-btn.active');
    const range = rangeBtn ? rangeBtn.dataset.range : '1M';
    const modeBtn = document.querySelector('#pfPerfToggle .pf-toggle-btn.active');
    const mode = modeBtn ? modeBtn.dataset.mode : 'dollar';

    if (holdings.length === 0) {
      drawPerfMessage(ctx, w, h, 'Add positions to see your holdings valued against SPY.');
      return;
    }

    const sig = range + '|' + holdings.map(hh => hh.symbol + ':' + hh.shares + ':' + hh.currency).join(',');
    let series = (perfCache[sig] && (Date.now() - perfCache[sig].ts < 120000)) ? perfCache[sig].data : null;
    if (!series) {
      drawPerfMessage(ctx, w, h, 'Loading performance...');
      try { series = await buildPerfSeries(holdings, range); } catch (e) { series = null; }
      if (series) perfCache[sig] = { data: series, ts: Date.now() };
    }

    // Re-measure in case the panel resized during the fetch.
    w = canvas.width = canvas.parentElement.clientWidth;
    h = canvas.height = 260;
    ctx.clearRect(0, 0, w, h);
    if (!series || !series.port.length) {
      drawPerfMessage(ctx, w, h, 'Performance data unavailable right now.');
      return;
    }
    drawPerfSeries(ctx, w, h, series, mode);
  }

  function renderAllocChart() {
    const canvas = document.getElementById('pfAllocChart');
    const legendEl = document.getElementById('pfAllocLegend');
    if (!canvas || !legendEl) return;

    const holdings = PortfolioManager.getHoldings();
    if (holdings.length === 0) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#3A3A48';
      ctx.font = '12px Inter';
      ctx.textAlign = 'center';
      ctx.fillText('No positions', canvas.width / 2, canvas.height / 2);
      legendEl.innerHTML = '';
      return;
    }

    // Check which mode is active
    const allocToggle = document.getElementById('pfAllocToggle');
    const activeBtn = allocToggle ? allocToggle.querySelector('.pf-toggle-btn.active') : null;
    const mode = activeBtn ? activeBtn.dataset.mode : 'position';

    let slices = [];
    if (mode === 'sector') {
      // Group holdings by sector
      const sectorTotals = {};
      const totalMktVal = holdings.reduce((s, h) => s + h.marketValue, 0);
      holdings.forEach(h => {
        const sec = h.sector || 'Other';
        sectorTotals[sec] = (sectorTotals[sec] || 0) + h.marketValue;
      });
      slices = Object.entries(sectorTotals)
        .map(([name, val]) => ({ label: name, weight: totalMktVal > 0 ? (val / totalMktVal) * 100 : 0 }))
        .sort((a, b) => b.weight - a.weight);
    } else {
      slices = holdings
        .map(h => ({ label: h.symbol, weight: h.weight }))
        .sort((a, b) => b.weight - a.weight);
    }

    const colors = ['#F59E0B','#3B82F6','#8B5CF6','#14B8A6','#EF4444','#10B981','#EC4899','#6366F1','#F97316','#06B6D4'];
    const ctx = canvas.getContext('2d');
    const size = Math.min(canvas.width, canvas.height);
    const cx = canvas.width / 2, cy = canvas.height / 2;
    const r = size / 2 - 10;
    const innerR = r * 0.55;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let startAngle = -Math.PI / 2;

    slices.forEach((s, i) => {
      const angle = (s.weight / 100) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, startAngle, startAngle + angle);
      ctx.arc(cx, cy, innerR, startAngle + angle, startAngle, true);
      ctx.closePath();
      ctx.fillStyle = colors[i % colors.length];
      ctx.fill();
      startAngle += angle;
    });

    // Center text
    ctx.fillStyle = '#E8E8ED';
    ctx.font = 'bold 14px "JetBrains Mono"';
    ctx.textAlign = 'center';
    if (mode === 'sector') {
      ctx.fillText(slices.length + ' sec', cx, cy - 2);
      ctx.fillStyle = '#5C5C6E';
      ctx.font = '10px Inter';
      ctx.fillText('sectors', cx, cy + 14);
    } else {
      ctx.fillText(slices.length + ' pos', cx, cy - 2);
      ctx.fillStyle = '#5C5C6E';
      ctx.font = '10px Inter';
      ctx.fillText('positions', cx, cy + 14);
    }

    // Legend
    legendEl.innerHTML = slices.slice(0, 8).map((s, i) =>
      `<div class="pf-alloc-legend-item">
        <div class="pf-alloc-legend-left">
          <span class="pf-alloc-legend-dot" style="background:${colors[i % colors.length]}"></span>
          <span class="pf-alloc-legend-sym">${s.label}</span>
        </div>
        <span class="pf-alloc-legend-pct">${s.weight.toFixed(1)}%</span>
      </div>`
    ).join('');
  }

  function renderActivity() {
    const list = document.getElementById('pfActivityList');
    if (!list) return;
    const activities = PortfolioManager.getActivities();
    if (activities.length === 0) {
      list.innerHTML = '<div class="pf-activity-empty">No recent transactions.</div>';
      return;
    }
    list.innerHTML = activities.slice(0, 15).map(a => {
      const d = new Date(a.time);
      const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
      const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const actionCls = a.action === 'BUY' ? 'buy' : 'sell';
      let realizedNote = '';
      if (a.action === 'SELL' && typeof a.realized === 'number') {
        const rc = a.realized >= 0 ? 'profit' : 'loss';
        realizedNote = `<span class="${rc}" style="display:block;font-size:9px;">${a.realized >= 0 ? '+' : '-'}$${Math.abs(a.realized).toFixed(2)} CAD gain</span>`;
      }
      return `<div class="pf-activity-item">
        <span class="pf-activity-time">${dateStr} ${timeStr}</span>
        <span class="pf-activity-action ${actionCls}">${a.action}</span>
        <span class="pf-activity-ticker">${a.symbol}</span>
        <span>${a.shares}</span>
        <span>$${a.price.toFixed(2)}</span>
        <span style="text-align:right">$${a.total.toFixed(2)}${realizedNote}</span>
      </div>`;
    }).join('');
  }

  async function renderPortfolio() {
    // Pull real quotes first so market value, day P&L and allocation use live prices.
    try { await PortfolioManager.refreshQuotes(); } catch (e) {}
    renderSummary();
    renderHoldings();
    renderPerfChart();
    renderAllocChart();
    renderActivity();
  }

  // ---- COST-TO-TRADE HINT (fee model) ----
  function tradeCostHint(el, ticker, shares, price, currency) {
    if (!el) return;
    if (typeof FeeModel === 'undefined') { el.textContent = ''; return; }
    ticker = String(ticker || '').toUpperCase();
    shares = Number(shares); price = Number(price);
    if (!ticker || !(shares > 0) || !(price > 0)) { el.textContent = ''; return; }
    if (!currency || currency === 'auto') currency = PortfolioManager.inferCurrency(ticker);
    try {
      const results = FeeModel.compareBrokers({ quantity: shares, price: price, currency: currency, accountCurrency: PortfolioManager.getBaseCurrency() });
      if (!results.length) { el.textContent = ''; return; }
      const best = results[0];
      const notional = shares * price;
      let msg = 'Est. cost to trade ' + shares + ' ' + ticker + ' (~' + fmt$(notional) + ' ' + currency + '): cheapest is '
        + best.brokerName + ' at ' + fmt$(best.total) + ' ' + currency;
      if (best.crossCurrency && best.fxCost > 0) msg += ' (includes ' + fmt$(best.fxCost) + ' FX conversion)';
      el.textContent = msg;
    } catch (e) { el.textContent = ''; }
  }

  function currentAddCurrency() {
    const ccySel = document.getElementById('modalPosCurrency');
    const ticker = (document.getElementById('modalPosTicker') || {}).value || '';
    let currency = ccySel ? ccySel.value : 'auto';
    if (currency === 'auto') currency = PortfolioManager.inferCurrency(ticker.trim().toUpperCase());
    return currency;
  }
  function updateAddHint() {
    tradeCostHint(
      document.getElementById('pfAddCostHint'),
      (document.getElementById('modalPosTicker') || {}).value,
      parseFloat((document.getElementById('modalPosShares') || {}).value),
      parseFloat((document.getElementById('modalPosCost') || {}).value),
      currentAddCurrency()
    );
  }

  // ---- SELL MODAL ----
  function openSellModal(sym, acct) {
    const holdings = PortfolioManager.getHoldings();
    const h = holdings.find(x => x.symbol === sym && (!acct || x.account === acct)) || holdings.find(x => x.symbol === sym);
    if (!h) return;
    const modal = document.getElementById('sellPositionModal');
    const tEl = document.getElementById('sellPosTicker');
    const heldEl = document.getElementById('sellPosHeld');
    const ccyEl = document.getElementById('sellPosCcy');
    const sharesEl = document.getElementById('sellPosShares');
    const priceEl = document.getElementById('sellPosPrice');
    if (tEl) tEl.value = h.symbol;
    const acctEl = document.getElementById('sellPosAccount');
    if (acctEl) acctEl.value = h.account || 'non-registered';
    const acctShowEl = document.getElementById('sellPosAcctShow');
    if (acctShowEl) acctShowEl.textContent = h.account || 'non-registered';
    const dEl = document.getElementById('sellPosDate');
    if (dEl) dEl.value = new Date().toISOString().slice(0, 10);
    if (heldEl) heldEl.textContent = h.shares.toLocaleString('en-US', { maximumFractionDigits: 4 });
    if (ccyEl) ccyEl.textContent = h.currency;
    if (sharesEl) sharesEl.value = h.shares;
    if (priceEl) priceEl.value = h.hasQuote ? h.currentPrice.toFixed(2) : '';
    updateSellHint();
    if (modal) modal.classList.add('active');
  }
  function updateSellHint() {
    const ticker = (document.getElementById('sellPosTicker') || {}).value;
    const h = PortfolioManager.getHoldings().find(x => x.symbol === (ticker || '').toUpperCase());
    tradeCostHint(
      document.getElementById('pfSellCostHint'),
      ticker,
      parseFloat((document.getElementById('sellPosShares') || {}).value),
      parseFloat((document.getElementById('sellPosPrice') || {}).value),
      h ? h.currency : 'auto'
    );
  }
  // The Add and Sell modals live later in the DOM than the app.js script tag,
  // so their elements do not exist when this IIFE first runs. Wire them once
  // the document has finished parsing.
  function onReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }
  // Transaction-date USD/CAD rate (ITA s.261): today's trades use the live
  // rate; backdated trades fetch the BoC rate for that date. Falls back to
  // the live rate FLAGGED estimated when history is unavailable (pre-2017,
  // offline), so the approximation never masquerades as exact.
  async function resolveTxnFx(currency, dateISO) {
    if (currency !== 'USD') return { rate: undefined, estimated: false };
    const today = new Date().toISOString().slice(0, 10);
    if (!dateISO || dateISO === today) return { rate: undefined, estimated: false };
    try {
      const r = await fetch('/api/fx/usdcad?date=' + encodeURIComponent(dateISO));
      if (r.ok) {
        const j = await r.json();
        if (j && j.rate > 0) return { rate: j.rate, estimated: false };
      }
    } catch (e) {}
    return { rate: undefined, estimated: true };
  }

  function wireModals() {
    // Add-position: cost hint inputs
    ['modalPosTicker', 'modalPosShares', 'modalPosCost', 'modalPosCurrency'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', updateAddHint);
      if (el.tagName === 'SELECT') el.addEventListener('change', updateAddHint);
    });
    // Add-position: confirm
    const modalAddBtn = document.getElementById('modalAddPosBtn');
    if (modalAddBtn) {
      modalAddBtn.addEventListener('click', async () => {
        const ticker = document.getElementById('modalPosTicker').value.trim().toUpperCase();
        const shares = parseFloat(document.getElementById('modalPosShares').value);
        const cost = parseFloat(document.getElementById('modalPosCost').value);
        if (!ticker || isNaN(shares) || shares <= 0 || isNaN(cost) || cost <= 0) return;
        const currency = currentAddCurrency();
        const account = (document.getElementById('modalPosAccount') || {}).value || 'non-registered';
        const date = (document.getElementById('modalPosDate') || {}).value || undefined;
        const commission = parseFloat((document.getElementById('modalPosCommission') || {}).value) || 0;
        const fx = await resolveTxnFx(currency, date);
        PortfolioManager.addPosition(ticker, shares, cost, { currency: currency, account: account, date: date, commission: commission, fxRate: fx.rate, fxEstimated: fx.estimated });
        document.getElementById('modalPosTicker').value = '';
        document.getElementById('modalPosShares').value = '';
        document.getElementById('modalPosCost').value = '';
        const ccySel = document.getElementById('modalPosCurrency');
        if (ccySel) ccySel.value = 'auto';
        const hintEl = document.getElementById('pfAddCostHint');
        if (hintEl) hintEl.textContent = '';
        closeModal('addPositionModal');
        renderPortfolio();
      });
    }
    // Sell: cost hint inputs
    ['sellPosShares', 'sellPosPrice'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', updateSellHint);
    });
    // Sell: confirm
    const modalSellBtn = document.getElementById('modalSellPosBtn');
    if (modalSellBtn) {
      modalSellBtn.addEventListener('click', async () => {
        const ticker = (document.getElementById('sellPosTicker') || {}).value.trim().toUpperCase();
        const shares = parseFloat((document.getElementById('sellPosShares') || {}).value);
        const price = parseFloat((document.getElementById('sellPosPrice') || {}).value);
        if (!ticker || isNaN(shares) || shares <= 0 || isNaN(price) || price < 0) return;
        const account = (document.getElementById('sellPosAccount') || {}).value || undefined;
        const date = (document.getElementById('sellPosDate') || {}).value || undefined;
        const commission = parseFloat((document.getElementById('sellPosCommission') || {}).value) || 0;
        const hRow = PortfolioManager.getHoldings().find(x => x.symbol === ticker && (!account || x.account === account));
        const fx = await resolveTxnFx(hRow ? hRow.currency : 'CAD', date);
        const res = PortfolioManager.sellPosition(ticker, shares, price, { account: account, date: date, commission: commission, fxRate: fx.rate, fxEstimated: fx.estimated });
        if (res && res.ok) {
          if (typeof showToast === 'function') {
            const g = res.realized;
            const gStr = (g >= 0 ? '+$' : '-$') + Math.abs(g).toFixed(2) + ' CAD';
            showToast(res.registered
              ? 'Sold ' + res.shares + ' ' + ticker + ' in ' + res.account + ' - ' + gStr + ' (registered, not taxable)'
              : 'Sold ' + res.shares + ' ' + ticker + ' - realized ' + gStr,
              g >= 0 ? 'success' : 'info');
          }
        } else if (typeof showToast === 'function') {
          showToast((res && res.error) || 'Sell failed', 'error');
        }
        const hintEl = document.getElementById('pfSellCostHint');
        if (hintEl) hintEl.textContent = '';
        closeModal('sellPositionModal');
        renderPortfolio();
      });
    }

    // --- Import from Broker (read-only preview -> selected lots) ---
    const importOpenBtn = document.getElementById('importBrokerBtn');
    const importLoadBtn = document.getElementById('importBrokerLoadBtn');
    const importConfirmBtn = document.getElementById('importBrokerConfirmBtn');
    const importStatusEl = document.getElementById('importBrokerStatus');
    const importWrapEl = document.getElementById('importBrokerTableWrap');
    const importSkippedEl = document.getElementById('importBrokerSkipped');
    let importPreview = null;

    function escImp(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      }[c]));
    }

    function importStatus(msg) { if (importStatusEl) importStatusEl.textContent = msg || ''; }

    function resetImportModal() {
      importPreview = null;
      csvPreview = null;
      if (importSourceSel) importSourceSel.value = 'broker';
      if (importCsvFile) importCsvFile.value = '';
      syncImportSource();
      importStatus('Choose a broker and load positions. Uses the broker connection configured on your server.');
      if (importWrapEl) importWrapEl.innerHTML = '';
      if (importSkippedEl) importSkippedEl.textContent = '';
      if (importConfirmBtn) importConfirmBtn.disabled = true;
    }

    function renderImportTable() {
      if (!importWrapEl || !importPreview) return;
      const held = {};
      PortfolioManager.getPositions().forEach(p => { held[p.symbol] = true; });
      const rows = importPreview.positions || [];
      if (!rows.length) {
        importStatus('No importable long stock positions in this account.');
      } else {
        importStatus(rows.length + ' position' + (rows.length === 1 ? '' : 's') + ' found. Already-held symbols start unticked; ticking one replaces that holding with the broker lot.');
      }
      let html = '<table class="pf-import-table"><thead><tr>' +
        '<th></th><th>Symbol</th><th class="num">Qty</th><th class="num">Avg Cost</th><th>Ccy</th><th class="num">Mkt Value</th><th></th></tr></thead><tbody>';
      rows.forEach((p, i) => {
        const dup = !!held[p.symbol];
        html += '<tr>' +
          '<td><input type="checkbox" class="pf-import-check" data-idx="' + i + '"' + (dup ? '' : ' checked') + '></td>' +
          '<td>' + escImp(p.symbol) + '</td>' +
          '<td class="num">' + escImp(p.qty) + '</td>' +
          '<td class="num">' + (p.avgPrice ? Number(p.avgPrice).toFixed(2) : '-') + '</td>' +
          '<td>' + escImp(p.currency) + '</td>' +
          '<td class="num">' + (p.marketValue ? Number(p.marketValue).toLocaleString('en-CA', { maximumFractionDigits: 0 }) : '-') + '</td>' +
          '<td class="pf-import-note">' + (dup ? 'already held - replaces' : '') + '</td>' +
          '</tr>';
      });
      html += '</tbody></table>';
      importWrapEl.innerHTML = html;
      if (importSkippedEl) {
        const sk = importPreview.skipped || [];
        importSkippedEl.textContent = sk.length ? ('Not imported: ' + sk.map(s => s.symbol + ' (' + s.reason + ')').join('; ')) : '';
      }
      if (importConfirmBtn) importConfirmBtn.disabled = rows.length === 0;
    }

    if (importOpenBtn) {
      importOpenBtn.addEventListener('click', () => {
        resetImportModal();
        const modal = document.getElementById('importBrokerModal');
        if (modal) modal.classList.add('active');
      });
    }

    if (importLoadBtn) {
      importLoadBtn.addEventListener('click', async () => {
        if (typeof SupabaseClient === 'undefined' || !SupabaseClient.isAuthenticated || !SupabaseClient.isAuthenticated()) {
          importStatus('Sign in first: broker import uses your authenticated session.');
          return;
        }
        const brokerSel = document.getElementById('importBrokerSelect');
        const broker = (brokerSel && brokerSel.value) || 'questrade';
        importStatus('Loading positions from ' + (broker === 'ibkr' ? 'Interactive Brokers' : 'Questrade') + '...');
        if (importWrapEl) importWrapEl.innerHTML = '';
        if (importSkippedEl) importSkippedEl.textContent = '';
        if (importConfirmBtn) importConfirmBtn.disabled = true;
        try {
          const res = await SupabaseClient.fetchWithAuth('/api/broker/import/preview?broker=' + encodeURIComponent(broker));
          const data = await res.json();
          if (!res.ok || (data && data.error)) {
            if (data && data.error === 'NOT_CONFIGURED') {
              importStatus((data.message || 'Broker not configured.') + ' Set the connection in your server .env (see .env.example).');
            } else {
              importStatus('Could not load positions: ' + ((data && data.message) || ('HTTP ' + res.status)));
            }
            return;
          }
          importPreview = data;
          renderImportTable();
        } catch (e) {
          importStatus('Could not load positions: ' + ((e && e.message) || 'network error'));
        }
      });
    }

    if (importConfirmBtn) {
      importConfirmBtn.addEventListener('click', async () => {
        if (importSourceSel && importSourceSel.value === 'csv') {
          if (csvPreview) await applyCsvImport();
          return;
        }
        if (!importPreview || !importWrapEl) return;
        const checks = importWrapEl.querySelectorAll('.pf-import-check:checked');
        let imported = 0;
        checks.forEach(cb => {
          const p = importPreview.positions[Number(cb.dataset.idx)];
          if (!p) return;
          // Replace semantics for already-held symbols: the broker lot becomes
          // the position (the user opted in via the unticked-by-default row).
          const acct = (document.getElementById('importBrokerAccount') || {}).value || 'non-registered';
          const exists = PortfolioManager.getPositions().some(x => x.symbol === p.symbol);
          if (exists) PortfolioManager.removePosition(p.symbol);
          const ok = PortfolioManager.addPosition(p.symbol, p.qty, p.avgPrice, {
            currency: p.currency, source: 'broker-import', account: acct,
            fxEstimated: p.currency === 'USD'
          });
          if (ok) imported++;
        });
        if (imported > 0) {
          showToast('Imported ' + imported + ' position' + (imported === 1 ? '' : 's') + ' from ' + (importPreview.broker === 'ibkr' ? 'IBKR' : 'Questrade'), 'success');
        } else {
          showToast('Nothing selected to import', 'info');
        }
        closeModal('importBrokerModal');
        renderPortfolio();
      });
    }

    // --- Record Event modal (dividend / DRIP / ROC / split) ---
    const EVT_HINTS = {
      dividend: 'Cash income. Recorded to the income ledger; ACB is untouched.',
      drip: 'Reinvested distribution: adds a zero-commission buy at amount divided by shares, and records the income.',
      roc: 'Return of capital (T3 box 42): reduces ACB dollar for dollar; anything above remaining ACB realizes a capital gain.',
      split: 'Adjusts every pre-split lot (shares multiplied, price divided). Total ACB does not change.'
    };

    function syncEventFields() {
      const t = (document.getElementById('evtType') || {}).value || 'dividend';
      const amountRow = document.getElementById('evtAmountRow');
      const sharesRow = document.getElementById('evtSharesRow');
      const ratioRow = document.getElementById('evtRatioRow');
      if (amountRow) amountRow.style.display = t === 'split' ? 'none' : '';
      if (sharesRow) sharesRow.style.display = t === 'drip' ? '' : 'none';
      if (ratioRow) ratioRow.style.display = t === 'split' ? '' : 'none';
      const hint = document.getElementById('evtHint');
      if (hint) hint.textContent = EVT_HINTS[t] || '';
    }
    const evtTypeSel = document.getElementById('evtType');
    if (evtTypeSel) evtTypeSel.addEventListener('change', syncEventFields);

    window.gsOpenEventModal = function (sym, acct) {
      const h = PortfolioManager.getHoldings().find(x => x.symbol === sym && (!acct || x.account === acct));
      if (!h) return;
      document.getElementById('evtSymbol').value = h.symbol;
      document.getElementById('evtAccount').value = h.account;
      const ctx = document.getElementById('evtContext');
      if (ctx) ctx.textContent = h.symbol + ' - ' + h.account + ' (' + h.currency + ', ' + h.shares.toLocaleString('en-US', { maximumFractionDigits: 4 }) + ' shares held)';
      const dEl = document.getElementById('evtDate');
      if (dEl) dEl.value = new Date().toISOString().slice(0, 10);
      ['evtAmount', 'evtShares', 'evtRatio'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
      if (evtTypeSel) evtTypeSel.value = 'dividend';
      syncEventFields();
      const modal = document.getElementById('eventModal');
      if (modal) modal.classList.add('active');
    };

    const evtConfirmBtn = document.getElementById('evtConfirmBtn');
    if (evtConfirmBtn) {
      evtConfirmBtn.addEventListener('click', async () => {
        const sym = (document.getElementById('evtSymbol') || {}).value;
        const acct = (document.getElementById('evtAccount') || {}).value;
        const type = (document.getElementById('evtType') || {}).value;
        const date = (document.getElementById('evtDate') || {}).value;
        const amount = parseFloat((document.getElementById('evtAmount') || {}).value);
        const shares = parseFloat((document.getElementById('evtShares') || {}).value);
        const ratio = parseFloat((document.getElementById('evtRatio') || {}).value);
        if (!sym || !date) return;
        const h = PortfolioManager.getHoldings().find(x => x.symbol === sym && x.account === acct);
        const fx = await resolveTxnFx(h ? h.currency : 'CAD', date);
        let res;
        if (type === 'dividend') {
          res = PortfolioManager.recordDividend(sym, acct, { amount: amount, date: date, fxRate: fx.rate, fxEstimated: fx.estimated });
          if (res && res.ok && typeof showToast === 'function') showToast('Dividend recorded: $' + (Number(amount) || 0).toFixed(2) + ' ' + (h ? h.currency : ''), 'success');
        } else if (type === 'drip') {
          res = PortfolioManager.recordDrip(sym, acct, { amount: amount, shares: shares, date: date, fxRate: fx.rate, fxEstimated: fx.estimated });
          if (res && res.ok && typeof showToast === 'function') showToast('DRIP recorded: ' + shares + ' ' + sym + ' @ $' + res.price.toFixed(4), 'success');
        } else if (type === 'roc') {
          res = PortfolioManager.recordRoc(sym, acct, { amount: amount, date: date, fxRate: fx.rate, fxEstimated: fx.estimated });
          if (res && res.ok && typeof showToast === 'function') showToast('Return of capital recorded' + (res.excessGain > 0.005 ? ' - excess over ACB realized $' + res.excessGain.toFixed(2) + ' CAD gain' : ' - ACB reduced'), 'success');
        } else if (type === 'split') {
          res = PortfolioManager.recordSplit(sym, acct, { ratio: ratio, date: date });
          if (res && res.ok && typeof showToast === 'function') showToast('Split applied: ' + res.affected + ' lot' + (res.affected === 1 ? '' : 's') + ' adjusted, now ' + res.shares.toLocaleString('en-US', { maximumFractionDigits: 4 }) + ' shares', 'success');
        }
        if (res && !res.ok && typeof showToast === 'function') showToast(res.error || 'Could not record event', 'error');
        if (res && res.ok) { closeModal('eventModal'); renderPortfolio(); }
      });
    }

    // --- CSV import (full transaction history -> the ACB ledger) ---
    const importSourceSel = document.getElementById('importSourceSelect');
    const importBrokerRow = document.getElementById('importBrokerRow');
    const importCsvRow = document.getElementById('importCsvRow');
    const importCsvFile = document.getElementById('importCsvFile');
    let csvPreview = null;

    function syncImportSource() {
      const mode = (importSourceSel && importSourceSel.value) || 'broker';
      if (importBrokerRow) importBrokerRow.style.display = mode === 'broker' ? '' : 'none';
      if (importCsvRow) importCsvRow.style.display = mode === 'csv' ? '' : 'none';
      if (importLoadBtn) importLoadBtn.style.display = mode === 'broker' ? '' : 'none';
      if (importWrapEl) importWrapEl.innerHTML = '';
      if (importSkippedEl) importSkippedEl.textContent = '';
      if (importConfirmBtn) importConfirmBtn.disabled = true;
      if (mode === 'csv') {
        importStatus('Choose a CSV exported from your broker (transaction or activity history). Buys and sells import in date order with the Bank of Canada rate for each trade date.');
      } else {
        importStatus('Choose a broker and load positions. Uses the broker connection configured on your server.');
      }
    }
    if (importSourceSel) importSourceSel.addEventListener('change', () => { csvPreview = null; importPreview = null; syncImportSource(); });

    if (importCsvFile) {
      importCsvFile.addEventListener('change', () => {
        const f = importCsvFile.files && importCsvFile.files[0];
        if (!f || typeof CsvIO === 'undefined') return;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const parsed = CsvIO.parseCsv(String(reader.result || ''));
            const mapping = CsvIO.guessMapping(parsed.headers);
            csvPreview = CsvIO.normalizeRows(parsed.rows, mapping);
            renderCsvPreview();
          } catch (e) {
            importStatus('Could not read CSV: ' + ((e && e.message) || 'parse error'));
          }
        };
        reader.readAsText(f);
      });
    }

    function renderCsvPreview() {
      if (!importWrapEl || !csvPreview) return;
      const txns = csvPreview.txns || [];
      const errs = csvPreview.errors || [];
      importStatus(txns.length + ' transaction' + (txns.length === 1 ? '' : 's') + ' recognized' +
        (errs.length ? '; ' + errs.length + ' row' + (errs.length === 1 ? '' : 's') + ' listed below could not be imported' : '') + '.');
      let html = '<table class="pf-import-table"><thead><tr><th></th><th>Type</th><th>Symbol</th><th>Date</th><th class="num">Shares</th><th class="num">Price</th><th class="num">Comm</th><th>Ccy</th><th>Account</th></tr></thead><tbody>';
      txns.forEach((t, i) => {
        html += '<tr>' +
          '<td><input type="checkbox" class="pf-csv-check" data-idx="' + i + '" checked></td>' +
          '<td>' + escImp(t.type.toUpperCase()) + '</td>' +
          '<td>' + escImp(t.symbol) + '</td>' +
          '<td>' + escImp(t.date) + '</td>' +
          '<td class="num">' + escImp(t.shares) + '</td>' +
          '<td class="num">' + escImp(t.price) + '</td>' +
          '<td class="num">' + escImp(t.commission || 0) + '</td>' +
          '<td>' + escImp(t.currency || 'auto') + '</td>' +
          '<td>' + escImp(t.account || '(selected above)') + '</td>' +
          '</tr>';
      });
      html += '</tbody></table>';
      importWrapEl.innerHTML = html;
      if (importSkippedEl) {
        importSkippedEl.textContent = errs.length
          ? ('Not importable: ' + errs.map(e => 'line ' + e.line + ' (' + e.reason + ')').join('; '))
          : '';
      }
      if (importConfirmBtn) importConfirmBtn.disabled = txns.length === 0;
    }

    // Broker account labels vary; map recognizable ones onto the tracker's
    // account types and let anything unknown fall back to the modal setting.
    function normalizeCsvAccount(a) {
      if (!a) return null;
      const s = String(a).toLowerCase();
      if (s.indexOf('tfsa') !== -1) return 'TFSA';
      if (s.indexOf('fhsa') !== -1) return 'FHSA';
      if (s.indexOf('rrsp') !== -1 || /\brsp\b/.test(s)) return 'RRSP';
      if (s.indexOf('resp') !== -1 || s.indexOf('lira') !== -1 || s.indexOf('rrif') !== -1 || s.indexOf('rif') !== -1) return 'other-registered';
      if (s.indexOf('margin') !== -1 || s.indexOf('cash') !== -1 || s.indexOf('individual') !== -1 || s.indexOf('non') !== -1) return 'non-registered';
      return null;
    }

    async function applyCsvImport() {
      const checks = importWrapEl ? importWrapEl.querySelectorAll('.pf-csv-check:checked') : [];
      const chosen = [];
      checks.forEach(cb => { const t = csvPreview.txns[Number(cb.dataset.idx)]; if (t) chosen.push(t); });
      if (!chosen.length) { showToast('Nothing selected to import', 'info'); return; }
      const defaultAcct = (document.getElementById('importBrokerAccount') || {}).value || 'non-registered';
      // Chronological apply so every sell finds its shares.
      chosen.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      // Resolve each USD trade date's BoC rate once, up front.
      const fxByDate = {};
      const usdDates = Array.from(new Set(chosen
        .filter(t => (t.currency || PortfolioManager.inferCurrency(t.symbol)) === 'USD')
        .map(t => t.date)));
      importStatus('Importing... resolving ' + usdDates.length + ' Bank of Canada rate' + (usdDates.length === 1 ? '' : 's') + '.');
      await Promise.all(usdDates.map(d => resolveTxnFx('USD', d).then(fx => { fxByDate[d] = fx; })));
      let buys = 0, sells = 0, failed = 0;
      chosen.forEach(t => {
        const currency = t.currency || PortfolioManager.inferCurrency(t.symbol);
        const fx = currency === 'USD' ? (fxByDate[t.date] || { rate: undefined, estimated: true }) : { rate: undefined, estimated: false };
        const acct = normalizeCsvAccount(t.account) || defaultAcct;
        if (t.type === 'buy') {
          const ok = PortfolioManager.addPosition(t.symbol, t.shares, t.price, {
            currency: currency, account: acct, date: t.date, commission: t.commission || 0,
            fxRate: fx.rate, fxEstimated: fx.estimated, source: 'csv-import'
          });
          if (ok) buys++; else failed++;
        } else {
          const res = PortfolioManager.sellPosition(t.symbol, t.shares, t.price, {
            account: acct, date: t.date, commission: t.commission || 0,
            fxRate: fx.rate, fxEstimated: fx.estimated
          });
          if (res && res.ok) sells++; else failed++;
        }
      });
      showToast('Imported ' + buys + ' buy' + (buys === 1 ? '' : 's') + ' and ' + sells + ' sell' + (sells === 1 ? '' : 's') +
        (failed ? ' (' + failed + ' failed)' : ''), failed ? 'info' : 'success');
      closeModal('importBrokerModal');
      renderPortfolio();
    }

    // --- CSV exports (holdings snapshot + full re-importable ledger) ---
    function downloadCsv(name, text) {
      const blob = new Blob([text], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }
    const expHoldBtn = document.getElementById('pfExportHoldingsBtn');
    if (expHoldBtn) {
      expHoldBtn.addEventListener('click', () => {
        if (typeof CsvIO === 'undefined') return;
        downloadCsv('gsp-holdings-' + new Date().toISOString().slice(0, 10) + '.csv',
          CsvIO.holdingsToCsv(PortfolioManager.getHoldings()));
      });
    }
    const expTaxBtn = document.getElementById('pfExportTaxBtn');
    if (expTaxBtn) {
      expTaxBtn.addEventListener('click', () => {
        if (typeof TaxReport === 'undefined') return;
        const year = String(new Date().getFullYear());
        const rows = TaxReport.buildDispositions(PortfolioManager.getPositions(), { year: year });
        downloadCsv('gsp-schedule3-' + year + '.csv', TaxReport.dispositionsToCsv(rows));
        downloadCsv('gsp-income-' + year + '.csv', TaxReport.incomeToCsv(PortfolioManager.getIncome(), { year: year }));
        if (typeof showToast === 'function') {
          const s = TaxReport.summarize(rows);
          showToast(year + ' tax CSVs: ' + s.rowCount + ' disposition' + (s.rowCount === 1 ? '' : 's') + ', net ' + (s.totalGainCad >= 0 ? '+$' : '-$') + Math.abs(s.totalGainCad).toFixed(2) + ' CAD' + (s.approxCount ? ' (' + s.approxCount + ' approximate)' : ''), 'success');
        }
      });
    }
    const expTxnBtn = document.getElementById('pfExportTxnsBtn');
    if (expTxnBtn) {
      expTxnBtn.addEventListener('click', () => {
        if (typeof CsvIO === 'undefined') return;
        downloadCsv('gsp-transactions-' + new Date().toISOString().slice(0, 10) + '.csv',
          CsvIO.txnsToCsv(PortfolioManager.getPositions()));
      });
    }
  }
  onReady(wireModals);

  // Sort header clicks
  document.querySelectorAll('.pf-sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (col === sortCol) {
        sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        sortCol = col;
        sortDir = 'desc';
      }
      document.querySelectorAll('.pf-sortable').forEach(t => t.classList.remove('sort-asc','sort-desc'));
      th.classList.add(sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
      renderHoldings();
    });
  });

  // Timeframe buttons
  document.querySelectorAll('.pf-tf-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pf-tf-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderPerfChart();
    });
  });

  // Toggle groups
  document.querySelectorAll('.pf-toggle-group').forEach(group => {
    group.querySelectorAll('.pf-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        group.querySelectorAll('.pf-toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (group.id === 'pfPerfToggle') renderPerfChart();
        if (group.id === 'pfAllocToggle') renderAllocChart();
      });
    });
  });

  // Add Position button
  const addPosBtn = document.getElementById('addPositionBtn');
  if (addPosBtn) {
    addPosBtn.addEventListener('click', () => {
      const dEl = document.getElementById('modalPosDate');
      if (dEl && !dEl.value) dEl.value = new Date().toISOString().slice(0, 10);
      const modal = document.getElementById('addPositionModal');
      if (modal) modal.classList.add('active');
    });
  }

  // (Add/Sell modal confirm buttons are wired in wireModals via onReady, since
  // those modal elements are parsed after this script.)

  // Show Alpaca import button if keys configured
  const alpKey = localStorage.getItem('alpaca_api_key');
  if (alpKey) {
    const impBtn = document.getElementById('importAlpacaBtn');
    if (impBtn) impBtn.style.display = '';
  }

  // Listen for view switch to portfolio
  const origNavHandler = function() {
    const activeView = document.querySelector('.view.active');
    if (activeView && activeView.id === 'view-portfolio' && !portfolioLoaded) {
      portfolioLoaded = true;
      renderPortfolio();
    } else if (activeView && activeView.id === 'view-portfolio') {
      renderPortfolio();
    }
  };

  // Hook into nav clicks
  document.querySelectorAll('.nav-btn[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      setTimeout(origNavHandler, 50);
    });
  });

  // Resolve true transaction-date BoC rates for any estimated/missing FX
  // stamps once quotes are up (persists once; re-renders via the sync event).
  PortfolioManager.refreshQuotes().then(() => PortfolioManager.repairFxRates()).catch(() => {});

  // A cloud pull replaced the local copy: re-render if the view is open.
  document.addEventListener('gs:portfolio-synced', () => {
    const activeView = document.querySelector('.view.active');
    if (activeView && activeView.id === 'view-portfolio') {
      portfolioLoaded = true;
      renderPortfolio();
    }
  });
})();


// ============================================
// ONBOARDING WIZARD
// ============================================
(function initOnboarding() {
  const overlay = document.getElementById('onboardingOverlay');
  if (!overlay) return;

  const OB_COMPLETE_KEY = 'gs_onboarding_complete';
  let currentStep = 1;
  const totalSteps = 5;
  const selectedStyles = new Set();
  const selectedTickers = new Set();
  const customTickers = new Set();

  function showOverlay() {
    overlay.classList.add('active');
  }
  function hideOverlay() {
    overlay.classList.remove('active');
    localStorage.setItem(OB_COMPLETE_KEY, 'true');
  }

  function goToStep(step) {
    currentStep = step;
    // Update progress
    const fill = document.getElementById('obProgressFill');
    if (fill) fill.style.width = ((step / totalSteps) * 100) + '%';

    // Update dots
    document.querySelectorAll('.ob-step-dot').forEach(dot => {
      const ds = parseInt(dot.dataset.step);
      dot.classList.remove('active', 'done');
      if (ds === step) dot.classList.add('active');
      else if (ds < step) dot.classList.add('done');
    });

    // Show/hide steps
    for (let i = 1; i <= totalSteps; i++) {
      const el = document.getElementById('obStep' + i);
      if (el) {
        el.classList.remove('active');
        if (i === step) {
          el.classList.add('active');
          el.style.animation = 'none';
          el.offsetHeight; // trigger reflow
          el.style.animation = '';
        }
      }
    }

    // Build summary on step 5
    if (step === 5) buildSummary();
  }

  function buildSummary() {
    const summaryEl = document.getElementById('obSummary');
    if (!summaryEl) return;
    const allTickers = new Set([...selectedTickers, ...customTickers]);
    const styles = [...selectedStyles].map(s => s.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));

    let html = '';
    if (styles.length > 0) {
      html += `<div class="ob-summary-item"><span class="ob-summary-label">Trading Style</span><span class="ob-summary-value">${styles.join(', ')}</span></div>`;
    }
    html += `<div class="ob-summary-item"><span class="ob-summary-label">Watchlist</span><span class="ob-summary-value">${allTickers.size} companies</span></div>`;

    const positions = getPositionRows();
    if (positions.length > 0) {
      html += `<div class="ob-summary-item"><span class="ob-summary-label">Positions</span><span class="ob-summary-value">${positions.length} holdings added</span></div>`;
    }
    summaryEl.innerHTML = html;
  }

  function getPositionRows() {
    const rows = document.querySelectorAll('#obPositionsList .ob-position-row');
    const positions = [];
    rows.forEach(row => {
      const ticker = row.querySelector('.ob-pos-ticker').value.trim().toUpperCase();
      const shares = parseFloat(row.querySelector('.ob-pos-shares').value);
      const cost = parseFloat(row.querySelector('.ob-pos-cost').value);
      if (ticker && shares > 0 && cost > 0) {
        positions.push({ symbol: ticker, shares, avgCost: cost });
      }
    });
    return positions;
  }

  function completeOnboarding() {
    // Save profile
    PortfolioManager.saveProfile({ styles: [...selectedStyles] });

    // Save watchlist
    const allTickers = [...new Set([...selectedTickers, ...customTickers])];
    PortfolioManager.saveWatchlist(allTickers);

    // Save positions
    const positions = getPositionRows();
    positions.forEach(p => {
      PortfolioManager.addPosition(p.symbol, p.shares, p.avgCost);
    });

    hideOverlay();
  }

  // Update watchlist count
  function updateWatchCount() {
    const el = document.getElementById('obWatchCount');
    if (el) el.textContent = selectedTickers.size + customTickers.size;
  }

  // --- STEP 1 ---
  document.getElementById('obLetsGo')?.addEventListener('click', () => goToStep(2));
  document.getElementById('obSkipAll')?.addEventListener('click', () => hideOverlay());

  // --- STEP 2 ---
  document.querySelectorAll('.ob-profile-card').forEach(card => {
    card.addEventListener('click', () => {
      const style = card.dataset.style;
      if (selectedStyles.has(style)) {
        selectedStyles.delete(style);
        card.classList.remove('selected');
      } else {
        selectedStyles.add(style);
        card.classList.add('selected');
      }
    });
  });
  document.getElementById('obBack2')?.addEventListener('click', () => goToStep(1));
  document.getElementById('obNext2')?.addEventListener('click', () => goToStep(3));

  // --- STEP 3 ---
  document.querySelectorAll('.ob-chip input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      const val = cb.value;
      const chip = cb.closest('.ob-chip');
      if (cb.checked) {
        if (selectedTickers.size + customTickers.size >= 25) {
          cb.checked = false;
          return;
        }
        selectedTickers.add(val);
        chip.classList.add('checked');
        // Sync duplicates (e.g. NVDA in multiple categories)
        document.querySelectorAll(`.ob-chip input[value="${val}"]`).forEach(dup => {
          dup.checked = true;
          dup.closest('.ob-chip').classList.add('checked');
        });
      } else {
        selectedTickers.delete(val);
        chip.classList.remove('checked');
        document.querySelectorAll(`.ob-chip input[value="${val}"]`).forEach(dup => {
          dup.checked = false;
          dup.closest('.ob-chip').classList.remove('checked');
        });
      }
      updateWatchCount();
    });
  });

  // Custom ticker search
  const searchInput = document.getElementById('obTickerSearch');
  if (searchInput) {
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const val = searchInput.value.trim().toUpperCase();
        if (!val || val.length > 6) return;
        if (selectedTickers.has(val) || customTickers.has(val)) { searchInput.value = ''; return; }
        if (selectedTickers.size + customTickers.size >= 25) return;

        // Check if it's in the predefined chips
        const existing = document.querySelector(`.ob-chip input[value="${val}"]`);
        if (existing) {
          existing.checked = true;
          existing.dispatchEvent(new Event('change'));
          searchInput.value = '';
          return;
        }

        customTickers.add(val);
        updateWatchCount();
        const container = document.getElementById('obCustomAdded');
        if (container) {
          const chip = document.createElement('span');
          chip.className = 'ob-custom-chip';
          chip.innerHTML = `${val} <span class="ob-chip-remove" data-ticker="${val}">&times;</span>`;
          chip.querySelector('.ob-chip-remove').addEventListener('click', () => {
            customTickers.delete(val);
            chip.remove();
            updateWatchCount();
          });
          container.appendChild(chip);
        }
        searchInput.value = '';
      }
    });
  }

  document.getElementById('obBack3')?.addEventListener('click', () => goToStep(2));
  document.getElementById('obNext3')?.addEventListener('click', () => goToStep(4));

  // --- STEP 4 ---
  document.getElementById('obAddPositionRow')?.addEventListener('click', () => {
    const list = document.getElementById('obPositionsList');
    if (!list) return;
    const row = document.createElement('div');
    row.className = 'ob-position-row';
    row.innerHTML = `
      <input type="text" class="ob-pos-ticker" placeholder="Ticker" maxlength="6">
      <input type="number" class="ob-pos-shares" placeholder="Shares" min="0" step="0.01">
      <input type="number" class="ob-pos-cost" placeholder="Avg Cost" min="0" step="0.01">
      <button class="ob-pos-remove" title="Remove">&times;</button>
    `;
    row.querySelector('.ob-pos-remove').addEventListener('click', () => row.remove());
    list.appendChild(row);
  });

  // Remove handler for first row
  document.querySelector('#obPositionsList .ob-pos-remove')?.addEventListener('click', function() {
    const list = document.getElementById('obPositionsList');
    if (list && list.children.length > 1) this.closest('.ob-position-row').remove();
  });

  // Alpaca import button
  const alpKey = localStorage.getItem('alpaca_api_key');
  if (alpKey) {
    const impBtn = document.getElementById('obImportAlpaca');
    if (impBtn) impBtn.style.display = '';
  }

  document.getElementById('obBack4')?.addEventListener('click', () => goToStep(3));
  document.getElementById('obSkip4')?.addEventListener('click', () => goToStep(5));
  document.getElementById('obNext4')?.addEventListener('click', () => goToStep(5));

  // --- STEP 5 ---
  document.getElementById('obLaunchDashboard')?.addEventListener('click', () => completeOnboarding());

  // --- TRIGGER CHECK ---
  // Show onboarding after auth success if not completed
  function checkAndShowOnboarding() {
    if (localStorage.getItem(OB_COMPLETE_KEY) === 'true') return;
    // Small delay to let auth screen transition finish
    setTimeout(() => showOverlay(), 600);
  }

  // Hook into the auth flow - monitor for auth screen being hidden
  const authScreen = document.getElementById('authScreen');
  if (authScreen) {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach(m => {
        if (m.attributeName === 'class' && authScreen.classList.contains('auth-hidden')) {
          checkAndShowOnboarding();
        }
      });
    });
    observer.observe(authScreen, { attributes: true });
  }

  // Also check on Supabase auth change
  if (typeof SupabaseClient !== 'undefined' && SupabaseClient.onAuthChange) {
    SupabaseClient.onAuthChange(function(event) {
      if (event === 'SIGNED_IN') {
        checkAndShowOnboarding();
      }
    });
  }
})();

// ============================================
// SLIDE-OUT SETTINGS PANEL
// ============================================
(function initSettingsPanel() {
  var panel = document.getElementById('settingsPanelSlideout');
  var backdrop = document.getElementById('spBackdrop');
  var toggleBtn = document.getElementById('settingsPanelToggle');
  var collapseBtn = document.getElementById('spCollapseBtn');
  var expandTab = document.getElementById('spExpandTab');
  if (!panel) return;

  var isOpen = false;

  function openPanel() {
    if (isOpen) return;
    isOpen = true;
    panel.classList.add('open');
    if (backdrop) backdrop.classList.add('active');
    if (toggleBtn) toggleBtn.classList.add('active');
    if (expandTab) expandTab.classList.add('hidden');
  }

  function closePanel() {
    if (!isOpen) return;
    isOpen = false;
    panel.classList.remove('open');
    if (backdrop) backdrop.classList.remove('active');
    if (toggleBtn) toggleBtn.classList.remove('active');
    if (expandTab) expandTab.classList.remove('hidden');
  }

  function togglePanel() {
    if (isOpen) closePanel();
    else openPanel();
  }

  // Settings gear button in sidebar
  if (toggleBtn) {
    toggleBtn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      togglePanel();
    });
  }

  // Collapse arrow button (inside panel, right edge)
  if (collapseBtn) {
    collapseBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      closePanel();
    });
  }

  // Expand arrow tab (visible when panel is closed)
  if (expandTab) {
    expandTab.addEventListener('click', function(e) {
      e.stopPropagation();
      openPanel();
    });
  }

  // Backdrop click closes
  if (backdrop) {
    backdrop.addEventListener('click', function() { closePanel(); });
  }

  // Escape key closes
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && isOpen) closePanel();
  });

  // ---- TAB SWITCHING ----
  var tabs = panel.querySelectorAll('.sp-tab');
  var tabMap = {
    profile: document.getElementById('spTabProfile'),
    portfolio: document.getElementById('spTabPortfolio'),
    connections: document.getElementById('spTabConnections'),
    preferences: document.getElementById('spTabPreferences')
  };

  tabs.forEach(function(tab) {
    tab.addEventListener('click', function() {
      var target = tab.dataset.spTab;
      tabs.forEach(function(t) { t.classList.remove('active'); });
      tab.classList.add('active');
      Object.values(tabMap).forEach(function(el) { if (el) el.classList.remove('active'); });
      if (tabMap[target]) tabMap[target].classList.add('active');
    });
  });

  // ---- PROFILE TAB ----
  function loadProfile() {
    var profile = (typeof PortfolioManager !== 'undefined') ? PortfolioManager.getProfile() : {};
    var nameInput = document.getElementById('spDisplayName');
    var emailInput = document.getElementById('spEmail');
    var nameShow = document.getElementById('spDisplayNameShow');
    var emailShow = document.getElementById('spEmailShow');
    var avatarEl = document.getElementById('spAvatarDisplay');
    var expSelect = document.getElementById('spExperienceLevel');
    var createdEl = document.getElementById('spAccountCreated');

    if (nameInput && profile.displayName) nameInput.value = profile.displayName;
    if (emailInput && profile.email) emailInput.value = profile.email;
    if (nameShow) nameShow.textContent = profile.displayName || 'Greystone User';
    if (emailShow) emailShow.textContent = profile.email || 'user@example.com';
    if (avatarEl) {
      var name = profile.displayName || 'GS';
      var parts = name.split(' ');
      avatarEl.textContent = parts.length > 1
        ? (parts[0][0] + parts[1][0]).toUpperCase()
        : name.substring(0, 2).toUpperCase();
    }
    if (expSelect && profile.experienceLevel) expSelect.value = profile.experienceLevel;
    if (createdEl) createdEl.textContent = profile.createdAt ? new Date(profile.createdAt).toLocaleDateString() : '-';

    // Trading styles
    ['Day', 'Swing', 'Position', 'Scalp'].forEach(function(s) {
      var cb = document.getElementById('spStyle' + s);
      if (cb && profile.tradingStyles) cb.checked = profile.tradingStyles.includes(s.toLowerCase());
    });

    // Try to get email from Supabase
    if (typeof SupabaseClient !== 'undefined' && SupabaseClient.getUser) {
      var user = SupabaseClient.getUser();
      if (user && user.email) {
        if (emailInput) emailInput.value = user.email;
        if (emailShow) emailShow.textContent = user.email;
      }
    }
  }

  document.getElementById('spSaveProfile')?.addEventListener('click', function() {
    var profile = (typeof PortfolioManager !== 'undefined') ? PortfolioManager.getProfile() : {};
    var nameInput = document.getElementById('spDisplayName');
    var expSelect = document.getElementById('spExperienceLevel');

    profile.displayName = nameInput ? nameInput.value.trim() : '';
    profile.experienceLevel = expSelect ? expSelect.value : 'beginner';
    profile.tradingStyles = [];
    ['Day', 'Swing', 'Position', 'Scalp'].forEach(function(s) {
      var cb = document.getElementById('spStyle' + s);
      if (cb && cb.checked) profile.tradingStyles.push(s.toLowerCase());
    });
    if (!profile.createdAt) profile.createdAt = Date.now();

    if (typeof PortfolioManager !== 'undefined') PortfolioManager.saveProfile(profile);
    loadProfile();

    // Toast notification
    if (typeof showToast === 'function') showToast('Profile saved', 'success');
  });

  // ---- PORTFOLIO TAB - HOLDINGS ----
  function renderHoldings() {
    var body = document.getElementById('spHoldingsBody');
    if (!body || typeof PortfolioManager === 'undefined') return;
    // Warm the live-quote cache once so this secondary surface shows real prices.
    if (!body._pfQuotesTried && PortfolioManager.refreshQuotes) {
      body._pfQuotesTried = true;
      PortfolioManager.refreshQuotes().then(function() { renderHoldings(); });
    }
    var holdings = PortfolioManager.getHoldings();

    if (holdings.length === 0) {
      body.innerHTML = '<div class="sp-holdings-empty">No positions yet</div>';
      return;
    }

    body.innerHTML = holdings.map(function(h) {
      var pl = h.totalPL;
      var plStr = (pl >= 0 ? '+' : '') + '$' + Math.abs(pl).toFixed(0);
      var plClass = pl >= 0 ? 'profit' : 'loss';
      return '<div class="sp-holdings-row">' +
        '<span class="sp-h-symbol">' + h.symbol + '</span>' +
        '<span>' + h.shares + '</span>' +
        '<span>$' + h.avgCost.toFixed(2) + '</span>' +
        '<span>$' + h.currentPrice.toFixed(2) + '</span>' +
        '<span class="sp-h-pl ' + plClass + '">' + plStr + '</span>' +
        '<button class="sp-h-del" data-symbol="' + h.symbol + '" title="Remove">x</button>' +
        '</div>';
    }).join('');

    // Delete handlers
    body.querySelectorAll('.sp-h-del').forEach(function(btn) {
      btn.addEventListener('click', function() {
        PortfolioManager.removePosition(btn.dataset.symbol);
        renderHoldings();
      });
    });
  }

  document.getElementById('spAddPositionBtn')?.addEventListener('click', function() {
    var symEl = document.getElementById('spAddSymbol');
    var sharesEl = document.getElementById('spAddShares');
    var costEl = document.getElementById('spAddCost');
    if (!symEl || !sharesEl || !costEl) return;

    var sym = symEl.value.trim().toUpperCase();
    var shares = parseFloat(sharesEl.value);
    var cost = parseFloat(costEl.value);
    if (!sym || isNaN(shares) || shares <= 0 || isNaN(cost) || cost <= 0) return;

    if (typeof PortfolioManager !== 'undefined') {
      PortfolioManager.addPosition(sym, shares, cost);
    }
    symEl.value = '';
    sharesEl.value = '';
    costEl.value = '';
    renderHoldings();
  });

  // ---- PORTFOLIO TAB - WATCHLIST ----
  function renderWatchlistChips() {
    var container = document.getElementById('spWatchlistChips');
    if (!container || typeof PortfolioManager === 'undefined') return;
    var list = PortfolioManager.getWatchlist();

    // Also pull from DOM watchlist if PortfolioManager is empty
    if (list.length === 0) {
      document.querySelectorAll('.wl-row[data-ticker]').forEach(function(row) {
        var t = row.dataset.ticker;
        if (t && list.indexOf(t) === -1) list.push(t);
      });
    }

    container.innerHTML = list.map(function(ticker) {
      return '<span class="sp-wl-chip">' + ticker +
        ' <button class="sp-chip-x" data-ticker="' + ticker + '">x</button></span>';
    }).join('');

    container.querySelectorAll('.sp-chip-x').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var ticker = btn.dataset.ticker;
        var wl = PortfolioManager.getWatchlist().filter(function(t) { return t !== ticker; });
        PortfolioManager.saveWatchlist(wl);
        renderWatchlistChips();
      });
    });
  }

  document.getElementById('spAddWatchBtn')?.addEventListener('click', function() {
    var input = document.getElementById('spAddWatchTicker');
    if (!input) return;
    var ticker = input.value.trim().toUpperCase();
    if (!ticker || ticker.length > 6) return;

    if (typeof PortfolioManager !== 'undefined') {
      var wl = PortfolioManager.getWatchlist();
      if (wl.indexOf(ticker) === -1) {
        wl.push(ticker);
        PortfolioManager.saveWatchlist(wl);
      }
    }
    input.value = '';
    renderWatchlistChips();
  });

  // Enter key for watchlist add
  document.getElementById('spAddWatchTicker')?.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('spAddWatchBtn')?.click();
    }
  });

  // Enter key for position add
  document.getElementById('spAddCost')?.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('spAddPositionBtn')?.click();
    }
  });

  // ---- INIT ON OPEN ----
  var panelInitialized = false;
  var origOpen = openPanel;
  openPanel = function() {
    origOpen();
    if (!panelInitialized) {
      panelInitialized = true;
      loadProfile();
      renderHoldings();
      renderWatchlistChips();
    }
  };

  // Re-render holdings when panel is opened
  panel.addEventListener('transitionend', function() {
    if (isOpen) {
      renderHoldings();
      renderWatchlistChips();
    }
  });
})();

/* ============================================
   GREY SANKORE - CAP DATA & TOGGLE + MODAL
   ============================================ */
(function greySankoreCapAndModal() {

var GS_CAP_DATA = {
  large: {
    anomalies: [
      { ticker: 'NVDA', type: 'Volume Anomaly', severity: 'HIGH', desc: 'Options volume 340% above 20-day average. Concentrated in weekly $950 calls with 2 DTE. Possible institutional positioning ahead of earnings.' },
      { ticker: 'AAPL', type: 'Dark Pool Alert', severity: 'MED', desc: 'Significant dark pool prints detected at $228 level. Block trades totaling $180M in last hour suggest institutional accumulation.' },
      { ticker: 'JPM', type: 'Insider Activity', severity: 'LOW', desc: 'CFO filed Form 4 for 25,000 share purchase at $198.50. First insider buy in 8 months.' }
    ],
    values: [
      { ticker: 'DIS', fwdPE: '17.8', vs5y: '-22%', fcfYield: '5.1%', score: 82, conviction: 'High' },
      { ticker: 'PYPL', fwdPE: '14.2', vs5y: '-38%', fcfYield: '6.8%', score: 79, conviction: 'High' },
      { ticker: 'JNJ', fwdPE: '14.5', vs5y: '-12%', fcfYield: '4.2%', score: 71, conviction: 'Med' },
      { ticker: 'INTC', fwdPE: '22.1', vs5y: '-45%', fcfYield: '2.1%', score: 65, conviction: 'Med' },
      { ticker: 'BMY', fwdPE: '7.8', vs5y: '-35%', fcfYield: '9.2%', score: 88, conviction: 'High' }
    ],
    momentum: 5
  },
  mid: {
    anomalies: [
      { ticker: 'PLTR', type: 'Momentum Breakout', severity: 'HIGH', desc: 'Broke out of 3-month consolidation on 4x average volume. RSI divergence confirmed. Government contract pipeline expanding.' },
      { ticker: 'COIN', type: 'Options Sweep', severity: 'MED', desc: 'Aggressive call sweeps at ask in April $280 strikes. Premium spent: $12M in 30 minutes. Crypto correlation trade.' },
      { ticker: 'NET', type: 'Earnings Anomaly', severity: 'LOW', desc: 'Implied volatility 85th percentile ahead of earnings. Historical post-earnings move averages 12%. Current straddle pricing 15% move.' }
    ],
    values: [
      { ticker: 'SNAP', fwdPE: '28.4', vs5y: '-52%', fcfYield: '3.2%', score: 68, conviction: 'Med' },
      { ticker: 'PINS', fwdPE: '19.1', vs5y: '-30%', fcfYield: '5.5%', score: 76, conviction: 'High' },
      { ticker: 'HOOD', fwdPE: '16.8', vs5y: 'N/A', fcfYield: '4.1%', score: 62, conviction: 'Low' },
      { ticker: 'DKNG', fwdPE: '32.5', vs5y: '-28%', fcfYield: '1.8%', score: 58, conviction: 'Low' },
      { ticker: 'ABNB', fwdPE: '22.3', vs5y: '-18%', fcfYield: '6.2%', score: 74, conviction: 'Med' }
    ],
    momentum: 3
  },
  small: {
    anomalies: [
      { ticker: 'IONQ', type: 'Short Squeeze Setup', severity: 'HIGH', desc: 'Short interest at 28% of float. Cost to borrow spiked 400%. Days to cover: 5.2. Quantum computing catalyst approaching.' },
      { ticker: 'SOFI', type: 'Institutional Accumulation', severity: 'MED', desc: 'Three major funds added positions in last 13F filing. Combined new ownership: 8.2M shares. Bank charter monetization thesis.' },
      { ticker: 'PATH', type: 'Technical Reversal', severity: 'LOW', desc: 'Weekly RSI divergence at 52-week low. Inside week candle forming. AI automation spending cycle approaching.' }
    ],
    values: [
      { ticker: 'SOFI', fwdPE: '24.5', vs5y: 'N/A', fcfYield: '2.8%', score: 64, conviction: 'Med' },
      { ticker: 'AI', fwdPE: '35.2', vs5y: 'N/A', fcfYield: '1.2%', score: 55, conviction: 'Low' },
      { ticker: 'RIVN', fwdPE: 'N/A', vs5y: 'N/A', fcfYield: '-8.5%', score: 42, conviction: 'Low' },
      { ticker: 'OPEN', fwdPE: 'N/A', vs5y: 'N/A', fcfYield: '-2.1%', score: 38, conviction: 'Low' },
      { ticker: 'MARA', fwdPE: '8.5', vs5y: 'N/A', fcfYield: '12.1%', score: 72, conviction: 'Med' }
    ],
    momentum: 4
  },
  micro: {
    anomalies: [
      { ticker: 'SOUN', type: 'Volume Spike', severity: 'HIGH', desc: 'Volume 800% above average with no news catalyst. Float rotation detected. Voice AI sector momentum building.' },
      { ticker: 'RKLB', type: 'Contract Award', severity: 'MED', desc: 'New NASA contract rumored per industry sources. Prior contract wins led to 20-40% moves. Low float amplifies moves.' },
      { ticker: 'LUNR', type: 'Catalyst Approaching', severity: 'LOW', desc: 'Next lunar mission window in 6 weeks. Historical pattern shows 30-60 day pre-mission accumulation phase.' }
    ],
    values: [
      { ticker: 'BBAI', fwdPE: '15.2', vs5y: 'N/A', fcfYield: '3.5%', score: 61, conviction: 'Med' },
      { ticker: 'SOUN', fwdPE: '45.0', vs5y: 'N/A', fcfYield: '-5.2%', score: 48, conviction: 'Low' },
      { ticker: 'RKLB', fwdPE: '85.0', vs5y: 'N/A', fcfYield: '-3.8%', score: 52, conviction: 'Low' },
      { ticker: 'ASTS', fwdPE: 'N/A', vs5y: 'N/A', fcfYield: '-12%', score: 35, conviction: 'Low' },
      { ticker: 'GSAT', fwdPE: '42.0', vs5y: 'N/A', fcfYield: '0.5%', score: 44, conviction: 'Low' }
    ],
    momentum: 6
  }
};

var GS_TICKER_ANALYSIS = {
  NVDA: { name: 'NVIDIA Corporation', price: '$924.80', change: '+3.14%', changeClass: 'profit', bull: ['Data center revenue accelerating with H100/H200 cycle, $26B+ quarterly run rate', 'Sovereign AI spending creating new demand vertical, 15+ countries building GPU clusters', 'Software/CUDA moat deepening with enterprise AI adoption curve still early innings'], bear: ['Valuation at 35x forward earnings assumes perfect execution for 3+ years', 'China export restrictions limit addressable market by ~$8B annually', 'AMD MI300X gaining traction with hyperscalers on price-performance ratio'], risks: [{ level: 'high', text: 'Concentration risk: Top 4 customers are 40%+ of data center revenue' }, { level: 'med', text: 'Supply chain: TSMC dependency for CoWoS packaging' }, { level: 'low', text: 'Regulatory: Potential antitrust scrutiny on CUDA lock-in' }], technicals: { support: '$880', resistance: '$960', rsi: '62.4', macd: 'Bullish', ma50: '$892', ma200: '$745' }, catalysts: [{ date: 'Mar 18', desc: 'GTC Keynote - New Blackwell architecture details' }, { date: 'May 22', desc: 'Q1 FY2026 Earnings Release' }, { date: 'Jun 10', desc: 'Computex 2026 - Next-gen roadmap' }], valuation: { fwdPE: '34.8x', evEbitda: '42.1x', peg: '1.2x', fcfYield: '2.8%', revGrowth: '+94%', margin: '72.5%' } },
  AAPL: { name: 'Apple Inc.', price: '$228.30', change: '+0.45%', changeClass: 'profit', bull: ['Services revenue hitting $100B annual run rate with 75%+ margins', 'Apple Intelligence creating upgrade super-cycle for iPhone 16/17', 'Vision Pro enterprise adoption accelerating in healthcare and manufacturing'], bear: ['iPhone unit growth flat, hardware commoditization pressure increasing', 'China market share declining as Huawei resurges with domestic chips', 'AI features lagging competitors, Siri still perceived as inferior'], risks: [{ level: 'med', text: 'Regulatory: EU DMA forcing sideloading, App Store fee compression' }, { level: 'med', text: 'Geopolitical: China supply chain and market access risk' }, { level: 'low', text: 'Competition: Foldables and AI-first devices from Samsung/Google' }], technicals: { support: '$220', resistance: '$235', rsi: '55.1', macd: 'Neutral', ma50: '$225', ma200: '$210' }, catalysts: [{ date: 'Jun 9', desc: 'WWDC 2026 - iOS 20 + Apple Intelligence v2' }, { date: 'Jul 31', desc: 'Q3 FY2026 Earnings' }, { date: 'Sep 10', desc: 'iPhone 17 launch event (expected)' }], valuation: { fwdPE: '28.5x', evEbitda: '24.2x', peg: '2.8x', fcfYield: '3.5%', revGrowth: '+8%', margin: '46.2%' } },
  JPM: { name: 'JPMorgan Chase & Co.', price: '$198.50', change: '-0.32%', changeClass: 'loss', bull: ['Net interest income benefiting from higher-for-longer rate environment', 'Investment banking pipeline recovering strongly, ECM and DCM both up 30%+', 'Jamie Dimon succession planning indicates institutional stability'], bear: ['Commercial real estate exposure of $170B+ with office vacancy at record highs', 'Credit card delinquencies ticking up, consumer spending deceleration', 'Regulatory capital requirements (Basel III endgame) could compress ROE'], risks: [{ level: 'med', text: 'CRE exposure: Office and multifamily loan concentration' }, { level: 'low', text: 'Regulatory: Higher capital requirements reducing buyback capacity' }, { level: 'low', text: 'Credit cycle: Consumer delinquency normalization' }], technicals: { support: '$190', resistance: '$205', rsi: '48.7', macd: 'Bearish', ma50: '$195', ma200: '$178' }, catalysts: [{ date: 'Apr 11', desc: 'Q1 2026 Earnings - First to report among banks' }, { date: 'May 20', desc: 'Annual Investor Day' }, { date: 'Jun 26', desc: 'Fed stress test results' }], valuation: { fwdPE: '11.2x', evEbitda: 'N/A', peg: '1.5x', fcfYield: '4.8%', revGrowth: '+12%', margin: '38.1%' } },
  DIS: { name: 'The Walt Disney Company', price: '$112.40', change: '+1.82%', changeClass: 'profit', bull: ['Streaming profitability inflection with Disney+ turning profitable in Q4', 'Parks & Experiences generating record revenue with pricing power intact', 'Content slate strongest in years with Marvel/Star Wars reset working'], bear: ['Linear TV decline accelerating, ESPN standalone timing uncertain', 'Box office inconsistency creating lumpy earnings', 'Succession uncertainty post-Iger creating strategic overhang'], risks: [{ level: 'med', text: 'Content spending: $30B+ annual commitment with uncertain ROI' }, { level: 'med', text: 'Cord-cutting: Linear networks declining 10%+ annually' }, { level: 'low', text: 'Consumer discretionary: Parks vulnerable to recession' }], technicals: { support: '$105', resistance: '$120', rsi: '58.3', macd: 'Bullish', ma50: '$108', ma200: '$98' }, catalysts: [{ date: 'May 7', desc: 'Q2 FY2026 Earnings' }, { date: 'Aug 1', desc: 'ESPN standalone streaming launch (expected)' }, { date: 'Nov 15', desc: 'Moana 2 sequel release' }], valuation: { fwdPE: '17.8x', evEbitda: '12.5x', peg: '1.1x', fcfYield: '5.1%', revGrowth: '+6%', margin: '14.8%' } },
  PYPL: { name: 'PayPal Holdings Inc.', price: '$72.80', change: '+2.15%', changeClass: 'profit', bull: ['Fastlane checkout seeing 80% conversion rates, enterprise adoption scaling', 'Venmo monetization inflection with $68B TPV and business profiles growing 50%', 'New CEO Alex Chriss executing well, cost discipline improving margins'], bear: ['Apple Pay and Google Pay taking share in tap-to-pay at point of sale', 'Unbranded processing growth masking branded checkout decline', 'Take rate compression as merchants gain negotiating leverage'], risks: [{ level: 'med', text: 'Competition: Apple, Stripe, Adyen all gaining checkout share' }, { level: 'low', text: 'Regulatory: CFPB BNPL rules could impact PayPal Credit' }, { level: 'low', text: 'Macro: Cross-border volumes sensitive to trade disruption' }], technicals: { support: '$67', resistance: '$78', rsi: '61.2', macd: 'Bullish', ma50: '$70', ma200: '$62' }, catalysts: [{ date: 'Apr 29', desc: 'Q1 2026 Earnings' }, { date: 'May 15', desc: 'Investor Day - Updated strategy rollout' }, { date: 'Jul 30', desc: 'Q2 2026 Earnings' }], valuation: { fwdPE: '14.2x', evEbitda: '10.8x', peg: '0.9x', fcfYield: '6.8%', revGrowth: '+10%', margin: '15.5%' } },
  JNJ: { name: 'Johnson & Johnson', price: '$158.20', change: '-0.18%', changeClass: 'loss', bull: ['MedTech segment growing 7%+ with robotic surgery and orthopedics', 'Innovative Medicine pipeline with 20+ Phase III readouts through 2026', 'Post-Kenvue separation provides clean pharma/medtech pure-play'], bear: ['Talc litigation overhang with $9B+ potential settlement', 'Stelara biosimilar erosion beginning in 2025, $20B revenue at risk', 'Patent cliff: Key drug patents expiring 2025-2028'], risks: [{ level: 'high', text: 'Litigation: Talc/mesothelioma liability estimate ranges $6-12B' }, { level: 'med', text: 'Patent cliff: Stelara, Tremfya, Darzalex exposure' }, { level: 'low', text: 'Pricing: Medicare drug negotiation reducing future revenue' }], technicals: { support: '$152', resistance: '$164', rsi: '44.8', macd: 'Neutral', ma50: '$157', ma200: '$155' }, catalysts: [{ date: 'Apr 15', desc: 'Q1 2026 Earnings' }, { date: 'Jun 1', desc: 'ASCO - Oncology pipeline data' }, { date: 'Sep 30', desc: 'Talc settlement court ruling (expected)' }], valuation: { fwdPE: '14.5x', evEbitda: '13.1x', peg: '2.4x', fcfYield: '4.2%', revGrowth: '+4%', margin: '22.8%' } },
  INTC: { name: 'Intel Corporation', price: '$31.20', change: '+4.52%', changeClass: 'profit', bull: ['18A process node on track, early customer tape-outs showing competitive results', 'CHIPS Act funding of $8.5B de-risks domestic fab build-out', 'Foundry business could unlock massive value if external customers scale'], bear: ['Data center market share still declining to AMD and ARM-based chips', 'Foundry business burning cash with 2-3 year timeline to profitability', 'PC market recovery slower than expected, AI PC adoption uncertain'], risks: [{ level: 'high', text: 'Execution: 18A node must hit yield targets on time' }, { level: 'med', text: 'Cash burn: $25B+ annual capex with negative FCF' }, { level: 'med', text: 'Competition: TSMC 2nm, Samsung, AMD all advancing' }], technicals: { support: '$28', resistance: '$35', rsi: '67.8', macd: 'Bullish', ma50: '$29', ma200: '$34' }, catalysts: [{ date: 'Apr 24', desc: 'Q1 2026 Earnings' }, { date: 'Jun 15', desc: '18A production milestone update' }, { date: 'Sep 18', desc: 'Innovation Day - Foundry customer announcements' }], valuation: { fwdPE: '22.1x', evEbitda: '15.8x', peg: 'N/A', fcfYield: '2.1%', revGrowth: '-2%', margin: '18.5%' } },
  BMY: { name: 'Bristol-Myers Squibb Co.', price: '$52.40', change: '+0.96%', changeClass: 'profit', bull: ['Karuna acquisition adds $4B+ peak sales potential with KarXT', 'Opdivo franchise still growing with first-line combinations', 'FCF yield of 9.2% with aggressive buyback program'], bear: ['Revlimid/Eliquis patent cliffs creating $20B+ revenue gap', 'Integration execution risk with Karuna and recent M&A spree', 'Pipeline must deliver multiple blockbusters simultaneously'], risks: [{ level: 'high', text: 'Patent cliff: Eliquis ($12B) losing exclusivity 2026-2028' }, { level: 'med', text: 'Pipeline: KarXT regulatory path and launch execution' }, { level: 'low', text: 'Pricing: IRA drug negotiation on Eliquis' }], technicals: { support: '$48', resistance: '$56', rsi: '54.2', macd: 'Neutral', ma50: '$51', ma200: '$49' }, catalysts: [{ date: 'Apr 24', desc: 'Q1 2026 Earnings' }, { date: 'Jun 5', desc: 'ASCO - Oncology data presentations' }, { date: 'Sep 26', desc: 'KarXT PDUFA date (expected)' }], valuation: { fwdPE: '7.8x', evEbitda: '8.2x', peg: '0.6x', fcfYield: '9.2%', revGrowth: '-5%', margin: '24.1%' } },
  PLTR: { name: 'Palantir Technologies Inc.', price: '$24.80', change: '+5.21%', changeClass: 'profit', bull: ['AIP platform driving commercial revenue acceleration, 30%+ growth', 'Government contract wins expanding with defense budget increases', 'AI/ML platform becoming mission-critical for enterprise decision-making'], bear: ['Valuation stretched at 80x+ forward earnings for a 25% grower', 'Stock-based compensation diluting shareholders by 5%+ annually', 'Government revenue lumpy with contract timing uncertainty'], risks: [{ level: 'high', text: 'Valuation: Multiple compression risk if growth decelerates' }, { level: 'med', text: 'SBC: Stock-based comp running at 22% of revenue' }, { level: 'low', text: 'Concentration: Top 20 customers are 50%+ of revenue' }], technicals: { support: '$22', resistance: '$27', rsi: '71.3', macd: 'Bullish', ma50: '$23', ma200: '$18' }, catalysts: [{ date: 'May 5', desc: 'Q1 2026 Earnings' }, { date: 'Jun 20', desc: 'Army TITAN contract decision' }, { date: 'Aug 4', desc: 'Q2 2026 Earnings' }], valuation: { fwdPE: '82.5x', evEbitda: '65.0x', peg: '3.3x', fcfYield: '1.5%', revGrowth: '+28%', margin: '22.1%' } },
  COIN: { name: 'Coinbase Global Inc.', price: '$265.40', change: '+3.87%', changeClass: 'profit', bull: ['Crypto regulatory clarity improving, ETF approvals driving institutional adoption', 'Base L2 network generating growing fee revenue from on-chain activity', 'Subscription and services revenue providing more stable revenue mix'], bear: ['Trading revenue still 60%+ of total, highly correlated to crypto prices', 'SEC enforcement actions creating ongoing legal uncertainty', 'Competition from decentralized exchanges eroding retail share'], risks: [{ level: 'high', text: 'Crypto correlation: Revenue drops 40-60% in bear markets' }, { level: 'med', text: 'Regulatory: SEC Wells notice and ongoing enforcement' }, { level: 'low', text: 'Competition: DEX volume growing faster than CEX' }], technicals: { support: '$240', resistance: '$285', rsi: '64.5', macd: 'Bullish', ma50: '$255', ma200: '$195' }, catalysts: [{ date: 'May 8', desc: 'Q1 2026 Earnings' }, { date: 'Jun 15', desc: 'Crypto regulatory framework vote (expected)' }, { date: 'Jul 1', desc: 'Base network major protocol upgrade' }], valuation: { fwdPE: '22.8x', evEbitda: '18.5x', peg: '1.2x', fcfYield: '4.5%', revGrowth: '+35%', margin: '28.3%' } },
  NET: { name: 'Cloudflare Inc.', price: '$92.10', change: '-1.15%', changeClass: 'loss', bull: ['Workers AI platform positioning for edge-AI computing market', 'Net dollar retention at 115%, enterprise customers growing 30%+', 'Zero Trust security becoming default architecture for enterprises'], bear: ['Still not profitable on GAAP basis, path to profitability uncertain', 'Competing against AWS, Azure, and Google on compute is capital-intensive', 'SBC running at 18% of revenue, diluting shareholders'], risks: [{ level: 'med', text: 'Profitability: GAAP losses persisting despite revenue scale' }, { level: 'med', text: 'Competition: Hyperscalers bundling CDN/security' }, { level: 'low', text: 'Geopolitical: Russia/China blocking raises market access questions' }], technicals: { support: '$85', resistance: '$98', rsi: '45.2', macd: 'Bearish', ma50: '$95', ma200: '$82' }, catalysts: [{ date: 'May 1', desc: 'Q1 2026 Earnings' }, { date: 'Jun 12', desc: 'Developer Week - Workers AI updates' }, { date: 'Sep 28', desc: 'Birthday Week - Major product launches' }], valuation: { fwdPE: '85.0x', evEbitda: '55.0x', peg: '2.8x', fcfYield: '1.2%', revGrowth: '+30%', margin: '5.2%' } },
  SNAP: { name: 'Snap Inc.', price: '$14.20', change: '+1.43%', changeClass: 'profit', bull: ['AR/ML advertising improving ROI metrics for advertisers', 'Snapchat+ subscription hitting 7M+ paying users', 'Gen Z engagement still strongest among social platforms'], bear: ['Revenue growth decelerating as TikTok and Reels take ad dollars', 'ARPU still well below Meta and Google levels', 'Dual-class share structure limits governance accountability'], risks: [{ level: 'med', text: 'Competition: TikTok and Instagram Reels dominating short-form video' }, { level: 'med', text: 'Monetization: ARPU gap vs. Meta is 5-8x' }, { level: 'low', text: 'Governance: Evan Spiegel super-voting control' }], technicals: { support: '$12', resistance: '$16', rsi: '56.8', macd: 'Neutral', ma50: '$13.50', ma200: '$12' }, catalysts: [{ date: 'Apr 22', desc: 'Q1 2026 Earnings' }, { date: 'May 15', desc: 'Snap Partner Summit - AR glasses update' }, { date: 'Jul 23', desc: 'Q2 2026 Earnings' }], valuation: { fwdPE: '28.4x', evEbitda: '22.0x', peg: '2.1x', fcfYield: '3.2%', revGrowth: '+14%', margin: '8.5%' } },
  PINS: { name: 'Pinterest Inc.', price: '$38.60', change: '+0.78%', changeClass: 'profit', bull: ['Shopping ads showing strong conversion rates, ROAS improving', 'International monetization still in early innings, ARPU 10x gap vs US', 'AI-powered visual search driving engagement and commercial intent'], bear: ['User growth plateauing in developed markets', 'Amazon, Google Shopping taking share of product discovery', 'CEO transition created strategic uncertainty'], risks: [{ level: 'low', text: 'Competition: Google Lens and Amazon visual search improving' }, { level: 'low', text: 'Growth: MAU growth dependent on international markets' }, { level: 'low', text: 'Monetization: Ad load increases may hurt engagement' }], technicals: { support: '$35', resistance: '$42', rsi: '58.1', macd: 'Bullish', ma50: '$37', ma200: '$32' }, catalysts: [{ date: 'Apr 28', desc: 'Q1 2026 Earnings' }, { date: 'Jun 5', desc: 'Pinterest Presents - Advertiser summit' }, { date: 'Jul 28', desc: 'Q2 2026 Earnings' }], valuation: { fwdPE: '19.1x', evEbitda: '15.2x', peg: '1.1x', fcfYield: '5.5%', revGrowth: '+18%', margin: '16.8%' } },
  HOOD: { name: 'Robinhood Markets Inc.', price: '$18.90', change: '+2.72%', changeClass: 'profit', bull: ['Gold subscription driving recurring revenue with 1.5M+ subscribers', 'Crypto trading revenue surging with Bitcoin ETF and alt-season', '24-hour trading and credit card expanding TAM significantly'], bear: ['PFOF under regulatory scrutiny, could lose 50%+ of equities revenue', 'Customer base skews young with lower account balances', 'Market downturn would severely impact trading volumes'], risks: [{ level: 'high', text: 'Regulatory: PFOF ban would eliminate core revenue stream' }, { level: 'med', text: 'Market sensitivity: Revenue drops 40%+ in bear markets' }, { level: 'low', text: 'Competition: Schwab/Fidelity targeting younger investors' }], technicals: { support: '$16', resistance: '$21', rsi: '63.4', macd: 'Bullish', ma50: '$17', ma200: '$14' }, catalysts: [{ date: 'Apr 30', desc: 'Q1 2026 Earnings' }, { date: 'May 20', desc: 'Annual shareholder meeting' }, { date: 'Jul 30', desc: 'Q2 2026 Earnings' }], valuation: { fwdPE: '16.8x', evEbitda: '12.5x', peg: '0.8x', fcfYield: '4.1%', revGrowth: '+22%', margin: '18.2%' } },
  DKNG: { name: 'DraftKings Inc.', price: '$42.50', change: '-0.47%', changeClass: 'loss', bull: ['State legalization pipeline expanding TAM with 5+ states pending', 'iGaming launch states showing strong hold rates and ARPU', 'Promotional efficiency improving, path to sustained profitability'], bear: ['Tax rate increases in key states squeezing margins', 'Customer acquisition costs rising as market matures', 'FanDuel (Flutter) still has market share lead in most states'], risks: [{ level: 'med', text: 'Regulatory: State tax rate increases (NY at 51%, IL raising)' }, { level: 'med', text: 'Competition: FanDuel, BetMGM, ESPN BET all scaling' }, { level: 'low', text: 'Macro: Consumer discretionary spending sensitivity' }], technicals: { support: '$38', resistance: '$46', rsi: '47.5', macd: 'Neutral', ma50: '$41', ma200: '$35' }, catalysts: [{ date: 'May 2', desc: 'Q1 2026 Earnings' }, { date: 'Sep 1', desc: 'NFL season start - peak engagement' }, { date: 'Nov 1', desc: 'State election results - legalization votes' }], valuation: { fwdPE: '32.5x', evEbitda: '25.0x', peg: '1.8x', fcfYield: '1.8%', revGrowth: '+28%', margin: '5.2%' } },
  ABNB: { name: 'Airbnb Inc.', price: '$152.30', change: '+1.05%', changeClass: 'profit', bull: ['Long-term stays (28+ nights) now 20%+ of bookings, higher margin', 'Experience platform expansion into activities and services', 'Supply growth outpacing demand in key markets, improving quality'], bear: ['Regulatory crackdowns in major cities limiting host supply', 'Hotel chains fighting back with loyalty programs and price matching', 'Take rate optimization reaching ceiling, growth must come from volume'], risks: [{ level: 'med', text: 'Regulatory: NYC, Barcelona, Paris restricting short-term rentals' }, { level: 'low', text: 'Competition: Booking.com and Vrbo improving alternative stays' }, { level: 'low', text: 'Macro: Travel demand normalization post-COVID surge' }], technicals: { support: '$142', resistance: '$160', rsi: '55.8', macd: 'Neutral', ma50: '$148', ma200: '$138' }, catalysts: [{ date: 'May 6', desc: 'Q1 2026 Earnings' }, { date: 'May 15', desc: 'Summer product launch event' }, { date: 'Aug 5', desc: 'Q2 2026 Earnings - Summer travel data' }], valuation: { fwdPE: '22.3x', evEbitda: '18.8x', peg: '1.5x', fcfYield: '6.2%', revGrowth: '+14%', margin: '35.2%' } },
  IONQ: { name: 'IonQ Inc.', price: '$12.40', change: '+8.77%', changeClass: 'profit', bull: ['Trapped-ion approach showing highest qubit fidelity among public quantum companies', 'Enterprise contracts growing with $28M+ bookings in latest quarter', 'Partnership with major cloud providers (AWS, Azure, GCP) driving adoption'], bear: ['Revenue under $30M annually, years from meaningful commercialization', 'Quantum computing timeline constantly pushed back by industry', 'Cash burn rate suggests need for additional capital raises'], risks: [{ level: 'high', text: 'Technology: Quantum error correction still unsolved at scale' }, { level: 'high', text: 'Cash burn: $50M+ annual burn with <$30M revenue' }, { level: 'med', text: 'Competition: IBM, Google, Quantinuum all advancing rapidly' }], technicals: { support: '$10', resistance: '$15', rsi: '72.8', macd: 'Bullish', ma50: '$11', ma200: '$9' }, catalysts: [{ date: 'May 8', desc: 'Q1 2026 Earnings' }, { date: 'Jun 20', desc: 'Quantum algorithm benchmark results' }, { date: 'Sep 15', desc: 'New system launch (Forte 2)' }], valuation: { fwdPE: 'N/A', evEbitda: 'N/A', peg: 'N/A', fcfYield: '-15.2%', revGrowth: '+85%', margin: '-180%' } },
  SOFI: { name: 'SoFi Technologies Inc.', price: '$9.80', change: '+3.16%', changeClass: 'profit', bull: ['Bank charter enabling deposit gathering at scale, NIM expanding', 'Lending platform segment (Galileo/Technisys) growing 30%+ B2B', 'Student loan restart driving refi volumes higher'], bear: ['Credit quality concerns as personal loans season', 'Stock-based comp dilution remains elevated', 'Competition from established banks entering digital-first products'], risks: [{ level: 'med', text: 'Credit risk: Personal loan book seasoning in uncertain macro' }, { level: 'med', text: 'Regulatory: Consumer lending under CFPB scrutiny' }, { level: 'low', text: 'Competition: Traditional banks launching digital products' }], technicals: { support: '$8.50', resistance: '$11', rsi: '62.1', macd: 'Bullish', ma50: '$9.20', ma200: '$8' }, catalysts: [{ date: 'Apr 28', desc: 'Q1 2026 Earnings' }, { date: 'Jun 1', desc: 'Auto loan product expansion launch' }, { date: 'Jul 28', desc: 'Q2 2026 Earnings' }], valuation: { fwdPE: '24.5x', evEbitda: '18.0x', peg: '1.2x', fcfYield: '2.8%', revGrowth: '+32%', margin: '12.5%' } },
  AI: { name: 'C3.ai Inc.', price: '$28.50', change: '+2.15%', changeClass: 'profit', bull: ['Enterprise AI platform adoption accelerating with consumption-based pricing', 'Federal/defense contracts providing stable revenue base', 'Generative AI tailwind driving pipeline growth'], bear: ['Still not profitable, consumption model creates revenue unpredictability', 'Competition from hyperscalers (Azure AI, AWS SageMaker) intensifying', 'Tom Siebel concentration risk on founder-CEO'], risks: [{ level: 'high', text: 'Competition: Hyperscalers offering bundled AI at lower cost' }, { level: 'med', text: 'Profitability: FCF negative, needs revenue acceleration' }, { level: 'low', text: 'Governance: Founder control of voting shares' }], technicals: { support: '$25', resistance: '$32', rsi: '58.4', macd: 'Neutral', ma50: '$27', ma200: '$24' }, catalysts: [{ date: 'May 28', desc: 'Q4 FY2026 Earnings' }, { date: 'Jun 10', desc: 'AI summit - New product demos' }, { date: 'Aug 28', desc: 'Q1 FY2027 Earnings' }], valuation: { fwdPE: '35.2x', evEbitda: 'N/A', peg: 'N/A', fcfYield: '1.2%', revGrowth: '+22%', margin: '-12%' } },
  RIVN: { name: 'Rivian Automotive Inc.', price: '$14.20', change: '-2.07%', changeClass: 'loss', bull: ['R2 platform targeting mass market at $45K, production start 2026', 'Amazon delivery van orders providing visible revenue floor', 'VW joint venture de-risks software and capital needs'], bear: ['Burning $1.5B+ quarterly cash with no clear path to breakeven', 'EV demand softening as incentives expire and competition rises', 'R1 pricing under pressure from Tesla Model X/Y competition'], risks: [{ level: 'high', text: 'Cash burn: $6B+ annual burn, needs continued capital raises' }, { level: 'high', text: 'Demand: EV market saturation in premium segment' }, { level: 'med', text: 'Execution: R2 launch ramp is critical and unproven' }], technicals: { support: '$12', resistance: '$17', rsi: '38.5', macd: 'Bearish', ma50: '$15', ma200: '$18' }, catalysts: [{ date: 'May 6', desc: 'Q1 2026 Earnings + delivery numbers' }, { date: 'Jul 1', desc: 'R2 Normal, IL factory prep update' }, { date: 'Aug 6', desc: 'Q2 2026 Earnings' }], valuation: { fwdPE: 'N/A', evEbitda: 'N/A', peg: 'N/A', fcfYield: '-8.5%', revGrowth: '+68%', margin: '-42%' } },
  OPEN: { name: 'Opendoor Technologies Inc.', price: '$3.40', change: '-1.16%', changeClass: 'loss', bull: ['Housing market recovery could drive massive volume increase', 'Operational efficiency improving with lower spread targets', 'Category creator in iBuying with improving unit economics'], bear: ['Housing market remains frozen with high mortgage rates', 'iBuying model unproven through full market cycles', 'Cash constraints limit ability to hold inventory in downturn'], risks: [{ level: 'high', text: 'Housing market: High rates keeping transaction volumes depressed' }, { level: 'high', text: 'Model risk: iBuying untested through severe downturns' }, { level: 'med', text: 'Cash: Liquidity risk if housing prices decline further' }], technicals: { support: '$2.80', resistance: '$4.20', rsi: '41.2', macd: 'Bearish', ma50: '$3.60', ma200: '$4.10' }, catalysts: [{ date: 'May 1', desc: 'Q1 2026 Earnings' }, { date: 'Jun 18', desc: 'Fed rate decision - housing impact' }, { date: 'Aug 1', desc: 'Q2 2026 Earnings + summer housing data' }], valuation: { fwdPE: 'N/A', evEbitda: 'N/A', peg: 'N/A', fcfYield: '-2.1%', revGrowth: '+12%', margin: '-8.5%' } },
  MARA: { name: 'Marathon Digital Holdings', price: '$22.80', change: '+6.54%', changeClass: 'profit', bull: ['Largest public Bitcoin miner by hash rate, economies of scale', 'Bitcoin halving cycle historically drives 10x+ price appreciation', 'Energy portfolio diversifying into renewables and energy harvesting'], bear: ['Revenue 95%+ correlated to Bitcoin price, zero diversification', 'Post-halving mining economics squeeze, breakeven ~$45K BTC', 'Dilution risk from at-the-market offerings to fund expansion'], risks: [{ level: 'high', text: 'Bitcoin price: Revenue collapse if BTC drops below $45K' }, { level: 'med', text: 'Energy costs: Power contracts subject to rate increases' }, { level: 'med', text: 'Dilution: Frequent ATM offerings to fund growth' }], technicals: { support: '$18', resistance: '$26', rsi: '68.5', macd: 'Bullish', ma50: '$20', ma200: '$16' }, catalysts: [{ date: 'May 8', desc: 'Q1 2026 Earnings + mining metrics' }, { date: 'Jun 1', desc: 'Hash rate expansion milestone' }, { date: 'Aug 8', desc: 'Q2 2026 Earnings' }], valuation: { fwdPE: '8.5x', evEbitda: '6.2x', peg: '0.3x', fcfYield: '12.1%', revGrowth: '+120%', margin: '45.2%' } },
  PATH: { name: 'UiPath Inc.', price: '$13.60', change: '-0.73%', changeClass: 'loss', bull: ['Enterprise automation platform with strong installed base of 10K+ customers', 'AI-powered automation creating new use cases and upsell opportunities', 'New CEO executing cost discipline, margins improving'], bear: ['Growth decelerating to mid-teens as automation market matures', 'Microsoft Power Automate bundled for free threatens SMB segment', 'Leadership transitions creating strategic uncertainty'], risks: [{ level: 'med', text: 'Competition: Microsoft Power Automate and ServiceNow Workflow' }, { level: 'med', text: 'Growth: Revenue growth slowing from 30%+ to 15%' }, { level: 'low', text: 'Execution: CEO transition and strategy pivot risk' }], technicals: { support: '$12', resistance: '$15.50', rsi: '42.3', macd: 'Bearish', ma50: '$14', ma200: '$16' }, catalysts: [{ date: 'May 22', desc: 'Q1 FY2027 Earnings' }, { date: 'Jun 15', desc: 'Forward Summit - Product announcements' }, { date: 'Aug 22', desc: 'Q2 FY2027 Earnings' }], valuation: { fwdPE: '28.5x', evEbitda: '22.0x', peg: '2.0x', fcfYield: '4.5%', revGrowth: '+14%', margin: '12.8%' } },
  SOUN: { name: 'SoundHound AI Inc.', price: '$6.80', change: '+12.40%', changeClass: 'profit', bull: ['Voice AI platform gaining enterprise traction in auto and restaurant verticals', 'Proprietary speech-to-meaning technology is differentiated vs. commodity ASR', 'Expanding TAM as voice commerce and AI assistants grow'], bear: ['Revenue under $50M with no clear path to profitability', 'Competition from Amazon Alexa, Google Assistant at much larger scale', 'Key customer concentration risk (Hyundai is ~30% of revenue)'], risks: [{ level: 'high', text: 'Scale: Revenue too small to sustain independent R&D investment' }, { level: 'high', text: 'Concentration: Top 3 customers are 60%+ of revenue' }, { level: 'med', text: 'Competition: Big Tech AI assistants bundled at zero cost' }], technicals: { support: '$5', resistance: '$8', rsi: '74.2', macd: 'Bullish', ma50: '$5.80', ma200: '$4.50' }, catalysts: [{ date: 'May 9', desc: 'Q1 2026 Earnings' }, { date: 'Jun 20', desc: 'New OEM partnership announcement (rumored)' }, { date: 'Aug 9', desc: 'Q2 2026 Earnings' }], valuation: { fwdPE: '45.0x', evEbitda: 'N/A', peg: 'N/A', fcfYield: '-5.2%', revGrowth: '+55%', margin: '-65%' } },
  RKLB: { name: 'Rocket Lab USA Inc.', price: '$8.20', change: '+4.46%', changeClass: 'profit', bull: ['Neutron rocket development on track, opens medium-lift market', 'Space Systems segment growing 50%+ with satellite bus and component sales', 'Electron rocket reliability at 95%+, dominant in small-launch segment'], bear: ['Neutron development consuming $150M+ annually with execution risk', 'SpaceX Falcon 9 rideshare pricing undercuts dedicated small launch', 'Unprofitable with negative FCF, capital intensive business model'], risks: [{ level: 'high', text: 'Execution: Neutron must succeed to justify valuation' }, { level: 'med', text: 'Competition: SpaceX rideshare and Starship disruption' }, { level: 'med', text: 'Capital: Continued cash burn requiring dilutive financing' }], technicals: { support: '$7', resistance: '$9.50', rsi: '66.8', macd: 'Bullish', ma50: '$7.50', ma200: '$6' }, catalysts: [{ date: 'May 12', desc: 'Q1 2026 Earnings' }, { date: 'Jun 30', desc: 'Neutron progress update / hot fire test' }, { date: 'Aug 12', desc: 'Q2 2026 Earnings + launch manifest' }], valuation: { fwdPE: '85.0x', evEbitda: 'N/A', peg: 'N/A', fcfYield: '-3.8%', revGrowth: '+42%', margin: '-28%' } },
  LUNR: { name: 'Intuitive Machines Inc.', price: '$7.40', change: '+2.07%', changeClass: 'profit', bull: ['Only company to successfully land on the Moon commercially (Odysseus)', 'NASA CLPS contracts worth $300M+ in backlog', 'Lunar infrastructure services creating recurring revenue potential'], bear: ['Lunar missions are high-risk with 50%+ historical failure rate', 'Revenue lumpy and tied to mission timing', 'Small team executing complex missions with limited margin for error'], risks: [{ level: 'high', text: 'Mission risk: Single mission failure could devastate stock' }, { level: 'med', text: 'Revenue timing: Lumpy mission-based revenue recognition' }, { level: 'med', text: 'Competition: SpaceX, Astrobotic, Firefly all pursuing lunar services' }], technicals: { support: '$6', resistance: '$9', rsi: '55.4', macd: 'Neutral', ma50: '$7', ma200: '$5.50' }, catalysts: [{ date: 'Apr 25', desc: 'IM-2 mission launch window opens' }, { date: 'May 15', desc: 'Q1 2026 Earnings' }, { date: 'Aug 15', desc: 'Q2 2026 Earnings + IM-3 contract details' }], valuation: { fwdPE: 'N/A', evEbitda: 'N/A', peg: 'N/A', fcfYield: '-18%', revGrowth: '+120%', margin: '-45%' } },
  BBAI: { name: 'BigBear.ai Holdings', price: '$3.80', change: '+5.56%', changeClass: 'profit', bull: ['AI/ML analytics for defense and intelligence gaining contract momentum', 'Verizon partnership for network optimization opens commercial vertical', 'Edge AI capabilities differentiated for tactical/field applications'], bear: ['Revenue growth inconsistent, sub-$200M with persistent losses', 'Defense contract timing creates lumpy, unpredictable revenue', 'Debt load elevated for a pre-profit company'], risks: [{ level: 'med', text: 'Execution: Must scale revenue to cover fixed cost base' }, { level: 'med', text: 'Debt: Convertible notes maturing, potential dilution' }, { level: 'low', text: 'Competition: Palantir, Booz Allen, and other defense AI firms' }], technicals: { support: '$3', resistance: '$4.50', rsi: '62.1', macd: 'Bullish', ma50: '$3.40', ma200: '$2.80' }, catalysts: [{ date: 'May 10', desc: 'Q1 2026 Earnings' }, { date: 'Jun 25', desc: 'DoD budget allocation details' }, { date: 'Aug 10', desc: 'Q2 2026 Earnings' }], valuation: { fwdPE: '15.2x', evEbitda: '12.0x', peg: '1.0x', fcfYield: '3.5%', revGrowth: '+18%', margin: '5.2%' } },
  ASTS: { name: 'AST SpaceMobile Inc.', price: '$5.20', change: '-3.70%', changeClass: 'loss', bull: ['Direct-to-cell broadband satellite technology is potentially transformative', 'Partnerships with AT&T, Vodafone, Rakuten validate the technology', 'First commercial BlueBird satellites launching mid-2025'], bear: ['Pre-revenue with massive capital requirements ($5B+ for full constellation)', 'Technology unproven at commercial scale', 'SpaceX Starlink Direct to Cell is a formidable competitor'], risks: [{ level: 'high', text: 'Technology: Unproven at scale, orbital challenges' }, { level: 'high', text: 'Capital: $5B+ needed, massive dilution ahead' }, { level: 'high', text: 'Competition: SpaceX DTC launching with proven Starlink platform' }], technicals: { support: '$4', resistance: '$7', rsi: '38.2', macd: 'Bearish', ma50: '$5.50', ma200: '$6.20' }, catalysts: [{ date: 'May 12', desc: 'Q1 2026 Earnings' }, { date: 'Jun 15', desc: 'BlueBird launch window' }, { date: 'Sep 1', desc: 'First commercial service date (target)' }], valuation: { fwdPE: 'N/A', evEbitda: 'N/A', peg: 'N/A', fcfYield: '-12%', revGrowth: 'Pre-revenue', margin: 'N/A' } },
  GSAT: { name: 'Globalstar Inc.', price: '$2.10', change: '+1.45%', changeClass: 'profit', bull: ['Apple satellite SOS partnership provides stable, growing revenue base', 'Band n53/n256 spectrum assets increasingly valuable for 5G/IoT', 'New satellite constellation launching with improved capacity'], bear: ['Apple concentration risk: Single customer is 90%+ of revenue', 'Debt load from satellite constellation buildout', 'Limited diversification beyond Apple ecosystem'], risks: [{ level: 'high', text: 'Concentration: Apple is 90%+ of revenue' }, { level: 'med', text: 'Debt: Satellite buildout financing creating leverage risk' }, { level: 'low', text: 'Technology: Satellite lifespan and replacement costs' }], technicals: { support: '$1.80', resistance: '$2.50', rsi: '52.1', macd: 'Neutral', ma50: '$2.05', ma200: '$1.80' }, catalysts: [{ date: 'May 1', desc: 'Q1 2026 Earnings' }, { date: 'Jun 9', desc: 'Apple WWDC - Satellite feature expansion?' }, { date: 'Aug 1', desc: 'Q2 2026 Earnings + new satellite launch' }], valuation: { fwdPE: '42.0x', evEbitda: '18.5x', peg: '2.5x', fcfYield: '0.5%', revGrowth: '+28%', margin: '22%' } }
};

var capLabels = { large: 'Large Cap', mid: 'Mid Cap', small: 'Small Cap', micro: 'Micro Cap' };
var currentGSCap = 'large';

function updateGSCapData(capSize) {
  currentGSCap = capSize;
  var data = GS_CAP_DATA[capSize];
  if (!data) return;

  var anomalyStat = document.getElementById('gsStatAnomalies');
  var valueStat = document.getElementById('gsStatValues');
  var momentumStat = document.getElementById('gsStatMomentum');
  if (anomalyStat) anomalyStat.textContent = data.anomalies.length;
  if (valueStat) valueStat.textContent = data.values.length;
  if (momentumStat) momentumStat.textContent = data.momentum;
  // gsStatAccuracy is intentionally NOT driven by cap-tier data: it stays
  // pinned to the honest "BYO key / No performance claims" state set in
  // index.html and by refreshAiActiveBadge() below. A per-tier "94.2%
  // accuracy" figure was fabricated and has been removed for good.

  var alertList = document.getElementById('gsAlertList');
  if (alertList) {
    alertList.innerHTML = data.anomalies.map(function(a) {
      var sevClass = a.severity === 'HIGH' ? 'high' : (a.severity === 'MED' ? 'medium' : 'low');
      return '<div class="gs-alert anomaly" data-ticker="' + a.ticker + '" data-type="' + a.type + '" data-severity="' + a.severity + '">' +
        '<div class="alert-header">' +
          '<span class="alert-ticker">' + a.ticker + '</span>' +
          '<span class="alert-type">' + a.type + '</span>' +
          '<span class="alert-severity ' + sevClass + '">' + a.severity + '</span>' +
        '</div>' +
        '<div class="alert-body">' + a.desc + '</div>' +
        '<div class="alert-actions">' +
          '<button class="alert-action-btn primary">Analyze Position</button>' +
          '<button class="alert-action-btn">Set Alert</button>' +
        '</div>' +
      '</div>';
    }).join('');
    bindAlertClicks();
  }

  var valueTable = document.getElementById('gsValueTable');
  if (valueTable) {
    var html = '<div class="gvt-header"><span>Ticker</span><span>Fwd P/E</span><span>vs 5Y Avg</span><span>FCF Yield</span><span>Score</span><span>Conviction</span></div>';
    html += data.values.map(function(v) {
      var convClass = v.conviction === 'High' ? 'high' : (v.conviction === 'Med' ? 'medium' : 'low');
      var vs5yClass = v.vs5y.indexOf('-') === 0 ? 'loss' : '';
      var fcfClass = v.fcfYield.indexOf('-') === 0 ? 'loss' : 'profit';
      return '<div class="gvt-row" data-ticker="' + v.ticker + '">' +
        '<span class="gvt-ticker">' + v.ticker + '</span>' +
        '<span>' + v.fwdPE + (v.fwdPE !== 'N/A' ? 'x' : '') + '</span>' +
        '<span class="' + vs5yClass + '">' + v.vs5y + '</span>' +
        '<span class="' + fcfClass + '">' + v.fcfYield + '</span>' +
        '<span class="gvt-score">' + v.score + '</span>' +
        '<span class="conviction ' + convClass + '">' + v.conviction + '</span>' +
      '</div>';
    }).join('');
    valueTable.innerHTML = html;
    bindValueRowClicks();
  }
}

var gsView = document.getElementById('view-greysankore');
if (gsView) {
  var gsCapToggle = gsView.querySelector('.cap-toggle');
  if (gsCapToggle) {
    gsCapToggle.querySelectorAll('.cap-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var cap = btn.dataset.cap;
        if (!cap) return;
        gsCapToggle.querySelectorAll('.cap-btn').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        updateGSCapData(cap);
      });
    });
  }
}

var overlay = document.getElementById('gsAnalysisOverlay');

function openGSAnalysisModal(ticker, signalType, severity, capSize) {
  if (!overlay) return;
  var analysis = GS_TICKER_ANALYSIS[ticker];
  if (!analysis) {
    analysis = {
      name: ticker, price: 'N/A', change: 'N/A', changeClass: 'profit',
      bull: ['Detailed analysis not yet available for this ticker.', 'Check back after the next model scan cycle.'],
      bear: ['No specific bearish thesis generated yet.'],
      risks: [{ level: 'med', text: 'Limited data available for comprehensive risk assessment' }],
      technicals: { support: 'N/A', resistance: 'N/A', rsi: 'N/A', macd: 'N/A', ma50: 'N/A', ma200: 'N/A' },
      catalysts: [{ date: 'TBD', desc: 'Awaiting catalyst identification' }],
      valuation: { fwdPE: 'N/A', evEbitda: 'N/A', peg: 'N/A', fcfYield: 'N/A', revGrowth: 'N/A', margin: 'N/A' }
    };
  }

  var cap = capSize || currentGSCap;
  document.getElementById('gsModalTicker').textContent = ticker;
  document.getElementById('gsModalName').textContent = analysis.name;
  document.getElementById('gsModalCapBadge').textContent = capLabels[cap] || 'Large Cap';
  document.getElementById('gsModalPrice').textContent = analysis.price;
  var changeEl = document.getElementById('gsModalChange');
  changeEl.textContent = analysis.change;
  changeEl.className = 'gs-modal-change ' + analysis.changeClass;

  var signalEl = document.getElementById('gsModalSignal');
  var sevClass = (severity === 'HIGH') ? 'high' : (severity === 'MED' ? 'medium' : 'low');
  signalEl.innerHTML = '<span class="gs-modal-signal-type">' + (signalType || 'Analysis') + '</span>' +
    '<span class="gs-modal-signal-severity ' + sevClass + '">' + (severity || 'INFO') + '</span>' +
    '<span class="gs-modal-signal-confidence">Sample analysis</span>';

  var thesisHtml = '<ul>';
  analysis.bull.forEach(function(b) { thesisHtml += '<li class="bull">' + b + '</li>'; });
  analysis.bear.forEach(function(b) { thesisHtml += '<li class="bear">' + b + '</li>'; });
  thesisHtml += '</ul>';
  document.getElementById('gsModalThesis').innerHTML = thesisHtml;

  var val = analysis.valuation;
  var valMetrics = [
    { label: 'Fwd P/E', value: val.fwdPE }, { label: 'EV/EBITDA', value: val.evEbitda },
    { label: 'PEG Ratio', value: val.peg }, { label: 'FCF Yield', value: val.fcfYield },
    { label: 'Rev Growth', value: val.revGrowth }, { label: 'Net Margin', value: val.margin }
  ];
  var valHtml = '';
  valMetrics.forEach(function(m) {
    valHtml += '<div class="gs-val-metric"><span class="gs-val-metric-label">' + m.label + '</span><span class="gs-val-metric-value">' + m.value + '</span></div>';
  });
  document.getElementById('gsModalValuation').innerHTML = valHtml;

  var risksHtml = '';
  analysis.risks.forEach(function(r) {
    risksHtml += '<div class="gs-risk-item"><span class="gs-risk-level ' + r.level + '">' + r.level.toUpperCase() + '</span><span>' + r.text + '</span></div>';
  });
  document.getElementById('gsModalRisks').innerHTML = risksHtml;

  var tech = analysis.technicals;
  var techItems = [
    { label: 'Support', value: tech.support }, { label: 'Resistance', value: tech.resistance },
    { label: 'RSI (14)', value: tech.rsi }, { label: 'MACD', value: tech.macd },
    { label: '50-Day MA', value: tech.ma50 }, { label: '200-Day MA', value: tech.ma200 }
  ];
  var techHtml = '';
  techItems.forEach(function(t) {
    techHtml += '<div class="gs-tech-item"><span class="gs-tech-label">' + t.label + '</span><span class="gs-tech-value">' + t.value + '</span></div>';
  });
  document.getElementById('gsModalTechnicals').innerHTML = techHtml;

  var catHtml = '';
  analysis.catalysts.forEach(function(c) {
    catHtml += '<div class="gs-catalyst-item"><span class="gs-catalyst-date">' + c.date + '</span><span class="gs-catalyst-desc">' + c.desc + '</span></div>';
  });
  document.getElementById('gsModalCatalysts').innerHTML = catHtml;

  drawModalChart(ticker, analysis);
  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeGSAnalysisModal() {
  if (!overlay) return;
  overlay.classList.remove('active');
  document.body.style.overflow = '';
}

function drawModalChart(ticker, analysis) {
  var canvas = document.getElementById('gsModalChart');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var w = canvas.parentElement.offsetWidth - 20;
  var h = 180;
  canvas.width = w;
  canvas.height = h;
  ctx.clearRect(0, 0, w, h);

  // This 90-day path is a random walk anchored to the real current price, NOT
  // real price history - it exists to give the sample-mode analysis card a
  // visual, and must say so on the chart itself, not just in the surrounding
  // "Sample analysis" copy.
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.font = '9px monospace';
  ctx.textAlign = 'right';
  ctx.fillText('Illustrative, not real price history', w - 6, h - 6);
  ctx.restore();

  var basePrice = parseFloat(analysis.price.replace('$', '').replace(',', '')) || 100;
  var points = [];
  var price = basePrice * 0.88;
  for (var i = 0; i < 90; i++) {
    price += (Math.random() - 0.47) * basePrice * 0.02;
    if (price < basePrice * 0.7) price = basePrice * 0.72;
    if (price > basePrice * 1.2) price = basePrice * 1.18;
    points.push(price);
  }
  points[89] = basePrice;

  var min = Math.min.apply(null, points);
  var max = Math.max.apply(null, points);
  var range = max - min || 1;
  var pad = { top: 10, right: 10, bottom: 20, left: 50 };
  var cw = w - pad.left - pad.right;
  var ch = h - pad.top - pad.bottom;

  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (var g = 0; g < 5; g++) {
    var gy = pad.top + (ch / 4) * g;
    ctx.beginPath(); ctx.moveTo(pad.left, gy); ctx.lineTo(w - pad.right, gy); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.font = '9px monospace'; ctx.textAlign = 'right';
    ctx.fillText('$' + (max - (range / 4) * g).toFixed(1), pad.left - 5, gy + 3);
  }

  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top + ch - ((points[0] - min) / range) * ch);
  for (var j = 1; j < points.length; j++) {
    ctx.lineTo(pad.left + (j / (points.length - 1)) * cw, pad.top + ch - ((points[j] - min) / range) * ch);
  }
  ctx.lineTo(pad.left + cw, pad.top + ch); ctx.lineTo(pad.left, pad.top + ch); ctx.closePath();
  var isProfit = points[89] >= points[0];
  var grad = ctx.createLinearGradient(0, pad.top, 0, h);
  grad.addColorStop(0, isProfit ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)');
  grad.addColorStop(1, isProfit ? 'rgba(16,185,129,0.02)' : 'rgba(239,68,68,0.02)');
  ctx.fillStyle = grad; ctx.fill();

  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top + ch - ((points[0] - min) / range) * ch);
  for (var k = 1; k < points.length; k++) {
    ctx.lineTo(pad.left + (k / (points.length - 1)) * cw, pad.top + ch - ((points[k] - min) / range) * ch);
  }
  ctx.strokeStyle = isProfit ? '#10B981' : '#EF4444'; ctx.lineWidth = 1.5; ctx.stroke();

  var lastX = pad.left + cw;
  var lastY = pad.top + ch - ((points[89] - min) / range) * ch;
  ctx.beginPath(); ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
  ctx.fillStyle = isProfit ? '#10B981' : '#EF4444'; ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1; ctx.stroke();
}

function bindAlertClicks() {
  var alertList = document.getElementById('gsAlertList');
  if (!alertList) return;
  alertList.querySelectorAll('.gs-alert').forEach(function(card) {
    card.addEventListener('click', function(e) {
      if (e.target.closest('.alert-action-btn')) return;
      var ticker = card.dataset.ticker || (card.querySelector('.alert-ticker') ? card.querySelector('.alert-ticker').textContent : null);
      var type = card.dataset.type || (card.querySelector('.alert-type') ? card.querySelector('.alert-type').textContent : null);
      var severity = card.dataset.severity || (card.querySelector('.alert-severity') ? card.querySelector('.alert-severity').textContent : null);
      if (ticker) openGSAnalysisModal(ticker, type, severity, currentGSCap);
    });
  });
}

function bindValueRowClicks() {
  var valueTable = document.getElementById('gsValueTable');
  if (!valueTable) return;
  valueTable.querySelectorAll('.gvt-row').forEach(function(row) {
    row.addEventListener('click', function() {
      var ticker = row.dataset.ticker || (row.querySelector('.gvt-ticker') ? row.querySelector('.gvt-ticker').textContent : null);
      if (ticker) openGSAnalysisModal(ticker, 'Value Opportunity', 'MED', currentGSCap);
    });
  });
}

bindAlertClicks();
bindValueRowClicks();

if (document.getElementById('gsModalClose')) {
  document.getElementById('gsModalClose').addEventListener('click', closeGSAnalysisModal);
}
if (overlay) {
  overlay.addEventListener('click', function(e) { if (e.target === overlay) closeGSAnalysisModal(); });
}
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' && overlay && overlay.classList.contains('active')) closeGSAnalysisModal();
});

var addWatchBtn = document.getElementById('gsModalAddWatch');
if (addWatchBtn) {
  addWatchBtn.addEventListener('click', function() {
    var ticker = document.getElementById('gsModalTicker').textContent;
    if (typeof PortfolioManager !== 'undefined') {
      var wl = PortfolioManager.getWatchlist();
      if (wl.indexOf(ticker) === -1) { wl.push(ticker); PortfolioManager.saveWatchlist(wl); showToast(ticker + ' added to watchlist', 'success'); }
      else { showToast(ticker + ' is already on your watchlist', 'info'); }
    } else { showToast(ticker + ' added to watchlist', 'success'); }
  });
}

var createSignalBtn = document.getElementById('gsModalCreateSignal');
if (createSignalBtn) {
  createSignalBtn.addEventListener('click', function() {
    showToast('Signal created for ' + document.getElementById('gsModalTicker').textContent, 'success');
  });
}

var journalNoteBtn = document.getElementById('gsModalJournalNote');
if (journalNoteBtn) {
  journalNoteBtn.addEventListener('click', function() {
    var ticker = document.getElementById('gsModalTicker').textContent;
    closeGSAnalysisModal();
    var journalBtn = document.querySelector('[data-view="journal"]');
    if (journalBtn) journalBtn.click();
    showToast('Journal note started for ' + ticker, 'info');
  });
}

var askAIBtn = document.getElementById('gsModalAskAI');
if (askAIBtn) {
  askAIBtn.addEventListener('click', function() {
    var ticker = document.getElementById('gsModalTicker').textContent;
    closeGSAnalysisModal();
    var gsBtn = document.querySelector('[data-view="greysankore"]');
    if (gsBtn) gsBtn.click();
    setTimeout(function() {
      var input = document.getElementById('gsChatInput');
      if (input) { input.value = 'Give me a deep analysis on ' + ticker + ' - cover technicals, fundamentals, options flow, and your conviction level.'; input.focus(); }
    }, 150);
  });
}

})();

/* ============================================
   MANUAL ORDER TICKET + GLOBAL KILL SWITCH
   Paper trading is the default. Every order has an explicit confirm step.
   The kill switch is always visible and halts new orders + pauses agents.
   All /api/paper/* requests carry a stable per-browser X-Session-Id.
   ============================================ */
(function initOrderTicket() {
  var PAPER_BASE = '/api/paper';
  var SESSION_KEY = 'gs_paper_session';
  var HALT_KEY = 'gs_trading_halted';

  // ---- session id (stable per browser) ----
  function sessionId() {
    var id = '';
    try { id = localStorage.getItem(SESSION_KEY) || ''; } catch (e) {}
    if (!id) {
      id = 'gsp-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
      try { localStorage.setItem(SESSION_KEY, id); } catch (e) {}
    }
    return id;
  }

  function paperFetch(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign(
      { 'Content-Type': 'application/json', 'X-Session-Id': sessionId() },
      opts.headers || {}
    );
    return fetch(PAPER_BASE + path, opts);
  }

  function toast(msg, type) {
    if (typeof showToast === 'function') showToast(msg, type || 'info');
  }

  // ---- state ----
  var currentSide = 'buy';
  var currentType = 'market';
  var reviewMode = false;
  var lastAccount = null;

  // ---- helpers ----
  function money(v, ccy) {
    if (v == null || isNaN(v)) return '-';
    var s = (v < 0 ? '-' : '') + '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return ccy ? s + ' ' + ccy : s;
  }

  function activeChartSymbol() {
    try { if (typeof currentChartSymbol !== 'undefined' && currentChartSymbol) return String(currentChartSymbol).toUpperCase(); } catch (e) {}
    return '';
  }

  function inferCcy(sym) {
    if (typeof PortfolioManager !== 'undefined' && PortfolioManager && typeof PortfolioManager.inferCurrency === 'function') {
      try { return PortfolioManager.inferCurrency(sym); } catch (e) {}
    }
    return (lastAccount && lastAccount.currency) || 'USD';
  }

  // Reference price for the estimate line. Honest: limit price when set,
  // else the live chart close for the active symbol, else a known position
  // price, else null (we then show "~market" without a fabricated number).
  function referencePrice(sym) {
    sym = (sym || '').toUpperCase();
    if (currentType === 'limit') {
      var lp = parseFloat((document.getElementById('otLimitPrice') || {}).value);
      if (lp > 0) return lp;
      return null;
    }
    try {
      if (typeof currentChartSymbol !== 'undefined' && currentChartSymbol &&
          String(currentChartSymbol).toUpperCase() === sym &&
          typeof currentChartCandles !== 'undefined' && Array.isArray(currentChartCandles) && currentChartCandles.length) {
        var last = currentChartCandles[currentChartCandles.length - 1];
        if (last && last.close > 0) return last.close;
      }
    } catch (e) {}
    if (lastAccount && Array.isArray(lastAccount.positions)) {
      var p = lastAccount.positions.find(function (x) { return String(x.symbol || '').toUpperCase() === sym; });
      if (p && p.qty) {
        if (p.marketValue) return Math.abs(p.marketValue / p.qty);
        if (p.avgCost) return p.avgCost;
      }
    }
    return null;
  }

  function estimateCost(qty, px, ccy) {
    if (typeof FeeModel === 'undefined' || !(qty > 0) || !(px > 0)) return null;
    try {
      var acctCcy = 'CAD';
      if (typeof PortfolioManager !== 'undefined' && PortfolioManager && typeof PortfolioManager.getBaseCurrency === 'function') {
        acctCcy = PortfolioManager.getBaseCurrency();
      }
      var results = FeeModel.compareBrokers({ quantity: qty, price: px, currency: ccy, accountCurrency: acctCcy });
      if (results && results.length) return results[0].total;
    } catch (e) {}
    return null;
  }

  // ---- halt (kill switch) ----
  function isHalted() {
    try { return localStorage.getItem(HALT_KEY) === '1'; } catch (e) { return false; }
  }

  function applyHaltState() {
    var halted = isHalted();
    var btn = document.getElementById('killSwitchBtn');
    if (btn) {
      btn.classList.toggle('halted', halted);
      btn.textContent = halted ? 'HALTED - RESUME' : 'HALT';
      btn.title = halted ? 'Trading halted - click to resume' : 'Halt all trading immediately';
    }
    var banner = document.getElementById('haltBanner');
    if (banner) banner.style.display = halted ? 'block' : 'none';
    if (halted) { try { refreshRisk(); } catch (e) {} }
    var warn = document.getElementById('otHaltWarn');
    if (warn) warn.style.display = halted ? 'block' : 'none';
    var reviewBtn = document.getElementById('otReviewBtn');
    if (reviewBtn) reviewBtn.disabled = halted;
    var confirmBtn = document.getElementById('otConfirmBtn');
    if (confirmBtn) confirmBtn.disabled = halted;
  }

  // ---- server-side kill switch (paper broker) ----
  // The client halt (localStorage flag + agent pause) is authoritative for the
  // in-page UI. These calls ALSO halt the server-side paper broker so it rejects
  // orders that do not originate from this tab. Every call fails soft: if the
  // trading server is unreachable, the client halt still stands.
  function serverHalt(reason) {
    return paperFetch('/halt', {
      method: 'POST',
      body: JSON.stringify({ reason: reason || 'Manual kill switch engaged from GSP Trading UI' }),
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function () { refreshRisk(); });
  }

  function serverResume() {
    return paperFetch('/resume', { method: 'POST', body: JSON.stringify({}) })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function () { refreshRisk(); });
  }

  // ---- risk readout (drawdown / halt reason) in the halt banner ----
  function refreshRisk() {
    var el = document.getElementById('haltRiskReadout');
    if (!el) return;
    // Only meaningful while the banner is visible (i.e. halted).
    if (!isHalted()) { el.style.display = 'none'; el.textContent = ''; return; }
    paperFetch('/risk', { method: 'GET' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (risk) {
        if (!risk) { el.textContent = 'Server risk state unavailable'; el.style.display = ''; return; }
        var parts = [];
        if (typeof risk.drawdownPct === 'number') parts.push('DD ' + risk.drawdownPct.toFixed(2) + '%');
        if (typeof risk.dailyPnl === 'number') {
          parts.push('Day ' + (risk.dailyPnl >= 0 ? '+' : '-') + '$' + Math.abs(risk.dailyPnl).toLocaleString('en-US', { maximumFractionDigits: 0 }));
        }
        if (risk.halted) {
          parts.push('server halted' + (risk.haltReason ? ': ' + risk.haltReason : ''));
        } else {
          parts.push('server not halted');
        }
        el.textContent = parts.join('  |  ');
        el.style.display = '';
      })
      .catch(function () { el.textContent = 'Server risk state unavailable'; el.style.display = ''; });
  }

  function setHalt(halted) {
    try { localStorage.setItem(HALT_KEY, halted ? '1' : '0'); } catch (e) {}
    if (halted) {
      // Stop the simulated agents if the manager is loaded.
      if (typeof AgentManager !== 'undefined' && AgentManager && typeof AgentManager.pauseAll === 'function') {
        try { AgentManager.pauseAll(); } catch (e) {}
      }
      // Halt the server-side paper broker too (fails soft).
      serverHalt();
    } else {
      // Release the server-side halt too (fails soft).
      serverResume();
    }
    applyHaltState();
  }

  function onKillSwitch() {
    if (!isHalted()) {
      var ok = (typeof confirm === 'function')
        ? confirm('HALT ALL TRADING?\n\nThis blocks new orders from the ticket and pauses all simulated agents. You can resume at any time.')
        : true;
      if (!ok) return;
      setHalt(true);
      toast('Trading halted. New orders blocked and agents paused.', 'error');
    } else {
      var ok2 = (typeof confirm === 'function')
        ? confirm('Resume trading?\n\nThis releases the global halt. New paper orders will be allowed again.')
        : true;
      if (!ok2) return;
      setHalt(false);
      toast('Halt released. Trading resumed.', 'success');
    }
  }

  // ---- form <-> confirm views ----
  function showFormView() {
    reviewMode = false;
    var form = document.getElementById('otForm');
    var conf = document.getElementById('otConfirm');
    if (form) form.style.display = '';
    if (conf) conf.style.display = 'none';
    var reviewBtn = document.getElementById('otReviewBtn');
    var confirmBtn = document.getElementById('otConfirmBtn');
    var backBtn = document.getElementById('otBackBtn');
    if (reviewBtn) reviewBtn.style.display = '';
    if (confirmBtn) { confirmBtn.style.display = 'none'; confirmBtn.textContent = 'Confirm PAPER order'; }
    if (backBtn) backBtn.style.display = 'none';
    applyHaltState();
  }

  function showConfirmView(summaryHtml) {
    reviewMode = true;
    var form = document.getElementById('otForm');
    var conf = document.getElementById('otConfirm');
    var sumEl = document.getElementById('otConfirmSummary');
    if (sumEl) sumEl.innerHTML = summaryHtml;
    if (form) form.style.display = 'none';
    if (conf) conf.style.display = 'block';
    var reviewBtn = document.getElementById('otReviewBtn');
    var confirmBtn = document.getElementById('otConfirmBtn');
    var backBtn = document.getElementById('otBackBtn');
    if (reviewBtn) reviewBtn.style.display = 'none';
    if (confirmBtn) confirmBtn.style.display = '';
    if (backBtn) backBtn.style.display = '';
    applyHaltState();
  }

  // ---- segmented controls ----
  function setSide(side) {
    currentSide = (side === 'sell') ? 'sell' : 'buy';
    var seg = document.getElementById('otSideSeg');
    if (seg) seg.querySelectorAll('.ot-seg-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.side === currentSide);
    });
    recalc();
  }

  function setType(type) {
    currentType = (type === 'limit') ? 'limit' : 'market';
    var seg = document.getElementById('otTypeSeg');
    if (seg) seg.querySelectorAll('.ot-seg-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.type === currentType);
    });
    var lf = document.getElementById('otLimitField');
    if (lf) lf.style.display = (currentType === 'limit') ? '' : 'none';
    recalc();
  }

  // ---- live estimate ----
  function recalc() {
    var symEl = document.getElementById('otSymbol');
    var sym = ((symEl || {}).value || '').trim().toUpperCase();
    var qty = parseFloat((document.getElementById('otQty') || {}).value);
    var px = referencePrice(sym);
    var ccy = inferCcy(sym);

    var value = (qty > 0 && px > 0) ? qty * px : null;
    var cost = estimateCost(qty, px, ccy);

    var estValueEl = document.getElementById('otEstValue');
    if (estValueEl) {
      if (value != null) estValueEl.textContent = money(value, ccy) + (currentType === 'market' ? ' (~market)' : '');
      else estValueEl.textContent = (currentType === 'market') ? 'at ~market' : '-';
    }
    var estCostEl = document.getElementById('otEstCost');
    if (estCostEl) estCostEl.textContent = (cost != null) ? money(cost, ccy) : '-';

    var bp = (lastAccount && typeof lastAccount.buyingPower === 'number') ? lastAccount.buyingPower : null;
    var bpEl = document.getElementById('otBpValue');
    if (bpEl) bpEl.textContent = (bp != null) ? money(bp, (lastAccount && lastAccount.currency) || ccy) : '-';

    var chk = document.getElementById('otBpCheck');
    if (chk) {
      chk.textContent = '';
      chk.className = 'ot-bp-check';
      if (currentSide === 'buy' && value != null && bp != null) {
        var need = value + (cost || 0);
        if (need > bp) {
          chk.textContent = 'Exceeds paper buying power by ' + money(need - bp, (lastAccount && lastAccount.currency) || ccy);
          chk.classList.add('bad');
        } else {
          chk.textContent = 'Within paper buying power';
          chk.classList.add('ok');
        }
      }
    }
  }

  // ---- paper account panel ----
  function renderAccount(a) {
    var cashEl = document.getElementById('otAcctCash');
    var eqEl = document.getElementById('otAcctEquity');
    var bpEl = document.getElementById('otAcctBp');
    var ccy = (a && a.currency) || 'USD';
    if (cashEl) cashEl.textContent = (a && typeof a.cash === 'number') ? money(a.cash, ccy) : '-';
    if (eqEl) eqEl.textContent = (a && typeof a.equity === 'number') ? money(a.equity, ccy) : '-';
    if (bpEl) bpEl.textContent = (a && typeof a.buyingPower === 'number') ? money(a.buyingPower, ccy) : '-';

    var posWrap = document.getElementById('otPositions');
    if (!posWrap) return;
    var positions = (a && Array.isArray(a.positions)) ? a.positions : [];
    if (!positions.length) {
      posWrap.innerHTML = '<div class="ot-acct-note">No open paper positions.</div>';
      return;
    }
    posWrap.innerHTML = positions.map(function (p) {
      var pnl = (typeof p.unrealizedPnl === 'number') ? p.unrealizedPnl : null;
      var pnlCls = (pnl != null && pnl < 0) ? 'loss' : 'profit';
      var mv = (typeof p.marketValue === 'number') ? money(p.marketValue, ccy) : '-';
      return '<div class="ot-pos-row">' +
        '<span class="ot-pos-sym">' + String(p.symbol || '').toUpperCase() + '</span>' +
        '<span class="ot-pos-qty">' + (Number(p.qty) || 0) + '</span>' +
        '<span class="ot-pos-mv">' + mv + '</span>' +
        '<span class="ot-pos-pnl ' + pnlCls + '">' + (pnl != null ? (pnl >= 0 ? '+' : '') + money(pnl, '') : '-') + '</span>' +
        '</div>';
    }).join('');
  }

  function renderAccountError() {
    lastAccount = null;
    var posWrap = document.getElementById('otPositions');
    if (posWrap) posWrap.innerHTML = '<div class="ot-acct-note">Paper account unavailable. The trading server may not be running.</div>';
    ['otAcctCash', 'otAcctEquity', 'otAcctBp', 'otBpValue'].forEach(function (id) {
      var el = document.getElementById(id); if (el) el.textContent = '-';
    });
  }

  function refreshAccount() {
    return paperFetch('/account', { method: 'GET' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (a) {
        if (a) { lastAccount = a; renderAccount(a); recalc(); }
        else renderAccountError();
      })
      .catch(function () { renderAccountError(); });
  }

  // ---- validation + summary ----
  function validate() {
    var sym = ((document.getElementById('otSymbol') || {}).value || '').trim().toUpperCase();
    var qty = parseFloat((document.getElementById('otQty') || {}).value);
    if (!sym) return { ok: false, msg: 'Enter a symbol.' };
    if (!(qty > 0)) return { ok: false, msg: 'Enter a quantity greater than zero.' };
    if (currentType === 'limit') {
      var lp = parseFloat((document.getElementById('otLimitPrice') || {}).value);
      if (!(lp > 0)) return { ok: false, msg: 'Enter a limit price greater than zero.' };
    }
    return { ok: true, sym: sym, qty: qty };
  }

  function buildBody() {
    var sym = ((document.getElementById('otSymbol') || {}).value || '').trim().toUpperCase();
    var qty = parseFloat((document.getElementById('otQty') || {}).value);
    var body = { symbol: sym, side: currentSide, qty: qty, type: currentType };
    if (currentType === 'limit') body.limitPrice = parseFloat((document.getElementById('otLimitPrice') || {}).value);
    return body;
  }

  function onReview() {
    if (isHalted()) { toast('Trading is halted. Release the global halt to place orders.', 'error'); return; }
    var v = validate();
    if (!v.ok) { toast(v.msg, 'error'); return; }
    var ccy = inferCcy(v.sym);
    var px = referencePrice(v.sym);
    var value = (px > 0) ? v.qty * px : null;
    var cost = estimateCost(v.qty, px, ccy);
    var priceStr = (currentType === 'limit')
      ? ('at limit ' + money(px, ccy))
      : '@ ~market' + (px > 0 ? ' (~' + money(px, ccy) + ')' : '');
    var lines = [];
    lines.push('<strong>' + (currentSide === 'buy' ? 'Buy' : 'Sell') + ' ' + v.qty + ' ' + v.sym + '</strong> ' + priceStr);
    if (value != null) lines.push('Est. order value: ' + money(value, ccy));
    if (cost != null) lines.push('Est. cost to trade: ' + money(cost, ccy));
    lines.push('Mode: <strong>PAPER</strong> (simulated)');
    showConfirmView(lines.map(function (l) { return '<div class="ot-sum-line">' + l + '</div>'; }).join(''));
  }

  function onConfirm() {
    if (isHalted()) { toast('Trading is halted. Order refused.', 'error'); return; }
    var v = validate();
    if (!v.ok) { toast(v.msg, 'error'); showFormView(); return; }
    var body = buildBody();
    var btn = document.getElementById('otConfirmBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Placing...'; }
    paperFetch('/order', { method: 'POST', body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        var j = res.j || {};
        if (res.ok && j.status && j.status !== 'rejected') {
          if (j.account) { lastAccount = j.account; renderAccount(j.account); }
          var costStr = (j.cost && typeof j.cost.total === 'number') ? (' - cost ' + money(j.cost.total, (j.account && j.account.currency) || '')) : '';
          var fillStr = (typeof j.fillPrice === 'number' && j.fillPrice > 0) ? (' @ ' + money(j.fillPrice)) : '';
          var verb = (j.status === 'filled') ? 'filled' : 'working';
          toast('PAPER ' + verb + ': ' + body.side + ' ' + body.qty + ' ' + body.symbol + fillStr + costStr, (j.status === 'filled') ? 'success' : 'info');
          closeModal('orderTicketModal');
          refreshAccount();
        } else {
          toast('PAPER order rejected: ' + (j.message || 'unknown reason'), 'error');
        }
      })
      .catch(function () {
        toast('Could not reach the paper trading server. Order not placed.', 'error');
      })
      .then(function () {
        if (btn) { btn.disabled = isHalted(); btn.textContent = 'Confirm PAPER order'; }
      });
  }

  function onReset() {
    var ok = (typeof confirm === 'function')
      ? confirm('Reset the paper account to its starting cash? This clears all simulated positions and orders.')
      : true;
    if (!ok) return;
    paperFetch('/reset', { method: 'POST', body: JSON.stringify({}) })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (j && j.ok && j.account) {
          lastAccount = j.account; renderAccount(j.account); recalc();
          toast('Paper account reset.', 'success');
        } else {
          toast('Reset failed.', 'error');
        }
      })
      .catch(function () { toast('Could not reach the paper trading server.', 'error'); });
  }

  // ---- public open ----
  function openOrderTicket(symbol, side) {
    showFormView();
    var symEl = document.getElementById('otSymbol');
    if (symEl) symEl.value = (symbol || activeChartSymbol() || '').toUpperCase();
    setSide(side === 'sell' ? 'sell' : 'buy');
    setType('market');
    var qtyEl = document.getElementById('otQty'); if (qtyEl) qtyEl.value = '';
    var lpEl = document.getElementById('otLimitPrice'); if (lpEl) lpEl.value = '';
    applyHaltState();
    recalc();
    refreshAccount();
    if (typeof openModal === 'function') openModal('orderTicketModal');
    if (symEl && !symEl.value) symEl.focus();
    else if (qtyEl) qtyEl.focus();
  }
  window.openOrderTicket = openOrderTicket;

  // ---- wiring (deferred: the modal lives after the app.js script tag) ----
  function wire() {
    // Kill switch + halt banner
    var kill = document.getElementById('killSwitchBtn');
    if (kill) kill.addEventListener('click', onKillSwitch);
    var resume = document.getElementById('haltBannerResume');
    if (resume) resume.addEventListener('click', onKillSwitch);

    // Chart-area trade affordance
    var chartTrade = document.getElementById('chartTradeBtn');
    if (chartTrade) chartTrade.addEventListener('click', function () { openOrderTicket(activeChartSymbol(), 'buy'); });

    // Recalc inputs
    ['otSymbol', 'otQty', 'otLimitPrice'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('input', function () { if (!reviewMode) recalc(); });
    });
    var symEl = document.getElementById('otSymbol');
    if (symEl) symEl.addEventListener('change', refreshAccount);

    // Side segmented control
    var sideSeg = document.getElementById('otSideSeg');
    if (sideSeg) sideSeg.querySelectorAll('.ot-seg-btn').forEach(function (b) {
      b.addEventListener('click', function () { setSide(b.dataset.side); });
    });

    // Type segmented control
    var typeSeg = document.getElementById('otTypeSeg');
    if (typeSeg) typeSeg.querySelectorAll('.ot-seg-btn').forEach(function (b) {
      b.addEventListener('click', function () { setType(b.dataset.type); });
    });

    // Footer actions
    var reviewBtn = document.getElementById('otReviewBtn');
    if (reviewBtn) reviewBtn.addEventListener('click', onReview);
    var confirmBtn = document.getElementById('otConfirmBtn');
    if (confirmBtn) confirmBtn.addEventListener('click', onConfirm);
    var backBtn = document.getElementById('otBackBtn');
    if (backBtn) backBtn.addEventListener('click', showFormView);
    var resetBtn = document.getElementById('otResetBtn');
    if (resetBtn) resetBtn.addEventListener('click', onReset);

    // Reflect any persisted halt on load
    applyHaltState();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire, { once: true });
  else wire();
})();


// ============================================
// SAMPLE PORTFOLIO (explicit, labeled, reversible)
// Real tickers at real prices; the LOTS are demo data the user asked for,
// every txn carries source:'sample', a banner shows while any exist, and
// one click clears them. Never auto-seeded.
// ============================================
(function initSamplePortfolio() {
  const SAMPLE = [
    { sym: 'SPCX', shares: 15, cost: 110.00, date: '2026-06-25', account: 'non-registered' },
    { sym: 'TSLA', shares: 40, cost: 250.00, date: '2025-11-14', account: 'non-registered' },
    { sym: 'MSFT', shares: 25, cost: 415.00, date: '2025-09-10', account: 'RRSP' },
    { sym: 'NVDA', shares: 60, cost: 135.00, date: '2025-08-20', account: 'TFSA' },
    { sym: 'AAPL', shares: 30, cost: 225.00, date: '2025-10-03', account: 'non-registered' },
    { sym: 'AMZN', shares: 20, cost: 185.00, date: '2025-12-05', account: 'RRSP' },
    { sym: 'RY.TO', shares: 35, cost: 168.00, date: '2025-09-25', account: 'non-registered' },
    { sym: 'SHOP.TO', shares: 25, cost: 145.00, date: '2026-01-12', account: 'TFSA' },
    { sym: 'XEQT.TO', shares: 200, cost: 33.00, date: '2025-08-05', account: 'FHSA' },
  ];

  window.gsLoadSamplePortfolio = async function () {
    SAMPLE.forEach(s => {
      PortfolioManager.addPosition(s.sym, s.shares, s.cost, {
        account: s.account, date: s.date, source: 'sample',
        fxEstimated: PortfolioManager.inferCurrency(s.sym) === 'USD'
      });
    });
    await PortfolioManager.refreshQuotes();
    await PortfolioManager.repairFxRates(true); // true BoC rate for each buy date
    if (typeof showToast === 'function') showToast('Sample portfolio loaded. Every lot is labeled SAMPLE; one click clears it.', 'success');
    window.gsUpdateSampleBanner();
    document.dispatchEvent(new CustomEvent('gs:portfolio-synced'));
    return true;
  };

  window.gsClearSamplePortfolio = function () {
    const keep = PortfolioManager.getPositions().filter(p => !(p.txns || []).every(t => t.source === 'sample'));
    PortfolioManager.savePositions(keep);
    window.gsUpdateSampleBanner();
    document.dispatchEvent(new CustomEvent('gs:portfolio-synced'));
    if (typeof showToast === 'function') showToast('Sample portfolio cleared', 'info');
  };

  window.gsHasSample = function () {
    return PortfolioManager.getPositions().some(p => (p.txns || []).some(t => t.source === 'sample'));
  };

  window.gsUpdateSampleBanner = function () {
    let el = document.getElementById('gsSampleBanner');
    if (!window.gsHasSample()) { if (el) el.remove(); return; }
    if (el) return;
    el = document.createElement('div');
    el.id = 'gsSampleBanner';
    el.className = 'gs-sample-banner';
    el.innerHTML = 'SAMPLE PORTFOLIO - demo lots, not your money. <button class="agent-btn" id="gsClearSampleBtn" style="margin-left:10px;font-size:10px;padding:2px 8px;">Clear sample</button>';
    const view = document.getElementById('view-portfolio');
    const header = view ? view.querySelector('.view-header') : null;
    if (header && header.parentNode) header.parentNode.insertBefore(el, header.nextSibling);
    const btn = el.querySelector('#gsClearSampleBtn');
    if (btn) btn.addEventListener('click', window.gsClearSamplePortfolio);
  };
  window.gsUpdateSampleBanner();
})();

// ============================================
// FEE X-RAY VIEW
// The hero surface: what each Canadian broker would charge PER YEAR for
// this portfolio and trading pattern. Math in services/fee-xray.js.
// ============================================
(function initFeeXray() {
  if (!document.getElementById('view-feexray')) return;
  const PREFS_KEY = 'gs_feexray_prefs';
  let prefsApplied = false;

  function loadPrefs() { try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch (e) { return {}; } }
  function savePrefs(p) { try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch (e) {} }
  function fmtMoney(v) { return '$' + Math.round(v).toLocaleString('en-CA'); }

  function populateControls() {
    const sel = document.getElementById('fxrBrokerSel');
    if (sel && !sel.options.length && typeof FeeModel !== 'undefined') {
      Object.keys(FeeModel.BROKERS).forEach(id => {
        const o = document.createElement('option');
        o.value = id;
        o.textContent = FeeModel.BROKERS[id].name;
        sel.appendChild(o);
      });
    }
    if (!prefsApplied && sel && sel.options.length) {
      prefsApplied = true;
      const p = loadPrefs();
      if (p.broker && FeeModel.BROKERS[p.broker]) sel.value = p.broker; else sel.value = 'td';
      if (p.tradesPerYear !== undefined) document.getElementById('fxrTradesInput').value = p.tradesPerYear;
      if (p.contracts !== undefined) document.getElementById('fxrContractsInput').value = p.contracts;
    }
  }

  function render() {
    if (typeof FeeXray === 'undefined' || typeof FeeModel === 'undefined') return;
    populateControls();
    const emptyEl = document.getElementById('fxrEmpty');
    const contentEl = document.getElementById('fxrContent');
    const holdings = PortfolioManager.getHoldings();
    if (!holdings.length) {
      if (emptyEl) emptyEl.style.display = '';
      if (contentEl) contentEl.style.display = 'none';
      return;
    }
    if (emptyEl) emptyEl.style.display = 'none';
    if (contentEl) contentEl.style.display = '';

    const brokerId = (document.getElementById('fxrBrokerSel') || {}).value || 'td';
    const tradesRaw = parseInt((document.getElementById('fxrTradesInput') || {}).value, 10);
    const contractsRaw = parseInt((document.getElementById('fxrContractsInput') || {}).value, 10);
    const tradesPerYear = isNaN(tradesRaw) ? 24 : tradesRaw;
    const contracts = isNaN(contractsRaw) ? 0 : contractsRaw;
    savePrefs({ broker: brokerId, tradesPerYear: tradesPerYear, contracts: contracts });

    const profile = FeeXray.buildProfile(holdings, {
      tradesPerYear: tradesPerYear,
      optionContractsPerYear: contracts,
      usdCadRate: PortfolioManager.getUsdCadRate(),
    });
    const rows = FeeXray.compareAnnualCosts(profile);
    const current = rows.find(r => r.broker === brokerId) || rows[rows.length - 1];
    const cheapest = rows[0];
    const over = current.totalYr - cheapest.totalYr;

    document.getElementById('fxrHeroNumber').textContent = fmtMoney(over);
    document.getElementById('fxrHeroSub').textContent = over > 0
      ? ('Per year at ' + current.brokerName + ' versus ' + cheapest.brokerName + ', for these holdings and this trading pattern. That money comes straight out of your returns, every year.')
      : (current.brokerName + ' is already the cheapest modeled broker for this behaviour.');

    document.getElementById('fxrUsdExposure').textContent = fmtMoney(profile.stats.usdValueCad);
    document.getElementById('fxrUsdShare').textContent = Math.round(profile.stats.usdShare * 100) + '% of your ' + fmtMoney(profile.stats.totalValueCad) + ' portfolio is USD-denominated.';

    const story = FeeXray.fxStory(profile, brokerId);
    document.getElementById('fxrFxDrag').textContent = fmtMoney(current.fxDragYr);
    document.getElementById('fxrFxDragSub').textContent = current.brokerName + ' converts at ' + current.fxRatePct + '%. On roughly ' + fmtMoney(story.volumeCad) + ' of USD purchases per year, that is the skim.';

    document.getElementById('fxrGambit').textContent = fmtMoney(story.gambitSavings);
    document.getElementById('fxrGambitSub').textContent = story.gambitWorthIt
      ? ('vs converting at ' + current.brokerName + ', after two commissions and the DLR spread. The classic DIY fix, until conversion is simply at cost.')
      : 'At this conversion volume the gambit friction eats the benefit. Not worth it yet.';

    const tbody = document.getElementById('fxrTableBody');
    tbody.innerHTML = rows.map(r => {
      const cls = r.broker === brokerId ? 'fxr-current' : '';
      const nameExtra = (r.broker === brokerId ? ' <span style="font-size:8px;color:var(--accent-gold);letter-spacing:0.08em;">YOURS</span>' : '') +
        (r.broker === cheapest.broker ? ' <span style="font-size:8px;color:var(--accent-teal);letter-spacing:0.08em;">CHEAPEST</span>' : '');
      return '<tr class="' + cls + '">' +
        '<td class="fxr-broker-name">' + r.brokerName + nameExtra + '</td>' +
        '<td class="pf-right">' + fmtMoney(r.commissionsYr) + '</td>' +
        '<td class="pf-right">' + fmtMoney(r.fxDragYr) + '</td>' +
        '<td class="pf-right">' + fmtMoney(r.optionsYr) + '</td>' +
        '<td class="pf-right" style="font-weight:600;">' + fmtMoney(r.totalYr) + '</td>' +
        '<td class="pf-right ' + (r.vsCheapest > 0 ? 'pf-loss' : 'pf-profit') + '">' + (r.vsCheapest > 0 ? '+' : '') + fmtMoney(r.vsCheapest) + '</td>' +
        '</tr>';
    }).join('');
    document.getElementById('fxrTableSub').textContent = profile.tradesPerYear + ' trades/yr, ~' + fmtMoney(profile.avgTradeSizeCad) + ' per trade, ' + profile.usdTrades + ' in USD';
    document.getElementById('fxrAssumptions').textContent = 'Assumptions: trades are CAD-funded, so each USD purchase converts at the broker rate (holding USD or journaling avoids this, which is the point). Trade size defaults to 2% of portfolio value; the trade mix follows your USD/CAD split by market value. Gambit friction is modeled as two $9.99 commissions plus a 0.10% DLR spread. Options premium FX and account minimums/inactivity fees are not modeled. Fee schedules come from the open-source fee engine in this repository. Estimates for education, not advice.';
  }

  ['fxrBrokerSel', 'fxrTradesInput', 'fxrContractsInput'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', render);
  });
  const refreshBtn = document.getElementById('fxrRefreshBtn');
  if (refreshBtn) refreshBtn.addEventListener('click', () => PortfolioManager.refreshQuotes().then(render).catch(() => render()));
  const goBtn = document.getElementById('fxrGoPortfolioBtn');
  if (goBtn) goBtn.addEventListener('click', () => { const b = document.querySelector('.nav-btn[data-view="portfolio"]'); if (b) b.click(); });
  const sampleBtn = document.getElementById('fxrLoadSampleBtn');
  if (sampleBtn) sampleBtn.addEventListener('click', () => { window.gsLoadSamplePortfolio().then(render); });

  document.querySelectorAll('.nav-btn[data-view]').forEach(btn => {
    btn.addEventListener('click', () => setTimeout(() => {
      const active = document.querySelector('.view.active');
      if (active && active.id === 'view-feexray') {
        PortfolioManager.refreshQuotes().then(render).catch(() => render());
      }
    }, 60));
  });
  document.addEventListener('gs:portfolio-synced', () => {
    const active = document.querySelector('.view.active');
    if (active && active.id === 'view-feexray') render();
  });
})();
