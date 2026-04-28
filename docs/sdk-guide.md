# TieTide — SDK Guide: Building a New Node Type

How to add a new connector (trigger, action, or logic node) to TieTide. The SDK contract that this guide implements is documented in [`docs/claude/sdk-contract.md`](claude/sdk-contract.md); this file covers the **process**.

> The SDK lives in `packages/sdk` and is **frozen after Sprint S4** ([CLAUDE.md §11](../CLAUDE.md#11-product-stability-contract)). Method signatures on `INodeExecutor`, `NodeInput`, `NodeOutput`, and `ExecutionContext` cannot change without a major-version bump.

---

## 1. The contract

Every node type implements one interface from `@tietide/sdk`:

```typescript
// packages/sdk/src/interfaces/node.interface.ts
export interface INodeExecutor {
  readonly type: string; // unique stable id, kebab-case (e.g. 'send-email')
  readonly name: string; // human-readable label for the SPA library
  readonly description: string; // one-line description shown on hover
  readonly category: 'trigger' | 'action' | 'logic';

  execute(input: NodeInput, context: ExecutionContext): Promise<NodeOutput>;
}
```

The runtime hands the executor:

```typescript
interface NodeInput {
  data: Record<string, unknown>; // outputs from upstream nodes
  params: Record<string, unknown>; // user-configured params from the workflow JSON
  credentials?: Record<string, string>; // pre-resolved decrypted secrets
}

interface ExecutionContext {
  executionId: string;
  workflowId: string;
  nodeId: string;
  logger: Logger; // pino-style structured logger
  getSecret(name: string): Promise<string>; // pull a decrypted secret on demand
}
```

And expects back:

```typescript
interface NodeOutput {
  data: Record<string, unknown>; // becomes input.data for the next node
  metadata?: { statusCode?: number; duration?: number; [k: string]: unknown };
}
```

That is the whole contract. No magic, no DI, no NestJS in the signature — `packages/sdk` has zero runtime dependencies on apps so a third-party developer can build a node in their own repo.

---

## 2. Pick the right base class

`@tietide/sdk` exports two convenience base classes that wrap `execute()` with `validate → run → transform`. Use them unless you have a reason not to:

| Base class                                  | Use it for                                                              | Sets `category` to |
| ------------------------------------------- | ----------------------------------------------------------------------- | ------------------ |
| `BaseTrigger`                               | Manual / cron / webhook starters                                        | `'trigger'`        |
| `BaseAction`                                | Anything that does work (HTTP, send email, write to DB)                 | `'action'`         |
| _none — implement `INodeExecutor` directly_ | Logic nodes (`if`, `switch`) that need full control of the return shape | `'logic'`          |

The reference implementations in the repo are good starting points:

- Triggers — `apps/worker/src/nodes/triggers/manual-trigger.ts`, `cron-trigger.ts`
- Actions — `apps/worker/src/nodes/actions/http-request.ts`
- Logic — `apps/worker/src/nodes/logic/conditional.ts`

`HttpRequestAction` does **not** extend `BaseAction` because it needs to control the AbortController and metadata shape — that is a legitimate reason to drop the base class. Don't drop it for style.

---

## 3. The five-step recipe

We will add a fictional `delay` action — sleeps for a configurable number of milliseconds, then passes input data through.

### Step 3.1 — Add the type constant

```typescript
// packages/shared/src/types/node.types.ts
export const NodeType = {
  // ... existing types
  DELAY: 'delay',
} as const;
```

The string value is the `type` field on `INodeExecutor`. Once a workflow stores `"type": "delay"`, that string is forever — picking a bad name now means a migration later.

### Step 3.2 — Write the test FIRST (RED)

[CLAUDE.md §9](../CLAUDE.md#9-testing-strategy-tdd) is non-negotiable: minimum three tests per node — happy path, error case, edge case.

```typescript
// apps/worker/src/nodes/actions/delay.spec.ts
import type { ExecutionContext, NodeInput } from '@tietide/sdk';
import { DelayAction } from './delay';

const makeContext = (): ExecutionContext => ({
  executionId: 'exec-1',
  workflowId: 'wf-1',
  nodeId: 'node-1',
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  getSecret: jest.fn(async () => 'secret'),
});

const makeInput = (
  params: Record<string, unknown>,
  data: Record<string, unknown> = {},
): NodeInput => ({ data, params });

describe('DelayAction', () => {
  describe('execute', () => {
    it('should sleep for the configured duration and pass data through', async () => {
      jest.useFakeTimers();
      const action = new DelayAction();
      const promise = action.execute(makeInput({ ms: 500 }, { foo: 'bar' }), makeContext());

      jest.advanceTimersByTime(500);
      const out = await promise;
      jest.useRealTimers();

      expect(out.data).toEqual({ foo: 'bar' });
      expect(out.metadata?.duration).toBeGreaterThanOrEqual(500);
    });

    it('should reject non-positive durations', async () => {
      const action = new DelayAction();
      await expect(action.execute(makeInput({ ms: -1 }), makeContext())).rejects.toThrow(
        /positive/,
      );
    });

    it('should clamp durations above the safety ceiling', async () => {
      const action = new DelayAction();
      await expect(
        action.execute(makeInput({ ms: 10 * 60 * 1000 }), makeContext()),
      ).rejects.toThrow(/maximum/);
    });
  });
});
```

Run it — the test must fail because the file doesn't exist yet:

```bash
pnpm --filter @tietide/worker test delay
```

### Step 3.3 — Implement (GREEN)

```typescript
// apps/worker/src/nodes/actions/delay.ts
import { Injectable } from '@nestjs/common';
import { BaseAction } from '@tietide/sdk';
import type { ExecutionContext, NodeInput } from '@tietide/sdk';

const MAX_DELAY_MS = 5 * 60 * 1000; // 5 minutes — workflow-engine ceiling

@Injectable()
export class DelayAction extends BaseAction {
  readonly type = 'delay';
  readonly name = 'Delay';
  readonly description = 'Pauses execution for a configurable duration before continuing';

  protected validate(input: NodeInput): void {
    const ms = input.params.ms;
    if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) {
      throw new Error('Delay requires a positive numeric "ms" parameter');
    }
    if (ms > MAX_DELAY_MS) {
      throw new Error(`Delay exceeds the maximum of ${MAX_DELAY_MS}ms`);
    }
  }

  protected async run(
    input: NodeInput,
    _context: ExecutionContext,
  ): Promise<Record<string, unknown>> {
    const ms = input.params.ms as number;
    const started = Date.now();
    await new Promise<void>((resolve) => setTimeout(resolve, ms));
    return { ...input.data, _delay: { ms, duration: Date.now() - started } };
  }

  protected transform(result: Record<string, unknown>): {
    data: Record<string, unknown>;
    metadata?: { duration?: number };
  } {
    const delay = result._delay as { duration: number } | undefined;
    return {
      data: result,
      metadata: { duration: delay?.duration },
    };
  }
}
```

Run the tests again — they must pass:

```bash
pnpm --filter @tietide/worker test delay
```

### Step 3.4 — Register in the worker

Two registrations are needed. Both live in `apps/worker/src/`:

1. **Provide it in the engine module** so NestJS DI can construct it (look at how `HttpRequestAction` is wired in `apps/worker/src/engine/engine.module.ts`).
2. **Register it in the `NodeRegistry`** so the runner can look it up by `type` string. The registry (`apps/worker/src/nodes/registry.ts`) is populated on bootstrap; follow the existing pattern (typically in `engine.service.ts` or a dedicated `node-bootstrap.service.ts`).

```typescript
// excerpt — adjust to match the existing wiring
constructor(
  private readonly registry: NodeRegistry,
  private readonly delay: DelayAction,
) {}

onModuleInit() {
  this.registry.register(this.delay);
}
```

A failing `pnpm --filter @tietide/worker test registry` test will catch a forgotten registration — `registry.spec.ts` already iterates over the expected node types.

### Step 3.5 — Surface it in the SPA

The frontend needs three things to render and configure the node:

1. **Icon** — add a Lucide icon to `apps/spa/src/components/nodes/nodeIcons.ts` keyed by `NodeType.DELAY`.
2. **Library entry** — add a card to the node-library sidebar (look at how the existing six types are listed).
3. **Config form** — render the `params` schema in `NodeConfigPanel`. For simple cases (one numeric input), copy a similar existing form; for complex shapes, render fields conditionally on `nodeType`.

The `WorkflowDefinition` JSON contract (`packages/shared/src/types/workflow.types.ts`) is what the SPA serializes — once the SPA writes `"type": "delay"` and `"config": { "ms": 1000 }` into a workflow, the worker side already knows what to do.

---

## 4. Test the end-to-end flow

A node passes its unit tests but fails in production for one of two reasons:

1. **Missing registration** — the runner can't `resolve()` the type. Workflow execution fails with `Unknown node type: delay`.
2. **Schema drift** — the SPA and worker disagree on what `config` looks like. The runner throws on `validate()`.

Catch both with an integration test in `apps/worker/src/processors/workflow.processor.spec.ts` (or a new file) that posts a real `WorkflowDefinition` with a `delay` node and asserts the resulting `WorkflowExecution` rows are `SUCCEEDED`.

---

## 5. Security checklist for new nodes

Before opening the PR, verify against [CLAUDE.md §10](../CLAUDE.md#10-security-mandate):

- [ ] **Input validation in `validate()`** — never trust `input.params`. Reject before any external call.
- [ ] **Secrets via `context.getSecret()`** — never read `input.params.password` or `input.credentials` directly when the value is sensitive. The context method goes through the secret store and decrypts on demand.
- [ ] **No `eval()`, `Function()`, `vm.runInThisContext()`** — code-execution nodes must stay in the sandboxed `CodeAction` (currently disabled for MVP).
- [ ] **No `console.log`** — use `context.logger`. The logger redacts the standard secret-shaped fields (passwords, tokens) automatically.
- [ ] **Outbound URL allow-listing for HTTP-shaped nodes** — at minimum, reject `localhost`, `127.0.0.1`, link-local, and metadata IPs (169.254.169.254) to prevent SSRF.
- [ ] **Timeouts on every external call** — match the pattern in `HttpRequestAction` (default 30 s, parameterizable, hard cap below the worker-job timeout).
- [ ] **No secrets in returned `data`** — the output is persisted to `ExecutionStep.outputData` and visible in the SPA execution history. Sanitize before returning.
- [ ] **Errors don't leak internals** — `throw new Error('Stripe API returned 401')`, not `throw new Error(stripeResponseObject)`.

The post-edit hook (`.claude/hooks/post-edit-lint.sh`) catches `console.log`, `eval()`, and `: any`, but it cannot reason about SSRF or secret leakage — those remain a manual review.

---

## 6. Versioning and breaking changes

Follow [CLAUDE.md §11](../CLAUDE.md#11-product-stability-contract):

- **Adding a new node type** — non-breaking, safe at any time.
- **Changing the `type` string** — breaking for every workflow that references it. Treat as a major version bump and provide a migration script that rewrites stored workflows.
- **Adding a required `params` field** — breaking for existing saved workflows. Either make it optional with a default or write a migration that backfills.
- **Removing or renaming a `params` field** — breaking. Same rules as above.

The `WorkflowDefinition` JSON is part of the public contract because saved workflows are persisted blobs the engine has to keep understanding forever.

---

## 7. Where to file issues

- **SDK contract questions** (interface signatures, base classes) — `packages/sdk` is the source of truth, not this guide. Contradictions: trust the code.
- **Runtime questions** (registry, queue, retries) — see [`docs/claude/services.md`](claude/services.md) and the `apps/worker` source.
- **Frontend rendering questions** — see `apps/spa/src/components/nodes/`.

A new connector is small enough that one PR usually contains: the node + spec, the registry wiring, the icon, and the config form. Larger PRs are a smell — split them.
