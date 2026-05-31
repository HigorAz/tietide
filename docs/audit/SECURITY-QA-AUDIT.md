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
| 2    | Medium security                 | 11    | 10   |
| 3    | Scaling & remaining correctness | 17    | 6    |
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
- [x] **W2.7** (`c338606`) Per-node `config` unvalidated JSONB + node-type not allow-listed — positive allow-list +
      config structural safety. `KNOWN_NODE_TYPES` (derived from the canonical `NodeType` catalog) and a pure
      `findUnsafeConfigIssue` walker (rejects `__proto__`/`constructor`/`prototype` keys anywhere in the tree and
      bounds nesting at `MAX_CONFIG_DEPTH=20`) are wired into `executableWorkflowDefinitionSchema.superRefine`,
      so the save boundary (`create`/`update` → `assertExecutableDefinition`) rejects unknown node types and unsafe
      configs before persistence. The same walker backs an `@IsSafeNodeConfig()` class-validator on
      `WorkflowNodeDto.config`, which runs one layer earlier at the HTTP DTO and catches a raw `__proto__` own-key
      (zod's `z.record` silently neutralizes `__proto__` to a null prototype, so it never reaches `superRefine`) —
      this also covers the dry-run `test` endpoint, whose `definitionOverride` bypasses the executable schema.
      _Note: full per-type config Zod schemas for all ~190 node types are intentionally deferred — the worker
      validates each node's config at execution, and the high-value gaps (arbitrary node `type`, prototype
      pollution, unbounded depth) are closed here._
      Files: `packages/shared/.../workflow.schema.ts`, `packages/shared/src/index.ts`,
      `apps/api/.../dto/workflow-definition.dto.ts`, `apps/api/.../common/validators/safe-node-config.validator.ts`.
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
- [x] **W3.2** Unbounded list endpoints — keyset cursor pagination across all 6 list endpoints + dropped the
      heavy `definition` JSONB from the workflows list projection. New `common/pagination/` module (generic
      base64url `{v,id}` keyset cursor, `PageQueryDto` with clamped `limit` default 50 / max 100, `buildPage`
      peek-and-slice, `keysetWhere` asc/desc fragment, `PaginatedResponseDto` Swagger factory). Each list now
      `findMany({ orderBy: [<sort>, id], take: limit+1 })` and returns `{ items, nextCursor }`: workflows/secrets/
      connections sort `createdAt desc`, tags/folders sort `name asc` (folders' tree is rebuilt client-side from
      `parentFolderId`, so a global name order still presents siblings in order), env-vars sort `key asc`.
      Workflows list uses a `WorkflowListItemDto` (= `WorkflowResponseDto` minus `definition`); the SPA editor
      still loads the full definition via `getWorkflow(id)`. SPA: a `fetchAllPages` client helper transparently
      walks `nextCursor` so the 5 list clients keep returning full arrays (stores/dashboard unchanged in behaviour,
      server query now bounded per request); `workflowsStore`/list components widened to the definition-less
      `WorkflowListItem`. _Pagination UI ("load more") deferred — clients accumulate all pages._
      Files: `apps/api/src/common/pagination/*`, the 6 `*.service.ts` + their controllers + `*-list-response.dto.ts`,
      `apps/spa/src/api/{pagination,workflows,connections,folders,tags,envVars}.ts`, `stores/workflowsStore.ts`,
      home/dashboard workflow-list components.
- [x] **W3.3** No per-tenant quotas / userId tracker — the global throttler now buckets authenticated requests
      **per-tenant by verified userId** (`user:<id>`), so a user's rate limit follows the account across source
      IPs and tenants behind one shared egress IP (NAT/proxy) no longer share a bucket; anonymous requests keep
      the proxy-aware IP (and `ip|email` on credential routes). Because the global `APP_GUARD` throttler runs
      _before_ the per-controller `JwtAuthGuard`, `req.user` isn't populated yet — `TieTideThrottlerGuard` now
      injects `JwtService` and **verifies** the bearer token itself to obtain a trustworthy `sub` (bare decoding
      would let a forged token mint unlimited fresh buckets and bypass the IP limit); absent/invalid/oauth-state
      tokens fall back to IP. `resolveThrottleTracker` gained a `user` branch (taking precedence over ip/email);
      `AppThrottlerModule` registers a verify-only `JwtModule` with the same `JWT_SECRET`.
      _Note: a true resource-**quota** layer (per-plan caps on workflows/executions/storage with persistent
      counters) is deferred — it's a product-tier feature beyond the rate-limit tracker this finding names._
      Files: `common/throttler/{throttle-tracker.ts,tietide-throttler.guard.ts,throttler.module.ts}` (+ specs).
- [x] **W3.4** Missing indexes — added `@@index([status, expiresAt])` on Connection (backs the OAuth refresh-scan
      sweep `status='ACTIVE' AND expires_at < cutoff`) and `@@index([isActive])` on Workflow (backs the worker
      cron/poll schedulers' global `WHERE is_active = true` enumeration). ExecutionStep review: its only query
      (fetch steps for an execution) is already served by `@@index([executionId])` — no change. Hand-authored
      migration `20260531000000_add_missing_indexes` (no local Postgres → **run `prisma migrate deploy` on a live
      DB**; index-only, so the generated client is unchanged). Schema-regression spec guards the indexes.
      Files: `schema.prisma`, migration, `src/prisma/schema-indexes.spec.ts`.
- [x] **W3.5** Execution/step unbounded growth — new worker `RetentionModule`: a daily BullMQ scheduler
      (`upsertJobScheduler`, 03:17 cron) enqueues a sweep that batch-deletes **terminal** WorkflowExecutions
      (SUCCESS/FAILED/CANCELLED/SKIPPED — never PENDING/RUNNING) older than `EXECUTION_RETENTION_DAYS` (default 90,
      clamped [1, 3650]); ExecutionSteps cascade-delete via FK. Deletes in 500-row batches (cap 2000 batches/run,
      logs if hit) so no single giant lock. Pure `resolveRetentionDays` + processor unit-tested.
      Files: `apps/worker/src/retention/{retention.config.ts,retention.constants.ts,retention.processor.ts,
  retention.scheduler.ts,retention.module.ts}` (+ specs), `worker.module.ts`, `.env.example`.
- [x] **W3.6** No metrics — `prom-client` `/metrics` on both apps. **API**: `MetricsModule` exposes `GET /metrics`
      (root, excluded from the `/v1` prefix, `@SkipThrottle`) with default process metrics, an
      `http_request_duration_seconds` histogram (global `HttpMetricsInterceptor`, labelled by matched route so
      cardinality stays bounded), and `workflow_execution_queue_jobs` gauges (refreshed from BullMQ on scrape).
      **Worker** (no HTTP layer): a tiny `node:http` server on `METRICS_PORT` (default 9091) serves `/metrics` with
      default metrics, a `workflow_execution_duration_seconds` histogram (observed in `WorkflowProcessor` by
      outcome), and the same queue gauges. Both gate on an optional `METRICS_TOKEN` (constant-time bearer; open when
      unset) since metrics leak operational data. Pure `isMetricsAuthorized` / `resolveMetricsPort` + services +
      server handler unit-tested.
      Files: `apps/api/src/metrics/*`, `apps/api/src/{app.module,main}.ts`, `apps/worker/src/metrics/*`,
      `apps/worker/src/{worker.module,processors/workflow.processor}.ts`, both `package.json`, `.env.example`.
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
