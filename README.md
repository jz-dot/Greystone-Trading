# GSP Trading

An open-source, Canada-first portfolio and trading companion whose job is to make your existing brokerage accounts the lowest total cost in Canada. GSP Trading is not a broker and is not a registered investment dealer. It connects to the accounts you already have and helps you see, and lower, what trading actually costs you.

## Status: Preview

GSP Trading is pre-release software. Parts of the app currently show simulated or sample data, and those surfaces are labeled as such in the interface. Live market data is retrieved through a server-side data proxy. Treat everything here as a work in progress: interfaces, data, and modules are still changing.

## Why it exists

Commissions have effectively collapsed to about zero across Canadian brokerages. The costs that still matter are the ones that stay hidden on the statement:

- FX conversion, roughly 1.5% each way when you buy or sell USD-denominated securities in a CAD account.
- Options contract fees.
- Margin interest.

GSP Trading quantifies your true all-in cost and then guides you to the cheapest path for a given action. Examples include Norbert's Gambit to convert currency at near-institutional cost, and routing an order to whichever of your accounts carries the lowest total cost for that trade.

There is a real gap to fill. As far as we can find, no open-source tool is Canada-aware in the way Canadian investors need: registered accounts (TFSA, RRSP, FHSA), dual-currency holdings, and adjusted-cost-base tracking all in one place. The commercial options keep narrowing, too. Questrade ended Passiv's free tier on January 30, 2026. GSP Trading exists so that a Canadian investor has an open, honest alternative.

## Features

Described honestly, separating what is real today from what is still preview or on the roadmap.

- Live charts and technical indicators. Charts and quotes are served through the data proxy.
- Options chain and strategy builder with Black-Scholes Greeks. The options math lives in `services/black-scholes.js` and is unit-tested (see Testing below).
- Portfolio tracking. The portfolio views exist today; multi-currency (CAD and USD) support and adjusted-cost-base accuracy are on the roadmap and are not fully in place yet.
- A Claude-powered research copilot, "Grey Sankore," reached through the AI chat and analyze surfaces. The Anthropic API is proxied server-side so your key is not exposed to the browser.
- A Canadian broker fee model and an adjusted-cost-base engine. These are new modules being added under `services/`, shipped with unit tests. They are early and under active development.

Which surfaces are simulated: several panels in the current preview render mock, sample, or placeholder data, and each of those is labeled in-app (for example a "Simulated" or "Preview" marker). Do not read simulated panels as your real account state.

## Tech stack

- Frontend: a vanilla JavaScript single-page app (`index.html`, `app.js`, `styles.css`). No framework, no build step.
- Backend: Node and Express (`server.js`), acting as a proxy for market data, the BigData.com data feed, and the Anthropic API, plus response caching.
- Data and auth: Supabase (`supabase/schema.sql`) for authentication and per-user data with row-level security.
- Copilot: the Anthropic API, proxied through the backend.

There is currently no build step. You run the server and open the page.

## Getting started

Prerequisites:

- Node 24 or newer.

Steps:

1. Install dependencies.
   ```
   npm install
   ```
2. Create your environment file from the template and fill in your values.
   ```
   cp .env.example .env
   ```
3. Start the server.
   ```
   npm start
   ```
4. Open the app.
   ```
   http://localhost:3000
   ```

### Bring your own keys

GSP Trading ships with no keys of any kind. It is bring-your-own-key by design. Each user supplies:

- Their own Anthropic API key for the Grey Sankore copilot.
- Their own Supabase project (URL, anon key, and service role key) for auth and data.
- Their own broker API credentials (for example Alpaca, Questrade, or Interactive Brokers) for the accounts they choose to connect.

Every value lives in your local `.env`, which is not committed. See `.env.example` for the full list of variables. No credentials travel with this project, and none are shared between users.

## Testing

Tests use the Node built-in test runner.

```
npm test
```

There are unit tests for the options math (`test/black-scholes.test.js`), covering the normal CDF, put-call parity, the Greeks, and an implied-volatility round trip. Unit tests for the fee model and the adjusted-cost-base engine are being added alongside those modules. Any new financial math is expected to arrive with tests.

## Disclaimer

GSP Trading is open-source software provided for research and educational purposes only. It is not investment advice. GSP Trading Inc. is not a registered investment dealer or adviser. Nothing in this software is a recommendation to buy or sell any security. You are solely responsible for your own decisions, and trading involves risk of loss.

## Roadmap

- P0: Safety and truth. In progress. Label simulated data honestly, correct the financial math, and harden the basics.
- P1: Make the portfolio tracker real. Live quotes, CAD and USD handling, adjusted cost base, and broker import.
- P2: Fee engine, order ticket, charting upgrade, and a proper design system.
- P3: Open-source launch.
- P4: The AI copilot rebuilt on current models with tool use.

The longer arc: GSP Trading is intended to grow, over years, toward becoming a Canadian financial institution. The near-term work above is the foundation for that.

## License

GSP Trading is licensed under the GNU Affero General Public License v3.0. See [LICENSE](LICENSE) for the full text.

## Security

To report a vulnerability, see [SECURITY.md](SECURITY.md). Please do not open a public issue for security problems.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, conventions, and how to run the tests before you submit.
