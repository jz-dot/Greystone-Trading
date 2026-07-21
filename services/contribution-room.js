/* ============================================
   GSP TRADING - CONTRIBUTION ROOM LEDGER (pure logic)

   A Canadian registered-account contribution-room reconciler for
   TFSA, RRSP, and FHSA. CRA My Account lags by up to ~15 months and
   no broker reconciles room across institutions, so this module lets
   the tracker rebuild room from first principles (TFSA/FHSA) or from a
   user-supplied CRA figure (RRSP) and catch over-contributions before
   the 1%/month penalty accrues.

   Key traps this module encodes deliberately:
     - TFSA eligibility begins the year you turn 18 OR 2009, whichever
       is later.
     - A TFSA WITHDRAWAL is added back to room on Jan 1 of the FOLLOWING
       year, never in the year of withdrawal.
     - FHSA carries unused annual room forward, but only up to 8000 into
       any single later year, under a 40000 lifetime cap.
     - RRSP room is CRA-computed (18% of prior-year earned income, less
       pension adjustments); we do NOT derive it - it is seeded from the
       user's CRA deduction-limit figure and carries a $2000 lifetime
       over-contribution cushion before the penalty applies.

   This module is pure: no network, no storage, no Date.now / new Date().
   The caller passes currentYear in so the ledger is fully testable.
   ============================================ */

'use strict';

