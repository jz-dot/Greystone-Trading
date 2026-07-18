'use strict';

const test = require('node:test');
const assert = require('node:assert');
const BS = require('../services/black-scholes.js');

// Reference N(x) values from standard normal tables.
const PHI = {
  '-2': 0.0227501319,
  '-1.96': 0.0249978952,
  '-1': 0.1586552539,
  '0': 0.5,
  '0.5': 0.6914624613,
  '1': 0.8413447461,
  '1.96': 0.9750021048,
  '2': 0.9772498681,
};

test('normalCDF matches standard normal table (A&S 7.1.26 tolerance)', () => {
  for (const [x, expected] of Object.entries(PHI)) {
    const got = BS.normalCDF(Number(x));
    assert.ok(
      Math.abs(got - expected) < 2e-7,
      `Phi(${x}) = ${got}, expected ~${expected} (diff ${Math.abs(got - expected).toExponential(2)})`
    );
  }
});

test('normalCDF is symmetric: Phi(x) + Phi(-x) = 1', () => {
  for (const x of [0.1, 0.5, 1, 1.5, 2, 3]) {
    assert.ok(Math.abs(BS.normalCDF(x) + BS.normalCDF(-x) - 1) < 1e-9, `symmetry failed at ${x}`);
  }
});

test('normalCDF is monotonically increasing and bounded in (0,1)', () => {
  let prev = 0;
  for (let x = -5; x <= 5; x += 0.25) {
    const v = BS.normalCDF(x);
    assert.ok(v > 0 && v < 1, `Phi(${x}) out of (0,1): ${v}`);
    assert.ok(v >= prev, `not monotonic at ${x}`);
    prev = v;
  }
});

// Regression guard for the fixed bug: the old implementation priced this
// ATM call near 8.48; the correct Black-Scholes value is ~6.496.
test('ATM call is correctly priced (regression guard for the CDF bug)', () => {
  const S = 100, K = 100, T = 0.25, r = 0.043, sigma = 0.30;
  const c = BS.callPrice(S, K, T, r, sigma);
  assert.ok(Math.abs(c - 6.496) < 0.02, `ATM call = ${c}, expected ~6.496`);
  assert.ok(c < 7.5, `ATM call ${c} looks like the old ~8.48 overpricing bug`);
});

test('put-call parity holds: C - P = S - K e^{-rT}', () => {
  const cases = [
    { S: 100, K: 100, T: 0.25, r: 0.043, sigma: 0.30 },
    { S: 120, K: 100, T: 1.0, r: 0.05, sigma: 0.45 },
    { S: 80, K: 100, T: 0.5, r: 0.03, sigma: 0.20 },
  ];
  for (const { S, K, T, r, sigma } of cases) {
    const c = BS.callPrice(S, K, T, r, sigma);
    const p = BS.putPrice(S, K, T, r, sigma);
    const parity = S - K * Math.exp(-r * T);
    assert.ok(Math.abs((c - p) - parity) < 1e-6, `parity failed for ${JSON.stringify({ S, K, T })}`);
  }
});

test('call delta N(d1) sits in [0,1] and put delta in [-1,0]', () => {
  const S = 100, K = 100, T = 0.25, r = 0.043, sigma = 0.30;
  const cd = BS.callDelta(S, K, T, r, sigma);
  const pd = BS.putDelta(S, K, T, r, sigma);
  assert.ok(cd > 0.5 && cd < 0.6, `ATM call delta = ${cd}, expected ~0.55`);
  assert.ok(Math.abs((cd - pd) - 1) < 1e-9, 'call delta - put delta should equal 1');
});

test('gamma, vega positive; call theta negative for ATM option', () => {
  const S = 100, K = 100, T = 0.25, r = 0.043, sigma = 0.30;
  assert.ok(BS.gamma(S, K, T, r, sigma) > 0, 'gamma must be positive');
  assert.ok(BS.vega(S, K, T, r, sigma) > 0, 'vega must be positive');
  assert.ok(BS.callTheta(S, K, T, r, sigma) < 0, 'ATM call theta must be negative');
});

// The IV solver must recover the sigma used to price the option, which only
// works if the pricer it inverts is itself correct.
test('implied volatility round-trips against the corrected pricer', () => {
  const S = 100, K = 105, T = 0.5, r = 0.043;
  for (const trueSigma of [0.15, 0.30, 0.55, 0.80]) {
    for (const type of ['call', 'put']) {
      const price = type === 'call'
        ? BS.callPrice(S, K, T, r, trueSigma)
        : BS.putPrice(S, K, T, r, trueSigma);
      const iv = BS.impliedVolatility(price, S, K, T, r, type);
      assert.ok(Math.abs(iv - trueSigma) < 1e-4, `${type} IV solve: got ${iv}, expected ${trueSigma}`);
    }
  }
});
