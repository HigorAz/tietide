> Part of the **2026-06-11 adversarial audit (Wave 5)**. Full tracker: `docs/audit/AUDIT-2026-06-11.md`. Findings here survived independent adversarial verification.

**3 findings** in this batch. Fix each via TDD (failing regression test first → minimal fix → atomic commit, one finding = one commit). Branch: `feature/audit-wave5-remediation` (or a fresh branch off it).

> ⚠️ Repo gotchas: the husky pre-commit hook is broken (`Exec format error`) — run `npx lint-staged` then `git commit --no-verify`. Never run tests/migrations against `localhost:5432` (production Postgres). Build `@tietide/shared`+`@tietide/sdk`+`@tietide/crypto` before `tsc --noEmit`. No `Co-Authored-By: Claude` trailer.

---

### W5.27 — LOW / security

**Timing side-channel enumerates registered accounts on forgot-password / resend-verification despite neutral message**

- **Location:** `apps/api/src/auth/auth.service.ts:185-196 (forgotPassword); apps/api/src/auth/account.service.ts:97-108 (resendVerification)`
- **Problem:** forgotPassword and resendVerification return a constant neutral message (good) but do substantial extra work only when the account exists: token randomBytes+sha256, a DB INSERT, and an AWAITED mailer.send (a full SMTP round-trip under the SMTP transport). The non-existent branch returns immediately after one indexed findUnique. Unlike login (dummyHash) and register (always hashes), these two paths do no timing equalization, turning response latency into an account-enumeration oracle that partially defeats the neutral-message defense. Throttled at 5/60s and the large delta only materializes with synchronous SMTP (negligible under the default log transport), so verifiers split LOW/MEDIUM. Fix: move email dispatch to a background queue (BullMQ) so the request returns immediately on every path regardless of account existence, or perform equivalent dummy work / a constant-time floor on the not-found branch.
- **Suggested fix:** Enqueue the email send to a background queue so the request returns immediately on every branch, removing the existence-dependent timing delta.

- [ ] Fixed (commit: \_\_\_\_)

### W5.37 — LOW / security

**Authenticated connection /test (outbound HTTP) relies only on the 100/min default throttle — amplification mismatch**

- **Location:** `apps/api/src/connections/connections.controller.ts:129`
- **Problem:** POST /v1/connections/:id/test performs an outbound provider health-check HTTP request but has no dedicated @Throttle, inheriting the global default of 100/min per authenticated tenant. The codebase tightens other side-effecting endpoints (execute 20/min, AI 3/min), yet this outbound-HTTP route sits at 100/min, so a single tenant can drive ~100 outbound requests/min per connection (more across many). The target URL is provider-fixed (not attacker-controlled, so no arbitrary-target SSRF amplification), the ratio is 1:1, and access is authenticated/org-scoped, making this a defense-in-depth hardening mismatch rather than a meaningful DoS. Fix: apply the execute-tier throttle (e.g. 20/min) or a dedicated small per-tenant limit to the /test route since each call makes a real outbound request.
- **Suggested fix:** Add an execute-tier (~20/min) @Throttle override to POST /v1/connections/:id/test.

- [ ] Fixed (commit: \_\_\_\_)

### W5.50 — IMPROVEMENT / security

**changePassword lacks a dedicated auth-tier rate limit; password policy allows weak 8-char passwords and bcrypt 72-byte truncation**

- **Location:** `apps/api/src/auth/auth.controller.ts:167-180 (no @Throttle); apps/api/src/auth/dto/register.dto.ts, reset-password.dto.ts, change-password.dto.ts`
- **Problem:** Two minor hardening gaps. (1) PATCH /v1/auth/password is the only credential-verifying auth route with no @Throttle, falling back to the global 100/min instead of the auth-tier 5/min — but currentPassword is verified against the JWT's own userId, so an attacker can only guess the current password of an account they already hold a session for (no privilege escalation). (2) The password policy (/^(?=._[A-Za-z])(?=._\d).+$/, MinLength 8) permits 'password1' with no breach/common-password check (HIBP explicitly deferred), and MaxLength 128 over bcrypt silently truncates at 72 bytes so long passphrases lose their tail. Both are consciously-documented baseline tradeoffs not attacker-reachable — verifiers rated IMPROVEMENT. Fix: add the auth-tier @Throttle to changePassword for consistency, add a common-password denylist (HIBP k-anonymity later), and pre-hash or warn for >72-byte passwords.
- **Suggested fix:** Add the auth-tier @Throttle to changePassword; add a common-password denylist (HIBP later); handle bcrypt's 72-byte truncation (pre-hash or warn).

- [ ] Fixed (commit: \_\_\_\_)