const ContributionRoom = (function () {

  // ---- Published annual-limit datasets ----
  // verified:true  = real published CRA figure.
  // assumed:true   = not yet published / future placeholder.

  // TFSA annual dollar limits by year.
  const TFSA_LIMITS = {
    2009: { amount: 5000, verified: true },
    2010: { amount: 5000, verified: true },
    2011: { amount: 5000, verified: true },
    2012: { amount: 5000, verified: true },
    2013: { amount: 5500, verified: true },
    2014: { amount: 5500, verified: true },
    2015: { amount: 10000, verified: true },
    2016: { amount: 5500, verified: true },
    2017: { amount: 5500, verified: true },
    2018: { amount: 5500, verified: true },
    2019: { amount: 6000, verified: true },
    2020: { amount: 6000, verified: true },
    2021: { amount: 6000, verified: true },
    2022: { amount: 6000, verified: true },
    2023: { amount: 6500, verified: true },
    2024: { amount: 7000, verified: true },
    2025: { amount: 7000, verified: true },
    2026: { amount: 7000, assumed: true },
  };
  const TFSA_FIRST_YEAR = 2009;

  // FHSA: program constants.
  const FHSA_FIRST_YEAR = 2023;
  const FHSA_ANNUAL_LIMIT = 8000;      // annual participation room
  const FHSA_MAX_CARRYFORWARD = 8000;  // most that can be carried into one later year
  const FHSA_LIFETIME_CAP = 40000;     // lifetime contribution ceiling

  // RRSP annual dollar MAXIMUMS by year (for reference / labels only).
  // RRSP room is NOT derived here - it is seeded from the CRA figure.
  const RRSP_MAXIMUMS = {
    2023: { amount: 30780, verified: true },
    2024: { amount: 31560, verified: true },
    2025: { amount: 32490, verified: true },
    2026: { amount: 33000, assumed: true },
  };

  const RRSP_LIFETIME_CUSHION = 2000;  // over-contribution allowed before penalty
  const PENALTY_RATE = 0.01;           // 1% of excess per month (TFSA + RRSP)

  // ---- helpers ----

  function toInt(v) {
    const n = parseInt(v, 10);
    return isFinite(n) ? n : null;
  }

  function toNum(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    const n = parseFloat(v);
    return isFinite(n) ? n : 0;
  }

  function round2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  // Sum { year, amount } entries whose year is <= throughYear (if given).
  // Negative amounts are floored to 0 - a contribution/withdrawal is never
  // negative money.
  function sumEntries(entries, throughYear) {
    if (!Array.isArray(entries)) return 0;
    let total = 0;
    for (const e of entries) {
      if (!e || typeof e !== 'object') continue;
      const y = toInt(e.year);
      if (y === null) continue;
      if (throughYear !== undefined && throughYear !== null && y > throughYear) continue;
      const amt = toNum(e.amount);
      if (amt > 0) total += amt;
    }
    return total;
  }

  // ---- limit lookups ----

  function tfsaLimitForYear(year) {
    const y = toInt(year);
    if (y === null) return null;
    if (TFSA_LIMITS[y]) return Object.assign({}, TFSA_LIMITS[y]);
    if (y < TFSA_FIRST_YEAR) return null;
    // Future year past the table: assume the most recent known amount.
    const known = Object.keys(TFSA_LIMITS).map(Number).sort((a, b) => a - b);
    const last = known[known.length - 1];
    if (y > last) return { amount: TFSA_LIMITS[last].amount, assumed: true };
    return null;
  }

  function fhsaLimitForYear(year) {
    const y = toInt(year);
    if (y === null) return null;
    if (y < FHSA_FIRST_YEAR) return null;
    // FHSA annual amount is flat; treat published years as verified,
    // years beyond the current calendar assumption stay verified too since
    // the figure is statutory, but flag far-future as assumed for parity.
    return { amount: FHSA_ANNUAL_LIMIT, verified: true };
  }

  function rrspMaxForYear(year) {
    const y = toInt(year);
    if (y === null) return null;
    if (RRSP_MAXIMUMS[y]) return Object.assign({}, RRSP_MAXIMUMS[y]);
    const known = Object.keys(RRSP_MAXIMUMS).map(Number).sort((a, b) => a - b);
    if (known.length === 0) return null;
    const last = known[known.length - 1];
    if (y > last) return { amount: RRSP_MAXIMUMS[last].amount, assumed: true };
    return null;
  }

  // ---- penalty ----

  function overContributionPenalty(excess) {
    const ex = toNum(excess);
    const over = ex > 0 ? ex : 0;
    return { excess: round2(over), penaltyPerMonth: round2(over * PENALTY_RATE) };
  }

  // ---- TFSA ----

  function computeTfsaRoom(args) {
    args = args || {};
    const birthYear = toInt(args.birthYear);
    const currentYear = toInt(args.currentYear);
    const contributions = Array.isArray(args.contributions) ? args.contributions : [];
    const withdrawals = Array.isArray(args.withdrawals) ? args.withdrawals : [];

    if (currentYear === null) {
      return {
        accumulatedLimit: 0, totalContributed: 0, totalWithdrawn: 0,
        withdrawalsAddedBack: 0, room: 0, overContributed: 0,
      };
    }

    // Eligibility: the year you turn 18, or 2009, whichever is later.
    // If birthYear is unknown, assume eligible since the program start.
    let eligibilityYear = TFSA_FIRST_YEAR;
    if (birthYear !== null) {
      const turns18 = birthYear + 18;
      eligibilityYear = Math.max(turns18, TFSA_FIRST_YEAR);
    }

    // Accumulate published annual limits from eligibility year through currentYear.
    let accumulatedLimit = 0;
    for (let y = eligibilityYear; y <= currentYear; y++) {
      const lim = tfsaLimitForYear(y);
      if (lim) accumulatedLimit += lim.amount;
    }

    const totalContributed = sumEntries(contributions, currentYear);
    const totalWithdrawn = sumEntries(withdrawals, currentYear);

    // Withdrawals are added back on Jan 1 of the FOLLOWING year. So a
    // withdrawal counts toward current room only if its year < currentYear.
    const withdrawalsAddedBack = sumEntries(withdrawals, currentYear - 1);

    const room = round2(accumulatedLimit - totalContributed + withdrawalsAddedBack);
    const overContributed = room < 0 ? round2(-room) : 0;

    return {
      accumulatedLimit: round2(accumulatedLimit),
      totalContributed: round2(totalContributed),
      totalWithdrawn: round2(totalWithdrawn),
      withdrawalsAddedBack: round2(withdrawalsAddedBack),
      room: room,
      overContributed: overContributed,
    };
  }

  // ---- FHSA ----

  function computeFhsaRoom(args) {
    args = args || {};
    const openYear = toInt(args.openYear);
    const currentYear = toInt(args.currentYear);
    const contributions = Array.isArray(args.contributions) ? args.contributions : [];

    if (openYear === null || currentYear === null || currentYear < openYear) {
      return {
        participationRoom: 0, totalContributed: 0, room: 0,
        lifetimeRemaining: FHSA_LIFETIME_CAP, overContributed: 0,
      };
    }

    const startYear = Math.max(openYear, FHSA_FIRST_YEAR);
    const totalContributed = sumEntries(contributions, currentYear);
    const participationRoom = computeFhsaParticipationRoom(startYear, currentYear, contributions);

    const lifetimeRemaining = round2(Math.max(0, FHSA_LIFETIME_CAP - totalContributed));
    const room = round2(Math.min(participationRoom, lifetimeRemaining));
    const overContributed = totalContributed > FHSA_LIFETIME_CAP
      ? round2(totalContributed - FHSA_LIFETIME_CAP)
      : (participationRoom < 0 ? round2(-participationRoom) : 0);

    return {
      participationRoom: round2(participationRoom),
      totalContributed: round2(totalContributed),
      room: room < 0 ? 0 : room,
      lifetimeRemaining: lifetimeRemaining,
      overContributed: overContributed,
    };
  }

  // Current-year FHSA participation room: carried-forward unused room
  // (capped at 8000) + this year's 8000 grant, less contributions to date,
  // all bounded by the 40000 lifetime cap on granted room.
  function computeFhsaParticipationRoom(startYear, currentYear, contributions) {
    let carryIn = 0;
    let lifetimeGranted = 0;

    for (let y = startYear; y <= currentYear; y++) {
      if (carryIn > FHSA_MAX_CARRYFORWARD) carryIn = FHSA_MAX_CARRYFORWARD;

      const remainingLifetime = FHSA_LIFETIME_CAP - lifetimeGranted;
      const newRoom = Math.max(0, Math.min(FHSA_ANNUAL_LIMIT, remainingLifetime));
      lifetimeGranted += newRoom;

      const available = carryIn + newRoom;
      const contribThisYear = sumEntries(
        contributions.filter((e) => e && toInt(e.year) === y),
      );
      const usedThisYear = Math.min(contribThisYear, available);
      carryIn = available - usedThisYear;

      if (y === currentYear) {
        // Room remaining this year after applying this year's contributions
        // (can go negative when the year is over-contributed).
        return available - contribThisYear;
      }
    }
    return 0;
  }

  // ---- RRSP ----

  function computeRrspRoom(args) {
    args = args || {};
    const craDeductionLimit = toNum(args.craDeductionLimit);
    const contributions = Array.isArray(args.contributions) ? args.contributions : [];

    const totalContributed = sumEntries(contributions);
    const room = round2(craDeductionLimit - totalContributed);

    // RRSP has a $2000 lifetime cushion before the penalty applies. Excess
    // beyond the cushion is the penalized over-contribution.
    const rawExcess = totalContributed - craDeductionLimit;
    const overContributed = rawExcess > RRSP_LIFETIME_CUSHION
      ? round2(rawExcess - RRSP_LIFETIME_CUSHION)
      : 0;

    return {
      craDeductionLimit: round2(craDeductionLimit),
      totalContributed: round2(totalContributed),
      room: room,
      overContributed: overContributed,
    };
  }

  // ---- dispatcher ----

  function summarizeRoom(accountType, args) {
    switch (String(accountType || '').toUpperCase()) {
      case 'TFSA': return computeTfsaRoom(args);
      case 'FHSA': return computeFhsaRoom(args);
      case 'RRSP': return computeRrspRoom(args);
      default: return null;
    }
  }

  return {
    // datasets (exposed for UI labels / reference)
    TFSA_LIMITS: TFSA_LIMITS,
    RRSP_MAXIMUMS: RRSP_MAXIMUMS,
    FHSA_ANNUAL_LIMIT: FHSA_ANNUAL_LIMIT,
    FHSA_MAX_CARRYFORWARD: FHSA_MAX_CARRYFORWARD,
    FHSA_LIFETIME_CAP: FHSA_LIFETIME_CAP,
    RRSP_LIFETIME_CUSHION: RRSP_LIFETIME_CUSHION,
    PENALTY_RATE: PENALTY_RATE,
    // lookups
    tfsaLimitForYear: tfsaLimitForYear,
    fhsaLimitForYear: fhsaLimitForYear,
    rrspMaxForYear: rrspMaxForYear,
    // computations
    computeTfsaRoom: computeTfsaRoom,
    computeFhsaRoom: computeFhsaRoom,
    computeRrspRoom: computeRrspRoom,
    overContributionPenalty: overContributionPenalty,
    summarizeRoom: summarizeRoom,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ContributionRoom;
} else if (typeof window !== 'undefined') {
  window.ContributionRoom = ContributionRoom;
}
