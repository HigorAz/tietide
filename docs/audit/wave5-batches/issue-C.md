> Part of the **2026-06-11 adversarial audit (Wave 5)**. Full tracker: `docs/audit/AUDIT-2026-06-11.md`. Findings here survived independent adversarial verification.

**4 findings** in this batch. Fix each via TDD (failing regression test first → minimal fix → atomic commit, one finding = one commit). Branch: `feature/audit-wave5-remediation` (or a fresh branch off it).

> ⚠️ Repo gotchas: the husky pre-commit hook is broken (`Exec format error`) — run `npx lint-staged` then `git commit --no-verify`. Never run tests/migrations against `localhost:5432` (production Postgres). Build `@tietide/shared`+`@tietide/sdk`+`@tietide/crypto` before `tsc --noEmit`. No `Co-Authored-By: Claude` trailer.

---

### W5.20 — MEDIUM / security

**Workspace deletion cascade-wipes the audit trail and the deletion event itself is never logged (FK-violation swallowed)**

- **Location:** `apps/api/prisma/schema.prisma:491; apps/api/src/organizations/organizations.service.ts:102-116; apps/api/src/audit/audit-log.service.ts:112-131`
- **Problem:** AuditLog.organization is declared onDelete: Cascade, so organizations.service.remove() → prisma.organization.delete() cascade-deletes every audit_logs row for that org, destroying the workspace's complete who-did-what history. Worse, the org.delete audit entry written immediately afterward references the just-deleted org id; the FK no longer exists, so the INSERT FK-violates, and because AuditLogService.log() is fire-and-forget with a swallowed .catch(), the failure is silently dropped. Net: a SUPERADMIN deleting their workspace erases its audit trail and the deletion event itself is never recorded. No cross-tenant access or privilege escalation (self-service on one's own workspace, and deleting a workspace deleting its data is partly intended), so the security-relevant defect is the missing non-repudiation record for a destructive admin action — verifiers downgraded HIGH→MEDIUM. Fix: change the relation to onDelete: SetNull (or denormalize organizationId as a plain string) so audit history survives, write the org.delete entry BEFORE the delete (or in the same transaction with org null), and make security-event audit writes awaited/transactional.
- **Suggested fix:** Set AuditLog.organization to SetNull (or denormalize the column), write the org.delete audit row before the delete in a transaction, and make security-event audit writes awaited rather than fire-and-forget.

- [ ] Fixed (commit: \_\_\_\_)

### W5.21 — MEDIUM / security

**Critical auth security events (login, password change/reset, logout, verify) are not audited**

- **Location:** `apps/api/src/auth/auth.service.ts:109-262; apps/api/src/auth/account.service.ts:61-90`
- **Problem:** Only account deletion and org role change are audited. AuthService.login (success and failure), resetPassword (sets password + bumps tokenVersion), logout/revoke-all (bumps tokenVersion), verifyEmail, and AccountService.changePassword (changes password + revokes all sessions) write nothing to the audit log — AuthService does not even inject AuditLogService. There is therefore no record of failed-login bursts (credential stuffing), password changes, or session-revocation events, so an account takeover leaves no audit trace of the takeover-relevant actions, violating the CLAUDE.md §10 audit-completeness mandate. The audit infrastructure is otherwise mature and broadly used, and AuditLogEntry.organizationId is documented as optional precisely for account-level (auth) events — so this was designed-for but never wired. Detective-control gap (no data exposure / no auth bypass); @Throttle and pino request logs are partial mitigations but do not produce structured, admin-queryable records. Fix: inject AuditLogService into AuthService/AccountService and emit account-level entries (no organizationId) for login success, login failure (email only, never password), password change, password reset, and logout/revoke-all.
- **Suggested fix:** Emit account-level audit entries for login success/failure, password change, password reset, and session revoke-all.

- [ ] Fixed (commit: \_\_\_\_)

### W5.22 — MEDIUM / correctness

**Security-event audit writes are fire-and-forget with swallowed errors — DB failure silently drops the record; no integrity protection**

- **Location:** `apps/api/src/audit/audit-log.service.ts:112-131`
- **Problem:** AuditLogService.log() kicks off prisma.auditLog.create() without awaiting it, attaches a .catch() that only logs a warning, and returns Promise.resolve() immediately — so even callers that `await` it (e.g. account.delete) do not actually wait for the DB write. Any transient DB error, FK violation (W5.20), or process crash between request completion and the async insert means the security event is simply not recorded, with no surfacing and no retry. There is also no integrity protection (append-only constraint / tamper-evident hash chain), so a DB-level actor could edit or delete rows undetected. The non-fatal design is intentional and tested for low-value events, but it is applied uniformly to security-critical events. Not attacker-triggerable on its own (verifiers split MEDIUM/IMPROVEMENT), but a real audit-durability gap. Fix: for security-critical classes (auth, account deletion, role change, org deletion) make the audit write awaited and part of the same transaction as the mutation so action+record commit atomically; keep fire-and-forget only for low-value/high-volume events; consider an append-only constraint and hash chain for the audit table.
- **Suggested fix:** Make security-critical audit writes awaited and transactional with their mutation; add an append-only/hash-chain integrity control for the audit table.

- [ ] Fixed (commit: \_\_\_\_)

### W5.53 — IMPROVEMENT / efficiency

**Audit filter-value dropdowns do a full distinct scan of audit_logs on unindexed action/resource columns**

- **Location:** `apps/api/src/audit/audit-log.service.ts:179-205; apps/api/prisma/schema.prisma:494-495`
- **Problem:** listFilterValues() issues prisma.auditLog.findMany({ distinct: ['action'] }) and distinct: ['resource'], and buildWhere applies action/resource equality filters, but AuditLog has only composite indexes on (organizationId, createdAt) and (userId, createdAt) — no index on action or resource. On a large audit table a DISTINCT over an unindexed column forces a full table scan each time an admin opens the filter dropdowns (the FILTER_VALUES_CAP=200 caps returned rows, not the scan). Admin-only path (low frequency), low-cardinality enum columns, and negligible at MVP scale — verifiers rated IMPROVEMENT. Efficiency/scalability gap, not a security bug. Fix: add indexes on AuditLog(action) and AuditLog(resource) (or a covering index), or precompute/cache the distinct filter-value sets.
- **Suggested fix:** Add indexes on AuditLog(action) and AuditLog(resource) (or precompute/cache the distinct filter values).

- [ ] Fixed (commit: \_\_\_\_)
