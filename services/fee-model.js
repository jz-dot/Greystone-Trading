/* ============================================
   CANADIAN RETAIL BROKER FEE MODEL
   Pure functions - no network, no side effects.

   Strategic core of GSP Trading: quantify the TOTAL cost of a trade at
   every major Canadian retail broker so a user can see, for their own
   accounts, which venue is genuinely cheapest once the hidden currency
   conversion fee is counted.

   DATA CURRENCY / ACCURACY WARNING
   --------------------------------
   The fee figures encoded below are as of mid-2026. Several are secondary
   sourced (broker marketing pages, community trackers) rather than pulled
   from a live fee schedule, and brokers change pricing frequently. Every
   number carries a `verify` flag where it was not confirmed against a
   primary source. VERIFY the whole table against each broker's current
   published fee schedule before using this in production or quoting a user.

   MODELING SIMPLIFICATION
   -----------------------
   Every fee component in a single estimate is expressed in the trade
   currency. Commission and option fees quoted by a broker in its home
   currency (for example a bank's CAD flat commission on a USD trade) are
   treated as if they are in the trade currency. That small simplification
   keeps the math pure and is immaterial next to the FX line, which is the
   number this tool exists to expose. FX cost is charged only when the
   trade currency differs from the account base currency.
   ============================================ */

/**
 * BROKERS
 * Editable data table of 2025-2026 Canadian retail brokerage costs.
 *
 * Field shapes:
 *   stockCommission:
 *     { type: 'flat',      amount, note, verify }
 *     { type: 'perShare',  amount, minimum, maxPct, currency, note, verify }
 *   optionsFee:
 *     { base, perContract, minimum, currency, note, verify }   fee = base + perContract * contracts, floored at minimum
 *   fx (cost to convert one currency to another):
 *     { ratePct, minCost, type: 'spread' | 'commission', note, verify }
 *     cost = max(notional * ratePct / 100, minCost), charged only on cross-currency trades
 *   accountFees: free-text note on inactivity / maintenance fees
 *
 * ratePct is a PERCENT (1.5 means 1.5%). minCost is in the trade currency.
 */
