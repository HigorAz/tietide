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
});
