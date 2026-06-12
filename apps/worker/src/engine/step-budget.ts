// W5.16 — engine-enforced per-execution step budget.
//
// MAX_RECURSION_DEPTH caps nesting at 5 and the iterator caps each level at 1000
// items, but these compose MULTIPLICATIVELY: a tiny saved definition that nests an
// iterator (or subworkflow) per level can fan out to ~1000^5 sequential child
// WorkflowExecution rows / ExecutionStep rows from a single top-level run. The FREE
// hardRunCap is only checked at the START of a top-level run, never re-checked
// mid-execution, so one in-flight run can vastly exceed quota and flood the DB /
// saturate worker slots, degrading shared infra for every tenant.
//
// The depth cap and the per-iterator item cap are insufficient on their own. We add
// a single GLOBAL budget shared across the entire parent->child execution tree of one
// top-level run: every node the runner actually processes (records a step for, or
// recurses into) consumes one unit. When the budget is exhausted the run aborts with
// a non-retryable structural error (retrying a definition that is too large will
// always fail), independent of depth and the per-iterator caps.

const DEFAULT_MAX_EXECUTION_STEPS = 50_000;

/**
 * Thrown when an execution tree processes more nodes/steps than the configured
 * global budget. Structural (the definition is too large / fans out too far), so
 * it is non-retryable — a BullMQ retry of the same definition would re-hit the cap.
 */
export class StepBudgetExceededError extends Error {
  constructor(max: number) {
    super(
      `Execution step budget (${max}) exceeded. The workflow processed too many ` +
        `nodes — nested iterators/subworkflows fanned out beyond the per-execution ` +
        `limit. Reduce iteration counts or nesting depth.`,
    );
    this.name = 'StepBudgetExceededError';
  }
}

// Resolved once per top-level run; an explicit setMaxExecutionSteps override (used by
// tests) takes precedence. A non-positive / unparseable value falls back to the
// default so a misconfigured env can never disable the guard.
let overrideMax: number | undefined;

export function setMaxExecutionSteps(max: number | undefined): void {
  overrideMax = max;
}

export function resolveMaxExecutionSteps(): number {
  if (typeof overrideMax === 'number' && overrideMax > 0) return overrideMax;
  const raw = process.env.MAX_EXECUTION_STEPS;
  if (raw !== undefined) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_MAX_EXECUTION_STEPS;
}

/**
 * A mutable per-execution-tree counter. Created once at the top-level run (depth 0)
 * and passed by reference into every iterator/subworkflow child so the whole tree
 * shares one budget. `consume()` increments and throws once the cap is crossed.
 */
export class StepBudget {
  private used = 0;

  constructor(readonly max: number = resolveMaxExecutionSteps()) {}

  /**
   * Charge one unit of work to the budget. Throws StepBudgetExceededError once the
   * cumulative count would exceed the cap, aborting the run before the offending
   * step is recorded.
   */
  consume(): void {
    this.used += 1;
    if (this.used > this.max) {
      throw new StepBudgetExceededError(this.max);
    }
  }

  get consumed(): number {
    return this.used;
  }
}
