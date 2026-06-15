# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in TieTide, **please do not open a public
issue or pull request**. Public disclosure before a fix is available puts every
deployment at risk.

Instead, report it privately through one of these channels:

1. **GitHub Private Vulnerability Reporting** (preferred) — use the
   **"Report a vulnerability"** button on the
   [Security tab](../../security/advisories/new). This keeps the report private
   and lets us collaborate on a fix and coordinated disclosure.
2. **Email** — `higor.azevedo2010@gmail.com` with the subject line
   `[SECURITY] TieTide`.

Please include:

- A description of the vulnerability and its impact.
- Step-by-step instructions to reproduce it (proof of concept if possible).
- The affected component, endpoint, or file.
- Any suggested remediation, if you have one.

## What to Expect

- **Acknowledgement** within 5 business days.
- An assessment and, if confirmed, a remediation plan with an estimated timeline.
- Credit in the release notes once the fix ships, if you'd like to be named.

## Scope

This policy covers the code in this repository. The hosted instance at
`tietide.com` is covered as well, but please **do not** run automated scanners,
denial-of-service tests, or any test that degrades the service or affects other
users. Use a local self-hosted instance for intrusive testing.

## Supported Versions

This is an actively developed MVP. Security fixes are applied to the `main`
branch; there are no long-term-support branches yet.
