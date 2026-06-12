> Part of the **2026-06-11 adversarial audit (Wave 5)**. Full tracker: `docs/audit/AUDIT-2026-06-11.md`. Findings here survived independent adversarial verification.

**3 findings** in this batch. Fix each via TDD (failing regression test first → minimal fix → atomic commit, one finding = one commit). Branch: `feature/audit-wave5-remediation` (or a fresh branch off it).

> ⚠️ Repo gotchas: the husky pre-commit hook is broken (`Exec format error`) — run `npx lint-staged` then `git commit --no-verify`. Never run tests/migrations against `localhost:5432` (production Postgres). Build `@tietide/shared`+`@tietide/sdk`+`@tietide/crypto` before `tsc --noEmit`. No `Co-Authored-By: Claude` trailer.

---

### W5.40 — LOW / security

**CSP connect-src allows WebSocket to any host (weakens token-exfil defense)**

- **Location:** `apps/spa/nginx.conf:12`
- **Problem:** The production CSP sets `connect-src 'self' ws: wss:`. The bare ws:/wss: scheme sources match ANY host, so even though script-src is 'self', an attacker who achieves script execution (or a compromised dependency) can open a WebSocket to an attacker-controlled server and stream out the localStorage JWT or page data — the CSP would not block it, undermining the policy's own stated exfiltration-resistance goal. The legitimate Socket.IO stream is same-origin (execution-socket.ts connects to the VITE_API_URL origin), so the wildcard is unnecessary. Conditional on a separate XSS, hence LOW. Fix: scope the WebSocket sources to the actual API/Socket.IO origin instead of bare schemes, e.g. `connect-src 'self' wss://tietide.com` (the VITE_API_URL/tunnel host), removing unbounded ws:/wss:.
- **Suggested fix:** Pin connect-src WebSocket sources to the API origin (wss://<api-host>) instead of bare ws:/wss: schemes.

- [ ] Fixed (commit: \_\_\_\_)

### W5.43 — IMPROVEMENT / security

**JWT access token stored in localStorage (total blast radius on any future XSS)**

- **Location:** `apps/spa/src/api/client.ts:15; apps/spa/src/stores/authStore.ts:79,102-103,119-121,136-137,159; token TTL: apps/api/src/auth/auth.module.ts:25 (JWT_EXPIRES_IN default '7d')`
- **Problem:** The bearer access token is persisted in localStorage (key 'tietide-token') and read on every request. localStorage is JS-readable, so a single XSS foothold (a future dangerouslySetInnerHTML regression, a malicious dependency, or a render bug) yields the full, replayable 7-day session token (no refresh-token rotation; only a tokenVersion bump revokes it). The codebase is currently disciplined about avoiding innerHTML and there is no present injection sink, so this is the industry-standard SPA tradeoff and a conditional/defense-in-depth weakness — verifiers rated it IMPROVEMENT/LOW: it requires a separate, currently-absent XSS to weaponize. Fix: move the session token to an httpOnly+Secure+SameSite cookie issued by the API (CSRF then handled with SameSite + double-submit/origin checks on state-changing routes); if cookies aren't feasible for the MVP, shorten the token TTL aggressively and add silent refresh, and document the residual risk in client.ts.
- **Suggested fix:** Migrate the session token to an httpOnly+Secure+SameSite cookie (with CSRF handling), or at minimum shorten TTL and add silent refresh; document the residual risk.

- [ ] Fixed (commit: \_\_\_\_)

### W5.44 — IMPROVEMENT / security

**OAuth bridge reflects unvalidated `message` URL param into the parent window and toast**

- **Location:** `apps/spa/src/pages/connectionsPageUrl.ts:13-22; apps/spa/src/pages/ConnectionsPage.tsx:88-95,122`
- **Problem:** readBridgeFromUrl copies the `message` query param verbatim into the same-origin postMessage payload and into the inline error toast on the close-denied fallback. The value is attacker-influenceable (/connections?status=error&message=...), so an attacker can surface arbitrary text inside trusted app chrome. This is NOT XSS — the toast renders message as React children (auto-escaped) and postMessage targets window.location.origin — and the reflected text is unlinkable plain text (toast action links come only from a separate field), so it is no stronger a phishing primitive than the attacker's own page. Verifiers rated it IMPROVEMENT (inert reflected text, no actionable exploit). Fix: do not render the raw `message` param — map the provider outcome to a fixed set of known messages keyed by status/error-code, or whitelist before display, and only trust messages arriving via the origin-checked postMessage from the actual OAuth flow rather than from the URL on direct arrival.
- **Suggested fix:** Replace the reflected `message` with a fixed, status-keyed message set client-side rather than rendering the raw URL param.

- [ ] Fixed (commit: \_\_\_\_)
