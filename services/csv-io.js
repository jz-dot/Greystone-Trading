/* ============================================
   GSP TRADING - CSV IMPORT/EXPORT (pure logic)

   Parses a broker's transaction-history CSV export into the tracker's
   ACB-ledger transaction shape, and flattens the tracker's data back
   out to CSV. Pure functions only: no DOM, no network, no storage.

   Import pipeline (the integrator wires the UI):
     parseCsv(text)            -> { headers, rows }
     guessMapping(headers)     -> canonical field -> header index (or null)
     normalizeRows(rows, map)  -> { txns, errors }   errors are per-line,
                                  never silently dropped

   Export:
     toCsv(headers, rows)      -> RFC-4180 string, CRLF line endings
     holdingsToCsv(holdings)   -> report export of current holdings
     txnsToCsv(positions)      -> one row per ledger transaction

   Conventions worth knowing:
   - parseCsv skips rows whose every field is empty (blank lines and
     bare comma lines).
   - Error line numbers are 1-based counting the header as line 1, so
     rows[0] is line 2. A missing required column reports line 0.
   - Negative shares on a buy row become a sell with positive shares
     (some brokers export sells as negative buys). Negative commissions
     are recorded as their absolute value.
   - DD-MM-YYYY (dash-separated day-first) is rejected as ambiguous;
     slash dates are read US-style (M/D/YYYY).
   ============================================ */

'use strict';

