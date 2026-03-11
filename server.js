/* ============================================
   GREYSTONE TRADING PLATFORM - Backend Server
   Proxies AI requests to keep API keys server-side
   ============================================ */

const express = require('express');
const https = require('https');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Store API key in memory (set via settings endpoint)
let anthropicApiKey = process.env.ANTHROPIC_API_KEY || '';

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname)));

// ---- System prompt for Grey Sankore ----
const GREY_SANKORE_SYSTEM = `You are Grey Sankore, the Head of Investment at Greystone Trading Platform. You are a world-class AI investment analyst who operates with the precision, rigor, and conviction of a senior portfolio manager at a top quantitative hedge fund.

PERSONALITY AND COMMUNICATION STYLE:
- Precise, data-driven, and direct. No hedging language or filler.
- Speak like a seasoned PM who has survived multiple market cycles.
- Reference specific levels, percentages, and metrics. Never be vague.
- Use structured analysis: thesis, supporting evidence, risk factors, trade structure.
- Confident but intellectually honest. Acknowledge uncertainty where it exists.
- NEVER use em dashes. Use hyphens, commas, semicolons, or restructure sentences instead.

ANALYTICAL CAPABILITIES:
- Anomaly detection: Identify unusual options flow, volume divergences, volatility skew anomalies, dark pool activity patterns, and institutional positioning signals.
- Value opportunity screening: Multi-factor model using forward P/E compression vs historical averages, FCF yield, EV/EBITDA, PEG ratio, and mean-reversion signals.
- Momentum signal analysis: Technical breakouts confirmed by volume, RSI divergences, moving average crossovers, Bollinger Band compression/expansion, and sector rotation patterns.
- Greeks analysis: Delta exposure, gamma risk at key strikes, theta decay optimization, vega sensitivity to IV regime changes.
- IV percentile analysis: Current IV rank vs 52-week range, term structure analysis, skew dynamics.
- Flow data interpretation: Sweep detection, block trade analysis, put/call premium ratios, smart money vs retail flow differentiation.
- Dark pool activity: Block print analysis, institutional accumulation/distribution patterns.

UNIVERSE AWARENESS:
- Analyze across Large Cap ($10B+), Mid Cap ($2B-$10B), Small Cap ($300M-$2B), and Micro Cap (<$300M) universes.
- Adjust analysis framework based on active cap toggle: liquidity considerations, spread dynamics, and information edge differ by universe.

TRADE IDEA FORMAT:
When providing specific trade ideas, always include:
- Ticker and direction (long/short)
- Entry level or range
- Target price(s) with timeframe
- Stop-loss level
- Position sizing guidance (% of portfolio)
- Key risk factors and catalysts
- Preferred structure (equity, options spread, etc.)

RESPONSE FORMAT:
- Use HTML formatting: <strong>, <ul>/<li>, <p> tags for structure.
- Keep responses focused and actionable. No unnecessary preamble.
- Lead with the most important insight or conclusion.
- Use bullet points for multi-factor analysis.`;