const BROKERS = {
  wealthsimple: {
    id: 'wealthsimple',
    name: 'Wealthsimple',
    stockCommission: { type: 'flat', amount: 0, note: 'Commission-free stocks and ETFs.', verify: false },
    // Wealthsimple options are encoded at $0 per contract per the GSP Trading
    // spec. Verify against current tiers: retail options pricing has been
    // reported as a per-contract fee for non-Premium tiers.
    optionsFee: { base: 0, perContract: 0, minimum: 0, currency: 'CAD', note: 'Encoded $0 per contract. Verify against current Wealthsimple options tiers.', verify: true },
    fx: { ratePct: 1.5, minCost: 0, type: 'spread', note: '1.5% conversion on CAD<->USD in a non-USD account. Avoidable with a USD account or Norberts Gambit.', verify: true },
    accountFees: 'No account or inactivity fee.',
  },

  questrade: {
    id: 'questrade',
    name: 'Questrade',
    stockCommission: { type: 'flat', amount: 0, note: 'Commission-free stocks and ETFs (2025 change). Verify.', verify: true },
    optionsFee: { base: 0, perContract: 0.99, minimum: 0.99, currency: 'CAD', note: '$0.99 per contract, tiered. Verify base/min against current schedule.', verify: true },
    fx: { ratePct: 1.5, minCost: 0, type: 'spread', note: 'Roughly 1.5% conversion; USD accounts available to avoid it.', verify: true },
    accountFees: 'No inactivity fee.',
  },

  nbdb: {
    id: 'nbdb',
    name: 'National Bank Direct (NBDB)',
    stockCommission: { type: 'flat', amount: 0, note: 'Commission-free stocks, ETFs and options base since 2021.', verify: false },
    optionsFee: { base: 0, perContract: 1.25, minimum: 6.25, currency: 'CAD', note: '$1.25 per contract, minimum $6.25 per trade.', verify: true },
    fx: { ratePct: 1.5, minCost: 0, type: 'spread', note: 'Bank retail conversion spread, roughly 1.5% or more. Norberts Gambit popular here.', verify: true },
    accountFees: 'No commission but standard registered-account admin fees may apply.',
  },

  qtrade: {
    id: 'qtrade',
    name: 'Qtrade Direct Investing',
    stockCommission: { type: 'flat', amount: 8.75, note: '$8.75 per equity trade; 100+ ETFs trade free. Verify tier.', verify: true },
    optionsFee: { base: 8.75, perContract: 1.25, minimum: 8.75, currency: 'CAD', note: '$8.75 + $1.25 per contract. Verify.', verify: true },
    fx: { ratePct: 1.5, minCost: 0, type: 'spread', note: 'Roughly 1.5% conversion; USD accounts available.', verify: true },
    accountFees: 'Quarterly admin fee unless balance or activity minimums met.',
  },

  ibkr: {
    id: 'ibkr',
    name: 'Interactive Brokers (IBKR Canada, Pro)',
    // IBKR Pro fixed US tier: US$0.005/share, min US$1, capped at 1% of trade value.
    stockCommission: { type: 'perShare', amount: 0.005, minimum: 1.0, maxPct: 1, currency: 'USD', note: 'IBKR Pro fixed: US$0.005/share, min US$1, cap 1% of trade value.', verify: true },
    optionsFee: { base: 0, perContract: 0.65, minimum: 1.0, currency: 'USD', note: 'US$0.65 per contract, min US$1 per order (IBKR Pro tiered/fixed).', verify: true },
    // The headline: IBKR converts at essentially spot. Commission is 0.002%
    // of converted value, minimum US$2 per conversion.
    fx: { ratePct: 0.002, minCost: 2.0, type: 'commission', note: 'Converts at ~spot: 0.002% commission, min US$2. Effectively no spread.', verify: true },
    accountFees: 'No monthly inactivity fee (eliminated 2021).',
  },

  moomoo: {
    id: 'moomoo',
    name: 'Moomoo Canada',
    stockCommission: { type: 'flat', amount: 0, note: 'Advertised $0 commission stocks/ETFs. Verify.', verify: true },
    optionsFee: { base: 0, perContract: 0, minimum: 0, currency: 'CAD', note: 'Options availability and per-contract fee in Canada not confirmed. Verify.', verify: true },
    // CAUTION: moomoo advertises $0 FX, but a $0 conversion fee typically
    // means the cost is buried in a widened bid/ask spread. The true cost is
    // unverified. Do NOT present moomoo as free FX without confirming.
    fx: { ratePct: 0, minCost: 0, type: 'spread', note: 'CAUTION: $0 advertised, real cost likely embedded in the FX spread and is UNVERIFIED. Do not treat as truly free.', verify: true },
    accountFees: 'None advertised.',
  },

  webull: {
    id: 'webull',
    name: 'Webull Canada',
    stockCommission: { type: 'flat', amount: 0, note: 'Advertised $0 commission stocks/ETFs. Verify.', verify: true },
    optionsFee: { base: 0, perContract: 0, minimum: 0, currency: 'CAD', note: 'Options availability and per-contract fee in Canada not confirmed. Verify.', verify: true },
    fx: { ratePct: 1.5, minCost: 0, type: 'spread', note: 'Roughly 1.5% conversion on CAD<->USD. Verify.', verify: true },
    accountFees: 'None advertised.',
  },

  td: {
    id: 'td',
    name: 'TD Direct Investing',
    stockCommission: { type: 'flat', amount: 9.99, note: '$9.99 flat per equity trade.', verify: false },
    optionsFee: { base: 9.99, perContract: 1.25, minimum: 9.99, currency: 'CAD', note: '$9.99 + $1.25 per contract.', verify: true },
    fx: { ratePct: 1.5, minCost: 0, type: 'spread', note: 'Bank retail conversion spread, roughly 1.5% or more. USD accounts available to avoid.', verify: true },
    accountFees: 'Quarterly maintenance fee unless balance minimum (about $15k) met.',
  },

  rbc: {
    id: 'rbc',
    name: 'RBC Direct Investing',
    stockCommission: { type: 'flat', amount: 9.95, note: '$9.95 flat per equity trade.', verify: false },
    optionsFee: { base: 9.95, perContract: 1.25, minimum: 9.95, currency: 'CAD', note: '$9.95 + $1.25 per contract.', verify: true },
    fx: { ratePct: 1.5, minCost: 0, type: 'spread', note: 'Bank retail conversion spread, roughly 1.5% or more. USD accounts available to avoid.', verify: true },
    accountFees: 'Quarterly maintenance fee unless balance minimum (about $15k) met.',
  },

  disnat: {
    id: 'disnat',
    name: 'Desjardins Online Brokerage (Disnat)',
    stockCommission: { type: 'flat', amount: 0, note: 'Commission-free stocks and ETFs since 2021. Verify.', verify: true },
    optionsFee: { base: 0, perContract: 1.25, minimum: 8.75, currency: 'CAD', note: '$1.25 per contract, minimum about $8.75 per trade. Verify.', verify: true },
    fx: { ratePct: 1.5, minCost: 0, type: 'spread', note: 'Bank retail conversion spread, roughly 1.5%. Verify.', verify: true },
    accountFees: 'Inactivity fee may apply below activity or balance minimums.',
  },
};

