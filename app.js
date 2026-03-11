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

// ---- OPTIONS CHAIN ----
function populateOptionsChain() {
  const callsBody = document.getElementById('callsChain');
  const putsBody = document.getElementById('putsChain');
  const strikeCol = document.getElementById('strikeColumn');
  if (!callsBody || !putsBody || !strikeCol) return;

  const currentPrice = 227.48;
  const strikes = [];
  for (let s = 215; s <= 245; s += 2.5) strikes.push(s);

  const daysToExp = 18;

  strikes.forEach(strike => {
    const itm = strike <= currentPrice;
    const moneyness = (currentPrice - strike) / currentPrice;

    // Call Greeks (simplified Black-Scholes approximation)
    const callDelta = Math.max(0.01, Math.min(0.99, 0.5 + moneyness * 4));
    const callGamma = Math.exp(-moneyness * moneyness * 20) * 0.04;
    const callTheta = -(0.05 + Math.random() * 0.15);
    const callVega = 0.2 + Math.random() * 0.2;
    const callIV = 28 + Math.random() * 12 + Math.abs(moneyness) * 30;
    const intrinsic = Math.max(0, currentPrice - strike);
    const timeValue = callIV * 0.08 * Math.sqrt(daysToExp / 365);
    const callLast = Math.max(0.01, intrinsic + timeValue * (5 + Math.random() * 3));
    const spread = Math.max(0.01, callLast * 0.02);
    const callBid = Math.max(0.01, callLast - spread);
    const callAsk = callLast + spread;
    const callChg = (Math.random() - 0.4) * 1.5;
    const callVol = Math.floor(Math.random() * 8000 + (itm ? 2000 : 500));
    const callOI = Math.floor(Math.random() * 25000 + 1000);

    // Put Greeks
    const putDelta = callDelta - 1;
    const putGamma = callGamma;
    const putTheta = callTheta - 0.02;
    const putVega = callVega;
    const putIV = callIV + 2;
    const putIntrinsic = Math.max(0, strike - currentPrice);
    const putLast = Math.max(0.01, putIntrinsic + timeValue * (5 + Math.random() * 3));
    const putSpread = Math.max(0.01, putLast * 0.02);
    const putBid = Math.max(0.01, putLast - putSpread);
    const putAsk = putLast + putSpread;
    const putChg = (Math.random() - 0.6) * 1.5;
    const putVol = Math.floor(Math.random() * 6000 + (itm ? 500 : 2000));
    const putOI = Math.floor(Math.random() * 20000 + 800);

    const itmClass = itm ? ' class="itm"' : '';

    // Calls row
    const callRow = document.createElement('tr');
    if (itm) callRow.className = 'itm';
    callRow.innerHTML = `
      <td class="highlight">${callLast.toFixed(2)}</td>
      <td style="color: ${callChg >= 0 ? 'var(--profit)' : 'var(--loss)'}">${callChg >= 0 ? '+' : ''}${callChg.toFixed(2)}</td>
      <td>${callBid.toFixed(2)}</td>
      <td>${callAsk.toFixed(2)}</td>
      <td>${formatK(callVol)}</td>
      <td>${formatK(callOI)}</td>
      <td>${callIV.toFixed(1)}%</td>
      <td class="greek">${callDelta.toFixed(3)}</td>
      <td class="greek">${callGamma.toFixed(4)}</td>
      <td class="greek" style="color: var(--loss)">${callTheta.toFixed(3)}</td>
      <td class="greek">${callVega.toFixed(3)}</td>
    `;
    callsBody.appendChild(callRow);

    // Strike
    const strikeDiv = document.createElement('div');
    strikeDiv.className = 'strike-row' + (Math.abs(strike - currentPrice) < 1.25 ? ' atm' : '');
    strikeDiv.textContent = strike.toFixed(1);
    strikeCol.appendChild(strikeDiv);

    // Puts row
    const putRow = document.createElement('tr');
    if (!itm) putRow.className = 'itm';
    putRow.innerHTML = `
      <td class="greek">${putVega.toFixed(3)}</td>
      <td class="greek" style="color: var(--loss)">${putTheta.toFixed(3)}</td>
      <td class="greek">${putGamma.toFixed(4)}</td>
      <td class="greek">${putDelta.toFixed(3)}</td>
      <td>${putIV.toFixed(1)}%</td>
      <td>${formatK(putOI)}</td>
      <td>${formatK(putVol)}</td>
      <td>${putAsk.toFixed(2)}</td>
      <td>${putBid.toFixed(2)}</td>
      <td style="color: ${putChg >= 0 ? 'var(--profit)' : 'var(--loss)'}">${putChg >= 0 ? '+' : ''}${putChg.toFixed(2)}</td>
      <td class="highlight">${putLast.toFixed(2)}</td>
    `;
    putsBody.appendChild(putRow);
  });
}