const CsvIO = (function () {

  /* ---------- parsing ---------- */

  // RFC-4180-tolerant parser: quoted fields, "" escapes, commas and
  // newlines inside quotes, CRLF/LF, trailing newline, BOM. A quote only
  // opens a quoted field at the start of a field; stray quotes mid-field
  // are kept literally rather than rejected.
  function parseCsv(text) {
    if (typeof text !== 'string' || text === '') return { headers: [], rows: [] };
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

    const records = [];
    let record = [];
    let field = '';
    let inQuotes = false;
    let i = 0;
    const n = text.length;

    function endField() {
      record.push(field);
      field = '';
    }
    function endRecord() {
      endField();
      // Skip rows with no content at all (blank lines, ",," lines).
      if (record.some(function (f) { return f !== ''; })) records.push(record);
      record = [];
    }

    while (i < n) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQuotes = false; i++; continue;
        }
        field += c; i++; continue;
      }
      if (c === '"' && field === '') { inQuotes = true; i++; continue; }
      if (c === ',') { endField(); i++; continue; }
      if (c === '\r') { i += (text[i + 1] === '\n') ? 2 : 1; endRecord(); continue; }
      if (c === '\n') { i++; endRecord(); continue; }
      field += c; i++;
    }
    if (field !== '' || record.length > 0) endRecord();

    return {
      headers: records.length ? records[0] : [],
      rows: records.slice(1),
    };
  }

  /* ---------- header mapping ---------- */

  // Variants are matched on a normalized header (lowercased, punctuation
  // collapsed) and listed in priority order: with both "Trade Date" and
  // "Settlement Date" present, the earlier variant in the list wins.
  const HEADER_VARIANTS = {
    symbol: ['symbol', 'ticker', 'security', 'security symbol', 'stock symbol',
      'symbol/ticker', 'ticker symbol', 'security id'],
    date: ['date', 'trade date', 'transaction date', 'settlement date',
      'process date', 'activity date', 'date of transaction'],
    type: ['type', 'action', 'activity', 'transaction type', 'activity type',
      'buy/sell', 'buy sell', 'action type', 'transaction', 'side'],
    shares: ['shares', 'quantity', 'qty', 'units', 'no of shares',
      'number of shares', '# of shares', 'share quantity'],
    price: ['price', 'price per share', 'unit price', 'avg price',
      'average price', 'share price', 'execution price', 'trade price'],
    commission: ['commission', 'fee', 'fees', 'commissions', 'commission fee',
      'commission and fees', 'fees and commissions'],
    currency: ['currency', 'ccy', 'market currency', 'trade currency', 'currency code'],
    account: ['account', 'account type', 'account #', 'account number',
      'account name', 'acct', 'account id'],
  };

  // Order in which fields claim header indexes; an index claimed by an
  // earlier field is not offered to a later one.
  const MAPPING_FIELDS = ['symbol', 'date', 'type', 'shares', 'price',
    'commission', 'currency', 'account'];

  function normalizeHeader(h) {
    return String(h === null || h === undefined ? '' : h)
      .toLowerCase()
      .replace(/[^a-z0-9/#]+/g, ' ')   // "Commission ($)" -> "commission"
      .replace(/\s+/g, ' ')
      .trim();
  }

  function guessMapping(headers) {
    const norm = (headers || []).map(normalizeHeader);
    const used = {};
    const mapping = {};
    MAPPING_FIELDS.forEach(function (fieldName) {
      mapping[fieldName] = null;
      const variants = HEADER_VARIANTS[fieldName];
      for (let v = 0; v < variants.length && mapping[fieldName] === null; v++) {
        for (let j = 0; j < norm.length; j++) {
          if (!used[j] && norm[j] === variants[v]) {
            mapping[fieldName] = j;
            used[j] = true;
            break;
          }
        }
      }
    });
    return mapping;
  }

  /* ---------- row normalization ---------- */

  const TYPE_MAP = {
    'buy': 'buy', 'bought': 'buy', 'purchase': 'buy', 'purchased': 'buy',
    'b': 'buy', 'buy to open': 'buy', 'bto': 'buy',
    'sell': 'sell', 'sold': 'sell', 'sale': 'sell', 's': 'sell',
    'disposition': 'sell', 'sell to close': 'sell', 'stc': 'sell',
  };

  const CURRENCY_MAP = {
    'CAD': 'CAD', 'CAD$': 'CAD', 'C$': 'CAD', 'CDN': 'CAD', 'CDN$': 'CAD',
    'USD': 'USD', 'USD$': 'USD', 'US$': 'USD', 'US': 'USD',
  };

  // "$1,234.56" -> 1234.56, "(4.95)" -> -4.95, "US$2.50" -> 2.5.
  // Returns NaN for anything that is not a clean number after stripping.
  function parseNumber(raw) {
    if (raw === null || raw === undefined) return NaN;
    let s = String(raw).trim();
    if (s === '') return NaN;
    let neg = false;
    const paren = /^\((.*)\)$/.exec(s);
    if (paren) { neg = true; s = paren[1]; }
    s = s.replace(/[$,\s]/g, '');
    s = s.replace(/^[A-Za-z]{1,3}(?=[\d.+-])/, '');  // leading CAD/US prefix
    if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
    let v = Number(s);
    if (neg) v = -v;
    return v;
  }

  function isLeapYear(y) {
    return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  }

  function daysInMonth(y, mo) {
    return [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  }

  function pad2(v) {
    return (v < 10 ? '0' : '') + v;
  }

  function checkYmd(raw, y, mo, d) {
    if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) {
      return { error: 'invalid date "' + raw + '"' };
    }
    return { value: y + '-' + pad2(mo) + '-' + pad2(d) };
  }

  // Accepted: YYYY-MM-DD, YYYY/MM/DD, M/D/YYYY (US-style), each with an
  // optional trailing time portion ("2026-07-02 09:30:00", ISO "T...").
  // Rejected: D-M-YYYY / M-D-YYYY dash forms (ambiguous), anything else.
  function normalizeDate(raw) {
    const s = String(raw === null || raw === undefined ? '' : raw)
      .trim()
      .replace(/[T ].*$/, '');   // drop a time-of-day suffix
    if (s === '') return { error: 'missing date' };
    let m;
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s)) ||
        (m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(s))) {
      return checkYmd(s, +m[1], +m[2], +m[3]);
    }
    if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s))) {
      return checkYmd(s, +m[3], +m[1], +m[2]);   // US M/D/YYYY
    }
    if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(s)) {
      return { error: 'ambiguous date "' + s + '" (DD-MM-YYYY vs MM-DD-YYYY; use YYYY-MM-DD)' };
    }
    return { error: 'unrecognized date "' + s + '"' };
  }

  /*
   * normalizeRows(rows, mapping) -> { txns, errors }
   *
   * Every input row lands in exactly one bucket: a valid txn or a
   * { line, reason } error. line counts the header as line 1, so
   * rows[0] reports as line 2. symbol/date/type/shares/price are
   * required columns; if any is unmapped, a single { line: 0 }
   * error is returned and nothing is parsed.
   */
  function normalizeRows(rows, mapping) {
    mapping = mapping || {};
    const txns = [];
    const errors = [];

    const missing = ['symbol', 'date', 'type', 'shares', 'price'].filter(function (f) {
      return mapping[f] === null || mapping[f] === undefined;
    });
    if (missing.length) {
      return { txns: [], errors: [{ line: 0, reason: 'missing required column(s): ' + missing.join(', ') }] };
    }

    (rows || []).forEach(function (row, idx) {
      const line = idx + 2;
      function cell(fieldName) {
        const j = mapping[fieldName];
        if (j === null || j === undefined || j < 0 || j >= row.length) return '';
        const v = row[j];
        return String(v === null || v === undefined ? '' : v).trim();
      }

      // Type first: dividend/DRIP/transfer/split/fee rows fail here with
      // the most useful message rather than on their blank share counts.
      const rawType = cell('type');
      let type = TYPE_MAP[rawType.toLowerCase().replace(/\s+/g, ' ')];
      if (!type) {
        errors.push({ line: line, reason: 'unsupported type "' + rawType + '"' });
        return;
      }

      const symbol = cell('symbol').toUpperCase();
      if (!symbol) {
        errors.push({ line: line, reason: 'missing symbol' });
        return;
      }

      const d = normalizeDate(cell('date'));
      if (d.error) {
        errors.push({ line: line, reason: d.error });
        return;
      }

      let shares = parseNumber(cell('shares'));
      if (!isFinite(shares) || shares === 0) {
        errors.push({ line: line, reason: 'invalid shares "' + cell('shares') + '"' });
        return;
      }
      if (shares < 0) {
        // Some brokers export sells as negative-quantity buys.
        if (type === 'buy') type = 'sell';
        shares = Math.abs(shares);
      }

      const price = parseNumber(cell('price'));
      if (!isFinite(price) || price < 0) {
        errors.push({ line: line, reason: 'invalid price "' + cell('price') + '"' });
        return;
      }

      let commission = 0;
      if (mapping.commission !== null && mapping.commission !== undefined) {
        const rawCommission = cell('commission');
        if (rawCommission !== '') {
          const c = parseNumber(rawCommission);
          if (!isFinite(c)) {
            errors.push({ line: line, reason: 'invalid commission "' + rawCommission + '"' });
            return;
          }
          commission = Math.abs(c);   // brokers often export fees negative
        }
      }

      let currency = null;
      if (mapping.currency !== null && mapping.currency !== undefined) {
        const rawCurrency = cell('currency');
        if (rawCurrency !== '') {
          currency = CURRENCY_MAP[rawCurrency.toUpperCase()] || null;
          if (currency === null) {
            errors.push({ line: line, reason: 'unsupported currency "' + rawCurrency + '"' });
            return;
          }
        }
      }

      const account = cell('account') !== '' ? cell('account') : null;

      txns.push({
        symbol: symbol,
        date: d.value,
        type: type,
        shares: shares,
        price: price,
        commission: commission,
        currency: currency,
        account: account,
      });
    });

    return { txns: txns, errors: errors };
  }

  /* ---------- generation ---------- */

  function csvField(v) {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  // RFC-4180 output: CRLF line endings, trailing newline, fields quoted
  // only when they contain a comma, quote, or newline.
  function toCsv(headers, rows) {
    const lines = [];
    if (Array.isArray(headers) && headers.length) {
      lines.push(headers.map(csvField).join(','));
    }
    (rows || []).forEach(function (r) {
      lines.push((r || []).map(csvField).join(','));
    });
    return lines.length ? lines.join('\r\n') + '\r\n' : '';
  }

  // '' for missing/non-numeric; fixed decimals when dp given, else the
  // number's own string form (preserves precision for re-import).
  function fmtNum(v, dp) {
    if (v === null || v === undefined || v === '') return '';
    const n = Number(v);
    if (!isFinite(n)) return '';
    return (dp === undefined) ? String(n) : n.toFixed(dp);
  }

  const HOLDINGS_HEADERS = ['Symbol', 'Name', 'Account', 'Currency', 'Shares',
    'Avg Cost (native)', 'ACB/Share (CAD)', 'Market Value (CAD)',
    'Total P&L (CAD)', 'Weight (%)'];

  // Report export. Per-share costs keep 4 decimals (ACB precision),
  // aggregate dollar figures and weight round to 2.
  function holdingsToCsv(holdings) {
    const rows = (holdings || []).map(function (h) {
      h = h || {};
      return [
        h.symbol === null || h.symbol === undefined ? '' : String(h.symbol),
        h.name === null || h.name === undefined ? '' : String(h.name),
        h.account === null || h.account === undefined ? '' : String(h.account),
        h.currency === null || h.currency === undefined ? '' : String(h.currency),
        fmtNum(h.shares),
        fmtNum(h.avgCost, 4),
        fmtNum(h.acbPerShareBase, 4),
        fmtNum(h.marketValue, 2),
        fmtNum(h.totalPL, 2),
        fmtNum(h.weight, 2),
      ];
    });
    return toCsv(HOLDINGS_HEADERS, rows);
  }

  const TXNS_HEADERS = ['Symbol', 'Currency', 'Account', 'Type', 'Date',
    'Shares', 'Price', 'Commission', 'FX Rate', 'Source'];

  // Ledger export: one row per transaction, position fields repeated on
  // each row. Numbers are written raw (no rounding) so the file can be
  // re-imported without drift.
  function txnsToCsv(positions) {
    const rows = [];
    (positions || []).forEach(function (p) {
      p = p || {};
      (p.txns || []).forEach(function (t) {
        t = t || {};
        rows.push([
          p.symbol === null || p.symbol === undefined ? '' : String(p.symbol),
          p.currency === null || p.currency === undefined ? '' : String(p.currency),
          p.account === null || p.account === undefined ? '' : String(p.account),
          t.type === null || t.type === undefined ? '' : String(t.type),
          t.date === null || t.date === undefined ? '' : String(t.date),
          fmtNum(t.shares),
          fmtNum(t.price),
          fmtNum(t.commission),
          fmtNum(t.fxRate),
          t.source === null || t.source === undefined ? '' : String(t.source),
        ]);
      });
    });
    return toCsv(TXNS_HEADERS, rows);
  }

  return {
    parseCsv: parseCsv,
    guessMapping: guessMapping,
    normalizeRows: normalizeRows,
    toCsv: toCsv,
    holdingsToCsv: holdingsToCsv,
    txnsToCsv: txnsToCsv,
    HOLDINGS_HEADERS: HOLDINGS_HEADERS,
    TXNS_HEADERS: TXNS_HEADERS,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CsvIO;
} else if (typeof window !== 'undefined') {
  window.CsvIO = CsvIO;
}
