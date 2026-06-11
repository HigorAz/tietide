> Part of the **2026-06-11 adversarial audit (Wave 5)**. Full tracker: `docs/audit/AUDIT-2026-06-11.md`. Findings here survived independent adversarial verification.

**3 findings** in this batch. Fix each via TDD (failing regression test first → minimal fix → atomic commit, one finding = one commit). Branch: `feature/audit-wave5-remediation` (or a fresh branch off it).

> ⚠️ Repo gotchas: the husky pre-commit hook is broken (`Exec format error`) — run `npx lint-staged` then `git commit --no-verify`. Never run tests/migrations against `localhost:5432` (production Postgres). Build `@tietide/shared`+`@tietide/sdk`+`@tietide/crypto` before `tsc --noEmit`. No `Co-Authored-By: Claude` trailer.

---

### W5.15 — MEDIUM / efficiency

**No per-node or per-execution timeout in the engine — a single run can occupy a worker slot indefinitely (cross-tenant starvation)**

- **Location:** `apps/worker/src/engine/workflow-runner.ts:159-415; apps/worker/src/processors/workflow.processor.ts:19`
- **Problem:** The runner awaits each node's executor with no wall-clock budget and no engine-enforced per-node timeout, and the BullMQ processor sets no job timeout (BullMQ has none built in). Only http-request (30s) and code (<=30s) self-impose limits; database connectors set only connectTimeout (no statement_timeout/query_timeout), so SELECT pg_sleep(3600) / SELECT SLEEP(3600) blocks the slot for the full duration. With worker concurrency=5 on a single shared queue, five such concurrent runs starve the worker and queue all other tenants' executions indefinitely. Reachable by any authenticated user; availability-only impact. Fix: add an engine-level per-node timeout (wrap executor.execute in Promise.race with a configurable default, e.g. 60s) and an overall per-execution wall-clock cap; set DB-layer statement timeouts; configure BullMQ lockDuration/maxStalledCount and propagate an AbortSignal into connectors that support it.
- **Suggested fix:** Enforce a configurable per-node timeout (Promise.race) and an overall per-execution deadline in the engine; set statement_timeout on DB connectors and propagate AbortSignal where supported.

- [ ] Fixed (commit: \_\_\_\_)

### W5.16 — MEDIUM / correctness

**Unbounded node count plus nested iterator/subworkflow fan-out enables resource-exhaustion DoS**

- **Location:** `packages/shared/src/schemas/workflow.schema.ts:95-101; apps/worker/src/engine/workflow-runner.ts:283; iterator-executor.ts; subworkflow.ts`
- **Problem:** workflowDefinitionSchema declares nodes/edges as z.array(...) with no .max(), and the save boundary (assertExecutableDefinition) imposes no node-count cap. The engine creates at least one ExecutionStep row per node. Iterators cap at 1000 items and recursion at depth 5, but these compose multiplicatively: a tiny saved definition (~5-15 nodes) nesting an iterator/subworkflow per level can drive up to ~1000^5 sequential child WorkflowExecution rows/steps. The 1mb body limit blunts the flat-node repro but not the nested-iterator vector (the runtime blowup comes from a small definition). FREE hardRunCap is only checked at the START of a top-level run — never re-checked mid-execution — so one in-flight run can vastly exceed quota, and paid plans (hardRunCap=null) are entirely unbounded. Reachable by any authenticated user; DB-row flood + worker-slot saturation degrading shared infra. Fix: add .max(N) (e.g. 200 nodes, 400 edges) to the schema + @ArrayMaxSize on the DTO (rejected at save), and enforce a global per-execution step/child-execution budget in the engine that aborts with a non-retryable structural error when exceeded.
- **Suggested fix:** Cap nodes/edges arrays in both the Zod schema and DTO, and add a per-execution step/child-execution budget in the engine that aborts when exceeded, independent of the depth and per-iterator caps.

- [ ] Fixed (commit: \_\_\_\_)

### W5.34 — LOW / security

**DLQ persists raw trigger payloads (webhook bodies, PII, tokens) indefinitely without redaction**

- **Location:** `apps/worker/src/dlq/dlq.service.ts:52-57`
- **Problem:** publishFailed stores the full failed job — including payload.triggerData (the raw inbound webhook/provider request body, routinely PII and possibly bearer tokens/customer secrets) — into the dead-letter queue with removeOnComplete:false, removeOnFail:false, so records are retained forever. Unlike the execution-display/events path, the DLQ record is not run through the recursive payload redactor (CLAUDE.md §7), violating the data-minimization / 'secrets never persisted in the clear' stance. No API endpoint exposes the DLQ today, so exploitation requires direct Valkey/Redis access (an attacker already inside the infra), and the same unredacted triggerData is also persisted to Postgres — so this is a defense-in-depth/retention gap rather than a uniquely privileged disclosure. Fix: run triggerData through the existing recursive redactor before adding to the DLQ (and/or store only an executionId reference), and set a TTL/retention (removeOnComplete/Fail with age) on DLQ records.
- **Suggested fix:** Redact triggerData via the shared recursive redactor before DLQ persistence (or store only a reference), and add a TTL/retention bound to DLQ records.

- [ ] Fixed (commit: \_\_\_\_)
