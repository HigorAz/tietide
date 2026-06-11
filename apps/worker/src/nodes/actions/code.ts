import { Injectable } from '@nestjs/common';
import { Worker } from 'node:worker_threads';
import type { ExecutionContext, INodeExecutor, NodeInput, NodeOutput } from '@tietide/sdk';
import { codeConfigSchema, isValidCodeInputName } from '@tietide/shared';

// Sandboxed JavaScript execution.
//
// Why worker_threads + node:vm (instead of vm2/isolated-vm):
// - Both are Node.js built-ins — zero install, cross-platform (vital on Windows).
// - vm2 is unmaintained and has known sandbox escapes (CVE-2023-37466).
// - isolated-vm needs native compilation that frequently breaks on Windows
//   and inflates Docker images. Worker threads give us a fresh process-like
//   isolate with a hard `terminate()` lever and per-worker memory caps.
// - The user code runs inside `vm.runInContext` with a frozen context that
//   omits `require`, `process`, `module`, `Buffer`, `globalThis`, etc.
const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_TIMEOUT_MS = 30_000;
const MEMORY_LIMIT_MB = 128;
const TERMINATE_GRACE_MS = 250;

interface ParsedParams {
  code: string;
  timeoutMs: number;
  inputs: Record<string, unknown>;
}

interface SandboxResult {
  ok: boolean;
  result?: unknown;
  error?: string;
}

// The worker entry-point. Runs as a string via `new Worker(source, { eval: true })`.
// Kept self-contained: no closures over outer scope, no TypeScript syntax.
//
// SANDBOX ESCAPE PREVENTION (W5.1):
// A vm context created from `Object.create(null)` already owns a SEPARATE set of
// realm intrinsics (Object, Array, JSON, Math, Function, ...). We must NOT copy
// the HOST realm's intrinsics or host objects into it — doing so leaks the host
// `Function` constructor, reachable via `Object.constructor`, `input.constructor`,
// `setTimeout.constructor`, etc., which `codeGeneration:{strings:false}` does NOT
// block (that flag only governs code-gen by the CONTEXT realm's own functions).
// Through a host Function constructor user code reaches the real `process` →
// ENCRYPTION_MASTER_KEY/JWT_SECRET/DATABASE_URL and child_process (RCE).
//
// So we inject only:
//  - DATA as JSON STRINGS (primitives carry no realm leak), re-parsed INSIDE the
//    context with the context's own JSON so the resulting objects' `.constructor`
//    is the sandboxed Function (blocked by codeGeneration), and
//  - timers as CONTEXT-realm wrapper functions over a host bridge that is deleted
//    before user code runs, so the host timer fns are never reachable as values.
const WORKER_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads');
const vm = require('node:vm');

