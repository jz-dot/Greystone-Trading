'use strict';

const test = require('node:test');
const assert = require('node:assert');
const CsvIO = require('../services/csv-io.js');

/* ---------- parseCsv ---------- */

test('parseCsv handles plain LF input with a trailing newline', () => {
  const r = CsvIO.parseCsv('symbol,shares,price\nSHOP.TO,10,150.25\nAAPL,5,200\n');
  assert.deepStrictEqual(r.headers, ['symbol', 'shares', 'price']);
  assert.deepStrictEqual(r.rows, [
    ['SHOP.TO', '10', '150.25'],
    ['AAPL', '5', '200'],
  ]);
});

test('parseCsv handles quoted fields: commas, escaped quotes, embedded newlines, CRLF', () => {
  const text = 'Symbol,Description,Price\r\n' +
    'BRK.B,"Berkshire Hathaway, Class ""B""",412.10\r\n' +
    'XYZ,"line one\r\nline two",9.99\r\n';
  const r = CsvIO.parseCsv(text);
  assert.deepStrictEqual(r.headers, ['Symbol', 'Description', 'Price']);
  assert.deepStrictEqual(r.rows[0], ['BRK.B', 'Berkshire Hathaway, Class "B"', '412.10']);
  assert.deepStrictEqual(r.rows[1], ['XYZ', 'line one\r\nline two', '9.99']);
});

test('parseCsv strips a UTF-8 BOM from the first header', () => {
  const r = CsvIO.parseCsv('﻿symbol,shares\nT.TO,100\n');
  assert.strictEqual(r.headers[0], 'symbol');
  assert.deepStrictEqual(r.rows, [['T.TO', '100']]);
});

test('parseCsv skips empty lines (LF, CRLF, and no trailing newline)', () => {
  const r = CsvIO.parseCsv('a,b\r\n\r\n1,2\n\n\n3,4');
  assert.deepStrictEqual(r.headers, ['a', 'b']);
  assert.deepStrictEqual(r.rows, [['1', '2'], ['3', '4']]);
  assert.deepStrictEqual(CsvIO.parseCsv(''), { headers: [], rows: [] });
});

/* ---------- guessMapping ---------- */

test('guessMapping maps a Questrade-style header set', () => {
  const headers = ['Transaction Date', 'Action', 'Symbol', 'Description', 'Quantity',
    'Price', 'Gross Amount', 'Commission', 'Net Amount', 'Currency', 'Account Type'];
  const m = CsvIO.guessMapping(headers);
  assert.deepStrictEqual(m, {
    symbol: 2, date: 0, type: 1, shares: 4, price: 5,
    commission: 7, currency: 9, account: 10,
  });
});

test('guessMapping maps a Wealthsimple-ish header set (case-insensitive, punctuation-tolerant)', () => {
  const headers = ['trade date', 'Buy/Sell', 'security', 'units',
    'Price Per Share', 'Commission ($)', 'CCY', 'Account #'];
  const m = CsvIO.guessMapping(headers);
  assert.deepStrictEqual(m, {
    symbol: 2, date: 0, type: 1, shares: 3, price: 4,
    commission: 5, currency: 6, account: 7,
  });
});

test('guessMapping maps a generic minimal set and leaves unmatched fields null', () => {
  const m = CsvIO.guessMapping(['Ticker', 'Date', 'Type', 'Qty', 'Unit Price']);
  assert.deepStrictEqual(m, {
    symbol: 0, date: 1, type: 2, shares: 3, price: 4,
    commission: null, currency: null, account: null,
  });
});

/* ---------- normalizeRows ---------- */

const FULL_MAPPING = {
  symbol: 0, date: 1, type: 2, shares: 3, price: 4,
  commission: 5, currency: 6, account: 7,
};

