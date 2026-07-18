'use strict';

const test = require('node:test');
const assert = require('node:assert');
const FX = require('../services/fx-history.js');

// Real BoC FXUSDCAD observations for early January 2026 (verified live
// against the Valet API). Business days only: Jan 10-11 is a weekend and
// is absent, exactly as the API returns it.
const JAN_2026 = {
  '2026-01-05': 1.3768,
  '2026-01-06': 1.3789,
  '2026-01-07': 1.3823,
  '2026-01-08': 1.3866,
  '2026-01-09': 1.3896,
  '2026-01-12': 1.3875,
  '2026-01-13': 1.3886,
  '2026-01-14': 1.3877,
  '2026-01-15': 1.3899,
  '2026-01-16': 1.3913,
};

// Deterministic "today" for every test: well after the series above.
const TODAY = { today: '2026-07-18' };

test('exact-date hit returns that rate with exact: true', () => {
  const r = FX.pickRateForDate(JAN_2026, '2026-01-08', TODAY);
  assert.deepStrictEqual(r, { rate: 1.3866, rateDate: '2026-01-08', exact: true });
});

test('Saturday resolves to the prior Friday with exact: false', () => {
  // 2026-01-10 is a Saturday; nearest prior business day is Fri 2026-01-09.
  const r = FX.pickRateForDate(JAN_2026, '2026-01-10', TODAY);
  assert.deepStrictEqual(r, { rate: 1.3896, rateDate: '2026-01-09', exact: false });
});

test('Sunday also resolves back to the prior Friday, not forward to Monday', () => {
  // 2026-01-11 is a Sunday; must go BACK to Fri 2026-01-09 even though
  // Mon 2026-01-12 is closer than nothing going forward.
  const r = FX.pickRateForDate(JAN_2026, '2026-01-11', TODAY);
  assert.strictEqual(r.rateDate, '2026-01-09');
  assert.strictEqual(r.rate, 1.3896);
  assert.strictEqual(r.exact, false);
});

test('holiday gap within the window resolves to the last published business day', () => {
  // Christmas-style gap: published Wed Dec 24, then nothing until Mon Dec 29.
  // A trade dated Sun Dec 28 must walk back 4 days to Dec 24.
  const holidaySeries = {
    '2025-12-23': 1.4301,
    '2025-12-24': 1.4312,
    '2025-12-29': 1.4290,
  };
  const r = FX.pickRateForDate(holidaySeries, '2025-12-28', TODAY);
  assert.deepStrictEqual(r, { rate: 1.4312, rateDate: '2025-12-24', exact: false });
});

test('a gap beyond the default 7-day lookback returns null', () => {
  // Nearest prior observation is 10 calendar days back: outside the window.
  const sparse = { '2026-01-05': 1.3768 };
  assert.strictEqual(FX.pickRateForDate(sparse, '2026-01-15', TODAY), null);
});

test('opts.maxLookbackDays widens (or narrows) the window', () => {
  const sparse = { '2026-01-05': 1.3768 };
  // 10 days back is reachable with a 14-day window...
  const wide = FX.pickRateForDate(sparse, '2026-01-15', { today: TODAY.today, maxLookbackDays: 14 });
  assert.deepStrictEqual(wide, { rate: 1.3768, rateDate: '2026-01-05', exact: false });
  // ...and a 0-day window means exact hits only.
  const exactOnly = FX.pickRateForDate(JAN_2026, '2026-01-10', { today: TODAY.today, maxLookbackDays: 0 });
  assert.strictEqual(exactOnly, null);
  const exactHit = FX.pickRateForDate(JAN_2026, '2026-01-09', { today: TODAY.today, maxLookbackDays: 0 });
  assert.strictEqual(exactHit.exact, true);
});

test('a future date relative to opts.today returns null; today itself is allowed', () => {
  assert.strictEqual(FX.pickRateForDate(JAN_2026, '2026-01-09', { today: '2026-01-08' }), null);
  // The boundary: dateISO === today is NOT future.
  const r = FX.pickRateForDate(JAN_2026, '2026-01-09', { today: '2026-01-09' });
  assert.strictEqual(r.rate, 1.3896);
});

