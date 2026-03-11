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
    for (let i = 0; i < 30; i++) {
      const p = document.createElement('div');
      p.className = 'landing-particle';
      p.style.left = Math.random() * 100 + '%';
      p.style.animationDelay = Math.random() * 8 + 's';
      p.style.animationDuration = (6 + Math.random() * 6) + 's';
      particleContainer.appendChild(p);
    }
  }

  // Counter animation for landing stats
  function animateCounter(id, target, suffix, duration) {
    const el = document.getElementById(id);
    if (!el) return;
    const start = 0;
    const startTime = performance.now();
    function step(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.floor(start + (target - start) * eased);
      el.textContent = current.toLocaleString() + (suffix || '');
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  setTimeout(() => animateCounter('lsMarkets', 142, '', 2000), 300);
  setTimeout(() => animateCounter('lsAssets', 48200, '+', 2000), 500);
  setTimeout(() => {
    const el = document.getElementById('lsLatency');
    if (el) el.textContent = '<12ms';
  }, 800);

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
document.querySelectorAll('.nav-btn[data-view]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const view = document.getElementById('view-' + btn.dataset.view);
    if (view) view.classList.add('active');
  });
});

// Keyboard shortcuts for view switching
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  const viewMap = { '1': 'dashboard', '2': 'options', '3': 'greysankore', '4': 'flow', '5': 'agents', '6': 'risk' };
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
const tickerData = [
  { sym: 'SPY', price: '584.23', chg: '+1.24%', dir: 'profit' },
  { sym: 'QQQ', price: '497.81', chg: '+1.67%', dir: 'profit' },
  { sym: 'DIA', price: '421.56', chg: '-0.32%', dir: 'loss' },
  { sym: 'IWM', price: '207.43', chg: '+0.89%', dir: 'profit' },
  { sym: 'VIX', price: '18.73', chg: '+8.42%', dir: 'loss' },
  { sym: 'GLD', price: '214.87', chg: '+0.34%', dir: 'profit' },
  { sym: 'TLT', price: '92.14', chg: '-0.67%', dir: 'loss' },
  { sym: 'BTC', price: '72,841', chg: '+3.21%', dir: 'profit' },
  { sym: 'ETH', price: '3,847', chg: '+2.14%', dir: 'profit' },
  { sym: 'EUR/USD', price: '1.0892', chg: '+0.12%', dir: 'profit' },
  { sym: 'OIL', price: '78.42', chg: '-1.23%', dir: 'loss' },
  { sym: 'GOLD', price: '2,187', chg: '+0.41%', dir: 'profit' },
];

const tickerEl = document.getElementById('marketTicker');
// Create scrolling wrapper with duplicate for seamless loop
const tickerInner = document.createElement('div');
tickerInner.className = 'topbar-ticker-inner';
const allTickers = [...tickerData, ...tickerData]; // duplicate for seamless scroll
allTickers.forEach(t => {
  const item = document.createElement('div');
  item.className = 'ticker-item';
  item.innerHTML = `<span class="ticker-sym">${t.sym}</span><span class="ticker-price">${t.price}</span><span class="ticker-chg ${t.dir}">${t.chg}</span>`;
  tickerInner.appendChild(item);
});
tickerEl.appendChild(tickerInner);

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

  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.45) * 2.5 + trend;
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) + Math.random() * 1.5;
    const low = Math.min(open, close) - Math.random() * 1.5;
    candles.push({ open, close, high, low, volume: Math.random() * 5000000 + 1000000 });
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
    callsBody.innerHTML = '<tr><td colspan="11" style="color: var(--loss); padding: 20px;">Failed to load data. Retrying with simulated data...</td></tr>';
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

