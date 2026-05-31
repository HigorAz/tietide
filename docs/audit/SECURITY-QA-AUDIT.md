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
| 3    | Scaling & remaining correctness | 17    | 17   |
| 4    | Frontend QA / low               | 5     | 5    |
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
- [x] **W3.7** Worker no liveness — added `/live` (liveness — always 200, no dependency checks so a transient
      blip can't get a healthy worker killed) and `/health` (readiness — `WorkerHealthService` pings Postgres via
      `SELECT 1` and the BullMQ Redis client via `ping`; 200 when both ready, 503 otherwise) to the worker's
      existing metrics `node:http` server (W3.6); both probes are unauthenticated. Worker `Dockerfile` now `EXPOSE`s
      the real metrics port (9091, was a stale 9100 placeholder) and gets a `HEALTHCHECK` that probes `/live` via
      `node` (no curl/wget needed in the alpine runtime). Health service + server routes unit-tested.
      Files: `apps/worker/src/metrics/{worker-health.service.ts,metrics.server.ts,metrics.module.ts}` (+ specs),
      `apps/worker/Dockerfile`.
- [x] **W3.8** No prod compose / TLS / secret mgmt — new standalone `infra/docker/docker-compose.prod.yml`
      that **builds and wires all four app images** (api/worker/ai/spa) onto the dependency stack behind an
      **nginx `edge` service that terminates TLS** (Let's Encrypt via a `certbot` companion;
      `infra/docker/nginx/templates/default.conf.template` routes `/v1/*` + `/webhooks/*` → api, `/*` → spa,
      with HSTS/X-Frame-Options/COOP headers and Socket.IO upgrade support). PostgreSQL + Valkey get **no
      `ports:` block** (internal `backend` network only, per `.claude/rules/infrastructure.md`); the AI service
      and `/metrics` are not proxied (worker metrics bound to `127.0.0.1:${METRICS_PORT}` loopback only);
      `NODE_ENV=production` is forced on api+worker (activates the W2.9/W2.10 prod hardening); service-name
      hostnames (`@postgres`, `valkey`, `http://ai:8000`) injected via compose `environment:` overriding the
      localhost `.env` defaults; `POSTGRES_PASSWORD`/`DOMAIN` fail-fast if unset; SPA API base baked same-origin
      `/v1` (not the dev `VITE_API_URL`). A `migrate` profile reuses the api **builder** stage (which retains the
      prisma CLI the slim runtime strips) to run `prisma migrate deploy` — the documented way to apply the three
      hand-authored migrations on a live DB. Secret mgmt stays `.env`/secret-manager — nothing hardcoded.
      _Validated with `docker compose config` (the local Docker daemon is down, so container-level `nginx -t`
      could not run; the template uses only `${DOMAIN}` envsubst and standard proxy directives)._ Files:
      `infra/docker/docker-compose.prod.yml`, `infra/docker/nginx/templates/default.conf.template`,
      `infra/docker/nginx/README.md`, `docs/deployment.md`.
- [x] **W3.9** Idempotency read-then-create races — the three trigger paths all did a non-atomic
      `findFirst`-then-`create` against `@@unique([workflowId, idempotencyKey])`, so two concurrent
      triggers carrying the same key both pass the dedup read and the loser crashes on P2002 (or, for the
      workers, fails the whole tick). Each `create` is now wrapped to catch the unique violation:
      **manual** (`executions.service.ts`) re-fetches and returns the winner's execution without enqueuing a
      second job; **cron** (`cron-processor.ts`) logs and returns (the winner already enqueued); **poll**
      (`poll-processor.ts`) `continue`s to the next item and still advances the cursor (the item is durably
      handled), distinct from an enqueue failure which rethrows to hold the cursor. Non-P2002 errors rethrow
      unchanged. Shared pure `isUniqueViolation` helper (`apps/worker/src/common/prisma-error.ts`) backs both
      workers; the API service keeps a local copy (mirrors the existing provider-webhooks W1.4 pattern).
      Files: `apps/api/src/executions/executions.service.ts`, `apps/worker/src/poll/poll-processor.ts`,
      `apps/worker/src/cron/cron-processor.ts`, `apps/worker/src/common/prisma-error.ts` (+ specs).
