/* ============================================
   GREY SANKORE - AI Analysis Engine
   Client-side module for the Greystone Trading Platform
   ============================================ */

const GreySankore = (function () {

  // ---- Configuration ----
  const MAX_HISTORY = 20;
  let conversationHistory = [];
  let isStreaming = false;

  // ---- Mock Responses (fallback when no API key) ----
  // Each entry has keyword patterns and an HTML response
  const MOCK_RESPONSE_MAP = [
    {
      keywords: ['nvda', 'nvidia'],
      html: `<p><strong>NVDA - Bull/Bear Analysis</strong></p><p>The setup here is compelling but not without risk. Let me break it down:</p><ul><li><strong>Bull case:</strong> Call volume at $950 strike is 3.2x the 20-day average. $12.4M in premium swept at the ask in the last 30 minutes. Dark pool prints at $928.50 suggest institutional accumulation. GTC keynote catalyst in 3 days historically drives 5-8% moves. Data center revenue guidance likely to exceed consensus by 10-15%.</li><li><strong>Bear case:</strong> Forward P/E at 38x is rich by any historical standard. Short interest ticking up 12% week-over-week. China export restrictions could dampen H2 guidance. The $950 strike concentration could become a pin target if MMs need to hedge gamma.</li></ul><p><strong>My read:</strong> 65/35 bullish skew. I'd structure this as a $920/$960 call spread expiring post-GTC rather than naked calls. Defined risk, and you capture the meat of the move if it runs.</p>`
    },
    {
      keywords: ['market outlook', 'market', 'outlook', 'macro', 'economy'],
      html: `<p><strong>Current Market Outlook</strong></p><p>Here is my read across the key indicators:</p><ul><li><strong>VIX at 18.73:</strong> Elevated but not panicked. This is a "cautious" environment, not a "fearful" one. Options are reasonably priced for hedging.</li><li><strong>Sector rotation:</strong> Tech and communication services leading, utilities and staples lagging. This is textbook risk-on behavior.</li><li><strong>10Y yield:</strong> Ticking up toward 4.35%. If it breaks above that level, expect growth names to face headwinds. Below 4.20% and we get a relief rally.</li><li><strong>Breadth:</strong> NYSE advance/decline ratio improving. Small caps (IWM) starting to participate, which is healthy for the broader trend.</li><li><strong>FOMC signal:</strong> Fed funds futures pricing in 2 cuts by year-end. Any hawkish shift would reset expectations quickly.</li></ul><p>Net positioning: cautiously bullish. I favor high-quality tech with strong free cash flow over speculative names. Size conservatively and use defined-risk structures.</p>`
    },
    {
      keywords: ['options play', 'best play', 'options strategy', 'options trade', 'trade idea'],
      html: `<p><strong>Top Options Play - NVDA Bull Call Spread</strong></p><p>Based on current flow analysis and volatility pricing, here is my highest-conviction setup:</p><ul><li><strong>Structure:</strong> NVDA $920/$960 Call Spread, 21 DTE</li><li><strong>Entry:</strong> ~$14.50 debit (mid-market)</li><li><strong>Max profit:</strong> $25.50 (175% return on risk)</li><li><strong>Max loss:</strong> $14.50 (the debit paid)</li><li><strong>Break-even:</strong> $934.50</li></ul><p><strong>Why this trade:</strong></p><ul><li>IV percentile at 42nd - options are not expensive relative to recent history</li><li>Call sweep activity at $950 strike suggests smart money positioning for upside</li><li>GTC keynote catalyst provides a defined event window</li><li>Spread structure limits your downside if the thesis is wrong</li></ul><p><strong>Risk management:</strong> Size this at 2-3% of portfolio. Close at 50% profit or 7 DTE, whichever comes first. If NVDA breaks below $900, reassess the thesis.</p>`
    },
    {
      keywords: ['flow', 'analyze flow', 'order flow', 'flow analysis'],
      html: `<p><strong>Flow Analysis Summary</strong></p><p>Scanning the last 4 hours of institutional activity:</p><ul><li><strong>Net premium:</strong> Bullish skew with call premium exceeding puts by ~$42M. The call/put ratio is 1.4:1, above the 20-day average of 1.1:1.</li><li><strong>Sweeps detected:</strong> 14 call sweeps vs 6 put sweeps. NVDA, AAPL, and META leading call-side aggression.</li><li><strong>Dark pool activity:</strong> 3 block prints above $10M in the last session. NVDA ($18.2M at $928.50), AAPL ($12.1M at $228.40), SPY ($24.1M at $584.00).</li><li><strong>Unusual activity:</strong> TSLA put skew steepening to 2-sigma. This often precedes a 10%+ move in either direction within 2 weeks.</li><li><strong>Sizzle index:</strong> AMD at 3.2x normal options volume, COIN at 2.8x. Both flagging elevated institutional interest.</li></ul><p>The tape reads net bullish with concentrated positioning in mega-cap tech. However, the TSLA put skew is worth watching as a potential hedge signal from large funds.</p>`
    },
    {
      keywords: ['tsla', 'tesla'],
      html: `<p><strong>TSLA - Current Analysis</strong></p><p>Tesla is showing mixed signals right now:</p><ul><li><strong>Volatility skew:</strong> 25-delta put IV exceeds 25-delta call IV by 14.2 points vs the 8.1 average. This is a 2-sigma event and suggests institutional hedging activity.</li><li><strong>Flow:</strong> Net put premium of $8.7M in the last session. Put/call ratio at 1.3:1 (bearish lean).</li><li><strong>Technicals:</strong> Trading below the 50-day MA at $242. Support at $228, resistance at $255. RSI at 41 - approaching oversold but not yet there.</li><li><strong>Catalyst risk:</strong> Earnings in 18 days. Historical earnings moves average +/-8.4%. IV is pricing in a 7.2% move, which means options are slightly cheap relative to realized.</li></ul><p><strong>My take:</strong> Neutral to slightly bearish near-term. If you want exposure, sell a $220/$215 put spread to collect premium from the elevated IV. If you are bearish, a $235/$220 put spread at 21 DTE offers good risk/reward.</p>`
    },
    {
      keywords: ['aapl', 'apple'],
      html: `<p><strong>AAPL - Multi-Factor View</strong></p><ul><li><strong>Valuation:</strong> Trading at 28.4x forward P/E, a slight premium to its 5Y average of 26.1x. FCF yield at 3.8%. Not cheap, but not stretched given the buyback machine.</li><li><strong>Flow signals:</strong> Steady call accumulation at $230-235 strikes for monthly expiry. $12.1M dark pool print at $228.40 suggests institutional interest.</li><li><strong>Technicals:</strong> Consolidating in a tight range ($225-232) for 8 sessions. Bollinger Band width at 6-month low - a breakout is imminent.</li><li><strong>Catalyst:</strong> Services revenue growth re-accelerating. App Store take rate under regulatory pressure is the key risk.</li></ul><p>I'd classify AAPL as a "wait for confirmation" setup. A break above $232 on volume is the entry trigger. Below $224 and the thesis breaks. Use a call spread or butterfly to define your risk.</p>`
    },
    {
      keywords: ['spy', 'spx', 's&p', 'index', 'indices'],
      html: `<p><strong>SPY / S&P 500 Analysis</strong></p><p>The index is at an interesting inflection point:</p><ul><li><strong>Price action:</strong> SPY at $584.23, sitting just below the all-time high of $587.40. Consolidation pattern with higher lows suggests buyers are in control.</li><li><strong>Breadth:</strong> 68% of S&P components above their 50-day MA, up from 54% two weeks ago. Improving breadth is bullish for continuation.</li><li><strong>Put/call open interest:</strong> Massive put OI at the $575 and $570 strikes. These act as "support magnets" - market makers hedging those positions effectively put a floor under the index.</li><li><strong>Gamma exposure:</strong> Dealers are long gamma above $580, which means they sell rallies and buy dips. This compresses volatility and keeps SPY range-bound between $578-588.</li></ul><p>For directional exposure, I prefer a condor or butterfly centered around $585 to capture the range-bound nature. A breakout above $588 would change the calculus to a momentum long setup.</p>`
    },
    {
      keywords: ['risk', 'hedge', 'protect', 'portfolio protection', 'downside'],
      html: `<p><strong>Portfolio Hedging Framework</strong></p><p>Given current conditions (VIX 18.73, elevated macro uncertainty), here is my recommended hedge structure:</p><ul><li><strong>Tier 1 - Tail risk (always on):</strong> SPY 5% OTM puts, 45 DTE, rolling monthly. Cost: ~0.3% of portfolio per month. Protects against a sudden 5-10% drawdown.</li><li><strong>Tier 2 - Tactical hedge:</strong> VIX $22 calls, 30 DTE. VIX at 18.73 means these are cheap. A spike to 25+ would generate 3-4x return on the hedge.</li><li><strong>Tier 3 - Correlation break:</strong> Long GLD (gold) as a portfolio diversifier. Gold has been quietly accumulating and has low correlation to equities during stress events.</li></ul><p><strong>Sizing guide:</strong> Allocate 1-2% of total portfolio to hedging each month. Think of it as insurance - you hope it expires worthless, but it lets you sleep at night and stay positioned for upside.</p>`
    },
    {
      keywords: ['crypto', 'btc', 'bitcoin', 'eth', 'ethereum'],
      html: `<p><strong>Crypto Market Overview</strong></p><ul><li><strong>BTC at $72,841:</strong> Breaking out of a 3-week consolidation range. Volume confirmation is strong. On-chain data shows exchange outflows accelerating (bullish - fewer coins available to sell).</li><li><strong>ETH at $3,847:</strong> Lagging BTC but showing signs of catch-up. ETH/BTC ratio bouncing off support. L2 activity at all-time highs.</li><li><strong>Options flow:</strong> BTC call/put ratio at 2.1:1. Significant call open interest building at $80K and $100K strikes for June expiry. Smart money is positioned for a continued run.</li><li><strong>Risk factors:</strong> Regulatory headlines remain a wildcard. Mt. Gox distribution timeline could add temporary selling pressure. Correlation with QQQ at 0.72 means a tech selloff would drag crypto down.</li></ul><p>I am cautiously bullish on BTC with a $80K target by Q2. ETH has better risk/reward from current levels given the discount to BTC. COIN is a leveraged equity proxy if you want stock market exposure to the thesis.</p>`
    },
    {
      keywords: ['volatility', 'vix', 'vol', 'iv'],
      html: `<p><strong>Volatility Regime Analysis</strong></p><ul><li><strong>VIX at 18.73:</strong> We are in a "mild fear" regime. Not complacent (sub-14) and not panicked (above 25). This is the trickiest zone for volatility traders.</li><li><strong>Term structure:</strong> VIX futures in contango (front month below back months). This is the normal state and favors short-vol strategies, but the 2-month/1-month spread is narrowing, which sometimes precedes a vol spike.</li><li><strong>IV percentile:</strong> S&P implied vol sits at the 42nd percentile. Options are neither cheap nor expensive. Sector-level IV tells a different story though - tech IV at 28th percentile (cheap) while energy IV at 71st percentile (rich).</li><li><strong>Skew:</strong> 25-delta put skew for SPY is 4.2 points above the 6-month mean. The market is paying up for downside protection relative to recent history.</li></ul><p>Actionable takeaway: sell energy vol (overpriced) and buy tech vol (underpriced). A pairs trade like long NVDA straddle / short XLE straddle captures this divergence.</p>`
    }
  ];

  // Fallback generic responses for unmatched queries
  const MOCK_FALLBACK_RESPONSES = [
    `<p>Analyzing <strong>the current setup</strong>. Based on my multi-factor model:</p><ul><li>Current IV percentile sits at the 42nd percentile - not extreme in either direction</li><li>Options flow is net bullish with a 1.3:1 call/put premium ratio over the last 4 hours</li><li>Dark pool activity shows institutional accumulation with 3 block prints above $10M in the last session</li></ul><p>I'd classify this as a moderate conviction opportunity. The risk/reward improves if you structure it as a defined-risk spread rather than a naked directional position.</p>`,
    `<p>Good question. Let me run that through my analysis framework.</p><ul><li>Scanning options flow data across 4,200+ equities for relevant signals</li><li>Cross-referencing with dark pool prints and institutional positioning</li><li>Checking technical levels and volatility regime</li></ul><p>Based on the current data, I see a moderately bullish setup. The VIX at 18.73 keeps me from being overly aggressive, but sector rotation favors risk assets. I'd suggest defined-risk spreads over directional bets in this environment. Want me to drill into a specific ticker or strategy?</p>`,
    `<p>Running my anomaly detection scan now. Three patterns stand out:</p><ul><li><strong>Volatility compression</strong> in mega-cap tech - Bollinger Band width at 6-month lows for AAPL, MSFT, GOOGL. Historically precedes 3-5% directional moves</li><li><strong>Sector divergence</strong> between XLK (+2.4%) and XLU (-0.9%) widening to 2-sigma - risk appetite expanding</li><li><strong>Smart money flow</strong> into small-cap value (IWN) accelerating - 4 consecutive days of dark pool accumulation</li></ul><p>The small-cap signal is particularly interesting for the micro-cap universe. Want me to drill into specific names?</p>`
  ];

  // Match user query to a mock response
  function getMockResponse(query) {
    const lower = query.toLowerCase();
    for (const entry of MOCK_RESPONSE_MAP) {
      if (entry.keywords.some(kw => lower.includes(kw))) {
        return entry.html;
      }
    }
    return MOCK_FALLBACK_RESPONSES[Math.floor(Math.random() * MOCK_FALLBACK_RESPONSES.length)];
  }

  const MOCK_INSIGHTS = {
    anomaly: {
      type: 'ANOMALY DETECTED',
      tickers: ['NVDA', 'TSLA', 'AMD', 'META', 'COIN'],
      templates: [
        { ticker: 'NVDA', content: 'Unusual call volume spike at $950 strike, 3.2x normal. Dark pool prints at $928 suggest institutional accumulation ahead of GTC keynote. Historical pattern match: 78% probability of 5-8% move within 5 sessions.', confidence: 'high', label: 'High Conviction' },
        { ticker: 'TSLA', content: 'Put skew steepening to 2-sigma. 25-delta put IV exceeds call IV by 14.2 points vs 8.1 avg. Institutional hedging pattern detected. Last occurrence preceded -12% drawdown within 2 weeks.', confidence: 'medium', label: 'Medium Conviction' },
        { ticker: 'AMD', content: 'Volume divergence detected - price up +4.21% on 2.1x average volume, but options P/C ratio inverted to 1.3 (bearish). Equity-options positioning divergence often signals reversal within 3-5 sessions.', confidence: 'medium', label: 'Medium Conviction' }
      ]
    },
    value: {
      type: 'VALUE OPPORTUNITY',
      templates: [
        { ticker: 'DIS', content: 'Trading at 14.2x forward P/E vs 5Y avg of 22.1x. FCF yield at 6.8%, highest since 2012. Streaming losses narrowing faster than consensus. Risk/reward asymmetric at current levels.', confidence: 'high', label: 'High Conviction' },
        { ticker: 'PYPL', content: 'Forward P/E compressed to 15.8x vs 5Y avg of 26.9x. FCF yield 5.2% with $5B+ annual buyback program. Transaction margin inflection underappreciated by sell-side.', confidence: 'high', label: 'High Conviction' },
        { ticker: 'BABA', content: 'Deep value at 9.4x forward P/E. FCF yield 8.1% with accelerating cloud revenue. Geopolitical discount creating asymmetric setup for patient capital.', confidence: 'medium', label: 'Medium Conviction' }
      ]
    },
    momentum: {
      type: 'MOMENTUM SIGNAL',
      templates: [
        { ticker: 'PLTR', content: 'Breakout above 200-day MA with volume confirmation (3.8x avg). Government contract pipeline expanding. AI/defense narrative strengthening. RSI at 68 - approaching overbought but not yet exhausted.', confidence: 'high', label: 'High Conviction' },
        { ticker: 'COIN', content: 'Golden cross formed on daily chart. BTC correlation at 0.87 with crypto momentum accelerating. Options flow 2.1:1 call/put ratio. IV percentile at 34th, suggesting cheap upside exposure.', confidence: 'high', label: 'High Conviction' },
        { ticker: 'CRWD', content: 'Reclaiming 50-day MA after 3-week consolidation. Cybersecurity spending cycle inflecting higher. Unusual call buying at $380 strike, 2.4x normal volume.', confidence: 'medium', label: 'Medium Conviction' }
      ]
    }
  };

  // ---- Gather current market context from the DOM ----
  function gatherContext() {
    const context = {};

    // Active cap size
    const activeCapBtn = document.querySelector('#view-greysankore .cap-btn.active, .cap-toggle .cap-btn.active');
    if (activeCapBtn) {
      context.capSize = activeCapBtn.dataset.cap || activeCapBtn.textContent.trim();
    }

    // Selected ticker (from search bar or watchlist)
    const tickerSearch = document.getElementById('tickerSearch');
    if (tickerSearch && tickerSearch.value.trim()) {
      context.selectedTicker = tickerSearch.value.trim().toUpperCase();
    }

    // Watchlist prices
    const wlRows = document.querySelectorAll('.wl-row');
    if (wlRows.length > 0) {
      context.recentPrices = {};
      wlRows.forEach(row => {
        const ticker = row.querySelector('.wl-ticker');
        const price = row.querySelector('.wl-price');
        const change = row.querySelector('.wl-change');
        if (ticker && price) {
          context.recentPrices[ticker.textContent.trim()] = {
            price: price.textContent.trim(),
            change: change ? change.textContent.trim() : ''
          };
        }
      });
    }

    // Ticker tape data
    context.marketData = {
      SPY: '584.23', QQQ: '497.81', VIX: '18.73',
      DIA: '421.56', IWM: '207.43', GLD: '214.87'
    };

    return context;
  }

  // ---- Check API status ----
  async function checkApiStatus() {
    try {
      const res = await fetch('/api/ai/status');
      const data = await res.json();
      return data.configured;
    } catch (e) {
      return false;
    }
  }

  // ---- Chat with streaming ----
  async function chat(message, context) {
    if (isStreaming) return null;

    const apiConfigured = await checkApiStatus();

    if (!apiConfigured) {
      // Return a contextual mock response matched to the query
      const mockHtml = getMockResponse(message);
      // Add to history
      conversationHistory.push({ role: 'user', content: message });
      conversationHistory.push({ role: 'assistant', content: mockHtml });
      trimHistory();
      return { type: 'mock', html: mockHtml };
    }

    isStreaming = true;

    // Build history for API (plain text, not HTML)
    const apiHistory = conversationHistory.map(h => ({
      role: h.role,
      content: h.content
    }));

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          context: context || gatherContext(),
          history: apiHistory
        })
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Request failed' }));
        isStreaming = false;
        if (err.error === 'no_api_key') {
          return { type: 'error', error: 'no_api_key', message: 'No API key configured. Go to Settings to add your Anthropic API key.' };
        }
        return { type: 'error', error: 'api_error', message: err.message || 'API request failed' };
      }

      // Return a stream reader
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      return {
        type: 'stream',
        reader,
        decoder,
        read: async function (onChunk, onDone) {
          let fullText = '';
          let buffer = '';

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const data = line.slice(6).trim();
                  if (data === '[DONE]') {
                    conversationHistory.push({ role: 'user', content: message });
                    conversationHistory.push({ role: 'assistant', content: fullText });
                    trimHistory();
                    isStreaming = false;
                    if (onDone) onDone(fullText);
                    return fullText;
                  }
                  try {
                    const parsed = JSON.parse(data);
                    if (parsed.type === 'text' && parsed.text) {
                      fullText += parsed.text;
                      if (onChunk) onChunk(parsed.text, fullText);
                    } else if (parsed.type === 'error') {
                      isStreaming = false;
                      if (onDone) onDone(fullText, parsed.error);
                      return fullText;
                    }
                  } catch (e) {
                    // Skip unparseable
                  }
                }
              }
            }
          } catch (e) {
            isStreaming = false;
            if (onDone) onDone(fullText, e.message);
          }

          // If we exit the loop without [DONE]
          if (fullText) {
            conversationHistory.push({ role: 'user', content: message });
            conversationHistory.push({ role: 'assistant', content: fullText });
            trimHistory();
          }
          isStreaming = false;
          if (onDone) onDone(fullText);
          return fullText;
        }
      };
    } catch (e) {
      isStreaming = false;
      return { type: 'error', error: 'network', message: 'Failed to connect to server. Is the backend running?' };
    }
  }

  // ---- Analyze Anomaly ----
  async function analyzeAnomaly(ticker, data) {
    const apiConfigured = await checkApiStatus();

    if (!apiConfigured) {
      // Return mock anomaly
      const mock = MOCK_INSIGHTS.anomaly.templates.find(t => t.ticker === ticker) || MOCK_INSIGHTS.anomaly.templates[0];
      return { type: 'mock', analysis: mock };
    }

    try {
      const prompt = `Perform a detailed anomaly analysis on ${ticker}. ${data ? 'Current data: ' + JSON.stringify(data) : ''} Identify any unusual options flow, volume divergences, volatility skew anomalies, and dark pool activity. Provide specific entry/exit/stop levels if a trade opportunity exists. Format response in HTML with <p>, <strong>, <ul>/<li> tags.`;

      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, type: 'anomaly' })
      });

      if (!res.ok) return { type: 'error', error: 'API request failed' };
      const result = await res.json();
      return { type: 'ai', analysis: result.text };
    } catch (e) {
      return { type: 'error', error: e.message };
    }
  }

  // ---- Screen Value Opportunities ----
  async function screenValue(universe) {
    const apiConfigured = await checkApiStatus();

    if (!apiConfigured) {
      return { type: 'mock', opportunities: MOCK_INSIGHTS.value.templates };
    }

    try {
      const prompt = `Screen the ${universe || 'Large'} Cap universe for value opportunities. Identify the top 3-5 tickers with the most compelling risk/reward based on: forward P/E compression vs historical, FCF yield, EV/EBITDA, and mean-reversion signals. For each, provide ticker, key metrics, conviction level (High/Medium/Low), and a one-sentence thesis. Format as HTML.`;

      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, type: 'value' })
      });

      if (!res.ok) return { type: 'error', error: 'API request failed' };
      const result = await res.json();
      return { type: 'ai', analysis: result.text };
    } catch (e) {
      return { type: 'error', error: e.message };
    }
  }

  // ---- Generate Insight Cards ----
  async function generateInsights(marketData) {
    const apiConfigured = await checkApiStatus();

    if (!apiConfigured) {
      // Return mock insights
      return {
        type: 'mock',
        insights: [
          { ...MOCK_INSIGHTS.anomaly.templates[0], type: 'anomaly', typeLabel: 'ANOMALY DETECTED' },
          { ...MOCK_INSIGHTS.value.templates[0], type: 'value', typeLabel: 'VALUE OPPORTUNITY' },
          { ...MOCK_INSIGHTS.momentum.templates[0], type: 'momentum', typeLabel: 'MOMENTUM SIGNAL' }
        ]
      };
    }

    try {
      const prompt = `Generate 3 fresh market insight cards for the Greystone Trading dashboard. Include:
1. One ANOMALY DETECTED card - unusual options flow, volume divergence, or volatility pattern
2. One VALUE OPPORTUNITY card - undervalued ticker with specific metrics
3. One MOMENTUM SIGNAL card - technical breakout or trend signal

For each card, provide: ticker (uppercase), one paragraph of analysis with specific numbers and metrics, and conviction level (high/medium/low).

${marketData ? 'Current market context: ' + JSON.stringify(marketData) : ''}

Respond in valid JSON array format only, no markdown:
[{"type":"anomaly","typeLabel":"ANOMALY DETECTED","ticker":"XXX","content":"...","confidence":"high","label":"High Conviction"},...]`;

      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, type: 'insights' })
      });

      if (!res.ok) {
        return {
          type: 'mock',
          insights: [
            { ...MOCK_INSIGHTS.anomaly.templates[0], type: 'anomaly', typeLabel: 'ANOMALY DETECTED' },
            { ...MOCK_INSIGHTS.value.templates[0], type: 'value', typeLabel: 'VALUE OPPORTUNITY' },
            { ...MOCK_INSIGHTS.momentum.templates[0], type: 'momentum', typeLabel: 'MOMENTUM SIGNAL' }
          ]
        };
      }

      const result = await res.json();

      try {
        // Try to parse the AI response as JSON
        let insights = JSON.parse(result.text);
        if (Array.isArray(insights) && insights.length >= 3) {
          return { type: 'ai', insights };
        }
      } catch (e) {
        // If JSON parsing fails, try to extract from the text
        const jsonMatch = result.text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          try {
            const insights = JSON.parse(jsonMatch[0]);
            if (Array.isArray(insights)) return { type: 'ai', insights };
          } catch (e2) {}
        }
      }

      // Fall back to mock if parsing fails
      return {
        type: 'mock',
        insights: [
          { ...MOCK_INSIGHTS.anomaly.templates[0], type: 'anomaly', typeLabel: 'ANOMALY DETECTED' },
          { ...MOCK_INSIGHTS.value.templates[0], type: 'value', typeLabel: 'VALUE OPPORTUNITY' },
          { ...MOCK_INSIGHTS.momentum.templates[0], type: 'momentum', typeLabel: 'MOMENTUM SIGNAL' }
        ]
      };
    } catch (e) {
      return {
        type: 'mock',
        insights: [
          { ...MOCK_INSIGHTS.anomaly.templates[0], type: 'anomaly', typeLabel: 'ANOMALY DETECTED' },
          { ...MOCK_INSIGHTS.value.templates[0], type: 'value', typeLabel: 'VALUE OPPORTUNITY' },
          { ...MOCK_INSIGHTS.momentum.templates[0], type: 'momentum', typeLabel: 'MOMENTUM SIGNAL' }
        ]
      };
    }
  }

  // ---- Save API Key ----
  async function saveApiKey(key) {
    try {
      const res = await fetch('/api/ai/key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: key })
      });
      const data = await res.json();
      if (res.ok) {
        // Also save to localStorage for UI persistence
        localStorage.setItem('gs_anthropic_key', key);
        return { success: true };
      }
      return { success: false, error: data.error };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // ---- Validate API Key ----
  async function validateApiKey() {
    try {
      const res = await fetch('/api/ai/key/validate', { method: 'POST' });
      return await res.json();
    } catch (e) {
      return { valid: false, message: 'Cannot reach server' };
    }
  }

  // ---- Restore API Key from localStorage on load ----
  async function restoreApiKey() {
    const savedKey = localStorage.getItem('gs_anthropic_key');
    if (savedKey) {
      await saveApiKey(savedKey);
    }
  }

  // ---- History Management ----
  function trimHistory() {
    while (conversationHistory.length > MAX_HISTORY * 2) {
      conversationHistory.shift();
    }
  }

  function clearHistory() {
    conversationHistory = [];
  }

  function getHistory() {
    return [...conversationHistory];
  }

  function isCurrentlyStreaming() {
    return isStreaming;
  }

  // ---- Public API ----
  return {
    chat,
    analyzeAnomaly,
    screenValue,
    generateInsights,
    saveApiKey,
    validateApiKey,
    restoreApiKey,
    gatherContext,
    checkApiStatus,
    clearHistory,
    getHistory,
    isCurrentlyStreaming
  };

})();
