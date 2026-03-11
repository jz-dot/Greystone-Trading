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
  const MOCK_RESPONSES = [
    `<p>Analyzing <strong>the current setup</strong>. Based on my multi-factor model:</p><ul><li>Current IV percentile sits at the 42nd percentile - not extreme in either direction</li><li>Options flow is net bullish with a 1.3:1 call/put premium ratio over the last 4 hours</li><li>Dark pool activity shows institutional accumulation with 3 block prints above $10M in the last session</li></ul><p>I'd classify this as a moderate conviction opportunity. The risk/reward improves if you structure it as a defined-risk spread rather than a naked directional position.</p>`,
    `<p>Good question. Here's my current read on market conditions:</p><ul><li>The VIX at 18.73 suggests mild fear, but not panic - options are reasonably priced</li><li>Sector rotation is favoring tech and communication services, which typically precedes risk-on behavior</li><li>The 10Y yield ticking up could pressure growth names if it accelerates past 4.35%</li></ul><p>Net positioning: cautiously bullish, but sizing conservatively given the macro uncertainty. I'm watching FOMC minutes closely for rate path signals.</p>`,
    `<p>Running my anomaly detection scan now. Three patterns stand out:</p><ul><li><strong>Volatility compression</strong> in mega-cap tech - BB width at 6-month lows for AAPL, MSFT, GOOGL. Historically precedes 3-5% directional moves</li><li><strong>Sector divergence</strong> between XLK (+2.4%) and XLU (-0.9%) widening to 2-sigma - risk appetite expanding</li><li><strong>Smart money flow</strong> into small-cap value (IWN) accelerating - 4 consecutive days of dark pool accumulation</li></ul><p>The small-cap signal is particularly interesting for the micro-cap universe. Want me to drill into specific names?</p>`
  ];

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
      // Return a mock response
      const mockHtml = MOCK_RESPONSES[Math.floor(Math.random() * MOCK_RESPONSES.length)];
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
