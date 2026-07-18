'use strict';

const test = require('node:test');
const assert = require('node:assert');
const BI = require('../services/broker-import.js');

// ---- Questrade ----

const QT_SAMPLE = {
  positions: [
    { symbol: 'AAPL', description: 'APPLE INC', openQuantity: 100, averageEntryPrice: 150.25, currentPrice: 190.1, currentMarketValue: 19010 },
    { symbol: 'XIU.TO', description: 'ISHARES S&P/TSX 60', openQuantity: 250, averageEntryPrice: 31.4, currentPrice: 33.2, currentMarketValue: 8300 },
    { symbol: 'GME', description: 'GAMESTOP', openQuantity: -50, averageEntryPrice: 25, currentPrice: 22, currentMarketValue: -1100 },
    { symbol: 'OLD', description: 'CLOSED OUT', openQuantity: 0, averageEntryPrice: 10, currentPrice: 12, currentMarketValue: 0 },
  ],
};

test('questrade: long positions normalize with inferred currency', () => {
  const r = BI.normalizeQuestrade(QT_SAMPLE, '123456');
  assert.strictEqual(r.broker, 'questrade');
  assert.strictEqual(r.account, '123456');
  assert.strictEqual(r.positions.length, 2);

  const aapl = r.positions.find(p => p.symbol === 'AAPL');
  assert.strictEqual(aapl.qty, 100);
  assert.strictEqual(aapl.avgPrice, 150.25);
  assert.strictEqual(aapl.currency, 'USD');
  assert.strictEqual(aapl.marketPrice, 190.1);

  const xiu = r.positions.find(p => p.symbol === 'XIU.TO');
  assert.strictEqual(xiu.currency, 'CAD');
});

test('questrade: shorts and closed positions are skipped WITH reasons, never silently', () => {
  const r = BI.normalizeQuestrade(QT_SAMPLE, null);
  assert.strictEqual(r.skipped.length, 2);
  const short = r.skipped.find(s => s.symbol === 'GME');
  assert.match(short.reason, /short/i);
  const closed = r.skipped.find(s => s.symbol === 'OLD');
  assert.match(closed.reason, /closed/i);
});

test('questrade: malformed payloads produce an empty, well-formed result', () => {
  for (const raw of [null, {}, { positions: null }, { positions: 'junk' }]) {
    const r = BI.normalizeQuestrade(raw, null);
    assert.deepStrictEqual(r.positions, []);
    assert.deepStrictEqual(r.skipped, []);
  }
});

// ---- IBKR ----

const IBKR_SAMPLE = [
  { ticker: 'MSFT', contractDesc: 'MICROSOFT CORP', position: 40, avgPrice: 310.5, mktPrice: 430.2, mktValue: 17208, currency: 'USD', assetClass: 'STK', listingExchange: 'NASDAQ' },
  { ticker: 'SHOP', contractDesc: 'SHOPIFY INC', position: 60, avgPrice: 95.1, mktPrice: 110.4, mktValue: 6624, currency: 'CAD', assetClass: 'STK', listingExchange: 'TSE' },
  { ticker: 'ES', contractDesc: 'E-MINI S&P', position: 2, avgPrice: 5000, mktPrice: 5100, mktValue: 510000, currency: 'USD', assetClass: 'FUT', listingExchange: 'GLOBEX' },
  { ticker: 'TSLA', contractDesc: 'TESLA INC', position: -10, avgPrice: 250, mktPrice: 240, mktValue: -2400, currency: 'USD', assetClass: 'STK', listingExchange: 'NASDAQ' },
];

test('ibkr: stocks normalize; CAD TSX tickers get the .TO suffix', () => {
  const r = BI.normalizeIbkr(IBKR_SAMPLE, 'U1234567');
  assert.strictEqual(r.broker, 'ibkr');
  assert.strictEqual(r.positions.length, 2);

  const msft = r.positions.find(p => p.symbol === 'MSFT');
  assert.strictEqual(msft.qty, 40);
  assert.strictEqual(msft.avgPrice, 310.5);
  assert.strictEqual(msft.currency, 'USD');

  const shop = r.positions.find(p => p.symbol === 'SHOP.TO');
  assert.ok(shop, 'TSX ticker should be suffixed to SHOP.TO');
  assert.strictEqual(shop.currency, 'CAD');
});

test('ibkr: non-stock assets and shorts are skipped with reasons', () => {
  const r = BI.normalizeIbkr(IBKR_SAMPLE, null);
  assert.strictEqual(r.skipped.length, 2);
  const fut = r.skipped.find(s => s.symbol === 'ES');
  assert.match(fut.reason, /non-stock/i);
  const short = r.skipped.find(s => s.symbol === 'TSLA');
  assert.match(short.reason, /short/i);
});

test('ibkr: avgCost is used when avgPrice is absent', () => {
  const r = BI.normalizeIbkr([
    { ticker: 'NVDA', position: 10, avgCost: 450.75, mktPrice: 900, mktValue: 9000, currency: 'USD', assetClass: 'STK' },
  ], null);
  assert.strictEqual(r.positions[0].avgPrice, 450.75);
});

test('ibkr: malformed payloads produce an empty, well-formed result', () => {
  for (const raw of [null, {}, 'junk', [{}], [{ ticker: '' }]]) {
    const r = BI.normalizeIbkr(raw, null);
    assert.deepStrictEqual(r.positions, []);
  }
});

// ---- currency inference ----

test('inferCurrency mirrors the tracker heuristic', () => {
  assert.strictEqual(BI.inferCurrency('XIU.TO'), 'CAD');
  assert.strictEqual(BI.inferCurrency('wcp.v'), 'CAD');
  assert.strictEqual(BI.inferCurrency('TOI.NE'), 'CAD');
  assert.strictEqual(BI.inferCurrency('CURA.CN'), 'CAD');
  assert.strictEqual(BI.inferCurrency('AAPL'), 'USD');
});
