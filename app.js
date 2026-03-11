/* ============================================
   GREYSTONE TRADING PLATFORM - Core Engine
   ============================================ */

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
tickerData.forEach(t => {
  const item = document.createElement('div');
  item.className = 'ticker-item';
  item.innerHTML = `<span class="ticker-sym">${t.sym}</span><span class="ticker-price">${t.price}</span><span class="ticker-chg ${t.dir}">${t.chg}</span>`;
  tickerEl.appendChild(item);
});

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
  }, 200);
});

document.addEventListener('DOMContentLoaded', init);
// Also run immediately in case DOM is already loaded
if (document.readyState !== 'loading') init();
