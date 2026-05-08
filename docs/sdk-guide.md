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

---

## 8. Building a `BasePushTrigger` (provider posts to us)

Push triggers register a webhook with an external provider on workflow activation. Examples: Stripe payment events, GitHub issue updates, Slack messages.

**Structure (3 pieces):**

1. **The trigger class** in `apps/api/src/provider-triggers/triggers/<provider>-event-received.trigger.ts` — extends `BasePushTrigger`. Implements `onActivate`, `onDeactivate`, `verifySignature`. Lives in the API because all three lifecycle methods run there (activation when `isActive` flips, verification when the provider hits `/v1/provider-webhooks/...`).

2. **A passthrough executor** in `apps/worker/src/nodes/triggers/push/passthrough-push.executor.ts` — registered for the same `node.type`. The worker only sees the trigger node during workflow execution; at that point the event payload is already in `input.data`, so the executor just forwards it to the next node.

3. **The shared type registration** in `packages/shared/src/triggers/trigger-types.ts` — add the new `node.type` to `PUSH_TRIGGER_TYPES` and a `provider` slug entry to `TRIGGER_TYPE_TO_PROVIDER`. Both the API ingestion path and the worker NodeRegistry read these constants.

**Skeleton:**

```typescript
// apps/api/src/provider-triggers/triggers/stripe-event-received.trigger.ts
@Injectable()
export class StripeEventReceivedTrigger extends BasePushTrigger {
  readonly type = 'stripe-event-received';
  readonly name = 'Stripe: Event Received';
  readonly description = '...';

  verifySignature(input: SignatureInput): boolean {
    // 1. Extract provider's signature header (case-insensitive)
    // 2. Parse it (Stripe: 't=...,v1=...'; GitHub: 'sha256=...'; Slack: 'v0=...')
    // 3. Enforce timestamp replay window (5 minutes typical)
    // 4. Recompute HMAC over `${ts}.${rawBody}` with input.signingSecret
    // 5. crypto.timingSafeEqual against provided bytes — MUST be constant-time
    // 6. Return false on any failure path
  }

  async onActivate(ctx: ActivationContext): Promise<ActivationResult> {
    // 1. Pull credentials from ctx.connection.config (already decrypted)
    // 2. Call the provider's "create webhook" API with ctx.callbackUrl
    //    (callbackUrl already has /v1/provider-webhooks/<provider>/<subId> baked in)
    // 3. Return { providerSubId, signingSecret, expiresAt? }
    //    — providerSubId is whatever the provider needs to delete the subscription later
    //    — signingSecret is what verifySignature will receive
    //    — expiresAt is optional; renewer wakes for rows < now+24h
  }

  async onDeactivate(ctx: DeactivationContext): Promise<void> {
    // Call the provider's "delete webhook" API with ctx.providerSubId.
    // MUST be idempotent — handle the "already deleted" case gracefully
    // (Stripe surfaces this as { code: 'resource_missing' }).
  }
}
```

**Security non-negotiables:**

- `verifySignature` MUST use `crypto.timingSafeEqual` and reject early on length mismatch only — no early branching on byte content. See `webhooks/signature-helpers.ts` for the reference pattern.
- The signing secret is encrypted at rest in `ProviderSubscription.secretEnc` via `CryptoService`. Never log it.
- The provider API key (Stripe `sk_live_...`) lives in `Connection.configEncrypted`. Errors from provider SDK calls can include the URL with the bearer token — wrap or scrub before logging.
- Activation runs inside `WorkflowsService.update`'s `$transaction`. If `onActivate` throws, the row is rolled back AND `isActive` stays false — the user sees the activation as failed.

---

## 9. Building a `BasePollTrigger` (we ask the provider periodically)