test('normalizeRows produces a clean txn: uppercased symbol, ISO date, normalized type and currency', () => {
  const rows = [
    ['  shop.to ', '2026-07-02', 'Bought', '10', '150.25', '4.95', 'cad', 'TFSA'],
    ['AAPL', '7/2/2026', 'SOLD', '5', '200', '', 'usd', ''],
  ];
  const r = CsvIO.normalizeRows(rows, FULL_MAPPING);
  assert.deepStrictEqual(r.errors, []);
  assert.deepStrictEqual(r.txns[0], {
    symbol: 'SHOP.TO', date: '2026-07-02', type: 'buy', shares: 10,
    price: 150.25, commission: 4.95, currency: 'CAD', account: 'TFSA',
  });
  assert.deepStrictEqual(r.txns[1], {
    symbol: 'AAPL', date: '2026-07-02', type: 'sell', shares: 5,
    price: 200, commission: 0, currency: 'USD', account: null,
  });
});

test('normalizeRows converts negative-share buys to sells and abs()es negative-share sells', () => {
  const rows = [
    ['XIU.TO', '2026-01-15', 'Buy', '-100', '32.50', '', 'CAD', ''],
    ['XIU.TO', '2026-01-16', 'Sell', '(50)', '33.00', '', 'CAD', ''],
  ];
  const r = CsvIO.normalizeRows(rows, FULL_MAPPING);
  assert.deepStrictEqual(r.errors, []);
  assert.strictEqual(r.txns[0].type, 'sell');
  assert.strictEqual(r.txns[0].shares, 100);
  assert.strictEqual(r.txns[1].type, 'sell');
  assert.strictEqual(r.txns[1].shares, 50);
});

test('normalizeRows reports unsupported types per line and keeps parsing the valid rows', () => {
  const rows = [
    ['T.TO', '2026-03-01', 'Buy', '100', '55.10', '', 'CAD', ''],
    ['T.TO', '2026-03-15', 'DIV', '', '', '', 'CAD', ''],
    ['T.TO', '2026-03-15', 'DRIP', '1.2', '54.80', '', 'CAD', ''],
    ['T.TO', '2026-04-01', 'Transfer', '100', '0', '', 'CAD', ''],
    ['T.TO', '2026-05-01', 'Sell', '50', '58.00', '', 'CAD', ''],
  ];
  const r = CsvIO.normalizeRows(rows, FULL_MAPPING);
  assert.strictEqual(r.txns.length, 2);
  assert.deepStrictEqual(r.errors.map((e) => e.line), [3, 4, 5]);
  assert.match(r.errors[0].reason, /unsupported type "DIV"/);
  assert.match(r.errors[1].reason, /unsupported type "DRIP"/);
  assert.match(r.errors[2].reason, /unsupported type "Transfer"/);
});

test('normalizeRows strips $, commas, and parentheses from numbers', () => {
  const rows = [
    ['GOOG', '2026-02-10', 'Buy', '1,000', '$1,234.56', '(4.95)', 'USD', 'Margin'],
    ['GOOG', '2026-02-11', 'Sell', '500', 'US$1,300.00', '-9.99', 'USD', 'Margin'],
  ];
  const r = CsvIO.normalizeRows(rows, FULL_MAPPING);
  assert.deepStrictEqual(r.errors, []);
  assert.strictEqual(r.txns[0].shares, 1000);
  assert.strictEqual(r.txns[0].price, 1234.56);
  assert.strictEqual(r.txns[0].commission, 4.95, 'parenthesized commission recorded as positive');
  assert.strictEqual(r.txns[1].price, 1300);
  assert.strictEqual(r.txns[1].commission, 9.99, 'negative commission recorded as positive');
});

test('normalizeRows date handling: accepts ISO, slash-YMD, US M/D/YYYY, datetime; rejects ambiguous and invalid', () => {
  const mk = (date) => [['A', date, 'Buy', '1', '10', '', '', '']];
  const ok = (date, expect) => {
    const r = CsvIO.normalizeRows(mk(date), FULL_MAPPING);
    assert.deepStrictEqual(r.errors, [], 'expected "' + date + '" to parse');
    assert.strictEqual(r.txns[0].date, expect);
  };
  const bad = (date, reasonRe) => {
    const r = CsvIO.normalizeRows(mk(date), FULL_MAPPING);
    assert.strictEqual(r.txns.length, 0, 'expected "' + date + '" to be rejected');
    assert.strictEqual(r.errors[0].line, 2);
    assert.match(r.errors[0].reason, reasonRe);
  };
  ok('2026-07-02', '2026-07-02');
  ok('2026/7/2', '2026-07-02');
  ok('7/2/2026', '2026-07-02');
  ok('2026-07-02T14:30:00Z', '2026-07-02');
  ok('2026-07-02 09:15:00', '2026-07-02');
  ok('2024-02-29', '2024-02-29');           // leap day
  bad('02-07-2026', /ambiguous date/);      // DD-MM-YYYY vs MM-DD-YYYY
  bad('13/13/2026', /invalid date/);        // no 13th month
  bad('2026-02-30', /invalid date/);        // no Feb 30
  bad('July 2 2026', /unrecognized date/);
});