function populateFlowFeed() {
  const feed = document.getElementById('flowFeed');
  if (!feed) return;

  // Seed the engine with historical data
  FlowEngine.seedHistory(40);

  // Populate ticker filter dropdown
  const tickerSelect = document.getElementById('flowFilterTicker');
  if (tickerSelect) {
    FlowEngine.getTickerList().forEach(t => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      tickerSelect.appendChild(opt);
    });
  }

  // Render seeded history
  const history = FlowEngine.flowHistory.slice(-30).reverse();
  history.forEach(entry => {
    const row = createFlowRow(entry);
    feed.appendChild(row);
    flowDisplayedEntries.push(entry);
  });

  // Initial dark pool render
  renderDarkPoolFeed();

  // Initial hottest contracts
  renderHottestContracts();

  // Initial stats
  updateFlowSummaryStats();

  // Initial net flow chart
  drawNetFlowChart();

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
      } else {
        indicator.classList.remove('paused');
        indicator.classList.add('live');
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
  thinkingDiv.innerHTML = `<div class="gs-chat-avatar">GS</div><div class="gs-chat-content"><div class="gs-thinking-dots"><span></span><span></span><span></span></div></div>`;
  body.appendChild(thinkingDiv);
  body.scrollTop = body.scrollHeight;

  // Disable input during response
  input.disabled = true;
  const sendBtn = document.getElementById('gsChatSend');
  if (sendBtn) sendBtn.disabled = true;

  try {
    const context = typeof GreySankore !== 'undefined' ? GreySankore.gatherContext() : {};
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
      errorDiv.innerHTML = `<div class="gs-chat-avatar">GS</div><div class="gs-chat-content">${errorHtml}</div>`;
      body.appendChild(errorDiv);
      body.scrollTop = body.scrollHeight;
    } else if (result.type === 'mock') {
      // Mock fallback response with typing effect
      const aiDiv = document.createElement('div');
      aiDiv.className = 'gs-chat-message ai';
      aiDiv.innerHTML = `<div class="gs-chat-avatar">GS</div><div class="gs-chat-content"></div>`;
      body.appendChild(aiDiv);
      const contentDiv = aiDiv.querySelector('.gs-chat-content');
      await typewriteHtml(contentDiv, result.html, body);
    } else if (result.type === 'stream') {
      // Streaming AI response
      const aiDiv = document.createElement('div');
      aiDiv.className = 'gs-chat-message ai';
      aiDiv.innerHTML = `<div class="gs-chat-avatar">GS</div><div class="gs-chat-content"><span class="gs-stream-cursor"></span></div>`;
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
          body.scrollTop = body.scrollHeight;
        }
      );
    }
  } catch (e) {
    if (thinkingDiv.parentNode) thinkingDiv.remove();
    const errorDiv = document.createElement('div');
    errorDiv.className = 'gs-chat-message ai';
    errorDiv.innerHTML = `<div class="gs-chat-avatar">GS</div><div class="gs-chat-content"><p style="color: var(--loss);">Connection error. Make sure the server is running (npm start).</p></div>`;
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

async function checkAndDisplayApiStatus(statusEl, indicatorEl) {
  if (typeof GreySankore === 'undefined') return;

  // First, restore key from localStorage to server
  await GreySankore.restoreApiKey();

  const configured = await GreySankore.checkApiStatus();

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
    row.style.opacity = '0';
    row.style.transition = 'opacity 0.3s';

    const headerRow = feed.querySelector('#flowHeaderRow');
    if (headerRow && headerRow.nextSibling) {
      feed.insertBefore(row, headerRow.nextSibling);
    } else {
      feed.appendChild(row);
    }
    requestAnimationFrame(() => { row.style.opacity = '1'; });

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
}

// Periodically generate dark pool prints
function simulateDarkPool() {
  if (flowLivePaused) return;
  const print = FlowEngine.generateDarkPoolPrint();
  FlowAnalytics.analyzeDarkPool(print);
  renderDarkPoolFeed();
  updateFlowSummaryStats();
}

setInterval(simulateLiveFlow, 1800);
setInterval(simulateDarkPool, 6000);

// ---- WATCHLIST HIGHLIGHTING ----
document.querySelectorAll('.wl-row').forEach(row => {
  row.addEventListener('click', () => {
    document.querySelectorAll('.wl-row').forEach(r => r.style.background = '');
    row.style.background = 'var(--bg-tertiary)';
  });
});

// ---- SIMULATED LIVE PRICE UPDATES ----
function simulatePriceUpdate() {
  const rows = document.querySelectorAll('.wl-row');
  if (!rows.length) return;
  const row = rows[Math.floor(Math.random() * rows.length)];
  const priceEl = row.querySelector('.wl-price');
  const changeEl = row.querySelector('.wl-change');
  if (!priceEl) return;

  const oldPrice = parseFloat(priceEl.textContent);
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
}
setInterval(simulatePriceUpdate, 1500);

// ---- INIT ----
function init() {
  drawCandlestickChart();
  drawVolumeChart();
  drawSparklines();
  populateOptionsChain();
  populateFlowFeed();
  drawAgentPerfChart();
  initSettingsApiKey();
  setupOptionsControls();
  setupStrategyBuilder();

  // Refresh AI insight cards on load (async, non-blocking)
  setTimeout(() => refreshInsightCards(), 1500);
}

// Redraw on resize
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    drawCandlestickChart();
    drawVolumeChart();
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
   Wires up agent cards, modals, settings
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
// Close modal on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.remove('active');
  });
});