Poll triggers run on a BullMQ repeatable in the worker. Examples: Google Sheets row added, Notion page updated, Trello card moved (any provider that doesn't push events).

**Structure (2 pieces):**

1. **The trigger class** in `apps/worker/src/nodes/triggers/poll/<thing>-<event>.ts` — extends `BasePollTrigger`. Implements `poll(ctx) → { items, newCursor }`. Lives in the worker because that's where the BullMQ tick fires. Reuses the same connection-decryption pipeline as `BaseConnectorAction`s.

2. **The shared type registration** in `packages/shared/src/triggers/trigger-types.ts` — add the new `node.type` to `POLL_TRIGGER_TYPES`. Both the worker's `PollSchedulerService` (registers BullMQ repeatables) and the worker's `NodeRegistry` (resolves the executor) read this list.

**Skeleton:**

```typescript
// apps/worker/src/nodes/triggers/poll/sheets-row-added.ts
@Injectable()
export class SheetsRowAddedTrigger extends BasePollTrigger {
  readonly type = 'sheets-row-added';
  readonly name = 'Sheets: Row Added';
  readonly description = '...';
  readonly defaultIntervalSeconds = 300; // user-overrideable via config.intervalSeconds

  constructor(
    private readonly authService: GoogleAuthService,
    @Inject(GOOGLE_CLIENTS) private readonly clients: GoogleClientFactories,
  ) {
    super();
  }

  async poll(ctx: PollContext): Promise<PollResult> {
    // 1. Cast ctx.config to your typed config interface; validate required fields.
    // 2. Cast ctx.connection.config to the provider's typed config (zod-validated upstream).
    // 3. Build the provider client (reuse existing GoogleAuthService / MicrosoftAuthService).
    // 4. Call the provider's API with ctx.cursor as the "since" boundary.
    // 5. Compute new items + new cursor. CRITICAL: never emit the same item twice.
    //    - First tick (ctx.cursor === null): seed the cursor and emit nothing.
    //      Otherwise activating a workflow on a 100-row sheet fires 100 executions instantly.
    //    - Subsequent ticks: emit only items strictly past the cursor.
    // 6. Return { items, newCursor }. The processor persists the cursor and creates one
    //    WorkflowExecution per item, with idempotency keyed on hash(workflowId, nodeId, item).
  }
}
```

**Cursor strategies that work:**

- **Last-seen ID** (when the provider exposes monotonically increasing IDs): cursor is the highest seen ID; query `?since=<cursor>`.
- **Last-modified timestamp** (when the provider supports `?modifiedAfter=`): cursor is an ISO string; advance to the latest item's modified time.
- **Last-seen row count** (Sheets, no row IDs available): cursor is the row count as a base-10 string; emit rows past `previousCount`. Holds steady on shrinkage.

**The processor handles persistence and dedup** — your `poll()` is a pure-ish function over `(connection, config, cursor)` returning items + new cursor. The processor:

- Reads the cursor from `TriggerCursor` before calling you.
- Writes the new cursor on success.
- Creates one `WorkflowExecution` per item with `idempotencyKey = poll:{workflowId}:{nodeId}:{sha256(item).slice(0,16)}`. If the key collides (worker crashed mid-batch and re-runs), the duplicate is skipped silently.

---

## 10. Wiring the trigger into the running system

Both push and poll triggers need three small bits of wiring after the class exists:

| Step                | Push trigger                                                                   | Poll trigger                                                        |
| ------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| Add to shared types | `PUSH_TRIGGER_TYPES` + `TRIGGER_TYPE_TO_PROVIDER`                              | `POLL_TRIGGER_TYPES`                                                |
| Register in API     | `ProviderTriggerModule.onModuleInit` calls `registry.register(type, instance)` | n/a (no API-side registry)                                          |
| Register in worker  | `EngineModule` adds a `Passthrough` executor for the `node.type`               | `PollModule.onModuleInit` calls `registry.register(type, instance)` |
| Library palette     | Add to `apps/spa/src/lib/node-catalog.ts` (under "Triggers / Provider")        | Same                                                                |

**Test what the framework expects you to test:**

- Push: a happy-path `verifySignature`, a tampered-body rejection, a timestamp-replay rejection, an `onActivate` that asserts the provider SDK was called with the right callback URL, an `onDeactivate` that's idempotent under "already deleted".
- Poll: `defaultIntervalSeconds` on the class, `poll()` reuse of the existing auth service, the empty/first-tick cursor seed behavior, growth-emits-per-item, no-growth-holds-cursor, and the shrink case.
