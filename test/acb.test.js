'use strict';

const test = require('node:test');
const assert = require('node:assert');
const ACB = require('../services/acb.js');

// Monetary assertion helper: capital-gains math is decimal, but pooled ACB per
// share (e.g. 35.10) is not exactly representable in binary floating point, so
// compare within a cent-scale tolerance.
function approx(actual, expected, tol, msg) {
  const t = tol === undefined ? 1e-6 : tol;
  assert.ok(
    Math.abs(actual - expected) < t,
    (msg || 'value') + ': got ' + actual + ', expected ~' + expected +
    ' (diff ' + Math.abs(actual - expected).toExponential(3) + ')'
  );
}

// Find the ledger row for the Nth transaction of a given type (0-based).
function rowOf(ledger, type, occurrence) {
  const matches = ledger.filter((r) => r.type === type);
  return matches[occurrence || 0];
}

/* --------------------------------------------------------------------------
   CLASSIC WORKED EXAMPLE: two buys then a partial sell.
   Buy 100 @ $30 + $10 comm  -> ACB 100*30 + 10 = 3010
   Buy 100 @ $40 + $10 comm  -> ACB += 100*40 + 10 = 4010; total 7020, 200 sh
                                ACB per share = 7020 / 200 = 35.10
   Sell 50 @ $50 - $10 comm  -> proceeds 50*50 - 10 = 2490
                                cost basis 50 * 35.10 = 1755
                                gain = 2490 - 1755 = 735
   Remaining: 150 sh, ACB 7020 - 1755 = 5265, per share 5265/150 = 35.10
   -------------------------------------------------------------------------- */
test('two buys then partial sell: weighted ACB and realized gain', () => {
  const { ledger, summary } = ACB.computeACB([
    { date: '2026-01-01', type: 'buy', shares: 100, price: 30, commission: 10 },
    { date: '2026-01-02', type: 'buy', shares: 100, price: 40, commission: 10 },
    { date: '2026-02-01', type: 'sell', shares: 50, price: 50, commission: 10 },
  ]);

  const buy2 = rowOf(ledger, 'buy', 1);
  approx(buy2.totalACB, 7020, 1e-6, 'total ACB after second buy');
  approx(buy2.acbPerShare, 35.10, 1e-9, 'ACB per share after second buy');
  assert.strictEqual(buy2.sharesHeld, 200);

  const sell = rowOf(ledger, 'sell', 0);
  approx(sell.proceeds, 2490, 1e-6, 'sell proceeds net of commission');
  approx(sell.costBasis, 1755, 1e-6, 'sell cost basis');
  approx(sell.capitalGain, 735, 1e-6, 'realized capital gain');
  assert.strictEqual(sell.superficialLoss, false);
  approx(sell.sharesHeld, 150, 1e-9, 'shares remaining');
  approx(sell.totalACB, 5265, 1e-6, 'ACB remaining');
  approx(sell.acbPerShare, 35.10, 1e-9, 'ACB per share unchanged by sell');

  approx(summary.totalRealizedGain, 735, 1e-6, 'summary realized gain');
  approx(summary.currentBookValue, 5265, 1e-6, 'summary book value');
  approx(summary.currentACBPerShare, 35.10, 1e-9, 'summary ACB per share');
  approx(summary.currentShares, 150, 1e-9, 'summary shares');
});

/* --------------------------------------------------------------------------
   COMMISSIONS: buy commission ADDS to ACB, sell commission REDUCES proceeds.
   Buy 100 @ $50 + $20 comm  -> ACB 5020, per share 50.20
   Sell 100 @ $50 - $20 comm -> proceeds 4980, cost 5020, gain = -40
   The whole loss here is the two commissions. No rebuy, so it is allowed.
   -------------------------------------------------------------------------- */
test('commissions increase ACB on buys and reduce proceeds on sells', () => {
  const { ledger } = ACB.computeACB([
    { date: '2026-03-01', type: 'buy', shares: 100, price: 50, commission: 20 },
    { date: '2026-03-10', type: 'sell', shares: 100, price: 50, commission: 20 },
  ]);
  const buy = rowOf(ledger, 'buy', 0);
  approx(buy.totalACB, 5020, 1e-6, 'ACB includes buy commission');
  approx(buy.acbPerShare, 50.20, 1e-9, 'ACB per share includes buy commission');

  const sell = rowOf(ledger, 'sell', 0);
  approx(sell.proceeds, 4980, 1e-6, 'proceeds reduced by sell commission');
  approx(sell.capitalGain, -40, 1e-6, 'loss equals the two commissions');
  assert.strictEqual(sell.superficialLoss, false);
});

