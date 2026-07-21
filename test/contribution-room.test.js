'use strict';

const test = require('node:test');
const assert = require('node:assert');
const CR = require('../services/contribution-room.js');

// ---- limit lookups: verified vs assumed flags ----

test('TFSA limit lookup returns verified amounts for published years', () => {
  assert.deepStrictEqual(CR.tfsaLimitForYear(2009), { amount: 5000, verified: true });
  assert.deepStrictEqual(CR.tfsaLimitForYear(2015), { amount: 10000, verified: true });
  assert.deepStrictEqual(CR.tfsaLimitForYear(2023), { amount: 6500, verified: true });
  assert.deepStrictEqual(CR.tfsaLimitForYear(2024), { amount: 7000, verified: true });
  assert.deepStrictEqual(CR.tfsaLimitForYear(2025), { amount: 7000, verified: true });
});

test('TFSA 2026 is flagged assumed, pre-program years are null', () => {
  assert.strictEqual(CR.tfsaLimitForYear(2026).assumed, true);
  assert.strictEqual(CR.tfsaLimitForYear(2026).verified, undefined);
  assert.strictEqual(CR.tfsaLimitForYear(2008), null);
  // far future beyond the table is assumed, carrying the last known amount
  const future = CR.tfsaLimitForYear(2030);
  assert.strictEqual(future.assumed, true);
  assert.strictEqual(future.amount, 7000);
});

test('FHSA limit is flat 8000, null before program start', () => {
  assert.deepStrictEqual(CR.fhsaLimitForYear(2023), { amount: 8000, verified: true });
  assert.deepStrictEqual(CR.fhsaLimitForYear(2025), { amount: 8000, verified: true });
  assert.strictEqual(CR.fhsaLimitForYear(2022), null);
});

test('RRSP maximums are reference-only with verified/assumed flags', () => {
  assert.deepStrictEqual(CR.rrspMaxForYear(2024), { amount: 31560, verified: true });
  assert.deepStrictEqual(CR.rrspMaxForYear(2025), { amount: 32490, verified: true });
  assert.strictEqual(CR.rrspMaxForYear(2026).assumed, true);
  assert.strictEqual(CR.rrspMaxForYear(2022), null);
});

// ---- TFSA accumulation against known cumulative totals ----

test('TFSA cumulative 2009-2023 = 88000 for a lifelong-eligible person', () => {
  const r = CR.computeTfsaRoom({
    birthYear: 1980, currentYear: 2023, contributions: [], withdrawals: [],
  });
  assert.strictEqual(r.accumulatedLimit, 88000);
  assert.strictEqual(r.room, 88000);
});

test('TFSA cumulative through 2024 = 95000 and through 2025 = 102000', () => {
  const r2024 = CR.computeTfsaRoom({ birthYear: 1980, currentYear: 2024, contributions: [], withdrawals: [] });
  assert.strictEqual(r2024.accumulatedLimit, 95000);
  const r2025 = CR.computeTfsaRoom({ birthYear: 1980, currentYear: 2025, contributions: [], withdrawals: [] });
  assert.strictEqual(r2025.accumulatedLimit, 102000);
});

test('TFSA eligibility begins the year you turn 18 (born 2005 -> 2023)', () => {
  const r = CR.computeTfsaRoom({ birthYear: 2005, currentYear: 2025, contributions: [], withdrawals: [] });
  // eligible 2023 (6500) + 2024 (7000) + 2025 (7000) = 20500
  assert.strictEqual(r.accumulatedLimit, 20500);
});

test('TFSA eligibility is 2009 flr even for someone who turned 18 earlier', () => {
  // born 1970 turned 18 in 1988, but TFSA did not exist until 2009
  const r = CR.computeTfsaRoom({ birthYear: 1970, currentYear: 2009, contributions: [], withdrawals: [] });
  assert.strictEqual(r.accumulatedLimit, 5000);
});

test('TFSA contributions reduce room', () => {
  const r = CR.computeTfsaRoom({
    birthYear: 1980, currentYear: 2025,
    contributions: [{ year: 2024, amount: 7000 }, { year: 2025, amount: 3000 }],
    withdrawals: [],
  });
  assert.strictEqual(r.totalContributed, 10000);
  assert.strictEqual(r.room, 102000 - 10000);
});

