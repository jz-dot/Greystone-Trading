'use strict';

/* ============================================
   AGENT VALIDATION GATE - TESTS
   Proves the safety gate on TradingAgent: no run without a passing backtest,
   no LIVE run without paper validation. Fail-closed on malformed results.

   Hand-computed expectations against the CONSERVATIVE pass gate:
     PASS requires ALL of: numTrades >= 1, totalReturn > 0,
     annualizedSharpe > 0, maxDrawdown <= 0.25.

     { numTrades:5, totalReturn:0.2, annualizedSharpe:1.1, maxDrawdown:0.1 }
        -> 5>=1 ok, 0.2>0 ok, 1.1>0 ok, 0.1<=0.25 ok  => passed:true, reasons:[]
     negative return (totalReturn:-0.1)   => reasons include 'totalReturn must be > 0'
     maxDrawdown:0.4 (> 0.25)             => reasons include 'maxDrawdown must be <= 0.25 (25%)'
     numTrades:0                          => reasons include 'numTrades must be >= 1'
     annualizedSharpe:0 or -0.5 (<= 0)    => reasons include 'annualizedSharpe must be > 0'
     null / {} (malformed)                => passed:false, backtested stays false
   ============================================ */

const test = require('node:test');
const assert = require('node:assert');

const { TradingAgent, AgentState } = require('../services/trading-agents.js');

// A backtest result that clears every gate criterion.
const PASSING = { numTrades: 5, totalReturn: 0.2, annualizedSharpe: 1.1, maxDrawdown: 0.1 };

function makeAgent(extra) {
  // Constructor takes a config object; symbols keeps _initSimPrices happy.
  return new TradingAgent(Object.assign({ name: 'Gate Test', symbols: ['SPY'] }, extra || {}));
}

test('fresh agent (no backtest) cannot start', async () => {
  const agent = makeAgent();

  // Default construction under Node = simulation mode (no AlpacaClient global).
  assert.strictEqual(agent.simulationMode, true);
  assert.strictEqual(agent.validation.backtested, false);

  const gate = agent.canStart();
  assert.strictEqual(gate.ok, false);
  assert.strictEqual(gate.reason, 'Backtest required before this agent can run');

  const res = await agent.start();
  assert.ok(res && res.ok === false, 'start() should return {ok:false}');
  assert.strictEqual(res.reason, 'Backtest required before this agent can run');
  assert.notStrictEqual(agent.state, AgentState.RUNNING, 'must not enter run loop');
  assert.strictEqual(agent.state, AgentState.ERROR);
  assert.strictEqual(agent.lastStartRefusal, 'Backtest required before this agent can run');
});

test('passing backtest clears the gate and start() is allowed (sim mode)', async () => {
  const agent = makeAgent();

  const out = agent.setBacktestResult(PASSING);
  assert.strictEqual(out.passed, true);
  assert.deepStrictEqual(out.reasons, []);
  assert.strictEqual(agent.validation.backtested, true);
  assert.strictEqual(agent.validation.backtestResult, PASSING);

  assert.deepStrictEqual(agent.canStart(), { ok: true });

  await agent.start();
  assert.strictEqual(agent.state, AgentState.RUNNING, 'sim agent with a pass should run');

  agent.stop(); // clear the scheduled tick timer so the test process exits
  assert.strictEqual(agent.state, AgentState.STOPPED);
});