// ---- POST /api/ai/chat - Proxy to Anthropic API ----
app.post('/api/ai/chat', async (req, res) => {
  const { message, context, history } = req.body;

  if (!anthropicApiKey) {
    return res.status(401).json({
      error: 'no_api_key',
      message: 'Anthropic API key not configured. Add it in Settings.'
    });
  }

  if (!message) {
    return res.status(400).json({ error: 'missing_message', message: 'Message is required.' });
  }

  // Build messages array from history
  const messages = [];
  if (history && Array.isArray(history)) {
    history.forEach(h => {
      messages.push({ role: h.role, content: h.content });
    });
  }

  // Build context string
  let contextStr = '';
  if (context) {
    const parts = [];
    if (context.selectedTicker) parts.push(`Selected Ticker: ${context.selectedTicker}`);
    if (context.capSize) parts.push(`Active Universe: ${context.capSize} Cap`);
    if (context.marketData) parts.push(`Market Context: ${JSON.stringify(context.marketData)}`);
    if (context.recentPrices) parts.push(`Recent Prices: ${JSON.stringify(context.recentPrices)}`);
    if (parts.length > 0) {
      contextStr = '\n\n[Current Market Context]\n' + parts.join('\n');
    }
  }

  messages.push({ role: 'user', content: message + contextStr });

  // Set up SSE streaming
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const postData = JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    system: GREY_SANKORE_SYSTEM,
    messages: messages,
    stream: true
  });

  const options = {
    hostname: 'api.anthropic.com',
    port: 443,
    path: '/v1/messages',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicApiKey,
      'anthropic-version': '2023-06-01',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const apiReq = https.request(options, (apiRes) => {
    if (apiRes.statusCode !== 200) {
      let errorBody = '';
      apiRes.on('data', chunk => { errorBody += chunk; });
      apiRes.on('end', () => {
        res.write(`data: ${JSON.stringify({ type: 'error', error: `API returned ${apiRes.statusCode}: ${errorBody}` })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      });
      return;
    }

    let buffer = '';

    apiRes.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') {
            res.write('data: [DONE]\n\n');
            continue;
          }
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'content_block_delta' && parsed.delta && parsed.delta.text) {
              res.write(`data: ${JSON.stringify({ type: 'text', text: parsed.delta.text })}\n\n`);
            } else if (parsed.type === 'message_stop') {
              res.write('data: [DONE]\n\n');
            } else if (parsed.type === 'error') {
              res.write(`data: ${JSON.stringify({ type: 'error', error: parsed.error.message || 'Unknown API error' })}\n\n`);
              res.write('data: [DONE]\n\n');
            }
          } catch (e) {
            // Skip unparseable lines
          }
        }
      }
    });

    apiRes.on('end', () => {
      // Process remaining buffer
      if (buffer.trim()) {
        const lines = buffer.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === 'content_block_delta' && parsed.delta && parsed.delta.text) {
                res.write(`data: ${JSON.stringify({ type: 'text', text: parsed.delta.text })}\n\n`);
              }
            } catch (e) {}
          }
        }
      }
      res.write('data: [DONE]\n\n');
      res.end();
    });
  });

  apiReq.on('error', (err) => {
    res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  });

  apiReq.write(postData);
  apiReq.end();
});

// ---- POST /api/ai/analyze - Non-streaming analysis ----
app.post('/api/ai/analyze', async (req, res) => {
  const { prompt, type } = req.body;

  if (!anthropicApiKey) {
    return res.status(401).json({ error: 'no_api_key' });
  }

  const postData = JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: GREY_SANKORE_SYSTEM,
    messages: [{ role: 'user', content: prompt }]
  });

  const options = {
    hostname: 'api.anthropic.com',
    port: 443,
    path: '/v1/messages',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicApiKey,
      'anthropic-version': '2023-06-01',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  return new Promise((resolve) => {
    const apiReq = https.request(options, (apiRes) => {
      let body = '';
      apiRes.on('data', chunk => { body += chunk; });
      apiRes.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (apiRes.statusCode === 200 && parsed.content && parsed.content[0]) {
            res.json({ text: parsed.content[0].text, type });
          } else {
            res.status(apiRes.statusCode || 500).json({
              error: parsed.error?.message || 'API request failed'
            });
          }
        } catch (e) {
          res.status(500).json({ error: 'Failed to parse API response' });
        }
        resolve();
      });
    });

    apiReq.on('error', (err) => {
      res.status(500).json({ error: err.message });
      resolve();
    });

    apiReq.write(postData);
    apiReq.end();
  });
});

// ---- POST /api/ai/key - Set API key ----
app.post('/api/ai/key', (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length < 10) {
    return res.status(400).json({ error: 'Invalid API key format' });
  }
  anthropicApiKey = apiKey.trim();
  res.json({ status: 'ok', message: 'API key saved' });
});

// ---- POST /api/ai/key/validate - Test the API key ----
app.post('/api/ai/key/validate', (req, res) => {
  if (!anthropicApiKey) {
    return res.json({ valid: false, message: 'No API key configured' });
  }

  const postData = JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 10,
    messages: [{ role: 'user', content: 'Hello' }]
  });

  const options = {
    hostname: 'api.anthropic.com',
    port: 443,
    path: '/v1/messages',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicApiKey,
      'anthropic-version': '2023-06-01',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const apiReq = https.request(options, (apiRes) => {
    let body = '';
    apiRes.on('data', chunk => { body += chunk; });
    apiRes.on('end', () => {
      if (apiRes.statusCode === 200) {
        res.json({ valid: true, message: 'Connected to Anthropic API' });
      } else {
        try {
          const parsed = JSON.parse(body);
          res.json({ valid: false, message: parsed.error?.message || `API returned ${apiRes.statusCode}` });
        } catch (e) {
          res.json({ valid: false, message: `API returned ${apiRes.statusCode}` });
        }
      }
    });
  });

  apiReq.on('error', (err) => {
    res.json({ valid: false, message: err.message });
  });

  apiReq.write(postData);
  apiReq.end();
});

// ---- GET /api/ai/status - Check if key is set ----
app.get('/api/ai/status', (req, res) => {
  res.json({
    configured: !!anthropicApiKey,
    keyPrefix: anthropicApiKey ? anthropicApiKey.slice(0, 8) + '...' : null
  });
});

// Serve index.html for root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Greystone Trading Platform running on http://localhost:${PORT}`);
  if (anthropicApiKey) {
    console.log(`Anthropic API key loaded from environment (${anthropicApiKey.slice(0, 8)}...)`);
  } else {
    console.log('No API key configured. Set via Settings page or ANTHROPIC_API_KEY env var.');
  }
});