try {
  // A null-proto sandbox: createContext populates it with the context realm's OWN
  // intrinsics. We deliberately do NOT assign any host intrinsic or host object.
  const sandbox = Object.create(null);

  const context = vm.createContext(sandbox, {
    name: 'tietide-code-sandbox',
    codeGeneration: { strings: false, wasm: false },
  });

  // Inject user DATA as plain JSON strings only (no host object references).
  sandbox.__inputJson = JSON.stringify(workerData.input ?? {});
  sandbox.__scopeJson = JSON.stringify(workerData.scope || {});
  sandbox.__inputsJson = JSON.stringify(workerData.inputs || {});

  // Host timer bridge — passed by VALUE into the bootstrap function, never exposed
  // as a sandbox global. The wrappers we define are CONTEXT-realm functions.
  const __bridge = {
    setTimeout: (cb, ms) => setTimeout(cb, ms),
    clearTimeout: (id) => clearTimeout(id),
    setInterval: (cb, ms) => setInterval(cb, ms),
    clearInterval: (id) => clearInterval(id),
    queueMicrotask: (cb) => queueMicrotask(cb),
  };

  // Bootstrap runs INSIDE the context (compiled against it, so it is NOT subject to
  // the runtime codeGeneration.strings restriction). It re-parses the injected JSON
  // with the context's OWN JSON (so the objects are context-realm — their
  // \`.constructor\` is the sandboxed Function, blocked by codeGeneration), binds
  // globals, wires timer wrappers over the host bridge, then deletes every
  // bootstrap-only handle so user code can reach neither the host bridge nor the
  // raw JSON strings as globals.
  const bootstrap = vm.compileFunction(
    \`
      "use strict";
      globalThis.input = JSON.parse(__inputJson);
      globalThis.$nodes = JSON.parse(__scopeJson);
      const __userInputs = JSON.parse(__inputsJson);
      for (const __k of Object.keys(__userInputs)) {
        globalThis[__k] = __userInputs[__k];
      }
      globalThis.setTimeout = (cb, ms) => __b.setTimeout(cb, ms);
      globalThis.clearTimeout = (id) => __b.clearTimeout(id);
      globalThis.setInterval = (cb, ms) => __b.setInterval(cb, ms);
      globalThis.clearInterval = (id) => __b.clearInterval(id);
      globalThis.queueMicrotask = (cb) => __b.queueMicrotask(cb);
      delete globalThis.__inputJson;
      delete globalThis.__scopeJson;
      delete globalThis.__inputsJson;
    \`,
    ['__b'],
    { parsingContext: context },
  );
  bootstrap(__bridge);

  // The user thunk is compiled against the context too, so its \`this\`/closure realm
  // is the sandbox. Wrapping in an async IIFE preserves the existing top-level
  // \`return\`/\`await\` ergonomics. Because it is compiled (not eval'd at runtime),
  // codeGeneration.strings does not block it — but anything the user code itself
  // tries to code-gen at runtime (eval/new Function) is still blocked.
  const userFn = vm.compileFunction(
    '"use strict";\\nreturn (async () => {\\n' + String(workerData.code) + '\\n})();',
    [],
    { parsingContext: context },
  );

  Promise.resolve(userFn())
    .then((result) => {
      // Strip non-JSON values so postMessage doesn't choke on functions/symbols/undefined.
      const safe = JSON.parse(JSON.stringify(result ?? null));
      parentPort.postMessage({ ok: true, result: safe });
    })
    .catch((err) => {
      const msg = err && err.message ? String(err.message) : String(err);
      parentPort.postMessage({ ok: false, error: msg });
    });
} catch (err) {
  const msg = err && err.message ? String(err.message) : String(err);
  parentPort.postMessage({ ok: false, error: msg });
}
`;

@Injectable()
export class CodeAction implements INodeExecutor {
  readonly type = 'code';
  readonly name = 'Code';
  readonly description =
    'Runs JavaScript in a sandboxed worker thread (5s timeout, 128MB memory cap, no require/process/network)';
  readonly category = 'action' as const;

  async execute(input: NodeInput, context: ExecutionContext): Promise<NodeOutput> {
    const params = this.parseParams(input.params);

    if (context.isDryRun) {
      return {
        data: {
          mocked: true,
          mode: 'dry-run',
          codePreview: params.code.slice(0, 200),
        },
        metadata: { mocked: true },
      };
    }

    const started = Date.now();
    const result = await this.runInSandbox(
      params.code,
      input.data,
      input.scope,
      params.inputs,
      params.timeoutMs,
    );
    const duration = Date.now() - started;

    return {
      data: { result, duration },
      metadata: { duration },
    };
  }

  private parseParams(raw: Record<string, unknown>): ParsedParams {
    const parsed = codeConfigSchema.safeParse({
      code: raw.code,
      language: raw.language ?? 'javascript',
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new Error(`Code node config invalid: ${issue.message}`);
    }
    let timeoutMs = DEFAULT_TIMEOUT_MS;
    if (typeof raw.timeout === 'number' && Number.isFinite(raw.timeout) && raw.timeout > 0) {
      timeoutMs = Math.min(raw.timeout, MAX_TIMEOUT_MS);
    }
    return { code: parsed.data.code, timeoutMs, inputs: this.parseInputs(raw.inputs) };
  }

  // Resolved INPUT variables (the engine already template-resolved the values).
  // Keep only safe identifier keys (defense-in-depth; the SPA/schema reject the
  // rest at save time) so a bad key can never define an unusable sandbox global.
  private parseInputs(raw: unknown): Record<string, unknown> {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (isValidCodeInputName(key)) out[key] = value;
    }
    return out;
  }

  private runInSandbox(
    userCode: string,
    input: Record<string, unknown>,
    scope: Record<string, unknown> | undefined,
    inputs: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      // workerData must be structured-cloneable. Both `input` and `scope` are
      // JSON round-tripped at the engine boundary, so values here are already safe.
      // `scope` can be large (it holds every upstream node's output) — the 128MB
      // per-worker heap cap (MEMORY_LIMIT_MB) bounds it: an oversized scope simply
      // OOMs the worker, which fails the node cleanly via the exit handler below.
      const worker = new Worker(WORKER_SOURCE, {
        eval: true,
        workerData: { code: userCode, input, scope: scope ?? {}, inputs, timeoutMs },
        // Defense-in-depth: hand the worker an EMPTY environment so that even a
        // partial sandbox escape inside the worker cannot read ENCRYPTION_MASTER_KEY,
        // JWT_SECRET, DATABASE_URL, etc. from process.env.
        env: {},
        resourceLimits: {
          maxOldGenerationSizeMb: MEMORY_LIMIT_MB,
          maxYoungGenerationSizeMb: 16,
          codeRangeSizeMb: 16,
        },
      });

      let settled = false;
      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        fn();
      };

      const killTimer = setTimeout(() => {
        settle(() => {
          worker.terminate().catch(() => undefined);
          reject(new Error(`Code execution timed out after ${timeoutMs}ms`));
        });
      }, timeoutMs + TERMINATE_GRACE_MS);

      worker.on('message', (msg: SandboxResult) => {
        clearTimeout(killTimer);
        settle(() => {
          worker.terminate().catch(() => undefined);
          if (msg.ok) {
            resolve(msg.result ?? null);
          } else {
            reject(new Error(`Code execution failed: ${msg.error ?? 'unknown error'}`));
          }
        });
      });

      worker.on('error', (err) => {
        clearTimeout(killTimer);
        settle(() => {
          reject(new Error(`Code execution worker error: ${err.message}`));
        });
      });

      worker.on('exit', (exitCode) => {
        clearTimeout(killTimer);
        if (exitCode !== 0) {
          settle(() => {
            reject(new Error(`Code execution worker exited with code ${exitCode}`));
          });
        }
      });
    });
  }
}
