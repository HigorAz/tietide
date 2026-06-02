/**
 * Narrowly detects a Prisma unique-constraint violation (error code `P2002`)
 * without importing the Prisma runtime error class — so it matches both real
 * `PrismaClientKnownRequestError` instances and the plain `{ code: 'P2002' }`
 * shape used in unit tests.
 *
 * Used by the cron/poll processors to make their read-then-create idempotency
 * checks safe under concurrency: when a second tick races to the
 * `@@unique([workflowId, idempotencyKey])` constraint, the loser catches P2002
 * and treats the row as an already-handled duplicate instead of crashing the tick.
 */
export function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 'P2002'
  );
}