test('normalizeRows returns a single line-0 error when a required column is unmapped', () => {
  const r = CsvIO.normalizeRows([['A', '2026-01-01', 'Buy']], {
    symbol: 0, date: 1, type: 2, shares: null, price: null,
    commission: null, currency: null, account: null,
  });
  assert.deepStrictEqual(r.txns, []);
  assert.strictEqual(r.errors.length, 1);
  assert.strictEqual(r.errors[0].line, 0);
  assert.match(r.errors[0].reason, /missing required column\(s\): shares, price/);
});

test('normalizeRows defaults: commission 0 and currency/account null when columns absent', () => {
  const r = CsvIO.normalizeRows([['msft', '2026-06-30', 'b', '10', '450']], {
    symbol: 0, date: 1, type: 2, shares: 3, price: 4,
    commission: null, currency: null, account: null,
  });
  assert.deepStrictEqual(r.errors, []);
  assert.deepStrictEqual(r.txns[0], {
    symbol: 'MSFT', date: '2026-06-30', type: 'buy', shares: 10,
    price: 450, commission: 0, currency: null, account: null,
  });
});

test('normalizeRows rejects a currency it cannot normalize to CAD/USD', () => {
  const rows = [
    ['SAP', '2026-05-05', 'Buy', '10', '180', '', 'EUR', ''],
    ['RY.TO', '2026-05-05', 'Buy', '10', '135', '', 'CDN', ''],
  ];
  const r = CsvIO.normalizeRows(rows, FULL_MAPPING);
  assert.strictEqual(r.errors.length, 1);
  assert.strictEqual(r.errors[0].line, 2);
  assert.match(r.errors[0].reason, /unsupported currency "EUR"/);
  assert.strictEqual(r.txns[0].currency, 'CAD', 'CDN normalizes to CAD');
});

/* ---------- toCsv ---------- */

test('toCsv quotes only tricky fields, doubles quotes, ends lines with CRLF', () => {
  const out = CsvIO.toCsv(['a', 'b', 'c'], [
    ['plain', 'has,comma', 'has "quote"'],
    ['multi\nline', '', 'x'],
  ]);
  assert.strictEqual(out,
    'a,b,c\r\n' +
    'plain,"has,comma","has ""quote"""\r\n' +
    '"multi\nline",,x\r\n');
});

test('toCsv -> parseCsv round-trips tricky fields exactly', () => {
  const headers = ['Symbol', 'Note', 'Value'];
  const rows = [
    ['BRK.B', 'Class "B", not "A"', '412.10'],
    ['X', 'first\r\nsecond, third', '0'],
    ['Y', '', 'trailing'],
  ];
  const back = CsvIO.parseCsv(CsvIO.toCsv(headers, rows));
  assert.deepStrictEqual(back.headers, headers);
  assert.deepStrictEqual(back.rows, rows);
});

/* ---------- flatteners ---------- */

