# Security Policy

GSP Trading handles brokerage credentials and personal financial data, so we take security reports seriously. Thank you for helping keep users safe.

## Reporting a vulnerability

Please report vulnerabilities privately. Do not open a public issue, pull request, or discussion for a security problem, because that discloses the issue before a fix is available.

Report privately through GitHub's private vulnerability reporting for this repository: open the **Security** tab and choose **Report a vulnerability** (Security advisories). This routes the report directly and privately to the maintainers, with no email address to intercept.

When you report, please include as much of the following as you can:

- A description of the issue and its impact.
- Steps to reproduce, or a proof of concept.
- The affected file, route, or component if you know it.
- Any suggested remediation.

We will acknowledge your report, work with you to understand and confirm the issue, and keep you informed as we address it. Please give us reasonable time to release a fix before any public disclosure.

## Scope

In scope:

- The backend server and its API routes (`server.js`).
- The service modules under `services/`, including the broker clients, the data proxies, and the Anthropic proxy.
- The Supabase schema and its row-level security policies (`supabase/schema.sql`).
- The frontend (`index.html`, `app.js`) where it handles authentication, tokens, or credentials.
- Handling of secrets and environment configuration.

Out of scope:

- Vulnerabilities in third-party services themselves (Supabase, Anthropic, and the various broker APIs). Report those to the respective vendor.
- Issues that require a user to run untrusted code locally or to hand over their own credentials.

## Preview software warning

GSP Trading is preview, pre-release software. Do not expose an instance to the public internet with live broker credentials until the authentication hardening lands. Run it locally, use paper-trading or read-only broker credentials while evaluating it, and keep your `.env` private. It is bring-your-own-key: no credentials ship with the project.

## Known limitations

Authentication and credential handling are still being hardened as part of the ongoing P0 safety work. Until that work is complete, treat this software as not production-ready and do not rely on it to protect live account access.