test('invalid transaction dates return null', () => {
  assert.strictEqual(FX.pickRateForDate(JAN_2026, 'garbage', TODAY), null);
  assert.strictEqual(FX.pickRateForDate(JAN_2026, '2026-02-30', TODAY), null); // impossible calendar date
  assert.strictEqual(FX.pickRateForDate(JAN_2026, '2026-13-01', TODAY), null);
  assert.strictEqual(FX.pickRateForDate(JAN_2026, '08/01/2026', TODAY), null);
  assert.strictEqual(FX.pickRateForDate(JAN_2026, '', TODAY), null);
  assert.strictEqual(FX.pickRateForDate(JAN_2026, null, TODAY), null);
  assert.strictEqual(FX.pickRateForDate(JAN_2026, 20260108, TODAY), null);
});

test('empty or garbage series maps return null instead of throwing', () => {
  assert.strictEqual(FX.pickRateForDate({}, '2026-01-08', TODAY), null);
  assert.strictEqual(FX.pickRateForDate(null, '2026-01-08', TODAY), null);
  assert.strictEqual(FX.pickRateForDate(undefined, '2026-01-08', TODAY), null);
  assert.strictEqual(FX.pickRateForDate('not a map', '2026-01-08', TODAY), null);
  assert.strictEqual(FX.pickRateForDate([1.38, 1.39], '2026-01-08', TODAY), null);
  assert.strictEqual(FX.pickRateForDate({ 'not-a-date': 1.38, '2026-01-08': NaN }, '2026-01-08', TODAY), null);
});

test('rates <= 0 (and non-numeric rates) are filtered out of the series', () => {
  const dirty = {
    '2026-01-09': -1.38,     // negative: filtered
    '2026-01-08': 0,         // zero: filtered
    '2026-01-07': 'junk',    // non-numeric: filtered
    '2026-01-06': 1.3789,    // the only usable observation
  };
  // Exact date has a negative rate, so the lookup must skip back to Jan 6.
  const r = FX.pickRateForDate(dirty, '2026-01-09', TODAY);
  assert.deepStrictEqual(r, { rate: 1.3789, rateDate: '2026-01-06', exact: false });
});

test('numeric-string rates are coerced (BoC quotes values as strings)', () => {
  const stringy = { '2026-01-08': '1.3866' };
  const r = FX.pickRateForDate(stringy, '2026-01-08', TODAY);
  assert.deepStrictEqual(r, { rate: 1.3866, rateDate: '2026-01-08', exact: true });
});

test('lookback walks correctly across a month boundary', () => {
  const series = { '2026-01-30': 1.3900 }; // Friday
  const r = FX.pickRateForDate(series, '2026-02-01', TODAY); // Sunday
  assert.deepStrictEqual(r, { rate: 1.39, rateDate: '2026-01-30', exact: false });
});

test('validRange returns the first and last usable dates', () => {
  assert.deepStrictEqual(FX.validRange(JAN_2026), { first: '2026-01-05', last: '2026-01-16' });
});

test('validRange ignores garbage entries and returns null when nothing usable remains', () => {
  assert.strictEqual(FX.validRange({}), null);
  assert.strictEqual(FX.validRange(null), null);
  assert.strictEqual(FX.validRange({ 'not-a-date': 1.38, '2026-01-08': -2 }), null);
  // Garbage mixed with good data: range spans only the good entries.
  const mixed = { 'junk': 9, '2026-01-06': 1.3789, '2026-01-09': 0, '2026-01-08': 1.3866 };
  assert.deepStrictEqual(FX.validRange(mixed), { first: '2026-01-06', last: '2026-01-08' });
});

test('isValidISODate and addDaysISO helpers behave as documented', () => {
  assert.strictEqual(FX.isValidISODate('2026-01-08'), true);
  assert.strictEqual(FX.isValidISODate('2026-2-8'), false);
  assert.strictEqual(FX.isValidISODate('2026-02-30'), false);
  assert.strictEqual(FX.addDaysISO('2026-01-01', -1), '2025-12-31');
  assert.strictEqual(FX.addDaysISO('2024-03-01', -1), '2024-02-29'); // leap year
  assert.strictEqual(FX.addDaysISO('2026-01-05', 7), '2026-01-12');
});

test('module exposes the documented constants', () => {
  assert.strictEqual(FX.DEFAULT_MAX_LOOKBACK_DAYS, 7);
  assert.strictEqual(FX.SERIES_START, '2017-01-03'); // pre-2017 dates resolve to null
});