- [x] **W3.10** Fan-in drops predecessors — `buildInput` resolved a node's input data from only the _last_
      executed predecessor (`outputs.get(last)`), so a join/merge node with 2+ in-edges silently lost every
      branch but one. Now: 0 predecessors → triggerData (unchanged); exactly 1 → that predecessor's output
      flat (linear-chain passthrough preserved, back-compat); 2+ → outputs merged into one object keyed by
      source nodeId (`{ <predId>: <output.data>, ... }`) so no branch is dropped. Only predecessors that
      actually produced output (`outputs.has(id)`) are merged — cancelled/unreached ones are excluded.
      Template refs `{{nodeId.field}}` were already resolved against the full by-id scope, so they are
      unaffected. File: `apps/worker/src/engine/workflow-runner.ts` (+ spec: replaced the old "last wins (MVP)"
      assertion with a keyed-merge assertion, added a single-predecessor flat-passthrough regression test).
- [x] **W3.11** Subworkflow/iterator in-process retry dup + requestId propagation — both logic nodes spawned a
      fresh child execution every time they ran, so re-processing a parent execution (a future BullMQ retry —
      see deferred W1.8) would re-run children and duplicate side effects. Each child is now tied to its parent
      node via a deterministic idempotencyKey (`subworkflow:<parentExec>:<nodeId>` / `iterator:<parentExec>:
<nodeId>:<index>`), scoped per target workflow by the existing `@@unique([workflowId, idempotencyKey])`:
      before spawning, the node looks for an existing child — an already-SUCCESS child is reused without
      re-running (no duplicate side effects), a prior incomplete child is re-run in place, and the create is
      P2002-guarded (reuses the winner of a concurrent race). **requestId** is now propagated end-to-end:
      `ExecutionContext` gained an optional `requestId` (`@tietide/sdk@2.7.0`, additive + CHANGELOG), the runner
      threads the run's requestId into every node context, and the subworkflow forwards it on the child
      `engine.execute` (iterator children already received it via `this.run`), so a parent→child execution tree
      shares one correlation id in the logs. Files: `packages/sdk/src/interfaces/context.interface.ts`,
      `packages/sdk/CHANGELOG.md` + version bump, `apps/worker/src/nodes/logic/subworkflow.ts`,
      `apps/worker/src/engine/workflow-runner.ts` (+ subworkflow, runner, and iterator-integration specs).
- [x] **W3.12** Conditional CANCELLED vs SKIPPED + double write — the runner recorded every non-running node
      as CANCELLED, conflating "a conditional branched around this node" (normal control flow) with "an upstream
      failure aborted this path" (an error). A node skipped by a conditional now records **SKIPPED**; CANCELLED
      is reserved for failure-abandoned paths. The runner tracks each node's final status (`statusByNode`) and,
      for an unreachable node with no global failure, `classifyUnreached` inspects its incoming edges: an
      un-fired error-handler edge or a predecessor that FAILED/was CANCELLED ⇒ CANCELLED; a conditional that
      chose another branch (predecessor SUCCESS) ⇒ SKIPPED. A hard failure with no handler still cancels all
      remaining nodes. Verified against the existing error-edge tests (un-taken error-handler and
      success-path-after-failure correctly stay CANCELLED). Also **collapsed the double write**: `recordCancelled`
      did a redundant create-then-update-to-the-same-status; both it and the new `recordUnreachedSkipped` now do
      a single terminal create. File: `apps/worker/src/engine/workflow-runner.ts` (+ spec).
