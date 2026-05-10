import { z } from 'zod';

const connectionId = z.string().uuid();
const mockOnDryRun = z.boolean().optional();

export const MYSQL_MAX_QUERY_LENGTH = 10_000;
export const MYSQL_MAX_PARAMS = 50;
export const MYSQL_MAX_PARAM_LENGTH = 10_000;
export const MYSQL_MAX_ROW_LIMIT = 10_000;
export const MYSQL_DEFAULT_ROW_LIMIT = 1_000;

const MysqlParam = z.union([
  z.string().max(MYSQL_MAX_PARAM_LENGTH),
  z.number(),
  z.boolean(),
  z.null(),
]);

function validateMysqlQuery(value: { query: string; params?: unknown[] }, ctx: z.RefinementCtx) {
  const q = value.query;
  const stripped = stripMysqlStringLiterals(q);

  if (/--\s/.test(stripped) || /#/.test(stripped) || /\/\*/.test(stripped)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'query must not contain SQL comments (-- , #, or /*)',
      path: ['query'],
    });
    return;
  }

  const trimmed = stripped.replace(/;\s*$/, '');
  if (trimmed.includes(';')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'query must contain a single statement (no embedded semicolons)',
      path: ['query'],
    });
    return;
  }

  if (/\$\{/.test(stripped)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'query must not contain template-literal interpolation (${…})',
      path: ['query'],
    });
    return;
  }

  // MySQL uses ? placeholders. Count must equal params length.
  const placeholderCount = (stripped.match(/\?/g) ?? []).length;
  const paramCount = value.params?.length ?? 0;
  if (placeholderCount !== paramCount) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `placeholder count (?) is ${placeholderCount} but params has ${paramCount} entries`,
      path: ['params'],
    });
  }
}

function stripMysqlStringLiterals(q: string): string {
  // MySQL strings: '...' or "..."; both support backslash and doubled-quote escaping.
  let out = '';
  let i = 0;
  while (i < q.length) {
    const c = q[i];
    if (c === "'" || c === '"') {
      const quote = c;
      i++;
      while (i < q.length) {
        if (q[i] === '\\' && i + 1 < q.length) {
          i += 2;
          continue;
        }
        if (q[i] === quote && q[i + 1] === quote) {
          i += 2;
          continue;
        }
        if (q[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      out += "''";
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

export const mysqlRunQueryConfigSchema = z
  .object({
    connectionId,
    query: z.string().min(1).max(MYSQL_MAX_QUERY_LENGTH),
    params: z.array(MysqlParam).max(MYSQL_MAX_PARAMS).optional(),
    rowLimit: z.number().int().min(1).max(MYSQL_MAX_ROW_LIMIT).default(MYSQL_DEFAULT_ROW_LIMIT),
    mockOnDryRun,
  })
  .superRefine(validateMysqlQuery);
export type MysqlRunQueryConfig = z.infer<typeof mysqlRunQueryConfigSchema>;
