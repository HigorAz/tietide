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
| 1    | Confirmed critical / high       | 8     | 4    |
| 2    | Medium security                 | 10    | 0    |
| 3    | Scaling & remaining correctness | 17    | 0    |
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
- [ ] **W1.5** (HIGH / security) SSRF in HTTP Request node — scheme + private/metadata IP block, DNS-pin,
      redirect re-validation, response-size cap (post-template URL). File: `apps/worker/src/nodes/actions/http-request.ts`.
- [ ] **W1.6** (HIGH / security) Mailchimp signature broken & forgeable — verify server-reconstructed URL
      secret, stop trusting client headers; fail-fast on missing Trello/HubSpot signing secret.
      Files: `provider-webhooks.controller.ts`, `provider-webhooks.service.ts`, `mailchimp-subscriber-added.trigger.ts`,
      `trello-card-changed.trigger.ts`, `hubspot-*-changed.trigger.ts`, `packages/sdk/.../lifecycle.interface.ts`.
- [ ] **W1.7** (HIGH / security) Irrevocable 7-day JWT — `tokenVersion` on User + checked in strategy,
      `/auth/logout`, bump on password/role change, shorter access token + refresh flow.
      Files: `apps/api/src/auth/*`, `schema.prisma`, `strategies/jwt.strategy.ts`.
- [ ] **W1.8** (HIGH / qa) EngineService swallows failures → retry/DLQ dead — re-throw retryable failures so
      BullMQ attempts/backoff/DLQ work. Files: `apps/worker/src/engine/engine.service.ts`, `workflow.processor.ts`.

## Wave 2 — MEDIUM security

- [ ] **W2.1** User enumeration (register oracle + login timing) — constant-time login, neutral register.
      File: `auth.service.ts`.
- [ ] **W2.2** Auth throttler IP-only + no trust-proxy — IP+email tracker, per-account lockout, trust proxy.
      Files: `throttler.config.ts`, `main.ts`.
- [ ] **W2.3** No PKCE on OAuth — S256 across 6 providers. Files: `connections/oauth/providers/*.ts`, `oauth.service.ts`.
- [ ] **W2.4** Replayable OAuth state nonce — persist jti, single-use. Files: `oauth-state.service.ts`, `oauth.service.ts`.
- [ ] **W2.5** AI service zero auth + API sends no creds — shared `INTERNAL_AI_TOKEN`, gate `/ingest`.
      Files: `apps/ai/src/**`, `apps/api/src/ai/ai.service.ts`.
- [ ] **W2.6** AI prompt injection + no input cap — delimit untrusted blocks, strip config, length+body caps.
      Files: `apps/ai/src/services/prompt.py`, `routes/docs.py`.
- [ ] **W2.7** Per-node `config` unvalidated JSONB + node-type not allow-listed — per-type Zod schemas + allow-list.
      Files: `workflow-definition.dto.ts`, `packages/shared/.../workflow.schema.ts`.
- [ ] **W2.8** `triggerData` + body unbounded — `express.json({limit})`, triggerData size cap.
      Files: `trigger-execution.dto.ts`, `webhooks.service.ts`, `main.ts`.
- [ ] **W2.9** Helmet/CSP/HSTS/CORS/Swagger hardening — env-aware helmet, CORS getOrThrow, gate Swagger. File: `main.ts`.
- [ ] **W2.10** No env validation — ConfigModule validationSchema, reject placeholders. File: `app.module.ts`.
- [ ] **W2.11** Weak password policy — strength + breach check. File: `register.dto.ts`.

## Wave 3 — Scaling & remaining correctness

- [ ] **W3.1** Worker concurrency actually 1 — `@Processor(name,{concurrency})` env-driven. Files: `processors/*.ts`.
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