// ---- TFSA withdrawal re-add TIMING (the classic trap) ----

test('TFSA withdrawal is NOT re-added in the year of withdrawal', () => {
  const r = CR.computeTfsaRoom({
    birthYear: 1980, currentYear: 2024,
    contributions: [{ year: 2024, amount: 7000 }],
    withdrawals: [{ year: 2024, amount: 5000 }],
  });
  // in 2024, the 2024 withdrawal does NOT restore room yet
  assert.strictEqual(r.withdrawalsAddedBack, 0);
  assert.strictEqual(r.totalWithdrawn, 5000);
  assert.strictEqual(r.room, 95000 - 7000 + 0);
});

test('TFSA withdrawal IS re-added on Jan 1 of the following year', () => {
  const r = CR.computeTfsaRoom({
    birthYear: 1980, currentYear: 2025,
    contributions: [{ year: 2024, amount: 7000 }],
    withdrawals: [{ year: 2024, amount: 5000 }],
  });
  // in 2025 the 2024 withdrawal restores 5000 of room
  assert.strictEqual(r.withdrawalsAddedBack, 5000);
  assert.strictEqual(r.room, 102000 - 7000 + 5000);
});

// ---- TFSA over-contribution + penalty ----

test('TFSA over-contribution is detected and penalized 1%/month', () => {
  const r = CR.computeTfsaRoom({
    birthYear: 2005, currentYear: 2023,
    contributions: [{ year: 2023, amount: 10000 }], // room was only 6500
    withdrawals: [],
  });
  assert.strictEqual(r.accumulatedLimit, 6500);
  assert.strictEqual(r.room, -3500);
  assert.strictEqual(r.overContributed, 3500);
  const pen = CR.overContributionPenalty(r.overContributed);
  assert.strictEqual(pen.excess, 3500);
  assert.strictEqual(pen.penaltyPerMonth, 35); // 1% of 3500
});

test('overContributionPenalty floors negative/zero excess to zero', () => {
  assert.deepStrictEqual(CR.overContributionPenalty(-100), { excess: 0, penaltyPerMonth: 0 });
  assert.deepStrictEqual(CR.overContributionPenalty(0), { excess: 0, penaltyPerMonth: 0 });
});

// ---- FHSA carryforward cap + lifetime cap ----

test('FHSA: 8000 unused carries into next year for 16000 max, not more', () => {
  // opened 2023, nothing contributed in 2023
  const r2024 = CR.computeFhsaRoom({ openYear: 2023, currentYear: 2024, contributions: [] });
  assert.strictEqual(r2024.participationRoom, 16000);

  // still 16000 the year after (carryforward capped at 8000, not stacking to 24000)
  const r2025 = CR.computeFhsaRoom({ openYear: 2023, currentYear: 2025, contributions: [] });
  assert.strictEqual(r2025.participationRoom, 16000);
});

test('FHSA partial use carries only the unused remainder forward', () => {
  const r = CR.computeFhsaRoom({
    openYear: 2023, currentYear: 2024,
    contributions: [{ year: 2023, amount: 5000 }],
  });
  // 3000 unused from 2023 + 8000 new in 2024 = 11000
  assert.strictEqual(r.participationRoom, 11000);
  assert.strictEqual(r.totalContributed, 5000);
  assert.strictEqual(r.lifetimeRemaining, 35000);
});

test('FHSA honours the 40000 lifetime cap and flags over-contribution', () => {
  const r = CR.computeFhsaRoom({
    openYear: 2023, currentYear: 2027,
    contributions: [
      { year: 2023, amount: 8000 }, { year: 2024, amount: 8000 },
      { year: 2025, amount: 8000 }, { year: 2026, amount: 8000 },
      { year: 2027, amount: 10000 }, // pushes total to 42000
    ],
  });
  assert.strictEqual(r.totalContributed, 42000);
  assert.strictEqual(r.lifetimeRemaining, 0);
  assert.strictEqual(r.room, 0);
  assert.strictEqual(r.overContributed, 2000);
});

test('FHSA at exactly the lifetime cap leaves zero room, zero over-contribution', () => {
  const r = CR.computeFhsaRoom({
    openYear: 2023, currentYear: 2027,
    contributions: [
      { year: 2023, amount: 8000 }, { year: 2024, amount: 8000 },
      { year: 2025, amount: 8000 }, { year: 2026, amount: 8000 },
      { year: 2027, amount: 8000 },
    ],
  });
  assert.strictEqual(r.totalContributed, 40000);
  assert.strictEqual(r.room, 0);
  assert.strictEqual(r.overContributed, 0);
});

