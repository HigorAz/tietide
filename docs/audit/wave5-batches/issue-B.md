> Part of the **2026-06-11 adversarial audit (Wave 5)**. Full tracker: `docs/audit/AUDIT-2026-06-11.md`. Findings here survived independent adversarial verification.

**5 findings** in this batch. Fix each via TDD (failing regression test first → minimal fix → atomic commit, one finding = one commit). Branch: `feature/audit-wave5-remediation` (or a fresh branch off it).

> ⚠️ Repo gotchas: the husky pre-commit hook is broken (`Exec format error`) — run `npx lint-staged` then `git commit --no-verify`. Never run tests/migrations against `localhost:5432` (production Postgres). Build `@tietide/shared`+`@tietide/sdk`+`@tietide/crypto` before `tsc --noEmit`. No `Co-Authored-By: Claude` trailer.

---

### W5.17 — MEDIUM / correctness

**Stripe webhook has no event-id dedup or out-of-order guard — a retried subscription.updated can resurrect a cancelled paid plan**

- **Location:** `apps/api/src/billing/billing-webhook.controller.ts:61-93; apps/api/src/billing/billing.service.ts:121-177`
- **Problem:** The controller comment claims handlers are 'idempotent' and 'replays are safe', but there is no persisted event-id ledger and no event.created/timestamp ordering guard. syncFromStripeSubscription and markSubscriptionDeleted are unconditional last-write-wins prisma.subscription.update calls. Stripe does not guarantee delivery order and retries failed deliveries for up to 3 days, so a stale/retried customer.subscription.updated arriving after customer.subscription.deleted re-elevates the workspace to a paid plan (plan, stripeSubscriptionId, ACTIVE, hardRunCap=null), granting free paid entitlements (uncapped runs/seats/workflows) until the next correct event. Events are Stripe-signature-verified so this is not attacker-forgeable; it is a self-healing transient edge condition driven by Stripe's own retry/out-of-order delivery. Fix: persist a processed-event ledger keyed by event.id (unique, short-circuit duplicates), and store the last-applied Stripe event/subscription timestamp on the Subscription row, skipping any update whose event.created is older than what is already applied.
- **Suggested fix:** Add an event.id dedup ledger and an event.created high-water-mark column on Subscription; skip stale/out-of-order updates.

- [ ] Fixed (commit: \_\_\_\_)

### W5.18 — MEDIUM / correctness

**Metered usage report can over-count at period rollover when currentPeriodStart lags the webhook**

- **Location:** `apps/worker/src/billing/usage-report.processor.ts:37-57; apps/api/src/billing/billing.service.ts:148-154`
- **Problem:** UsageReportProcessor runs daily and reports cumulative runs since currentPeriodStart with Stripe action:'set' and a now-timestamp. currentPeriodStart is updated only by the invoice.paid / customer.subscription.updated webhook. At a monthly boundary, if Stripe opens a new period but the webhook is delayed (retry backoff) past the daily tick, the job counts runs from the OLD (larger) period start and reports that inflated quantity into the NEW Stripe period via 'set', over-billing the customer. The idempotency key embeds the stale `since` so it does not self-correct within that day. Direct money/accuracy error against customers, but transient and self-healing on the next tick once the webhook lands (set semantics overwrite), and only manifests under a narrow webhook-delay window at the boundary; not attacker-triggerable. Fix: derive the reporting window from the period that contains the report timestamp (e.g. max(currentPeriodStart, startOfMonthUtc(now)) or retrieve the authoritative current period from Stripe), or report incremental deltas keyed to immutable run timestamps.
- **Suggested fix:** Clamp the counting window to the period containing the report timestamp (or fetch the authoritative period from Stripe), so a webhook lag cannot leak prior-period runs into the new period.

- [ ] Fixed (commit: \_\_\_\_)

### W5.24 — LOW / security

**maxWorkflows plan limit is advertised but never enforced (FREE workflow cap bypass)**

