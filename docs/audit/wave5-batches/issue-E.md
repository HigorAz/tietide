> Part of the **2026-06-11 adversarial audit (Wave 5)**. Full tracker: `docs/audit/AUDIT-2026-06-11.md`. Findings here survived independent adversarial verification.

**11 findings** in this batch. Fix each via TDD (failing regression test first → minimal fix → atomic commit, one finding = one commit). Branch: `feature/audit-wave5-remediation` (or a fresh branch off it).

> ⚠️ Repo gotchas: the husky pre-commit hook is broken (`Exec format error`) — run `npx lint-staged` then `git commit --no-verify`. Never run tests/migrations against `localhost:5432` (production Postgres). Build `@tietide/shared`+`@tietide/sdk`+`@tietide/crypto` before `tsc --noEmit`. No `Co-Authored-By: Claude` trailer.

---

### W5.7 — MEDIUM / security

**Ollama/S3 connectors perform requests to a fully user-controlled baseUrl/endpoint with no SSRF guard**

- **Location:** `apps/worker/src/nodes/connectors/ollama/ollama-client.factory.ts:53-103 (config: connections.schema.ts:156-162); apps/worker/src/nodes/connectors/s3/s3-client.factory.ts:61-72; API path: apps/api/src/connections/health/checkers/ollama.checker.ts`
- **Problem:** ollamaConfigSchema only validates baseUrl is an http(s) URL — no private/loopback/metadata restriction. The factory POSTs to `${baseUrl}/api/generate` and `/api/embeddings` with no SSRF guard, unlike the http-request node which at least calls assertUrlAllowed. An authenticated user can set baseUrl to http://169.254.169.254, http://10.0.0.x, or http://chromadb:8000 and use the worker as an SSRF proxy into the internal network / cloud metadata, with error/timing differences forming a reachability oracle. The S3 connector has the same issue via a user-controlled `endpoint`. Additionally the API health checker fetches `${base}/api/tags` with only a scheme check, making POST /v1/connections/:id/test a second, lower-friction SSRF vector. Self-hosted Ollama/MinIO is legitimate, so an allowlist/guard (not an outright block) is needed. Fix: run assertUrlAllowed() (scheme + resolved-IP private-range rejection, redirect-safe) before every Ollama/S3 request and on the health probe, or gate self-hosted endpoints behind an admin-configured host allowlist.
- **Suggested fix:** Apply the SSRF guard (or an admin-configured host allowlist) before every Ollama/S3 request and the connection /test health probe.

- [ ] Fixed (commit: \_\_\_\_)

### W5.11 — MEDIUM / security

**BaseConnectorAction never enforces requiredConnectionType — wrong-credential confused-deputy**

- **Location:** `packages/sdk/src/base/connector-action.ts:39-58`
- **Problem:** Every connector declares requiredConnectionType, but execute() resolves input.connectionId via context.getConnection() and hands it to run() without verifying connection.type/provider matches requiredConnectionType (the resolver only checks organizationId). A workflow author can point any connector node at any connection in the workspace; the decrypted config of an unrelated provider is then cast to the node's expected config type. Scope is same-tenant (the author already owns every connection), so there is no cross-tenant exposure or privilege escalation, and the decrypt path validates config against the connection's OWN provider schema so wrong-provider configs usually fail closed rather than leak — but it removes a Section-10-mandated explicit per-node connection-type guard and is currently untested. Verifiers split MEDIUM/IMPROVEMENT; recorded as a defense-in-depth gap worth a cheap explicit check. Fix: in BaseConnectorAction.execute, after getConnection, assert connection.type === this.requiredConnectionType (or provider mapping) and throw ConnectorMisconfiguredError otherwise; add a unit test for the mismatch.
- **Suggested fix:** Add `assert connection.type === this.requiredConnectionType` in execute() after getConnection, throwing on mismatch, plus a regression test.

- [ ] Fixed (commit: \_\_\_\_)

### W5.12 — MEDIUM / security

**Inline getConnection/refreshConnection ignore connection status and lockout counter — self-inflicted bad-token loop against OAuth provider**

