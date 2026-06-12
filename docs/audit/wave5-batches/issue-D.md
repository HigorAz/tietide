> Part of the **2026-06-11 adversarial audit (Wave 5)**. Full tracker: `docs/audit/AUDIT-2026-06-11.md`. Findings here survived independent adversarial verification.

**3 findings** in this batch. Fix each via TDD (failing regression test first → minimal fix → atomic commit, one finding = one commit). Branch: `feature/audit-wave5-remediation` (or a fresh branch off it).

> ⚠️ Repo gotchas: the husky pre-commit hook is broken (`Exec format error`) — run `npx lint-staged` then `git commit --no-verify`. Never run tests/migrations against `localhost:5432` (production Postgres). Build `@tietide/shared`+`@tietide/sdk`+`@tietide/crypto` before `tsc --noEmit`. No `Co-Authored-By: Claude` trailer.

---

### W5.6 — MEDIUM / security

**SSRF guard vulnerable to DNS rebinding — validated IP never pinned to the socket (audit W1.5 claims DNS-pin delivered)**

- **Location:** `apps/worker/src/nodes/actions/ssrf-guard.ts:97-144 and apps/worker/src/nodes/actions/http-request.ts:76-89`
- **Problem:** Merged from SSRF-3 and WE-2. assertUrlAllowed resolves the hostname and validates the addresses but returns only the parsed URL — the validated IP is never pinned. fetch() then re-resolves the hostname independently at connect time, so an attacker hosting a TTL-0 domain that returns a public IP to the guard's lookup and 169.254.169.254 / 127.0.0.1 / RFC1918 at connect time defeats the check (validate-time vs connect-time TOCTOU). The guard's own comment (lines 15-18) admits this is unfixed and 'tracked as a follow-up', yet the audit tracker (SECURITY-QA-AUDIT.md:49) lists 'DNS-pin' as a delivered W1.5 remediation — that claim is false. Exploitation requires attacker-controlled authoritative DNS and is racy, but the worker provably reaches internal infra/cloud metadata. Fix: resolve once in the guard, return the validated address, and force the connection to that IP via a custom undici Agent/dispatcher with a `lookup` that returns only the pre-validated address (also closes the redirect re-resolution in W5.2). Correct the audit tracker.
- **Suggested fix:** Resolve and validate once, then pin the validated IP into the socket via a custom undici dispatcher/lookup (Host/SNI kept as the original hostname). Re-open W1.5 in the tracker since DNS-pin was never implemented.

- [ ] Fixed (commit: \_\_\_\_)

### W5.38 — LOW / qa

**No automated test coverage for the two highest-value SSRF bypass classes (redirects, IPv4-mapped IPv6)**

- **Location:** `apps/worker/src/nodes/actions/ssrf-guard.spec.ts:1-77; apps/worker/src/nodes/actions/http-request.spec.ts (no redirect test)`
- **Problem:** The SSRF suite covers literal private IPs, localhost-by-name, and resolve-to-private, but has no case for redirect-following (W5.2) nor for IPv4-mapped IPv6 literals in hex form (W5.3) — the exact two vectors that are actually exploitable. The only mapped-IPv6 test uses the dotted form the buggy regex DOES catch, giving false confidence. This violates the CLAUDE.md §9 mandate (every node: happy/error/edge; security-critical paths tested) and is why both live bypasses went undetected by the prior 2026-05-28 audit. Fix: add (1) a fetch-mock test that a 302→private/metadata IP throws SsrfBlockedError before reaching the internal host, and (2) assertions that isBlockedAddress('::ffff:7f00:1')===true and assertUrlAllowed('http://[::ffff:127.0.0.1]/') rejects — wired as regression guards alongside the W5.2/W5.3 fixes.
- **Suggested fix:** Add regression specs for redirect-to-private-IP rejection and hex IPv4-mapped IPv6 blocking, alongside the W5.2/W5.3 fixes.

- [ ] Fixed (commit: \_\_\_\_)

### W5.47 — IMPROVEMENT / efficiency

**http-request per-call timeout is not capped at the parsing layer**

- **Location:** `apps/worker/src/nodes/actions/http-request.ts:144-147`
- **Problem:** parseParams accepts any positive finite raw.timeout with no upper bound (DEFAULT_TIMEOUT_MS only applies when missing/invalid). httpRequestConfigSchema caps timeout at 30000, but it is never applied on the execution path — node config flows through workflow.schema as z.record(z.unknown()) and reaches parseParams unvalidated — so a definition saved via PATCH /v1/workflows/:id with timeout:3600000 (bypassing the SPA) is honored. The sibling code.ts action correctly clamps with Math.min; http-request omits it. Combined with concurrency=5, a long timeout holds a shared worker slot for the full duration (throughput degradation), but it is author-self-inflicted, SSRF-guard-gated, and quota-bounded — no data exposure. Verifiers rated LOW/IMPROVEMENT. Fix: clamp in parseParams: timeoutMs = Math.min(rawTimeout>0 ? rawTimeout : DEFAULT_TIMEOUT_MS, 30_000), mirroring the schema max (or validate config against httpRequestConfigSchema at the save boundary).
- **Suggested fix:** Clamp timeoutMs to <=30000 in parseParams (Math.min), or validate node config against httpRequestConfigSchema at the save boundary.

- [ ] Fixed (commit: \_\_\_\_)