- **Location:** `apps/api/src/workflows/workflows.service.ts:102-144; apps/api/src/billing/entitlements.service.ts:55-76; apps/api/src/library/library.service.ts:34`
- **Problem:** PLAN_LIMITS.FREE.maxWorkflows=10 and getEntitlements reports workflows.used/max to the billing UI, but no code path enforces it. WorkflowsService.create (and the library template instantiate path) call prisma.workflow.create with no entitlements check — there is no assertCanCreateWorkflow, unlike assertCanRun/assertCanAddSeat/assertCanCreateWorkspace. A FREE workspace can create unlimited workflows, defeating the documented plan limit and the metering/upsell model. Workflows remain org-scoped (no IDOR), and the worker run-quota check (assertCanRun) still blocks cron/poll once over the included runs, so compute abuse is independently mitigated — verifiers downgraded MEDIUM→LOW (plan-integrity, not a security boundary). Fix: add `await this.entitlements.assertCanCreateWorkflow(organizationId)` at the top of WorkflowsService.create and the library instantiate path; implement assertCanCreateWorkflow mirroring assertCanAddSeat (count workflows, throw PaymentRequiredException('workflows') at the cap, skip when null).
- **Suggested fix:** Implement and call assertCanCreateWorkflow in WorkflowsService.create and LibraryService.instantiate, returning 402 at the FREE maxWorkflows cap.

- [ ] Fixed (commit: \_\_\_\_)

### W5.25 — LOW / correctness

**Plan-limit checks (run cap, seat cap, workspace cap) are non-atomic count-then-create TOCTOU**

- **Location:** `apps/api/src/billing/entitlements.service.ts:83-135; apps/api/src/executions/executions.service.ts:91-121; apps/api/src/organizations/organization-invites.service.ts:131-152; apps/worker/src/cron/cron-processor.ts:73-89`
- **Problem:** Merged from BILL-3 and BILL-5. assertCanRun, assertCanAddSeat, and assertCanCreateWorkspace all COUNT existing rows and throw at the cap, then the caller creates the row in a separate statement with no transaction, row lock, or DB-level counter. Under concurrency, N requests all read used<limit before any commits and all proceed: a FREE workspace can exceed the 1000 hard run cap by ~the concurrency width, two concurrent invite-accepts can push a 2-seat workspace to 3 members, and parallel POST /v1/organizations can exceed freeWorkspacesPerOwner=1. The only unique constraint (workflowId+idempotencyKey; organizationId+userId) blocks duplicate keys, not total counts. Same-tenant, self-exploitable, bounded overshoot (a few extra runs/seats/workspaces, FREE seat overflow is a Stripe no-op or over-bills the customer rather than the platform) — genuine plan-limit bypass but LOW impact. Fix: wrap count+create in a serializable transaction (or use a conditional INSERT ... WHERE (SELECT count) < cap / a monotonic per-period counter column with a guarded UPDATE) so the second concurrent writer fails; re-check the cap after create and roll back on overflow.
- **Suggested fix:** Enforce caps atomically via a serializable transaction or a conditional/counter-based insert so concurrent writers cannot all pass the gate.

- [ ] Fixed (commit: \_\_\_\_)

### W5.26 — LOW / security

**Billing webhook signature verification depends on webhookSecret that silently defaults to empty string**

- **Location:** `apps/api/src/billing/stripe.service.ts:39-47,125-127; apps/api/src/billing/billing-webhook.controller.ts:51`
- **Problem:** webhookSecret defaults to '' when STRIPE_WEBHOOK_SECRET is unset. isConfigured() returns false (SPA hides billing) but the webhook controller does not consult it — it always calls constructWebhookEvent. There is no startup assertion that the secret is present when STRIPE_SECRET_KEY is set, so a misconfiguration (secret key present, webhook secret blank) leaves the endpoint failing signature verification on every real Stripe event, silently breaking subscription sync (workspaces never provisioned/downgraded) with only a warn log that is indistinguishable from attacker noise. One verifier noted the Stripe SDK computes HMAC with an empty key rather than hard-rejecting, raising a theoretical forge risk — but only under the same operator misconfiguration, so LOW. Defense-in-depth / ops-correctness gap gated on a deployment error, not a default-path bypass. Fix: fail fast at startup (env validation) when STRIPE_SECRET_KEY is set but STRIPE_WEBHOOK_SECRET is empty, and have the webhook controller return 503 (not 400) when partially configured so the misconfiguration is observable.
- **Suggested fix:** Add a startup assertion requiring STRIPE_WEBHOOK_SECRET whenever STRIPE_SECRET_KEY is set; return 503 from the webhook when partially configured.

- [ ] Fixed (commit: \_\_\_\_)
