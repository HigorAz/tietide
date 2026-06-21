import { z } from 'zod';
import { CONDITION_OPERATORS } from '../condition/grammar.js';
import { templatable } from './templatable.js';

export const httpRequestConfigSchema = z.object({
  // Accepts a literal HTTP method OR a `{{pill}}` template (editor fx toggle) —
  // a resolved pill validates against the inner enum at runtime.
  method: templatable(z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])),
  url: z.string().url(),
  headers: z.record(z.string()).optional(),
  body: z.unknown().optional(),
  timeout: z.number().positive().max(30000).optional(),
});

/** Structured form of the condition (the SPA builder UI). Optional + advisory:
 *  the worker only ever evaluates `condition`, so legacy string-only configs and
 *  hand-written advanced expressions keep working unchanged. */
export const conditionBuilderSchema = z.object({
  left: z.string().min(1),
  operator: z.enum(CONDITION_OPERATORS),
  right: z.string().min(1),
});

export const conditionalConfigSchema = z.object({
  condition: z.string().min(1),
  conditionBuilder: conditionBuilderSchema.optional(),
});

// Code-node INPUT keys become bare variable names inside the sandbox, so they
// must be valid JS identifiers and must not shadow the built-in `input`/`$nodes`
// or a handful of keywords that would make the variable unusable.
const CODE_INPUT_NAME_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const RESERVED_CODE_INPUT_NAMES = new Set<string>([
  'input',
  '$nodes',
  'return',
  'await',
  'const',
  'let',
  'var',
  'function',
  'this',
]);

/** True when `name` is usable as a Code-node input variable. */
export function isValidCodeInputName(name: string): boolean {
  return CODE_INPUT_NAME_RE.test(name) && !RESERVED_CODE_INPUT_NAMES.has(name);
}

export const codeConfigSchema = z.object({
  code: z.string().min(1).max(10000),
  language: z.enum(['javascript']).default('javascript'),
  // Map of variable name → data-pill expression. Each key is exposed as a bare
  // variable in the sandbox; values are template strings resolved before exec
  // (so the resolved value may be any JSON type at run time).
  inputs: z
    .record(z.string())
    .optional()
    .superRefine((inputs, ctx) => {
      if (!inputs) return;
      for (const key of Object.keys(inputs)) {
        if (!isValidCodeInputName(key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Invalid input variable name "${key}"`,
            path: [key],
          });
        }
      }
    }),
});

export const cronConfigSchema = z.object({
  expression: z
    .string()
    .min(1)
    .regex(/^[\d*,\-/\s]+$/, 'Invalid cron expression'),
});

export const webhookConfigSchema = z.object({
  path: z.string().min(1).max(255).optional(),
});

export const ITERATOR_MAX_ITEMS_DEFAULT = 1000;

export const iteratorConfigSchema = z.object({
  arrayPath: z.string().min(1),
  continueOnError: z.boolean().default(false),
  maxItems: z.number().int().positive().max(ITERATOR_MAX_ITEMS_DEFAULT).optional(),
});

export const subworkflowConfigSchema = z.object({
  workflowId: z.string().uuid(),
  // Map of trigger-input keys to data-pill expressions. The runner template-
  // resolves the whole config before the node executes, so at execution time
  // the resolved value of any single-token data pill could be any JSON type
  // (string / number / object / array). Validation is permissive on the
  // value side; the SPA enforces string templates at save time.
  inputMapping: z.record(z.unknown()).default({}),
});

export const returnConfigSchema = z.object({
  value: z.string().optional(),
});