/* --------------------------------------------------------------------------
   FULL SALE returns holdings and total ACB to zero.
   Buy 100 @ $10 -> ACB 1000. Sell 100 @ $12 -> gain 200, then flat.
   -------------------------------------------------------------------------- */
test('full sale returns shares and ACB to zero', () => {
  const { ledger, summary } = ACB.computeACB([
    { date: '2026-04-01', type: 'buy', shares: 100, price: 10 },
    { date: '2026-04-05', type: 'sell', shares: 100, price: 12 },
  ]);
  const sell = rowOf(ledger, 'sell', 0);
  approx(sell.capitalGain, 200, 1e-6, 'gain on full sale');
  assert.strictEqual(sell.sharesHeld, 0);
  assert.strictEqual(sell.totalACB, 0);
  assert.strictEqual(sell.acbPerShare, 0);

  assert.strictEqual(summary.currentShares, 0);
  assert.strictEqual(summary.currentBookValue, 0);
  assert.strictEqual(summary.currentACBPerShare, 0);
  approx(summary.totalRealizedGain, 200, 1e-6, 'summary gain');

  // currentACB convenience wrapper agrees.
  const cur = ACB.currentACB([
    { date: '2026-04-01', type: 'buy', shares: 100, price: 10 },
    { date: '2026-04-05', type: 'sell', shares: 100, price: 12 },
  ]);
  assert.deepStrictEqual(cur, { shares: 0, totalACB: 0, acbPerShare: 0 });
});

/* --------------------------------------------------------------------------
   SUPERFICIAL LOSS: sell at a loss, rebuy within 30 days, still holding at the
   end of the window. The loss is denied and added to the ACB of the rebuy.
   Buy 100 @ $10 (Jan 1)  -> ACB 1000, per share 10
   Sell 100 @ $8 (Jan 15) -> proceeds 800, cost 1000, raw loss -200
   Buy 100 @ $8 (Jan 30)  -> within 30 days after Jan 15; held at Feb 14
   Window for the Jan 15 sale: Dec 16 .. Feb 14.
     S (sold)              = 100
     P (acquired in window)= Jan 1 buy (100) + Jan 30 buy (100) = 200
     B (held at window end)= 100 + 100 - 100 = 100
     denied shares = min(100, 200, 100) = 100
     denied loss   = 100/100 * 200 = 200  (the entire loss is denied)
     allowed loss  = 0
   Reallocation: the substituted property is the Jan 30 rebuy (settles after the
   sale). Denied loss 200 is added to its ACB: 800 base + 200 = 1000, per share
   back to 10.00.
   -------------------------------------------------------------------------- */
test('superficial loss: denied and reallocated to the repurchase ACB', () => {
  const { ledger, summary } = ACB.computeACB([
    { date: '2026-01-01', type: 'buy', shares: 100, price: 10 },
    { date: '2026-01-15', type: 'sell', shares: 100, price: 8 },
    { date: '2026-01-30', type: 'buy', shares: 100, price: 8 },
  ]);

  const sell = rowOf(ledger, 'sell', 0);
  assert.strictEqual(sell.superficialLoss, true);
  approx(sell.rawCapitalGain, -200, 1e-6, 'raw loss before denial');
  approx(sell.deniedLoss, 200, 1e-6, 'denied loss amount');
  approx(sell.capitalGain, 0, 1e-9, 'allowed loss is zero');

  const rebuy = rowOf(ledger, 'buy', 1);
  approx(rebuy.superficialLossAdjustment, 200, 1e-6, 'denied loss added to rebuy ACB');
  approx(rebuy.totalACB, 1000, 1e-6, 'rebuy ACB = 800 base + 200 denied');
  approx(rebuy.acbPerShare, 10, 1e-9, 'rebuy ACB per share restored to 10');
  approx(rebuy.sharesHeld, 100, 1e-9, 'holding after rebuy');

  approx(summary.totalRealizedGain, 0, 1e-9, 'no realized loss this year');
  approx(summary.totalSuperficialLossDenied, 200, 1e-6, 'total denied loss');
  approx(summary.currentBookValue, 1000, 1e-6, 'current book value carries the deferred loss');
});

/* --------------------------------------------------------------------------
   NON-SUPERFICIAL LOSS (a): rebuy AFTER the 30-day window -> loss allowed.
   Buy 100 @ $10 (Jan 1), Sell 100 @ $8 (Jan 15), Buy 100 @ $8 (Mar 1).
   Window for the sale ends Feb 14; the Mar 1 rebuy is outside it, so at window
   end nothing is held (100 - 100 = 0). B = 0, so no denial.
   -------------------------------------------------------------------------- */
