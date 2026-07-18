/* ============================================
   GSP TRADING - BANK OF CANADA FX HISTORY (USD/CAD)

   WHY THIS EXISTS
   ---------------
   CRA requires (ITA s.261) that foreign-currency amounts entering the
   adjusted cost base be converted at the exchange rate in effect on the
   TRANSACTION DATE, not today's spot. The accepted source is the Bank of
   Canada daily average rate. This module resolves the BoC USD/CAD daily
   rate for any given settlement/trade date so the ACB engine can convert
   USD trades correctly.

   DESIGN
   ------
   - Pure, unit-testable core (no network, no Date.now inside the
     decision path): pickRateForDate / validRange operate on a plain
     seriesMap `{ 'YYYY-MM-DD': number }` of BoC business-day rates.
   - Thin network layer (server side only, guarded by `typeof fetch`):
     fetchSeries hits the BoC Valet API; getRateForDate is the cached
     convenience wrapper.

   BUSINESS-DAY RESOLUTION
   -----------------------
   BoC publishes rates on business days only. A trade dated on a weekend
   or bank holiday resolves to the NEAREST PRIOR business day within a
   lookback window (default 7 calendar days), which is the standard
   practical convention for CRA reporting when no same-day rate exists.

   SERIES COVERAGE
   ---------------
   The FXUSDCAD series begins 2017-01-03. Dates before that resolve to
   null; the caller is expected to fall back to a user-supplied rate
   (the legacy noon-rate series is a different Valet series and is not
   wired here).

   OBSERVED BoC VALET PAYLOAD (verified live 2026-07-18 with:
   GET https://www.bankofcanada.ca/valet/observations/FXUSDCAD/json?start_date=2026-01-05&end_date=2026-01-16)
   {
     "terms": { "url": "https://www.bankofcanada.ca/terms/" },
     "seriesDetail": {
       "FXUSDCAD": {
         "label": "USD/CAD",
         "description": "Daily average exchange rate: ...",
         "dimension": { "key": "d", "name": "Date" }
       }
     },
     "observations": [
       { "d": "2026-01-05", "FXUSDCAD": { "v": "1.3768" } },
       { "d": "2026-01-06", "FXUSDCAD": { "v": "1.3789" } },
       ...business days only; the Jan 10-11 weekend is simply absent...
     ]
   }
   Note `v` is a STRING; this module parses it to a number.

   SERVERLESS NOTE
   ---------------
   The in-memory cache below is per-process best-effort. On serverless
   (one short-lived instance per burst) it only helps within a single
   warm instance; that is fine because the BoC API is free, fast, and
   the cache exists purely to avoid hammering it during one session.
   ============================================ */

'use strict';

