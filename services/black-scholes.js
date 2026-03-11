/* ============================================
   BLACK-SCHOLES OPTIONS PRICING ENGINE
   Pure implementation - no external libraries
   ============================================ */

/**
 * Standard Normal CDF approximation
 * Uses Abramowitz & Stegun approximation (error < 7.5e-8)
 */
function normalCDF(x) {
  if (x === 0) return 0.5;
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1.0 / (1.0 + p * absX);
  const t2 = t * t;
  const t3 = t2 * t;
  const t4 = t3 * t;
  const t5 = t4 * t;

  const y = 1.0 - (a1 * t + a2 * t2 + a3 * t3 + a4 * t4 + a5 * t5) * Math.exp(-absX * absX / 2);
  return 0.5 * (1.0 + sign * y);
}

/**
 * Standard Normal PDF
 */
function normalPDF(x) {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/**
 * Calculate d1 in Black-Scholes formula
 * @param {number} S - Spot price
 * @param {number} K - Strike price
 * @param {number} T - Time to expiry in years
 * @param {number} r - Risk-free rate (annualized, e.g. 0.043)
 * @param {number} sigma - Implied volatility (annualized, e.g. 0.30)
 * @returns {number}
 */
function d1(S, K, T, r, sigma) {
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) return 0;
  return (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
}

/**
 * Calculate d2 in Black-Scholes formula
 */
function d2(S, K, T, r, sigma) {
  return d1(S, K, T, r, sigma) - sigma * Math.sqrt(T);
}

/**
 * European Call option price
 */
function callPrice(S, K, T, r, sigma) {
  if (T <= 0) return Math.max(0, S - K);
  if (sigma <= 0) return Math.max(0, S - K * Math.exp(-r * T));
  const d1Val = d1(S, K, T, r, sigma);
  const d2Val = d2(S, K, T, r, sigma);
  return S * normalCDF(d1Val) - K * Math.exp(-r * T) * normalCDF(d2Val);
}

/**
 * European Put option price
 */
function putPrice(S, K, T, r, sigma) {
  if (T <= 0) return Math.max(0, K - S);
  if (sigma <= 0) return Math.max(0, K * Math.exp(-r * T) - S);
  const d1Val = d1(S, K, T, r, sigma);
  const d2Val = d2(S, K, T, r, sigma);
  return K * Math.exp(-r * T) * normalCDF(-d2Val) - S * normalCDF(-d1Val);
}

// ---- GREEKS ----

/**
 * Delta: rate of change of option price with respect to underlying price
 * Call delta: N(d1), range [0, 1]
 * Put delta: N(d1) - 1, range [-1, 0]
 */
function callDelta(S, K, T, r, sigma) {
  if (T <= 0) return S > K ? 1 : (S === K ? 0.5 : 0);
  return normalCDF(d1(S, K, T, r, sigma));
}

function putDelta(S, K, T, r, sigma) {
  if (T <= 0) return S < K ? -1 : (S === K ? -0.5 : 0);
  return normalCDF(d1(S, K, T, r, sigma)) - 1;
}

/**
 * Gamma: rate of change of delta with respect to underlying price
 * Same for calls and puts
 */
function gamma(S, K, T, r, sigma) {
  if (T <= 0 || sigma <= 0 || S <= 0) return 0;
  const d1Val = d1(S, K, T, r, sigma);
  return normalPDF(d1Val) / (S * sigma * Math.sqrt(T));
}

/**
 * Theta: rate of change of option price with respect to time (daily)
 * Expressed as price change per calendar day (divide annual by 365)
 */
function callTheta(S, K, T, r, sigma) {
  if (T <= 0 || sigma <= 0) return 0;
  const d1Val = d1(S, K, T, r, sigma);
  const d2Val = d2(S, K, T, r, sigma);
  const sqrtT = Math.sqrt(T);
  const term1 = -(S * normalPDF(d1Val) * sigma) / (2 * sqrtT);
  const term2 = -r * K * Math.exp(-r * T) * normalCDF(d2Val);
  return (term1 + term2) / 365;
}

function putTheta(S, K, T, r, sigma) {
  if (T <= 0 || sigma <= 0) return 0;
  const d1Val = d1(S, K, T, r, sigma);
  const d2Val = d2(S, K, T, r, sigma);
  const sqrtT = Math.sqrt(T);
  const term1 = -(S * normalPDF(d1Val) * sigma) / (2 * sqrtT);
  const term2 = r * K * Math.exp(-r * T) * normalCDF(-d2Val);
  return (term1 + term2) / 365;
}

/**
 * Vega: rate of change of option price with respect to volatility
 * Per 1% change in IV (divide by 100)
 * Same for calls and puts
 */
function vega(S, K, T, r, sigma) {
  if (T <= 0 || sigma <= 0) return 0;
  const d1Val = d1(S, K, T, r, sigma);
  return (S * normalPDF(d1Val) * Math.sqrt(T)) / 100;
}

/**
 * Rho: rate of change of option price with respect to interest rate
 * Per 1% change in rate (divide by 100)
 */
function callRho(S, K, T, r, sigma) {
  if (T <= 0) return 0;
  const d2Val = d2(S, K, T, r, sigma);
  return (K * T * Math.exp(-r * T) * normalCDF(d2Val)) / 100;
}

function putRho(S, K, T, r, sigma) {
  if (T <= 0) return 0;
  const d2Val = d2(S, K, T, r, sigma);
  return -(K * T * Math.exp(-r * T) * normalCDF(-d2Val)) / 100;
}

// ---- IMPLIED VOLATILITY SOLVER ----

/**
 * Newton-Raphson method to solve for implied volatility
 * @param {number} marketPrice - observed option price
 * @param {number} S - spot price
 * @param {number} K - strike price
 * @param {number} T - time to expiry in years
 * @param {number} r - risk-free rate
 * @param {string} type - 'call' or 'put'
 * @returns {number} implied volatility (annualized)
 */
function impliedVolatility(marketPrice, S, K, T, r, type) {
  if (T <= 0 || marketPrice <= 0) return 0;

  const priceFn = type === 'call' ? callPrice : putPrice;

  // Initial guess using Brenner-Subrahmanyam approximation
  let sigma = Math.sqrt(2 * Math.PI / T) * (marketPrice / S);
  sigma = Math.max(0.01, Math.min(sigma, 5.0));

  const maxIter = 100;
  const tolerance = 1e-8;

  for (let i = 0; i < maxIter; i++) {
    const price = priceFn(S, K, T, r, sigma);
    const diff = price - marketPrice;

    if (Math.abs(diff) < tolerance) return sigma;

    // Vega (not per-percent, raw)
    const d1Val = d1(S, K, T, r, sigma);
    const vegaVal = S * normalPDF(d1Val) * Math.sqrt(T);

    if (vegaVal < 1e-12) break;

    sigma -= diff / vegaVal;
    sigma = Math.max(0.001, Math.min(sigma, 10.0));
  }

  return sigma;
}

// ---- BJERKSUND-STENSLAND 2002 AMERICAN OPTION APPROXIMATION ----

/**
 * American option pricing using Bjerksund-Stensland 2002 model.
 * For calls on non-dividend-paying stocks, American = European.
 * For puts (or dividend-paying stocks), this provides a closed-form approximation.
 */
function phi(S, T, gamma2, H, I, r, b, sigma) {
  const lambda = (-r + gamma2 * b + 0.5 * gamma2 * (gamma2 - 1) * sigma * sigma) * T;
  const d1Val = -(Math.log(S / H) + (b + (gamma2 - 0.5) * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const kappa = 2 * b / (sigma * sigma) + (2 * gamma2 - 1);
  return Math.exp(lambda) * Math.pow(S, gamma2) * (normalCDF(d1Val) - Math.pow(I / S, kappa) * normalCDF(d1Val - 2 * Math.log(I / S) / (sigma * Math.sqrt(T))));
}

function americanCallPrice(S, K, T, r, sigma, b) {
  // b = r for non-dividend paying, b = r - q for dividend-paying
  if (typeof b === 'undefined') b = r;
  if (T <= 0) return Math.max(0, S - K);

  // When b >= r (no dividend advantage), American call = European call
  if (b >= r) return callPrice(S, K, T, r, sigma);

  const beta = (0.5 - b / (sigma * sigma)) + Math.sqrt(Math.pow(b / (sigma * sigma) - 0.5, 2) + 2 * r / (sigma * sigma));
  const bInfinity = (beta / (beta - 1)) * K;
  const b0 = Math.max(K, (r / (r - b)) * K);

  const ht = -(b * T + 2 * sigma * Math.sqrt(T)) * (b0 / (bInfinity - b0));
  const I = b0 + (bInfinity - b0) * (1 - Math.exp(ht));

  if (S >= I) return S - K;

  const alpha = (I - K) * Math.pow(I, -beta);
  return alpha * Math.pow(S, beta)
    - alpha * phi(S, T, beta, I, I, r, b, sigma)
    + phi(S, T, 1, I, I, r, b, sigma)
    - phi(S, T, 1, K, I, r, b, sigma)
    - K * phi(S, T, 0, I, I, r, b, sigma)
    + K * phi(S, T, 0, K, I, r, b, sigma);
}

function americanPutPrice(S, K, T, r, sigma, b) {
  // Use put-call transformation: P_am(S,K,T,r,b) = C_am(K,S,T,r-b,-b)
  if (typeof b === 'undefined') b = r;
  if (T <= 0) return Math.max(0, K - S);
  return americanCallPrice(K, S, T, r - b, sigma, -b);
}

/**
 * Calculate all Greeks for a given option
 * @param {number} S - Spot price
 * @param {number} K - Strike price
 * @param {number} T - Time to expiry in years
 * @param {number} r - Risk-free rate
 * @param {number} sigma - Implied volatility
 * @param {string} type - 'call' or 'put'
 * @returns {object} { price, delta, gamma, theta, vega, rho }
 */
function calculateAllGreeks(S, K, T, r, sigma, type) {
  const isCall = type === 'call';
  return {
    price: isCall ? callPrice(S, K, T, r, sigma) : putPrice(S, K, T, r, sigma),
    americanPrice: isCall ? americanCallPrice(S, K, T, r, sigma) : americanPutPrice(S, K, T, r, sigma),
    delta: isCall ? callDelta(S, K, T, r, sigma) : putDelta(S, K, T, r, sigma),
    gamma: gamma(S, K, T, r, sigma),
    theta: isCall ? callTheta(S, K, T, r, sigma) : putTheta(S, K, T, r, sigma),
    vega: vega(S, K, T, r, sigma),
    rho: isCall ? callRho(S, K, T, r, sigma) : putRho(S, K, T, r, sigma),
  };
}

// Export for both Node.js and browser
const BlackScholes = {
  normalCDF,
  normalPDF,
  d1,
  d2,
  callPrice,
  putPrice,
  callDelta,
  putDelta,
  gamma,
  callTheta,
  putTheta,
  vega,
  callRho,
  putRho,
  impliedVolatility,
  americanCallPrice,
  americanPutPrice,
  calculateAllGreeks,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = BlackScholes;
} else if (typeof window !== 'undefined') {
  window.BlackScholes = BlackScholes;
}