// --- Default agent instances ---
const defaultAgents = {
  arb: null,
  swing: null,
  gamma: null,
  meanrev: null,
};

function initDefaultAgents() {
  if (typeof ArbitrageHunter === 'undefined') return; // Guard: strategies not loaded
  defaultAgents.arb = new ArbitrageHunter({ id: 'arb-hunter' });
  defaultAgents.swing = new SwingMomentum({ id: 'swing-momentum' });
  defaultAgents.gamma = new GammaScalper({ id: 'gamma-scalper' });
  defaultAgents.meanrev = new MeanReversion({ id: 'mean-reversion' });

  AgentManager.register(defaultAgents.arb);
  AgentManager.register(defaultAgents.swing);
  AgentManager.register(defaultAgents.gamma);
  AgentManager.register(defaultAgents.meanrev);
}

// --- Render agent cards ---
function renderAgentCards() {
  const grid = document.getElementById('agentsGrid');
  if (!grid || typeof AgentManager === 'undefined') return;
  grid.innerHTML = '';

  const agents = AgentManager.getAll();
  agents.forEach(agent => {
    grid.appendChild(createAgentCard(agent));
  });

  // Deploy new agent card
  const deployCard = document.createElement('div');
  deployCard.className = 'agent-card new-agent';
  deployCard.innerHTML = `
    <div class="new-agent-inner">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M12 5v14M5 12h14"/></svg>
      <h3>Deploy New Agent</h3>
      <p>Choose from pre-built strategies or configure a custom agent</p>
      <div class="new-agent-templates">
        <span class="template-tag">Arbitrage Hunter</span>
        <span class="template-tag">Swing Momentum</span>
        <span class="template-tag">Gamma Scalper</span>
        <span class="template-tag">Mean Reversion</span>
      </div>
    </div>
  `;
  deployCard.addEventListener('click', () => openModal('deployAgentModal'));
  grid.appendChild(deployCard);
}

function createAgentCard(agent) {
  const stats = agent.getStats();
  const pnl = agent.getPnL();
  const isRunning = agent.state === AgentState.RUNNING;
  const isPaused = agent.state === AgentState.PAUSED;
  const isStopped = agent.state === AgentState.STOPPED;
  const stateClass = isRunning ? 'running' : isPaused ? 'paused' : 'stopped';
  const stateLabel = isRunning ? 'RUNNING' : isPaused ? 'PAUSED' : 'STOPPED';
  const simLabel = agent.simulationMode ? ' (SIM)' : '';

  const card = document.createElement('div');
  card.className = `agent-card${isRunning ? ' active' : ''}`;
  card.id = `card-${agent.id}`;

  const pnlClass = pnl.total >= 0 ? 'profit' : 'loss';
  const pnlSign = pnl.total >= 0 ? '+' : '';

  // Build positions HTML if any
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

  card.innerHTML = `
    <div class="agent-header">
      <div class="agent-status-dot ${stateClass}"></div>
      <h3 class="agent-name">${agent.name}</h3>
      <span class="agent-badge ${stateClass}">${stateLabel}${simLabel}</span>
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
    <div class="agent-controls">
      ${isRunning
        ? `<button class="agent-btn pause" data-action="pause" data-agent="${agent.id}">Pause</button>`
        : `<button class="agent-btn start" data-action="start" data-agent="${agent.id}">${isPaused ? 'Resume' : 'Start'}</button>`
      }
      <button class="agent-btn" data-action="configure" data-agent="${agent.id}">Configure</button>
      <button class="agent-btn" data-action="logs" data-agent="${agent.id}">Logs</button>
      ${isStopped ? `<button class="agent-btn" data-action="remove" data-agent="${agent.id}" style="color:var(--loss)">Remove</button>` : ''}
    </div>
  `;

  // Wire up button events
  card.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleAgentAction(btn.dataset.action, btn.dataset.agent);
    });
  });

  return card;
}