const FxHistory = (function () {

  const DEFAULT_MAX_LOOKBACK_DAYS = 7;
  const SERIES_START = '2017-01-03'; // first FXUSDCAD observation
  const BOC_URL = 'https://www.bankofcanada.ca/valet/observations/FXUSDCAD/json';
  const MS_PER_DAY = 86400000;
  const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

  /* ---------- pure helpers ---------- */

  /**
   * Strict ISO calendar-date check. Rejects wrong shapes and impossible
   * dates ('2026-02-30' parses leniently in some engines; the UTC
   * round-trip catches it).
   * @param {*} s
   * @returns {boolean}
   */
  function isValidISODate(s) {
    if (typeof s !== 'string' || !ISO_RE.test(s)) return false;
    const t = Date.parse(s + 'T00:00:00Z');
    if (!isFinite(t)) return false;
    return new Date(t).toISOString().slice(0, 10) === s;
  }

  /**
   * Add (or subtract) calendar days to an ISO date. UTC millisecond math,
   * so month/year boundaries and leap days are handled by Date itself.
   * @param {string} iso - valid 'YYYY-MM-DD'
   * @param {number} days - may be negative
   * @returns {string} 'YYYY-MM-DD'
   */
  function addDaysISO(iso, days) {
    const t = Date.parse(iso + 'T00:00:00Z');
    return new Date(t + days * MS_PER_DAY).toISOString().slice(0, 10);
  }

  /** Today as a UTC ISO date. Date.now() is fine in this repo; the pure
   *  functions accept an explicit opts.today so tests stay deterministic. */
  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  /**
   * Input hardening: return a clean copy of a seriesMap keeping only
   * valid ISO date keys mapped to finite rates > 0. Numeric strings are
   * coerced (the BoC payload quotes values as strings). Anything else -
   * garbage keys, null, NaN, zero, negative rates - is dropped.
   * @param {*} seriesMap
   * @returns {Object<string, number>} possibly empty
   */
  function cleanSeries(seriesMap) {
    const out = {};
    if (!seriesMap || typeof seriesMap !== 'object' || Array.isArray(seriesMap)) return out;
    for (const key of Object.keys(seriesMap)) {
      if (!isValidISODate(key)) continue;
      const v = seriesMap[key];
      const n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
      if (isFinite(n) && n > 0) out[key] = n;
    }
    return out;
  }

  /* ---------- pure core ---------- */

  /**
   * pickRateForDate
   * Resolve the BoC rate to use for a transaction date.
   *
   * @param {Object<string, number>} seriesMap - { 'YYYY-MM-DD': rate } of
   *        BoC daily rates (business days only).
   * @param {string} dateISO - the transaction date, 'YYYY-MM-DD'.
   * @param {object} [opts]
   * @param {number} [opts.maxLookbackDays=7] - how many calendar days to
   *        walk back looking for the nearest prior business day.
   * @param {string} [opts.today] - 'YYYY-MM-DD' reference for the
   *        future-date check. Defaults to the real current UTC date;
   *        pass explicitly in tests for determinism.
   * @returns {{ rate: number, rateDate: string, exact: boolean } | null}
   *        rateDate is the date actually used: dateISO itself when
   *        present (exact: true), else the nearest prior date within the
   *        window (exact: false). null when the date is invalid, in the
   *        future, or no rate exists within the lookback window.
   */
  function pickRateForDate(seriesMap, dateISO, opts) {
    opts = opts || {};
    if (!isValidISODate(dateISO)) return null;

    const today = isValidISODate(opts.today) ? opts.today : todayISO();
    if (dateISO > today) return null; // no rate exists for a future date

    let maxLookbackDays = DEFAULT_MAX_LOOKBACK_DAYS;
    if (typeof opts.maxLookbackDays === 'number' && isFinite(opts.maxLookbackDays) && opts.maxLookbackDays >= 0) {
      maxLookbackDays = Math.floor(opts.maxLookbackDays);
    }

    const series = cleanSeries(seriesMap);
    for (let back = 0; back <= maxLookbackDays; back++) {
      const d = back === 0 ? dateISO : addDaysISO(dateISO, -back);
      if (Object.prototype.hasOwnProperty.call(series, d)) {
        return { rate: series[d], rateDate: d, exact: back === 0 };
      }
    }
    return null; // nothing within the window (caller falls back to a user-supplied rate)
  }

  /**
   * validRange
   * The usable span of a seriesMap after input hardening.
   * @param {*} seriesMap
   * @returns {{ first: string, last: string } | null} ISO dates, or null
   *          when the cleaned series is empty.
   */
  function validRange(seriesMap) {
    const keys = Object.keys(cleanSeries(seriesMap)).sort();
    if (keys.length === 0) return null;
    return { first: keys[0], last: keys[keys.length - 1] };
  }

  /* ---------- network layer (Node/server side only) ---------- */

  // Per-instance cache. `windowCache` remembers which date-windows have
  // already been fetched; `mergedSeries` accumulates every observation
  // seen so repeated lookups across overlapping windows never refetch.
  // Serverless: per-instance best-effort only (see header note).
  const windowCache = new Map(); // 'startISO|endISO' -> true
  let mergedSeries = {};         // { 'YYYY-MM-DD': number }

  /** Reset the module-level cache (tests / long-lived processes). */
  function clearCache() {
    windowCache.clear();
    mergedSeries = {};
  }

  /**
   * fetchSeries
   * GET the BoC Valet FXUSDCAD observations for [startISO, endISO] and
   * return them as a seriesMap. Network only - no cache, no fallback.
   *
   * @param {string} startISO - 'YYYY-MM-DD'
   * @param {string} endISO - 'YYYY-MM-DD'
   * @returns {Promise<Object<string, number>>}
   * @throws {Error} descriptive error on missing fetch, invalid args,
   *         non-200 response, or malformed payload.
   */
  async function fetchSeries(startISO, endISO) {
    if (typeof fetch !== 'function') {
      throw new Error('fx-history: fetchSeries requires the fetch API (Node 18+ / server side only).');
    }
    if (!isValidISODate(startISO) || !isValidISODate(endISO)) {
      throw new Error(`fx-history: fetchSeries needs valid ISO dates, got start=${startISO} end=${endISO}.`);
    }
    if (startISO > endISO) {
      throw new Error(`fx-history: fetchSeries start ${startISO} is after end ${endISO}.`);
    }

    const url = `${BOC_URL}?start_date=${startISO}&end_date=${endISO}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      throw new Error(`fx-history: Bank of Canada Valet returned HTTP ${res.status} ${res.statusText || ''} for ${url}`.trim());
    }

    let payload;
    try {
      payload = await res.json();
    } catch (e) {
      throw new Error(`fx-history: Bank of Canada Valet returned non-JSON payload: ${e.message}`);
    }
    if (!payload || !Array.isArray(payload.observations)) {
      throw new Error('fx-history: malformed Bank of Canada payload - missing "observations" array.');
    }

    // Observed item shape: { d: 'YYYY-MM-DD', FXUSDCAD: { v: '1.3702' } }
    const series = {};
    for (const obs of payload.observations) {
      if (!obs || !isValidISODate(obs.d)) continue;
      const cell = obs.FXUSDCAD;
      const n = cell && cell.v !== undefined && cell.v !== null ? Number(cell.v) : NaN;
      if (isFinite(n) && n > 0) series[obs.d] = n;
    }
    return series;
  }

  /**
   * getRateForDate
   * Convenience: fetch the window [dateISO - maxLookbackDays, dateISO]
   * (cached per-instance) and resolve the transaction-date rate.
   *
   * Pre-2017-01-03 dates return null without a network call - the
   * FXUSDCAD series does not exist before then; the caller falls back
   * to a user-supplied rate.
   *
   * @param {string} dateISO - transaction date 'YYYY-MM-DD'
   * @param {object} [opts] - forwarded to pickRateForDate
   *        (maxLookbackDays, today)
   * @returns {Promise<{ rate: number, rateDate: string, exact: boolean } | null>}
   */
  async function getRateForDate(dateISO, opts) {
    opts = opts || {};
    if (!isValidISODate(dateISO)) return null;

    const today = isValidISODate(opts.today) ? opts.today : todayISO();
    if (dateISO > today) return null;
    if (dateISO < SERIES_START) return null; // series does not exist pre-2017

    // Exact hit already cached: cannot be improved by a refetch.
    if (Object.prototype.hasOwnProperty.call(mergedSeries, dateISO)) {
      return pickRateForDate(mergedSeries, dateISO, opts);
    }

    let maxLookbackDays = DEFAULT_MAX_LOOKBACK_DAYS;
    if (typeof opts.maxLookbackDays === 'number' && isFinite(opts.maxLookbackDays) && opts.maxLookbackDays >= 0) {
      maxLookbackDays = Math.floor(opts.maxLookbackDays);
    }

    const startISO = addDaysISO(dateISO, -maxLookbackDays);
    const key = `${startISO}|${dateISO}`;
    if (!windowCache.has(key)) {
      const fetched = await fetchSeries(startISO, dateISO);
      Object.assign(mergedSeries, fetched);
      windowCache.set(key, true);
    }
    return pickRateForDate(mergedSeries, dateISO, opts);
  }

  return {
    // constants
    DEFAULT_MAX_LOOKBACK_DAYS,
    SERIES_START,
    // pure core
    pickRateForDate,
    validRange,
    // pure helpers (exposed for testing / reuse)
    isValidISODate,
    addDaysISO,
    cleanSeries,
    // network layer (server side only)
    fetchSeries,
    getRateForDate,
    clearCache,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = FxHistory;
} else if (typeof window !== 'undefined') {
  window.FxHistory = FxHistory;
}