- [x] **W3.13** Count-based poll cursor fragile — both row-count cursors got stuck **high** when a sheet/table
      shrank (deleted rows): they held the old peak, so every row added until the table re-exceeded that peak was
      silently dropped. Added **regression detection** that re-baselines the cursor to the current size on a
      shrink. **Sheets** reads the whole range, so it compares `totalRows < previousCount` directly. **Excel**
      pages via `$skip`, where an empty page is ambiguous (no-new-rows vs shrink); it now disambiguates only on
      that empty case with one extra `tables('…')/dataBodyRange?$select=rowCount` probe (a 404 = no data body =
      0 rows → re-baseline to 0), so the common append/no-change paths stay single-call. _Note: the deeper
      mid-table-deletion positional drift (a count cursor can't tell a shifted row from a new one) is inherent to
      count cursors without stable per-row identity, which Sheets/Graph tables don't expose; the high-value
      stuck-cursor data-loss bug is closed._ Files: `apps/worker/src/nodes/triggers/poll/sheets-row-added.ts`,
      `apps/worker/src/nodes/triggers/poll/excel-row-added.ts` (+ specs).
- [x] **W3.14** Cron trigger only at nodes[0] + idempotency key drift — two bugs. (1) `extractCronTrigger`
      only inspected `definition.nodes[0]`, so any workflow whose cron-trigger node was not first in the array
      was silently never scheduled; it now scans ALL nodes for the `cron-trigger` type. (2) `computeScheduledFor`
      keyed the idempotency lock on `job.processedOn` — the worker pickup time, which differs on every
      attempt/retry, so the same scheduled tick could run twice (each attempt minted a fresh key). It now keys on
      the SCHEDULED fire time: the BullMQ job-scheduler job id ends in the scheduled epoch millis
      (`repeat:<key>:<millis>`), parsed via `scheduledMillisFromId`, falling back to the job's enqueue
      `timestamp` (never `processedOn`), so all attempts of one tick share one stable `cron:<wf>:<iso>` key.
      Files: `apps/worker/src/cron/cron-trigger.service.ts`, `apps/worker/src/cron/cron-processor.ts` (+ specs).
- [x] **W3.15** Calendar empty-poll watermark race — on a poll that emitted no events the cursor advanced to
      `new Date()` captured AFTER the `events.list` response, so an event created while the request was in flight
      (its `created` falling between the old cursor and that post-response "now") was skipped forever. The
      watermark is now captured BEFORE the request, minus a 30s overlap that absorbs Google's index lag, and
      clamped so it never regresses below the current cursor (`max(cursorMs, watermarkMs)`) — closing the race
      while still moving forward so the same `updatedMin` window isn't refetched indefinitely. Any event the
      overlapping window re-emits is deduped by the poll-processor's idempotencyKey. File:
      `apps/worker/src/nodes/triggers/poll/calendar-event-created.ts` (+ spec: a fake-timer test where the
      mocked request advances the clock 2 min proves the cursor stays at the pre-request watermark).
- [x] **W3.16** Log redaction gaps — four fixes. (1) Both pino loggers' `REDACT_PATHS` now censor `value`/`config`
      (Secret/EnvVar plaintext value, connection decrypted-config blob) and their at-rest columns
      (`configEncrypted`/`configNonce`/`valueEnc`/`valueNonce`), top-level and one-level-nested. (2) The OAuth
      refresh failure path in `prisma-connection-resolver` logged the raw `e.response` (which carries the request's
      bearer/refresh token + client secret in headers and possibly token material in the body) — it now logs only
      `errStatus` (the upstream HTTP status). (3) Audit `sanitizeMetadata` was top-level only, so a secret nested
      under e.g. `connection.config.accessToken` reached the audit row — it is now a recursive walk over objects
      AND arrays, with an expanded sensitive-key set (`config`, `accessToken`, `refreshToken`, `*_token`,
      `client_secret`, the `*Enc`/`*Nonce` columns). (4) `AuditLogService.log` is now fire-and-forget — the write
      is kicked off synchronously but not awaited, so auditing never adds DB latency to (nor can fail) the request
      path (it was already best-effort/non-throwing). Files: `apps/{api,worker}/src/common/logger/logger.config.ts`,
      `apps/worker/src/connections/prisma-connection-resolver.ts`, `apps/api/src/audit/audit-log.service.ts` (+ specs).
- [x] **W3.17** Single static master key, no rotation — `CryptoCore` is now a **keyring**: the first key is the
      primary (used for every `encrypt`); additional keys are decrypt-only. Because XChaCha20-Poly1305 is
      authenticated, `decrypt` tries each key and accepts the one whose tag verifies — so rotation needs **no
      ciphertext-format change and no migration**. `CryptoService` (api + worker) reads an optional
      `ENCRYPTION_MASTER_KEYS_OLD` (comma-separated former base64 keys); with it set, it builds the ring via the
      new `CryptoCore.fromBase64Keyring(primary, [...old])`, otherwise behaviour is identical to before. This
      enables zero-downtime rotation: deploy a new primary, demote the current key to the old-keys ring, and new
      writes use the new key while old rows still decrypt. _The optional background **re-encryption migration**
      (to eventually drop a retired key) is documented as a runbook procedure rather than automated — that piece
      stays an ops task; removing an old key before its rows are re-encrypted makes them unrecoverable._ Files:
      `packages/crypto/src/crypto-core.ts`, `apps/{api,worker}/src/crypto/crypto.service.ts`, `.env.example`,
      `docs/runbook.md` (+ specs).

## Wave 4 — Frontend QA / low

- [x] **W4.1** `hydrate()` never called → user lost on refresh — the auth store had a `hydrate()` (restore token
      from localStorage + `getMe()`) that nothing invoked, so after a refresh the token persisted but the `user`
      object was null forever. `RootLayout` now calls `hydrate()` once on mount; the store gained a `hydrated`
      flag (set true once hydrate settles, including the no-token and getMe-failure paths), and `hydrate()` now
      drops an invalid/expired stored token on `getMe` failure so the guard cleanly redirects. `ProtectedRoute`
      gates on it: no token → `/login`; token present but not yet hydrated → a `role="status"` loading state
      (no content flash, no premature redirect); hydrated → children. Files: `apps/spa/src/stores/authStore.ts`,
      `apps/spa/src/components/ProtectedRoute.tsx`, `apps/spa/src/components/layout/RootLayout.tsx` (+ tests).
- [x] **W4.2** No client role guard on admin routes — the `/admin/*` routes sat behind `ProtectedRoute` only
      (any authenticated user), so a non-admin who navigated there rendered the admin UI and merely saw failed
      API calls. New `AdminRoute` (in `ProtectedRoute.tsx`) waits for hydration then redirects anyone whose
      `user.role !== 'ADMIN'` to `/`; `/admin/env-vars` and `/admin/audit` are now wrapped in it (nested inside
      the existing ProtectedRoute). The backend RolesGuard remains the real authority — this is defense-in-depth + correct UX. Files: `apps/spa/src/components/ProtectedRoute.tsx`, `apps/spa/src/App.tsx` (+ tests).
- [x] **W4.3** 401 interceptor hard-reloads — the axios response interceptor did `window.location.href =
'/login'` on every 401, a full-page reload that threw away all in-app state. It now (extracted into a
      testable `onResponseRejected`) does a **soft logout**: on a 401 _for an authenticated session_ it calls
      `useAuthStore.logout()` — clearing the token makes `ProtectedRoute` redirect reactively, no reload — and
      surfaces a session-expired error toast via `useToastStore`. A 401 with no active session (a failed login)
      is left for the page to handle, and non-401s pass through untouched; the original error is always
      re-rejected. File: `apps/spa/src/api/client.ts` (+ new `client.test.ts`).
- [x] **W4.4** Vague auth error messages — both login and register collapsed every non-credential failure into
      "Something went wrong", so a rate-limited or offline user got no actionable signal. New shared
      `resolveAuthErrorMessage` (`apps/spa/src/utils/authError.ts`) differentiates **429** ("Too many attempts.
      Please wait a moment…") and a **no-response / `ERR_NETWORK`** connection failure ("Cannot reach the
      server. Check your connection…") from a generic server error; each page still handles its own specific
      status first (login 401 "Invalid credentials", register 409 "Email already registered"). Files:
      `apps/spa/src/utils/authError.ts`, `apps/spa/src/pages/LoginPage.tsx`, `apps/spa/src/pages/RegisterPage.tsx`
      (+ helper spec + LoginPage 429/network tests).
- [x] **W4.5** JWT in localStorage (accepted risk) — the token stays in localStorage (SPA architecture), so the
      mitigation is to shrink the XSS surface that could read it + limit a stolen token's lifetime. Added a
      **Content-Security-Policy** (plus `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy`,
      COOP) to the SPA's production `nginx.conf`: `default-src 'self'`, `object-src 'none'`,
      `frame-ancestors 'none'`, scripts/styles restricted to self (+ the Google Fonts origins the app uses),
      `connect-src 'self' ws: wss:` for the same-origin API + Socket.IO stream. _Deliberately set at the prod
      nginx layer, NOT as an index.html `<meta>`, because a strict CSP meta would break Vite's dev server (inline
      scripts/HMR eval)._ Documented a **short access-TTL** recommendation on `JWT_EXPIRES_IN` in `.env.example`,
      tied to the W1.7 `tokenVersion` revocation (a refresh-token flow to keep short TTLs seamless is a noted
      follow-up). Files: `apps/spa/nginx.conf`, `.env.example`.

---

## Verified safe — leave as-is (do NOT "fix")

- [-] SQL run-query nodes correctly parameterized (pg `query(text,values)` / mysql2 `execute`, `multipleStatements:false`).
- [-] Code node sandbox properly hardened (worker_thread + `vm.runInContext`, `codeGeneration` off, resource limits).
- [-] No exploitable IDOR — services check `findFirst({id,userId})` before mutate; `remove` uses `deleteMany({id,userId})`.
  Optional symmetry tidy only (`updateMany({id,userId})`).