- **Location:** `apps/worker/src/connections/prisma-connection-resolver.ts:35-63 and 84-141`
- **Problem:** getConnection() filters only by id+organizationId and never checks status; refreshConnection() refreshes regardless of refreshFailureCount. The background processor enforces a MAX_REFRESH_FAILURES lockout (sets status=EXPIRED), and the background refresh scanner only scans status=ACTIVE — but the inline execution path honors neither. A connection the system has already locked out (EXPIRED, revoked refresh token) is still loaded and used on every workflow run, and on each auth error the inline path re-hits the provider token endpoint with the known-bad token. For a cron/poll-scheduled workflow this repeats every tick indefinitely with no backoff — a self-inflicted bad-token loop that wastes provider quota and can get the platform's shared OAuth client throttled/flagged. No auth/data boundary is crossed (org-scoped, tokens not leaked), so verifiers downgraded toward LOW; recorded as MEDIUM/LOW operational-abuse. Fix: in getConnection reject/skip inline refresh for EXPIRED connections; in refreshConnection short-circuit when refreshFailureCount >= MAX_REFRESH_FAILURES with a ConnectionAuthError; add an exponential-backoff / lastRefreshAttemptAt gate.
- **Suggested fix:** Honor connection status and refreshFailureCount on the inline path: skip EXPIRED connections, short-circuit refresh at the failure cap, and add a backoff gate.

- [ ] Fixed (commit: \_\_\_\_)

### W5.13 — MEDIUM / correctness

**Successful refresh followed by a non-auth provider error marks a healthy connection EXPIRED**

- **Location:** `packages/sdk/src/base/connector-action.ts:84-118`
- **Problem:** On the first auth error the action refreshes the token and retries run(). If that retry throws a NON-auth error (provider 500, downstream timeout, node bug), the catch calls context.markConnectionForRefresh(connectionId), which unconditionally sets status=EXPIRED and increments refreshFailureCount. So a transient provider 5xx right after a perfectly good token refresh disables a connection whose credentials are valid and contributes toward the lockout counter, causing spurious 'reconnect your account' churn. The disable is sticky (the background scanner only scans ACTIVE, so it is never auto-recovered) and contradicts the codebase's own grading convention elsewhere (a single failure → ERROR, EXPIRED reserved for the failure cap). Recoverable by reconnect (no data loss, not attacker-driven), so verifiers split MEDIUM/LOW. Fix: only mark-for-refresh on auth errors — in the non-auth retry-failure branch, rethrow the error WITHOUT calling markConnectionForRefresh.
- **Suggested fix:** In the post-refresh retry catch, rethrow non-auth errors without calling markConnectionForRefresh; only auth errors are evidence the credential is bad.

- [ ] Fixed (commit: \_\_\_\_)

### W5.14 — MEDIUM / efficiency

**SQL rowLimit applied in-process AFTER the full result set is materialized → worker OOM**

