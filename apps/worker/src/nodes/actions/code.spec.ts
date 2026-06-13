import type { ExecutionContext, NodeInput } from '@tietide/sdk';
import { CodeAction } from './code';

const makeContext = (overrides: Partial<ExecutionContext> = {}): ExecutionContext =>
  ({
    executionId: 'exec-1',
    workflowId: 'wf-1',
    nodeId: 'node-1',
    isDryRun: false,
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    },
    getSecret: jest.fn(async () => 'secret-value'),
    getConnection: jest.fn(async () => ({
      id: 'conn-stub',
      type: 'OAUTH2',
      provider: 'stub',
      config: {},
    })),
    markConnectionForRefresh: jest.fn(async () => undefined),
    ...overrides,
  }) as unknown as ExecutionContext;

const makeInput = (
  params: Record<string, unknown>,
  data: Record<string, unknown> = {},
  scope?: Record<string, unknown>,
): NodeInput => ({
  data,
  params,
  ...(scope ? { scope } : {}),
});

// Worker thread spin-up is the dominant cost on this suite. Give jest enough
// headroom on slower Windows CI runners.
jest.setTimeout(20_000);

describe('CodeAction', () => {
  describe('interface metadata', () => {
    it('should expose the code type', () => {
      const action = new CodeAction();
      expect(action.type).toBe('code');
    });

    it('should be categorized as an action', () => {
      const action = new CodeAction();
      expect(action.category).toBe('action');
    });

    it('should expose a human-readable name and description', () => {
      const action = new CodeAction();
      expect(action.name).toBe('Code');
      expect(typeof action.description).toBe('string');
      expect(action.description.length).toBeGreaterThan(0);
    });
  });

  describe('execute — happy path', () => {
    it('should run user code with access to input and return the result', async () => {
      const action = new CodeAction();

      const result = await action.execute(
        makeInput({ code: 'return { doubled: input.value * 2 };' }, { value: 5 }),
        makeContext(),
      );

      // The returned object IS the node output — fields are at the top level so
      // downstream nodes reference them as {{steps.code.doubled}} (not .result.doubled).
      expect(result.data).toEqual({ doubled: 10 });
      // Wall-clock duration is metadata, not a data field (kept out of the user's
      // field namespace; the runner also persists it as the step's durationMs).
      expect(typeof result.metadata?.duration).toBe('number');
      expect(result.metadata?.duration).toBeGreaterThanOrEqual(0);
    });

    it('should expose a returned object’s fields directly on data', async () => {
      const action = new CodeAction();

      const result = await action.execute(
        makeInput({ code: 'return { name: "x", total: 5 };' }),
        makeContext(),
      );

      expect(result.data).toEqual({ name: 'x', total: 5 });
      expect(result.data.result).toBeUndefined();
    });

    it('should wrap a primitive return value under `result`', async () => {
      const action = new CodeAction();

      const result = await action.execute(makeInput({ code: 'return 42;' }), makeContext());

      // NodeOutput.data must be an object, so non-object returns nest under `result`.
      expect(result.data).toEqual({ result: 42 });
    });

    it('should wrap an array return value under `result`', async () => {
      const action = new CodeAction();

      const result = await action.execute(makeInput({ code: 'return [1, 2, 3];' }), makeContext());

      expect(result.data).toEqual({ result: [1, 2, 3] });
    });

    it('should wrap a null/empty return under `result`', async () => {
      const action = new CodeAction();

      const result = await action.execute(makeInput({ code: 'return null;' }), makeContext());

      expect(result.data).toEqual({ result: null });
    });

    it('should support async code (await + Promise)', async () => {
      const action = new CodeAction();

      const result = await action.execute(
        makeInput(
          {
            code: 'await new Promise((r) => setTimeout(r, 10)); return { ok: true, n: input.n + 1 };',
          },
          { n: 41 },
        ),
        makeContext(),
      );

      expect(result.data).toEqual({ ok: true, n: 42 });
    });

    it('should serialize functions away (JSON-only output)', async () => {
      const action = new CodeAction();

      const result = await action.execute(
        makeInput({ code: 'return { name: "x", fn: () => 1 };' }),
        makeContext(),
      );

      // JSON.stringify drops function-valued properties.
      expect(result.data).toEqual({ name: 'x' });
    });
  });

  describe('execute — $nodes upstream scope (Issue #260)', () => {
    it('should expose the upstream scope as the $nodes sandbox global', async () => {
      const action = new CodeAction();

      const result = await action.execute(
        makeInput(
          { code: 'return { n: $nodes["http-1"].body.id, who: $nodes.trigger.user };' },
          { body: { id: 99 } },
          { trigger: { user: 'alice' }, 'http-1': { body: { id: 99 } } },
        ),
        makeContext(),
      );

      expect(result.data).toEqual({ n: 99, who: 'alice' });
    });

    it('should default $nodes to an empty object when no scope is provided', async () => {
      const action = new CodeAction();

      const result = await action.execute(
        makeInput({ code: 'return { type: typeof $nodes, keys: Object.keys($nodes).length };' }),
        makeContext(),
      );

      expect(result.data).toEqual({ type: 'object', keys: 0 });
    });

    it('should carry the scope intact across the worker_thread boundary (nested objects + arrays)', async () => {
      const action = new CodeAction();
      const scope = {
        a: { nested: { deep: [1, 2, 3] }, label: 'x' },
        b: { items: [{ id: 1 }, { id: 2 }], flag: true },
      };

      const result = await action.execute(
        makeInput({ code: 'return $nodes;' }, {}, scope),
        makeContext(),
      );

      expect(result.data).toEqual(scope);
    });

    it('should keep $nodes (full upstream map) distinct from input (flattened last predecessor)', async () => {
      const action = new CodeAction();

      const result = await action.execute(
        makeInput(
          { code: 'return { fromInput: input.src, branches: Object.keys($nodes).sort() };' },
          { src: 'right' },
          { left: { src: 'left' }, right: { src: 'right' } },
        ),
        makeContext(),
      );

      expect(result.data).toEqual({ fromInput: 'right', branches: ['left', 'right'] });
    });
  });

  describe('execute — INPUT variables', () => {
    it('should expose declared inputs as bare sandbox variables', async () => {
      const action = new CodeAction();

      const result = await action.execute(
        makeInput({
          code: 'return { greeting: `Hi ${name}`, doubled: count * 2 };',
          // Values arrive already template-resolved (any JSON type).
          inputs: { name: 'bob', count: 21 },
        }),
        makeContext(),
      );

      expect(result.data).toEqual({ greeting: 'Hi bob', doubled: 42 });
    });

    it('should ignore inputs with invalid or reserved keys (defensive)', async () => {
      const action = new CodeAction();

      const result = await action.execute(
        makeInput({
          code: 'return { ok, inputType: typeof input };',
          inputs: { ok: 1, 'bad key': 2, input: 9 },
        }),
        makeContext(),
      );

      // 'ok' is bound; 'bad key' (space) and 'input' (reserved) are dropped, so the
      // built-in `input` (the predecessor data, here {}) is not overridden by 9.
      expect(result.data).toEqual({ ok: 1, inputType: 'object' });
    });
  });

  describe('execute — error path', () => {
    it('should reject when user code throws', async () => {
      const action = new CodeAction();

      await expect(
        action.execute(
          makeInput({ code: 'throw new Error("boom from user code");' }),
          makeContext(),
        ),
      ).rejects.toThrow(/boom from user code/);
    });

    it('should reject when user code has a syntax error', async () => {
      const action = new CodeAction();

      await expect(
        action.execute(makeInput({ code: 'return ;;; this is not valid;;;' }), makeContext()),
      ).rejects.toThrow(/Code execution failed/);
    });

    it('should reject empty code at validation time without spawning a worker', async () => {
      const action = new CodeAction();

      await expect(action.execute(makeInput({ code: '' }), makeContext())).rejects.toThrow(
        /Code node config invalid/,
      );
    });

    it('should reject when code exceeds the 10,000-character limit', async () => {
      const action = new CodeAction();
      const huge = 'a'.repeat(10_001);

      await expect(action.execute(makeInput({ code: huge }), makeContext())).rejects.toThrow(
        /Code node config invalid/,
      );
    });
  });

  describe('execute — timeout & sandbox', () => {
    it('should terminate the worker when user code runs past the configured timeout', async () => {
      const action = new CodeAction();

      await expect(
        action.execute(makeInput({ code: 'while (true) {}', timeout: 250 }), makeContext()),
      ).rejects.toThrow(/timed out|terminated|exited/i);
    });

    it('should block access to require/process/fs (no Node host APIs leak in)', async () => {
      const action = new CodeAction();

      const result = await action.execute(
        makeInput({
          code: 'return { require: typeof require, process: typeof process, global: typeof global };',
        }),
        makeContext(),
      );

      expect(result.data).toEqual({
        require: 'undefined',
        process: 'undefined',
        global: 'undefined',
      });
    });

    it('should disable dynamic code generation (no eval / new Function)', async () => {
      const action = new CodeAction();

      await expect(
        action.execute(makeInput({ code: 'return eval("1 + 1");' }), makeContext()),
      ).rejects.toThrow(/Code execution failed/);
    });
  });

  describe('execute — host realm escape (W5.1)', () => {
    // Each of these escapes reaches the host `process` via a host-realm Function
    // constructor leaked through an injected intrinsic, injected DATA, a timer, or
    // an async function. A correct sandbox must give user code NO path to the host
    // realm: either the node fails, or `process` is genuinely unreachable.
    const expectNoHostProcess = async (code: string): Promise<void> => {
      const action = new CodeAction();
      let escaped = false;
      try {
        const result = await action.execute(makeInput({ code }), makeContext());
        // If it resolved, the only acceptable outcome is that no host process /
        // its secrets leaked through. An object return is unwrapped onto `data`;
        // a non-object (e.g. stringified process) nests under `data.result`.
        const markers = ['env', 'pid', 'platform', 'version'];
        const hasMarkers = (o: unknown): boolean =>
          !!o && typeof o === 'object' && markers.some((k) => k in (o as Record<string, unknown>));
        // A leaked host `process` would carry env / pid / platform at the top level.
        if (hasMarkers(result.data)) escaped = true;
        const inner = (result.data as Record<string, unknown>).result;
        if (hasMarkers(inner)) escaped = true;
        // A stringified host process also counts as a leak.
        if (typeof inner === 'string' && /process|nodejs|platform|pid/i.test(inner)) {
          escaped = true;
        }
      } catch {
        // Throwing is an acceptable, secure outcome.
        escaped = false;
      }
      expect(escaped).toBe(false);
    };

    it('blocks Object.constructor escape to host process', async () => {
      await expectNoHostProcess(`return Object.constructor('return process')();`);
    });

    it('blocks input.constructor.constructor escape to host process', async () => {
      await expectNoHostProcess(`return input.constructor.constructor('return process')();`);
    });

    it('blocks setTimeout.constructor escape to host process', async () => {
      await expectNoHostProcess(`return setTimeout.constructor('return process')();`);
    });

    it('blocks async-function constructor escape to host process', async () => {
      await expectNoHostProcess(`return (async()=>{}).constructor('return process')();`);
    });

    it('blocks this.constructor.constructor escape to host process', async () => {
      await expectNoHostProcess(`return this.constructor.constructor('return process')();`);
    });
  });

  describe('execute — dry-run', () => {
    it('should not run user code on dry-run; returns a mock preview', async () => {
      const action = new CodeAction();

      const result = await action.execute(
        makeInput({ code: 'throw new Error("never run");' }),
        makeContext({ isDryRun: true }),
      );

      expect(result.data).toEqual(expect.objectContaining({ mocked: true, mode: 'dry-run' }));
      expect(result.metadata).toEqual(expect.objectContaining({ mocked: true }));
    });
  });
});
