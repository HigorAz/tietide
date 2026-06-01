import { Injectable } from '@nestjs/common';
import { Worker } from 'node:worker_threads';
import type { ExecutionContext, INodeExecutor, NodeInput, NodeOutput } from '@tietide/sdk';
import { codeConfigSchema } from '@tietide/shared';

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
}

interface SandboxResult {
  ok: boolean;
  result?: unknown;
  error?: string;
}

// The worker entry-point. Runs as a string via `new Worker(source, { eval: true })`.
// Kept self-contained: no closures over outer scope, no TypeScript syntax.
const WORKER_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads');
const vm = require('node:vm');

try {
  const sandbox = Object.create(null);
  sandbox.input = workerData.input;
  // \`$nodes\` is the full upstream output scope keyed by node id, so user code can
  // read sibling/ancestor outputs directly (vs \`input\`, the flattened last
  // predecessor). Defaults to {} when there is no upstream.
  sandbox.$nodes = workerData.scope || {};
  sandbox.JSON = JSON;
  sandbox.Math = Math;
  sandbox.Date = Date;
  sandbox.Array = Array;
  sandbox.Object = Object;
  sandbox.String = String;
  sandbox.Number = Number;
  sandbox.Boolean = Boolean;
  sandbox.RegExp = RegExp;
  sandbox.Error = Error;
  sandbox.Promise = Promise;
  sandbox.Symbol = Symbol;
  sandbox.Map = Map;
  sandbox.Set = Set;
  // Timers — required for async user code. Wall-clock timeout still caps execution.
  sandbox.setTimeout = setTimeout;
  sandbox.clearTimeout = clearTimeout;
  sandbox.setInterval = setInterval;
  sandbox.clearInterval = clearInterval;
  sandbox.queueMicrotask = queueMicrotask;

  const context = vm.createContext(sandbox, {
    name: 'tietide-code-sandbox',
    codeGeneration: { strings: false, wasm: false },
  });

  const wrapped = '(async () => {\\n' + workerData.code + '\\n})()';
  Promise.resolve(
    vm.runInContext(wrapped, context, { timeout: workerData.timeoutMs, breakOnSigint: true }),
  )
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
    const result = await this.runInSandbox(params.code, input.data, input.scope, params.timeoutMs);
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
    return { code: parsed.data.code, timeoutMs };
  }

  private runInSandbox(
    userCode: string,
    input: Record<string, unknown>,
    scope: Record<string, unknown> | undefined,
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
        workerData: { code: userCode, input, scope: scope ?? {}, timeoutMs },
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
