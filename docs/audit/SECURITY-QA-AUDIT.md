# TieTide — Security / QA / Scaling Audit & Remediation Tracker

> **Generated**: 2026-05-28 by a read-only multi-agent audit (`/workflows`, 12 dimensions, 30 agents,
> adversarial verification of every critical/high finding).
> **Source plan**: `~/.claude/plans/use-workflows-to-go-shimmering-tide.md`
> **Branch**: `feature/security-qa-hardening`
>
> Severities below are the **verified/adjusted** ones (post adversarial pass). Status:
> `[ ]` todo · `[~]` in progress · `[x]` done (commit SHA) · `[-]` won't-fix / leave-as-is (verified safe).
>
> **How to resume**: read this file + the `project-security-audit-remediation` memory, pick the first
> unchecked item in the lowest open wave, write the test first, fix, commit `one finding = one commit`,
> flip the box to `[x] <sha>`.

---

## Progress summary

| Wave | Theme                           | Items | Done |
| ---- | ------------------------------- | ----- | ---- |
| 0    | Auto-login after register       | 1     | 1    |
| 1    | Confirmed critical / high       | 8     | 7    |
| 2    | Medium security                 | 11    | 9    |
| 3    | Scaling & remaining correctness | 17    | 1    |
| 4    | Frontend QA / low               | 5     | 0    |
| —    | Verified safe (no-fix)          | 3     | n/a  |

---

## Wave 0 — Auto-login after registration

- [x] **W0.1** (medium / best-practice) Auto-login after register — backend `register()` issues a JWT;
      SPA persists token + `getMe()`, navigates to `/`.
      Files: `apps/api/src/auth/auth.service.ts`, `apps/api/src/auth/dto/`, `apps/spa/src/api/auth.ts`,
      `apps/spa/src/stores/authStore.ts`, `apps/spa/src/pages/RegisterPage.tsx`.

## Wave 1 — Confirmed CRITICAL / HIGH

- [x] **W1.1** (CRITICAL / qa) Dry-run executes real side effects — central dry-run guard in
      `BaseConnectorAction.execute`; read-only actions opt in via flag; `mockOnDryRun` stays an override.
      Files: `packages/sdk/src/base/connector-action.ts`, connector actions, connector schemas.
- [x] **W1.2** (HIGH / qa) 3 poll triggers not in NodeRegistry (sheets-row-added, gmail-label-added,
      calendar-event-created) — register + add `POLL_TRIGGER_TYPES ⊆ NodeRegistry` invariant test.
      Files: `apps/worker/src/engine/engine.module.ts`, `engine.module.spec.ts`.
- [x] **W1.3** (HIGH / qa) Poll cursor advanced before enqueue → lost events — enqueue first, advance cursor
      after durable enqueue. File: `apps/worker/src/poll/poll-processor.ts`.
- [x] **W1.4** (HIGH / qa) Push webhooks no idempotencyKey → duplicate runs — derive per-provider event id,
      set `idempotencyKey`, catch P2002. Files: `provider-webhooks.service.ts`, `webhooks.service.ts`.
- [x] **W1.5** (HIGH / security) SSRF in HTTP Request node — scheme + private/metadata IP block, DNS-pin,
      redirect re-validation, response-size cap (post-template URL). File: `apps/worker/src/nodes/actions/http-request.ts`.
- [x] **W1.6** (HIGH / security) Mailchimp signature broken & forgeable — verify server-reconstructed URL
      secret, stop trusting client headers; fail-fast on missing Trello/HubSpot signing secret.
      Files: `provider-webhooks.controller.ts`, `provider-webhooks.service.ts`, `mailchimp-subscriber-added.trigger.ts`,
      `trello-card-changed.trigger.ts`, `hubspot-*-changed.trigger.ts`, `packages/sdk/.../lifecycle.interface.ts`.
- [x] **W1.7** (HIGH / security) Irrevocable 7-day JWT — `tokenVersion Int @default(0)` on User, embedded in
      every signed token (register signs 0, login signs the live version); `JwtStrategy.validate` is now async,
      injects PrismaService, re-fetches the user each request and rejects on tokenVersion mismatch (legacy tokens
      with no claim treated as 0) while returning the _live_ role (a demoted admin loses access). New
      `POST /v1/auth/logout` (204) bumps tokenVersion → revokes all outstanding tokens. Migration
      `20260529000000_add_user_token_version`.
      _Note: no password-change/role-change endpoint exists yet to hook the bump into — add it there when those
      land. Shorter access TTL + refresh flow deferred. Migration hand-authored (no local Postgres) — run
      `prisma migrate deploy` on a live DB._
      Files: `auth.service.ts`, `auth.controller.ts`, `strategies/jwt.strategy.ts`, `schema.prisma`, migration,
      `jwt-auth.guard.spec.ts` (PrismaService stub).