/**
 * Round a money amount to cents. Guards against negative-zero.
 * @param {number} n
 * @returns {number}
 */
function round2(n) {
  const r = Math.round((n + Number.EPSILON) * 100) / 100;
  return r === 0 ? 0 : r;
}

/**
 * Look up a broker by id, throwing a clear error if unknown.
 * @param {string} brokerId
 * @returns {object}
 */
function getBroker(brokerId) {
  const b = BROKERS[brokerId];
  if (!b) {
    const known = Object.keys(BROKERS).join(', ');
    throw new Error(`Unknown broker "${brokerId}". Known brokers: ${known}.`);
  }
  return b;
}

/**
 * Compute the stock/ETF commission for a broker at a given size and value.
 * @param {object} broker
 * @param {number} quantity - number of shares
 * @param {number} notional - quantity * price, in trade currency
 * @returns {number}
 */
function stockCommission(broker, quantity, notional) {
  if (quantity <= 0) return 0;
  const c = broker.stockCommission;
  if (c.type === 'flat') return c.amount;
  if (c.type === 'perShare') {
    let fee = c.amount * quantity;
    if (typeof c.minimum === 'number') fee = Math.max(fee, c.minimum);
    if (typeof c.maxPct === 'number') fee = Math.min(fee, (notional * c.maxPct) / 100);
    return fee;
  }
  return 0;
}

/**
 * Compute the options commission for a broker at a given contract count.
 * fee = base + perContract * contracts, floored at the per-trade minimum.
 * @param {object} broker
 * @param {number} contracts
 * @returns {number}
 */
function optionsCommission(broker, contracts) {
  if (contracts <= 0) return 0;
  const o = broker.optionsFee;
  const fee = o.base + o.perContract * contracts;
  return Math.max(fee, o.minimum || 0);
}

/**
 * Compute the FX conversion cost for a broker on a cross-currency notional.
 * Charged only when the trade currency differs from the account base currency.
 * cost = max(notional * ratePct / 100, minCost)
 * @param {object} broker
 * @param {number} notional - traded value in the trade currency
 * @param {boolean} crossCurrency - true if trade currency != account currency
 * @returns {number}
 */
function fxCost(broker, notional, crossCurrency) {
  if (!crossCurrency || notional <= 0) return 0;
  const f = broker.fx;
  return Math.max((notional * f.ratePct) / 100, f.minCost || 0);
}

/**
 * estimateTradeCost
 * Itemized total cost of a single trade at one broker.
 *
 * @param {object} args
 * @param {string} args.broker          - broker id (key of BROKERS)
 * @param {string} [args.side]          - 'buy' | 'sell' (informational; cost is symmetric)
 * @param {number} [args.quantity]      - shares (for stock trades)
 * @param {number} [args.price]         - price per share, or option premium per share
 * @param {string} [args.currency]      - currency the security trades in, e.g. 'USD'
 * @param {string} [args.accountCurrency] - account base currency, e.g. 'CAD'
 * @param {boolean} [args.isOption]     - true for an options trade
 * @param {number} [args.contracts]     - number of option contracts (100 shares each)
 * @returns {{ broker: string, brokerName: string, side: string, commission: number,
 *             optionsFee: number, fxCost: number, total: number, currency: string,
 *             notional: number, crossCurrency: boolean }}
 */
function estimateTradeCost(args) {
  const {
    broker: brokerId,
    side = 'buy',
    quantity = 0,
    price = 0,
    currency = 'CAD',
    accountCurrency = 'CAD',
    isOption = false,
    contracts = 0,
  } = args || {};

  const broker = getBroker(brokerId);
  const crossCurrency = currency !== accountCurrency;

  // Notional (traded value) in the trade currency. Options premium is quoted
  // per share and each contract controls 100 shares.
  const notional = isOption ? contracts * 100 * price : quantity * price;

  // Zero-size trade: nothing is charged.
  const size = isOption ? contracts : quantity;
  if (size <= 0 || price < 0) {
    return {
      broker: broker.id,
      brokerName: broker.name,
      side,
      commission: 0,
      optionsFee: 0,
      fxCost: 0,
      total: 0,
      currency,
      notional: 0,
      crossCurrency,
    };
  }

  const commission = isOption ? 0 : round2(stockCommission(broker, quantity, notional));
  const optionsFee = isOption ? round2(optionsCommission(broker, contracts)) : 0;
  const fx = round2(fxCost(broker, notional, crossCurrency));
  const total = round2(commission + optionsFee + fx);

  return {
    broker: broker.id,
    brokerName: broker.name,
    side,
    commission,
    optionsFee,
    fxCost: fx,
    total,
    currency,
    notional: round2(notional),
    crossCurrency,
  };
}

