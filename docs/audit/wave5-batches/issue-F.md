> Part of the **2026-06-11 adversarial audit (Wave 5)**. Full tracker: `docs/audit/AUDIT-2026-06-11.md`. Findings here survived independent adversarial verification.

**4 findings** in this batch. Fix each via TDD (failing regression test first → minimal fix → atomic commit, one finding = one commit). Branch: `feature/audit-wave5-remediation` (or a fresh branch off it).

> ⚠️ Repo gotchas: the husky pre-commit hook is broken (`Exec format error`) — run `npx lint-staged` then `git commit --no-verify`. Never run tests/migrations against `localhost:5432` (production Postgres). Build `@tietide/shared`+`@tietide/sdk`+`@tietide/crypto` before `tsc --noEmit`. No `Co-Authored-By: Claude` trailer.

---

### W5.41 — LOW / correctness

**Workflow list cursor 'v' can be a non-date string, causing a raw 500 via Invalid Date in Prisma**

- **Location:** `apps/api/src/workflows/workflows.service.ts:163-177; apps/api/src/common/pagination/cursor.ts:40-50`
- **Problem:** decodeKeysetCursor accepts `v` as string OR number with no date-format check, and WorkflowsService.list uses it as `new Date(cursor.v as string)`. A validly-base64url-encoded cursor like {"v":"notadate","id":"<uuid>"} yields Invalid Date, which Prisma's { lt: Invalid Date } filter rejects with a non-HttpException, so GlobalExceptionFilter returns a generic 500 instead of a 400 'Invalid cursor'. No stack/message leak (the filter hardcodes the generic message) and auth-gated, so it is a robustness/correctness gap (wrong status code on deliberately malformed input), not a security or DoS vector. Fix: in WorkflowsService.list, validate the decoded date (reject NaN with BadRequestException 'Invalid cursor'), mirroring executions/cursor.ts which already guards Number.isNaN(createdAt.getTime()).
- **Suggested fix:** Validate the decoded cursor date in WorkflowsService.list and throw BadRequestException('Invalid cursor') on NaN, matching the executions cursor guard.

- [ ] Fixed (commit: \_\_\_\_)

### W5.42 — LOW / efficiency

**All-executions offset pagination 'page' has no maximum cap (deep-offset query cost)**

- **Location:** `apps/api/src/executions/dto/all-executions-query.dto.ts:44-49; apps/api/src/executions/executions.service.ts:424-435`
- **Problem:** AllExecutionsQueryDto.page is validated @IsInt() @Min(1) but has no @Max, while pageSize and limit are both capped at 100. In the non-cursor branch, skip = (page-1)\*pageSize is passed straight to Prisma findMany({ skip }), so page=100000000 produces a massive OFFSET. The query is org-scoped, so Postgres only skips the caller's own matching rows and the cost is bounded by the org's row count (the attacker's own already-accessible data) — no cross-tenant exposure or amplification, hence a consistency/robustness gap rather than a DoS. Fix: add @Max(...) to page (cap so skip stays bounded) or require cursor pagination beyond a small page ceiling.
- **Suggested fix:** Add @Max to the page param (or require the cursor path beyond a small page ceiling) so the offset stays bounded.

- [ ] Fixed (commit: \_\_\_\_)

### W5.46 — IMPROVEMENT / security

**triggerData persisted to JSONB without prototype-pollution sanitization (config is sanitized, triggerData is not)**

- **Location:** `apps/api/src/webhooks/webhooks.service.ts:135-148; apps/api/src/executions/dto/trigger-execution.dto.ts:10-12; apps/api/src/executions/dto/test-execution.dto.ts:22-24`
- **Problem:** Node config is defended at the boundary by @IsSafeNodeConfig() (rejects **proto**/constructor/prototype, bounds depth), but triggerData on manual/test/node-test DTOs and the webhook-parsed body have no equivalent check — parseBody does a raw JSON.parse and stores the result directly into WorkflowExecution.triggerData JSONB and forwards it to the worker. JSON.parse produces an inert own-property named **proto** (no prototype mutation), the runtime template engine is hardened (FORBIDDEN_SEGMENTS + hasOwnProperty), and the worker assigns triggerData by reference with no deep-merge, so there is no current pollution/RCE path — verifiers split CONFIRMED-LOW / REFUTED-IMPROVEMENT (defense-in-depth, not a live exploit). The asymmetry means dangerous keys round-trip through the DB into any future consumer that deep-merges/walks the payload. Fix: apply findUnsafeConfigIssue/@IsSafeNodeConfig to triggerData DTOs and run the shared walker over the parsed webhook body in parseBody before persisting/enqueuing (reject or strip dangerous keys).
- **Suggested fix:** Run the shared findUnsafeConfigIssue walker over triggerData (manual/test DTOs and webhook parseBody) before persisting/enqueuing.

- [ ] Fixed (commit: \_\_\_\_)

### W5.48 — IMPROVEMENT / security

**Workflow definition nodes/edges arrays have no element-count cap**

- **Location:** `apps/api/src/workflows/dto/workflow-definition.dto.ts:107-122; packages/shared/src/schemas/workflow.schema.ts:95-102`
- **Problem:** Neither the DTO (nodes/edges have only @IsArray() @ValidateNested) nor the Zod schema (z.array(...) with no .max()) caps the number of nodes or edges; the only bound is the 1mb body limit (~10k minimal elements). Each save/test runs O(n) nested class-validator, the recursive findUnsafeConfigIssue walk, and Kahn's topological sort synchronously on the event loop. All operations are linear (no quadratic blowup), the endpoints are auth/role-gated and throttled, and the 1mb body cap is itself a hard bound, so the worst case is a few-ms synchronous pass — verifiers downgraded toward IMPROVEMENT. This is the API-boundary counterpart to the engine-side fan-out cap in W5.16 and is a missing defense-in-depth length cap per CLAUDE.md §10. Fix: add @ArrayMaxSize(N) (e.g. 500) to nodes and edges in the DTO and a matching .max(N) on the Zod arrays so both the HTTP and save boundaries reject oversized graphs.
- **Suggested fix:** Add @ArrayMaxSize on the DTO nodes/edges and .max() on the Zod arrays (e.g. 500 nodes / 400 edges).

- [ ] Fixed (commit: \_\_\_\_)