- [ ] **W1.8** (HIGH / qa) EngineService swallows failures → retry/DLQ dead — re-throw retryable failures so
      BullMQ attempts/backoff/DLQ work. Files: `apps/worker/src/engine/engine.service.ts`, `workflow.processor.ts`.
      **DEFERRED**: re-enabling BullMQ retries requires resumable execution first (step checkpointing) or it
      re-introduces duplicate side-effects on re-run. Do not re-enable retries until step-level resume exists.

## Wave 2 — MEDIUM security

- [~] **W2.1** User enumeration — login is now constant-time (dummy bcrypt on unknown email). Register 409 oracle remains (needs email-verification flow — deferred).
  File: `auth.service.ts`.
- [x] **W2.2** Auth throttler IP-only + no trust-proxy — env-driven `TRUST_PROXY` wired in `main.ts` (real client
      IP behind the prod tunnel; never trust-all by default); custom `TieTideThrottlerGuard` (replaces the stock
      global guard) buckets by proxy-aware client IP and, on credential routes, by `ip|email` so one IP can't
      cycle accounts on a shared bucket. Pure unit-tested `resolveThrottleTracker` + `resolveTrustProxy`.
      _Note: true cross-IP per-account lockout (counting failures per email across all IPs) needs a Redis-backed
      stateful counter — deferred to a dedicated account-lockout feature._
      Files: `common/throttler/throttle-tracker.ts`, `tietide-throttler.guard.ts`, `throttler.module.ts`,
      `common/security/security.config.ts`, `main.ts`.
- [x] **W2.3** No PKCE on OAuth — S256 PKCE added across all 6 providers (`google/github/hubspot/microsoft/notion/slack`):
      `start()` generates a verifier/challenge (`pkce.ts`, unit-tested), stores the verifier server-side, sends only
      `code_challenge`+`code_challenge_method=S256`; `handleCallback()` sends the `code_verifier` on the token exchange.
      `AuthorizeUrlArgs`/`ExchangeCodeArgs` gained optional `codeChallenge`/`codeVerifier`. Files: `pkce.ts`,
      `providers/*.provider.ts`, `oauth-provider.interface.ts`, `oauth.service.ts`.
- [x] **W2.4** Replayable OAuth state nonce — new `OAuthState` table (jti PK + codeVerifier + expiresAt + consumedAt);
      `start()` inserts a row (jti = the state nonce); `handleCallback()` atomically consumes it via
      `updateMany({ jti, consumedAt: null, expiresAt > now })` (count must be 1) so a replayed callback flips zero rows
      and is rejected, then cross-checks userId/provider against the signed state. Migration `20260529100000_add_oauth_state`
      (hand-authored — run `prisma migrate deploy`). Files: `schema.prisma`, migration, `oauth.service.ts`.
- [x] **W2.5** AI service zero auth + API sends no creds — shared `INTERNAL_AI_TOKEN`. New `apps/ai/src/auth.py`
      `require_internal_token` dependency gates both `/ingest` and `/generate-docs` routers (constant-time
      `secrets.compare_digest`; no-op when unset, for dev/tests). API `AiService` sends `X-Internal-Token` from
      `INTERNAL_AI_TOKEN`. Files: `apps/ai/src/auth.py`, `config.py`, `routes/ingest.py`, `routes/docs.py`,
      `apps/api/src/ai/ai.service.ts`, `.env.example`.
- [x] **W2.6** AI prompt injection + no input cap — `/generate-docs` rejects a `definition` over
      `max_definition_bytes` (default 100 KB) with HTTP 413 before the RAG/LLM pipeline runs.
      _Note: the prompt-template delimiting sub-part is deferred — `PromptBuilder` JSON-encodes the whole definition,
      which is structurally safer than free-text interpolation, and the strong mitigation (size cap + the existing
      JSON-only output contract) is in place; full per-field fencing is a follow-up._ Files: `routes/docs.py`, `config.py`.
- [ ] **W2.7** Per-node `config` unvalidated JSONB + node-type not allow-listed — per-type Zod schemas + allow-list.
      Files: `workflow-definition.dto.ts`, `packages/shared/.../workflow.schema.ts`.
- [x] **W2.8** `triggerData` + body unbounded — `main.ts` caps the request body via
      `app.useBodyParser('json'/'urlencoded', { limit: BODY_LIMIT ?? '1mb' })` (rawBody preserved for webhook HMAC);
      `TriggerExecutionDto.triggerData` gets a pure, unit-tested `@MaxSerializedBytes()` validator (default 64 KiB).
      Files: `main.ts`, `trigger-execution.dto.ts`, `common/validators/max-serialized-bytes.validator.ts`.
- [x] **W2.9** Helmet/CSP/HSTS/CORS/Swagger hardening — env-aware helmet (strict CSP + 1y HSTS in prod),
      CORS mandatory-in-prod (throws on missing `CORS_ORIGIN`), Swagger gated behind `SWAGGER_ENABLED`.
      Extracted into pure `common/security/security.config.ts` (unit-tested). Files: `main.ts`, `security.config.ts`.