test('non-superficial loss: rebuy after 30 days is allowed', () => {
  const { ledger, summary } = ACB.computeACB([
    { date: '2026-01-01', type: 'buy', shares: 100, price: 10 },
    { date: '2026-01-15', type: 'sell', shares: 100, price: 8 },
    { date: '2026-03-01', type: 'buy', shares: 100, price: 8 },
  ]);
  const sell = rowOf(ledger, 'sell', 0);
  assert.strictEqual(sell.superficialLoss, false);
  approx(sell.capitalGain, -200, 1e-6, 'full loss allowed');
  approx(sell.deniedLoss, 0, 1e-9, 'nothing denied');

  const rebuy = rowOf(ledger, 'buy', 1);
  approx(rebuy.superficialLossAdjustment, 0, 1e-9, 'no ACB adjustment on rebuy');
  approx(rebuy.totalACB, 800, 1e-6, 'rebuy ACB is just its base cost');
  approx(summary.totalRealizedGain, -200, 1e-6, 'loss flows to summary');
});

/* --------------------------------------------------------------------------
   NON-SUPERFICIAL LOSS (b): rebuy inside the window but NOT held at window end.
   Buy 100 @ $10 (Jan 1), Sell 100 @ $8 (Jan 15), Buy 100 @ $8 (Jan 20),
   Sell 100 @ $9 (Jan 25). All inside the window, but at window end (Feb 14)
   holdings are 100 - 100 + 100 - 100 = 0, so B = 0 and the Jan 15 loss is not
   superficial. (The Jan 25 disposition of the rebuy is a separate small gain.)
   -------------------------------------------------------------------------- */
test('non-superficial loss: rebuy sold before window end (not held) is allowed', () => {
  const { ledger } = ACB.computeACB([
    { date: '2026-01-01', type: 'buy', shares: 100, price: 10 },
    { date: '2026-01-15', type: 'sell', shares: 100, price: 8 },
    { date: '2026-01-20', type: 'buy', shares: 100, price: 8 },
    { date: '2026-01-25', type: 'sell', shares: 100, price: 9 },
  ]);
  const firstSell = rowOf(ledger, 'sell', 0);
  assert.strictEqual(firstSell.superficialLoss, false);
  approx(firstSell.capitalGain, -200, 1e-6, 'first loss allowed because nothing held at window end');

  // The rebuy (ACB 800, per share 8) then sold at $9 -> gain 100.
  const secondSell = rowOf(ledger, 'sell', 1);
  approx(secondSell.capitalGain, 100, 1e-6, 'gain on the second disposition');
});

/* --------------------------------------------------------------------------
   MULTI-CURRENCY: each transaction converts to CAD with its OWN fxRate.
   Buy 100 @ $20 USD, fxRate 1.35 -> ACB 100*20*1.35 = 2700 CAD, per share 27.00
   Sell 100 @ $25 USD, fxRate 1.30 -> proceeds 100*25*1.30 = 3250 CAD
   CAD gain = 3250 - 2700 = 550 (note the USD gain of $500 differs because the
   FX rate moved between the two transaction dates).
   -------------------------------------------------------------------------- */
test('USD transactions convert to CAD using each transaction fxRate', () => {
  const { ledger, summary } = ACB.computeACB([
    { date: '2026-01-10', type: 'buy', shares: 100, price: 20, fxRate: 1.35 },
    { date: '2026-06-10', type: 'sell', shares: 100, price: 25, fxRate: 1.30 },
  ]);
  const buy = rowOf(ledger, 'buy', 0);
  approx(buy.totalACB, 2700, 1e-6, 'CAD ACB reflects the buy-date rate');
  approx(buy.acbPerShare, 27, 1e-9, 'CAD ACB per share');

  const sell = rowOf(ledger, 'sell', 0);
  approx(sell.proceeds, 3250, 1e-6, 'CAD proceeds reflect the sell-date rate');
  approx(sell.capitalGain, 550, 1e-6, 'CAD gain uses both transaction rates');
  approx(summary.totalRealizedGain, 550, 1e-6, 'summary CAD gain');
});

/* --------------------------------------------------------------------------
   RETURN OF CAPITAL reduces ACB, then a later sale reflects the lower basis.
   Buy 100 @ $10 -> ACB 1000, per share 10
   ROC amount $100 -> ACB 900, per share 9 (share count unchanged)
   Sell 100 @ $10 -> proceeds 1000, cost 900, gain 100
   -------------------------------------------------------------------------- */