/**
 * compareBrokers
 * Run estimateTradeCost across a set of brokers and return them cheapest first.
 *
 * @param {object} trade - same shape as estimateTradeCost args, minus `broker`
 * @param {string[]} [brokerIds] - broker ids to compare; defaults to all
 * @returns {Array} estimate objects sorted by total ascending
 */
function compareBrokers(trade, brokerIds) {
  const ids = Array.isArray(brokerIds) && brokerIds.length ? brokerIds : Object.keys(BROKERS);
  const results = ids.map((id) => estimateTradeCost(Object.assign({}, trade, { broker: id })));
  results.sort((a, b) => a.total - b.total);
  return results;
}

/**
 * norbertsGambitSavings
 * The headline hidden-fee story. Norberts Gambit converts currency at ~spot by
 * buying a dual-listed ETF (for example DLR / DLR.U) on one side and selling it
 * on the other, journaling between the two listings. The only real costs are
 * two commissions (often $0 today), a small ETF spread, and an optional
 * journaling fee at some brokers. This estimates the saving versus paying the
 * broker's percentage FX conversion.
 *
 * @param {object} args
 * @param {number} [args.amountCAD]      - amount being converted (CAD side)
 * @param {number} [args.amountUSD]      - amount being converted (USD side)
 * @param {number} args.brokerFxRatePct  - the FX rate you would otherwise pay, e.g. 1.5
 * @param {number} [args.journalingFee]  - cost of running the gambit (fees + spread), default 0
 * @returns {{ amount: number, currency: string, brokerFxCost: number,
 *             gambitCost: number, savings: number, savingsPct: number }}
 */
function norbertsGambitSavings(args) {
  const { amountCAD, amountUSD, brokerFxRatePct, journalingFee = 0 } = args || {};

  let amount;
  let currency;
  if (typeof amountCAD === 'number') {
    amount = amountCAD;
    currency = 'CAD';
  } else if (typeof amountUSD === 'number') {
    amount = amountUSD;
    currency = 'USD';
  } else {
    throw new Error('norbertsGambitSavings requires amountCAD or amountUSD.');
  }
  if (amount < 0) throw new Error('Conversion amount cannot be negative.');
  if (typeof brokerFxRatePct !== 'number') {
    throw new Error('norbertsGambitSavings requires a numeric brokerFxRatePct.');
  }

  const brokerFxCost = (amount * brokerFxRatePct) / 100;
  const gambitCost = journalingFee;
  const savings = brokerFxCost - gambitCost;
  const savingsPct = amount > 0 ? (savings / amount) * 100 : 0;

  return {
    amount: round2(amount),
    currency,
    brokerFxCost: round2(brokerFxCost),
    gambitCost: round2(gambitCost),
    savings: round2(savings),
    savingsPct: round2(savingsPct),
  };
}

/**
 * annualFxDrag
 * The number that makes the value proposition concrete: a user's yearly cost of
 * broker FX conversion, given how much USD they trade in a year.
 *
 * @param {object} args
 * @param {number} args.usdTradingVolume - total USD converted per year
 * @param {number} args.brokerFxRatePct  - the broker's FX rate, e.g. 1.5
 * @returns {{ usdTradingVolume: number, brokerFxRatePct: number, annualDrag: number }}
 */
function annualFxDrag(args) {
  const { usdTradingVolume, brokerFxRatePct } = args || {};
  if (typeof usdTradingVolume !== 'number' || usdTradingVolume < 0) {
    throw new Error('annualFxDrag requires a non-negative numeric usdTradingVolume.');
  }
  if (typeof brokerFxRatePct !== 'number') {
    throw new Error('annualFxDrag requires a numeric brokerFxRatePct.');
  }
  const annualDrag = (usdTradingVolume * brokerFxRatePct) / 100;
  return {
    usdTradingVolume: round2(usdTradingVolume),
    brokerFxRatePct,
    annualDrag: round2(annualDrag),
  };
}

// Export for both Node.js and browser
const FeeModel = {
  BROKERS,
  getBroker,
  estimateTradeCost,
  compareBrokers,
  norbertsGambitSavings,
  annualFxDrag,
  // exposed for testing / advanced UI use
  stockCommission,
  optionsCommission,
  fxCost,
  round2,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = FeeModel;
} else if (typeof window !== 'undefined') {
  window.FeeModel = FeeModel;
}