- [x] **W2.10** No env validation — `ConfigModule.forRoot({ validate })` runs a pure, unit-tested
      `validateEnv` that refuses to boot in production when JWT_SECRET/WEBHOOK_HMAC_SECRET/ENCRYPTION_MASTER_KEY
      are missing, too short (<32), or still the `.env.example` placeholders. No-op outside production.
      Files: `app.module.ts`, `common/security/env.validation.ts`.
- [x] **W2.11** Weak password policy — `RegisterDto.password` now requires at least one letter and one digit
      (`@Matches`), rejecting all-numeric/all-alphabetic passwords (still `MinLength(8)`/`MaxLength(72)`).
      _Note: HIBP breach-list check deferred — needs an external k-anonymity lookup._ File: `register.dto.ts`.

## Wave 3 — Scaling & remaining correctness

- [x] **W3.1** Worker concurrency actually 1 — `@Processor('workflow-execution', { concurrency })` now driven by
      `WORKER_CONCURRENCY` (default 5, invalid→5, capped 100) via pure unit-tested `resolveWorkerConcurrency`.
      Files: `processors/workflow.processor.ts`, `processors/concurrency.config.ts`.
- [ ] **W3.2** Unbounded list endpoints — cursor pagination + drop `definition` from list projection.
      Files: workflows/secrets/connections/tags/folders/env-vars `.service.ts`.
- [ ] **W3.3** No per-tenant quotas / userId tracker — getTracker→userId + quota layer.
- [ ] **W3.4** Missing indexes — Connection `[status,expiresAt]`, Workflow `[isActive]`, ExecutionStep review. File: `schema.prisma`.
- [ ] **W3.5** Execution/step unbounded growth — retention/archival job.
- [ ] **W3.6** No metrics — prom-client `/metrics` (queue gauges, duration histograms). API + worker.
- [ ] **W3.7** Worker no liveness — HTTP liveness/readiness + Docker HEALTHCHECK. Files: `apps/worker/src/main.ts`, Dockerfile.
- [ ] **W3.8** No prod compose / TLS / secret mgmt — `docker-compose.prod.yml` + nginx TLS. Files: `infra/docker/`.
- [ ] **W3.9** Idempotency read-then-create races — catch P2002 (manual/poll/cron).
      Files: `executions.service.ts`, `poll-processor.ts`, `cron-processor.ts`.
- [ ] **W3.10** Fan-in drops predecessors — merge executed-predecessor outputs keyed by nodeId. File: `workflow-runner.ts`.
- [ ] **W3.11** Subworkflow/iterator in-process retry dup — tie child re-exec to parent idempotency; propagate requestId.
      Files: `nodes/logic/subworkflow.ts`, `workflow-runner.ts`.
- [ ] **W3.12** Conditional CANCELLED vs SKIPPED — distinct status; collapse double write. File: `workflow-runner.ts`.
- [ ] **W3.13** Count-based poll cursor fragile — stable row identity or regression detection.
      Files: `sheets-row-added.ts`, `excel-row-added.ts`.
- [ ] **W3.14** Cron trigger only at nodes[0]; idempotency key drifts — scan all nodes; key on scheduled ts.
      Files: `cron-trigger.service.ts`, `cron-processor.ts`.
- [ ] **W3.15** Calendar empty-poll watermark race — pre-request watermark + overlap. File: `calendar-event-created.ts`.
- [ ] **W3.16** Log redaction gaps — add `value`/`config` paths, stop logging raw `e.response`, recursive audit sanitize,
      async audit log. Files: `logger.config.ts`, `prisma-connection-resolver.ts`, `audit-log.service.ts`.
- [ ] **W3.17** Single static master key, no rotation — key-id/version + keyring + re-encrypt migration.
      File: `packages/crypto/src/crypto-core.ts`. _(May stay documented if too large for MVP.)_

## Wave 4 — Frontend QA / low

- [ ] **W4.1** `hydrate()` never called → user lost on refresh — call on mount, gate ProtectedRoute on hydrated flag.
      Files: `App.tsx`/`RootLayout.tsx`, `ProtectedRoute.tsx`.
- [ ] **W4.2** No client role guard on admin routes — `AdminRoute`. Files: `ProtectedRoute.tsx`, `App.tsx`.
- [ ] **W4.3** 401 interceptor hard-reloads — router navigation + session-expired toast. File: `api/client.ts`.
- [ ] **W4.4** Vague auth error messages — differentiate 429 + network. Files: `LoginPage.tsx`, `RegisterPage.tsx`.
- [ ] **W4.5** JWT in localStorage (accepted risk) — add CSP to SPA + short TTL (ties W1.7). Files: `authStore.ts`, SPA.

---

## Verified safe — leave as-is (do NOT "fix")

- [-] SQL run-query nodes correctly parameterized (pg `query(text,values)` / mysql2 `execute`, `multipleStatements:false`).
- [-] Code node sandbox properly hardened (worker_thread + `vm.runInContext`, `codeGeneration` off, resource limits).
- [-] No exploitable IDOR — services check `findFirst({id,userId})` before mutate; `remove` uses `deleteMany({id,userId})`.
  Optional symmetry tidy only (`updateMany({id,userId})`).