test('failing backtests do not clear the gate and start() still refuses', async () => {
  const cases = [
    { name: 'negative return', result: { numTrades: 5, totalReturn: -0.1, annualizedSharpe: 1.1, maxDrawdown: 0.1 }, reason: 'totalReturn must be > 0' },
    { name: 'drawdown too deep', result: { numTrades: 5, totalReturn: 0.2, annualizedSharpe: 1.1, maxDrawdown: 0.4 }, reason: 'maxDrawdown must be <= 0.25 (25%)' },
    { name: 'zero trades', result: { numTrades: 0, totalReturn: 0.2, annualizedSharpe: 1.1, maxDrawdown: 0.1 }, reason: 'numTrades must be >= 1' },
    { name: 'zero sharpe', result: { numTrades: 5, totalReturn: 0.2, annualizedSharpe: 0, maxDrawdown: 0.1 }, reason: 'annualizedSharpe must be > 0' },
    { name: 'negative sharpe', result: { numTrades: 5, totalReturn: 0.2, annualizedSharpe: -0.5, maxDrawdown: 0.1 }, reason: 'annualizedSharpe must be > 0' },
  ];

  for (const c of cases) {
    const agent = makeAgent();
    const out = agent.setBacktestResult(c.result);
    assert.strictEqual(out.passed, false, `${c.name}: should fail`);
    assert.ok(out.reasons.includes(c.reason), `${c.name}: reasons should include "${c.reason}" (got ${JSON.stringify(out.reasons)})`);
    assert.strictEqual(agent.validation.backtested, false, `${c.name}: backtested stays false`);

    const gate = agent.canStart();
    assert.strictEqual(gate.ok, false, `${c.name}: canStart not ok`);

    const res = await agent.start();
    assert.ok(res && res.ok === false, `${c.name}: start refuses`);
    assert.notStrictEqual(agent.state, AgentState.RUNNING, `${c.name}: must not run`);
  }
});

test('malformed backtest results fail closed', async () => {
  for (const bad of [null, undefined, {}, { totalReturn: 0.2 }, 'nope', 42]) {
    const agent = makeAgent();
    const out = agent.setBacktestResult(bad);
    assert.strictEqual(out.passed, false, `malformed (${JSON.stringify(bad)}): passed:false`);
    assert.ok(Array.isArray(out.reasons) && out.reasons.length > 0, 'reasons present');
    assert.strictEqual(agent.validation.backtested, false, 'stays blocked');
    assert.strictEqual(agent.canStart().ok, false);

    const res = await agent.start();
    assert.ok(res && res.ok === false, 'start refuses on malformed');
    assert.notStrictEqual(agent.state, AgentState.RUNNING);
  }
});

test('live mode requires paper validation on top of a passing backtest (canStart)', () => {
  const agent = makeAgent();
  // simulationMode is the live/sim flag the class exposes; force LIVE.
  agent.simulationMode = false;

  agent.setBacktestResult(PASSING);
  assert.strictEqual(agent.validation.backtested, true);

  // Backtested but not paper validated -> live refuses.
  const before = agent.canStart();
  assert.strictEqual(before.ok, false);
  assert.strictEqual(before.reason, 'Paper validation required before live');

  const ret = agent.markPaperValidated();
  assert.strictEqual(ret, true);
  assert.strictEqual(agent.validation.paperValidated, true);

  // Now cleared for live.
  assert.deepStrictEqual(agent.canStart(), { ok: true });
});

test('live-mode start() refuses without paper validation, then allows after markPaperValidated()', async () => {
  // Simulate a configured Alpaca so start()'s mode recompute keeps LIVE mode.
  const priorAlpaca = global.AlpacaClient;
  global.AlpacaClient = {
    isConfigured: () => true,
    getAccount: async () => ({ equity: '100000' }),
    getSnapshot: async () => ({ error: true }),
  };

  let agent;
  try {
    agent = makeAgent();
    assert.strictEqual(agent.simulationMode, false, 'configured Alpaca -> live mode');

    agent.setBacktestResult(PASSING);
    assert.strictEqual(agent.validation.backtested, true);

    // Live, backtested, but not paper validated -> start refuses.
    const refused = await agent.start();
    assert.ok(refused && refused.ok === false);
    assert.strictEqual(refused.reason, 'Paper validation required before live');
    assert.notStrictEqual(agent.state, AgentState.RUNNING);

    // Paper validate, then start is allowed and the agent runs live.
    agent.markPaperValidated();
    await agent.start();
    assert.strictEqual(agent.state, AgentState.RUNNING, 'live start allowed after paper validation');
  } finally {
    if (agent) agent.stop(); // clear tick timer
    if (priorAlpaca === undefined) delete global.AlpacaClient;
    else global.AlpacaClient = priorAlpaca;
  }
});