// ---- RRSP room from CRA figure + $2000 cushion ----

test('RRSP room = CRA deduction limit minus contributions', () => {
  const r = CR.computeRrspRoom({
    craDeductionLimit: 31560,
    contributions: [{ year: 2024, amount: 10000 }, { year: 2024, amount: 5000 }],
  });
  assert.strictEqual(r.craDeductionLimit, 31560);
  assert.strictEqual(r.totalContributed, 15000);
  assert.strictEqual(r.room, 16560);
  assert.strictEqual(r.overContributed, 0);
});

test('RRSP $2000 cushion: within-cushion excess is not penalized', () => {
  const r = CR.computeRrspRoom({
    craDeductionLimit: 20000,
    contributions: [{ year: 2025, amount: 21500 }], // 1500 over, inside the 2000 cushion
  });
  assert.strictEqual(r.room, -1500);
  assert.strictEqual(r.overContributed, 0);
  assert.strictEqual(CR.overContributionPenalty(r.overContributed).penaltyPerMonth, 0);
});

test('RRSP excess beyond the $2000 cushion is penalized 1%/month', () => {
  const r = CR.computeRrspRoom({
    craDeductionLimit: 20000,
    contributions: [{ year: 2025, amount: 25000 }], // 5000 over, 3000 beyond cushion
  });
  assert.strictEqual(r.room, -5000);
  assert.strictEqual(r.overContributed, 3000);
  assert.strictEqual(CR.overContributionPenalty(r.overContributed).penaltyPerMonth, 30);
});

// ---- dispatcher ----

test('summarizeRoom dispatches to the right account computation', () => {
  const tfsa = CR.summarizeRoom('tfsa', { birthYear: 1980, currentYear: 2023, contributions: [], withdrawals: [] });
  assert.strictEqual(tfsa.accumulatedLimit, 88000);
  const rrsp = CR.summarizeRoom('RRSP', { craDeductionLimit: 30000, contributions: [] });
  assert.strictEqual(rrsp.room, 30000);
  const fhsa = CR.summarizeRoom('Fhsa', { openYear: 2023, currentYear: 2023, contributions: [] });
  assert.strictEqual(fhsa.participationRoom, 8000);
  assert.strictEqual(CR.summarizeRoom('LIRA', {}), null);
});

// ---- garbage / empty inputs ----

test('TFSA handles empty and garbage inputs without throwing', () => {
  const empty = CR.computeTfsaRoom({});
  assert.strictEqual(empty.accumulatedLimit, 0);
  assert.strictEqual(empty.room, 0);

  const garbage = CR.computeTfsaRoom({
    birthYear: 1980, currentYear: 2023,
    contributions: [null, { year: 'x', amount: 5 }, { amount: 100 }, { year: 2023, amount: -50 }, { year: 2023, amount: 1000 }],
    withdrawals: 'nope',
  });
  // only the single valid positive contribution of 1000 counts
  assert.strictEqual(garbage.totalContributed, 1000);
  assert.strictEqual(garbage.room, 87000);
});

test('FHSA and RRSP handle missing/garbage inputs gracefully', () => {
  const fhsa = CR.computeFhsaRoom({});
  assert.strictEqual(fhsa.participationRoom, 0);
  assert.strictEqual(fhsa.lifetimeRemaining, 40000);

  const preProgram = CR.computeFhsaRoom({ openYear: 2020, currentYear: 2019, contributions: [] });
  assert.strictEqual(preProgram.room, 0);

  const rrsp = CR.computeRrspRoom({ craDeductionLimit: 'not-a-number', contributions: null });
  assert.strictEqual(rrsp.craDeductionLimit, 0);
  assert.strictEqual(rrsp.totalContributed, 0);
  assert.strictEqual(rrsp.room, 0);
});

test('limit lookups reject garbage year input with null', () => {
  assert.strictEqual(CR.tfsaLimitForYear('abc'), null);
  assert.strictEqual(CR.fhsaLimitForYear(undefined), null);
  assert.strictEqual(CR.rrspMaxForYear(null), null);
});