function formatK(n) {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toString();
}

// ---- P&L CHART ----
function drawPnLChart() {
  const canvas = document.getElementById('pnlCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;

  const strike = 230;
  const premium = 4.85;
  const breakeven = strike + premium;

  const minPrice = 210;
  const maxPrice = 260;
  const maxProfit = 20;
  const maxLoss = -premium;

  const padding = { top: 20, right: 40, bottom: 30, left: 50 };
  const w = canvas.width - padding.left - padding.right;
  const h = canvas.height - padding.top - padding.bottom;

  // Zero line
  const zeroY = padding.top + (maxProfit / (maxProfit - maxLoss)) * h;

  // Grid
  ctx.strokeStyle = '#1A1A24';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(padding.left, zeroY);
  ctx.lineTo(padding.left + w, zeroY);
  ctx.stroke();

  // Axis labels
  ctx.fillStyle = '#5C5C6E';
  ctx.font = '10px JetBrains Mono';
  ctx.textAlign = 'right';
  ctx.fillText('$0', padding.left - 5, zeroY + 3);
  ctx.fillText(`+$${maxProfit * 100}`, padding.left - 5, padding.top + 10);
  ctx.fillText(`-$${Math.abs(maxLoss * 100).toFixed(0)}`, padding.left - 5, canvas.height - padding.bottom - 5);

  ctx.textAlign = 'center';
  for (let p = minPrice; p <= maxPrice; p += 10) {
    const x = padding.left + ((p - minPrice) / (maxPrice - minPrice)) * w;
    ctx.fillText('$' + p, x, canvas.height - padding.bottom + 15);
  }

  // P&L curve
  ctx.beginPath();
  const points = [];
  for (let price = minPrice; price <= maxPrice; price += 0.5) {
    const pnl = Math.max(-premium, price - strike - premium);
    const x = padding.left + ((price - minPrice) / (maxPrice - minPrice)) * w;
    const y = padding.top + ((maxProfit - pnl) / (maxProfit - maxLoss)) * h;
    points.push({ x, y, pnl });
    if (price === minPrice) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = '#8B5CF6';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Fill profit area
  ctx.beginPath();
  let startedProfit = false;
  points.forEach(p => {
    if (p.pnl > 0 && !startedProfit) { ctx.moveTo(p.x, zeroY); startedProfit = true; }
    if (p.pnl > 0) ctx.lineTo(p.x, p.y);
  });
  if (startedProfit) {
    ctx.lineTo(points[points.length - 1].x, zeroY);
    ctx.closePath();
    ctx.fillStyle = 'rgba(16, 185, 129, 0.1)';
    ctx.fill();
  }

  // Fill loss area
  ctx.beginPath();
  let startedLoss = false;
  points.forEach(p => {
    if (p.pnl <= 0 && !startedLoss) { ctx.moveTo(p.x, zeroY); startedLoss = true; }
    if (p.pnl <= 0) ctx.lineTo(p.x, p.y);
  });
  if (startedLoss) {
    const lastLoss = points.filter(p => p.pnl <= 0).pop();
    ctx.lineTo(lastLoss.x, zeroY);
    ctx.closePath();
    ctx.fillStyle = 'rgba(239, 68, 68, 0.1)';
    ctx.fill();
  }

  // Breakeven dot
  const beX = padding.left + ((breakeven - minPrice) / (maxPrice - minPrice)) * w;
  ctx.beginPath();
  ctx.arc(beX, zeroY, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#F59E0B';
  ctx.fill();
  ctx.fillStyle = '#F59E0B';
  ctx.font = '10px JetBrains Mono';
  ctx.textAlign = 'center';
  ctx.fillText('BE: $' + breakeven.toFixed(2), beX, zeroY - 10);
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

// ---- GS CHAT ----
document.getElementById('gsChatSend')?.addEventListener('click', sendGsChat);
document.getElementById('gsChatInput')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendGsChat();
});

function sendGsChat() {
  const input = document.getElementById('gsChatInput');
  const body = document.getElementById('gsChatBody');
  if (!input || !body || !input.value.trim()) return;

  const msg = input.value.trim();
  input.value = '';

  // User message
  const userDiv = document.createElement('div');
  userDiv.className = 'gs-chat-message user';
  userDiv.innerHTML = `<div class="gs-chat-avatar" style="background: var(--bg-tertiary); color: var(--text-secondary);">ZJ</div><div class="gs-chat-content"><p>${msg}</p></div>`;
  body.appendChild(userDiv);

  // Simulated AI response
  setTimeout(() => {
    const aiDiv = document.createElement('div');
    aiDiv.className = 'gs-chat-message ai';
    const responses = [
      `<p>Analyzing <strong>${msg.split(' ').find(w => w === w.toUpperCase() && w.length <= 5) || 'the market'}</strong>. Based on my multi-factor model:</p><ul><li>Current IV percentile sits at the 42nd percentile - not extreme in either direction</li><li>Options flow is net bullish with a 1.3:1 call/put premium ratio over the last 4 hours</li><li>Dark pool activity shows institutional accumulation with 3 block prints above $10M in the last session</li></ul><p>I'd classify this as a moderate conviction opportunity. The risk/reward improves if you structure it as a defined-risk spread rather than a naked directional position.</p>`,
      `<p>Good question. Here's my current read on market conditions:</p><ul><li>The VIX at 18.73 suggests mild fear, but not panic - options are reasonably priced</li><li>Sector rotation is favoring tech and communication services, which typically precedes risk-on behavior</li><li>The 10Y yield ticking up could pressure growth names if it accelerates past 4.35%</li></ul><p>Net positioning: cautiously bullish, but sizing conservatively given the macro uncertainty. I'm watching FOMC minutes closely for rate path signals.</p>`,
      `<p>Running my anomaly detection scan now. Three patterns stand out:</p><ul><li><strong>Volatility compression</strong> in mega-cap tech - BB width at 6-month lows for AAPL, MSFT, GOOGL. Historically precedes 3-5% directional moves</li><li><strong>Sector divergence</strong> between XLK (+2.4%) and XLU (-0.9%) widening to 2-sigma - risk appetite expanding</li><li><strong>Smart money flow</strong> into small-cap value (IWN) accelerating - 4 consecutive days of dark pool accumulation</li></ul><p>The small-cap signal is particularly interesting for the micro-cap universe. Want me to drill into specific names?</p>`
    ];
    aiDiv.innerHTML = `<div class="gs-chat-avatar">GS</div><div class="gs-chat-content">${responses[Math.floor(Math.random() * responses.length)]}</div>`;
    body.appendChild(aiDiv);
    body.scrollTop = body.scrollHeight;
  }, 800);

  body.scrollTop = body.scrollHeight;
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
  drawPnLChart();
  populateFlowFeed();
  drawAgentPerfChart();
}

// Redraw on resize
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    drawCandlestickChart();
    drawVolumeChart();
    drawPnLChart();
    drawAgentPerfChart();
    drawNetFlowChart();
  }, 200);
});

document.addEventListener('DOMContentLoaded', init);
// Also run immediately in case DOM is already loaded
if (document.readyState !== 'loading') init();