function handleAgentAction(action, agentId) {
  const agent = AgentManager.get(agentId);
  if (!agent) return;

  switch (action) {
    case 'start':
      if (agent.state === AgentState.PAUSED) {
        agent.resume();
      } else {
        agent.start();
      }
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

  // Wire filter buttons
  document.querySelectorAll('.log-filter-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.log-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderLogs(btn.dataset.level);
    };
  });

  renderLogs('all');
  openModal('agentLogsModal');

  // Auto-refresh logs
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

// --- Deploy Agent Modal ---
document.querySelectorAll('.deploy-strategy-card').forEach(card => {
  card.addEventListener('click', () => {
    if (typeof AgentManager === 'undefined') return;
    const strategy = card.dataset.strategy;
    let agent;
    const id = `${strategy.toLowerCase()}-${Date.now()}`;
    switch (strategy) {
      case 'ArbitrageHunter':
        agent = new ArbitrageHunter({ id });
        break;
      case 'SwingMomentum':
        agent = new SwingMomentum({ id });
        break;
      case 'GammaScalper':
        agent = new GammaScalper({ id });
        break;
      case 'MeanReversion':
        agent = new MeanReversion({ id });
        break;
      default: return;
    }
    AgentManager.register(agent);
    closeModal('deployAgentModal');
    renderAgentCards();
  });
});

// "Deploy New Agent" button in header
document.getElementById('newAgentBtn')?.addEventListener('click', () => {
  openModal('deployAgentModal');
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

  // Live mode confirmation
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
  if (!canvas || typeof AgentManager === 'undefined') return;
  const ctx = canvas.getContext('2d');
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;

  const padding = { top: 20, right: 20, bottom: 30, left: 60 };
  const w = canvas.width - padding.left - padding.right;
  const h = canvas.height - padding.top - padding.bottom;

  const agents = AgentManager.getAll();
  const colors = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444', '#14B8A6'];

  const agentData = agents.map((agent, i) => {
    if (agent.dailyPnLHistory && agent.dailyPnLHistory.length > 1) {
      const cum = [0];
      agent.dailyPnLHistory.forEach(d => cum.push(cum[cum.length - 1] + d));
      return { color: colors[i % colors.length], data: cum };
    }
    return { color: colors[i % colors.length], data: generateCumPnL(30, 100 + i * 30, 0.55 + i * 0.03) };
  });

  const days = Math.max(30, ...agentData.map(a => a.data.length));

  let min = 0, max = 0;
  agentData.forEach(a => { a.data.forEach(v => { min = Math.min(min, v); max = Math.max(max, v); }); });
  max *= 1.1 || 1;
  min = Math.min(min, -max * 0.1);

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

  const zeroY = padding.top + (max / (max - min)) * h;
  ctx.strokeStyle = '#2A2A38';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding.left, zeroY);
  ctx.lineTo(canvas.width - padding.right, zeroY);
  ctx.stroke();

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
  if (typeof AgentManager === 'undefined') return;
  initDefaultAgents();
  loadAlpacaSettings();
  renderAgentCards();
  startAgentUIUpdates();

  setInterval(() => {
    if (document.querySelector('[data-view="agents"]')?.classList?.contains('active') ||
        document.getElementById('view-agents')?.classList?.contains('active')) {
      drawAgentPerfChartLive();
    }
  }, 5000);

  AgentManager.getAll().forEach(agent => {
    agent.on('stateChange', () => renderAgentCards());
    agent.on('guardrailTriggered', () => renderAgentCards());
  });
}

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