- **Location:** `apps/worker/src/nodes/connectors/postgres/postgres-client.factory.ts:64-69; apps/worker/src/nodes/connectors/mysql/mysql-client.factory.ts:61-67`
- **Problem:** The query text is sent to the DB with NO server-side LIMIT; pool.query/pool.execute fetches the ENTIRE result set into memory and only then applies rows.slice(0, rowLimit). The schema comment claims rowLimit 'limits memory exhaustion vectors' but the cap runs after materialization. A query like SELECT _ FROM big_table (which passes the schema's comment/semicolon/interpolation checks) pulls millions of rows into the shared worker heap, OOM-killing the worker process (concurrency=5) and aborting all tenants' in-flight executions. rowCount is also reported pre-slice, misleading downstream nodes. Self-inflicted by the authenticated workflow author against their own DB (no cross-tenant read), so it is an availability/efficiency issue. Fix: enforce the cap at the DB layer — wrap as `SELECT _ FROM (<query>) \_t LIMIT $n` or use a streaming cursor (pg-cursor / mysql2 stream) that stops after rowLimit rows; do not slice after the fact; correct the schema comment.
- **Suggested fix:** Push the row cap into the DB via a wrapping LIMIT or a streaming cursor that halts at rowLimit; report rowCount post-cap; fix the misleading schema comment.

- [ ] Fixed (commit: \_\_\_\_)

### W5.28 — LOW / security

**OAuth callback persists connection into the org from signed state without re-checking current membership**

- **Location:** `apps/api/src/connections/oauth/oauth.service.ts:147-170`
- **Problem:** handleCallback validates the stored OAuthState against userId and provider but not against organizationId, then creates the Connection in decoded.organizationId taken from the signed state JWT. The org id was bound at start() time after OrgContextGuard verified membership and the JWT is tamper-proof (not forgeable to an arbitrary org), but there is no revalidation that the user is STILL a member at callback time. If a user starts an OAuth flow and is removed from the workspace within the 10-minute state TTL, the callback still writes an OAuth2 connection (with live refresh token) into a workspace they no longer belong to. Narrow window, self-targeted (an org they belonged to moments earlier), defense-in-depth gap. Fix: in handleCallback, after consuming the state, re-verify membership (requireMembership(decoded.organizationId, decoded.userId) / OrganizationMember.findFirst) before ConnectionsService.create; reject with the generic invalid-state error if no longer a member.
- **Suggested fix:** Re-verify org membership in handleCallback before creating the connection; reject with the generic invalid-state error if the user is no longer a member.

- [ ] Fixed (commit: \_\_\_\_)

### W5.29 — LOW / security

**OAuth PKCE code_verifier stored in plaintext in the OAuthState table**

- **Location:** `apps/api/src/connections/oauth/oauth.service.ts:81-89; schema.prisma:538`
- **Problem:** The OAuth start flow persists the PKCE code_verifier in OAuthState.codeVerifier as plaintext, unlike every other secret in the system (Secret, Connection.config/refreshToken, EnvironmentVariable.valueEnc, ProviderSubscription.secretEnc) which is libsodium-encrypted, and the column has no companion nonce field. The row is single-use (atomic updateMany consume) and TTL-bounded to 10 minutes, and the verifier alone is useless without a simultaneously-stolen authorization code, so exploitation requires read-only DB access AND code interception within the narrow window. Defense-in-depth / at-rest-consistency gap with CLAUDE.md §10. Fix: encrypt codeVerifier with CryptoService before persisting (store ciphertext+nonce like ProviderSubscription.secretEnc) and decrypt in handleCallback before exchangeCode.
- **Suggested fix:** Encrypt the PKCE code_verifier at rest via CryptoService (ciphertext + nonce) and decrypt it in handleCallback before the code exchange.

- [ ] Fixed (commit: \_\_\_\_)

### W5.33 — LOW / correctness

**A single undecryptable env-var row aborts the entire workflow execution**

- **Location:** `apps/worker/src/engine/prisma-env-var-resolver.ts:52-62; apps/worker/src/engine/workflow-runner.ts:157`
- **Problem:** getEnvScope() decrypts every GLOBAL and USER env var inline in two for-loops with no per-row isolation. CryptoService.decrypt throws (generic 'Failed to decrypt secret', no key/row identity) if any one row fails to authenticate — e.g. a row written under a master key dropped from the keyring, or DB corruption — and the unguarded call at workflow-runner.ts:157 propagates, failing the whole execution even for workflows that never reference the failing key. This converts a single-secret problem into a workspace-wide env-var-load outage with no signal about the culprit. Fail-closed (no silent wrong value) and not attacker-reachable; the W3.17 decrypt-only keyring already mitigates the most plausible (rotation) trigger, leaving DB corruption / operator error. Disproportionate blast radius. Fix: wrap each row decrypt in try/catch, log the offending row id/key and skip it (or surface a typed UndecryptableEnvVar warning) so unrelated workflows keep running.
- **Suggested fix:** Isolate per-row decrypt in try/catch, log the offending key, and skip it (or warn) so one bad row does not fail unrelated executions.

- [ ] Fixed (commit: \_\_\_\_)

### W5.35 — LOW / security

**Worker logs full provider error response body on node failure (redaction inconsistency)**

- **Location:** `apps/worker/src/engine/workflow-runner.ts:349-375 (errResponse: e.response ?? null)`
- **Problem:** When a connector node throws, the runner logs the entire e.response. For provider HTTP error classes (GitHubHttpError, SlackHttpError, TwilioHttpError, DiscordHttpError, etc.) this is { status, body } where body is the raw provider JSON. The connection resolver was deliberately hardened to log only the upstream status and NEVER the raw response, but this generic catch re-introduces the broad-logging pattern. Verifiers split CONFIRMED-LOW / REFUTED-IMPROVEMENT, noting the captured body excludes request headers (where bearer/refresh tokens actually live) and is overwhelmingly provider error descriptions, so the concrete secret-in-logs risk is marginal — but it is a real logging-hygiene inconsistency with the codebase's own redaction stance, logs-only (not returned to clients). Fix: in the runner catch, log only a bounded, redacted subset of e.response (status + a sanitized/size-capped body) the way prisma-connection-resolver.ts already does, instead of the raw object.
- **Suggested fix:** Log only e.response.status plus a sanitized, size-capped body in the runner catch, matching the connection resolver's redaction.

- [ ] Fixed (commit: \_\_\_\_)

### W5.45 — IMPROVEMENT / security

**Execution-payload redactor (sanitizePayload) misses nonce/value/config/encryptionKey that log and audit redactors catch**

- **Location:** `packages/shared/src/utils/sanitize-payload.ts:1 (used by apps/api/src/executions/executions.service.ts:566-567)`
- **Problem:** sanitizePayload — the only redactor applied to ExecutionStep inputData/outputData/triggerData returned to the SPA — uses SENSITIVE_KEY_PATTERN=/password|token|secret|apikey|authorization|cookie|credential/i and does NOT cover nonce, value, config, encryptionKey, iv, privateKey, configEncrypted/configNonce, valueEnc/valueNonce. The pino log redactor and the audit-log sanitizer both explicitly redact those keys, so the three redaction surfaces are inconsistent and the weakest is the user-facing one. Verifiers split CONFIRMED-LOW / REFUTED-IMPROVEMENT: the executions endpoint is ownership-scoped (same-user, not cross-tenant), decrypted credential material is generally consumed internally rather than placed into node output.data (http-request even has a dedicated redactAuthHeaders), and TieTide's own column-named secrets live in the log/audit plane, not the execution data plane — so a confirmed plaintext-secret-into-output path was not demonstrated. Defense-in-depth/consistency hardening. Fix: align SENSITIVE_KEY_PATTERN with the broader key set used in logger.config.ts / audit-log.service.ts (add value, config, nonce, encryptionKey, iv, privatekey, client_secret, configencrypted/nonce, valueenc/nonce) and add unit tests for the new keys.
- **Suggested fix:** Broaden sanitizePayload's SENSITIVE_KEY_PATTERN to match the log/audit redactor key set (value/config/nonce/encryptionKey/iv/privateKey/etc.) and add unit tests.

- [ ] Fixed (commit: \_\_\_\_)

### W5.49 — IMPROVEMENT / correctness

**WorkflowVersionsService.restore audit log omits organizationId**

- **Location:** `apps/api/src/workflow-versions/workflow-versions.service.ts:115-121`
- **Problem:** Every other audit call acting on an org resource passes organizationId, but the restore audit entry passes only userId/action/resource/resourceId, writing the row with a null org. This is a symptom of the missing org migration in this module (W5.4). Verifiers confirmed the omission but downgraded to IMPROVEMENT because the audit log's only read surface is the global ADMIN endpoint, whose query layer never filters by organizationId and whose response DTO does not even return it — so no per-workspace audit report exists to be broken today; it is a forward-compat data-completeness nit with no current or security impact. Fix: after fixing W5.4 to resolve org context, include organizationId in the restore audit entry; until then, derive and pass the workflow's organizationId.
- **Suggested fix:** Include organizationId in the restore audit entry (derived from the workflow), once org context is wired per W5.4.

- [ ] Fixed (commit: \_\_\_\_)
