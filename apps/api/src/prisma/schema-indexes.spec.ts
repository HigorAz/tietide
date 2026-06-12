import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Index hygiene guard (W3.4). These composite indexes back hot sweep queries
 * that would otherwise table-scan as data grows. Encoded as a schema regression
 * test because index changes have no behavioural test surface.
 */
describe('schema.prisma index coverage (W3.4)', () => {
  const schema = readFileSync(join(__dirname, '../../prisma/schema.prisma'), 'utf8');

  function modelBlock(name: string): string {
    const match = schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`));
    expect(match).not.toBeNull();
    return match![0];
  }

  it('indexes Connection by (status, expiresAt) for the OAuth refresh-scan sweep', () => {
    // oauth-refresh-scan.processor: where { status: ACTIVE, expiresAt: { lt } }
    expect(modelBlock('Connection')).toContain('@@index([status, expiresAt])');
  });

  it('indexes Workflow by (isActive) for the worker cron/poll active-workflow sweeps', () => {
    // cron-trigger.service / poll-scheduler.service: where { isActive: true }
    expect(modelBlock('Workflow')).toContain('@@index([isActive])');
  });

  it('keeps the ExecutionStep (executionId) index that serves its only query', () => {
    expect(modelBlock('ExecutionStep')).toContain('@@index([executionId])');
  });

  it('indexes AuditLog by (action, resource) for the filter-dropdown distinct sweeps (W5.53)', () => {
    // audit-log.service.listFilterValues: SELECT DISTINCT action / resource over
    // audit_logs (not org-scoped) — unindexed otherwise → full table scan.
    expect(modelBlock('AuditLog')).toContain('@@index([action, resource])');
  });

  it('retains AuditLog rows on workspace deletion via onDelete: SetNull (W5.20)', () => {
    // Deleting a workspace must NOT cascade-wipe its forensic audit trail. The
    // organization relation nulls organization_id instead of deleting the row.
    const block = modelBlock('AuditLog');
    const relation = block.match(/organization\s+Organization\?\s+@relation\([^)]*\)/);
    expect(relation).not.toBeNull();
    expect(relation![0]).toContain('onDelete: SetNull');
    expect(relation![0]).not.toContain('onDelete: Cascade');
  });
});