test('return of capital reduces ACB and raises the later gain', () => {
  const { ledger, summary } = ACB.computeACB([
    { date: '2026-02-01', type: 'buy', shares: 100, price: 10 },
    { date: '2026-05-01', type: 'roc', amount: 100 },
    { date: '2026-09-01', type: 'sell', shares: 100, price: 10 },
  ]);
  const roc = rowOf(ledger, 'roc', 0);
  approx(roc.totalACB, 900, 1e-6, 'ROC reduces ACB');
  approx(roc.acbPerShare, 9, 1e-9, 'ROC reduces ACB per share, not shares');
  assert.strictEqual(roc.sharesHeld, 100);

  const sell = rowOf(ledger, 'sell', 0);
  approx(sell.capitalGain, 100, 1e-6, 'gain reflects the ROC-reduced basis');
  approx(summary.totalRealizedGain, 100, 1e-6, 'summary gain');
});

/* --------------------------------------------------------------------------
   ROC IN EXCESS of ACB triggers a capital gain and floors ACB at zero.
   Buy 100 @ $10 -> ACB 1000. ROC amount $1200 -> ACB 0, capital gain 200.
   -------------------------------------------------------------------------- */
test('return of capital in excess of ACB triggers a capital gain', () => {
  const { ledger, summary } = ACB.computeACB([
    { date: '2026-02-01', type: 'buy', shares: 100, price: 10 },
    { date: '2026-06-01', type: 'roc', amount: 1200 },
  ]);
  const roc = rowOf(ledger, 'roc', 0);
  approx(roc.rocCapitalGain, 200, 1e-6, 'excess ROC becomes a capital gain');
  assert.strictEqual(roc.totalACB, 0);
  approx(summary.totalRealizedGain, 200, 1e-6, 'excess ROC gain in summary');
});

/* --------------------------------------------------------------------------
   SELLING MORE THAN HELD throws a clear error.
   -------------------------------------------------------------------------- */
test('selling more shares than held throws', () => {
  assert.throws(
    () => ACB.computeACB([
      { date: '2026-01-01', type: 'buy', shares: 100, price: 10 },
      { date: '2026-01-02', type: 'sell', shares: 150, price: 12 },
    ]),
    /Cannot sell 150 shares/,
    'should reject overselling'
  );
});

/* --------------------------------------------------------------------------
   FRACTIONAL SHARES are handled.
   Buy 10.5 @ $10 -> ACB 105, per share 10
   Sell 5.25 @ $12 -> proceeds 63, cost 5.25*10 = 52.5, gain 10.5
   Remaining 5.25 sh, ACB 52.5
   -------------------------------------------------------------------------- */
test('fractional shares compute correctly', () => {
  const { ledger, summary } = ACB.computeACB([
    { date: '2026-01-01', type: 'buy', shares: 10.5, price: 10 },
    { date: '2026-02-01', type: 'sell', shares: 5.25, price: 12 },
  ]);
  const sell = rowOf(ledger, 'sell', 0);
  approx(sell.capitalGain, 10.5, 1e-6, 'gain on fractional sale');
  approx(sell.sharesHeld, 5.25, 1e-9, 'fractional remaining shares');
  approx(summary.currentBookValue, 52.5, 1e-6, 'fractional remaining ACB');
});

/* --------------------------------------------------------------------------
   OUT-OF-ORDER dates are sorted before processing. Feeding the classic worked
   example scrambled must yield the same result as the in-order case.
   -------------------------------------------------------------------------- */
test('out-of-order transactions are sorted by date', () => {
  const scrambled = ACB.computeACB([
    { date: '2026-02-01', type: 'sell', shares: 50, price: 50, commission: 10 },
    { date: '2026-01-02', type: 'buy', shares: 100, price: 40, commission: 10 },
    { date: '2026-01-01', type: 'buy', shares: 100, price: 30, commission: 10 },
  ]);
  approx(scrambled.summary.currentBookValue, 5265, 1e-6, 'ACB after sorting');
  approx(scrambled.summary.currentACBPerShare, 35.10, 1e-9, 'ACB per share after sorting');
  approx(scrambled.summary.totalRealizedGain, 735, 1e-6, 'gain after sorting');
  // The sell must be processed last despite being listed first.
  assert.strictEqual(scrambled.ledger[scrambled.ledger.length - 1].type, 'sell');
});

/* --------------------------------------------------------------------------
   ZERO HOLDINGS: an empty transaction list yields a flat position.
   -------------------------------------------------------------------------- */
test('empty transaction list yields zero position', () => {
  const cur = ACB.currentACB([]);
  assert.deepStrictEqual(cur, { shares: 0, totalACB: 0, acbPerShare: 0 });
});
