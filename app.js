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

// ---- ORDER FLOW FEED ----
function populateFlowFeed() {
  const feed = document.getElementById('flowFeed');
  if (!feed) return;

  const tickers = ['NVDA', 'AAPL', 'TSLA', 'MSFT', 'META', 'AMZN', 'AMD', 'GOOGL', 'SPY', 'QQQ'];
  const signals = ['sweep', 'block', 'unusual', '', '', ''];
  const signalLabels = { sweep: 'SWEEP', block: 'BLOCK', unusual: 'UNUSUAL' };

  for (let i = 0; i < 25; i++) {
    const ticker = tickers[Math.floor(Math.random() * tickers.length)];
    const isCall = Math.random() > 0.45;
    const basePrice = { NVDA: 924, AAPL: 227, TSLA: 249, MSFT: 419, META: 513, AMZN: 186, AMD: 179, GOOGL: 167, SPY: 584, QQQ: 498 }[ticker];
    const strike = Math.round(basePrice * (0.95 + Math.random() * 0.1) / 5) * 5;
    const side = Math.random() > 0.5 ? 'Ask' : 'Bid';
    const size = Math.floor(Math.random() * 5000 + 100);
    const premium = (size * (Math.random() * 8 + 0.5) * 100);
    const iv = (25 + Math.random() * 30).toFixed(1);
    const signal = signals[Math.floor(Math.random() * signals.length)];
    const hour = 9 + Math.floor(Math.random() * 6);
    const min = Math.floor(Math.random() * 60).toString().padStart(2, '0');
    const sec = Math.floor(Math.random() * 60).toString().padStart(2, '0');

    const exps = ['3/14', '3/21', '3/28', '4/4', '4/18'];
    const exp = exps[Math.floor(Math.random() * exps.length)];

    const row = document.createElement('div');
    row.className = 'flow-row';
    const sideClass = side === 'Ask' ? 'bullish' : 'bearish';
    const signalHtml = signal ? `<span class="${signal}">${signalLabels[signal]}</span>` : '<span>-</span>';

    row.innerHTML = `
      <span>${hour}:${min}:${sec}</span>
      <span style="font-weight:600">${ticker}</span>
      <span style="color: ${isCall ? 'var(--profit)' : 'var(--loss)'}">${isCall ? 'Call' : 'Put'}</span>
      <span>$${strike}</span>
      <span>${exp}</span>
      <span class="${sideClass}">${side}</span>
      <span>${formatK(size)}</span>
      <span style="font-weight:500">$${formatPremium(premium)}</span>
      <span>$${basePrice.toFixed(2)}</span>
      <span>${iv}%</span>
      ${signalHtml}
    `;
    feed.appendChild(row);
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

// ---- LIVE FLOW SIMULATION ----
function simulateLiveFlow() {
  const feed = document.getElementById('flowFeed');
  if (!feed || document.querySelector('[data-view="flow"]:not(.active)')) return;

  const tickers = ['NVDA', 'AAPL', 'TSLA', 'MSFT', 'META', 'AMZN', 'AMD', 'SPY'];
  const ticker = tickers[Math.floor(Math.random() * tickers.length)];
  const isCall = Math.random() > 0.45;
  const basePrice = { NVDA: 924, AAPL: 227, TSLA: 249, MSFT: 419, META: 513, AMZN: 186, AMD: 179, SPY: 584 }[ticker];
  const strike = Math.round(basePrice * (0.95 + Math.random() * 0.1) / 5) * 5;
  const now = new Date();
  const time = now.toTimeString().slice(0, 8);
  const side = Math.random() > 0.5 ? 'Ask' : 'Bid';
  const size = Math.floor(Math.random() * 3000 + 100);
  const premium = size * (Math.random() * 5 + 0.5) * 100;
  const iv = (25 + Math.random() * 25).toFixed(1);
  const signals = ['sweep', 'block', 'unusual', '', '', '', '', ''];
  const signal = signals[Math.floor(Math.random() * signals.length)];
  const signalLabels = { sweep: 'SWEEP', block: 'BLOCK', unusual: 'UNUSUAL' };
  const exps = ['3/14', '3/21', '3/28', '4/4'];
  const exp = exps[Math.floor(Math.random() * exps.length)];

  const row = document.createElement('div');
  row.className = 'flow-row';
  row.style.opacity = '0';
  row.style.transition = 'opacity 0.3s';
  const sideClass = side === 'Ask' ? 'bullish' : 'bearish';
  const signalHtml = signal ? `<span class="${signal}">${signalLabels[signal]}</span>` : '<span>-</span>';

  row.innerHTML = `
    <span>${time}</span>
    <span style="font-weight:600">${ticker}</span>
    <span style="color: ${isCall ? 'var(--profit)' : 'var(--loss)'}">${isCall ? 'Call' : 'Put'}</span>
    <span>$${strike}</span>
    <span>${exp}</span>
    <span class="${sideClass}">${side}</span>
    <span>${formatK(size)}</span>
    <span style="font-weight:500">$${formatPremium(premium)}</span>
    <span>$${basePrice.toFixed(2)}</span>
    <span>${iv}%</span>
    ${signalHtml}
  `;

  const headerRow = feed.querySelector('.flow-header-row');
  if (headerRow && headerRow.nextSibling) {
    feed.insertBefore(row, headerRow.nextSibling);
  } else {
    feed.appendChild(row);
  }
  requestAnimationFrame(() => { row.style.opacity = '1'; });

  // Remove old rows to prevent memory buildup
  const rows = feed.querySelectorAll('.flow-row');
  if (rows.length > 50) rows[rows.length - 1].remove();
}

setInterval(simulateLiveFlow, 2000);

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
  initSettingsApiKey();

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
    drawPnLChart();
    drawAgentPerfChart();
  }, 200);
});

document.addEventListener('DOMContentLoaded', init);
// Also run immediately in case DOM is already loaded
if (document.readyState !== 'loading') init();
