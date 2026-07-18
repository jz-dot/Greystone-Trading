# Contributing to GSP Trading

Thanks for your interest in improving GSP Trading. This guide covers local setup, the conventions we hold to, and what we expect before you open a pull request.

## Local setup

Prerequisites: Node 24 or newer.

1. Install dependencies.
   ```
   npm install
   ```
2. Copy the environment template and fill in your own values.
   ```
   cp .env.example .env
   ```
   GSP Trading is bring-your-own-key. You supply your own Anthropic key, your own Supabase project, and your own broker credentials. No keys ship with the project, and none should ever be committed.
3. Run the server and open the app.
   ```
   npm start
   ```
   Then open http://localhost:3000.

## Coding conventions

- No em dashes and no en dashes, anywhere in code, comments, commit messages, or documentation. Use hyphens, commas, periods, or semicolons, or rewrite the sentence. This is a hard rule with no exceptions.
- Vanilla JavaScript, no build step. The frontend is plain JavaScript, HTML, and CSS (`index.html`, `app.js`, `styles.css`). Do not add a bundler, a framework, or a transpile step. Code should run as written in the browser and in Node.
- Keep the backend a thin proxy. `server.js` proxies market data, the data feed, and the Anthropic API, and it handles auth and caching. Keep new server logic in that spirit.
- Be honest about data. If a surface renders simulated, sample, or placeholder data, label it in the interface. Never present simulated data as if it were a real account state.
- Financial math goes in `services/`. Keep pricing, fee, and cost-base logic in small, testable modules there.

## Tests

We use the Node built-in test runner. Run the full suite before submitting.

```
npm test
```

Any new financial math must ship with unit tests. Options pricing, the fee model, and the adjusted-cost-base engine are correctness-critical; a change to those areas is not complete without tests that pin down the expected numbers. See `test/black-scholes.test.js` for the style we expect: reference values, known identities (for example put-call parity), and regression guards for bugs that have been fixed.

## Branches and pull requests

- Branch off the current working branch for your change. Use a short, descriptive branch name.
- Keep pull requests focused. One change per pull request is easier to review than a large mixed one.
- In the pull request description, explain what changed and why, and note anything a reviewer should verify.
- Make sure `npm test` passes before you open the pull request.
- If your change touches financial math, say so explicitly and point to the tests that cover it.

## Reporting security issues

Do not open a public issue or pull request for a security problem. Follow the private process in [SECURITY.md](SECURITY.md).