test('holdingsToCsv writes the report header row and formatted values', () => {
  const out = CsvIO.holdingsToCsv([{
    symbol: 'SHOP.TO', name: 'Shopify, Inc.', account: 'TFSA', currency: 'CAD',
    shares: 12.5, avgCost: 101.2345, acbPerShareBase: 101.2345,
    marketValue: 1500.505, totalPL: 234.567, weight: 12.345,
  }, {
    symbol: 'CASH', name: null, account: null, currency: 'CAD',
    shares: 0, avgCost: null, acbPerShareBase: null,
    marketValue: 100, totalPL: 0, weight: 0.8,
  }]);
  const parsed = CsvIO.parseCsv(out);
  assert.deepStrictEqual(parsed.headers, CsvIO.HOLDINGS_HEADERS);
  assert.deepStrictEqual(parsed.rows[0], [
    'SHOP.TO', 'Shopify, Inc.', 'TFSA', 'CAD', '12.5',
    '101.2345', '101.2345', '1500.51', '234.57', '12.35',
  ]);
  // Nulls render as empty fields; zero shares render as '0'.
  assert.deepStrictEqual(parsed.rows[1], [
    'CASH', '', '', 'CAD', '0', '', '', '100.00', '0.00', '0.80',
  ]);
  assert.ok(out.indexOf('"Shopify, Inc."') !== -1, 'comma-bearing name is quoted');
});

test('txnsToCsv flattens positions to one row per txn with raw (unrounded) numbers', () => {
  const out = CsvIO.txnsToCsv([
    {
      symbol: 'AAPL', currency: 'USD', account: 'RRSP',
      txns: [
        { type: 'buy', date: '2026-01-10', shares: 10, price: 190.123, commission: 4.95, fxRate: 1.3512, source: 'manual' },
        { type: 'sell', date: '2026-03-01', shares: 4, price: 210, commission: 0, fxRate: 1.36, source: 'broker-import' },
      ],
    },
    {
      symbol: 'XIU.TO', currency: 'CAD', account: null,
      txns: [
        { type: 'buy', date: '2026-02-02', shares: 100, price: 32.5, commission: 0, fxRate: 1, source: null },
      ],
    },
  ]);
  const parsed = CsvIO.parseCsv(out);
  assert.deepStrictEqual(parsed.headers, CsvIO.TXNS_HEADERS);
  assert.strictEqual(parsed.rows.length, 3, 'one CSV row per transaction');
  assert.deepStrictEqual(parsed.rows[0],
    ['AAPL', 'USD', 'RRSP', 'buy', '2026-01-10', '10', '190.123', '4.95', '1.3512', 'manual']);
  assert.deepStrictEqual(parsed.rows[2],
    ['XIU.TO', 'CAD', '', 'buy', '2026-02-02', '100', '32.5', '0', '1', '']);
});

/* ---------- end-to-end ---------- */

test('a full Questrade-style export imports end to end', () => {
  const text = '﻿Transaction Date,Action,Symbol,Description,Quantity,Price,Gross Amount,Commission,Net Amount,Currency,Account Type\r\n' +
    '2026-06-01,Buy,SHOP.TO,"SHOPIFY INC, CL A",25,"$95.50","-2,387.50",-4.95,"-2,392.45",CAD,TFSA\r\n' +
    '2026-06-15,DIV,T.TO,TELUS CORP DIVIDEND,,,38.12,,38.12,CAD,TFSA\r\n' +
    '2026-06-20,Sell,SHOP.TO,"SHOPIFY INC, CL A",-10,101.00,1010.00,-4.95,1005.05,CAD,TFSA\r\n';
  const parsed = CsvIO.parseCsv(text);
  const mapping = CsvIO.guessMapping(parsed.headers);
  const r = CsvIO.normalizeRows(parsed.rows, mapping);

  assert.strictEqual(r.txns.length, 2);
  assert.deepStrictEqual(r.txns[0], {
    symbol: 'SHOP.TO', date: '2026-06-01', type: 'buy', shares: 25,
    price: 95.5, commission: 4.95, currency: 'CAD', account: 'TFSA',
  });
  // Negative quantity on the sell row still comes out positive.
  assert.deepStrictEqual(r.txns[1], {
    symbol: 'SHOP.TO', date: '2026-06-20', type: 'sell', shares: 10,
    price: 101, commission: 4.95, currency: 'CAD', account: 'TFSA',
  });
  assert.strictEqual(r.errors.length, 1);
  assert.strictEqual(r.errors[0].line, 3, 'DIV row reported on its own line');
  assert.match(r.errors[0].reason, /unsupported type "DIV"/);
});
