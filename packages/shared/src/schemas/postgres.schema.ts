import { z } from 'zod';

const connectionId = z.string().uuid();
const mockOnDryRun = z.boolean().optional();

// Maximum query and parameter sizes — defence-in-depth alongside driver-level
// parameterization. The driver itself prevents SQL injection when using
// pg.query(text, values), but capping size limits memory exhaustion vectors
// from malicious workflow definitions.
export const POSTGRES_MAX_QUERY_LENGTH = 10_000;
export const POSTGRES_MAX_PARAMS = 50;
export const POSTGRES_MAX_PARAM_LENGTH = 10_000;
export const POSTGRES_MAX_ROW_LIMIT = 10_000;
export const POSTGRES_DEFAULT_ROW_LIMIT = 1_000;

const PostgresParam = z.union([
  z.string().max(POSTGRES_MAX_PARAM_LENGTH),
  z.number(),
  z.boolean(),
  z.null(),
]);

// SQL hardening: reject patterns that bypass parameterization or attempt
// multi-statement / comment-injection attacks. These checks are NOT a substitute
// for driver-level parameterization — the action ALWAYS uses pg.query(text, values).
// They reject obviously dangerous queries early so a confused user can't accidentally
// concat user input into the query string.
function validatePostgresQuery(value: { query: string; params?: unknown[] }, ctx: z.RefinementCtx) {
  const q = value.query;

  // 1. Strip string literals (handles 'foo''bar' escape and $tag$...$tag$ blocks)
  //    so subsequent checks ignore content inside legitimate strings.
  const stripped = stripPgStringLiterals(q);

  // 2. Reject SQL line/block comments — common injection vector.
  if (/--/.test(stripped) || /\/\*/.test(stripped)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'query must not contain SQL comments (-- or /*)',
      path: ['query'],
    });
    return;
  }

  // 3. Reject multi-statement queries: ';' anywhere except a single trailing one.
  const trimmed = stripped.replace(/;\s*$/, '');
  if (trimmed.includes(';')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'query must contain a single statement (no embedded semicolons)',
      path: ['query'],
    });
    return;
  }

  // 4. Reject template-literal interpolation patterns. A correctly written
  //    parameterized query never contains ${...} since variables go via $1..$N.
  if (/\$\{/.test(stripped)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'query must not contain template-literal interpolation (${…})',
      path: ['query'],
    });
    return;
  }

  // 5. Placeholder count must equal params length.
  const placeholderCount = countPgPlaceholders(stripped);
  const paramCount = value.params?.length ?? 0;
  if (placeholderCount !== paramCount) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `placeholder count ($1..$N) is ${placeholderCount} but params has ${paramCount} entries`,
      path: ['params'],
    });
  }
}

function stripPgStringLiterals(q: string): string {
  // Replace single-quoted strings (with '' escaping) and dollar-quoted strings
  // ($tag$...$tag$) with single spaces so length and rough structure are preserved.
  let out = '';
  let i = 0;
  while (i < q.length) {
    const c = q[i];
    if (c === "'") {
      // single-quoted; advance until matching unescaped '
      i++;
      while (i < q.length) {
        if (q[i] === "'" && q[i + 1] === "'") {
          i += 2;
          continue;
        }
        if (q[i] === "'") {
          i++;
          break;
        }
        i++;
      }
      out += "''";
      continue;
    }
    if (c === '$') {
      // dollar-quoted: $tag$ ... $tag$
      const tagMatch = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(q.slice(i));
      if (tagMatch) {
        const tag = tagMatch[0];
        const closeIdx = q.indexOf(tag, i + tag.length);
        if (closeIdx !== -1) {
          i = closeIdx + tag.length;
          out += "''";
          continue;
        }
      }
    }
    out += c;
    i++;
  }
  return out;
}

function countPgPlaceholders(q: string): number {
  // Count distinct $N placeholders. Use the highest N seen — Postgres allows
  // duplicates ($1 referenced twice) and the param array length must equal max N.
  const matches = q.match(/\$\d+/g);
  if (!matches) return 0;
  let max = 0;
  for (const m of matches) {
    const n = Number.parseInt(m.slice(1), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

export const postgresRunQueryConfigSchema = z
  .object({
    connectionId,
    query: z.string().min(1).max(POSTGRES_MAX_QUERY_LENGTH),
    params: z.array(PostgresParam).max(POSTGRES_MAX_PARAMS).optional(),
    rowLimit: z
      .number()
      .int()
      .min(1)
      .max(POSTGRES_MAX_ROW_LIMIT)
      .default(POSTGRES_DEFAULT_ROW_LIMIT),
    mockOnDryRun,
  })
  .superRefine(validatePostgresQuery);
export type PostgresRunQueryConfig = z.infer<typeof postgresRunQueryConfigSchema>;
